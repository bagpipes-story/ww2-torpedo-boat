// 大発の隊（docs/02 §6.4、v0.4.2）: 岸沿いを低速で進み、艇に気づくと反応の遅れの後に岸へ逃げる（上陸＝逃げ切り）。気づいている間は 13mm で撃ち返す。
// 夜明け（v0.6.2。FlotillaCheck.dawn）: 岸沿いを進む大発すべてが、反応の遅れなしにすぐ岸へ逃げて隠れる（実機 1 回目「逃げたように見えない」で遅れを外した。気づいてはいないので撃たない＝乱数を引かない）。
// Phaser 非依存・毎ステップ確保しない。操舵は ship-ai の steerShip、弾は shells.ts（駆逐艦の砲と同じ見越し＋一様円盤）。
// 時計（反応の遅れ・警戒・機銃の間隔）は体感の実秒 feelDt、運動と弾の飛行は game 秒 dt。数値と検査は barge-data.ts。乱数は seed+6 の系列だけ（2 回/発）。
import type { BoatState } from './boat-motion';
import type { BargeParams } from './barge-data';
import type { SeededRng } from './rng';
import { advanceShell, createShells, findFreeShell, launchShell, pointNearBoat, type ShellState } from './shells';
import { steerShip } from './ship-ai';
import { losBlocked, type SmokeParams, type SmokeState } from './smoke';
import { degToRad, wrapDeg360 } from './units';

export type { BargeParams } from './barge-data';

/** 段階: 岸沿いを進む → 気づいた（反応の遅れ。進路のまま撃ち返す）→ 岸へ逃げる → 上陸（逃げ切り）／撃破 */
export const BARGE_CRUISE = 0;
export const BARGE_ALERT = 1;
export const BARGE_RUN = 2;
export const BARGE_BEACHED = 3;
export const BARGE_SUNK = 4;

export interface BargeState extends BoatState {
  phase: number;
  hp: number;
  /** 艇に気づいている（見失って detect_hold_s 経つまで） */
  detected: boolean;
  holdLeftS: number;
  alertS: number;
  /** 艇との線が煙幕に遮られている（見えない・撃てない・艇の砲も狙わない） */
  blocked: boolean;
  gunCooldownS: number;
  /** 逃げる進路（180° を中心に隊の中の順で扇に開く） */
  runHeadingDeg: number;
}

export interface FlotillaState {
  barges: BargeState[];
  shells: ShellState[];
  sunk: number;
  beached: number;
  /** 浮いている大発のどれかが気づいている（HUD の「発見された！」） */
  anyDetected: boolean;
  /** 浮いている大発すべてから煙幕で隠れている（1 隻以上いるとき） */
  allBlocked: boolean;
  /** 逃げている大発が岸に着くまでの最短の体感秒（逃げていなければ NaN） */
  escapeLeftS: number;
  /** 岸へ逃げている（RUN の）浮いている大発の隻数（v0.6.2 実機 1 回目。夜明けの空襲の行の「大発 岸へ（N 隻）」） */
  running: number;
  /** KPI: 機銃の発射・艇への命中、最初に（目で）気づかれたときの距離 m（NaN なら目では気づかれていない）、最初の気づきが艇の射撃の閃光だった */
  shotsFired: number;
  hitsOnBoat: number;
  firstDetectM: number;
  flashFirst: boolean;
}

/** 世界が固定ステップごとに中身だけ書き換える材料 */
export interface FlotillaCheck {
  boat: BoatState;
  boatHalfLengthM: number;
  boatHalfBeamM: number;
  /** 煙幕に遮られていないときの発見距離（月明・速力帯込み）。遮られている大発は × smokeFactor */
  detectOpenM: number;
  smokeFactor: number;
  smoke: SmokeState | null;
  smokeParams: SmokeParams | null;
  /** このステップに艇が撃ったら閃光の届く距離、撃っていなければ 0 */
  flashM: number;
  /** 艇が浮いている（気づく・撃つ相手がいる） */
  boatAfloat: boolean;
  /** 夜明け後（v0.6.2。enemy_ships_at_dawn が hide の任務で、夜明けのラッチから true）。岸沿いを進む大発はすぐ（反応の遅れなしに）岸へ逃げる。省略は夜明け前 */
  dawn?: boolean;
}

