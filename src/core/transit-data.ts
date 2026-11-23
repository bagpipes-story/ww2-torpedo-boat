// 列の通過（v0.8.0。us_04「ブラケット海峡の夜」の東京急行。spec-v0800 §4.4・§4.5・§4.8）の data の型と形の検査: missions_seed の v0_1_prototype.transit
// （列の艦の数・間隔・速さ・往路と復路の道・揚陸の秒）。形の検査（鍵の閉じた集合・型・縁と針路）はここ、他の記録・任務を跨ぐ検査（V-T1〜V-T6）は config/transit-mission-data。
// 縁は東西だけ（道は y が一定の線）: 往路の艦は inbound.edge の縁の内 edge_inset_m に現れ、向こうの縁の外 edge_inset_m で海域を出る（揚陸の地に着いた）。
// 着いてから unload_s で復路の艦が outbound.edge の縁の内に現れ、向こうの縁の外で去る。段階（WAIT → IN → AWAY → OUT → GONE）を回すのは S1 の core/ship-transit。
// 片道の列（v0.8.2。us_05「スリガオ海峡・最初の接触」の第三部隊。spec-v0820 §4.2 D-C1・D-C4）: column（列の艦ごとの記録）のある block は片道で、outbound・unload_s・
// spacing_s・cover_leaves_with_outbound を置かない（向こうの縁の外へ出た艦は去って戻らない＝GONE）。column の中身と任務を跨ぐ検査（V-C1〜V-C6）は config/column-mission-data。
// Phaser 非依存・乱数なし（今夜の揺らぎは core/night の敵の 1 件を config が当てる）。

export const TRANSIT_EDGES = ['west', 'east'] as const;
export type TransitEdge = (typeof TRANSIT_EDGES)[number];
/** 縁から海域の内へ向かう針路（V-T2: west → 90・east → 270） */
export const TRANSIT_EDGE_HEADING: Readonly<Record<TransitEdge, number>> = { west: 90, east: 270 };
/** transit の鍵（往復の列はちょうど 10 個）・inbound の鍵（ちょうど 4 個）・outbound の鍵（ちょうど 3 個） */
export const TRANSIT_KEYS = ['ships', 'spacing_s', 'speed_kt', 'edge_inset_m', 'inbound', 'unload_s', 'outbound', 'cover_leaves_with_outbound', 'vila_label_ja', 'source'] as const;
/** 片道の列（column のある block。v0.8.2）の鍵: rejoin_s と見張りの鎖（screen_chase_s・screen_cooldown_s。S3b）は任意（見張りの艦がいる時。V-C4 は config/column-mission-data）。往復の 4 つの鍵は置かない */
export const TRANSIT_ONEWAY_KEYS = ['ships', 'speed_kt', 'edge_inset_m', 'inbound', 'column', 'rejoin_s', 'screen_chase_s', 'screen_cooldown_s', 'vila_label_ja', 'source'] as const;
const TRANSIT_ONEWAY_OPTIONAL = ['rejoin_s', 'screen_chase_s', 'screen_cooldown_s'] as const;
export const TRANSIT_TWOWAY_ONLY_KEYS = ['spacing_s', 'unload_s', 'outbound', 'cover_leaves_with_outbound'] as const;
export const TRANSIT_INBOUND_KEYS = ['edge', 'lane_y_m', 'heading_deg', 'enter_s'] as const;
export const TRANSIT_OUTBOUND_KEYS = ['edge', 'lane_y_m', 'heading_deg'] as const;
/** 列の艦の上限（ハード込み。V-T1。S1 の固定長の段階の配列）。v0.8.2 で 6 → 8（us_05 の第三部隊 7 隻・ハード 8 隻。レーダーの輝点 16 の内＝護衛 ＋ 列） */
export const TRANSIT_MAX_SHIPS = 8;

export interface TransitInboundRecord {
  edge: TransitEdge;
  lane_y_m: number;
  heading_deg: number;
  /** 1 隻目が往路の縁の内に現れる実秒（出撃から） */
  enter_s: number;
}

