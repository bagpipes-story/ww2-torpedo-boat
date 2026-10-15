// 任務の種（data/missions_seed.json）の読み出し（v0.4.0 で game-data.ts から切り出し。切り出した中身は v0.3.5 のまま、v0.4.0 で hazards を足した）。
// 型は実行時に検査する（data 駆動なので壊れていれば起動時に分かる）。v0.4.0 の任務一覧・Briefing の読み出しもここに置く。
import type { GameData } from './game-data';
import { isReturnPointDataRecord, returnPointFromData, type ReturnPoint } from '../core/mission-flow';
import { isShallowRectDataRecord, shallowsFromData, type ShallowRect } from '../core/shallows';
import { isStormMissionBlock, type StormMissionBlock } from '../core/storm';
import { isBargeMissionBlock, type BargeMissionBlock } from '../core/barge-data';
import { isMoonPhase, type MoonPhase } from '../core/visibility';
import { menuEntries, shortLabelJa, type BriefingText, type MenuEntry } from '../core/briefing';

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
  /** 駆逐艦の出発点（us_02）。大発の隊の任務（barges）では null */
  enemyStart: { x: number; y: number; headingDeg: number } | null;
  /** 主兵装（v0.4.2）: torpedo（右下が魚雷）か guns（右下が射撃。boats.json の gun_battery） */
  mainWeapon: MainWeapon;
  /** 大発の隊（v0.4.2。core/barge-data）と岸（見た目と逃げる向き）。無ければ null */
  barges: BargeMissionBlock | null;
  coast: CoastBlock | null;
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
}

export type MainWeapon = 'torpedo' | 'guns';

/** 岸（v0.4.2）: 海域の south の縁が浜で、その外に陸を landM の幅で描く（見た目だけ）。v0.4.2 は south だけ */
export interface CoastBlock {
  side: 'south';
  landM: number;
  label: string;
}

export function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function readStart(v: unknown, label: string): { x: number; y: number; headingDeg: number } {
  const r = v as Record<string, unknown> | undefined;
  if (!r || !isNum(r['x_m']) || !isNum(r['y_m']) || !isNum(r['heading_deg'])) {
    throw new Error(`${label} に x_m / y_m / heading_deg が無い`);
  }
  return { x: r['x_m'], y: r['y_m'], headingDeg: r['heading_deg'] };
}

export function getPrototypeMission(data: GameData, missionId: string): PrototypeMission {
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
  if (!isReturnPointDataRecord(rp)) throw new Error(`${missionId}.v0_1_prototype.return_point（x_m/y_m/radius_m/call_margin/torpedo_settle_max_s）が無い（docs/02 §6.7）`);
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
  // 駆逐艦（enemy_start）か大発の隊（barges）のどちらか一方。大発には魚雷が当たらない（torpedo_immune）ので主兵装は砲（v0.4.2）
  const bargesRaw = proto['barges'];
  if (bargesRaw !== undefined && !isBargeMissionBlock(bargesRaw)) throw new Error(`${missionId}.v0_1_prototype.barges（lead_start / offsets_m / beach_margin_m / kill_quota）が欠けている（docs/02 §6.4）`);
  const barges = bargesRaw === undefined ? null : bargesRaw;
  if ((proto['enemy_start'] === undefined) === (barges === null)) throw new Error(`${missionId}.v0_1_prototype は enemy_start（駆逐艦）か barges（大発の隊）のどちらか一方を持つ`);
  const mainWeapon = proto['main_weapon'] ?? 'torpedo';
  if (mainWeapon !== 'torpedo' && mainWeapon !== 'guns') throw new Error(`${missionId}.v0_1_prototype.main_weapon は torpedo か guns`);
  const ids = enemies as unknown[];
  if (barges && !ids.every((e) => e === enemyId)) throw new Error(`${missionId}.v0_1_prototype.enemies: 大発の隊は同じ id だけ`);
  const immune = ids.some((e) => (data.enemies.enemies as readonly Record<string, unknown>[]).find((x) => x['id'] === e)?.['torpedo_immune'] === true);
  if (immune && mainWeapon !== 'guns') throw new Error(`${missionId}: 魚雷が当たらない敵（enemies.json の torpedo_immune）がいるので main_weapon は guns`);
  const coastRaw = proto['coast'] as Record<string, unknown> | undefined;
  let coast: CoastBlock | null = null;
  if (coastRaw !== undefined) {
    if (coastRaw?.['side'] !== 'south' || !isNum(coastRaw['land_m']) || !(coastRaw['land_m'] > 0) || typeof coastRaw['label_ja'] !== 'string') throw new Error(`${missionId}.v0_1_prototype.coast（side: south / land_m / label_ja）が壊れている（v0.4.2 は south だけ）`);
    coast = { side: 'south', landM: coastRaw['land_m'], label: coastRaw['label_ja'] };
  }
  if (barges && !coast) throw new Error(`${missionId}.v0_1_prototype: 大発の隊（barges）には岸（coast）が要る（逃げる向き）`);
  const hazardsRaw = proto['hazards'];
  if (hazardsRaw !== undefined && (!Array.isArray(hazardsRaw) || !hazardsRaw.every((h) => typeof h === 'string'))) throw new Error(`${missionId}.v0_1_prototype.hazards（risk_events.json の id の配列。無ければ []）が壊れている（docs/02 §6.8）`);
  const hazards = hazardsRaw === undefined ? [] : (hazardsRaw as string[]).slice();
  return {
    id: missionId,
    type,
    playerBoatId,
    torpedoId,
    enemyId,
    enemyCount: ids.length,
    bounds: b,
    playerStart,
    enemyStart: barges ? null : readStart(proto['enemy_start'], `${missionId}.v0_1_prototype.enemy_start`),
    mainWeapon,
    barges,
    coast,
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
  };
}

