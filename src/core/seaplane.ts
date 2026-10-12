// 敵の水上機（docs/02 §6.8、v0.4.1）: 海域の外を哨戒している機が、艇の航跡（夜光虫。速力帯が巡航か全速）を見つけて寄ってくる。
// 発見線（base_detect_m）に入る前に航跡が消えれば見失って去り、入ったら真上で照明弾 → 旋回 → 直線の爆撃進路で爆弾を 1 発ずつ落として去る。
// Phaser 非依存・毎ステップ確保しない（friendly.ts と同じ作法）。機の位置は常に自艇からの相対。時計は体感の実秒（feelDt）、爆弾の見越しだけ game 秒。
// 数値と検査は seaplane-data.ts、照明弾と爆弾は seaplane-ordnance.ts。
import type { BoatState } from './boat-motion';
import type { AircraftPose } from './friendly';
import type { SeededRng } from './rng';
import type { SeaplaneParams } from './seaplane-data';
import { aimBomb, createOrdnance, dropFlare, releaseBomb, stepBombs, stepFlare, type Ordnance } from './seaplane-ordnance';
import { degToRad, radToDeg, wrapDeg360 } from './units';

export type { SeaplaneParams } from './seaplane-data';
export { DODGE_TURN_DEG, bombInAir, type BombState, type FlareState } from './seaplane-ordnance';

/** 段階: 哨戒 → 接近（追跡/発見確定） → 照明弾の航過 → 旋回 → 爆撃進路 → 去る → 哨戒に戻る／終了 */
export const SP_IDLE = 0;
export const SP_APPROACH = 1;
export const SP_FLARE_PASS = 2;
export const SP_ORBIT = 3;
export const SP_RUN = 4;
export const SP_LEAVING = 5;
export const SP_PATROL = 6;
export const SP_DONE = 7;
/** 結果: 無し / 見失った / 爆弾を落とし切った / 中断（沈没・輪の中・座礁） */
export const SP_OUT_NONE = 0;
export const SP_OUT_LOST = 1;
export const SP_OUT_BOMBED = 2;
export const SP_OUT_CANCELLED = 3;
/** stepSeaplane の戻りビット */
export const SP_EV_FOUND = 1;
export const SP_EV_LOST = 2;
export const SP_EV_FLARE = 4;
export const SP_EV_RELEASE = 8;
export const SP_EV_IMPACT = 16;

export interface SeaplaneState {
  phase: number;
  outcome: number;
  /** APPROACH / FLARE_PASS / RUN / LEAVING: 段階に入ってからの秒。ORBIT / PATROL: 残り秒 */
  timerS: number;
  /** 開始条件が続いている秒 */
  wakeS: number;
  sorties: number;
  lost: number;
  /** 接近: 飛来の方位（自艇→機）、残りの距離、発見確定（attacked はこの任務で一度でも確定した）、見えていない秒 */
  approachDeg: number;
  approachR: number;
  locked: boolean;
  attacked: boolean;
  unseenS: number;
  passDeg: number;
  orbitStartDeg: number;
  runDeg: number;
  leaveFromDx: number;
  leaveFromDy: number;
  leaveDeg: number;
  /** 照明弾と爆弾（seaplane-ordnance）。段階と独立に進む */
  ordnance: Ordnance;
  /** KPI: 最初の接近の時刻（世界の秒）、接近開始から航跡が消えるまでの秒（発見確定の前だけ。無ければ NaN） */
  triggerAtS: number;
  slowReactS: number;
  clockS: number;
}

/** 開始条件と見え方の材料（世界が固定ステップで中身だけ書き換える） */
export interface SeaplaneCheck {
  boat: BoatState;
  /** 飛来の方角の元（駆逐艦の位置） */
  targetX: number;
  targetY: number;
  /** 航跡が見える（速力帯が巡航か全速） */
  wake: boolean;
  stormInside: boolean;
  friendlyLive: boolean;
  busy: boolean;
  blocked: boolean;
  boatSinking: boolean;
  /** 世界の実秒（patrol_from_s）と駆逐艦の累計発砲数 */
  timeS: number;
  shellsFired: number;
  /** ?debug&plane: 最初の接近を（航跡が見え次第）最初の判定で始める。?debug&plane=attack: 常に見えていて、航跡が無くても始める */
  forceTrigger: boolean;
  forceSeen: boolean;
}

export function createSeaplaneState(p: SeaplaneParams): SeaplaneState {
  return {
    phase: SP_IDLE, outcome: SP_OUT_NONE, timerS: 0, wakeS: 0, sorties: 0, lost: 0,
    approachDeg: 0, approachR: 0, locked: false, attacked: false, unseenS: 0, passDeg: 0, orbitStartDeg: 0, runDeg: 0,
    leaveFromDx: 0, leaveFromDy: 0, leaveDeg: 0, ordnance: createOrdnance(p), triggerAtS: NaN, slowReactS: NaN, clockS: 0,
  };
}

