// 列の通過（v0.8.0。us_04「ブラケット海峡の夜」の東京急行。spec-v0800 §4.4・§4.5・§4.8）の任務の読み出し: 任務の v0_1_prototype.transit があれば、
// 列の艦の記録（enemies.json。v0_1_prototype.enemies の先頭＝護衛と同じ id）と今夜の揺らぎ（core/night の敵の 1 件）から世界の値（TransitSetup）を組み、
// 起動時の検査 V-T1〜V-T6 をする（例外は鍵を名指す日本語）。形は core/transit-data。PrototypeMission に鍵は足さない（block は生の proto から読む。evac-mission-data と同じ作法）。
// world-setup は今夜の揺らぎの回数（transitNightRolls。列ごと 1 件）と組み立てのたびに（transitSetupPart）、Boot は全任務（ハードも）を 1 回（validateTransitMissions）呼ぶ。
// 今夜の揺らぎ（spec §4.8）: x のずれ ÷ 画面上の列の速さ → 入りの秒（東へ進む列が東へずれれば早い）、y のずれ → 往路と復路の道の y。針路のずれは使わない（乱数の回数は列ごと 3 回のまま）。
// 片道の列（v0.8.2。us_05。spec-v0820 §4.2 D-C2・D-C4）: transit.column のある列は enemy_start の無い列だけの隊でよく（V-T6）、復路が無い（outbound null）。艦ごとの記録・時刻・道の
// 検査（V-C1〜V-C6）と kits は config/column-mission-data、ここは置き場（V-T6）と夜明けに退く縁（V-T2: 向かう縁）だけを見て世界の値に艦ごとの入りの秒・道のずれ・kits を足す。
import { getEnemyRecord, getEvasionMultiplier, type GameData, type PrototypeMission } from './game-data';
import { getPrototypeMission, hasHardVariant } from './mission-data';
import { getColumnPlan, type ColumnKit, type ColumnPlan, type ColumnSetupOptions } from './column-mission-data';
import type { NightOffset } from '../core/night';
import { shipAiParamsFromData, type ShipAiParams } from '../core/ship-ai';
import { TRANSIT_MAX_SHIPS, readTransitBlock, transitAppearX, transitGoneX, transitLastGoneS, type TransitEdge, type TransitOneWayBlock } from '../core/transit-data';
import { ktToMps } from '../core/units';

/** V-T2: 道の y は縁から（列の艦の境界の余白＝表示上の船体半分 ＋ これ）以上内（今夜の y のずれ込み） */
export const TRANSIT_CHECK_LANE_MARGIN_M = 200;
/** V-T3: 揺らぎのない夜の最後の艦は夜明けのこの実秒前までに去る（どの夜でも夜明けの前に去るのも見る） */
export const TRANSIT_CHECK_DAWN_MARGIN_S = 20;
/** V-T4: 揚陸の実秒の下限 */
export const TRANSIT_CHECK_UNLOAD_MIN_S = 20;
/** V-T5: 出発点は往路の入りの点からこの m 以上（出てすぐ見つからない。今夜の y のずれ込み） */
export const TRANSIT_CHECK_START_CLEAR_M = 1500;
/** V-T6: 列の通過と同居しない v0_1_prototype の鍵（大発・米PT・輸送隊・輸送船・僚艇・航空機だけの任務・揚陸・味方の駆逐艦） */
export const TRANSIT_EXCLUSIVE_KEYS = ['barges', 'pt_boats', 'convoy', 'transport', 'escort', 'patrol_air', 'evac', 'landing', 'ally_destroyer'] as const;
/** 列の通過の任務だけが hard に持つ鍵（無い任務に置けば例外。extra_column は v0.8.2 の片道の列＝config/column-mission-data） */
export const TRANSIT_ONLY_HARD_KEYS = ['extra_transit_ships', 'extra_column'] as const;

export interface TransitLeg {
  edge: TransitEdge;
  /** 道の y m（今夜のずれ込み） */
  laneY: number;
  headingDeg: number;
  /** 現れる x（縁の内 edge_inset_m）と去ったとみなす x（向こうの縁の外 edge_inset_m） */
  appearX: number;
  goneX: number;
}