export interface FlotillaEvents {
  onFire(i: number, x: number, y: number): void;
  onImpact(x: number, y: number, hit: boolean): void;
  onBeached(i: number): void;
}

/** 撃てる・撃たれる・数える大発（上陸と撃破は除く） */
export function bargeAfloat(b: BargeState): boolean {
  return b.phase <= BARGE_RUN;
}

export function createFlotilla(p: BargeParams, shellPoolSize: number): FlotillaState {
  const barges: BargeState[] = [];
  const h = degToRad(p.headingDeg);
  for (let i = 0; i < p.count; i++) {
    barges.push({
      x: p.leadX - Math.sin(h) * p.offsetsM[i]!,
      y: p.leadY + Math.cos(h) * p.offsetsM[i]!,
      headingDeg: p.headingDeg,
      speedMps: p.cruiseSpeedMps,
      phase: BARGE_CRUISE,
      hp: p.hp,
      detected: false,
      holdLeftS: 0,
      alertS: 0,
      blocked: false,
      gunCooldownS: 0,
      runHeadingDeg: wrapDeg360(180 + (i - (p.count - 1) / 2) * p.fanDeg),
    });
  }
  return { barges, shells: createShells(shellPoolSize), sunk: 0, beached: 0, anyDetected: false, allBlocked: false, escapeLeftS: NaN, running: 0, shotsFired: 0, hitsOnBoat: 0, firstDetectM: NaN, flashFirst: false };
}

/** 艇の砲が当たった: HP を減らして気づかせる。沈んだら true（撃破の演出と KPI は呼ぶ側） */
export function hitBarge(f: FlotillaState, p: BargeParams, i: number, damage: number): boolean {
  const b = f.barges[i]!;
  if (!bargeAfloat(b)) return false;
  b.hp -= damage;
  b.detected = true;
  b.holdLeftS = p.detectHoldS;
  if (b.hp > 0) return false;
  b.hp = 0;
  b.phase = BARGE_SUNK;
  b.speedMps = 0;
  f.sunk++;
  return true;
}

/**
 * 固定ステップ: 気づく（目か閃光）→ 段階 → 操舵 → 上陸 → 機銃 → 弾の飛行と着弾。
 * 気づいた大発は reaction_delay_s の間は進路のまま（撃ち返しは気づいた瞬間から）、その後は岸へ逃げる（気づきが解けても戻らない）。
 * 夜明けの後（c.dawn）は岸沿いを進む大発がそのステップで岸へ逃げる（警戒と反応の遅れを飛ばす。すでに気づいた・逃げている大発はそのまま）
 */
