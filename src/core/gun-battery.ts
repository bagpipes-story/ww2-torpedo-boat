// 艇の砲（docs/02 §5・§6.4、v0.4.2）: 射撃ボタンを押している間、見えていて射程内・射界内（艇首・艇尾の ±dead_cone_deg は撃たない）・煙幕に遮られていない最寄りの大発へ撃つ。
// 狙いは見越し点、散布は駆逐艦の砲と同じ一様円盤（shells.ts）× 艇の速力帯の倍率。着弾点にいる大発に当たる（狙った 1 隻に限らない）。
// Phaser 非依存・毎ステップ確保しない。乱数は seed+7 の系列だけ（2 回/発）。時計（発射間隔）は体感の実秒、弾の飛行は game 秒。
import type { BoatState, SpeedStep } from './boat-motion';
import { bargeAfloat, type BargeState } from './barges';
import type { SeededRng } from './rng';
import { advanceShell, createShells, findFreeShell, launchShell, pointNearBoat, type ShellState } from './shells';
import { degToRad } from './units';
import type { SpeedFactorTable } from './visibility';

/** 状態: 押していない / 撃っている / 見える大発がいない / 艇首・艇尾の死角 / 射程外 / 煙幕で見えない */
export const GUN_SAFE = 0;
export const GUN_FIRING = 1;
export const GUN_NO_TARGET = 2;
export const GUN_OUT_OF_ARC = 3;
export const GUN_OUT_OF_RANGE = 4;
export const GUN_BLOCKED = 5;

export interface GunGroupParams {
  id: string;
  /** 組の合計の発射速度（体感の発/分） */
  roundsPerMin: number;
  damage: number;
  /** 弾の速さ（game m/秒）、射程 rangeM での散布の半径 m（距離に比例）、着弾点からこの半径に大発の船体があれば命中 */
  shellSpeedMps: number;
  dispersionM: number;
  splashRadiusM: number;
}

export interface GunBatteryParams {
  label: string;
  groups: GunGroupParams[];
  rangeM: number;
  /** これより遠い標的は HUD に「遠い」 */
  effectiveM: number;
  deadConeDeg: number;
  /** cos²(dead_cone_deg)。標的への単位ベクトルと艇首の内積の二乗がこれより大きければ死角（平方根なし） */
  deadConeCos2: number;
  flashRevealM: number;
  /** 艇の速力帯ごとの散布の倍率 */
  spreadFactor: SpeedFactorTable;
}

export interface GunBatteryState {
  cooldownS: number[];
  shells: ShellState[];
  status: number;
  /** 撃っている大発の index と距離 m（撃っていなければ -1 / 0） */
  target: number;
  targetM: number;
  /** このステップに撃った（閃光で大発が気づく） */
  fired: boolean;
  /** 速力帯で散布が広がっている（倍率 > 1） */
  fast: boolean;
  /** KPI: 発射・命中、最初に撃ったときの標的までの距離 m と速力帯（撃っていなければ NaN / ''） */
  shots: number;
  hits: number;
  firstShotM: number;
  firstShotBand: SpeedStep | '';
}

export interface GunEvents {
  onFire(x: number, y: number): void;
  /** 大発 i に当たった（被害は呼ぶ側が hitBarge で適用） */
  onHit(i: number, group: number, x: number, y: number): void;
  onMiss(x: number, y: number): void;
}

export function createGunBattery(p: GunBatteryParams, shellPoolSize: number): GunBatteryState {
  return { cooldownS: p.groups.map(() => 0), shells: createShells(shellPoolSize), status: GUN_SAFE, target: -1, targetM: 0, fired: false, fast: false, shots: 0, hits: 0, firstShotM: NaN, firstShotBand: '' };
}

