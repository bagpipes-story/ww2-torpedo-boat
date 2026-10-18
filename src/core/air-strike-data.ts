// 夜明けの空襲（v0.6.1。docs/02 §6.8）の data の検査: enemies.json の空襲の機体（strike）、risk_events.json の dawn_air_strike.params、
// missions_seed.json の v0_1_prototype.dawn_strike。Phaser 非依存。起動時に 1 回だけ呼ぶ（壊れていれば例外＝起動時に分かる）。
// 値の範囲と段階の時間の検査（機数 ≤ 4・落下 < 投下の間隔ほか。spec §4.1）は空襲の値を組むとき（airStrikeParamsFromData）。
// 夜の水上機（seaplane-data）の航跡の速力の検査はしない（T-38 で例外になるため。昼は航跡でなく目で見つける）。
import { AIR_STRIKE_MAX_PLANES, type AirStrikeParams } from './air-strike-state';
import { GRAVITY_MPS2, ktToMps, radToDeg } from './units';

/** risk_events.json の夜明けの空襲の id（任務の v0_1_prototype.hazards にも入る。night.optional_hazards には入れない） */
export const DAWN_STRIKE_EVENT_ID = 'dawn_air_strike';

/** enemies.json の空襲の機体（ijn_f1m2_pete・us_carrier_aircraft）。照明弾・発見の値は持たない（昼は常に見えている） */
export interface StrikeAircraftRecord {
  id: string;
  faction: string;
  name_ja: string;
  strike: {
    run_speed_kt: number;
    release_altitude_m: number;
    bomb: {
      count: number;
      damage: number;
      blast_radius_m: number;
      accuracy_cep_m: number;
      fire_chance: number;
      engine_damage_chance: number;
    };
  };
}

/** risk_events.json の dawn_air_strike（段階と時間。機体の値は enemies.json） */
export interface DawnStrikeEventRecord {
  id: string;
  params: {
    spawn_m: number;
    run_radius_m: number;
    first_run_s: number;
    run_gap_s: number;
    wave_rest_s: number;
    leave_s: number;
    spawn_offsets_deg: number[];
    wave_rotate_deg: number;
    aim_turn_min_deg_s: number;
  };
}

/** missions_seed.json の v0_1_prototype.dawn_strike（dawn_air.play_as が enemy の遊べる任務だけ。config/dawn-data が検査） */
export interface DawnStrikeBlock {
  /** enemies.json の空襲の機体の id */
  aircraft_id: string;
  count: number;
  count_source: string;
  /** 来る方角（北 0・時計回り） */
  from_bearing_deg: number;
  /** 僚艇（要人）が浮いている間は僚艇を狙う機の番号（0 始まり。僚艇のいない任務は []） */
  escort_target_planes: number[];
  source: string;
}

const DAWN_STRIKE_KEYS: readonly string[] = ['aircraft_id', 'count', 'count_source', 'from_bearing_deg', 'escort_target_planes', 'source'];

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function hasNums(v: unknown, keys: readonly string[]): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return keys.every((k) => isFiniteNum(r[k]));
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 形だけの検査（文字列の id・faction・name_ja と strike の数値） */
export function isStrikeAircraftRecord(v: unknown): v is StrikeAircraftRecord {
  if (!isObj(v)) return false;
  if (typeof v['id'] !== 'string' || typeof v['faction'] !== 'string' || typeof v['name_ja'] !== 'string') return false;
  const s = v['strike'];
  if (!isObj(s) || !hasNums(s, ['run_speed_kt', 'release_altitude_m'])) return false;
  return hasNums(s['bomb'], ['count', 'damage', 'blast_radius_m', 'accuracy_cep_m', 'fire_chance', 'engine_damage_chance']);
}

/** 形だけの検査（params の数値と spawn_offsets_deg の数の配列） */
export function isDawnStrikeEventRecord(v: unknown): v is DawnStrikeEventRecord {
  if (!isObj(v) || v['id'] !== DAWN_STRIKE_EVENT_ID) return false;
  const p = v['params'];
  if (!hasNums(p, ['spawn_m', 'run_radius_m', 'first_run_s', 'run_gap_s', 'wave_rest_s', 'leave_s', 'wave_rotate_deg', 'aim_turn_min_deg_s'])) return false;
  const offs = (p as Record<string, unknown>)['spawn_offsets_deg'];
  return Array.isArray(offs) && offs.every(isFiniteNum);
}