export interface TransitOutboundRecord {
  edge: TransitEdge;
  lane_y_m: number;
  heading_deg: number;
}

interface TransitBlockBase {
  ships: number;
  speed_kt: number;
  edge_inset_m: number;
  inbound: TransitInboundRecord;
  vila_label_ja: string;
  source: string;
}

/** v0_1_prototype.transit の往復の列（v0.8.0。us_04） */
export interface TransitTwoWayBlock extends TransitBlockBase {
  spacing_s: number;
  unload_s: number;
  outbound: TransitOutboundRecord;
  cover_leaves_with_outbound: boolean;
  column?: undefined;
}

/** v0_1_prototype.transit の片道の列（v0.8.2。us_05）: column は艦ごとの記録の配列（中身の検査は config/column-mission-data の V-C1）・rejoin_s は見張りの艦がいる時の秒 */
export interface TransitOneWayBlock extends TransitBlockBase {
  column: unknown[];
  rejoin_s?: number;
  screen_chase_s?: number;
  screen_cooldown_s?: number;
  outbound?: undefined;
}

/** v0_1_prototype.transit（column があれば片道） */
export type TransitBlock = TransitTwoWayBlock | TransitOneWayBlock;

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

function closedKeys(raw: Rec, keys: readonly string[], bad: (msg: string) => never, at: string): void {
  const unknown = Object.keys(raw).filter((k) => !keys.includes(k));
  const missing = keys.filter((k) => !(k in raw));
  if (unknown.length > 0 || missing.length > 0) bad(`${at}鍵はちょうど ${keys.join('・')}（知らない鍵 ${unknown.join('・') || 'なし'}・欠け ${missing.join('・') || 'なし'}）`);
}

/** 道の 1 本（inbound・outbound）: 縁は west か east、y と針路は数、針路は縁から内へ向く（V-T2 の形） */
function checkLeg(raw: unknown, name: 'inbound' | 'outbound', keys: readonly string[], bad: (msg: string) => never): void {
  if (!isObj(raw)) return bad(`${name} は object`);
  closedKeys(raw, keys, bad, `${name} の`);
  const edge = raw['edge'];
  if (!(TRANSIT_EDGES as readonly unknown[]).includes(edge)) return bad(`${name}.edge は ${TRANSIT_EDGES.join('・')} のどれか（${String(edge)}）`);
  for (const k of keys) if (k !== 'edge' && !isNum(raw[k])) bad(`${name}.${k} は数（${String(raw[k])}）`);
  const want = TRANSIT_EDGE_HEADING[edge as TransitEdge];
  if (raw['heading_deg'] !== want) bad(`${name}.heading_deg は ${name}.edge（${String(edge)}）から海域の内へ向く ${want}（${String(raw['heading_deg'])}。V-T2）`);
}

/**
 * 形の検査（V-T1 の形・V-T2 の縁と針路・V-T4 の形）: 往復の列の鍵はちょうど TRANSIT_KEYS・ships は 1〜TRANSIT_MAX_SHIPS の整数・spacing_s・speed_kt・edge_inset_m は正・
 * enter_s・unload_s は 0 以上・outbound.edge は inbound.edge の反対（来た海峡を戻る）・cover_leaves_with_outbound は真偽・文字は空でない。label は「<任務>.v0_1_prototype.transit」。
 * column のある片道の列（v0.8.2）は鍵が TRANSIT_ONEWAY_KEYS の内（rejoin_s だけ任意。往復の 4 つの鍵は置けない＝V-C4）・column は配列（中身は config/column-mission-data）
 */
