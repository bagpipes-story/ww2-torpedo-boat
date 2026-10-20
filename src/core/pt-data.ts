// 敵の米PT の数値（v0.6.3。docs/02 §6.4）: enemies.json の us_pt_enemy・boats.json の艇（boat_ref）・missions_seed の v0_1_prototype.pt_boats から PtParams を組む。検査はここ。
// 段階と運動は pt-boats.ts。他の記録が要る検査（振り切れない・1 回の航過で沈まない・見えない PT から撃たない・出発で見つからない・夜明けに去る）は config/pt-mission-data。
// 単位: *_kt は ktToMps で game m/s、*_s は体感秒、距離の比較は二乗で持つ。確保は出撃の組み立てのときだけ。
import type { BoatDataRecord } from './boat-motion';
import { gunParamsFromData, isGunDataRecord, type GunDataRecord, type GunParams, type HitSpec } from './gunnery';
import { ptParamsAtNight } from './pt-night';
import { degToRad, ktToMps } from './units';

/** 今夜の揺らぎ（pt-night.ts。使う側はここから import する） */
export { ptParamsAtNight, ptStartAt } from './pt-night';

/** attack の鍵（ちょうどこの 22 個。打ち間違いを止める） */
export const PT_ATTACK_KEYS = [
  'run_in_speed_kt', 'pass_speed_kt', 'overtake_kt', 'commit_max_m', 'commit_tcpa_s', 'commit_heading_tol_deg',
  'pass_offset_m', 'open_fire_s', 'pass_max_s', 'rounds_per_pass', 'dead_cone_deg',
  'min_range_m', 'spread_min_m', 'break_off_m', 'break_max_s', 'run_in_max_s',
  'pass_gap_s', 'wingman_delay_s', 'hold_off_m', 'max_passes', 'edge_margin_m', 'leave_speed_kt',
] as const;
export type PtAttackKey = (typeof PT_ATTACK_KEYS)[number];

/** 予告（赤い線）から撃つまでの下限 秒（公平さの床。data の open_fire_s はこれ以上） */
export const PT_OPEN_FIRE_MIN_S = 2.0;
/** 1 つの隊の PT の数の上限（HUD の鍵の桁がこれで足りる） */
export const PT_MAX_COUNT = 4;

export interface PtDataRecord {
  id: string;
  boat_ref: string;
  torpedo_immune: boolean;
  detection: { base_detect_m: number; reaction_delay_s: number; detect_from_s: number };
  patrol: { speed_kt: number; arrive_m: number };
  attack: Record<PtAttackKey, number>;
  guns: GunDataRecord[];
}

/** missions_seed の v0_1_prototype.pt_boats: PT ごとの往復する線 [x0, y0, x1, y1]、線の始点からの出発位置 m、去る方位 */
export interface PtMissionBlock {
  legs_m: number[][];
  start_along_m: number;
  leave_heading_deg: number;
  source: string;
}

/** 動きの元の艇（boats.json の boat_ref）。最大速力・旋回・加速・寸法 */
export type PtBoatRef = Pick<BoatDataRecord, 'speed_max_kt' | 'turn_rate_deg_s' | 'accel_mps2' | 'length_m' | 'beam_m'>;

export interface PtDataContext {
  missionId: string;
  /** 任務の enemies の数（PT の隻数） */
  count: number;
  bounds: { width: number; height: number };
  timeScale: number;
  /** 見失ってから警戒を解くまでの体感秒（hit_rate_model の visibility.detect_hold_s） */
  detectHoldS: number;
  spriteScale: number;
}

export interface PtParams {
  count: number;
  /** 発見: 基準距離 m（月明・速力帯は世界が掛ける）、発見から突撃までの秒、出撃からこの秒は見つけない、見失ってから警戒を解く秒（体感） */
  baseDetectM: number; reactionDelayS: number; detectFromS: number; detectHoldS: number;
  /** 速さ m/s: 哨戒・突撃・航過の下限・自艇に足す追い越し・最大（boat_ref。航過の上限）・去る。哨戒の点に着いた距離の二乗 */
  patrolMps: number; runInMps: number; passMinMps: number; overtakeMps: number; dashMps: number; leaveMps: number; arrive2: number;
  /** 航過: 進路を固める距離の二乗と最接近までの秒（航過の速さで）、固める針路と今の針路の差の上限 deg、横にずらす m、予告から撃つまでの秒、航過の最大秒、1 回の弾数 */
  commitMax2: number; commitTcpaS: number; commitHeadingTolDeg: number; offsetM: number; openFireS: number; passMaxS: number; roundsPerPass: number;
  /** 撃たない: 艇首尾の円錐の cos²、近すぎる距離の二乗。散布の下限 m */
  cosDead2: number; minRange2: number; spreadMinM: number;
  /** 離脱の距離の二乗と最大秒、突撃の最大秒、次の航過までの秒、2 隻目の遅れ秒、1 隻の航過の回数 */
  breakOff2: number; breakMaxS: number; runInMaxS: number; passGapS: number; wingmanDelayS: number; maxPasses: number;
  /** 航過を待つ PT: これより内へ寄らない距離の二乗（hold_off_m）と、曲がり始める距離の二乗（hold_off_m + (hold_off_m − 有効射程)。真横に回るのはその中ほど） */
  holdOff2: number; holdOuter2: number;
  /** 海域の縁の余白 m、去る方位、旋回 deg/秒・加速（boat_ref）、縁の外へ出たとみなす余白（絵の半長）と絵の大きさ */
  edgeMarginM: number; leaveHeadingDeg: number; turnRateDegS: number; accelMps2: number; boundsMarginM: number; spriteLengthUnits: number; spriteBeamUnits: number;
  gun: GunParams;
  hit: HitSpec;
  /** PT ごとの線 [x0, y0, x1, y1]（4 × count）と出発点・針路（今夜の揺らぎ込み）。startAlongM は data の出発位置（線の始点から m） */
  legs: Float64Array; startX: Float64Array; startY: Float64Array; startHeadingDeg: Float64Array; startAlongM: number;
  bounds: { width: number; height: number };
  timeScale: number;
}

