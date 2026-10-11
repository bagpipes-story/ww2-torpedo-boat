// 暴風の帯（docs/02 §6.8、v0.3.4）: 海域の幅いっぱいの帯が北から南へ一定の速さで進む。中では旋回率が下がり、艦と艇を結ぶ線が帯にかかる間は雨で発見距離と視程が下がる。
// 任務の海況が艇の限界を超えていると、帯の中で安全速力を超えている間、波に叩きつけられて HP が減る（頻度は速力に比例、回数は溜めから切り出す）。
// Phaser 非依存・毎ステップ確保しない（shallows.ts / friendly.ts と同じ作法）。y は南が正。時計は体感の実秒（feelDt）。
import { clamp, degToRad, ktToMps, mpsToKt } from './units';

export const STORM_NONE = 0;
export const STORM_AHEAD = 1;
export const STORM_NEAR = 2;
export const STORM_INSIDE = 3;

export interface StormParams {
  safeSpeedKt: number;
  safeSpeedMps: number;
  turnRateFactor: number;
  visFactor: number;
  detectFactor: number;
  /** 全速での叩きつけの頻度（回/体感秒）と 1 回の被害 */
  slamRateFullHz: number;
  slamDamage: number;
  warnLookaheadS: number;
  /** 任務の海況と艇の限界（海況が限界を超えていれば叩きつけが有効） */
  seaState: number;
  seaStateLimit: number;
  slamEnabled: boolean;
  /** 無傷の全速 m/s（頻度の基準。機関損傷で最大速力が落ちても変えない） */
  speedFullMps: number;
  depthM: number;
  /** 帯の進む速さ m/体感秒（画面上 = ktToMps(drift_kt) × time_scale） */
  driftMps: number;
  startSouthMinY: number;
  startSouthMaxY: number;
  timeScale: number;
  boundsWidth: number;
  boundsHeight: number;
}

export interface StormState {
  /** 帯の南の縁 y。北の縁は southY − depthM */
  southY: number;
  inside: boolean;
  /** 艦と艇を結ぶ線が帯にかかっている（雨） */
  los: boolean;
  /** 中で安全速力を超えている */
  over: boolean;
  slamAcc: number;
  slams: number;
  slamDamage: number;
  /** KPI: 中にいた秒、中で安全速力を超えていた秒、中の速さの積分（平均速力用） */
  insideS: number;
  overS: number;
  insideSpeedSum: number;
}

export interface StormStatus {
  state: number;
  /** 帯の縁までの距離 m（AHEAD / NEAR のとき。それ以外は 0） */
  gapM: number;
  /** 帯が艇の北にある */
  north: boolean;
  /** 安全速力を超えている */
  fast: boolean;
}

export function createStormState(p: StormParams, u01: number): StormState {
  return {
    southY: p.startSouthMinY + (p.startSouthMaxY - p.startSouthMinY) * u01,
    inside: false,
    los: false,
    over: false,
    slamAcc: 0,
    slams: 0,
    slamDamage: 0,
    insideS: 0,
    overS: 0,
    insideSpeedSum: 0,
  };
}

/** 帯の中か（両端を含む） */
export function bandContainsY(s: StormState, p: StormParams, y: number): boolean {
  return y >= s.southY - p.depthM && y <= s.southY;
}

/** 2 点を結ぶ線が帯にかかるか（どちらかが中、または帯をはさむ）。平方根は使わない */
export function losCrossesBand(s: StormState, p: StormParams, ay: number, by: number): boolean {
  const n = s.southY - p.depthM;
  return Math.max(ay, by) >= n && Math.min(ay, by) <= s.southY;
}

export function stormTurnRate(p: StormParams, baseDegS: number, inside: boolean): number {
  return inside ? baseDegS * p.turnRateFactor : baseDegS;
}

/** 安全速力の判定は HUD の表示と同じ丸めた kt（表示が 18 なら決して叩かれない） */
export function overSafeSpeed(p: StormParams, speedMps: number): boolean {
  return Math.round(mpsToKt(speedMps)) > p.safeSpeedKt;
}

