// 空襲下の退避（v0.6.11。日本ハードモード⑨・jp_03「運天港・空襲下の退避」。spec-v0611-r2 §3・§4・§7）の data の型・定数・乱数の系列と形の検査:
// missions_seed.json の v0_1_prototype.evac（6 つの隊 × 3 隻・隠れ場所・追従・操作していない隊）と evac_raid（波・同時の編隊・狙い・残存）、
// risk_events.json の unten_air_raid.params（1 編隊の段と時間＝夜明けの空襲の core の値の形）。
// 形の検査（鍵の閉じた集合・型）はここ、世界の値（m・m/s）を組むのは core/evac-params、他の記録・任務を跨ぐ値の検査（V-E1〜V-E12）は config/evac-mission-data。Phaser 非依存・乱数なし。
import type { DawnStrikeEventRecord } from './air-strike-data';

/** risk_events.json の港の空襲の id（任務の v0_1_prototype.hazards に入る。night.optional_hazards には入れない） */
export const EVAC_EVENT_ID = 'unten_air_raid';

// ---------- 乱数の系列（spec §7。v0.6.10 までの最大は +28。+21 は大発の 13mm に予約のまま。一覧は core/night の頭） ----------
/** 予告ごとに陰の発見 2 回（陰の順。隠れている隊がいなくても引く） */
export const EVAC_SEED_OFFSET = 29;
/** 生成の時の離岸 6 回と、時計の pick_s ごとに 6 隊 × 2 回（隠れ・沈没・操作中でも引く＝引く回数は時計だけで決まる） */
export const EVAC_AI_SEED_OFFSET = 30;
/** どの編隊でも投下ごとに 1 回（編隊の番号順。中心が座席でも引く） */
export const EVAC_DODGE_SEED_OFFSET = 31;
/** 編隊ごとの系列の頭（+ 波 × EVAC_MAX_FLIGHTS + 枠＝+32〜+43）: 投下の散布 2 回と、隊長艇に当たった時の火災・機関（巻き添えも同じ系列） */
export const EVAC_FLIGHT_SEED_OFFSET = 32;
/** 同時に来る編隊の上限（ハード込み。flight_offsets_deg の長さ以下。系列の幅） */
export const EVAC_MAX_FLIGHTS = 3;
/** 波の上限（系列を +43 で止める: 32 + 4 × 3 − 1 = 43） */
export const EVAC_MAX_WAVES = 4;

/** 波 wave（0 始まり）・枠 slot（0 始まり）の編隊の系列の seed のずれ（+32〜+43） */
export function evacFlightSeedOffset(wave: number, slot: number): number {
  return EVAC_FLIGHT_SEED_OFFSET + wave * EVAC_MAX_FLIGHTS + slot;
}

/** 時計の比べの丸めの余裕（1/60 秒の積み上げの誤差で 1 ステップずれないように）: 燃料を数え始める fuel_free_until_s（世界の systems/world-boat と模擬 core/evac-sim が同じ式。S4） */
export const EVAC_TIME_EPS_S = 1e-6;

// ---------- 隊の段階（spec §3.2。隊ごと。艇ごとではない）・隠れ場所の種類・スティックの latch（spec §3.3） ----------
export const G_MOORED = 0; // 停泊（最初の全隊）
export const G_UNDERWAY = 1; // 走っている（操作中か、操作していない隊のランダム回避）
export const G_ENTERING = 2; // 操作中の隊長艇が輪の中で止まった（僚艇が枠の点へ寄る）
export const G_HAULING = 3; // 壕のレールで 1 隻ずつ上げる
export const G_HIDDEN = 4; // 隠れた（浮いている全艇が入った）
export const G_FOUND = 5; // 陰で見つかった（見えている・止まっている）
export const G_GONE = 6; // 全滅
export const SHELTER_CAVE = 0; // 壕（レール 1 本。見つからない）
export const SHELTER_COVER = 1; // 陰（止まれば隠れる。見つかることがある）
export const SW_FREE = 0; // スティックで操る
export const SW_WAIT_NEUTRAL = 1; // 切り替えた時に倒したまま → デッドゾーンに戻るのを待つ
export const SW_WAIT_INPUT = 2; // デッドゾーン → 倒すのを待つ

