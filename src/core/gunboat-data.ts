// 隼艇（v0.6.6「日本ハードモード⑤：隼艇」。jp_01 のハード。spec-v066 §B.6）の数値: missions_seed の v0_1_prototype.hard.gunboat（ちょうど 12 鍵）の形と値の検査と、
// boats.json の艇の値（運動・HP・砲）から GunboatParams を組む（純粋な検査。壊れていれば「jp_01.v0_1_prototype.hard.gunboat: …」の例外＝起動時に分かる）。
// 他の記録を跨ぐ検査（任務の同居・艇が boats.json にあり砲（弾倉付き）と HP を持つ・1 回の航過と連射で沈まない・砲の射程と閃光）は config/gunboat-mission-data。Phaser 非依存・確保は組み立てのときだけ。
import { boatParamsFromData, type BoatDataRecord } from './boat-motion';
import type { GunBatteryParams } from './gun-battery';
import type { GunboatParams } from './gunboat';
import { ktToMps } from './units';

/** hard.gunboat の鍵（ちょうどこの 12 個。打ち間違い・知らない鍵を止める。pt-chase-data の 19 鍵・engine の 8 鍵と同じ作法）。boat と label_ja は文字列、残りは有限の数 */
export const GUNBOAT_KEYS = [
  'boat', 'label_ja', 'station_astern_m', 'station_abeam_m', 'station_slow_m', 'heading_deadband_m', 'rejoin_m', 'fire_m', 'engage_speed_kt', 'beach_standoff_m', 'beach_arrive_m', 'target_range_factor',
] as const;
export type GunboatKey = (typeof GUNBOAT_KEYS)[number];
const TEXT_KEYS: readonly GunboatKey[] = ['boat', 'label_ja'];

/** hard.gunboat の形（readGunboatBlock が検査した写し） */
export type GunboatBlock = { boat: string; label_ja: string } & Record<Exclude<GunboatKey, 'boat' | 'label_ja'>, number>;

/** 艇の値（config/gunboat-mission-data が boats.json と hit_rate_model.world から引いて渡す）: 運動の記録・HP・砲（弾倉付き）・当たりの倍率・絵の倍率 */
export interface GunboatBoatRef {
  record: BoatDataRecord;
  hullHp: number;
  gun: GunBatteryParams;
  hitScale: number;
  spriteScale: number;
}

/** 形の検査: object で、鍵はちょうど GUNBOAT_KEYS（欠け・余分は例外）、boat・label_ja は空でない文字列、残りは有限の数。label は「jp_01.v0_1_prototype.hard.gunboat」 */
export function readGunboatBlock(raw: unknown, label: string): GunboatBlock {
  const bad = gunboatBad(label);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return bad(`object でない（鍵は ${GUNBOAT_KEYS.join(' / ')}）`);
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) if (!(GUNBOAT_KEYS as readonly string[]).includes(k)) bad(`知らない鍵 ${k}（鍵はちょうど ${GUNBOAT_KEYS.length} 個: ${GUNBOAT_KEYS.join(' / ')}）`);
  for (const k of GUNBOAT_KEYS) {
    const v = r[k];
    if (TEXT_KEYS.includes(k)) {
      if (typeof v !== 'string' || v.length === 0) bad(`${k} が無いか空でない文字列でない`);
    } else if (typeof v !== 'number' || !Number.isFinite(v)) bad(`${k} が無いか有限の数でない`);
  }
  return { ...(r as GunboatBlock) };
}

/**
 * 値の検査（spec-v066 §B.6）込みで GunboatParams を組む: station_astern_m > 0・station_slow_m > 0・0 < heading_deadband_m < station_slow_m・rejoin_m > 0・
 * 0 < fire_m ≤ 艇の gun_battery.range_m・0 < engage_speed_kt ≤ 艇の speed_bands_kt.silent_max（決着の前は静音の上限を超えない）・beach_standoff_m > 0・beach_arrive_m > 0・
 * 0 < target_range_factor ≤ 1。station_abeam_m は右舷が正（符号は問わない）。当たりの半長・半幅は 実寸 × hit_scale / 2、海域の縁の余白は 全長 × sprite_scale / 2（自艇と同じ式）
 */
export function gunboatParamsFromData(b: GunboatBlock, ref: GunboatBoatRef, label: string): GunboatParams {
  const bad = gunboatBad(label);
  if (!(b.station_astern_m > 0)) bad(`station_astern_m は正（${b.station_astern_m}。定位置は自艇の後ろ）`);
  if (!(b.station_slow_m > 0)) bad(`station_slow_m は正（${b.station_slow_m}）`);
  if (!(b.heading_deadband_m > 0 && b.heading_deadband_m < b.station_slow_m)) bad(`0 < heading_deadband_m < station_slow_m（${b.heading_deadband_m}・${b.station_slow_m}）`);
  if (!(b.rejoin_m > 0)) bad(`rejoin_m は正（${b.rejoin_m}）`);
  if (!(b.fire_m > 0 && b.fire_m <= ref.gun.rangeM)) bad(`0 < fire_m ≤ 艇の gun_battery.range_m（${b.fire_m}・${ref.gun.rangeM} m。射程の外へ撃たない）`);
  const silentKt = ref.record.speed_bands_kt.silent_max;
  if (!(b.engage_speed_kt > 0 && b.engage_speed_kt <= silentKt)) bad(`0 < engage_speed_kt ≤ 艇の speed_bands_kt.silent_max（${b.engage_speed_kt}・${silentKt} kt。決着の前は静音の上限を超えない）`);
  if (!(b.beach_standoff_m > 0)) bad(`beach_standoff_m は正（${b.beach_standoff_m}）`);
  if (!(b.beach_arrive_m > 0)) bad(`beach_arrive_m は正（${b.beach_arrive_m}）`);
  if (!(b.target_range_factor > 0 && b.target_range_factor <= 1)) bad(`0 < target_range_factor ≤ 1（${b.target_range_factor}。米PT が隼艇の見つかる距離に掛ける倍率）`);
  const r = ref.record;
  return {
    boatId: b.boat,
    labelJa: b.label_ja,
    boat: boatParamsFromData(r),
    hullHp: ref.hullHp,
    gun: ref.gun,
    halfLengthM: (r.length_m * ref.hitScale) / 2,
    halfBeamM: (r.beam_m * ref.hitScale) / 2,
    boundsMarginM: (r.length_m * ref.spriteScale) / 2,
    stationAsternM: b.station_astern_m,
    stationAbeamM: b.station_abeam_m,
    stationSlowM: b.station_slow_m,
    headingDeadbandM: b.heading_deadband_m,
    rejoinM: b.rejoin_m,
    fireM: b.fire_m,
    engageMps: ktToMps(b.engage_speed_kt),
    beachStandoffM: b.beach_standoff_m,
    beachArriveM: b.beach_arrive_m,
    targetRangeFactor: b.target_range_factor,
  };
}

/** 例外の文: 「jp_01.v0_1_prototype.hard.gunboat: …（docs/02 §6.4）」 */
export function gunboatBad(label: string): (msg: string) => never {
  return (msg: string): never => {
    throw new Error(`${label}: ${msg}（docs/02 §6.4）`);
  };
}