/** 列の通過の世界の値（WorldSetup.transit。S1 の core/ship-transit・S2 の systems/destroyer-transit が読む） */
export interface TransitSetup {
  enemyId: string;
  /** 列の艦の数（ハードなら hard.extra_transit_ships を足す） */
  ships: number;
  spacingS: number;
  speedKt: number;
  /** 列の速さ（m/s。世界は dt × time_scale で進める＝画面上は × time_scale） */
  speedMps: number;
  /** 道の端から端（appearX → goneX＝海域の幅）の実秒 */
  crossS: number;
  /** 1 隻目が往路に現れる実秒（今夜のずれ込み） */
  enterS: number;
  unloadS: number;
  inbound: TransitLeg;
  /** 復路（片道の列は null。v0.8.2） */
  outbound: TransitLeg | null;
  coverLeavesWithOutbound: boolean;
  vilaLabelJa: string;
  /** 列の艦の AI（enemies.json の値のまま最大速力だけ列の速さ＝往路と復路・体当たりの増速の上限。史実モードの倍率込み） */
  shipAi: ShipAiParams;
  /** 片道の列だけ（v0.8.2。無い任務では鍵ごと出ない）: 艦ごとの入りの秒（今夜の揺らぎ込み）・道のずれ・見張りが戻る秒・列の艦ごとの記録（S2 の systems/column-kits が読む） */
  enterAtS?: number[];
  laneDyM?: number[];
  rejoinS?: number;
  column?: ColumnKit[];
}

type Rec = Record<string, unknown>;

function protoOf(data: GameData, missionId: string): Rec | null {
  const m = (data.missionsSeed.missions as readonly Rec[]).find((x) => x['id'] === missionId);
  const p = m?.['v0_1_prototype'];
  return typeof p === 'object' && p !== null && !Array.isArray(p) ? (p as Rec) : null;
}

/** 今夜の揺らぎで列の通過に引く敵の件数（列の通過のある任務は 1・ほかは 0＝ほかの任務の引く回数は同じ） */
export function transitNightRolls(data: GameData, mission: PrototypeMission): number {
  return protoOf(data, mission.id)?.['transit'] === undefined ? 0 : 1;
}

