// 沿岸砲（docs/02 §6.4・§6.8、v0.4.3）: 岸の上の固定砲。艇が射界（有効射程の半円）の中にいて、気づかれている（大発が気づいている／自分の目／射撃の閃光）間だけ撃つ。
// Phaser 非依存・毎ステップ確保しない。弾は shells.ts（駆逐艦の砲と同じ見越し＋一様円盤）。時計は体感の実秒 feelDt、弾の飛行は game 秒 dt。乱数は seed+8 の系列だけ（2 回/発）。
import type { BoatState } from './boat-motion';
import { gunParamsFromData, isGunDataRecord, type GunDataRecord, type GunParams, type HitSpec } from './gunnery';
import type { SeededRng } from './rng';
import { advanceShell, createShells, findFreeShell, launchShell, pointNearBoat, type ShellState } from './shells';
import { losBlocked, type SmokeParams, type SmokeState } from './smoke';

export interface ShoreBatteryParams {
  x: number;
  y: number;
  gun: GunParams;
  hit: HitSpec;
  /** 射界（撃てる距離）の二乗。gun.effectiveM² */
  arc2: number;
  /** 自分の目の発見の基準距離（月明・速力帯は世界が掛ける）、見失ってから気づきが解けるまでの体感秒 */
  baseDetectM: number;
  detectHoldS: number;
}

export interface ShoreBatteryState {
  shells: ShellState[];
  cooldownS: number;
  /** 艇が射界の中（毎ステップ更新） */
  inArc: boolean;
  /** 艇に気づいている（射界の中で見つけた／大発が気づいている／閃光。見失って detectHoldS で解ける） */
  alerted: boolean;
  holdLeftS: number;
  /** KPI: 射界の中にいた体感秒、発射、艇への命中 */
  inArcS: number;
  shots: number;
  hits: number;
}

/** 世界が固定ステップごとに中身だけ書き換える材料 */
export interface ShoreBatteryCheck {
  boat: BoatState;
  boatHalfLengthM: number;
  boatHalfBeamM: number;
  boatAfloat: boolean;
  /** 煙幕に遮られていないときの自分の目の発見距離（月明・速力帯込み）。遮られていれば × smokeFactor */
  detectOpenM: number;
  smokeFactor: number;
  smoke: SmokeState | null;
  smokeParams: SmokeParams | null;
  /** 大発のどれかが艇に気づいている（岸へ合図する） */
  bargesAlerted: boolean;
  /** このステップに艇が撃ったら閃光の届く距離、撃っていなければ 0 */
  flashM: number;
}

export interface ShoreBatteryEvents {
  onFire(x: number, y: number): void;
  onImpact(x: number, y: number, hit: boolean): void;
}

export function createShoreBattery(shellPoolSize: number): ShoreBatteryState {
  return { shells: createShells(shellPoolSize), cooldownS: 0, inArc: false, alerted: false, holdLeftS: 0, inArcS: 0, shots: 0, hits: 0 };
}

