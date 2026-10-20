// 夜明けの空（v0.6.1。docs/02 §6.7）の data の読み出し: missions_seed.json の dawn_air（13 任務すべて）と、遊べる任務の夜明けの空襲の規則
// （v0_1_prototype.dawn_strike・hazards の dawn_air_strike・enemies.json の機体・キャンペーンの enemy_faction・risk_events.json の dawn_air_strike）。
// v0.6.2: 夜明けに敵が退く規則（enemy_ships_at_dawn と v0_1_prototype.dawn_withdraw・駆逐艦／大発の有無）も遊べる任務で検査する。
// mission-data と同じく data を直接読み、game-data の関数は呼ばない（値の循環を作らない）。window を読まない（?debug&nostrike は world-setup の SetupOptions.strikeOff）。
// 壊れた data は任務の id を付けて例外（起動時に分かる）。
import type { GameData } from './game-data';
import type { PrototypeMission } from './mission-data';
import { dawnAirFromData, isDawnAirRecord, type DawnAir } from '../core/dawn-air';
import type { AirStrikeParams } from '../core/air-strike';
import { DAWN_STRIKE_EVENT_ID, airStrikeParamsFromData, dawnStrikeFromData, isDawnStrikeEventRecord, isStrikeAircraftRecord, type DawnStrikeEventRecord, type StrikeAircraftRecord, type StrikeHull } from '../core/air-strike-data';
import { bearingJa } from '../core/briefing';
import { dawnWithdrawFromData, type DawnWithdraw } from '../core/dawn-withdraw';

export type { AirStrikeParams } from '../core/air-strike';

type Rec = Record<string, unknown>;

function missionRec(data: GameData, missionId: string): Rec {
  const m = (data.missionsSeed.missions as readonly Rec[]).find((x) => x['id'] === missionId);
  if (!m) throw new Error(`missions_seed.json に ${missionId} が無い`);
  return m;
}

/** 遊べる世界（v0_1_prototype が object。campaign-data の playableMissionIds・Title の出撃できる任務と同じ判定）。無ければ null */
function protoOf(m: Rec): Rec | null {
  const p = m['v0_1_prototype'];
  return typeof p === 'object' && p !== null && !Array.isArray(p) ? (p as Rec) : null;
}

function readDawnAir(m: Rec, missionId: string): DawnAir {
  const raw = m['dawn_air'];
  if (!isDawnAirRecord(raw)) throw new Error(`missions_seed ${missionId} の dawn_air（control / confidence / play_as / enemy_ships_at_dawn / label_ja / refs / source）が無いか崩れている（13 任務すべてに要る。docs/02 §6.7）`);
  return dawnAirFromData(raw, missionId, protoOf(m) !== null);
}

/** 任務の夜明けの空（13 任務すべてにある）。遊べる任務は checkPlayableDawn の規則も通し、retire の任務は退く先の縁と呼び名（dawn_withdraw.retire_edge・force_ja）を入れる */
export function getDawnAir(data: GameData, missionId: string): DawnAir {
  const m = missionRec(data, missionId);
  const air = readDawnAir(m, missionId);
  const proto = protoOf(m);
  const withdraw = proto ? checkPlayable(data, m, proto, missionId, air) : null;
  return withdraw ? { ...air, retireEdge: withdraw.retireEdge, retireForceJa: withdraw.forceJa } : air;
}

/**
 * 遊べる任務の夜明けの規則（spec §6.6）。例外は任務の id を付ける:
 * - dawn_air.play_as が enemy ⇔ v0_1_prototype.dawn_strike がある ⇔ v0_1_prototype.hazards に dawn_air_strike がある（Briefing の「危険」）
 * - dawn_air_strike は night.optional_hazards に入れない（rollNight は 1 件ごとに乱数を 1 回引くので、夜の配置が v0.6.0 からずれる）
 * - 機体は enemies.json にあって空襲の値（strike）を持ち、faction が任務のキャンペーンの enemy_faction と同じ（写し間違いを止める）
 * - risk_events.json の dawn_air_strike に params がある
 * - 夜明けに敵が退く（v0.6.2）: enemy_ships_at_dawn が retire ⇒ 駆逐艦（enemy_start）の任務で、v0_1_prototype.dawn_withdraw.retire_edge が north・south・east・west。
 *   hide ⇒ 大発の隊（barges）の任務。dawn_withdraw は retire の任務だけ（stay・none・hide には置かない。知らないキーも例外）
 */