/**
 * 標的選び（押しているときだけ呼ぶ）: 見えている（visRange2 以内）・射程内・射界内・煙幕に遮られていない大発の最寄り。
 * 状態（理由の優先: 煙幕 > 死角 > 射程外 > いない）を g.status に書き、index を返す（無ければ -1）。g.targetM は撃つときに埋める
 */
export function selectTarget(g: GunBatteryState, p: GunBatteryParams, boat: BoatState, barges: readonly BargeState[], visRange2: number): number {
  const h = degToRad(boat.headingDeg);
  const hx = Math.sin(h);
  const hy = -Math.cos(h);
  const range2 = p.rangeM * p.rangeM;
  let best = -1;
  let bestD2 = Infinity;
  let sighted = false;
  let inRange = false;
  let blocked = false;
  for (let i = 0; i < barges.length; i++) {
    const b = barges[i]!;
    if (!bargeAfloat(b)) continue;
    const dx = b.x - boat.x;
    const dy = b.y - boat.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > visRange2) continue;
    sighted = true;
    if (d2 > range2) continue;
    inRange = true;
    const dot = dx * hx + dy * hy;
    if (dot * dot > p.deadConeCos2 * d2) continue;
    if (b.blocked) {
      blocked = true;
      continue;
    }
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  g.status = best >= 0 ? GUN_FIRING : blocked ? GUN_BLOCKED : inRange ? GUN_OUT_OF_ARC : sighted ? GUN_OUT_OF_RANGE : GUN_NO_TARGET;
  return best;
}

/** 固定ステップ: 標的選び → 組ごとの発射（押していて撃てるとき）→ 弾の飛行と着弾（着いた点にいる最初の浮いている大発に当たる） */
export function stepGunBattery(
  g: GunBatteryState,
  p: GunBatteryParams,
  boat: BoatState,
  band: SpeedStep,
  held: boolean,
  canFire: boolean,
  barges: readonly BargeState[],
  bargeHalfLengthM: number,
  bargeHalfBeamM: number,
  visRange2: number,
  rng: SeededRng,
  feelDt: number,
  dt: number,
  ev: GunEvents,
): void {
  g.fired = false;
  const k = p.spreadFactor[band];
  g.fast = k > 1;
  const target = held && canFire ? selectTarget(g, p, boat, barges, visRange2) : -1;
  if (!held || !canFire) g.status = GUN_SAFE;
  g.target = target;
  g.targetM = 0;
  if (target >= 0) {
    const b = barges[target]!;
    g.targetM = Math.sqrt((b.x - boat.x) * (b.x - boat.x) + (b.y - boat.y) * (b.y - boat.y));
  }
  for (let i = 0; i < p.groups.length; i++) {
    const gr = p.groups[i]!;
    const cd = Math.max(g.cooldownS[i]! - feelDt, -feelDt);
    g.cooldownS[i] = cd;
    if (target < 0 || cd > 0) {
      if (cd < 0) g.cooldownS[i] = 0; // 撃てない間は負の残りを溜めない（押した瞬間の一斉発射を防ぐ）
      continue;
    }
    const s = findFreeShell(g.shells);
    if (!s) continue;
    g.cooldownS[i] = cd + 60 / gr.roundsPerMin;
    const b = barges[target]!;
    const bh = degToRad(b.headingDeg);
    launchShell(s, boat.x, boat.y, b.x, b.y, Math.sin(bh) * b.speedMps, -Math.cos(bh) * b.speedMps, gr.shellSpeedMps, ((gr.dispersionM * g.targetM) / p.rangeM) * k, i, rng);
    g.shots++;
    if (!g.fired) ev.onFire(boat.x, boat.y);
    g.fired = true;
    if (Number.isNaN(g.firstShotM)) {
      g.firstShotM = g.targetM;
      g.firstShotBand = band;
    }
  }
  for (let i = 0; i < g.shells.length; i++) {
    const s = g.shells[i]!;
    if (!s.active || !advanceShell(s, dt)) continue;
    const gr = p.groups[s.gunIndex]!;
    let hit = -1;
    for (let j = 0; j < barges.length && hit < 0; j++) {
      const b = barges[j]!;
      if (bargeAfloat(b) && pointNearBoat(s.impactX, s.impactY, b, bargeHalfLengthM, bargeHalfBeamM + gr.splashRadiusM)) hit = j;
    }
    if (hit >= 0) {
      g.hits++;
      ev.onHit(hit, s.gunIndex, s.impactX, s.impactY);
    } else {
      ev.onMiss(s.impactX, s.impactY);
    }
  }
}

