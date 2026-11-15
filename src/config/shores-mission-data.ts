// 海峡の両岸（v0.8.0。us_04「ブラケット海峡の夜」。spec-v0800 §4.3）の任務の読み出し: 任務の v0_1_prototype.shores があれば、北の岸（y 0 の縁の外）と南の岸（海域の高さの縁の外）の
// 陸の幅・名の字・陸の切れ目（水道）から世界の値（ShoresSetup）を組み、起動時の検査 V-S1〜V-S3 をする（例外は鍵を名指す日本語）。今の岸（coast。南だけ・v0.4.2）とは別の block で
// 一緒に置けない（今の任務の岸の絵と「岸 N m」の矢印は変えない）。艇は今のまま海域の縁で止まる（陸の当たりは要らない）。絵は S2（systems/strait-terrain・coast-fx）、陸の反射の帯は S1（core/strait-geometry）。
// 岸の 1 辺の形（両岸とも同じ）: land_m（陸の幅）・labels（陸の名の字。x は字の中心で陸の上）・gaps_m（任意。陸の無い x の区間）・gap_label_ja（切れ目があるときだけ。その名）。
import type { GameData, PrototypeMission } from './game-data';
import { getPrototypeMission, hasHardVariant } from './mission-data';

/** V-S2: 帰投の輪が岸の線からこの m の内にかかるなら、その岸の切れ目（水道）の真上にある（輪の x の幅が切れ目の中） */
export const SHORES_CHECK_RING_NEAR_M = 400;
/** V-S3: 両岸と一緒に置けない v0_1_prototype の鍵（今の岸・屋我地の陰の地形） */
export const SHORES_EXCLUSIVE_KEYS = ['coast', 'evac'] as const;
const SHORES_KEYS = ['north', 'south', 'source'] as const;
const SIDE_KEYS = ['land_m', 'labels', 'gaps_m', 'gap_label_ja'] as const;

export interface ShoreSide {
  /** 縁の外に描く陸の幅 m（見た目だけ） */
  landM: number;
  /** 陸の名の字（x は字の中心） */
  labels: { labelJa: string; x: number }[];
  /** 陸の切れ目（水道。陸を描かず海が続く）の x の区間（昇順・重ならない） */
  gaps: { x0: number; x1: number }[];
  /** 切れ目の名（切れ目が無ければ ''） */
  gapLabelJa: string;
}

/** 海峡の両岸の世界の値（WorldSetup.shores） */
export interface ShoresSetup {
  north: ShoreSide;
  south: ShoreSide;
}

type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/** V-S1 の 1 辺: 陸の幅は正・字は空でなく 0〜幅の陸の上・切れ目は 0〜幅の中で昇順に重ならず陸が残る・切れ目があるときだけ名 */
function readSide(raw: unknown, side: 'north' | 'south', width: number, bad: (v: string, msg: string) => never): ShoreSide {
  if (!isObj(raw)) return bad('V-S1', `${side} は object`);
  const unknown = Object.keys(raw).filter((k) => !(SIDE_KEYS as readonly string[]).includes(k));
  if (unknown.length > 0 || raw['land_m'] === undefined || raw['labels'] === undefined) bad('V-S1', `${side} の鍵は land_m・labels と任意の gaps_m・gap_label_ja（知らない鍵 ${unknown.join('・') || 'なし'}）`);
  const landM = raw['land_m'];
  if (!(isNum(landM) && landM > 0)) bad('V-S1', `${side}.land_m は正（${String(landM)}）`);
  const gapsRaw = raw['gaps_m'] ?? [];
  if (!Array.isArray(gapsRaw) || !gapsRaw.every((g) => Array.isArray(g) && g.length === 2 && g.every(isNum))) return bad('V-S1', `${side}.gaps_m は [x0, x1] の数の組の配列`);
  const gaps = (gapsRaw as number[][]).map((g) => ({ x0: g[0]!, x1: g[1]! }));
  let open = 0;
  gaps.forEach((g, i) => {
    if (!(g.x0 >= 0 && g.x0 < g.x1 && g.x1 <= width)) bad('V-S1', `${side}.gaps_m[${i}]（${g.x0}, ${g.x1}）は 0 ≤ x0 < x1 ≤ 海域の幅（${width}）`);
    if (i > 0 && !(g.x0 > gaps[i - 1]!.x1)) bad('V-S1', `${side}.gaps_m[${i}] は前の切れ目より東で重ならない（昇順）`);
    open += g.x1 - g.x0;
  });
  if (!(open < width)) bad('V-S1', `${side}.gaps_m は陸を残す（切れ目の合計 ${open} m < 幅 ${width} m）`);
  const gapLabel = raw['gap_label_ja'];
  if (gaps.length > 0 ? !nonEmpty(gapLabel) : gapLabel !== undefined) bad('V-S1', `${side}.gap_label_ja は切れ目（gaps_m）があるときだけ・空でない文字列`);
  const labelsRaw = raw['labels'];
  if (!Array.isArray(labelsRaw)) return bad('V-S1', `${side}.labels は配列`);
  const labels = labelsRaw.map((l, i) => {
    if (!isObj(l) || Object.keys(l).length !== 2 || !nonEmpty(l['label_ja']) || !isNum(l['x_m'])) return bad('V-S1', `${side}.labels[${i}] はちょうど label_ja（空でない）・x_m（数）`);
    const x = l['x_m'] as number;
    if (!(x >= 0 && x <= width) || gaps.some((g) => x > g.x0 && x < g.x1)) bad('V-S1', `${side}.labels[${i}].x_m（${x}）は 0〜海域の幅の陸の上（切れ目の外）`);
    return { labelJa: l['label_ja'] as string, x };
  });
  return { landM: landM as number, labels, gaps, gapLabelJa: gaps.length > 0 ? (gapLabel as string) : '' };
}