/** 任務の列の通過の値。v0_1_prototype.transit の無い任務は null。night は今夜の列の 1 件（null は揺らぎなし）。壊れていれば「<任務>.v0_1_prototype…: …（V-Tn）」。opts は片道の列の kits の上書き */
export function getTransitParams(data: GameData, mission: PrototypeMission, night: NightOffset | null, historical: boolean, opts: ColumnSetupOptions = {}): TransitSetup | null {
  const proto = protoOf(data, mission.id);
  if (!proto) return null;
  const at = `${mission.id}.v0_1_prototype`;
  const bad = (v: string, msg: string): never => {
    throw new Error(`${at}.${msg}（${v}・spec-v0800 §4.8）`);
  };
  const hardRaw = proto['hard'] as Rec | undefined;
  if (proto['transit'] === undefined) {
    for (const k of TRANSIT_ONLY_HARD_KEYS) if (hardRaw?.[k] !== undefined) bad('V-T1', `hard.${k} は列の通過（transit）の任務だけ`);
    return null;
  }
  const b = readTransitBlock(proto['transit'], `${at}.transit`);
  // V-T6 置き場: 護衛の駆逐艦（enemy_start）のいる任務か列だけの隊（片道の列＝transit.column。v0.8.2）・同居しない鍵・東西に反転しない（揚陸の地は一方の縁の外）
  if (!mission.enemyStart && b.column === undefined) bad('V-T6', 'transit は駆逐艦の任務（enemy_start＝護衛がある）だけ');
  for (const k of TRANSIT_EXCLUSIVE_KEYS) if (proto[k] !== undefined) bad('V-T6', `${k} と transit は同居しない`);
  if (mission.night && mission.night.mirrorChance !== 0) bad('V-T6', `night.mirror_chance は 0（列は東西に反転しない。${mission.night.mirrorChance}）`);
  if (b.column !== undefined) return oneWayParams(data, mission, b, getColumnPlan(data, mission, night, historical, opts)!, night, historical, (proto['dawn_withdraw'] as Rec | undefined)?.['retire_edge'], bad);
  // V-T1 数: ハードの足す艦・上限・enemies（護衛 1 ＋ 列）・速さは艦の最大以下
  const extraRaw = hardRaw?.['extra_transit_ships'];
  if (extraRaw !== undefined && !(typeof extraRaw === 'number' && Number.isInteger(extraRaw) && extraRaw >= 1)) bad('V-T1', `hard.extra_transit_ships は 1 以上の整数（${String(extraRaw)}）`);
  const extra = (extraRaw as number | undefined) ?? 0;
  const shipsMax = b.ships + extra;
  if (shipsMax > TRANSIT_MAX_SHIPS) bad('V-T1', `transit.ships ＋ hard.extra_transit_ships（${shipsMax}）は ${TRANSIT_MAX_SHIPS} 隻まで`);
  const ids = proto['enemies'] as unknown[];
  if (ids.length !== 1 + b.ships || !ids.every((e) => e === mission.enemyId)) bad('V-T1', `enemies（${ids.join('・')}）は護衛 1 ＋ 列 ${b.ships} の同じ id（${mission.enemyId}）`);
  const r = getEnemyRecord(data, mission.enemyId);
  if (!(b.speed_kt <= r.speed_max_kt)) bad('V-T1', `transit.speed_kt（${b.speed_kt}）は ${mission.enemyId} の speed_max_kt（${r.speed_max_kt}）以下`);
  // V-T2 道: 縁の余白（今夜の y のずれ込み）・夜明けに退く縁は列の来た縁
  const { width, height } = mission.bounds;
  const jy = mission.night ? mission.night.enemyJitterYM : 0;
  const margin = (r.length_m * data.hitRateModel.world.sprite_scale) / 2 + TRANSIT_CHECK_LANE_MARGIN_M;
  for (const [k, y] of [['inbound', b.inbound.lane_y_m], ['outbound', b.outbound.lane_y_m]] as const) {
    if (!(y - jy >= margin && y + jy <= height - margin)) bad('V-T2', `transit.${k}.lane_y_m（${y} ± 今夜の ${jy}）は北と南の縁から ${margin.toFixed(1)} m（艦の余白 ＋ ${TRANSIT_CHECK_LANE_MARGIN_M}）以上内`);
  }
  const retire = (proto['dawn_withdraw'] as Rec | undefined)?.['retire_edge'];
  if (retire !== b.inbound.edge) bad('V-T2', `dawn_withdraw.retire_edge（${String(retire)}）は列の来た縁 transit.inbound.edge（${b.inbound.edge}。夜明けに来た道を退く）`);
  // V-T3 時刻: 揺らぎのない夜のハード込みの最後の艦は夜明けの 20 秒前までに・どの夜でも夜明けの前に去る・入りは 0 秒より後
  const screenMps = ktToMps(b.speed_kt) * data.hitRateModel.world.time_scale;
  const crossS = width / screenMps;
  const jx = mission.night ? mission.night.enemyJitterXM / screenMps : 0;
  const last = transitLastGoneS(b.inbound.enter_s, shipsMax, b.spacing_s, crossS, b.unload_s);
  if (!(last <= mission.durationS - TRANSIT_CHECK_DAWN_MARGIN_S)) bad('V-T3', `transit: 最後の艦（${shipsMax} 隻目）が復路で去る ${last.toFixed(2)} 秒は duration_s（${mission.durationS}）の ${TRANSIT_CHECK_DAWN_MARGIN_S} 秒前まで（入り ＋ 間隔 ＋ 渡り ${crossS.toFixed(2)} ＋ 揚陸 ＋ 渡り）`);
  if (!(last + jx < mission.durationS)) bad('V-T3', `transit: 今夜の揺らぎ（入り ＋${jx.toFixed(2)} 秒）でも最後の艦は duration_s（${mission.durationS}）の前に去る（${(last + jx).toFixed(2)} 秒）`);
  if (!(b.inbound.enter_s - jx >= 0)) bad('V-T3', `transit.inbound.enter_s（${b.inbound.enter_s}）は今夜の揺らぎ（−${jx.toFixed(2)} 秒）でも 0 秒以上`);
  // V-T4 揚陸の秒
  if (!(b.unload_s >= TRANSIT_CHECK_UNLOAD_MIN_S)) bad('V-T4', `transit.unload_s（${b.unload_s}）は ${TRANSIT_CHECK_UNLOAD_MIN_S} 秒以上`);
  // V-T5 出発点は往路の入りの点から離れる（今夜の y のずれのうち出発点に一番近い道）
  const ax = transitAppearX(b.inbound.edge, width, b.edge_inset_m);
  const near = Math.min(Math.max(mission.playerStart.y, b.inbound.lane_y_m - jy), b.inbound.lane_y_m + jy);
  const d = Math.hypot(mission.playerStart.x - ax, mission.playerStart.y - near);
  if (!(d >= TRANSIT_CHECK_START_CLEAR_M)) bad('V-T5', `player_start は往路の入りの点（${ax}, ${b.inbound.lane_y_m} ± ${jy}）から ${TRANSIT_CHECK_START_CLEAR_M} m 以上（${d.toFixed(1)} m）`);
  // 組む（今夜の揺らぎ: x のずれ → 入りの秒・y のずれ → 両方の道の y）
  const o = night ?? { dx: 0, dy: 0, dh: 0 };
  const leg = (edge: TransitEdge, laneY: number, headingDeg: number): TransitLeg => ({ edge, laneY: laneY + o.dy, headingDeg, appearX: transitAppearX(edge, width, b.edge_inset_m), goneX: transitGoneX(edge, width, b.edge_inset_m) });
  return {
    enemyId: mission.enemyId,
    ships: b.ships + (mission.hard ? extra : 0),
    spacingS: b.spacing_s,
    speedKt: b.speed_kt,
    speedMps: ktToMps(b.speed_kt),
    crossS,
    enterS: b.inbound.enter_s + ((b.inbound.edge === 'west' ? -1 : 1) * o.dx) / screenMps,
    unloadS: b.unload_s,
    inbound: leg(b.inbound.edge, b.inbound.lane_y_m, b.inbound.heading_deg),
    outbound: leg(b.outbound.edge, b.outbound.lane_y_m, b.outbound.heading_deg),
    coverLeavesWithOutbound: b.cover_leaves_with_outbound,
    vilaLabelJa: b.vila_label_ja,
    shipAi: { ...shipAiParamsFromData(r, getEvasionMultiplier(data, historical)), maxSpeedMps: ktToMps(b.speed_kt) },
  };
}

