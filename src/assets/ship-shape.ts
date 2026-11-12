// v0.7.0 S2a（アートと音①：コードで描く絵）: 艦（駆逐艦 3 種・輸送船）と大発の絵の形（Phaser に依らない）。ship-art-config の置き方（割合）を世界単位の輪郭と部品の並びにする。
// 艦首が上（y 0）・原点はテクスチャの左上（中心線は x = B/2）。assets/ship-art が ArtPen で描き、tests/ship-art が形の決まり（輪郭は矩形の内・艦首が上の中央・長さの 0.19〜0.86 は
// 幅いっぱい＝R22・部品は縁から内・細部 ≥ 2 単位＝R17・大発の道板 0.76B）を確かめる。船形の点列は S1 の boat-shape の hullOutline・hullHalfWidthAt をそのまま使う。
import { ART_DETAIL_MIN_UNITS, ART_RIM_UNITS, ART_SIDE_BAND_MIN_BEAM_UNITS } from '../config/boat-art-config';
import {
  BARGE_CARGO_DOTS, BARGE_CARGO_DOT_R, BARGE_RAMP_BEAM_SHARE, BARGE_RAMP_LEN_SHARE, BARGE_STERN_FROM, BARGE_STERN_INSET_UNITS, BARGE_STERN_TO, BARGE_WELL_FROM,
  BARGE_WELL_INSET_UNITS, BARGE_WELL_TO, SHIP_BARREL_LEN_SHARE_SINGLE, SHIP_BARREL_LEN_SHARE_TWIN, SHIP_BARREL_UNITS, SHIP_BRIDGE_TOP_ALPHA, SHIP_BRIDGE_TOP_INSET,
  SHIP_CENTER_ALPHA, SHIP_CENTER_FROM, SHIP_CENTER_HALF_W_OF_B, SHIP_CENTER_TO, SHIP_CORNER_UNITS, SHIP_DERRICK_UNITS, SHIP_DOT_ALPHA, SHIP_DOT_R, SHIP_FORECASTLE_UNITS,
  SHIP_FUNNEL_RING_UNITS, SHIP_HATCH_BORDER_UNITS, SHIP_MAST_R, SHIP_MOUNT_LEN_SHARE, SHIP_SIDE_BAND_FROM, SHIP_SIDE_BAND_TO, SHIP_SIDE_BAND_UNITS, SHIP_TUBE_LEN_SHARE,
  SHIP_TUB_R, SHIP_TWIN_BARREL_DX, SHIP_TWIN_MIN_B, type ShipArtLayout,
} from '../config/ship-art-config';
import type { ArtPart } from './art-pen';
import { hullHalfWidthAt, hullOutline, type Pt } from './boat-shape';

/** 色の役: 縁（リム）・地（甲板）・側の暗い帯・上部構造・暗い細部（砲身・煙突・ハッチ）・明るい点・中間（台） */
export type ShipTone = 'rim' | 'deck' | 'side' | 'super' | 'detail' | 'highlight' | 'mid';
export type ShipPart = ArtPart<ShipTone>;
/** 艦の絵（世界単位）: 輪郭（リムの色で塗る）と、その上に順に描く部品 */
export interface ShipShape {
  readonly lengthUnits: number;
  readonly beamUnits: number;
  readonly outline: readonly Pt[];
  readonly parts: readonly ShipPart[];
}

/** 側の帯: 右舷（side 1）か左舷（−1）の、縁から inset0〜inset1 の間の帯（長さの f0〜f1 を 10 に刻む） */
function sideBand(hull: ShipArtLayout['hull'], L: number, B: number, inset0: number, inset1: number, f0: number, f1: number, side: 1 | -1): Pt[] {
  const cx = B / 2;
  const n = 10;
  const outer: Pt[] = [];
  const inner: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const f = f0 + ((f1 - f0) * i) / n;
    const hw = hullHalfWidthAt(hull, f, B);
    outer.push({ x: cx + side * Math.max(0, hw - inset0), y: f * L });
    inner.push({ x: cx + side * Math.max(0, hw - inset1), y: f * L });
  }
  return outer.concat(inner.reverse());
}