export function stepFlotilla(f: FlotillaState, p: BargeParams, c: FlotillaCheck, rng: SeededRng, feelDt: number, dt: number, ev: FlotillaEvents): void {
  const boat = c.boat;
  const flash2 = c.flashM * c.flashM;
  let anyDetected = false;
  let live = 0;
  let hidden = 0;
  let escapeM = Infinity;
  let running = 0;
  for (let i = 0; i < f.barges.length; i++) {
    const b = f.barges[i]!;
    if (!bargeAfloat(b)) continue;
    const dx = boat.x - b.x;
    const dy = boat.y - b.y;
    const d2 = dx * dx + dy * dy;
    b.blocked = c.smoke !== null && c.smokeParams !== null && losBlocked(c.smoke, c.smokeParams, b.x, b.y, boat.x, boat.y);
    const r = b.blocked ? c.detectOpenM * c.smokeFactor : c.detectOpenM;
    const seen = c.boatAfloat && d2 <= r * r;
    if (seen || (c.boatAfloat && d2 <= flash2)) {
      if (Number.isNaN(f.firstDetectM) && !f.flashFirst) {
        if (seen) f.firstDetectM = Math.sqrt(d2);
        else f.flashFirst = true;
      }
      b.detected = true;
      b.holdLeftS = p.detectHoldS;
    } else if (b.detected) {
      b.holdLeftS -= feelDt;
      if (b.holdLeftS <= 0) b.detected = false;
    }
    if (b.phase === BARGE_CRUISE && c.dawn === true) b.phase = BARGE_RUN;
    else if (b.phase === BARGE_CRUISE && b.detected) {
      b.phase = BARGE_ALERT;
      b.alertS = 0;
    }
    if (b.phase === BARGE_ALERT) {
      b.alertS += feelDt;
      if (b.alertS >= p.reactionDelayS) b.phase = BARGE_RUN;
    }
    if (b.phase === BARGE_RUN) steerShip(b, b.runHeadingDeg, p.runSpeedMps, p.turnRateDegS, p.accelMps2, dt);
    else steerShip(b, p.headingDeg, p.cruiseSpeedMps, p.turnRateDegS, p.accelMps2, dt);
    if (b.x < p.boundsMarginM) b.x = p.boundsMarginM; // 西の端（v0.4.2 の 200 秒では届かない）
    if (b.phase === BARGE_RUN && b.y >= p.beachY) {
      b.phase = BARGE_BEACHED;
      b.speedMps = 0;
      b.detected = false;
      f.beached++;
      ev.onBeached(i);
      continue;
    }
    live++;
    if (b.blocked) hidden++;
    if (b.detected) anyDetected = true;
    if (b.phase === BARGE_RUN) {
      running++;
      if (p.beachY - b.y < escapeM) escapeM = p.beachY - b.y;
    }
    // 13mm: 気づいていて、煙幕に遮られず、有効射程内なら撃つ（間隔は駆逐艦の砲と同じく負の残りを繰り越す）
    const g = p.gun;
    const cd = Math.max(b.gunCooldownS - feelDt, -feelDt);
    b.gunCooldownS = cd;
    if (!b.detected || b.blocked || !c.boatAfloat || cd > 0 || d2 > g.effectiveM * g.effectiveM) {
      if (cd < 0) b.gunCooldownS = 0;
      continue;
    }
    const s = findFreeShell(f.shells);
    if (!s) continue;
    b.gunCooldownS = cd + 60 / (g.roundsPerMinPerGun * g.count);
    const ph = degToRad(boat.headingDeg);
    launchShell(s, b.x, b.y, boat.x, boat.y, Math.sin(ph) * boat.speedMps, -Math.cos(ph) * boat.speedMps, g.shellSpeedMps, (g.dispersionM * Math.sqrt(d2)) / g.effectiveM, i, rng);
    f.shotsFired++;
    ev.onFire(i, b.x, b.y);
  }
  f.anyDetected = anyDetected;
  f.allBlocked = live > 0 && hidden === live;
  f.running = running;
  // 岸まで（逃げる速さで。転舵の分は見ない）を体感秒に（game m/秒 × time_scale）
  f.escapeLeftS = escapeM === Infinity ? NaN : escapeM / (p.runSpeedMps * p.timeScale);
  // 着弾（onImpact の命中で艇が沈み始めたら、呼ぶ側が c.boatAfloat を false にする＝同じステップの残りの弾は外れ）
  for (let i = 0; i < f.shells.length; i++) {
    const s = f.shells[i]!;
    if (!s.active || !advanceShell(s, dt)) continue;
    const hit = c.boatAfloat && pointNearBoat(s.impactX, s.impactY, boat, c.boatHalfLengthM, c.boatHalfBeamM + p.gun.splashRadiusM);
    if (hit) f.hitsOnBoat++;
    ev.onImpact(s.impactX, s.impactY, hit);
  }
}

/** 浮いている大発のうち (x, y) に最も近いもの（無ければ -1）。距離二乗で比較 */
export function nearestAfloat(f: FlotillaState, x: number, y: number): number {
  let best = -1;
  let bestD2 = Infinity;
  for (let i = 0; i < f.barges.length; i++) {
    const b = f.barges[i]!;
    if (!bargeAfloat(b)) continue;
    const d2 = (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y);
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}