export function readTransitBlock(raw: unknown, label: string): TransitBlock {
  const bad = (msg: string): never => {
    throw new Error(`${label}: ${msg}（spec-v0800 §4.8）`);
  };
  if (!isObj(raw)) return bad('object でない');
  const oneWay = raw['column'] !== undefined;
  if (oneWay) {
    const twoWay = TRANSIT_TWOWAY_ONLY_KEYS.filter((k) => k in raw);
    if (twoWay.length > 0) bad(`片道の列（column）には ${TRANSIT_TWOWAY_ONLY_KEYS.join('・')} を置かない（${twoWay.join('・')}。向こうの縁の外へ出た艦は去って戻らない。V-C4・spec-v0820 §4.2）`);
    const rest = Object.fromEntries(Object.entries(raw).filter(([k]) => !(TRANSIT_ONEWAY_OPTIONAL as readonly string[]).includes(k)));
    closedKeys(rest, TRANSIT_ONEWAY_KEYS.filter((k) => !(TRANSIT_ONEWAY_OPTIONAL as readonly string[]).includes(k)), bad, '片道の列の');
    if (!Array.isArray(raw['column'])) bad('column は配列（列の艦ごとの記録）');
  } else closedKeys(raw, TRANSIT_KEYS, bad, '');
  const ships = raw['ships'];
  if (!(isNum(ships) && Number.isInteger(ships) && ships >= 1 && ships <= TRANSIT_MAX_SHIPS)) bad(`ships は 1〜${TRANSIT_MAX_SHIPS} の整数（${String(ships)}。V-T1）`);
  for (const k of oneWay ? (['speed_kt', 'edge_inset_m'] as const) : (['spacing_s', 'speed_kt', 'edge_inset_m'] as const)) if (!(isNum(raw[k]) && (raw[k] as number) > 0)) bad(`${k} は正の数（${String(raw[k])}。V-T1）`);
  checkLeg(raw['inbound'], 'inbound', TRANSIT_INBOUND_KEYS, bad);
  const inb = raw['inbound'] as Rec;
  if (!((inb['enter_s'] as number) >= 0)) bad(`inbound.enter_s は 0 以上（${String(inb['enter_s'])}）`);
  if (!oneWay) {
    if (!(isNum(raw['unload_s']) && (raw['unload_s'] as number) >= 0)) bad(`unload_s は 0 以上の数（${String(raw['unload_s'])}。V-T4）`);
    checkLeg(raw['outbound'], 'outbound', TRANSIT_OUTBOUND_KEYS, bad);
    if ((raw['outbound'] as Rec)['edge'] === inb['edge']) bad(`outbound.edge は inbound.edge（${String(inb['edge'])}）の反対（揚陸の地から来た海峡を戻る。V-T2）`);
    if (typeof raw['cover_leaves_with_outbound'] !== 'boolean') bad('cover_leaves_with_outbound は true か false');
  }
  for (const k of ['vila_label_ja', 'source'] as const) if (!nonEmpty(raw[k])) bad(`${k} は空でない文字列`);
  return raw as unknown as TransitBlock;
}

/** 縁 edge の内 inset m に現れる x（west は inset・east は幅 − inset） */
export function transitAppearX(edge: TransitEdge, width: number, inset: number): number {
  return edge === 'west' ? inset : width - inset;
}

/** edge から入った艦が向こうの縁の外 inset m で去る x（west から入れば幅 + inset・east から入れば −inset）。現れてからの道のりは幅ちょうど */
export function transitGoneX(edge: TransitEdge, width: number, inset: number): number {
  return edge === 'west' ? width + inset : -inset;
}

/** 最後の艦（0 始まりで ships − 1）が復路で去る実秒: 入り ＋ 間隔 × (ships − 1) ＋ 渡り ＋ 揚陸 ＋ 渡り（V-T3。crossS は道の端から端の実秒） */
export function transitLastGoneS(enterS: number, ships: number, spacingS: number, crossS: number, unloadS: number): number {
  return enterS + spacingS * (ships - 1) + crossS + unloadS + crossS;
}

/** 片道の列（v0.8.2）の最後の艦が向こうの縁の外へ去る実秒: その艦の入りの秒 ＋ 渡り（V-C5。crossS は道の端から端の実秒） */
export function transitOneWayLastGoneS(lastEnterS: number, crossS: number): number {
  return lastEnterS + crossS;
}