// ---------- 任務一覧と Briefing（v0.4.0）。data を直接読み、game-data の関数は呼ばない（値の循環を作らない） ----------

/** Title の任務一覧: unlock が default の最初のキャンペーンの、playable_from を持つ任務を order 順に */
export function getMenuEntries(data: GameData): { campaignName: string; entries: MenuEntry[] } {
  const c = (data.missionsSeed.campaigns as readonly Record<string, unknown>[]).find((x) => x['unlock'] === 'default');
  if (!c || typeof c['id'] !== 'string' || typeof c['name_ja'] !== 'string') throw new Error('missions_seed.json に unlock が default のキャンペーン（id / name_ja）が無い');
  return { campaignName: c['name_ja'], entries: menuEntries(data.missionsSeed.missions, c['id']) };
}

export interface BriefingRecord extends BriefingText {
  id: string;
  titleJa: string;
  date: string;
  place: string;
  /** 表示用の史実メモ（人物名なし。CLAUDE.md §11） */
  noteJa: string;
}

/** Briefing に出す文（missions_seed）と遊べる世界の敵・危険・月。文が無ければ例外 */
export function getBriefingRecord(data: GameData, missionId: string): BriefingRecord {
  const m = data.missionsSeed.missions.find((x) => x.id === missionId) as Record<string, unknown> | undefined;
  if (!m) throw new Error(`missions_seed.json に ${missionId} が無い`);
  const text = (key: string): string => {
    const v = m[key];
    if (typeof v !== 'string' || v.length === 0) throw new Error(`${missionId}.${key} が無い（Briefing、docs/02 §4）`);
    return v;
  };
  const proto = m['v0_1_prototype'] as Record<string, unknown> | undefined;
  const enemies = proto?.['enemies'];
  if (!Array.isArray(enemies) || !enemies.every((e) => typeof e === 'string')) throw new Error(`${missionId}.v0_1_prototype.enemies が文字列の配列でない（Briefing）`);
  const mission = getPrototypeMission(data, missionId);
  return {
    id: missionId,
    titleJa: text('title_ja'),
    date: text('date'),
    place: text('place'),
    objective: text('objective'),
    success: text('success'),
    noteJa: text('briefing_note_ja'),
    moon: mission.moon,
    enemyIds: enemies as string[],
    hazardIds: mission.hazards,
  };
}

/** 敵の名前（enemies.json の name_ja から資料の注記「（…）」を落とす） */
export function enemyNameJa(data: GameData, id: string): string {
  const e = (data.enemies.enemies as readonly Record<string, unknown>[]).find((x) => x['id'] === id);
  const name = e?.['name_ja'];
  if (typeof name !== 'string') throw new Error(`enemies.json の ${id}.name_ja が無い`);
  return shortLabelJa(name);
}

/** 危険の名前（risk_events.json の label_ja から資料の注記を落とす） */
export function riskLabelJa(data: GameData, id: string): string {
  const e = (data.riskEvents.events as readonly Record<string, unknown>[]).find((x) => x['id'] === id);
  const label = e?.['label_ja'];
  if (typeof label !== 'string') throw new Error(`risk_events.json に ${id}（label_ja）が無い`);
  return shortLabelJa(label);
}
