// 列の艦ごとの記録（v0.8.2。us_05「スリガオ海峡・最初の接触」の第三部隊。spec-v0820 §4.2 D-C1〜D-C5・§5.3）: 片道の列の v0_1_prototype.transit.column（とハードの
// hard.extra_column）を読み、艦ごとの世界の値（ColumnKit: 寸法・列の AI・見張りの AI・砲・当たり・絵の鍵・艦種・KPI の旗・弾薬庫）と入りの秒・道のずれの表を組んで、
// 起動時の検査 V-C1〜V-C6 をする（例外は鍵を名指す日本語）。呼ぶのは config/transit-mission-data（片道の列の組み立て）と Boot（validateColumnMissions）。
// 列だけの隊（enemy_start の無い駆逐艦の隊＝D-C2）の任務の形は config/mission-data・transit-mission-data が持つ。S0 の世界はまだ kits を読まない（S2 の systems/column-kits）。
import { getEnemyRecord, getVisibilityParams, type GameData, type PrototypeMission } from './game-data';
import { getPrototypeMission, hasHardVariant } from './mission-data';
import { magazineRuleOf, type MagazineRule, type MagazineSetupOptions } from './magazine-data';
import { getRadarParams } from './radar-mission-data';
import { shipArtKey } from './ship-art-config';
import type { GunneryParams } from '../core/gunnery';
import type { NightOffset } from '../core/night';
import type { ShipAiParams } from '../core/ship-ai';
import { TRANSIT_MAX_SHIPS, readTransitBlock, transitAppearX, transitOneWayLastGoneS, type TransitOneWayBlock } from '../core/transit-data';
import { ktToMps } from '../core/units';
import { enemyDetectRangeM, speedFactorForBand } from '../core/visibility';
import { destroyerSetup, type DestroyerSpec } from '../systems/destroyer-setup';

/** V-C1: column（と hard.extra_column）の 1 隻の鍵（ちょうどこの 6 つ）・役（列のまま line／見張り screen）・組（前衛 van／本隊 main）・先頭より後ろの入りの間隔の下限 */
export const COLUMN_KIT_KEYS = ['enemy_id', 'name_ja', 'group', 'gap_s', 'lane_dy_m', 'role'] as const;
export const COLUMN_ROLES = ['line', 'screen'] as const;
export const COLUMN_GROUPS = ['van', 'main'] as const;
export const COLUMN_GAP_MIN_S = 5;
/** V-C2: 艦種（記録の ship_class。無い記録は destroyer）。KPI の旗は destroyer だけ */
export const SHIP_CLASSES = ['destroyer', 'heavy_cruiser', 'battleship'] as const;
/** V-C3・V-C5・V-C6 の余白（V-T2・V-T3・V-T5 と同じ値）・出撃の後に見つからない秒（V-C6）・見張りが戻る秒の範囲（V-C4） */
export const COLUMN_CHECK_LANE_MARGIN_M = 200;
export const COLUMN_CHECK_DAWN_MARGIN_S = 20;
export const COLUMN_CHECK_START_CLEAR_M = 1500;
export const COLUMN_CHECK_START_WINDOW_S = 10;
export const COLUMN_REJOIN_RANGE_S = [10, 120] as const;
/** 見張りの鎖（v0.8.2 S3b・lead の L37。任意）: 離れていられる体感の秒 screen_chase_s と、戻ってから離れない体感の秒 screen_cooldown_s の範囲（V-C4） */
export const COLUMN_LEASH_RANGE_S = { screen_chase_s: [10, 180], screen_cooldown_s: [0, 300] } as const;
export type ShipClass = (typeof SHIP_CLASSES)[number];
export type ColumnRole = (typeof COLUMN_ROLES)[number];
export type ColumnGroup = (typeof COLUMN_GROUPS)[number];

/**
 * 列の艦 1 隻の世界の値（TransitSetup.column の 1 つ。S2 の systems/column-kits が艦ごとの配列に）。nameJa は Result の艦名（艦名は CLAUDE.md §11 で使ってよい）、
 * kpi は命中率の KPI に数える艦（destroyer の記録だけ＝今の任務の旗と同じ値。D-K1）、lineAi は列の AI（記録の値で最大速力だけ列の速さ。史実モードの倍率込み）、
 * screenAi は見張りの AI（screen だけ。記録の値そのまま。line は null）、artKey は絵の鍵（config/ship-art-config。戦艦・重巡の鍵は S2b＝それまでは既定の駆逐艦の絵）、
 * magazine は弾薬庫の規則（記録の magazine。無ければ null。config/magazine-data）
 */
