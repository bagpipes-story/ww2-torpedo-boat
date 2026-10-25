// 夜の哨戒機（v0.6.7。日本ハードモード⑥・jp_02「孤島の哨戒」。docs/02 §6.8、spec-v067 §B.5・§C.7）の任務の読み出し: 任務の v0_1_prototype.patrol_air があれば、
// enemies.json の機体・risk_events.json の patrol_air・自艇（boats.json）・月の視程から、門番の値（PatrolParams）と夜の出撃の値（AirStrikeParams。夜明けの空襲の core の形）を組む。
// 形と値の検査は core/patrol-air-data（C1・C3〜C5・C7・C9）。他の記録を跨ぐ検査はここ: C2（機体が strike と patrol 付きで在り faction がキャンペーンの enemy_faction・
// dawn_strike と同じ機体）・C3（enemies の数と id）・C6（置き場）・C8（夜の出撃の値を airStrikeParamsFromData の今の検査で）。
// PrototypeMission に鍵は足さない（block は生の proto から読む。engine-mission-data と同じ作法）。world-setup が組み立てのたびに（patrolAirSetupPart）、Boot が遊べる任務ごとに 1 回（検査）呼ぶ。
import { getPrototypeMission, getVisibilityParams, type GameData } from './game-data';
import type { AirStrikeParams } from '../core/air-strike';
import { airStrikeParamsFromData } from '../core/air-strike-data';
import { isBoatDataRecord } from '../core/boat-motion';
import { bearingJa } from '../core/briefing';
import { PATROL_AIR_EVENT_ID, isPatrolAircraftRecord, patrolAirBlockFromData, patrolAirEventFromData, patrolAirParamsFromData } from '../core/patrol-air-data';
import type { PatrolParams } from '../core/patrol-air-state';

export type { PatrolParams } from '../core/patrol-air-state';

/** 夜の哨戒機の世界の値（WorldSetup.patrolAir）: 門番（core/patrol-air）と、発見のたびに 1 波だけ再出撃する夜の出撃（空襲の core。2 機 × 2 発） */
export interface PatrolAirSetup {
  gate: PatrolParams;
  sortie: AirStrikeParams;
}

/** 夜の哨戒機の任務と同居しない v0_1_prototype の鍵（C6。艦艇・水上機・味方機・暴風。暴風の帯の中は見えない規則を足すと問いがぼける＝候補） */
export const PATROL_AIR_EXCLUSIVE_KEYS = ['enemy_start', 'barges', 'pt_boats', 'convoy', 'escort', 'transport', 'shore_battery', 'enemy_aircraft', 'friendly_aircraft', 'storm'] as const;

type Rec = Record<string, unknown>;

