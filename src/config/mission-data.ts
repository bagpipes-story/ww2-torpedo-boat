// 任務の種（data/missions_seed.json）の読み出し（v0.4.0 で game-data.ts から切り出し。切り出した中身は v0.3.5 のまま、v0.4.0 で hazards を足した）。
// 型は実行時に検査する（data 駆動なので壊れていれば起動時に分かる）。Briefing の文の読み出しは v0.6.3 から config/briefing-data.ts、難易度ハード（hard）の読み出しと isNum・readStart は v0.6.4 から config/mission-hard-data.ts。
import type { GameData } from './game-data';
import { isNum, readHardBlock, readStart } from './mission-hard-data';
import { isReturnPointDataRecord, returnPointFromData, type ReturnPoint } from '../core/mission-flow';
import { isShallowRectDataRecord, shallowsFromData, type ShallowRect } from '../core/shallows';
import { isStormMissionBlock, type StormMissionBlock } from '../core/storm';
import { isBargeMissionBlock, type BargeMissionBlock } from '../core/barge-data';
import { isPtMissionBlock, type PtMissionBlock } from '../core/pt-data';
import { isEscortMissionBlock, type EscortMissionBlock } from '../core/escort';
import { CONVOY_BARGE_ID, isConvoyMissionBlock, type ConvoyMissionBlock } from '../core/convoy-data';
import { dawnStrikeFromData, type DawnStrikeBlock } from '../core/air-strike-data';
import { isNightDataRecord, nightFromData, type NightBlock } from '../core/night';
import { isMoonPhase, type MoonPhase } from '../core/visibility';

/** ミッションの種から v0.1 プロトタイプ用の設定を取り出す（型は実行時に検査する: data 駆動なので壊れていれば起動時に分かる） */
export interface PrototypeMission {
  id: string;
  /** 任務の種類（scoring.json の objective_by_type のキー） */
  type: string;
  playerBoatId: string;
  torpedoId: string;
  enemyId: string;
  /** 遊べる世界の敵の数（v0.4.2。大発の隻数） */
  enemyCount: number;
  bounds: { width: number; height: number };
  playerStart: { x: number; y: number; headingDeg: number };
  /** 駆逐艦の出発点（us_02）。大発の隊（barges）・米PT の隊・夜の哨戒機（v0.6.7）の任務では null。enemyStarts は全隻（ハードなら hard.extra_enemy_starts を足す。v0.4.5） */
  enemyStart: { x: number; y: number; headingDeg: number } | null;
  enemyStarts: { x: number; y: number; headingDeg: number }[];
  /** 難易度ハードで読んだ（v0.4.5。敵の数が増える。hard block の無い任務ではノーマルと同じ） */
  hard: boolean;
  /** 撃沈の達成に要る駆逐艦の隻数（v0.6.0。hard.objective_sink_count。無ければ全隻＝null） */
  objectiveSinkCount: number | null;
  /** 主兵装（v0.4.2）: torpedo（右下が魚雷）か guns（右下が射撃。boats.json の gun_battery。v0.6.3 実機 1 回目から米PT の jp_05 も T-14 の 13mm）か none（v0.6.3。撃たない。米PT の任務と、v0.6.7 から夜の哨戒機の任務（jp_02）だけ） */
  mainWeapon: MainWeapon;
  /** 大発の隊（v0.4.2。core/barge-data）と岸（見た目と逃げる向き）。無ければ null */
  barges: BargeMissionBlock | null;
  ptBoats: PtMissionBlock | null; // 米PT の隊（v0.6.3。core/pt-data・config/pt-mission-data）。無ければ null。enemy_start・barges と一緒に置けない
  convoy: ConvoyMissionBlock | null; // 味方の大発の輸送隊（v0.6.4。core/convoy-data・config/convoy-mission-data）。無ければ null。米PT の隊（pt_boats）の任務だけ。隻数は allies の大発の数
  coast: CoastBlock | null;
  /** 沿岸砲（v0.4.3。岸沿いの位置 m。無ければ null。岸（coast）が要る）。shoreBatteryXs は全門（ハードなら hard.extra_shore_battery_x_m を足す。v0.4.5） */
  shoreBattery: { xM: number } | null;
  shoreBatteryXs: number[];
  /** 僚艇（v0.4.4。要人脱出。core/escort）。無ければ null。駆逐艦（enemy_start）の任務だけ */
  escort: EscortMissionBlock | null;
  durationS: number;
  /** プロトタイプ用の沈没本数の上書き。無ければ enemies.json の torpedo_hits_to_sink */
  enemyHitsToSink: number | null;
  /** 月齢（ミッション本体の moon。視界係数に使う。docs/02 §6.5） */
  moon: MoonPhase;
  /** 帰投地点の輪（docs/02 §6.7、v0.3.0）。出発点は輪の外 */
  returnPoint: ReturnPoint;
  /** 戦闘に使える燃料の割当 gal（満タンではない。docs/02 §6.7） */
  fuelAllotmentGal: number;
  /** 浅瀬の矩形（docs/02 §6.8、v0.3.2）。無ければ空 */
  shallows: ShallowRect[];
  /** 味方機（友軍誤射。docs/02 §6.8、v0.3.3）: 輪の縁からこの距離以内で開始条件を数える。無ければ来ない */
  friendlyAircraft: { triggerEdgeM: number } | null;
  /** 暴風の帯（docs/02 §6.8、v0.3.4）: 海況・帯の幅・速さ・始まりの範囲。無ければ帯は無い */
  storm: StormMissionBlock | null;
  /** 遊べる世界で実際に起きる危険（risk_events の id、出会う順。docs/02 §6.8、v0.4.0）。Briefing の「危険」と出撃前の港内空襲の有無を決める。無ければ [] */
  hazards: string[];
  /** 敵の水上機（docs/02 §6.8、v0.4.1）: enemies.json の機体 id。無ければ来ない */
  enemyAircraft: { enemyId: string } | null;
  /** 夜の揺らぎ（docs/02 §6.8、v0.4.6。core/night）。無ければ毎回同じ夜 */
  night: NightBlock | null;
  /** 輸送船（docs/02 §6.4、v0.4.7）: enemies.json の id と出発点。駆逐艦の任務だけ。無ければ null */
  transport: { enemyId: string; start: { x: number; y: number; headingDeg: number } } | null;
  dawnStrike: DawnStrikeBlock | null; // 夜明けの空襲（v0.6.1。dawn_air.play_as が enemy の任務だけ。規則は config/dawn-data）。無ければ null
}