export interface ColumnKit {
  enemyId: string; nameJa: string; group: ColumnGroup; role: ColumnRole; shipClass: ShipClass; kpi: boolean;
  spec: DestroyerSpec; lineAi: ShipAiParams; screenAi: ShipAiParams | null; gunnery: GunneryParams; passRadius2: number;
  artKey: string; magazine: MagazineRule | null;
}

/** 片道の列の組み立ての結果（今夜の揺らぎ・ハードの艦込み）: kits と艦ごとの入りの秒・道のずれ・見張りが戻る秒と鎖（見張りのいない列・鎖の鍵の無い列は null） */
export interface ColumnPlan { kits: ColumnKit[]; enterAtS: number[]; laneDyM: number[]; rejoinS: number | null; screenChaseS: number | null; screenCooldownS: number | null }

/** 組み立ての上書き: 当たりの倍率（?debug&shiphit。world-setup の値）・弾薬庫の確率 1（?debug&boom） */
export interface ColumnSetupOptions extends MagazineSetupOptions { shipHitScale?: number }

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const has = <T extends string>(xs: readonly T[], v: unknown): v is T => (xs as readonly unknown[]).includes(v);

/** 記録の艦種（ship_class。無ければ destroyer。知らない値は例外＝V-C2） */
export function shipClassOf(data: GameData, enemyId: string): ShipClass {
  const r = (data.enemies.enemies as readonly Rec[]).find((e) => e['id'] === enemyId);
  const c = r?.['ship_class'] ?? 'destroyer';
  if (!has(SHIP_CLASSES, c)) throw new Error(`enemies.json の ${enemyId}.ship_class は ${SHIP_CLASSES.join('・')} のどれか（${String(c)}。V-C2・spec-v0820 §4.3）`);
  return c;
}

/** 点 (px, py) から矩形 [x0, x1] × [y0, y1] の一番近い点までの距離 */
function rectDist(px: number, py: number, x0: number, x1: number, y0: number, y1: number): number {
  return Math.hypot(px < x0 ? x0 - px : px > x1 ? px - x1 : 0, py < y0 ? y0 - py : py > y1 ? py - y1 : 0);
}

/**
 * 任務の片道の列。transit.column の無い任務は null（hard.extra_column だけがあれば例外）。night は今夜の列の 1 件（null は揺らぎなし）。
 * 壊れていれば「<任務>.v0_1_prototype.…（V-Cn・spec-v0820 §5.3）」。検査（V-C3〜V-C6）はハードの艦込み・今夜の揺らぎの端で見る
 */