/** 置き方 → 艦の絵（世界単位） */
export function shipShape(layout: ShipArtLayout, L: number, B: number): ShipShape {
  const cx = B / 2;
  const parts: ShipPart[] = [];
  const corner = SHIP_CORNER_UNITS;
  // 地（リムの内側）と、幅 10 単位以上の艦の側の暗い帯、中心線の明るい筋（枕の陰影）
  parts.push({ kind: 'poly', pts: hullOutline(layout.hull, L, B, ART_RIM_UNITS), tone: 'deck', alpha: 1 });
  if (B >= ART_SIDE_BAND_MIN_BEAM_UNITS) {
    for (const side of [1, -1] as const) {
      parts.push({ kind: 'poly', pts: sideBand(layout.hull, L, B, ART_RIM_UNITS, ART_RIM_UNITS + SHIP_SIDE_BAND_UNITS, SHIP_SIDE_BAND_FROM, SHIP_SIDE_BAND_TO, side), tone: 'side', alpha: 1 });
    }
  }
  const chw = SHIP_CENTER_HALF_W_OF_B * B;
  parts.push({ kind: 'rect', x: cx - chw, y: SHIP_CENTER_FROM * L, w: chw * 2, h: (SHIP_CENTER_TO - SHIP_CENTER_FROM) * L, r: chw, tone: 'highlight', alpha: SHIP_CENTER_ALPHA });
  // 船首楼の段（明るい横線）か切れ込み（暗い帯）
  if (layout.forecastle) {
    const [f, kind] = layout.forecastle;
    const hw = hullHalfWidthAt(layout.hull, f, B) - ART_RIM_UNITS - SHIP_SIDE_BAND_UNITS;
    parts.push({ kind: 'rect', x: cx - hw, y: f * L - SHIP_FORECASTLE_UNITS / 2, w: hw * 2, h: SHIP_FORECASTLE_UNITS, r: 0, tone: kind === 'line' ? 'highlight' : 'side', alpha: kind === 'line' ? 0.7 : 1 });
  }
  // 船倉のハッチ（明るい縁の暗い矩形）と荷役の腕（輸送船）
  for (const [f0, f1, wf] of layout.hatches) {
    const w = wf * B;
    const h = (f1 - f0) * L;
    const bd = SHIP_HATCH_BORDER_UNITS;
    parts.push({ kind: 'rect', x: cx - w / 2, y: f0 * L, w, h, r: corner / 2, tone: 'super', alpha: 1 });
    parts.push({ kind: 'rect', x: cx - w / 2 + bd, y: f0 * L + bd, w: w - bd * 2, h: h - bd * 2, r: 0, tone: 'detail', alpha: 1 });
  }
  for (const [f0, f1] of layout.derricks) parts.push({ kind: 'rect', x: cx - SHIP_DERRICK_UNITS / 2, y: f0 * L, w: SHIP_DERRICK_UNITS, h: (f1 - f0) * L, r: 1, tone: 'super', alpha: 1 });
  // 艦橋（上部構造の塊。上面は明るい）
  {
    const [f0, f1, wf] = layout.bridge;
    const w = wf * B;
    const h = (f1 - f0) * L;
    const ins = SHIP_BRIDGE_TOP_INSET;
    parts.push({ kind: 'rect', x: cx - w / 2, y: f0 * L, w, h, r: corner, tone: 'super', alpha: 1 });
    parts.push({ kind: 'rect', x: cx - w / 2 + ins, y: f0 * L + ins, w: w - ins * 2, h: h - ins * 2, r: corner / 2, tone: 'highlight', alpha: SHIP_BRIDGE_TOP_ALPHA });
  }
  // 煙突（暗い楕円に明るい縁）
  for (const [f, wf, lf] of layout.funnels) {
    const rx = (wf * B) / 2;
    const ry = (lf * L) / 2;
    parts.push({ kind: 'ellipse', cx, cy: f * L, rx, ry, tone: 'highlight', alpha: 1 });
    parts.push({ kind: 'ellipse', cx, cy: f * L, rx: rx - SHIP_FUNNEL_RING_UNITS, ry: ry - SHIP_FUNNEL_RING_UNITS, tone: 'detail', alpha: 1 });
  }
  // 砲: 連装の箱（砲身 2 本）か単装の丸い台（砲身 1 本）。台は中間の色（既定ズームで地と見分く）・砲身は暗い細部・中心に明るい点
  for (const [f, wf, dir] of layout.mounts) {
    const w = wf * B;
    const cy = f * L;
    const twin = wf >= SHIP_TWIN_MIN_B;
    const half = twin ? (SHIP_MOUNT_LEN_SHARE * L) / 2 : w / 2;
    const bl = (twin ? SHIP_BARREL_LEN_SHARE_TWIN : SHIP_BARREL_LEN_SHARE_SINGLE) * L;
    const by = dir === 1 ? cy - half - bl : cy + half;
    for (const dx of twin ? [-SHIP_TWIN_BARREL_DX, SHIP_TWIN_BARREL_DX] : [0]) {
      parts.push({ kind: 'rect', x: cx + dx - SHIP_BARREL_UNITS / 2, y: by, w: SHIP_BARREL_UNITS, h: bl, r: 0.5, tone: 'detail', alpha: 1 });
    }
    if (twin) parts.push({ kind: 'rect', x: cx - w / 2, y: cy - half, w, h: half * 2, r: corner, tone: 'mid', alpha: 1 });
    else parts.push({ kind: 'disc', cx, cy, r: w / 2, tone: 'mid', alpha: 1 });
    parts.push({ kind: 'disc', cx, cy, r: SHIP_DOT_R, tone: 'highlight', alpha: SHIP_DOT_ALPHA });
  }
  // 魚雷の発射管の台（中央に明るい筋）・機銃の丸い台・マストの点
  for (const [f, wf] of layout.tubes) {
    const w = wf * B;
    const h = SHIP_TUBE_LEN_SHARE * L;
    parts.push({ kind: 'rect', x: cx - w / 2, y: f * L - h / 2, w, h, r: corner / 2, tone: 'mid', alpha: 1 });
    parts.push({ kind: 'rect', x: cx - ART_DETAIL_MIN_UNITS / 2, y: f * L - h / 2 + 1, w: ART_DETAIL_MIN_UNITS, h: h - 2, r: 1, tone: 'highlight', alpha: 0.7 });
  }
  for (const [f, xf] of layout.tubs) {
    parts.push({ kind: 'disc', cx: cx + xf * B, cy: f * L, r: SHIP_TUB_R, tone: 'mid', alpha: 1 });
    parts.push({ kind: 'disc', cx: cx + xf * B, cy: f * L, r: SHIP_DOT_R, tone: 'highlight', alpha: SHIP_DOT_ALPHA });
  }
  for (const f of layout.masts) parts.push({ kind: 'disc', cx, cy: f * L, r: SHIP_MAST_R, tone: 'highlight', alpha: 1 });
  return { lengthUnits: L, beamUnits: B, outline: hullOutline(layout.hull, L, B), parts };
}