export function checkPlayableDawn(data: GameData, missionId: string): void {
  const m = missionRec(data, missionId);
  const proto = protoOf(m);
  if (!proto) throw new Error(`missions_seed ${missionId} は遊べる任務でない（v0_1_prototype が無い）`);
  checkPlayable(data, m, proto, missionId, readDawnAir(m, missionId));
}

/** 遊べる任務の規則を検査し、retire の任務の dawn_withdraw を返す（ほかは null） */
function checkPlayable(data: GameData, m: Rec, proto: Rec, missionId: string, air: DawnAir): DawnWithdraw | null {
  const at = `missions_seed ${missionId}`;
  const withdraw = checkWithdraw(proto, missionId, air);
  const raw = proto['dawn_strike'];
  const block = raw === undefined ? null : dawnStrikeFromData(raw, missionId);
  const enemy = air.playAs === 'enemy';
  if (enemy !== (block !== null)) throw new Error(`${at}: v0_1_prototype.dawn_strike は dawn_air.play_as が enemy の任務だけ（必ず要る）。play_as は ${air.playAs}`);
  const hazards = proto['hazards'];
  const listed = Array.isArray(hazards) && hazards.includes(DAWN_STRIKE_EVENT_ID);
  if (enemy !== listed) throw new Error(`${at}: v0_1_prototype.hazards の ${DAWN_STRIKE_EVENT_ID} は dawn_air.play_as が enemy の任務だけ（必ず要る）。play_as は ${air.playAs}`);
  const night = proto['night'];
  const optional = typeof night === 'object' && night !== null ? (night as Rec)['optional_hazards'] : undefined;
  if (Array.isArray(optional) && optional.includes(DAWN_STRIKE_EVENT_ID)) throw new Error(`${at}: ${DAWN_STRIKE_EVENT_ID} を night.optional_hazards に入れない（夜の揺らぎの乱数がずれる。夜明けの空襲は夜ごとに決めない）`);
  if (!block) return withdraw;
  const plane = getStrikeAircraftRecord(data, block.aircraft_id, missionId);
  const faction = campaignEnemyFaction(data, m, missionId);
  if (plane.faction !== faction) throw new Error(`${at}: 夜明けの空襲の機体 ${plane.id} の faction（${plane.faction}）がキャンペーンの enemy_faction（${faction}）と違う`);
  getDawnStrikeEventRecord(data);
  return withdraw;
}

/** 夜明けに敵が退く規則（v0.6.2。checkPlayable の一部）。retire の任務の dawn_withdraw を返す（ほかは null） */
function checkWithdraw(proto: Rec, missionId: string, air: DawnAir): DawnWithdraw | null {
  const at = `missions_seed ${missionId}`;
  const mode = air.shipsAtDawn;
  const raw = proto['dawn_withdraw'];
  if (mode === 'retire' && proto['enemy_start'] === undefined) throw new Error(`${at}: dawn_air.enemy_ships_at_dawn が retire なのに駆逐艦（v0_1_prototype.enemy_start）が無い（退くのは駆逐艦・輸送船）`);
  if (mode === 'hide' && proto['barges'] === undefined) throw new Error(`${at}: dawn_air.enemy_ships_at_dawn が hide なのに大発の隊（v0_1_prototype.barges）が無い（岸へ隠れるのは大発）`);
  if (mode !== 'retire') {
    if (raw !== undefined) throw new Error(`${at}: v0_1_prototype.dawn_withdraw は dawn_air.enemy_ships_at_dawn が retire の任務だけ（${mode}）`);
    return null;
  }
  if (raw === undefined) throw new Error(`${at}: dawn_air.enemy_ships_at_dawn が retire なのに v0_1_prototype.dawn_withdraw（retire_edge）が無い`);
  return dawnWithdrawFromData(raw, missionId);
}