/** 固定ステップ: 射界 → 気づく → 発射（気づいていて・射界の中・煙幕に遮られていない）→ 弾の飛行と着弾 */
export function stepShoreBattery(s: ShoreBatteryState, p: ShoreBatteryParams, c: ShoreBatteryCheck, rng: SeededRng, feelDt: number, dt: number, ev: ShoreBatteryEvents): void {
  const boat = c.boat;
  const dx = boat.x - p.x;
  const dy = boat.y - p.y;
  const d2 = dx * dx + dy * dy;
  s.inArc = c.boatAfloat && d2 <= p.arc2;
  if (s.inArc) s.inArcS += feelDt;
  const blocked = c.smoke !== null && c.smokeParams !== null && losBlocked(c.smoke, c.smokeParams, p.x, p.y, boat.x, boat.y);
  const r = blocked ? c.detectOpenM * c.smokeFactor : c.detectOpenM;
  const seen = s.inArc && (c.bargesAlerted || d2 <= r * r || (c.flashM > 0 && d2 <= c.flashM * c.flashM));
  if (seen) {
    s.alerted = true;
    s.holdLeftS = p.detectHoldS;
  } else if (s.alerted) {
    s.holdLeftS -= feelDt;
    if (s.holdLeftS <= 0) s.alerted = false;
  }
  // 発射（間隔は駆逐艦の砲と同じく負の残りを繰り越す。撃てない間は 0 に戻す）
  const g = p.gun;
  const cd = Math.max(s.cooldownS - feelDt, -feelDt);
  s.cooldownS = cd;
  if (!s.alerted || !s.inArc || blocked || cd > 0) {
    if (cd < 0) s.cooldownS = 0;
  } else {
    const sh = findFreeShell(s.shells);
    if (sh) {
      s.cooldownS = cd + 60 / (g.roundsPerMinPerGun * g.count);
      const ph = (boat.headingDeg * Math.PI) / 180;
      launchShell(sh, p.x, p.y, boat.x, boat.y, Math.sin(ph) * boat.speedMps, -Math.cos(ph) * boat.speedMps, g.shellSpeedMps, (g.dispersionM * Math.sqrt(d2)) / g.effectiveM, 0, rng);
      s.shots++;
      ev.onFire(p.x, p.y);
    }
  }
  for (let i = 0; i < s.shells.length; i++) {
    const sh = s.shells[i]!;
    if (!sh.active || !advanceShell(sh, dt)) continue;
    const hit = c.boatAfloat && pointNearBoat(sh.impactX, sh.impactY, boat, c.boatHalfLengthM, c.boatHalfBeamM + g.splashRadiusM);
    if (hit) s.hits++;
    ev.onImpact(sh.impactX, sh.impactY, hit);
  }
}

// ---------- data の読み出し（risk_events.json の shore_battery.params と missions_seed の v0_1_prototype.shore_battery） ----------

export interface ShoreBatteryDataRecord {
  gun: GunDataRecord;
  base_detect_m: number;
  /** 岸の線から陸側へ何 m に据えるか */
  inland_m: number;
}

export function isShoreBatteryDataRecord(v: unknown): v is ShoreBatteryDataRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return isGunDataRecord(r['gun']) && typeof r['base_detect_m'] === 'number' && Number.isFinite(r['base_detect_m']) && typeof r['inland_m'] === 'number' && Number.isFinite(r['inland_m']);
}

/** 検査込み。xM は任務の岸沿いの位置、coastY は岸の線（海域の南の縁）。射界は有効射程の半円で海側だけに掛かる */
export function shoreBatteryParamsFromData(r: ShoreBatteryDataRecord, xM: number, coastY: number, boundsWidth: number, detectHoldS: number): ShoreBatteryParams {
  const bad = (msg: string): never => {
    throw new Error(`risk_events.json の shore_battery.params / missions_seed の shore_battery: ${msg}（docs/02 §6.8）`);
  };
  if (!(r.base_detect_m > 0) || !(r.inland_m >= 0)) bad('base_detect_m は正、inland_m は 0 以上');
  if (!(xM >= 0 && xM <= boundsWidth)) bad('x_m は海域の幅の中');
  const gun = gunParamsFromData(r.gun);
  if (!(gun.effectiveM > 0) || !(gun.roundsPerMinPerGun > 0) || !(gun.count >= 1) || !(gun.damage > 0) || !(gun.shellSpeedMps > 0)) bad('gun の effective_night_m / rof_per_min / count / damage / shell_speed_mps は正');
  return {
    x: xM,
    y: coastY + r.inland_m,
    gun,
    hit: { damage: gun.damage, fireChance: gun.fireChance, engineDamageChance: gun.engineDamageChance },
    arc2: gun.effectiveM * gun.effectiveM,
    baseDetectM: r.base_detect_m,
    detectHoldS,
  };
}