/** 大発の絵（世界単位）。輪郭は v0.4.2 の placeholder のまま（艇首の平らな道板 0.76B・道板 0.08L・艇尾は角＝見分けの鍵）: 地・開いた荷台（暗い内側）・荷の点・艇尾の機関と操舵の塊 */
export function bargeShape(L: number, B: number): ShipShape {
  const cx = B / 2;
  const x0 = ((1 - BARGE_RAMP_BEAM_SHARE) / 2) * B;
  const x1 = B - x0;
  const ry = BARGE_RAMP_LEN_SHARE * L;
  const outline: Pt[] = [{ x: x0, y: 0 }, { x: x1, y: 0 }, { x: x1, y: ry }, { x: B, y: ry }, { x: B, y: L }, { x: 0, y: L }, { x: 0, y: ry }, { x: x0, y: ry }];
  const rim = ART_RIM_UNITS;
  const wi = BARGE_WELL_INSET_UNITS;
  const si = BARGE_STERN_INSET_UNITS;
  const parts: ShipPart[] = [
    { kind: 'rect', x: rim, y: ry + rim, w: B - rim * 2, h: L - ry - rim * 2, r: 0, tone: 'deck', alpha: 1 },
    { kind: 'rect', x: wi, y: BARGE_WELL_FROM * L, w: B - wi * 2, h: (BARGE_WELL_TO - BARGE_WELL_FROM) * L, r: 0.5, tone: 'side', alpha: 1 },
  ];
  for (const [f, dx] of BARGE_CARGO_DOTS) parts.push({ kind: 'disc', cx: cx + dx, cy: f * L, r: BARGE_CARGO_DOT_R, tone: 'highlight', alpha: SHIP_DOT_ALPHA });
  parts.push({ kind: 'rect', x: si, y: BARGE_STERN_FROM * L, w: B - si * 2, h: (BARGE_STERN_TO - BARGE_STERN_FROM) * L, r: 0.8, tone: 'super', alpha: 1 });
  parts.push({ kind: 'disc', cx, cy: ((BARGE_STERN_FROM + BARGE_STERN_TO) / 2) * L, r: BARGE_CARGO_DOT_R, tone: 'highlight', alpha: SHIP_DOT_ALPHA });
  return { lengthUnits: L, beamUnits: B, outline, parts };
}

/** 部品の x・y の範囲（世界単位）。tests が船体の内に収まるかを見る */
export function shipPartBounds(p: ShipPart): { x0: number; x1: number; y0: number; y1: number } {
  if (p.kind === 'disc') return { x0: p.cx - p.r, x1: p.cx + p.r, y0: p.cy - p.r, y1: p.cy + p.r };
  if (p.kind === 'ellipse') return { x0: p.cx - p.rx, x1: p.cx + p.rx, y0: p.cy - p.ry, y1: p.cy + p.ry };
  if (p.kind === 'rect') return { x0: p.x, x1: p.x + p.w, y0: p.y, y1: p.y + p.h };
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (const q of p.pts) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  return { x0, x1, y0, y1 };
}
