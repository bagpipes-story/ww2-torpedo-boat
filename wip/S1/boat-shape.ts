// v0.7.0 S1（アートと音①：コードで描く絵）: 艇の絵の形（Phaser に依らない）。boat-art-config の置き方（割合）を世界単位の輪郭と部品の並びにする。
// 艇首が上（y 0）・原点はテクスチャの左上（艇の中心線は x = B/2）。assets/boat-art が ArtPen で描き、tests/boat-art が形の決まり（輪郭は矩形の内・艇首が上の中央・
// 艇尾の幅・部品は縁から内・細部 ≥ 2 単位＝R17）を確かめる。
import {
  ART_DETAIL_MIN_UNITS, ART_RIM_UNITS, BOAT_ART_BOW_INSET_FACTOR, BOAT_ART_CENTER_ALPHA, BOAT_ART_CENTER_FROM, BOAT_ART_CENTER_HALF_W_OF_B, BOAT_ART_CENTER_TO,
  BOAT_ART_CORNER_UNITS, BOAT_ART_SCREEN_UNITS, type BoatArtLayout,
} from '../config/boat-art-config';

export interface Pt {
  readonly x: number;
  readonly y: number;
}
/** 色の役: 縁（リム）・地（甲板）・上部構造・中間（筒・台）・明るい点 */
export type BoatTone = 'rim' | 'deck' | 'super' | 'mid' | 'highlight';
export type BoatPart =
  | { readonly kind: 'poly'; readonly pts: readonly Pt[]; readonly tone: BoatTone; readonly alpha: number }
  | { readonly kind: 'rect'; readonly x: number; readonly y: number; readonly w: number; readonly h: number; readonly r: number; readonly tone: BoatTone; readonly alpha: number }
  | { readonly kind: 'disc'; readonly cx: number; readonly cy: number; readonly r: number; readonly tone: BoatTone; readonly alpha: number };
/** 艇の絵（世界単位）: 輪郭（リムの色で塗る）と、その上に順に描く部品 */
export interface BoatShape {
  readonly lengthUnits: number;
  readonly beamUnits: number;
  readonly outline: readonly Pt[];
  readonly parts: readonly BoatPart[];
}

/** 長さの割合 yFrac での船体の半幅（単位）。stations を線形に補間 */
export function hullHalfWidthAt(hull: BoatArtLayout['hull'], yFrac: number, beamUnits: number): number {
  const half = beamUnits / 2;
  if (yFrac <= 0) return hull[0]![1] * half;
  for (let i = 1; i < hull.length; i++) {
    const [y0, h0] = hull[i - 1]!;
    const [y1, h1] = hull[i]!;
    if (yFrac <= y1) return (h0 + ((h1 - h0) * (yFrac - y0)) / (y1 - y0)) * half;
  }
  return hull[hull.length - 1]![1] * half;
}

/** 船体の輪郭（艇首の先から右舷を艇尾へ、左舷を艇首へ）。inset で縁から内側へ寄せた輪郭（艇首の先は下がる・艇尾は上がる） */
export function hullOutline(hull: BoatArtLayout['hull'], L: number, B: number, inset = 0): Pt[] {
  const cx = B / 2;
  const right: Pt[] = [];
  const left: Pt[] = [];
  for (let i = 0; i < hull.length; i++) {
    const [f, hw] = hull[i]!;
    const half = Math.max(0, hw * (B / 2) - inset);
    let y = f * L;
    if (i === 0) y = inset * BOAT_ART_BOW_INSET_FACTOR;
    else if (i === hull.length - 1) y = L - inset;
    if (half <= 0) {
      right.push({ x: cx, y });
    } else {
      right.push({ x: cx + half, y });
      left.push({ x: cx - half, y });
    }
  }
  return right.concat(left.reverse());
}

/** 置き方 → 絵（世界単位） */
export function boatShape(layout: BoatArtLayout, L: number, B: number): BoatShape {
  const cx = B / 2;
  const parts: BoatPart[] = [];
  const corner = BOAT_ART_CORNER_UNITS;
  // 地（リムの内側）
  parts.push({ kind: 'poly', pts: hullOutline(layout.hull, L, B, ART_RIM_UNITS), tone: 'deck', alpha: 1 });
  // 中心線の明るい筋（枕の陰影）
  const chw = Math.max(ART_DETAIL_MIN_UNITS / 2, BOAT_ART_CENTER_HALF_W_OF_B * B);
  const cy0 = BOAT_ART_CENTER_FROM * L;
  const cy1 = BOAT_ART_CENTER_TO * L;
  parts.push({ kind: 'rect', x: cx - chw, y: cy0, w: chw * 2, h: cy1 - cy0, r: chw, tone: 'highlight', alpha: BOAT_ART_CENTER_ALPHA });
  // 発射管・架台（両舷）
  for (const [f0, f1, xf] of layout.tubes) {
    for (const side of [1, -1]) {
      parts.push({ kind: 'rect', x: cx + side * xf * B - ART_DETAIL_MIN_UNITS / 2, y: f0 * L, w: ART_DETAIL_MIN_UNITS, h: (f1 - f0) * L, r: corner, tone: 'mid', alpha: 1 });
    }
  }
  // 操舵室・船室と風防
  if (layout.cabin) {
    const [f0, f1, wf] = layout.cabin;
    const w = wf * B;
    parts.push({ kind: 'rect', x: cx - w / 2, y: f0 * L, w, h: (f1 - f0) * L, r: corner, tone: 'super', alpha: 1 });
    parts.push({ kind: 'rect', x: cx - w / 2 + corner, y: f0 * L, w: w - corner * 2, h: BOAT_ART_SCREEN_UNITS, r: corner / 2, tone: 'highlight', alpha: 0.85 });
  }
  // 丸い物（銃座・砲・樽）: 台と、大きければ中心の明るい点
  for (const [f, xf, r] of layout.guns) {
    const gx = cx + xf * B;
    const gy = f * L;
    parts.push({ kind: 'disc', cx: gx, cy: gy, r, tone: 'mid', alpha: 1 });
    if (r - 0.5 >= ART_DETAIL_MIN_UNITS / 2) parts.push({ kind: 'disc', cx: gx, cy: gy, r: r - 0.5, tone: 'highlight', alpha: 0.9 });
  }
  // 艇尾の箱（煙幕の発生機）
  for (const [f0, f1, wf, xf] of layout.sternBoxes) {
    const w = wf * B;
    parts.push({ kind: 'rect', x: cx + xf * B - w / 2, y: f0 * L, w, h: (f1 - f0) * L, r: corner / 2, tone: 'mid', alpha: 1 });
  }
  return { lengthUnits: L, beamUnits: B, outline: hullOutline(layout.hull, L, B), parts };
}

/** 部品の x の広がり（左右の端）と y の範囲（世界単位）。tests が船体の内に収まるかを見る */
export function partBounds(p: BoatPart): { x0: number; x1: number; y0: number; y1: number } {
  if (p.kind === 'disc') return { x0: p.cx - p.r, x1: p.cx + p.r, y0: p.cy - p.r, y1: p.cy + p.r };
  if (p.kind === 'rect') return { x0: p.x, x1: p.x + p.w, y0: p.y, y1: p.y + p.h };
  let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
  for (const q of p.pts) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  return { x0, x1, y0, y1 };
}
