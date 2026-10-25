// 夜の哨戒機（v0.6.7。日本ハードモード⑥・jp_02「孤島の哨戒」。docs/02 §6.8、spec-v067 §B・§C.6・§C.7）の data の型と検査:
// enemies.json の機体（strike＝夜の出撃と夜明けの空襲の値・patrol＝見える距離）、risk_events.json の patrol_air.params（門番の段と秒・夜の出撃の sortie）、
// missions_seed.json の v0_1_prototype.patrol_air（鍵ちょうど 7 個）。門番の値（PatrolParams）を組み、起動時の検査 C1・C3〜C5・C7・C9 をする。
// 他の記録を跨ぐ検査（機体の faction・置き場・enemies の数・夜の出撃の AirStrikeParams＝C2・C6・C8）は config/patrol-air-mission-data。Phaser 非依存・乱数なし。
import { isStrikeAircraftRecord, type DawnStrikeEventRecord, type StrikeAircraftRecord } from './air-strike-data';
import { AIR_STRIKE_MAX_PLANES } from './air-strike-state';
import { PA_KEY_BOMBS_MAX, PA_KEY_DIST_HM_MAX, PA_KEY_HP5_MAX, PA_KEY_NEAR_HM_MAX, PA_KEY_SEC_MAX, PA_KEY_WAKE_S_MAX, type PatrolParams } from './patrol-air-state';
import { ktToMps, radToDeg } from './units';
import { playerVisRangeM, type VisibilityParams } from './visibility';

/** risk_events.json の夜の哨戒機の id（任務の v0_1_prototype.hazards に入る。night.optional_hazards には入れない） */
export const PATROL_AIR_EVENT_ID = 'patrol_air';
/** missions_seed の v0_1_prototype.patrol_air の鍵（ちょうどこの 7 個。C1） */
export const PATROL_AIR_BLOCK_KEYS = ['aircraft_id', 'count', 'count_source', 'from_bearing_deg', 'pass_rotate_deg', 'radar_passes', 'source'] as const;
/** risk_events.json の patrol_air.params の秒の鍵（＋ sortie と source。ちょうどこれだけ） */
export const PATROL_AIR_PARAM_KEYS = ['first_pass_s', 'wake_trigger_s', 'sweep_gap_s', 'orbit_s', 'leave_s', 'hud_stop_margin_s'] as const;
/** params.sortie の鍵（夜明けの空襲の dawn_air_strike.params と同じ 9 個。夜の出撃の値） */
export const PATROL_SORTIE_KEYS = ['spawn_m', 'run_radius_m', 'first_run_s', 'run_gap_s', 'wave_rest_s', 'leave_s', 'spawn_offsets_deg', 'wave_rotate_deg', 'aim_turn_min_deg_s'] as const;

/** F2（spec C.6）: 秒読みが 0 になってからこの秒だけ遅れて止め始めても見つからない */
export const PATROL_LATE_STOP_S = 1.5;
/** F1: 捜索の予告（6,000 m）から秒読み 0 までの最短の秒（(wake_detect_m − lock_m)/v ≥ hud_stop_margin_s + これ） */
export const PATROL_MIN_COUNTDOWN_S = 10;
/** F1: 発見から最初の投下までの最短の秒（sortie.first_run_s + 爆撃進路の秒 ≥ これ） */
export const PATROL_MIN_FIND_TO_DROP_S = 6.9;
const EPS_S = 1e-9; // 秒の比較の許し（境の値を丸めで割らない）

/** enemies.json の夜の哨戒機（us_patrol_bomber）: 空襲の値（strike）と見える距離（patrol）。guns・flare・detection は持たない（水上機の core は使えない形） */
export interface PatrolAircraftRecord extends StrikeAircraftRecord {
  patrol: { wake_detect_m: number; lock_m: number };
}

/** risk_events.json の patrol_air（門番の段と秒・夜の出撃の値） */
export interface PatrolAirEventRecord {
  id: string;
  params: Record<(typeof PATROL_AIR_PARAM_KEYS)[number], number> & { sortie: DawnStrikeEventRecord['params']; source: string };
}

