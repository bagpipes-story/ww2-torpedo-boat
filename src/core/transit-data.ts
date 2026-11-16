// 列の通過（v0.8.0。us_04「ブラケット海峡の夜」の東京急行。spec-v0800 §4.4・§4.5・§4.8）の data の型と形の検査: missions_seed の v0_1_prototype.transit
// （列の艦の数・間隔・速さ・往路と復路の道・揚陸の秒）。形の検査（鍵の閉じた集合・型・縁と針路）はここ、他の記録・任務を跨ぐ検査（V-T1〜V-T6）は config/transit-mission-data。
// 縁は東西だけ（道は y が一定の線）: 往路の艦は inbound.edge の縁の内 edge_inset_m に現れ、向こうの縁の外 edge_inset_m で海域を出る（揚陸の地に着いた）。
// 着いてから unload_s で復路の艦が outbound.edge の縁の内に現れ、向こうの縁の外で去る。段階（WAIT → IN → AWAY → OUT → GONE）を回すのは S1 の core/ship-transit。
// Phaser 非依存・乱数なし（今夜の揺らぎは core/night の敵の 1 件を config が当てる）。

export const TRANSIT_EDGES = ['west', 'east'] as const;
export type TransitEdge = (typeof TRANSIT_EDGES)[number];
/** 縁から海域の内へ向かう針路（V-T2: west → 90・east → 270） */
export const TRANSIT_EDGE_HEADING: Readonly<Record<TransitEdge, number>> = { west: 90, east: 270 };
/** transit の鍵（ちょうど 10 個）・inbound の鍵（ちょうど 4 個）・outbound の鍵（ちょうど 3 個） */
export const TRANSIT_KEYS = ['ships', 'spacing_s', 'speed_kt', 'edge_inset_m', 'inbound', 'unload_s', 'outbound', 'cover_leaves_with_outbound', 'vila_label_ja', 'source'] as const;
export const TRANSIT_INBOUND_KEYS = ['edge', 'lane_y_m', 'heading_deg', 'enter_s'] as const;
export const TRANSIT_OUTBOUND_KEYS = ['edge', 'lane_y_m', 'heading_deg'] as const;
/** 列の艦の上限（ハード込み。V-T1。S1 の固定長の段階の配列と、レーダーの掃引の艦 ≤ 8 の内＝護衛 1 ＋ 列 6） */
export const TRANSIT_MAX_SHIPS = 6;

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

/** v0_1_prototype.transit */
export interface TransitBlock {
  ships: number;
  spacing_s: number;
  speed_kt: number;
  edge_inset_m: number;
  inbound: TransitInboundRecord;
  unload_s: number;
  outbound: TransitOutboundRecord;
  cover_leaves_with_outbound: boolean;
  vila_label_ja: string;
  source: string;
}

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
 * 形の検査（V-T1 の形・V-T2 の縁と針路・V-T4 の形）: 鍵はちょうど TRANSIT_KEYS・ships は 1〜TRANSIT_MAX_SHIPS の整数・spacing_s・speed_kt・edge_inset_m は正・
 * enter_s・unload_s は 0 以上・outbound.edge は inbound.edge の反対（来た海峡を戻る）・cover_leaves_with_outbound は真偽・文字は空でない。label は「<任務>.v0_1_prototype.transit」
 */
export function readTransitBlock(raw: unknown, label: string): TransitBlock {
  const bad = (msg: string): never => {
    throw new Error(`${label}: ${msg}（spec-v0800 §4.8）`);
  };
  if (!isObj(raw)) return bad('object でない');
  closedKeys(raw, TRANSIT_KEYS, bad, '');
  const ships = raw['ships'];
  if (!(isNum(ships) && Number.isInteger(ships) && ships >= 1 && ships <= TRANSIT_MAX_SHIPS)) bad(`ships は 1〜${TRANSIT_MAX_SHIPS} の整数（${String(ships)}。V-T1）`);
  for (const k of ['spacing_s', 'speed_kt', 'edge_inset_m'] as const) if (!(isNum(raw[k]) && (raw[k] as number) > 0)) bad(`${k} は正の数（${String(raw[k])}。V-T1）`);
  if (!(isNum(raw['unload_s']) && (raw['unload_s'] as number) >= 0)) bad(`unload_s は 0 以上の数（${String(raw['unload_s'])}。V-T4）`);
  checkLeg(raw['inbound'], 'inbound', TRANSIT_INBOUND_KEYS, bad);
  checkLeg(raw['outbound'], 'outbound', TRANSIT_OUTBOUND_KEYS, bad);
  const inb = raw['inbound'] as Rec;
  const outb = raw['outbound'] as Rec;
  if (!((inb['enter_s'] as number) >= 0)) bad(`inbound.enter_s は 0 以上（${String(inb['enter_s'])}）`);
  if (outb['edge'] === inb['edge']) bad(`outbound.edge は inbound.edge（${String(inb['edge'])}）の反対（揚陸の地から来た海峡を戻る。V-T2）`);
  if (typeof raw['cover_leaves_with_outbound'] !== 'boolean') bad('cover_leaves_with_outbound は true か false');
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