/** 形だけの検査（知らないキーは dawnStrikeFromData が任務の id を付けて例外） */
export function isDawnStrikeBlock(v: unknown): v is DawnStrikeBlock {
  if (!isObj(v)) return false;
  if (typeof v['aircraft_id'] !== 'string' || typeof v['count_source'] !== 'string' || typeof v['source'] !== 'string') return false;
  if (!isFiniteNum(v['count']) || !isFiniteNum(v['from_bearing_deg'])) return false;
  const e = v['escort_target_planes'];
  return Array.isArray(e) && e.every(isFiniteNum);
}

/**
 * dawn_strike を読む（spec §6.2・§6.6）。例外は任務の id を付ける: 形の崩れ、知らないキー、空の aircraft_id、count が 1 以上の整数でない、
 * escort_target_planes が 0 以上の整数でない。機体の有無・faction・危険の id との一致は config/dawn-data の checkPlayableDawn
 */
export function dawnStrikeFromData(raw: unknown, missionId: string): DawnStrikeBlock {
  const at = `missions_seed ${missionId} の v0_1_prototype.dawn_strike`;
  if (!isDawnStrikeBlock(raw)) throw new Error(`${at}（aircraft_id / count / count_source / from_bearing_deg / escort_target_planes / source）が欠けている`);
  for (const k of Object.keys(raw)) if (!DAWN_STRIKE_KEYS.includes(k)) throw new Error(`${at} に知らないキー ${k}`);
  if (raw.aircraft_id.trim() === '') throw new Error(`${at}.aircraft_id が空`);
  if (!Number.isInteger(raw.count) || raw.count < 1) throw new Error(`${at}.count は 1 以上の整数（${raw.count}）`);
  if (!raw.escort_target_planes.every((i) => Number.isInteger(i) && i >= 0)) throw new Error(`${at}.escort_target_planes は 0 始まりの機の番号（整数）の配列`);
  return {
    aircraft_id: raw.aircraft_id,
    count: raw.count,
    count_source: raw.count_source,
    from_bearing_deg: raw.from_bearing_deg,
    escort_target_planes: raw.escort_target_planes.slice(),
    source: raw.source,
  };
}

/**
 * 空襲の値を組む（spec §4.1。起動時に 1 回）。例外: 機数が 1〜4 でない、方角のずれが機数より少ない、僚艇を狙う機の番号が範囲外・重複・
 * 僚艇のいない任務で空でない、速度・高度が正でない、爆弾が 1 発未満、CEP が負、火災・機関が 0〜1 の外、
 * 投下の間隔が落下以下（空中の爆弾は常に 1 発）、最初の進路までに旋回に着けない、機が旋回に戻る前に次の順番が来る（機数 × 間隔 < 2 × 進路）、
 * 次の波の前に全機が去れない（wave_rest_s < 進路 + leave_s）。夜の水上機の航跡の速力の検査はしない（T-38 で例外になるため）
 */