/** missions_seed.json の v0_1_prototype.patrol_air */
export interface PatrolAirBlock {
  aircraft_id: string;
  count: number;
  count_source: string;
  from_bearing_deg: number;
  pass_rotate_deg: number;
  radar_passes: number;
  source: string;
}

/** 自艇の値（boats.json の speed_max_kt・speed_bands_kt の silent_max と stop_max・decel_mps2・hull_hp） */
export interface PatrolBoat {
  speedMaxKt: number;
  silentMaxKt: number;
  stopMaxKt: number;
  decelMps2: number;
  hullHp: number;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const badAt = (label: string) => (msg: string): never => {
  throw new Error(`${label}: ${msg}（docs/02 §6.8）`);
};

/** 形だけの検査（空襲の値と patrol の 2 つの数） */
export function isPatrolAircraftRecord(v: unknown): v is PatrolAircraftRecord {
  if (!isStrikeAircraftRecord(v)) return false;
  const p = (v as unknown as Record<string, unknown>)['patrol'];
  return isObj(p) && isNum(p['wake_detect_m']) && isNum(p['lock_m']);
}

/** risk_events.json の patrol_air を読む（形と鍵の閉じた集合）。label は任務（例「jp_02.v0_1_prototype.patrol_air」） */
export function patrolAirEventFromData(raw: unknown, label: string): PatrolAirEventRecord {
  const bad = badAt(`${label}（risk_events.json の ${PATROL_AIR_EVENT_ID}）`);
  if (!isObj(raw) || raw['id'] !== PATROL_AIR_EVENT_ID || !isObj(raw['params'])) return bad('記録か params が無い');
  const p = raw['params'];
  for (const k of Object.keys(p)) if (k !== 'sortie' && k !== 'source' && !(PATROL_AIR_PARAM_KEYS as readonly string[]).includes(k)) bad(`params に知らない鍵 ${k}（鍵は ${PATROL_AIR_PARAM_KEYS.join(' / ')} と sortie・source）`);
  for (const k of PATROL_AIR_PARAM_KEYS) if (!isNum(p[k])) bad(`params.${k} が無いか有限の数でない`);
  if (typeof p['source'] !== 'string' || p['source'].length === 0) bad('params.source（design の根拠の文）が無い');
  const s = p['sortie'];
  if (!isObj(s)) return bad('params.sortie（夜の出撃の段と時間）が無い');
  for (const k of Object.keys(s)) if (!(PATROL_SORTIE_KEYS as readonly string[]).includes(k)) bad(`params.sortie に知らない鍵 ${k}（鍵は ${PATROL_SORTIE_KEYS.join(' / ')}）`);
  for (const k of PATROL_SORTIE_KEYS) if (k !== 'spawn_offsets_deg' && !isNum(s[k])) bad(`params.sortie.${k} が無いか有限の数でない`);
  const offs = s['spawn_offsets_deg'];
  if (!Array.isArray(offs) || !offs.every(isNum)) bad('params.sortie.spawn_offsets_deg は数の配列');
  return raw as unknown as PatrolAirEventRecord;
}

/** v0_1_prototype.patrol_air を読む（C1: 鍵はちょうど 7 個・radar_passes は 0 以上の整数。C3 の count の範囲は patrolAirParamsFromData） */
export function patrolAirBlockFromData(raw: unknown, label: string): PatrolAirBlock {
  const bad = badAt(label);
  if (!isObj(raw)) return bad(`鍵 ${PATROL_AIR_BLOCK_KEYS.join(' / ')} の object でない`);
  for (const k of Object.keys(raw)) if (!(PATROL_AIR_BLOCK_KEYS as readonly string[]).includes(k)) bad(`知らない鍵 ${k}（鍵はちょうど ${PATROL_AIR_BLOCK_KEYS.join(' / ')}）`);
  for (const k of ['aircraft_id', 'count_source', 'source'] as const) if (typeof raw[k] !== 'string' || (raw[k] as string).trim() === '') bad(`${k} が無いか空`);
  for (const k of ['count', 'from_bearing_deg', 'pass_rotate_deg', 'radar_passes'] as const) if (!isNum(raw[k])) bad(`${k} が無いか有限の数でない`);
  const rp = raw['radar_passes'] as number;
  if (!Number.isInteger(rp) || rp < 0) bad(`radar_passes は 0 以上の整数（${rp}）`);
  return raw as unknown as PatrolAirBlock;
}

/**
 * 門番の値を組む（spec C.7）。例外は label（任務）付き:
 * C3 count は 1〜4 の整数で sortie.spawn_offsets_deg と同じ数／C4 0 < sortie.run_radius_m < 自艇の視程 < lock_m ≤ sortie.spawn_m < wake_detect_m／
 * C5 秒は正（first_pass_s は 0 以上）／C7 F1（予告から秒読み 0 まで ≥ 10 秒・発見から最初の投下まで ≥ 6.9 秒）・F2（秒読み 0 の 1.5 秒後に止め始めても
 * 航跡は 1,500 m の線までに消え、動く船体は視程の線までに止まる）・F9（1 発では沈まない）／C9 2 行目のキーの欄に値が収まる
 */
export function patrolAirParamsFromData(aircraft: PatrolAircraftRecord, event: PatrolAirEventRecord, block: PatrolAirBlock, boat: PatrolBoat, vis: VisibilityParams, timeScale: number, label: string): PatrolParams {
  const bad = badAt(label);
  const q = event.params;
  const s = q.sortie;
  const st = aircraft.strike;
  const n = block.count;
  const f2 = (x: number): string => x.toFixed(2);
  if (!Number.isInteger(n) || n < 1 || n > AIR_STRIKE_MAX_PLANES) bad(`count は 1〜${AIR_STRIKE_MAX_PLANES} の整数（${n}）`);
  if (s.spawn_offsets_deg.length !== n) bad(`risk_events.json の patrol_air.params.sortie.spawn_offsets_deg（${s.spawn_offsets_deg.length} 個）は count（${n}）と同じ数（捜索の隊形の機ごとのずれ）`);
  if (!(q.first_pass_s >= 0)) bad(`patrol_air.params.first_pass_s は 0 以上（${q.first_pass_s}）`);
  for (const k of ['wake_trigger_s', 'sweep_gap_s', 'orbit_s', 'leave_s', 'hud_stop_margin_s'] as const) if (!(q[k] > 0)) bad(`patrol_air.params.${k} は正の秒（${q[k]}）`);
  if (!(timeScale > 0) || !(st.run_speed_kt > 0)) bad('time_scale と機体の strike.run_speed_kt は正');
  const near = playerVisRangeM(vis);
  const wake = aircraft.patrol.wake_detect_m;
  const lock = aircraft.patrol.lock_m;
  if (!(s.run_radius_m > 0 && s.run_radius_m < near && near < lock && lock <= s.spawn_m && s.spawn_m < wake)) {
    bad(`0 < sortie.run_radius_m（${s.run_radius_m}）< 自艇の視程（${near} m。付近の捜索の半径）< ${aircraft.id}.patrol.lock_m（${lock}）≤ sortie.spawn_m（${s.spawn_m}）< patrol.wake_detect_m（${wake}）（満月・半月の視程は lock_m に届く＝月を変えるなら値も見直す）`);
  }
  const v = ktToMps(st.run_speed_kt) * timeScale;
  const passS = (wake - lock) / v;
  if (!(passS >= q.hud_stop_margin_s + PATROL_MIN_COUNTDOWN_S - EPS_S)) bad(`捜索の予告から 1,500 m の線までの秒（${f2(passS)}）は hud_stop_margin_s + ${PATROL_MIN_COUNTDOWN_S}（${f2(q.hud_stop_margin_s + PATROL_MIN_COUNTDOWN_S)}）以上（F1）`);
  const runS = s.run_radius_m / v;
  if (!(s.first_run_s + runS >= PATROL_MIN_FIND_TO_DROP_S - EPS_S)) bad(`発見から最初の投下までの秒（sortie.first_run_s + 爆撃進路 = ${f2(s.first_run_s + runS)}）は ${PATROL_MIN_FIND_TO_DROP_S} 以上（F1）`);
  if (!(boat.decelMps2 > 0 && boat.speedMaxKt > boat.silentMaxKt && boat.silentMaxKt > boat.stopMaxKt && boat.stopMaxKt >= 0)) bad('自艇の decel_mps2 は正、speed_max_kt > speed_bands_kt.silent_max > stop_max ≥ 0');
  const tWake = ktToMps(boat.speedMaxKt - boat.silentMaxKt) / boat.decelMps2 / timeScale;
  const tStop = ktToMps(boat.speedMaxKt - boat.stopMaxKt) / boat.decelMps2 / timeScale;
  if (!(q.hud_stop_margin_s >= tWake + PATROL_LATE_STOP_S - EPS_S)) {
    bad(`hud_stop_margin_s（${q.hud_stop_margin_s}）は 最高速 → 航跡が消える（静音の上限）の秒（${f2(tWake)}）+ ${PATROL_LATE_STOP_S} 以上（秒読み 0 の ${PATROL_LATE_STOP_S} 秒後に止め始めても 1,500 m の線までに航跡が消える。F2）`);
  }
  if (!(q.hud_stop_margin_s + (lock - near) / v >= tStop + PATROL_LATE_STOP_S - EPS_S)) {
    bad(`hud_stop_margin_s + (lock_m − 視程)/v（${f2(q.hud_stop_margin_s + (lock - near) / v)}）は 最高速 → 停止の秒（${f2(tStop)}）+ ${PATROL_LATE_STOP_S} 以上（秒読み 0 の ${PATROL_LATE_STOP_S} 秒後に止め始めても視程の線までに止まる。F2）`);
  }
  if (!(st.bomb.damage < boat.hullHp)) bad(`${aircraft.id}.strike.bomb.damage（${st.bomb.damage}）は自艇の hull_hp（${boat.hullHp}）未満（1 発では沈まない。F9）`);
  // C9: 2 行目のキーの欄（core/patrol-air-state の PA_KEY_*）に値が収まる
  const fit = (what: string, x: number, max: number): void => {
    if (!(x <= max)) bad(`${what}（${x}）が 2 行目のキーの欄の上限 ${max} を超える（C9）`);
  };
  for (const k of ['first_pass_s', 'sweep_gap_s', 'orbit_s'] as const) fit(`patrol_air.params.${k} の切り上げ`, Math.ceil(q[k]), PA_KEY_SEC_MAX);
  fit('秒読みの最大（(wake_detect_m − lock_m)/v − hud_stop_margin_s の切り上げ）', Math.ceil(passS - q.hud_stop_margin_s), PA_KEY_SEC_MAX);
  fit('patrol.wake_detect_m / 100 の切り上げ', Math.ceil(wake / 100), PA_KEY_DIST_HM_MAX);
  fit('patrol.lock_m / 100 の切り上げ', Math.ceil(lock / 100), PA_KEY_NEAR_HM_MAX);
  fit('patrol_air.params.wake_trigger_s の切り上げ', Math.ceil(q.wake_trigger_s), PA_KEY_WAKE_S_MAX);
  fit('1 回の出撃の爆弾（count × strike.bomb.count）', n * st.bomb.count, PA_KEY_BOMBS_MAX);
  fit('自艇の hull_hp / 5 の切り上げ（失った HP の欄）', Math.ceil(boat.hullHp / 5), PA_KEY_HP5_MAX);
  return {
    planes: n,
    flightMps: v,
    wakeDetectM: wake,
    lockM: lock,
    nearM: near,
    runRadiusM: s.run_radius_m,
    firstPassS: q.first_pass_s,
    wakeTriggerS: q.wake_trigger_s,
    sweepGapS: q.sweep_gap_s,
    orbitS: q.orbit_s,
    leaveS: q.leave_s,
    hudStopMarginS: q.hud_stop_margin_s,
    fromBearingDeg: block.from_bearing_deg,
    passRotateDeg: block.pass_rotate_deg,
    radarPasses: block.radar_passes,
    orbitDegPerS: radToDeg(v / near),
    quietKt: boat.silentMaxKt,
  };
}