export type MainWeapon = 'torpedo' | 'guns' | 'none';

/** 岸（v0.4.2）: 海域の south の縁が浜で、その外に陸を landM の幅で描く（見た目だけ）。v0.4.2 は south だけ */
export interface CoastBlock {
  side: 'south';
  landM: number;
  label: string;
}

/** isNum は v0.6.4 から config/mission-hard-data（game-data が import する。今までの import のための再 export） */
export { isNum } from './mission-hard-data';

export function getPrototypeMission(data: GameData, missionId: string, hard: boolean = false): PrototypeMission {
  const m = data.missionsSeed.missions.find((x) => x.id === missionId) as Record<string, unknown> | undefined;
  if (!m) throw new Error(`missions_seed.json に ${missionId} が無い`);
  const proto = m['v0_1_prototype'] as Record<string, unknown> | undefined;
  if (!proto) throw new Error(`${missionId}.v0_1_prototype が無い`);
  const bounds = proto['bounds_m'] as Record<string, unknown> | undefined;
  if (!bounds || !isNum(bounds['width']) || !isNum(bounds['height'])) {
    throw new Error(`${missionId}.v0_1_prototype.bounds_m が無い（docs/02 §6.1）`);
  }
  if (!isNum(proto['duration_s'])) throw new Error(`${missionId}.v0_1_prototype.duration_s が無い`);
  const enemies = proto['enemies'];
  const enemyId = Array.isArray(enemies) ? enemies[0] : undefined;
  if (typeof enemyId !== 'string') throw new Error(`${missionId}.v0_1_prototype.enemies が空`);
  const playerBoatId = m['player_boat'];
  if (typeof playerBoatId !== 'string') throw new Error(`${missionId}.player_boat が無い`);
  const type = m['type'];
  if (typeof type !== 'string') throw new Error(`${missionId}.type が無い`);
  const torpedoId = m['torpedo_type'];
  if (typeof torpedoId !== 'string') throw new Error(`${missionId}.torpedo_type が無い`);
  const moon = m['moon'];
  if (!isMoonPhase(moon)) throw new Error(`${missionId}.moon が dark/half/full のどれでもない（${String(moon)}。昼は v0.6 で扱う）`);
  const b = { width: bounds['width'], height: bounds['height'] };
  const playerStart = readStart(proto['player_start'], `${missionId}.v0_1_prototype.player_start`);
  const rp = proto['return_point'];
  if (!isReturnPointDataRecord(rp)) throw new Error(`${missionId}.v0_1_prototype.return_point（x_m/y_m/radius_m/call_margin/torpedo_settle_max_s/torpedo_end_settle_s）が無い（docs/02 §6.7）`);
  const returnPoint = returnPointFromData(rp, b);
  const sdx = playerStart.x - returnPoint.x;
  const sdy = playerStart.y - returnPoint.y;
  if (sdx * sdx + sdy * sdy <= returnPoint.radiusM * returnPoint.radiusM) throw new Error(`${missionId}: 出発点が帰投地点の輪の中にある`);
  const fuelAllotmentGal = proto['fuel_allotment_gal'];
  if (!isNum(fuelAllotmentGal) || !(fuelAllotmentGal > 0)) throw new Error(`${missionId}.v0_1_prototype.fuel_allotment_gal は正の数（docs/02 §6.7）`);
  const shallowsRaw = proto['shallows'];
  if (!Array.isArray(shallowsRaw) || !shallowsRaw.every(isShallowRectDataRecord)) throw new Error(`${missionId}.v0_1_prototype.shallows（x_m/y_m/width_m/height_m の配列。無ければ []）が無い（docs/02 §6.8）`);
  const shallows = shallowsFromData(shallowsRaw, b);
  const faRaw = proto['friendly_aircraft'] as Record<string, unknown> | undefined;
  let friendlyAircraft: { triggerEdgeM: number } | null = null;
  if (faRaw !== undefined) {
    const t = faRaw?.['trigger_edge_m'];
    if (!isNum(t) || !(t > 0)) throw new Error(`${missionId}.v0_1_prototype.friendly_aircraft.trigger_edge_m は正の数（docs/02 §6.8）`);
    // 出発点は開始の範囲（輪の中心から trigger_edge_m + 半径）の外（出発直後に味方機が来ないように）
    const zone = t + returnPoint.radiusM;
    if (sdx * sdx + sdy * sdy <= zone * zone) throw new Error(`${missionId}: 出発点が味方機の開始距離（friendly_aircraft.trigger_edge_m）の内側にある`);
    friendlyAircraft = { triggerEdgeM: t };
  }
  const stormRaw = proto['storm'];
  let storm: StormMissionBlock | null = null;
  if (stormRaw !== undefined) {
    if (!isStormMissionBlock(stormRaw)) throw new Error(`${missionId}.v0_1_prototype.storm（sea_state/depth_m/drift_kt/start_south_y_min_m/start_south_y_max_m）が欠けている（docs/02 §6.8）`);
    storm = stormRaw;
  }
  const eaRaw = proto['enemy_aircraft'] as Record<string, unknown> | undefined;
  let enemyAircraft: { enemyId: string } | null = null;
  if (eaRaw !== undefined) {
    const id = eaRaw?.['enemy_id'];
    if (typeof id !== 'string' || id.length === 0) throw new Error(`${missionId}.v0_1_prototype.enemy_aircraft.enemy_id（enemies.json の水上機の id）が無い（docs/02 §6.8）`);
    enemyAircraft = { enemyId: id };
  }
  // 駆逐艦（enemy_start）か大発の隊（barges）のどちらか一方。大発には魚雷が当たらない（torpedo_immune）ので主兵装は砲（v0.4.2）。米PT の隊（pt_boats。v0.6.3）はどちらとも置けず、主兵装は guns か none（魚雷は PT の下を抜ける。v0.6.3 実機 1 回目から jp_05 は guns）
  const bargesRaw = proto['barges'];
  if (bargesRaw !== undefined && !isBargeMissionBlock(bargesRaw)) throw new Error(`${missionId}.v0_1_prototype.barges（lead_start / offsets_m / beach_margin_m / kill_quota）が欠けている（docs/02 §6.4）`);
  const barges = bargesRaw === undefined ? null : bargesRaw;
  const ptRaw = proto['pt_boats'];
  if (ptRaw !== undefined && !isPtMissionBlock(ptRaw)) throw new Error(`${missionId}.v0_1_prototype.pt_boats（legs_m / start_along_m / leave_heading_deg / source）が欠けている（docs/02 §6.4）`);
  const ptBoats = ptRaw === undefined ? null : ptRaw;
  if (ptBoats && (proto['enemy_start'] !== undefined || barges)) throw new Error(`${missionId}.v0_1_prototype: pt_boats（米PT）は enemy_start・barges と一緒に置けない（v0.6.3）`);
  // 夜の哨戒機（v0.6.7。jp_02）: 艦艇のいない航空機だけの任務。block の中身と他の置き場の検査は config/patrol-air-mission-data（Boot と world-setup が組むたびに）
  const patrolAir = proto['patrol_air'] !== undefined;
  if (patrolAir && (proto['enemy_start'] !== undefined || barges || ptBoats)) throw new Error(`${missionId}.v0_1_prototype: patrol_air（夜の哨戒機）は enemy_start・barges・pt_boats と一緒に置けない（航空機だけの任務。v0.6.7）`);
  if (!ptBoats && !patrolAir && (proto['enemy_start'] === undefined) === (barges === null)) throw new Error(`${missionId}.v0_1_prototype は enemy_start（駆逐艦）か barges（大発の隊）のどちらか一方を持つ（米PT の隊（pt_boats）か夜の哨戒機（patrol_air）の任務はどちらも持たない）`);
  const mainWeapon = proto['main_weapon'] ?? 'torpedo';
  if (mainWeapon !== 'torpedo' && mainWeapon !== 'guns' && mainWeapon !== 'none') throw new Error(`${missionId}.v0_1_prototype.main_weapon は torpedo・guns・none のどれか`);
  const ids = enemies as unknown[];
  if ((barges || ptBoats) && !ids.every((e) => e === enemyId)) throw new Error(`${missionId}.v0_1_prototype.enemies: 大発の隊・米PT の隊は同じ id だけ`);
  const immune = ids.some((e) => (data.enemies.enemies as readonly Record<string, unknown>[]).find((x) => x['id'] === e)?.['torpedo_immune'] === true);
  if (immune && mainWeapon === 'torpedo') throw new Error(`${missionId}: 魚雷が当たらない敵（enemies.json の torpedo_immune）がいるので main_weapon は guns か none`);
  if (barges && mainWeapon !== 'guns') throw new Error(`${missionId}: 大発の隊（barges）の任務の main_weapon は guns`);
  if (mainWeapon === 'none' && ptBoats === null && !patrolAir) throw new Error(`${missionId}: main_weapon none は米PT の隊（pt_boats）か夜の哨戒機（patrol_air）の任務だけ`);
  const coastRaw = proto['coast'] as Record<string, unknown> | undefined;
  let coast: CoastBlock | null = null;
  if (coastRaw !== undefined) {
    if (coastRaw?.['side'] !== 'south' || !isNum(coastRaw['land_m']) || !(coastRaw['land_m'] > 0) || typeof coastRaw['label_ja'] !== 'string') throw new Error(`${missionId}.v0_1_prototype.coast（side: south / land_m / label_ja）が壊れている（v0.4.2 は south だけ）`);
    coast = { side: 'south', landM: coastRaw['land_m'], label: coastRaw['label_ja'] };
  }
  if (barges && !coast) throw new Error(`${missionId}.v0_1_prototype: 大発の隊（barges）には岸（coast）が要る（逃げる向き）`);
  const sbRaw = proto['shore_battery'] as Record<string, unknown> | undefined;
  let shoreBattery: { xM: number } | null = null;
  if (sbRaw !== undefined) {
    if (!isNum(sbRaw?.['x_m'])) throw new Error(`${missionId}.v0_1_prototype.shore_battery.x_m（岸沿いの位置 m）が無い（docs/02 §6.8）`);
    if (!coast) throw new Error(`${missionId}.v0_1_prototype: 沿岸砲（shore_battery）には岸（coast）が要る`);
    shoreBattery = { xM: sbRaw['x_m'] };
  }
  // 僚艇（v0.4.4）: 駆逐艦の任務だけ（砲の 2 目標は駆逐艦の砲だけ）。escort_vip の任務には必ず要る
  const escortRaw = proto['escort'];
  if (escortRaw !== undefined && !isEscortMissionBlock(escortRaw)) throw new Error(`${missionId}.v0_1_prototype.escort（boat / station_astern_m / station_abeam_m / lag_warn_m / catch_up_gain_per_s / heading_deadband_m / lit_near_leader_m）が欠けている（docs/02 §6.4）`);
  const escort = escortRaw === undefined ? null : escortRaw;
  if (escort && (barges || ptBoats)) throw new Error(`${missionId}.v0_1_prototype: 僚艇（escort）は駆逐艦（enemy_start）の任務だけ`);
  if (type === 'escort_vip' && !escort) throw new Error(`${missionId}: type が escort_vip なのに v0_1_prototype.escort が無い`);
  if (escort && !(data.boats.boats as readonly Record<string, unknown>[]).some((x) => x['id'] === escort.boat)) throw new Error(`${missionId}.v0_1_prototype.escort.boat（${escort.boat}）が boats.json に無い`);
  const enemyStart = barges || ptBoats || patrolAir ? null : readStart(proto['enemy_start'], `${missionId}.v0_1_prototype.enemy_start`);
  // 難易度ハード（v0.4.5。config/mission-hard-data。v0.6.4 で切り出し）: 全隻の出発点・全門の沿岸砲・撃沈の達成の隻数、v0.6.6 から米PT の哨戒線・上陸のノルマ（ハードなら hard block の分を足す）
  const { enemyStarts, shoreBatteryXs, objectiveSinkCount, ptLegs, convoyQuota } = readHardBlock(proto, missionId, hard, enemyStart, shoreBattery, b, { ptBoats: ptBoats !== null, convoy: proto['convoy'] !== undefined });
  // 輸送船（v0.4.7）: 駆逐艦の任務だけ（隊の 1 隻として同じ AI で動く）
  const trRaw = proto['transport'] as Record<string, unknown> | undefined;
  let transport: PrototypeMission['transport'] = null;
  if (trRaw !== undefined) {
    const tid = trRaw?.['enemy_id'];
    if (typeof tid !== 'string' || !(data.enemies.enemies as readonly Record<string, unknown>[]).some((x) => x['id'] === tid)) throw new Error(`${missionId}.v0_1_prototype.transport.enemy_id が enemies.json に無い（docs/02 §6.4）`);
    if (!enemyStart) throw new Error(`${missionId}.v0_1_prototype: 輸送船（transport）は駆逐艦（enemy_start）の任務だけ`);
    transport = { enemyId: tid, start: readStart(trRaw['start'], `${missionId}.v0_1_prototype.transport.start`) };
  }
  const hazardsRaw = proto['hazards'];
  if (hazardsRaw !== undefined && (!Array.isArray(hazardsRaw) || !hazardsRaw.every((h) => typeof h === 'string'))) throw new Error(`${missionId}.v0_1_prototype.hazards（risk_events.json の id の配列。無ければ []）が壊れている（docs/02 §6.8）`);
  const hazards = hazardsRaw === undefined ? [] : (hazardsRaw as string[]).slice();
  // 夜の揺らぎ（v0.4.6）: optional_hazards は任務の hazards の中から、risk_events に share がある id だけ
  const nightRaw = proto['night'];
  let night: NightBlock | null = null;
  if (nightRaw !== undefined) {
    if (!isNightDataRecord(nightRaw)) throw new Error(`${missionId}.v0_1_prototype.night（hazard_scale / optional_hazards / enemy_jitter / barge_lead_jitter_m / shore_battery_jitter_m）が壊れている（docs/02 §6.8）`);
    const events = data.riskEvents.events as readonly Record<string, unknown>[];
    night = nightFromData(nightRaw, hazards, (id) => events.some((e) => e['id'] === id && isNum(e['share'])), missionId);
  }
  // 味方の大発の輸送隊（v0.6.4。jp_01）: 米PT の隊（pt_boats）の任務だけ（駆逐艦・敵の大発・僚艇はその検査で既に排他）。岸（coast）が要り、主兵装は guns（25mm で守る）。
  // allies に大発（CONVOY_BARGE_ID）が 1 隻以上（数が隻数。offsets_m と同じ数かは convoy-data の検査）。帰投の輪と上陸線は反転しないので night.mirror_chance は 0
  const convoyRaw = proto['convoy'];
  if (convoyRaw !== undefined && !isConvoyMissionBlock(convoyRaw)) throw new Error(`${missionId}.v0_1_prototype.convoy（lead_start / offsets_m / landing_x_m / arrive_quota / barge_hp / detect_band / target_keep_ratio / target_switch_hold_s / flash_hold_s / source。任意の beach は spacing_m / margin_m / run_in_deg の数）が欠けている（docs/02 §6.4）`);
  const convoy = convoyRaw === undefined ? null : convoyRaw;
  if (convoy && !ptBoats) throw new Error(`${missionId}.v0_1_prototype: 輸送隊（convoy）は米PT の隊（pt_boats）の任務だけ`);
  if (convoy && !coast) throw new Error(`${missionId}.v0_1_prototype: 輸送隊（convoy）には岸（coast）が要る（浜の見た目）`);
  if (convoy && mainWeapon !== 'guns') throw new Error(`${missionId}: 輸送隊（convoy）の任務の main_weapon は guns（大発を守る砲）`);
  const allies = m['allies'];
  if (convoy && (!Array.isArray(allies) || !allies.some((a) => a === CONVOY_BARGE_ID))) throw new Error(`${missionId}.allies に輸送隊の大発（${CONVOY_BARGE_ID}）が無い（数が隻数）`);
  if (convoy && night && night.mirrorChance > 0) throw new Error(`${missionId}.v0_1_prototype.night.mirror_chance は輸送隊の任務では 0（帰投の輪と上陸線は反転しない）`);
  return {
    id: missionId,
    type,
    playerBoatId,
    torpedoId,
    enemyId,
    enemyCount: enemyStart ? enemyStarts.length : ids.length + (ptLegs ? ptLegs.length : 0),
    bounds: b,
    playerStart,
    enemyStart,
    enemyStarts,
    hard,
    objectiveSinkCount,
    mainWeapon,
    barges,
    // ハード（v0.6.6。jp_01）: 足す哨戒線を legs_m の後ろに・上陸のノルマを置き換えた写し（data の配列は触らない。PrototypeMission の鍵は増やさない）
    ptBoats: ptBoats && ptLegs ? { ...ptBoats, legs_m: [...ptBoats.legs_m, ...ptLegs] } : ptBoats,
    convoy: convoy && convoyQuota !== null ? { ...convoy, arrive_quota: convoyQuota } : convoy,
    coast,
    shoreBattery,
    shoreBatteryXs,
    escort,
    durationS: proto['duration_s'],
    enemyHitsToSink: isNum(proto['enemy_hits_to_sink']) ? proto['enemy_hits_to_sink'] : null,
    moon,
    returnPoint,
    fuelAllotmentGal,
    shallows,
    friendlyAircraft,
    storm,
    hazards,
    enemyAircraft,
    night,
    transport,
    dawnStrike: proto['dawn_strike'] === undefined ? null : dawnStrikeFromData(proto['dawn_strike'], missionId),
  };
}

/**
 * 任務にハードの違い（v0_1_prototype.hard）があるか（v0.6.3 レビュー: jp_05 はハード＝ノーマルなのに Briefing・Result が「ハード」と出た）。
 * PrototypeMission・WorldSetup には足さない（他の任務の setup の snapshot を変えない）。Briefing の「（この任務は同じ）」と Result の「（ハード）」が読む
 */
export function hasHardVariant(data: GameData, missionId: string): boolean {
  const m = data.missionsSeed.missions.find((x) => x.id === missionId) as Record<string, unknown> | undefined;
  const proto = m?.['v0_1_prototype'] as Record<string, unknown> | undefined;
  return proto?.['hard'] !== undefined;
}

// ---------- 任務一覧（v0.4.0）。Briefing の文（getBriefingRecord・enemyNameJa・riskLabelJa）は v0.6.3 から config/briefing-data.ts（ここから再 export すると循環になる） ----------

/** Title の任務一覧（v0.6.0 から campaign-data.ts。キャンペーンを選べる。ここは今までの import のための再 export） */
export { getMenuEntries } from './campaign-data';