/** 開始条件: 哨戒点に着いている・航跡が見える・帯の中でない・味方機が来ていない・演出中でない・止められていない */
export function seaplaneConditionsMet(c: SeaplaneCheck, p: SeaplaneParams): boolean {
  return c.timeS >= p.patrolFromS && c.wake && !c.stormInside && !c.friendlyLive && !c.busy && !c.blocked;
}

/** 哨戒中（IDLE か冷却の明けた PATROL）でだけ: 条件が wakeTriggerS 続いたら接近を始める（true）。途切れたら数え直す。DONE の後は二度と始まらない */
export function stepSeaplaneTrigger(s: SeaplaneState, c: SeaplaneCheck, p: SeaplaneParams, dt: number): boolean {
  if (!(s.phase === SP_IDLE || (s.phase === SP_PATROL && s.timerS <= 0))) return false;
  // ?debug&plane: 最初の接近だけ哨戒点の秒と航跡の 3 秒を待たない（航跡が見えるか、&plane=attack で常に見える扱いのとき）
  if (c.forceTrigger && s.sorties === 0 && !c.blocked && !c.boatSinking && (c.wake || c.forceSeen)) {
    startApproach(s, p, c);
    return true;
  }
  if (!seaplaneConditionsMet(c, p)) {
    s.wakeS = 0;
    return false;
  }
  s.wakeS += dt;
  if (s.wakeS < p.wakeTriggerS) return false;
  startApproach(s, p, c);
  return true;
}

/** 接近を始める: 敵艦の方角 spawnM 先から直進（atan2 はここの 1 回だけ） */
export function startApproach(s: SeaplaneState, p: SeaplaneParams, c: SeaplaneCheck): void {
  s.approachDeg = wrapDeg360(radToDeg(Math.atan2(c.targetX - c.boat.x, -(c.targetY - c.boat.y))));
  s.approachR = p.spawnM;
  s.locked = false;
  s.unseenS = 0;
  s.wakeS = 0;
  s.phase = SP_APPROACH;
  s.outcome = SP_OUT_NONE;
  s.timerS = 0;
  s.sorties++;
  if (Number.isNaN(s.triggerAtS)) s.triggerAtS = c.timeS;
}

/** 機から艇が見えている: 帯の中は見えない。発見線の内側はいつでも、外側は航跡が見えていて wakeDetectM 以内 */
export function seaplaneSees(s: SeaplaneState, p: SeaplaneParams, c: SeaplaneCheck): boolean {
  if (c.forceSeen) return true;
  if (c.stormInside) return false;
  return s.approachR <= p.baseDetectM || (c.wake && s.approachR <= p.wakeDetectM);
}

const scratchPose: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };

/** 去り始める: 今の相対位置から、艇から離れる向きに直進して薄くなる */
function leave(s: SeaplaneState, p: SeaplaneParams, outcome: number): void {
  seaplanePose(s, p, scratchPose);
  s.leaveFromDx = scratchPose.dx;
  s.leaveFromDy = scratchPose.dy;
  s.leaveDeg = wrapDeg360(radToDeg(Math.atan2(scratchPose.dx, -scratchPose.dy)));
  s.phase = SP_LEAVING;
  s.timerS = 0;
  s.outcome = outcome;
}

/** 中断（沈没・輪の中・座礁）: 接近〜爆撃進路なら去る。落下中の爆弾はそのまま進む */
export function cancelSeaplane(s: SeaplaneState, p: SeaplaneParams): void {
  if (s.phase === SP_APPROACH || s.phase === SP_FLARE_PASS || s.phase === SP_ORBIT || s.phase === SP_RUN) leave(s, p, SP_OUT_CANCELLED);
}

/** 爆弾の投下: 狙点は艇の現在速度の見越し点（落下の game 秒）＋ 一様円盤の散布（seed+5 の系列から 2 回） */
function endPass(s: SeaplaneState, p: SeaplaneParams, fromDeg: number, over: number): void {
  if (s.phase === SP_RUN && s.ordnance.bombsLeft <= 0) {
    leave(s, p, SP_OUT_BOMBED);
    return;
  }
  s.orbitStartDeg = wrapDeg360(fromDeg + 180);
  s.phase = SP_ORBIT;
  s.timerS = p.orbitS - over;
}

/**
 * 固定ステップ（dt は体感の実秒）。段階の変化は 1 回の呼び出しで 1 つまで（余った時間は次の段階に持ち越す）。
 * 戻り値は SP_EV_* のビット。照明弾と落下中の爆弾は段階に関わらず進む（去った後も着弾・照明は続く）
 */