export function getColumnPlan(data: GameData, mission: PrototypeMission, night: NightOffset | null, historical: boolean, o: ColumnSetupOptions = {}): ColumnPlan | null {
  const m = (data.missionsSeed.missions as readonly Rec[]).find((x) => x['id'] === mission.id);
  const proto = isObj(m?.['v0_1_prototype']) ? (m['v0_1_prototype'] as Rec) : null;
  const at = `${mission.id}.v0_1_prototype`;
  const bad = (v: string, msg: string): never => { throw new Error(`${at}.${msg}（${v}・spec-v0820 §5.3）`); };
  const tr = proto?.['transit'];
  const hardRaw = isObj(proto?.['hard']) ? (proto['hard'] as Rec) : null;
  const extraRaw = hardRaw?.['extra_column'];
  if (!proto || !isObj(tr) || tr['column'] === undefined) {
    if (extraRaw !== undefined) bad('V-C1', 'hard.extra_column は片道の列（transit.column）の任務だけ');
    return null;
  }
  const b = readTransitBlock(tr, `${at}.transit`) as TransitOneWayBlock;
  // V-C1 形: 1 隻の鍵の閉じた集合・数・入りの間隔・役と組。ハードの艦は列の後ろに足す（hard.extra_transit_ships は往復の列の鍵）
  if (hardRaw?.['extra_transit_ships'] !== undefined) bad('V-C1', 'hard.extra_transit_ships は往復の列の鍵（片道の列のハードは hard.extra_column）');
  if (extraRaw !== undefined && !(Array.isArray(extraRaw) && extraRaw.length > 0)) bad('V-C1', 'hard.extra_column は空でない配列');
  const recs = [...b.column, ...((extraRaw as unknown[] | undefined) ?? [])];
  if (b.column.length !== b.ships) bad('V-C1', `transit.column の数（${b.column.length}）は transit.ships（${b.ships}）と同じ`);
  if (recs.length > TRANSIT_MAX_SHIPS) bad('V-C1', `transit.column ＋ hard.extra_column（${recs.length}）は ${TRANSIT_MAX_SHIPS} 隻まで`);
  const name = (i: number): string => (i < b.column.length ? `transit.column[${i}]` : `hard.extra_column[${i - b.column.length}]`);
  recs.forEach((r, i) => {
    if (!isObj(r) || Object.keys(r).length !== COLUMN_KIT_KEYS.length || !COLUMN_KIT_KEYS.every((k) => k in r)) return bad('V-C1', `${name(i)} の鍵はちょうど ${COLUMN_KIT_KEYS.join('・')}`);
    if (!(typeof r['enemy_id'] === 'string' && typeof r['name_ja'] === 'string' && r['name_ja'].trim() !== '')) bad('V-C1', `${name(i)}.enemy_id・name_ja は空でない文字列`);
    if (!has(COLUMN_GROUPS, r['group'])) bad('V-C1', `${name(i)}.group は ${COLUMN_GROUPS.join('・')} のどれか（${String(r['group'])}）`);
    if (!has(COLUMN_ROLES, r['role'])) bad('V-C1', `${name(i)}.role は ${COLUMN_ROLES.join('・')} のどれか（${String(r['role'])}）`);
    const gap = r['gap_s'];
    if (!(isNum(gap) && gap >= (i === 0 ? 0 : COLUMN_GAP_MIN_S))) bad('V-C1', `${name(i)}.gap_s（${String(gap)}）は ${i === 0 ? '0' : COLUMN_GAP_MIN_S} 秒以上（先頭は inbound.enter_s からの秒・ほかは前の艦から。重ならない）`);
    if (!isNum(r['lane_dy_m'])) bad('V-C1', `${name(i)}.lane_dy_m は数`);
  });
  const rows = recs as Rec[];
  // V-C2 記録: AI と砲の記録・艦種・列の速さは最大以下・enemies は列の顔ぶれ（先頭は駆逐艦＝隊の見つける距離の基準）・沈む本数は記録の値
  for (let i = 0; i < rows.length; i++) {
    const id = rows[i]!['enemy_id'] as string;
    try { getEnemyRecord(data, id); shipClassOf(data, id); } catch (e) { bad('V-C2', `${name(i)}.enemy_id（${id}）は AI と砲を持つ記録: ${(e as Error).message}`); }
    const max = getEnemyRecord(data, id).speed_max_kt;
    if (!(b.speed_kt <= max)) bad('V-C2', `transit.speed_kt（${b.speed_kt}）は ${name(i)}（${id}）の speed_max_kt（${max}）以下`);
  }
  const ids = (proto['enemies'] as unknown[]).map(String);
  const colIds = b.column.map((r) => String((r as Rec)['enemy_id']));
  if ([...ids].sort().join('・') !== [...colIds].sort().join('・')) bad('V-C2', `enemies（${ids.join('・')}）は transit.column の顔ぶれ（${colIds.join('・')}。順は問わない）`);
  if (shipClassOf(data, mission.enemyId) !== 'destroyer') bad('V-C2', `enemies の先頭（${mission.enemyId}）は駆逐艦（隊の見つける距離の基準）`);
  if (proto['enemy_hits_to_sink'] !== undefined) bad('V-C2', 'enemy_hits_to_sink は片道の列の任務に置かない（沈む本数は艦ごとの記録の値）');
  // V-C4 片道の形: 列だけの隊（護衛なし）・見張りがいる時だけ rejoin_s（10〜120 秒）
  if (mission.enemyStart) bad('V-C4', 'enemy_start は片道の列（transit.column）の任務に置かない（護衛のいない列だけの隊。spec-v0820 §4.2 D-C2）');
  const [screens, rj] = [rows.some((r) => r['role'] === 'screen'), b.rejoin_s];
  const [rjMin, rjMax] = COLUMN_REJOIN_RANGE_S;
  if (screens ? !(isNum(rj) && rj >= rjMin && rj <= rjMax) : rj !== undefined) bad('V-C4', `transit.rejoin_s は見張り（role screen）がいる時だけ ${rjMin}〜${rjMax} 秒（${String(rj)}）`);
  for (const [k, [lo, hi]] of Object.entries(COLUMN_LEASH_RANGE_S)) { const v = (b as unknown as Rec)[k]; if (v !== undefined && !(screens && isNum(v) && v >= lo && v <= hi)) bad('V-C4', `transit.${k} は見張り（role screen）がいる時だけ置ける ${lo}〜${hi} 秒（${String(v)}）`); }
  // 時刻と道（揺らぎなし）: 入りの秒は enter_s ＋ 間隔の和、道は lane_y_m ＋ lane_dy_m。今夜の揺らぎの端は入りの ± jxS 秒・道の ± jy m
  const { width, height } = mission.bounds;
  const world = data.hitRateModel.world;
  const screenMps = ktToMps(b.speed_kt) * world.time_scale;
  const crossS = width / screenMps;
  const [jxS, jy] = mission.night ? [mission.night.enemyJitterXM / screenMps, mission.night.enemyJitterYM] : [0, 0];
  const enter: number[] = [];
  rows.forEach((r, i) => enter.push((i === 0 ? b.inbound.enter_s : enter[i - 1]!) + (r['gap_s'] as number)));
  const laneY = rows.map((r) => b.inbound.lane_y_m + (r['lane_dy_m'] as number));
  // V-C5 夜明け: 揺らぎのない夜のハード込みの最後の艦は夜明けの 20 秒前までに・今夜の揺らぎの端でも夜明けの前に向こうの縁の外へ去る
  const last = transitOneWayLastGoneS(enter[enter.length - 1]!, crossS);
  if (!(last <= mission.durationS - COLUMN_CHECK_DAWN_MARGIN_S)) bad('V-C5', `transit: 最後の艦（${rows.length} 隻目）が去る ${last.toFixed(2)} 秒は duration_s（${mission.durationS}）の ${COLUMN_CHECK_DAWN_MARGIN_S} 秒前まで（入り ＋ 渡り ${crossS.toFixed(2)}）`);
  if (!(last + jxS < mission.durationS)) bad('V-C5', `transit: 今夜の揺らぎ（入り ＋${jxS.toFixed(2)} 秒）でも最後の艦は duration_s（${mission.durationS}）の前に去る（${(last + jxS).toFixed(2)} 秒）`);
  // 艦ごとに V-C3 道（縁から（その艦の余白 ＋ 200 m）以上内・岸の線から陸の反射より沖）と V-C6 出発点（どの艦の入りの点からも 1,500 m 以上・出撃から 10 秒の内に
  // どの艦の全速の見つかる距離にも入らない＝ノーマル・史実モードなし）。どれも今夜の揺らぎの端で
  const radar = getRadarParams(data, mission);
  const shoreYs = proto['shores'] !== undefined ? [0, height] : mission.coast ? [height] : [];
  const ax = transitAppearX(b.inbound.edge, width, b.edge_inset_m);
  const dir = b.inbound.edge === 'west' ? 1 : -1;
  const vis = getVisibilityParams(data, mission.moon, false);
  const clearM = enemyDetectRangeM(getEnemyRecord(data, mission.enemyId).detection.base_detect_m, speedFactorForBand('full', vis.speedFactor), vis, false);
  const ps = mission.playerStart;
  rows.forEach((r, i) => {
    const margin = (getEnemyRecord(data, r['enemy_id'] as string).length_m * world.sprite_scale) / 2 + COLUMN_CHECK_LANE_MARGIN_M;
    const [y0, y1] = [laneY[i]! - jy, laneY[i]! + jy];
    if (!(y0 >= margin && y1 <= height - margin)) bad('V-C3', `${name(i)} の道（y ${laneY[i]} ± 今夜の ${jy}）は北と南の縁から ${margin.toFixed(1)} m（艦の余白 ＋ ${COLUMN_CHECK_LANE_MARGIN_M}）以上内`);
    if (radar && !shoreYs.every((ly) => Math.min(Math.abs(ly - y0), Math.abs(ly - y1)) > radar.landClutterM && !(ly > y0 && ly < y1))) bad('V-C3', `${name(i)} の道（y ${laneY[i]} ± 今夜の ${jy}）は岸の線から陸の反射（${radar.landClutterM} m）より沖`);
    const d = rectDist(ps.x, ps.y, ax, ax, y0, y1);
    if (!(d >= COLUMN_CHECK_START_CLEAR_M)) bad('V-C6', `player_start は ${name(i)} の入りの点（${ax}, ${laneY[i]} ± ${jy}）から ${COLUMN_CHECK_START_CLEAR_M} m 以上（${d.toFixed(1)} m）`);
    const far = ax + dir * screenMps * Math.max(0, COLUMN_CHECK_START_WINDOW_S - Math.max(0, enter[i]! - jxS)); // 10 秒の内に進める所（入りが 0 より前なら出撃の最初から）
    const d10 = rectDist(ps.x, ps.y, Math.min(ax, far), Math.max(ax, far), y0, y1);
    if (!(d10 > clearM)) bad('V-C6', `player_start は出撃から ${COLUMN_CHECK_START_WINDOW_S} 秒の内に ${name(i)} の全速で見つかる距離（${clearM} m）に入らない（${d10.toFixed(1)} m）`);
  });
  // 組む（ハードの組み立てなら hard.extra_column まで。今夜の揺らぎ: x のずれ → 入りの秒＝東へ進む列が東へずれれば早い・y のずれは transit の道へ）
  const use = rows.slice(0, mission.hard ? rows.length : b.column.length);
  const shift = (-dir * (night ? night.dx : 0)) / screenMps;
  const hitScale = o.shipHitScale !== undefined && o.shipHitScale > 0 ? o.shipHitScale : world.ship_hit_scale;
  const kits = use.map((r): ColumnKit => {
    const [id, role] = [r['enemy_id'] as string, r['role'] as ColumnRole];
    const [ds, shipClass] = [destroyerSetup(data, [], id, null, hitScale, historical), shipClassOf(data, id)];
    return { enemyId: id, nameJa: r['name_ja'] as string, group: r['group'] as ColumnGroup, role, shipClass, kpi: shipClass === 'destroyer', spec: ds.spec, lineAi: { ...ds.shipAi, maxSpeedMps: ktToMps(b.speed_kt) }, screenAi: role === 'screen' ? ds.shipAi : null, gunnery: ds.gunnery, passRadius2: ds.passRadius2, artKey: shipArtKey(id), magazine: magazineRuleOf(data, id, o) };
  });
  return { kits, enterAtS: enter.slice(0, use.length).map((t) => t + shift), laneDyM: use.map((r) => r['lane_dy_m'] as number), rejoinS: screens ? (rj as number) : null, screenChaseS: b.screen_chase_s ?? null, screenCooldownS: b.screen_cooldown_s ?? null };
}

/** Boot の検査: 記録の艦種（ship_class）をすべてと、v0_1_prototype を持つ全任務（ハードも）の片道の列を 1 回組む（揺らぎなし）。最初の列の任務の値（ノーマル）を返す（無ければ null） */
export function validateColumnMissions(data: GameData): ColumnPlan | null {
  for (const e of data.enemies.enemies as readonly Rec[]) if (e['ship_class'] !== undefined) shipClassOf(data, String(e['id']));
  let first: ColumnPlan | null = null;
  for (const m of data.missionsSeed.missions as readonly Rec[]) {
    const id = m['id'];
    if (typeof id !== 'string' || !m['v0_1_prototype']) continue;
    for (const hard of hasHardVariant(data, id) ? [false, true] : [false]) {
      const p = getColumnPlan(data, getPrototypeMission(data, id, hard), null, false);
      if (p && !first) first = p;
    }
  }
  return first;
}
