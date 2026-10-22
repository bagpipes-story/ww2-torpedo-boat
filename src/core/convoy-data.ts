// 味方の大発の輸送隊の数値（v0.6.4。jp_01。docs/02 §6.4、spec §B.2・§E.5）: enemies.json の daihatsu_barge（寸法・速さ・旋回・加速は敵の大発と同じ record）と
// missions_seed の v0_1_prototype.convoy から ConvoyParams と米PT の標的の規則（PtTargetRule）を組む。検査はここ（壊れた data は任務の id を付けて例外＝Boot で止まる）。
// 任務の他の鍵との排他（pt_boats のある任務だけ・barges / enemy_start / escort と同居不可・coast 必須・main_weapon guns）と出発で見つからない距離は config 側（mission-data・pt-mission-data）。段階と運動は convoy.ts。
import type { BargeDataRecord } from './barge-data';
import type { SpeedStep } from './boat-motion';
import type { ConvoyParams } from './convoy';
import type { PtTargetRule } from './pt-target';
import { ktToMps } from './units';

/** 輸送隊の大発の id（enemies.json。任務の allies に並ぶ数が隻数。寸法・速さは敵の大発と同じ record） */
export const CONVOY_BARGE_ID = 'daihatsu_barge';

/** 世界の組み立て（systems/world-setup の convoy）と模擬（core/convoy-sim）が持つ輸送隊の設定: 隊・大発が見つかる速力帯・米PT の標的の規則（規則は convoy の中。WorldSetup に別の鍵を置かない） */
export interface ConvoySetup {
  params: ConvoyParams;
  detectBand: SpeedStep;
  rule: PtTargetRule;
}

/** missions_seed の v0_1_prototype.convoy（spec §B.2） */
export interface ConvoyMissionBlock {
  lead_start: { x_m: number; y_m: number; heading_deg: number };
  /** 先頭から航路の後ろへの距離 m（index 順。[0] は 0） */
  offsets_m: number[];
  landing_x_m: number;
  arrive_quota: number;
  barge_hp: number;
  /** 大発が見つかる距離の帯（自艇の速力帯の係数を借りる。stop なら新月で 480 m） */
  detect_band: SpeedStep;
  /** 米PT の標的の規則: 今の標的の点数 × ratio² より小さい候補がいて、前の切り替えから hold 秒たったときだけ替える。閃光の記憶は flash_hold_s */
  target_keep_ratio: number;
  target_switch_hold_s: number;
  flash_hold_s: number;
  source: string;
}

/** 検査に要る任務の周り: id（例外の文）、先頭の x の揺らぎ ±m（night.barge_lead_jitter_m）、帰投の輪（到達線の側で、到達線上の航路の点から縁まで CONVOY_RING_CLEAR_M 以上） */
export interface ConvoyMissionContext {
  missionId: string;
  leadJitterM: number;
  ring: { x: number; y: number; radiusM: number };
}

/** 到達線上の航路の点から帰投の輪の縁までの最短 m（spec §B.2 return_point: 到達線で止まった先頭の大発のそばで撃ち合っていて誤って輪に入らない。jp_01 は 333 m） */
export const CONVOY_RING_CLEAR_M = 300;

const DETECT_BANDS: readonly SpeedStep[] = ['stop', 'silent', 'cruise', 'full'];

function nums(v: unknown, keys: readonly string[]): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return keys.every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number));
}

export function isConvoyMissionBlock(v: unknown): v is ConvoyMissionBlock {
  if (!nums(v, ['landing_x_m', 'arrive_quota', 'barge_hp', 'target_keep_ratio', 'target_switch_hold_s', 'flash_hold_s'])) return false;
  const r = v as Record<string, unknown>;
  const offsets = r['offsets_m'];
  return nums(r['lead_start'], ['x_m', 'y_m', 'heading_deg']) && Array.isArray(offsets) && offsets.every((o) => typeof o === 'number' && Number.isFinite(o))
    && DETECT_BANDS.includes(r['detect_band'] as SpeedStep) && typeof r['source'] === 'string';
}

/**
 * 設計値の検査込み（spec §E.5）。count は任務の allies の daihatsu_barge の数、world は hit_rate_model の hit_scale / sprite_scale、bounds は海域。
 * 隊（先頭〜最後尾。揺らぎ込み）は海域の縁から絵の半長の内で岸（南の縁）より海側、針路は東西、上陸線は針路の先、帰投の輪は上陸線の側で縁まで CONVOY_RING_CLEAR_M 以上
 */