// ---------- data の形（missions_seed.json・risk_events.json） ----------
export interface EvacGroupRecord {
  id: string;
  label_ja: string;
  place_ja: string;
  x_m: number;
  y_m: number;
  heading_deg: number;
}

export interface EvacShelterRecord {
  id: string;
  label_ja: string;
  kind: 'cave' | 'cover';
  x_m: number;
  y_m: number;
  slots: number;
  exit_heading_deg: number;
}

/** v0_1_prototype.evac（*_source の文字列の鍵は別に許す） */
export interface EvacBlock {
  boat: string;
  label_ja: string;
  group_size: number;
  start_group: number;
  groups: EvacGroupRecord[];
  moored_gap_m: number;
  follow: { gap_m: number; trail_step_m: number; catch_up_gain_per_s: number; heading_deadband_m: number; source: string };
  shelter_ring_m: number;
  hide_max_kt: number;
  haul_s: number;
  launch_stick: number;
  slot_abeam_m: number;
  slot_arrive_m: number;
  shelters: EvacShelterRecord[];
  ai: {
    cast_off_s: [number, number];
    pick_s: number;
    turn_max_deg: number;
    full_p: number;
    wall_m: number;
    wall_turn_deg: number;
    look_m: number;
    found_react_s: number;
    dodge: { success: number; turn_deg: number; hold_s: number };
    source: string;
  };
  flash_reveal: boolean;
  source: string;
}

/** v0_1_prototype.evac_raid（*_source の文字列の鍵は別に許す） */
export interface EvacRaidBlock {
  waves: { announce_s: number; planes: number }[];
  flights: number;
  announce_lead_s: number;
  from_bearing_deg: number;
  flight_offsets_deg: number[];
  spawn_m: number;
  flights_per_group_max: number;
  bearing_fix_deg: number[];
  cover_reveal_chance: number;
  /** 1 編隊が飛ぶ爆撃の回数の上限（v0.6.11 S3b。data 2＝U7。1＝S3 の挙動。core/evac-repass） */
  passes_max: number;
  survivor_quota: number;
  survivors_total: number;
  historical_survivors: number;
  north_shore_label_ja: string;
  source: string;
}

/** risk_events.json の unten_air_raid（params は sortie と source だけ。sortie は dawn_air_strike.params と同じ 9 個の鍵） */
export interface EvacEventRecord {
  id: string;
  params: { sortie: DawnStrikeEventRecord['params']; source: string };
}