// ---------- data の読み出し（boats.json の gun_battery） ----------

export interface GunBatteryDataRecord {
  label_ja: string;
  range_m: number;
  effective_m: number;
  dead_cone_deg: number;
  muzzle_flash_reveal_m: number;
  spread_factor: SpeedFactorTable;
  groups: Array<{ id: string; rounds_per_min: number; damage: number; shell_speed_mps: number; dispersion_m: number; splash_radius_m: number }>;
}

function nums(v: unknown, keys: readonly string[]): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return keys.every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number));
}

export function isGunBatteryDataRecord(v: unknown): v is GunBatteryDataRecord {
  if (!nums(v, ['range_m', 'effective_m', 'dead_cone_deg', 'muzzle_flash_reveal_m'])) return false;
  const r = v as Record<string, unknown>;
  const groups = r['groups'];
  return typeof r['label_ja'] === 'string' && nums(r['spread_factor'], ['stop', 'silent', 'cruise', 'full']) && Array.isArray(groups) && groups.length > 0 && groups.every((g) => typeof (g as Record<string, unknown>)?.['id'] === 'string' && nums(g, ['rounds_per_min', 'damage', 'shell_speed_mps', 'dispersion_m', 'splash_radius_m']));
}

/** 検査込み: 射程 > 0、0 < effective ≤ range、死角 0〜90°、閃光 ≥ 0、倍率 ≥ 1、組の値は正（splash は 0 以上） */
export function gunBatteryParamsFromData(r: GunBatteryDataRecord): GunBatteryParams {
  const bad = (msg: string): never => {
    throw new Error(`boats.json の gun_battery: ${msg}（docs/02 §6.4）`);
  };
  if (!(r.range_m > 0) || !(r.effective_m > 0 && r.effective_m <= r.range_m)) bad('range_m は正、effective_m は 0〜range_m');
  if (!(r.dead_cone_deg >= 0 && r.dead_cone_deg < 90) || !(r.muzzle_flash_reveal_m >= 0)) bad('dead_cone_deg は 0〜90 未満、muzzle_flash_reveal_m は 0 以上');
  const f = r.spread_factor;
  if (![f.stop, f.silent, f.cruise, f.full].every((x) => x >= 1)) bad('spread_factor は 1 以上（速いほど散る）');
  for (const g of r.groups) if (!(g.rounds_per_min > 0 && g.damage > 0 && g.shell_speed_mps > 0 && g.dispersion_m >= 0 && g.splash_radius_m >= 0)) bad(`${g.id}: rounds_per_min / damage / shell_speed_mps は正、dispersion_m / splash_radius_m は 0 以上`);
  const c = Math.cos((r.dead_cone_deg * Math.PI) / 180);
  return {
    label: r.label_ja,
    groups: r.groups.map((g) => ({ id: g.id, roundsPerMin: g.rounds_per_min, damage: g.damage, shellSpeedMps: g.shell_speed_mps, dispersionM: g.dispersion_m, splashRadiusM: g.splash_radius_m })),
    rangeM: r.range_m,
    effectiveM: r.effective_m,
    deadConeDeg: r.dead_cone_deg,
    deadConeCos2: c * c,
    flashRevealM: r.muzzle_flash_reveal_m,
    spreadFactor: { stop: f.stop, silent: f.silent, cruise: f.cruise, full: f.full },
  };
}