/** 叩きつけの頻度（回/体感秒）: 安全速力で 0、無傷の全速で slam_rate_full_hz、間は線形、それ以上は頭打ち */
export function slamRateHz(p: StormParams, speedMps: number): number {
  if (!p.slamEnabled || !overSafeSpeed(p, speedMps)) return 0;
  return p.slamRateFullHz * clamp((speedMps - p.safeSpeedMps) / (p.speedFullMps - p.safeSpeedMps), 0, 1);
}

/**
 * 固定ステップ（feelDt は体感の実秒）: 帯を進め、中なら KPI と叩きつけの溜めを進める。戻り値はこのステップの叩きつけの回数。
 * active=false（沈没中）でも帯は進むが、中の判定・KPI・叩きつけは無い。外に出ると溜めは 0（入り直した直後には叩かれない）
 */
export function stepStorm(s: StormState, p: StormParams, boatY: number, speedMps: number, shipY: number, shipAlive: boolean, feelDt: number, active: boolean): number {
  s.southY += p.driftMps * feelDt;
  s.inside = active && bandContainsY(s, p, boatY);
  s.los = shipAlive && losCrossesBand(s, p, boatY, shipY);
  s.over = s.inside && overSafeSpeed(p, speedMps);
  if (!s.inside) {
    s.slamAcc = 0;
    return 0;
  }
  s.insideS += feelDt;
  s.insideSpeedSum += speedMps * feelDt;
  if (s.over) s.overS += feelDt;
  s.slamAcc += slamRateHz(p, speedMps) * feelDt;
  const n = Math.floor(s.slamAcc);
  if (n > 0) {
    s.slamAcc -= n;
    s.slams += n;
    s.slamDamage += n * p.slamDamage;
  }
  return n;
}

/**
 * HUD の状態（毎フレーム、確保なし）: 中 / 現在の速さで warn_lookahead_s 以内に縁に届く（NEAR） / 近づいている（AHEAD） / 遠ざかるか帯が海域を抜けた（NONE）。
 * fast は「叩きつけが有効で安全速力を超えている」（海況が限界以下の任務では警告を出さない）。
 * NEAR は近づいている限り保つ（減速すると接近速度が落ちて閾値が縮むが、警告に従った瞬間に文が消えないように）
 */
export function updateStormStatus(out: StormStatus, s: StormState, p: StormParams, boatY: number, headingDeg: number, speedMps: number): void {
  const n = s.southY - p.depthM;
  out.fast = p.slamEnabled && overSafeSpeed(p, speedMps);
  if (n > p.boundsHeight) {
    out.state = STORM_NONE;
    out.gapM = 0;
    return;
  }
  if (boatY >= n && boatY <= s.southY) {
    out.state = STORM_INSIDE;
    out.gapM = 0;
    return;
  }
  const north = boatY > s.southY;
  out.north = north;
  const gap = north ? boatY - s.southY : n - boatY;
  // 北向きの画面上の速さ（帯は南へ driftMps で進むので、南にいれば足し、北にいれば引く）
  const vNorth = speedMps * p.timeScale * Math.cos(degToRad(headingDeg));
  const closing = north ? p.driftMps + vNorth : -p.driftMps - vNorth;
  if (closing <= 0) {
    out.state = STORM_NONE;
    out.gapM = 0;
    return;
  }
  out.gapM = gap;
  out.state = gap <= closing * p.warnLookaheadS || out.state === STORM_NEAR ? STORM_NEAR : STORM_AHEAD;
}

/** 帯の中の平均速力 kt（Result 用）。中にいなければ NaN */
export function meanInsideKt(s: StormState): number {
  return s.insideS > 0 ? mpsToKt(s.insideSpeedSum / s.insideS) : NaN;
}

// ---------- data の読み出し ----------

export interface StormDataRecord {
  params: { safe_speed_kt: number; turn_rate_factor: number; vis_factor: number; detect_factor: number; slam_rate_full_hz: number; slam_damage: number; warn_lookahead_s: number };
}

export interface StormMissionBlock {
  sea_state: number;
  depth_m: number;
  drift_kt: number;
  start_south_y_min_m: number;
  start_south_y_max_m: number;
}