const EVAC_KEYS = ['boat', 'label_ja', 'group_size', 'start_group', 'groups', 'moored_gap_m', 'follow', 'shelter_ring_m', 'hide_max_kt', 'haul_s', 'launch_stick', 'slot_abeam_m', 'slot_arrive_m', 'shelters', 'ai', 'flash_reveal', 'source'] as const;
const EVAC_NUM_KEYS = ['group_size', 'start_group', 'moored_gap_m', 'shelter_ring_m', 'hide_max_kt', 'haul_s', 'launch_stick', 'slot_abeam_m', 'slot_arrive_m'] as const;
const GROUP_KEYS = ['id', 'label_ja', 'place_ja', 'x_m', 'y_m', 'heading_deg'] as const;
const SHELTER_KEYS = ['id', 'label_ja', 'kind', 'x_m', 'y_m', 'slots', 'exit_heading_deg'] as const;
const FOLLOW_KEYS = ['gap_m', 'trail_step_m', 'catch_up_gain_per_s', 'heading_deadband_m', 'source'] as const;
const AI_KEYS = ['cast_off_s', 'pick_s', 'turn_max_deg', 'full_p', 'wall_m', 'wall_turn_deg', 'look_m', 'found_react_s', 'dodge', 'source'] as const;
const AI_NUM_KEYS = ['pick_s', 'turn_max_deg', 'full_p', 'wall_m', 'wall_turn_deg', 'look_m', 'found_react_s'] as const;
const DODGE_KEYS = ['success', 'turn_deg', 'hold_s'] as const;
const RAID_KEYS = ['waves', 'flights', 'announce_lead_s', 'from_bearing_deg', 'flight_offsets_deg', 'spawn_m', 'flights_per_group_max', 'bearing_fix_deg', 'cover_reveal_chance', 'passes_max', 'survivor_quota', 'survivors_total', 'historical_survivors', 'north_shore_label_ja', 'source'] as const;
const RAID_NUM_KEYS = ['flights', 'announce_lead_s', 'from_bearing_deg', 'spawn_m', 'flights_per_group_max', 'cover_reveal_chance', 'passes_max', 'survivor_quota', 'survivors_total', 'historical_survivors'] as const;
/** unten_air_raid.params.sortie の鍵（dawn_air_strike.params と同じ 9 個） */
export const EVAC_SORTIE_KEYS = ['spawn_m', 'run_radius_m', 'first_run_s', 'run_gap_s', 'wave_rest_s', 'leave_s', 'spawn_offsets_deg', 'wave_rotate_deg', 'aim_turn_min_deg_s'] as const;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const badAt = (label: string) => (msg: string): never => {
  throw new Error(`${label}: ${msg}`);
};

/** 鍵の閉じた集合（keys と、extraSource なら *_source の文字列）・数の鍵・文字列の鍵を見る */
function checkRecord(r: Record<string, unknown>, keys: readonly string[], nums: readonly string[], strs: readonly string[], bad: (msg: string) => never, extraSource: boolean): void {
  for (const k of Object.keys(r)) {
    if (keys.includes(k)) continue;
    if (extraSource && k.endsWith('_source') && isStr(r[k])) continue;
    bad(`知らない鍵 ${k}（鍵は ${keys.join(' / ')}${extraSource ? ' と *_source の文' : ''}）`);
  }
  for (const k of nums) if (!isNum(r[k])) bad(`${k} が無いか有限の数でない`);
  for (const k of strs) if (!isStr(r[k])) bad(`${k} が無いか空`);
}

/** v0_1_prototype.evac を読む（形・鍵の閉じた集合・kind・cast_off_s の形）。label は「jp_03.v0_1_prototype.evac」 */
export function evacBlockFromData(raw: unknown, label: string): EvacBlock {
  const bad = badAt(label);
  if (!isObj(raw)) return bad('object でない');
  checkRecord(raw, EVAC_KEYS, EVAC_NUM_KEYS, ['boat', 'label_ja', 'source'], bad, true);
  if (typeof raw['flash_reveal'] !== 'boolean') bad('flash_reveal は true か false');
  const groups = raw['groups'];
  if (!Array.isArray(groups) || groups.length === 0) bad('groups は空でない配列');
  (groups as unknown[]).forEach((g, i) => {
    const b = badAt(`${label}.groups[${i}]`);
    if (!isObj(g)) return b('object でない');
    checkRecord(g, GROUP_KEYS, ['x_m', 'y_m', 'heading_deg'], ['id', 'label_ja', 'place_ja'], b, false);
  });
  const shelters = raw['shelters'];
  if (!Array.isArray(shelters) || shelters.length === 0) bad('shelters は空でない配列');
  (shelters as unknown[]).forEach((s, i) => {
    const b = badAt(`${label}.shelters[${i}]`);
    if (!isObj(s)) return b('object でない');
    checkRecord(s, SHELTER_KEYS, ['x_m', 'y_m', 'slots', 'exit_heading_deg'], ['id', 'label_ja'], b, false);
    if (s['kind'] !== 'cave' && s['kind'] !== 'cover') b(`kind は cave か cover（${String(s['kind'])}）`);
  });
  const follow = raw['follow'];
  if (!isObj(follow)) return bad('follow が object でない');
  checkRecord(follow, FOLLOW_KEYS, ['gap_m', 'trail_step_m', 'catch_up_gain_per_s', 'heading_deadband_m'], ['source'], badAt(`${label}.follow`), false);
  const ai = raw['ai'];
  if (!isObj(ai)) return bad('ai が object でない');
  const ba = badAt(`${label}.ai`);
  checkRecord(ai, AI_KEYS, AI_NUM_KEYS, ['source'], ba, false);
  const co = ai['cast_off_s'];
  if (!Array.isArray(co) || co.length !== 2 || !co.every(isNum)) ba('cast_off_s は 2 つの数 [小, 大]');
  const dodge = ai['dodge'];
  if (!isObj(dodge)) return ba('dodge が object でない');
  checkRecord(dodge, DODGE_KEYS, DODGE_KEYS, [], badAt(`${label}.ai.dodge`), false);
  return raw as unknown as EvacBlock;
}