/** 任務の両岸の値。v0_1_prototype.shores の無い任務は null。壊れていれば「<任務>.v0_1_prototype.shores…: …（V-Sn）」 */
export function getShoresParams(data: GameData, mission: PrototypeMission): ShoresSetup | null {
  const m = (data.missionsSeed.missions as readonly Rec[]).find((x) => x['id'] === mission.id);
  const proto = m?.['v0_1_prototype'] as Rec | undefined;
  const raw = proto?.['shores'];
  if (!proto || raw === undefined) return null;
  const at = `${mission.id}.v0_1_prototype.shores`;
  const bad = (v: string, msg: string): never => {
    throw new Error(`${at}: ${msg}（${v}・spec-v0800 §4.8）`);
  };
  // V-S3 置き場
  for (const k of SHORES_EXCLUSIVE_KEYS) if (proto[k] !== undefined) bad('V-S3', `v0_1_prototype.${k} と同居しない（今の岸・地形の絵を変えない）`);
  // V-S1 形
  if (!isObj(raw)) return bad('V-S1', 'object でない');
  const keys = Object.keys(raw);
  if (keys.length !== SHORES_KEYS.length || !SHORES_KEYS.every((k) => k in raw)) bad('V-S1', `鍵はちょうど ${SHORES_KEYS.join('・')}`);
  if (!nonEmpty(raw['source'])) bad('V-S1', 'source は空でない文字列');
  const { width, height } = mission.bounds;
  const north = readSide(raw['north'], 'north', width, bad);
  const south = readSide(raw['south'], 'south', width, bad);
  // V-S2 輪と礁: 岸の線の近くにかかる輪はその岸の切れ目の真上・礁は輪にも出発点にもかからない
  const rp = mission.returnPoint;
  const inGap = (s: ShoreSide): boolean => s.gaps.some((g) => rp.x - rp.radiusM >= g.x0 && rp.x + rp.radiusM <= g.x1);
  if (rp.y - rp.radiusM < SHORES_CHECK_RING_NEAR_M && !inGap(north)) bad('V-S2', `帰投の輪（${rp.x}, ${rp.y}・半径 ${rp.radiusM}）は北の岸から ${SHORES_CHECK_RING_NEAR_M} m の内にかかるので、北の切れ目（gaps_m）の真上に置く`);
  if (rp.y + rp.radiusM > height - SHORES_CHECK_RING_NEAR_M && !inGap(south)) bad('V-S2', `帰投の輪（${rp.x}, ${rp.y}・半径 ${rp.radiusM}）は南の岸から ${SHORES_CHECK_RING_NEAR_M} m の内にかかるので、南の切れ目（gaps_m）の真上に置く`);
  const ps = mission.playerStart;
  mission.shallows.forEach((r, i) => {
    const cx = Math.min(Math.max(rp.x, r.x), r.x + r.w);
    const cy = Math.min(Math.max(rp.y, r.y), r.y + r.h);
    if ((rp.x - cx) ** 2 + (rp.y - cy) ** 2 < rp.radiusM * rp.radiusM) bad('V-S2', `shallows[${i}]（礁）が帰投の輪にかかる`);
    if (ps.x >= r.x && ps.x <= r.x + r.w && ps.y >= r.y && ps.y <= r.y + r.h) bad('V-S2', `shallows[${i}]（礁）が出発点（${ps.x}, ${ps.y}）にかかる`);
  });
  return { north, south };
}

/** WorldSetup に展開する部分: 両岸の無い任務は {}（shores の鍵ごと出ない＝ほかの任務の setup の snapshot が変わらない） */
export function shoresSetupPart(data: GameData, mission: PrototypeMission): { shores?: ShoresSetup } {
  const p = getShoresParams(data, mission);
  return p ? { shores: p } : {};
}

/** Boot の検査: v0_1_prototype を持つ全任務（ハードも）を 1 回組む（壊れていれば Boot で止まる）。最初の両岸の任務の値（ノーマル）を返す（無ければ null） */
export function validateShoresMissions(data: GameData): ShoresSetup | null {
  let first: ShoresSetup | null = null;
  for (const m of data.missionsSeed.missions as readonly Rec[]) {
    const id = m['id'];
    if (typeof id !== 'string' || !m['v0_1_prototype']) continue;
    for (const hard of hasHardVariant(data, id) ? [false, true] : [false]) {
      const p = getShoresParams(data, getPrototypeMission(data, id, hard));
      if (p && !first) first = p;
    }
  }
  return first;
}