export function stepSeaplane(s: SeaplaneState, p: SeaplaneParams, c: SeaplaneCheck, rng: SeededRng, dt: number): number {
  let ev = 0;
  s.clockS += dt;
  if (s.phase === SP_PATROL) {
    if (s.timerS > 0) s.timerS -= dt;
  } else if (s.phase === SP_APPROACH) {
    s.timerS += dt;
    s.approachR -= p.flightMps * dt;
    if (!s.locked) {
      if (s.approachR <= p.baseDetectM) {
        s.locked = true;
        s.attacked = true;
        s.unseenS = 0;
        ev |= SP_EV_FOUND;
      } else if (seaplaneSees(s, p, c)) {
        s.unseenS = 0;
      } else {
        if (s.unseenS === 0 && Number.isNaN(s.slowReactS) && !c.wake) s.slowReactS = s.timerS; // 減速で航跡が消えた（帯に隠れただけなら数えない）
        s.unseenS += dt;
        if (s.unseenS >= p.loseS) {
          s.lost++;
          leave(s, p, SP_OUT_LOST);
          ev |= SP_EV_LOST;
        }
      }
    }
    if (s.phase === SP_APPROACH && s.approachR <= p.runRadiusM) {
      // 航過の始点に着いた: 直線で真上へ（残りの距離は航過の時間に持ち越す）
      s.passDeg = s.approachDeg;
      s.phase = SP_FLARE_PASS;
      s.timerS = (p.runRadiusM - s.approachR) / p.flightMps;
    }
  } else if (s.phase === SP_FLARE_PASS || s.phase === SP_RUN) {
    const prev = s.timerS;
    s.timerS += dt;
    if (prev < p.overpassS && s.timerS >= p.overpassS) {
      if (s.phase === SP_FLARE_PASS) {
        dropFlare(s.ordnance, p, c.boat);
        ev |= SP_EV_FLARE;
      } else if (s.ordnance.bombsLeft > 0) {
        releaseBomb(s.ordnance, p, c.boat);
        ev |= SP_EV_RELEASE;
      }
    }
    if (s.timerS >= p.passS) endPass(s, p, s.phase === SP_FLARE_PASS ? s.passDeg : s.runDeg, s.timerS - p.passS);
  } else if (s.phase === SP_ORBIT) {
    s.timerS -= dt;
    if (s.timerS <= 0) {
      if (s.ordnance.bombsLeft > 0) {
        // 爆撃進路: 今の旋回の方位の 600 m 先から真上へ。狙いはここで決める（この後に転舵か減速をすれば外れる）
        s.runDeg = wrapDeg360(s.orbitStartDeg + p.orbitDegPerS * p.orbitS);
        s.phase = SP_RUN;
        s.timerS = -s.timerS;
        aimBomb(s.ordnance, p, c.boat, rng);
      } else {
        leave(s, p, SP_OUT_BOMBED);
      }
    }
  } else if (s.phase === SP_LEAVING) {
    s.timerS += dt;
    if (s.timerS >= p.leaveS) {
      if (s.outcome === SP_OUT_BOMBED || s.attacked) {
        // 弾切れ、または発見確定の後の中断（沈没・輪の中・座礁）: 1 任務に照明弾 1 発なので二度と来ない
        s.phase = SP_DONE;
      } else {
        s.phase = SP_PATROL;
        s.timerS = p.patrolCooldownS;
      }
    }
  }
  stepFlare(s.ordnance, p, c.boat, c.shellsFired, dt);
  if (stepBombs(s.ordnance, p, c.boat, c.boatSinking, dt)) ev |= SP_EV_IMPACT;
  return ev;
}

export function seaplanePose(s: SeaplaneState, p: SeaplaneParams, out: AircraftPose): AircraftPose {
  const R = p.runRadiusM;
  if (s.phase === SP_APPROACH) {
    const b = degToRad(s.approachDeg);
    out.dx = s.approachR * Math.sin(b);
    out.dy = -s.approachR * Math.cos(b);
    out.headingDeg = wrapDeg360(s.approachDeg + 180);
    out.alpha = 1;
    return out;
  }
  if (s.phase === SP_FLARE_PASS || s.phase === SP_RUN) {
    const deg = s.phase === SP_FLARE_PASS ? s.passDeg : s.runDeg;
    const k = 1 - (2 * s.timerS) / p.passS;
    const b = degToRad(deg);
    out.dx = R * Math.sin(b) * k;
    out.dy = -R * Math.cos(b) * k;
    out.headingDeg = wrapDeg360(deg + 180);
    out.alpha = 1;
    return out;
  }
  if (s.phase === SP_ORBIT) {
    const bearing = s.orbitStartDeg + p.orbitDegPerS * (p.orbitS - s.timerS);
    const b = degToRad(bearing);
    out.dx = R * Math.sin(b);
    out.dy = -R * Math.cos(b);
    out.headingDeg = wrapDeg360(bearing + 90);
    out.alpha = 1;
    return out;
  }
  if (s.phase === SP_LEAVING) {
    const b = degToRad(s.leaveDeg);
    const d = p.flightMps * s.timerS;
    out.dx = s.leaveFromDx + d * Math.sin(b);
    out.dy = s.leaveFromDy - d * Math.cos(b);
    out.headingDeg = s.leaveDeg;
    out.alpha = Math.max(0, 1 - s.timerS / p.leaveS);
    return out;
  }
  out.dx = 0;
  out.dy = 0;
  out.headingDeg = 0;
  out.alpha = 0;
  return out;
}

/** 接近〜去る途中（味方機を同時に来させない判定） */
export function seaplaneActive(s: SeaplaneState): boolean {
  return s.phase >= SP_APPROACH && s.phase <= SP_LEAVING;
}