/** 任務のキャンペーンの enemy_faction（missions_seed の campaigns。夜明けの空襲の機体の faction の検査に使う） */
function campaignEnemyFaction(data: GameData, m: Rec, missionId: string): string {
  const cid = m['campaign'];
  const c = (data.missionsSeed.campaigns as readonly Rec[]).find((x) => x['id'] === cid);
  const f = c?.['enemy_faction'];
  if (typeof f !== 'string' || f === '') throw new Error(`missions_seed の campaigns.${String(cid)}.enemy_faction が無い（${missionId} の夜明けの空襲の機体の検査）`);
  return f;
}

/** enemies.json の空襲の機体（strike を持つ）。無いか形が崩れていれば例外 */
export function getStrikeAircraftRecord(data: GameData, aircraftId: string, missionId: string): StrikeAircraftRecord {
  const e = (data.enemies.enemies as readonly unknown[]).find((x) => (x as Rec)['id'] === aircraftId);
  if (!isStrikeAircraftRecord(e)) throw new Error(`missions_seed ${missionId} の dawn_strike.aircraft_id（${aircraftId}）が enemies.json に無いか、strike（run_speed_kt / release_altitude_m / bomb）が欠けている`);
  return e;
}

/** risk_events.json の dawn_air_strike（params の段階と時間）。無いか形が崩れていれば例外 */
export function getDawnStrikeEventRecord(data: GameData): DawnStrikeEventRecord {
  const e = (data.riskEvents.events as readonly unknown[]).find((x) => (x as Rec)['id'] === DAWN_STRIKE_EVENT_ID);
  if (!isDawnStrikeEventRecord(e)) throw new Error(`risk_events.json の ${DAWN_STRIKE_EVENT_ID} に params（spawn_m / run_radius_m / first_run_s / run_gap_s / wave_rest_s / leave_s / spawn_offsets_deg / wave_rotate_deg / aim_turn_min_deg_s）が無い`);
  return e;
}

/**
 * 夜明けの空襲の値（spec §7.1。core/air-strike-data の airStrikeParamsFromData。§4.1 の検査込み）。任務に dawn_strike が無ければ null
 * （?debug&nostrike は world-setup が null にする）。player・escort は命中の半長・半幅 m（hit_scale 込み）と端の余白 m（world の boundsMarginM・僚艇の
 * boundsMarginM。狙いを任務の bounds に収める）。僚艇のいない任務は escort = null。player の余白を省けるのは空襲の無い任務だけ（空襲のある任務は例外）。
 * 来る方角の 8 方位（HUD・帯の「東から」）は core/briefing の bearingJa。値の例外には任務の id を付ける
 */
export function getAirStrikeParams(
  data: GameData,
  mission: PrototypeMission,
  timeScale: number,
  player: { halfLengthM: number; halfBeamM: number; boundsMarginM?: number },
  escort: StrikeHull | null,
): AirStrikeParams | null {
  const b = mission.dawnStrike;
  if (!b) return null;
  const plane = getStrikeAircraftRecord(data, b.aircraft_id, mission.id);
  const ev = getDawnStrikeEventRecord(data);
  try {
    const hull: StrikeHull = { halfLengthM: player.halfLengthM, halfBeamM: player.halfBeamM, boundsMarginM: player.boundsMarginM ?? NaN };
    return airStrikeParamsFromData(plane, ev, b, timeScale, hull, escort, mission.bounds, bearingJa(b.from_bearing_deg));
  } catch (e) {
    throw new Error(`missions_seed ${mission.id}: ${(e as Error).message}`);
  }
}