/**
 * 片道の列の世界の値（v0.8.2。V-C1〜V-C6 は config/column-mission-data が済ませた plan）。夜明けに退く縁は列の向かう縁（V-T2 の片道版: 戻らない列は先へ退く）。
 * 往復の鍵は使わない値（spacingS・unloadS 0・outbound null・護衛は退かない）、艦ごとの入りの秒・道のずれ・kits は鍵を足す（往復の列には出ない）
 */
function oneWayParams(data: GameData, mission: PrototypeMission, b: TransitOneWayBlock, plan: ColumnPlan, night: NightOffset | null, historical: boolean, retire: unknown, bad: (v: string, msg: string) => never): TransitSetup {
  const { edge, lane_y_m: laneY, heading_deg: headingDeg } = b.inbound;
  const forward: TransitEdge = edge === 'west' ? 'east' : 'west';
  if (retire !== forward) bad('V-T2', `dawn_withdraw.retire_edge（${String(retire)}）は片道の列の向かう縁（${forward}。夜明けに先へ退く）`);
  const { width } = mission.bounds;
  const dy = night ? night.dy : 0;
  const r = getEnemyRecord(data, mission.enemyId);
  return {
    enemyId: mission.enemyId, ships: plan.kits.length, spacingS: 0, speedKt: b.speed_kt, speedMps: ktToMps(b.speed_kt), crossS: width / (ktToMps(b.speed_kt) * data.hitRateModel.world.time_scale),
    enterS: plan.enterAtS[0]!, unloadS: 0, // 1 隻目の入りの秒（今夜のずれ込み）。揚陸は無い
    inbound: { edge, laneY: laneY + dy, headingDeg, appearX: transitAppearX(edge, width, b.edge_inset_m), goneX: transitGoneX(edge, width, b.edge_inset_m) },
    outbound: null, coverLeavesWithOutbound: false, vilaLabelJa: b.vila_label_ja,
    shipAi: { ...shipAiParamsFromData(r, getEvasionMultiplier(data, historical)), maxSpeedMps: ktToMps(b.speed_kt) },
    enterAtS: plan.enterAtS, laneDyM: plan.laneDyM, ...(plan.rejoinS !== null ? { rejoinS: plan.rejoinS } : {}), column: plan.kits,
  };
}

/** WorldSetup に展開する部分: 列の通過の無い任務は {}（transit の鍵ごと出ない＝ほかの任務の setup の snapshot が変わらない）。o は片道の列の kits の上書き（v0.8.2） */
export function transitSetupPart(data: GameData, mission: PrototypeMission, night: NightOffset | null, historical: boolean, o: ColumnSetupOptions = {}): { transit?: TransitSetup } {
  const p = getTransitParams(data, mission, night, historical, o);
  return p ? { transit: p } : {};
}

/** Boot の検査: v0_1_prototype を持つ全任務（ハードも）を 1 回組む（揺らぎなし。壊れていれば Boot で止まる）。最初の列の通過の任務の値（ノーマル）を返す（無ければ null） */
export function validateTransitMissions(data: GameData): TransitSetup | null {
  let first: TransitSetup | null = null;
  for (const m of data.missionsSeed.missions as readonly Rec[]) {
    const id = m['id'];
    if (typeof id !== 'string' || !m['v0_1_prototype']) continue;
    for (const hard of hasHardVariant(data, id) ? [false, true] : [false]) {
      const p = getTransitParams(data, getPrototypeMission(data, id, hard), null, false);
      if (p && !first) first = p;
    }
  }
  return first;
}