/** 任務の夜の哨戒機の値。v0_1_prototype.patrol_air の無い任務は null。data が壊れている・同居できない任務なら「<任務>.v0_1_prototype.patrol_air: …」の例外（夜の出撃の値は「<任務> の夜の哨戒（…sortie）: …」） */
export function getPatrolAirParams(data: GameData, missionId: string): PatrolAirSetup | null {
  const mission = getPrototypeMission(data, missionId);
  const m = (data.missionsSeed.missions as readonly Rec[]).find((x) => x['id'] === missionId)!;
  const proto = m['v0_1_prototype'] as Rec;
  const raw = proto['patrol_air'];
  if (raw === undefined) return null;
  const label = `${missionId}.v0_1_prototype.patrol_air`;
  const bad = (msg: string): never => {
    throw new Error(`${label}: ${msg}（docs/02 §6.8）`);
  };
  const block = patrolAirBlockFromData(raw, label);
  // C6 置き場: 航空機だけの任務（撃つ相手がいない）。危険に patrol_air・夜ごとに決めない・敵の制空下で夜明けの空襲がある
  for (const k of PATROL_AIR_EXCLUSIVE_KEYS) if (proto[k] !== undefined) bad(`v0_1_prototype.${k} と同居しない（航空機だけの任務）`);
  if (mission.mainWeapon !== 'none') bad(`main_weapon は none（撃つ相手がいない。${mission.mainWeapon}）`);
  if (!mission.hazards.includes(PATROL_AIR_EVENT_ID)) bad(`v0_1_prototype.hazards に ${PATROL_AIR_EVENT_ID} が要る（Briefing の「危険」）`);
  if (mission.night?.optionalHazards.includes(PATROL_AIR_EVENT_ID)) bad(`${PATROL_AIR_EVENT_ID} を night.optional_hazards に入れない（夜ごとに決めない）`);
  if ((m['dawn_air'] as Rec | undefined)?.['play_as'] !== 'enemy' || !mission.dawnStrike) bad('dawn_air.play_as が enemy で v0_1_prototype.dawn_strike（夜明けの空襲）のある任務だけ（敵の制空下）');
  // C2 機体: enemies.json に strike と patrol 付きで在り、faction がキャンペーンの enemy_faction、夜明けの空襲と同じ機体
  const plane = (data.enemies.enemies as readonly unknown[]).find((e) => (e as Rec)['id'] === block.aircraft_id);
  if (!isPatrolAircraftRecord(plane)) return bad(`aircraft_id（${block.aircraft_id}）が enemies.json に strike（run_speed_kt / release_altitude_m / bomb）と patrol（wake_detect_m / lock_m）付きで無い`);
  const camp = (data.missionsSeed.campaigns as readonly Rec[]).find((c) => c['id'] === m['campaign']);
  if (plane.faction !== camp?.['enemy_faction']) bad(`機体 ${plane.id} の faction（${plane.faction}）がキャンペーン ${String(m['campaign'])} の enemy_faction（${String(camp?.['enemy_faction'])}）と違う`);
  if (block.aircraft_id !== mission.dawnStrike!.aircraft_id) bad(`aircraft_id（${block.aircraft_id}）は dawn_strike.aircraft_id（${mission.dawnStrike!.aircraft_id}）と同じ（夜の機と夜明けの機は同じ機体）`);
  // C3 enemies: aircraft_id を count 個（Briefing の「×N」）
  const ids = proto['enemies'] as unknown[];
  if (ids.length !== block.count || !ids.every((e) => e === block.aircraft_id)) bad(`v0_1_prototype.enemies（${ids.join('・')}）は aircraft_id（${block.aircraft_id}）を count（${block.count}）個`);
  const ev = patrolAirEventFromData((data.riskEvents.events as readonly unknown[]).find((e) => (e as Rec)['id'] === PATROL_AIR_EVENT_ID), label);
  const rec = (data.boats.boats as readonly unknown[]).find((b) => (b as Rec)['id'] === mission.playerBoatId);
  if (!isBoatDataRecord(rec)) return bad(`boats.json の自艇 ${mission.playerBoatId} に運動の値（speed_* / speed_bands_kt / accel・decel・turn / length・beam）が無い`);
  const hp = (rec as unknown as Rec)['hull_hp'];
  if (typeof hp !== 'number' || !(hp > 0)) return bad(`boats.json の自艇 ${mission.playerBoatId}.hull_hp（正の数）が無い`);
  const w = data.hitRateModel.world;
  const boat = { speedMaxKt: rec.speed_max_kt, silentMaxKt: rec.speed_bands_kt.silent_max, stopMaxKt: rec.speed_bands_kt.stop_max, decelMps2: rec.decel_mps2, hullHp: hp };
  // 見える距離は自艇の視程（月から）。史実モードの見つかる倍率は読まない（spec §I.1）
  const gate = patrolAirParamsFromData(plane, ev, block, boat, getVisibilityParams(data, mission.moon, false), w.time_scale, label);
  // C8 夜の出撃: 夜明けの空襲の core の値の形（1 波だけ。次の波は systems が出させない）。今の検査（投下の間隔・最初の進路・機数 × 間隔・休み）をそのまま通す
  const hull = { halfLengthM: (rec.length_m * w.hit_scale) / 2, halfBeamM: (rec.beam_m * w.hit_scale) / 2, boundsMarginM: (rec.length_m * w.sprite_scale) / 2 };
  const sortieBlock = { aircraft_id: block.aircraft_id, count: block.count, count_source: block.count_source, from_bearing_deg: block.from_bearing_deg, escort_target_planes: [], source: block.source };
  try {
    return { gate, sortie: airStrikeParamsFromData(plane, { id: PATROL_AIR_EVENT_ID, params: ev.params.sortie }, sortieBlock, w.time_scale, hull, null, mission.bounds, bearingJa(block.from_bearing_deg)) };
  } catch (e) {
    throw new Error(`${missionId} の夜の哨戒（risk_events.json の ${PATROL_AIR_EVENT_ID}.params.sortie）: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** 組み立ての上書き（systems/world-setup の SetupOptions の 1 鍵）: patrolOff は夜の哨戒機を切る（?debug&nopatrol。夜明けの 4 機は残る） */
export interface PatrolAirSetupOptions {
  patrolOff?: boolean;
}

/** WorldSetup に展開する部分: 夜の哨戒機の無い任務・patrolOff の夜は {}（patrolAir の鍵ごと出ない＝他の任務の setup の snapshot が変わらない） */
export function patrolAirSetupPart(data: GameData, missionId: string, o: PatrolAirSetupOptions): { patrolAir?: PatrolAirSetup } {
  const p = o.patrolOff ? null : getPatrolAirParams(data, missionId);
  return p ? { patrolAir: p } : {};
}