function nums(v: unknown, keys: readonly string[]): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return keys.every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number));
}

export function isPtDataRecord(v: unknown): v is PtDataRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  if (typeof r['id'] !== 'string' || typeof r['boat_ref'] !== 'string' || typeof r['torpedo_immune'] !== 'boolean') return false;
  const a = r['attack'];
  if (!nums(a, PT_ATTACK_KEYS) || Object.keys(a as object).length !== PT_ATTACK_KEYS.length) return false;
  const g = r['guns'];
  return nums(r['detection'], ['base_detect_m', 'reaction_delay_s', 'detect_from_s']) && nums(r['patrol'], ['speed_kt', 'arrive_m']) && Array.isArray(g) && g.length === 1 && isGunDataRecord(g[0]);
}

export function isPtMissionBlock(v: unknown): v is PtMissionBlock {
  if (!nums(v, ['start_along_m', 'leave_heading_deg'])) return false;
  const r = v as Record<string, unknown>;
  const legs = r['legs_m'];
  return typeof r['source'] === 'string' && Array.isArray(legs) && legs.every((l) => Array.isArray(l) && l.length === 4 && nums(l, ['0', '1', '2', '3']));
}

/** 設計値の検査込み（spec §C.3 の 1〜5）。他の記録が要る検査は config/pt-mission-data */
export function ptParamsFromData(r: PtDataRecord, boat: PtBoatRef, b: PtMissionBlock, ctx: PtDataContext): PtParams {
  const bad = (msg: string): never => {
    throw new Error(`${ctx.missionId}: 米PT（enemies.json の ${r.id}・v0_1_prototype.pt_boats）: ${msg}（docs/02 §6.4）`);
  };
  const a = r.attack;
  const g = r.guns[0]!;
  const eff = g.effective_night_m;
  if (!(r.patrol.speed_kt > 0 && r.patrol.speed_kt < a.pass_speed_kt && a.pass_speed_kt <= a.run_in_speed_kt && a.run_in_speed_kt <= boat.speed_max_kt)) bad('0 < patrol.speed_kt < pass_speed_kt ≤ run_in_speed_kt ≤ 艇の最大速力');
  if (!(a.leave_speed_kt > 0 && a.leave_speed_kt <= boat.speed_max_kt) || !(a.overtake_kt >= 0)) bad('0 < leave_speed_kt ≤ 艇の最大速力、overtake_kt は 0 以上');
  if (!(a.min_range_m > 0 && a.min_range_m < a.pass_offset_m && a.pass_offset_m < eff && eff < a.break_off_m)) bad('0 < min_range_m < pass_offset_m < effective_night_m < break_off_m');
  // effective_night_m < commit_max_m（spec §C.3-2）はこの 2 つから出る（v0.6.3 レビュー: 前の行に重ねて書いていたので、どちらの句が止めたか検査で分からなかった）
  if (!(eff < a.hold_off_m && a.hold_off_m < a.commit_max_m)) bad('effective_night_m < hold_off_m < commit_max_m（航過を待つ PT は有効射程の外・航過を固める距離の内で待つ）');
  if (!(a.commit_heading_tol_deg > 0 && a.commit_heading_tol_deg < 90)) bad('0 < commit_heading_tol_deg < 90（向かってくるときだけ航過を固める）');
  if (!(a.open_fire_s >= PT_OPEN_FIRE_MIN_S && a.open_fire_s < a.pass_max_s && a.open_fire_s < a.commit_tcpa_s)) bad(`予告から撃つまで ${PT_OPEN_FIRE_MIN_S} 秒以上（open_fire_s）、open_fire_s < pass_max_s・commit_tcpa_s`);
  if (!(a.dead_cone_deg > 0 && a.dead_cone_deg < 90) || !(a.spread_min_m > 0)) bad('0 < dead_cone_deg < 90、spread_min_m は正');
  for (const k of ['rounds_per_pass', 'max_passes'] as const) if (!Number.isInteger(a[k]) || a[k] < 1) bad(`${k} は 1 以上の整数`);
  if (!(r.detection.reaction_delay_s > 0 && a.commit_tcpa_s > 0 && a.pass_max_s > 0 && a.break_max_s > 0 && a.run_in_max_s > 0)) bad('reaction_delay_s・commit_tcpa_s・pass_max_s・break_max_s・run_in_max_s は正');
  if (!(a.wingman_delay_s >= 0 && a.pass_gap_s >= 0 && r.detection.detect_from_s >= 0 && a.edge_margin_m >= 0)) bad('wingman_delay_s・pass_gap_s・detect_from_s・edge_margin_m は 0 以上');
  if (!(r.detection.base_detect_m > 0 && r.patrol.arrive_m > 0 && g.count >= 1 && g.rof_per_min > 0 && g.damage > 0 && g.shell_speed_mps > 0)) bad('base_detect_m・arrive_m・砲の count・rof_per_min・damage・shell_speed_mps は正');
  const n = ctx.count;
  if (!Number.isInteger(n) || n < 1 || n > PT_MAX_COUNT || b.legs_m.length !== n) bad(`legs_m は ${n} 本（enemies の数。1〜${PT_MAX_COUNT}）`);
  const m = a.edge_margin_m;
  const legs = new Float64Array(4 * n);
  for (let i = 0; i < n; i++) {
    const l = b.legs_m[i]!;
    for (let k = 0; k < 4; k++) {
      const size = k % 2 === 0 ? ctx.bounds.width : ctx.bounds.height;
      if (!(l[k]! >= m && l[k]! <= size - m)) bad(`legs_m[${i}] の点は海域の縁から edge_margin_m（${m} m）の内`);
      legs[4 * i + k] = l[k]!;
    }
    const len = Math.hypot(l[2]! - l[0]!, l[3]! - l[1]!);
    if (!(len > 2 * r.patrol.arrive_m)) bad(`legs_m[${i}] の長さは arrive_m の 2 倍より長い`);
    if (!(b.start_along_m >= 0 && b.start_along_m <= len)) bad(`start_along_m は 0〜線の長さ（legs_m[${i}]）`);
  }
  if (!(b.leave_heading_deg >= 0 && b.leave_heading_deg < 360)) bad('leave_heading_deg は 0 以上 360 未満');
  const gun = gunParamsFromData(g);
  const sq = (x: number): number => x * x;
  const base: PtParams = {
    count: n,
    baseDetectM: r.detection.base_detect_m, reactionDelayS: r.detection.reaction_delay_s, detectFromS: r.detection.detect_from_s, detectHoldS: ctx.detectHoldS,
    patrolMps: ktToMps(r.patrol.speed_kt), runInMps: ktToMps(a.run_in_speed_kt), passMinMps: ktToMps(a.pass_speed_kt), overtakeMps: ktToMps(a.overtake_kt),
    dashMps: ktToMps(boat.speed_max_kt), leaveMps: ktToMps(a.leave_speed_kt), arrive2: sq(r.patrol.arrive_m),
    commitMax2: sq(a.commit_max_m), commitTcpaS: a.commit_tcpa_s, commitHeadingTolDeg: a.commit_heading_tol_deg, offsetM: a.pass_offset_m, openFireS: a.open_fire_s, passMaxS: a.pass_max_s, roundsPerPass: a.rounds_per_pass,
    cosDead2: sq(Math.cos(degToRad(a.dead_cone_deg))), minRange2: sq(a.min_range_m), spreadMinM: a.spread_min_m,
    breakOff2: sq(a.break_off_m), breakMaxS: a.break_max_s, runInMaxS: a.run_in_max_s, passGapS: a.pass_gap_s, wingmanDelayS: a.wingman_delay_s, maxPasses: a.max_passes,
    holdOff2: sq(a.hold_off_m), holdOuter2: sq(2 * a.hold_off_m - eff),
    edgeMarginM: m, leaveHeadingDeg: b.leave_heading_deg, turnRateDegS: boat.turn_rate_deg_s, accelMps2: boat.accel_mps2,
    boundsMarginM: (boat.length_m * ctx.spriteScale) / 2, spriteLengthUnits: boat.length_m * ctx.spriteScale, spriteBeamUnits: boat.beam_m * ctx.spriteScale,
    gun,
    hit: { damage: gun.damage, fireChance: gun.fireChance, engineDamageChance: gun.engineDamageChance },
    legs, startX: new Float64Array(n), startY: new Float64Array(n), startHeadingDeg: new Float64Array(n), startAlongM: b.start_along_m,
    bounds: { width: ctx.bounds.width, height: ctx.bounds.height },
    timeScale: ctx.timeScale,
  };
  return ptParamsAtNight(base, 0, 0, false);
}