export function airStrikeParamsFromData(
  aircraft: StrikeAircraftRecord,
  event: DawnStrikeEventRecord,
  block: DawnStrikeBlock,
  timeScale: number,
  player: { halfLengthM: number; halfBeamM: number },
  escort: { halfLengthM: number; halfBeamM: number } | null,
  fromJa: string,
): AirStrikeParams {
  const q = event.params;
  const st = aircraft.strike;
  const bomb = st.bomb;
  const n = block.count;
  const bad = (msg: string): never => {
    throw new Error(`夜明けの空襲（enemies.json の ${aircraft.id}.strike / risk_events.json の ${DAWN_STRIKE_EVENT_ID}.params / dawn_strike）: ${msg}（docs/02 §6.8）`);
  };
  if (!Number.isInteger(n) || n < 1 || n > AIR_STRIKE_MAX_PLANES) bad(`count は 1〜${AIR_STRIKE_MAX_PLANES} の整数（${n}）`);
  if (q.spawn_offsets_deg.length < n) bad(`spawn_offsets_deg（${q.spawn_offsets_deg.length} 個）は count（${n}）以上`);
  const esc = block.escort_target_planes;
  for (let k = 0; k < esc.length; k++) {
    const i = esc[k]!;
    if (!Number.isInteger(i) || i < 0 || i >= n) bad(`escort_target_planes の ${i} は 0〜${n - 1} の機の番号`);
    if (esc.indexOf(i) !== k) bad(`escort_target_planes の ${i} が重複`);
  }
  if (esc.length > 0 && !escort) bad('escort_target_planes は僚艇（escort）のいる任務だけ（僚艇のいない任務は []）');
  if (!(st.run_speed_kt > 0) || !(st.release_altitude_m > 0)) bad('run_speed_kt / release_altitude_m は正');
  if (!Number.isInteger(bomb.count) || bomb.count < 1) bad('bomb.count は 1 以上の整数');
  if (!(bomb.damage >= 0) || !(bomb.blast_radius_m >= 0) || !(bomb.accuracy_cep_m >= 0)) bad('bomb.damage / blast_radius_m / accuracy_cep_m は 0 以上');
  if (!(bomb.fire_chance >= 0 && bomb.fire_chance <= 1) || !(bomb.engine_damage_chance >= 0 && bomb.engine_damage_chance <= 1)) bad('bomb.fire_chance / engine_damage_chance は 0〜1');
  if (!(q.run_radius_m > 0) || !(q.spawn_m > q.run_radius_m)) bad('0 < run_radius_m < spawn_m');
  if (!(q.first_run_s >= 0) || !(q.run_gap_s > 0) || !(q.wave_rest_s >= 0) || !(q.leave_s > 0) || !(q.aim_turn_min_deg_s >= 0)) bad('first_run_s / wave_rest_s / aim_turn_min_deg_s は 0 以上、run_gap_s / leave_s は正');
  if (!(timeScale > 0) || !(player.halfLengthM > 0) || !(player.halfBeamM >= 0)) throw new Error('夜明けの空襲: time_scale と艇の寸法が不正');
  if (escort && (!(escort.halfLengthM > 0) || !(escort.halfBeamM >= 0))) throw new Error('夜明けの空襲: 僚艇の寸法が不正');
  const v = ktToMps(st.run_speed_kt) * timeScale;
  const runS = q.run_radius_m / v;
  const fallGameS = Math.sqrt((2 * st.release_altitude_m) / GRAVITY_MPS2);
  const fallFeelS = fallGameS / timeScale;
  const f3 = (x: number): string => x.toFixed(3);
  if (!(q.run_gap_s > fallFeelS)) bad(`run_gap_s（${q.run_gap_s}）は落下の体感秒（${f3(fallFeelS)}）より長く（空中の爆弾は常に 1 発）`);
  if (!((q.spawn_m - q.run_radius_m) / v <= q.first_run_s)) bad(`first_run_s（${q.first_run_s}）は旋回に着くまでの秒（${f3((q.spawn_m - q.run_radius_m) / v)}）以上`);
  if (!(n * q.run_gap_s >= 2 * runS)) bad(`count × run_gap_s（${f3(n * q.run_gap_s)}）は爆撃進路の 2 倍（${f3(2 * runS)}）以上（機が旋回に戻ってから次の順番）`);
  if (!(q.wave_rest_s >= runS + q.leave_s)) bad(`wave_rest_s（${q.wave_rest_s}）は爆撃進路 + leave_s（${f3(runS + q.leave_s)}）以上（全機が去ってから次の波）`);
  const escortPlanes: boolean[] = [];
  for (let i = 0; i < n; i++) escortPlanes.push(esc.includes(i));
  return {
    planes: n,
    bombsPerPlane: bomb.count,
    flightMps: v,
    runRadiusM: q.run_radius_m,
    orbitDegPerS: radToDeg(v / q.run_radius_m),
    runS,
    spawnM: q.spawn_m,
    fromBearingDeg: block.from_bearing_deg,
    spawnOffsetsDeg: q.spawn_offsets_deg.slice(),
    waveRotateDeg: q.wave_rotate_deg,
    firstRunS: q.first_run_s,
    runGapS: q.run_gap_s,
    waveRestS: q.wave_rest_s,
    leaveS: q.leave_s,
    fallFeelS,
    fallGameS,
    scatterM: bomb.accuracy_cep_m * Math.SQRT2,
    aimTurnMinDegS: q.aim_turn_min_deg_s,
    timeScale,
    bombHit: { damage: bomb.damage, fireChance: bomb.fire_chance, engineDamageChance: bomb.engine_damage_chance },
    playerHalfLengthM: player.halfLengthM,
    playerHitRadiusM: player.halfBeamM + bomb.blast_radius_m,
    escortHalfLengthM: escort ? escort.halfLengthM : 0,
    escortHitRadiusM: escort ? escort.halfBeamM + bomb.blast_radius_m : 0,
    escortPlanes,
    poolSize: Math.ceil(fallFeelS / q.run_gap_s) + 1,
    nameJa: aircraft.name_ja,
    fromJa,
  };
}