export function convoyParamsFromData(r: BargeDataRecord, b: ConvoyMissionBlock, count: number, world: { hitScale: number; spriteScale: number }, bounds: { width: number; height: number }, ctx: ConvoyMissionContext): ConvoyParams {
  const bad = (msg: string): never => {
    throw new Error(`${ctx.missionId}.v0_1_prototype.convoy: ${msg}（docs/02 §6.4）`);
  };
  if (!(r.length_m > 0) || !(r.beam_m > 0) || !(r.speed_typical_kt > 0) || !(r.turn_rate_deg_s > 0) || !(r.accel_mps2 > 0)) bad('enemies.json の大発の length_m / beam_m / speed_typical_kt / turn_rate_deg_s / accel_mps2 は正');
  if (!Number.isInteger(count) || count < 1) bad('大発は 1 隻以上（allies の daihatsu_barge の数）');
  const o = b.offsets_m;
  if (o.length !== count || o[0] !== 0 || o.some((d, i) => i > 0 && !(d > o[i - 1]!))) bad(`offsets_m は ${count} 個（allies の daihatsu_barge の数）で、[0] が 0・前から順に増える`);
  if (!Number.isInteger(b.arrive_quota) || b.arrive_quota < 1 || b.arrive_quota > count) bad(`arrive_quota は 1〜${count} の整数`);
  if (!(b.barge_hp > 0)) bad('barge_hp は正');
  if (!DETECT_BANDS.includes(b.detect_band)) bad('detect_band は stop / silent / cruise / full のどれか');
  if (!(b.target_keep_ratio > 0 && b.target_keep_ratio <= 1)) bad('target_keep_ratio は 0 より大きく 1 以下');
  if (!(b.target_switch_hold_s >= 0) || !(b.flash_hold_s >= 0)) bad('target_switch_hold_s・flash_hold_s は 0 以上');
  if (!(ctx.leadJitterM >= 0)) bad('night.barge_lead_jitter_m は 0 以上');
  const h = b.lead_start.heading_deg;
  if (h !== 90 && h !== 270) bad('lead_start.heading_deg は 90（東へ）か 270（西へ）');
  const ux = h === 90 ? 1 : -1;
  const margin = (r.length_m * world.spriteScale) / 2;
  const leadX = b.lead_start.x_m;
  const y = b.lead_start.y_m;
  const maxOff = o[count - 1]!;
  const tailX = leadX - ux * maxOff;
  const jit = ctx.leadJitterM;
  for (const x of [leadX - jit, leadX + jit, tailX - jit, tailX + jit]) if (x < margin || x > bounds.width - margin) bad('隊（先頭から最後尾まで。揺らぎ込み）は海域の縁から絵の半長の内');
  if (y < margin || !(y < bounds.height - 2 * margin)) bad('航路の y は海域の縁から絵の半長の内で、岸（南の縁）より海側');
  const landing = b.landing_x_m;
  if (landing < margin || landing > bounds.width - margin) bad('landing_x_m は海域の中');
  if (!((landing - leadX) * ux > maxOff + jit)) bad('landing_x_m は針路の先（先頭から最後尾の距離と揺らぎより遠く）');
  if ((ctx.ring.x - landing) * ux < 0) bad('帰投地点の輪の中心は上陸線の側（針路の先）');
  const rdx = ctx.ring.x - landing;
  const rdy = ctx.ring.y - y;
  const clear = ctx.ring.radiusM + CONVOY_RING_CLEAR_M;
  if (rdx * rdx + rdy * rdy < clear * clear) bad(`上陸線上の航路の点から帰投地点の輪の縁まで ${CONVOY_RING_CLEAR_M} m 以上（そばで撃ち合っていて輪に入らない）`);
  return {
    count,
    hp: b.barge_hp,
    halfLengthM: (r.length_m * world.hitScale) / 2,
    halfBeamM: (r.beam_m * world.hitScale) / 2,
    boundsMarginM: margin,
    speedMps: ktToMps(r.speed_typical_kt),
    turnRateDegS: r.turn_rate_deg_s,
    accelMps2: r.accel_mps2,
    leadX,
    leadY: y,
    headingDeg: h,
    offsetsM: [...o],
    landingX: landing,
    quota: b.arrive_quota,
  };
}

/**
 * 今夜の揺らぎ（core/night の bargeLeadDx・mirrored）を当てた複製（systems/world-night の applyConvoyNight と模擬 core/convoy-sim の convoyNight が同じ式）:
 * 先頭の x にずれを足してから左右反転（上陸線・針路も反転。帰投の輪は地形なので反転しない＝輸送隊の任務は mirror_chance 0: config/mission-data）。ずれも反転も無ければそのまま
 */
export function convoyParamsAtNight(p: ConvoyParams, leadDx: number, mirrored: boolean, boundsWidth: number): ConvoyParams {
  if (leadDx === 0 && !mirrored) return p;
  const mx = (x: number): number => (mirrored ? boundsWidth - x : x);
  return { ...p, leadX: mx(p.leadX + leadDx), headingDeg: mirrored ? (360 - p.headingDeg) % 360 : p.headingDeg, landingX: mx(p.landingX) };
}

/** 米PT の標的の規則（core/pt-target）: keepRatio2 = target_keep_ratio²・lockS・flashHoldS。値の検査は convoyParamsFromData（同じ block を先に通す） */
export function ptTargetRuleFromData(b: ConvoyMissionBlock): PtTargetRule {
  return { keepRatio2: b.target_keep_ratio * b.target_keep_ratio, lockS: b.target_switch_hold_s, flashHoldS: b.flash_hold_s };
}