/** v0_1_prototype.evac_raid を読む（形・鍵の閉じた集合・波の形）。label は「jp_03.v0_1_prototype.evac_raid」 */
export function evacRaidBlockFromData(raw: unknown, label: string): EvacRaidBlock {
  const bad = badAt(label);
  if (!isObj(raw)) return bad('object でない');
  checkRecord(raw, RAID_KEYS, RAID_NUM_KEYS, ['north_shore_label_ja', 'source'], bad, true);
  const waves = raw['waves'];
  if (!Array.isArray(waves) || waves.length === 0) bad('waves は空でない配列');
  (waves as unknown[]).forEach((w, i) => {
    const b = badAt(`${label}.waves[${i}]`);
    if (!isObj(w)) return b('object でない');
    checkRecord(w, ['announce_s', 'planes'], ['announce_s', 'planes'], [], b, false);
  });
  for (const k of ['flight_offsets_deg', 'bearing_fix_deg'] as const) {
    const a = raw[k];
    if (!Array.isArray(a) || a.length === 0 || !a.every(isNum)) bad(`${k} は空でない数の配列`);
  }
  return raw as unknown as EvacRaidBlock;
}

/** risk_events.json の unten_air_raid を読む（形と鍵の閉じた集合）。label は任務（例「jp_03 の港の空襲」） */
export function evacEventFromData(raw: unknown, label: string): EvacEventRecord {
  const bad = badAt(`${label}（risk_events.json の ${EVAC_EVENT_ID}）`);
  if (!isObj(raw) || raw['id'] !== EVAC_EVENT_ID || !isObj(raw['params'])) return bad('記録か params が無い');
  const p = raw['params'];
  for (const k of Object.keys(p)) if (k !== 'sortie' && k !== 'source') bad(`params に知らない鍵 ${k}（鍵は sortie・source）`);
  if (!isStr(p['source'])) bad('params.source（design の根拠の文）が無い');
  const s = p['sortie'];
  if (!isObj(s)) return bad('params.sortie（1 編隊の段と時間）が無い');
  for (const k of Object.keys(s)) if (!(EVAC_SORTIE_KEYS as readonly string[]).includes(k)) bad(`params.sortie に知らない鍵 ${k}（鍵は ${EVAC_SORTIE_KEYS.join(' / ')}）`);
  for (const k of EVAC_SORTIE_KEYS) if (k !== 'spawn_offsets_deg' && !isNum(s[k])) bad(`params.sortie.${k} が無いか有限の数でない`);
  const offs = s['spawn_offsets_deg'];
  if (!Array.isArray(offs) || !offs.every(isNum)) bad('params.sortie.spawn_offsets_deg は数の配列');
  return raw as unknown as EvacEventRecord;
}
