// 大発の隊の数値（v0.4.2）: enemies.json の daihatsu_barge と missions_seed の v0_1_prototype.barges から BargeParams を組む。検査はここ。
// 段階と運動は barges.ts。
import { gunParamsFromData, isGunDataRecord, type GunDataRecord, type GunParams, type HitSpec } from './gunnery';
import { ktToMps } from './units';

export interface BargeParams {
  count: number;
  hp: number;
  /** 当たり判定の半長・半幅（実寸 × hit_scale）と、海域の縁から押し戻す余白（表示の半長） */
  halfLengthM: number;
  halfBeamM: number;
  boundsMarginM: number;
  cruiseSpeedMps: number;
  /** 岸へ逃げる速さ（speed_typical_kt + speed_boost_kt） */
  runSpeedMps: number;
  turnRateDegS: number;
  accelMps2: number;
  /** 発見の基準距離（月明・速力帯は世界が掛ける）、気づいてから逃げ始めるまでの体感秒、見失ってから警戒を解くまでの体感秒 */
  baseDetectM: number;
  reactionDelayS: number;
  detectHoldS: number;
  /** 13mm（駆逐艦の砲と同じ型）と、その命中の被害 */
  gun: GunParams;
  gunHit: HitSpec;
  /** 先頭の出発点と進路、隻ごとの先頭から航路の後ろへの距離（index 順。2 隻ずつ 2 組なら [0, 100, 1500, 1600]） */
  leadX: number;
  leadY: number;
  headingDeg: number;
  offsetsM: readonly number[];
  /** 南の岸: 逃げる大発の中心がこの y を越えたら上陸（逃げ切り） */
  beachY: number;
  /** 逃げる進路の扇（隣どうしの差 deg。180° を中心に開く） */
  fanDeg: number;
  /** 撃破のノルマ（任務の成功） */
  quota: number;
  /** HUD の「上陸まで N 秒」を体感秒にする倍率（hit_rate_model の world.time_scale） */
  timeScale: number;
}

export interface BargeDataRecord {
  length_m: number;
  beam_m: number;
  hull_hp: number;
  speed_typical_kt: number;
  speed_max_kt: number;
  turn_rate_deg_s: number;
  accel_mps2: number;
  detection: { base_detect_m: number; reaction_delay_s: number };
  evasion: { speed_boost_kt: number; beach_fan_deg: number };
  guns: GunDataRecord[];
}

export interface BargeMissionBlock {
  lead_start: { x_m: number; y_m: number; heading_deg: number };
  offsets_m: number[];
  beach_margin_m: number;
  kill_quota: number;
}

function nums(v: unknown, keys: readonly string[]): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return keys.every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number));
}

export function isBargeDataRecord(v: unknown): v is BargeDataRecord {
  if (!nums(v, ['length_m', 'beam_m', 'hull_hp', 'speed_typical_kt', 'speed_max_kt', 'turn_rate_deg_s', 'accel_mps2'])) return false;
  const r = v as Record<string, unknown>;
  return nums(r['detection'], ['base_detect_m', 'reaction_delay_s']) && nums(r['evasion'], ['speed_boost_kt', 'beach_fan_deg']) && Array.isArray(r['guns']) && r['guns'].length === 1 && isGunDataRecord(r['guns'][0]);
}

export function isBargeMissionBlock(v: unknown): v is BargeMissionBlock {
  if (!nums(v, ['beach_margin_m', 'kill_quota'])) return false;
  const r = v as Record<string, unknown>;
  const offsets = r['offsets_m'];
  return nums(r['lead_start'], ['x_m', 'y_m', 'heading_deg']) && Array.isArray(offsets) && offsets.every((o) => typeof o === 'number' && Number.isFinite(o));
}

/** 設計値の検査込み。count は任務の enemies の数、world は hit_scale / sprite_scale / time_scale、bounds は海域、detectHoldS は hit_rate_model の visibility.detect_hold_s */
export function bargeParamsFromData(r: BargeDataRecord, b: BargeMissionBlock, count: number, world: { hitScale: number; spriteScale: number; timeScale: number }, bounds: { width: number; height: number }, detectHoldS: number): BargeParams {
  const bad = (msg: string): never => {
    throw new Error(`enemies.json の daihatsu_barge / missions_seed の barges: ${msg}（docs/02 §6.4）`);
  };
  if (!Number.isInteger(count) || count < 1) bad('大発は 1 隻以上');
  if (!Number.isInteger(b.kill_quota) || b.kill_quota < 1 || b.kill_quota > count) bad(`kill_quota は 1〜${count} の整数`);
  if (!(r.hull_hp > 0) || !(r.speed_typical_kt > 0) || !(r.turn_rate_deg_s > 0) || !(r.accel_mps2 > 0)) bad('hull_hp / speed_typical_kt / turn_rate_deg_s / accel_mps2 は正');
  if (!(r.evasion.speed_boost_kt >= 0) || r.speed_typical_kt + r.evasion.speed_boost_kt > r.speed_max_kt) bad('speed_typical_kt + speed_boost_kt は speed_max_kt 以下');
  if (!(r.detection.reaction_delay_s >= 0) || !(r.detection.base_detect_m > 0) || !(b.beach_margin_m > 0)) bad('reaction_delay_s は 0 以上、base_detect_m / beach_margin_m は正');
  const o = b.offsets_m;
  if (o.length !== count || o.some((d, i) => d < 0 || (i > 0 && d < o[i - 1]!))) bad(`offsets_m は ${count} 個（enemies の数）で、0 以上・前から順に減らない`);
  const beachY = bounds.height - b.beach_margin_m;
  const h = (b.lead_start.heading_deg * Math.PI) / 180;
  const tailX = b.lead_start.x_m - Math.sin(h) * o[count - 1]!;
  const tailY = b.lead_start.y_m + Math.cos(h) * o[count - 1]!;
  for (const [x, y] of [[b.lead_start.x_m, b.lead_start.y_m], [tailX, tailY]] as const) if (x < 0 || x > bounds.width || y < 0 || !(y < beachY)) bad('隊（先頭から最後尾まで）は海域の中で、岸の線（高さ − beach_margin_m）より海側');
  const gun = gunParamsFromData(r.guns[0]!);
  return {
    count,
    hp: r.hull_hp,
    halfLengthM: (r.length_m * world.hitScale) / 2,
    halfBeamM: (r.beam_m * world.hitScale) / 2,
    boundsMarginM: (r.length_m * world.spriteScale) / 2,
    cruiseSpeedMps: ktToMps(r.speed_typical_kt),
    runSpeedMps: ktToMps(r.speed_typical_kt + r.evasion.speed_boost_kt),
    turnRateDegS: r.turn_rate_deg_s,
    accelMps2: r.accel_mps2,
    baseDetectM: r.detection.base_detect_m,
    reactionDelayS: r.detection.reaction_delay_s,
    detectHoldS,
    gun,
    gunHit: { damage: gun.damage, fireChance: gun.fireChance, engineDamageChance: gun.engineDamageChance },
    leadX: b.lead_start.x_m,
    leadY: b.lead_start.y_m,
    headingDeg: b.lead_start.heading_deg,
    offsetsM: [...o],
    beachY,
    fanDeg: r.evasion.beach_fan_deg,
    quota: b.kill_quota,
    timeScale: world.timeScale,
  };
}