function hasNums(v: unknown, keys: readonly string[]): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return keys.every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number));
}

export function isStormDataRecord(v: unknown): v is StormDataRecord {
  return typeof v === 'object' && v !== null && hasNums((v as Record<string, unknown>)['params'], ['safe_speed_kt', 'turn_rate_factor', 'vis_factor', 'detect_factor', 'slam_rate_full_hz', 'slam_damage', 'warn_lookahead_s']);
}

export function isStormMissionBlock(v: unknown): v is StormMissionBlock {
  return hasNums(v, ['sea_state', 'depth_m', 'drift_kt', 'start_south_y_min_m', 'start_south_y_max_m']);
}

/** 設計値の検査込みで StormParams を作る。boat は艇の全速 kt と海況の限界、playerStartY は出発点の y */
export function stormParamsFromData(
  r: StormDataRecord,
  b: StormMissionBlock,
  boat: { speedMaxKt: number; seaStateLimit: number },
  timeScale: number,
  bounds: { width: number; height: number },
  playerStartY: number,
): StormParams {
  const q = r.params;
  const badP = (msg: string): never => {
    throw new Error(`risk_events.json の storm.params: ${msg}（docs/02 §6.8）`);
  };
  const badM = (msg: string): never => {
    throw new Error(`missions_seed の storm: ${msg}（docs/02 §6.8）`);
  };
  if (!(q.safe_speed_kt > 0) || !(q.safe_speed_kt < boat.speedMaxKt)) badP('safe_speed_kt は 0 より大きく艇の speed_max_kt より小さい');
  if (!(q.turn_rate_factor > 0 && q.turn_rate_factor <= 1)) badP('turn_rate_factor は 0〜1（0 は除く）');
  if (!(q.vis_factor > 0 && q.vis_factor <= 1) || !(q.detect_factor > 0 && q.detect_factor <= 1)) badP('vis_factor / detect_factor は 0〜1（0 は除く）');
  if (!(q.slam_rate_full_hz >= 0) || !(q.slam_damage >= 0) || !(q.warn_lookahead_s >= 0)) badP('slam_rate_full_hz / slam_damage / warn_lookahead_s は 0 以上');
  if (!Number.isInteger(b.sea_state) || b.sea_state < 0 || b.sea_state > 9) badM('sea_state は 0〜9 の整数');
  if (!Number.isInteger(boat.seaStateLimit) || boat.seaStateLimit < 0 || boat.seaStateLimit > 9) throw new Error('boats.json の sea_state_limit は 0〜9 の整数（docs/02 §6.8）');
  if (!(b.depth_m > 0) || !(b.drift_kt > 0)) badM('depth_m / drift_kt は正');
  if (!(timeScale > 0)) badM('time_scale が不正');
  if (!(b.start_south_y_min_m >= 0) || !(b.start_south_y_min_m <= b.start_south_y_max_m)) badM('0 <= start_south_y_min_m <= start_south_y_max_m');
  if (!(playerStartY - b.start_south_y_max_m >= b.depth_m)) badM('出発点が暴風の帯に近すぎる（start_south_y_max_m は player_start.y_m − depth_m 以下。止まっていても帯の幅ぶんの猶予を残す）');
  return {
    safeSpeedKt: q.safe_speed_kt,
    safeSpeedMps: ktToMps(q.safe_speed_kt),
    turnRateFactor: q.turn_rate_factor,
    visFactor: q.vis_factor,
    detectFactor: q.detect_factor,
    slamRateFullHz: q.slam_rate_full_hz,
    slamDamage: q.slam_damage,
    warnLookaheadS: q.warn_lookahead_s,
    seaState: b.sea_state,
    seaStateLimit: boat.seaStateLimit,
    slamEnabled: b.sea_state > boat.seaStateLimit,
    speedFullMps: ktToMps(boat.speedMaxKt),
    depthM: b.depth_m,
    driftMps: ktToMps(b.drift_kt) * timeScale,
    startSouthMinY: b.start_south_y_min_m,
    startSouthMaxY: b.start_south_y_max_m,
    timeScale,
    boundsWidth: bounds.width,
    boundsHeight: bounds.height,
  };
}
