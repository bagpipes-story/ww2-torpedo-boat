// v0.7.0 S2b（アートと音①：コードで描く絵。spec-v0700 §4.3）: 機 8 種の平面形（Phaser に依らない）。aircraft-art-config の置き方（割合と単位）を、箱（翼幅 60 × 長さ 48 単位）の中の
// 世界単位の部品の並びにする。機首が上（y 0）・原点はテクスチャの左上（中心線は x = 翼幅/2）。assets/aircraft-art が ArtPen で描き、tests/aircraft-art が形の決まり（部品は箱の内・
// 左右対称・翼幅 ≥ 箱の 0.8・細部 ≥ 2 単位＝R17・種類ごとの見分け）を確かめる。縁の明るいリム（翼・胴・尾翼の外周）→ 内側の地 → 細部（風防・発動機・フロート・尾翼の板）の順。
import {
  AIRCRAFT_CANOPY_W, AIRCRAFT_FIN, AIRCRAFT_GULL_LINE_ALPHA, AIRCRAFT_GULL_LINE_W, AIRCRAFT_NACELLE, AIRCRAFT_PROP_ALPHA, AIRCRAFT_RIM_UNITS, AIRCRAFT_TIP_FLOAT,
  AIRCRAFT_WINDSHIELD_UNITS, type AircraftArtLayout, type AircraftWing,
} from '../config/aircraft-art-config';
import type { ArtPart, PenPt } from './art-pen';

/** 色の役: 縁（リム。フロート・ナセルも明るい金属＝暗い中間色だと Jake・PB2Y の昼の海との明るさの比が 2.8 で tex-check の 3 を切った）・地（翼と胴）・中間（尾翼の板）・暗い細部（風防）・明るい点（風防の前・発動機の軸・フロートの先） */
export type AircraftTone = 'rim' | 'skin' | 'mid' | 'detail' | 'highlight';
export type AircraftPart = ArtPart<AircraftTone>;
export interface AircraftShape {
  readonly spanUnits: number;
  readonly lengthUnits: number;
  /** 主翼（上翼があれば上翼）の翼幅（単位。tex-check の「翼幅 ≥ 箱の 0.8」） */
  readonly wingSpan: number;
  readonly parts: readonly AircraftPart[];
}

const poly = (pts: readonly PenPt[], tone: AircraftTone, alpha = 1): AircraftPart => ({ kind: 'poly', pts, tone, alpha });
const rect = (x: number, y: number, w: number, h: number, r: number, tone: AircraftTone, alpha = 1): AircraftPart => ({ kind: 'rect', x, y, w, h, r, tone, alpha });
const disc = (cx: number, cy: number, r: number, tone: AircraftTone, alpha = 1): AircraftPart => ({ kind: 'disc', cx, cy, r, tone, alpha });

/** 右半分の点列（中心線の前の点を含まない）から左右対称の多角形: 前の中心 → 右（前縁 → 翼端 → 後縁）→ 後ろの中心 → 左（鏡） */
function mirrored(cx: number, front: PenPt, right: readonly PenPt[], back: PenPt): PenPt[] {
  const left = right.map((p) => ({ x: 2 * cx - p.x, y: p.y })).reverse();
  return [front, ...right, back, ...left];
}

/** 翼（主翼・上翼・水平尾翼）の平面形。inset は縁からの内側（0＝輪郭＝リム、AIRCRAFT_RIM_UNITS＝地） */
export function wingPoly(w: AircraftWing, cx: number, L: number, inset: number): PenPt[] {
  const s = w.span / 2 - inset;
  const yLE = w.y * L + inset;
  const root = Math.max(1, w.root - 2 * inset);
  const tip = Math.max(1, w.tip - 2 * inset);
  const r = Math.min(w.tipRound, tip / 2);
  const right: PenPt[] = [];
  if (w.gull) {
    const [gx, gdy] = w.gull;
    const chordAtG = root + ((tip - root) * gx) / s;
    right.push({ x: cx + gx, y: yLE + gdy });
    right.push({ x: cx + s - r, y: yLE + w.sweep }, { x: cx + s, y: yLE + w.sweep + r }, { x: cx + s, y: yLE + w.sweep + tip - r }, { x: cx + s - r, y: yLE + w.sweep + tip });
    right.push({ x: cx + gx, y: yLE + gdy + chordAtG });
  } else {
    right.push({ x: cx + s - r, y: yLE + w.sweep }, { x: cx + s, y: yLE + w.sweep + r }, { x: cx + s, y: yLE + w.sweep + tip - r }, { x: cx + s - r, y: yLE + w.sweep + tip });
  }
  return mirrored(cx, { x: cx, y: yLE }, right, { x: cx, y: yLE + root });
}

/** 胴（[割合, 半幅] の列）の輪郭。inset で細くし、機首・機尾を inset だけ縮める */
export function fuselagePoly(fus: AircraftArtLayout['fuselage'], cx: number, L: number, inset: number): PenPt[] {
  const n = fus.length;
  const right = fus.map(([f, hw], i) => ({ x: cx + Math.max(0.3, hw - inset), y: f * L + (i === 0 ? inset : i === n - 1 ? -inset : 0) }));
  return mirrored(cx, { x: cx, y: fus[0]![0] * L + inset }, right, { x: cx, y: fus[n - 1]![0] * L - inset });
}

/** 水平尾翼は翼と同じ道具（翼端は 0.7 の翼弦・丸み 1・後退 1） */
function tailWing(tail: readonly [number, number, number]): AircraftWing {
  return { y: tail[0], span: tail[1], root: tail[2], tip: tail[2] * 0.7, sweep: 1, tipRound: 1, gull: null };
}

/** 左右の対（x は中心からの単位）に同じ矩形を置く */
function pair(cx: number, dx: number, y: number, w: number, h: number, r: number, tone: AircraftTone, out: AircraftPart[]): void {
  out.push(rect(cx + dx - w / 2, y, w, h, r, tone), rect(cx - dx - w / 2, y, w, h, r, tone));
}

/** 置き方 → 部品の並び（描く順） */
export function aircraftShape(lay: AircraftArtLayout, spanUnits: number, lengthUnits: number): AircraftShape {
  const cx = spanUnits / 2;
  const L = lengthUnits;
  const rim = AIRCRAFT_RIM_UNITS;
  const parts: AircraftPart[] = [];
  // プロペラの円（薄い。胴の下）
  if (lay.propR > 0) parts.push(disc(cx, lay.propR, lay.propR, 'highlight', AIRCRAFT_PROP_ALPHA));
  // フロート（翼と胴の下＝低い物から）
  if (lay.centerFloat) {
    const [f0, f1, hw] = lay.centerFloat;
    parts.push(rect(cx - hw, f0 * L, hw * 2, (f1 - f0) * L, hw, 'rim'), disc(cx, f0 * L + hw, hw * 0.5, 'highlight'));
  }
  if (lay.twinFloats) {
    const [dx, f0, f1, hw] = lay.twinFloats;
    pair(cx, dx, f0 * L, hw * 2, (f1 - f0) * L, hw, 'rim', parts);
    parts.push(disc(cx + dx, f0 * L + hw, hw * 0.5, 'highlight'), disc(cx - dx, f0 * L + hw, hw * 0.5, 'highlight'));
  }
  // 翼（リム → 地）、上翼、尾翼
  const wings: AircraftWing[] = [lay.wing, tailWing(lay.tail)];
  if (lay.upperWing) wings.push(lay.upperWing);
  for (const w of wings) parts.push(poly(wingPoly(w, cx, L, 0), 'rim'), poly(wingPoly(w, cx, L, rim), 'skin'));
  // 逆ガルの折れの明るい線（翼の上）
  if (lay.wing.gull) {
    const [gx, gdy] = lay.wing.gull;
    const w = lay.wing;
    const chordAtG = w.root + ((w.tip - w.root) * gx) / (w.span / 2);
    pair(cx, gx, w.y * L + gdy + rim, AIRCRAFT_GULL_LINE_W, Math.max(1, chordAtG - 2 * rim), 0, 'highlight', parts);
    parts[parts.length - 1] = { ...parts[parts.length - 1]!, alpha: AIRCRAFT_GULL_LINE_ALPHA };
    parts[parts.length - 2] = { ...parts[parts.length - 2]!, alpha: AIRCRAFT_GULL_LINE_ALPHA };
  }
  // 翼端の小フロート（翼の端の下、後縁の後ろへ少し出る）
  if (lay.tipFloats) {
    const w = lay.upperWing ?? lay.wing;
    const dx = w.span / 2 - AIRCRAFT_TIP_FLOAT.inset;
    pair(cx, dx, w.y * L + w.sweep + w.tip - AIRCRAFT_TIP_FLOAT.len * 0.5, AIRCRAFT_TIP_FLOAT.w, AIRCRAFT_TIP_FLOAT.len, AIRCRAFT_TIP_FLOAT.w / 2, 'rim', parts);
  }
  // 発動機のナセル（翼の前縁の前へ出て後ろへ）と軸の明るい点
  for (const nx of lay.nacelles) {
    const y0 = lay.wing.y * L - AIRCRAFT_NACELLE.ahead;
    pair(cx, nx, y0, AIRCRAFT_NACELLE.w, AIRCRAFT_NACELLE.len, AIRCRAFT_NACELLE.w / 2, 'rim', parts);
    parts.push(disc(cx + nx, y0 + 1.2, 1, 'highlight'), disc(cx - nx, y0 + 1.2, 1, 'highlight'));
  }
  // 胴（リム → 地）
  parts.push(poly(fuselagePoly(lay.fuselage, cx, L, 0), 'rim'), poly(fuselagePoly(lay.fuselage, cx, L, rim), 'skin'));
  // 風防（暗い）と前の明るい帯
  if (lay.canopy) {
    const [c0, c1] = lay.canopy;
    const cw = AIRCRAFT_CANOPY_W;
    parts.push(rect(cx - cw / 2, c0 * L, cw, (c1 - c0) * L, cw / 2, 'detail'), rect(cx - cw / 2, c0 * L, cw, AIRCRAFT_WINDSHIELD_UNITS, 0.5, 'highlight'));
  }
  // 垂直尾翼の板（中心線 1 枚か、水平尾翼の両端の 2 枚）
  const [ty, tspan] = lay.tail;
  if (lay.fins === 'single') parts.push(rect(cx - AIRCRAFT_FIN.w / 2, ty * L + rim, AIRCRAFT_FIN.w, AIRCRAFT_FIN.len, 0.5, 'mid'));
  else pair(cx, tspan / 2 - AIRCRAFT_FIN.w, ty * L + rim, AIRCRAFT_FIN.w, AIRCRAFT_FIN.len, 0.5, 'mid', parts);
  return { spanUnits, lengthUnits, wingSpan: Math.max(lay.wing.span, lay.upperWing ? lay.upperWing.span : 0), parts };
}

/** 部品の矩形の範囲（世界単位。tests が箱の内・細部の大きさを確かめる） */
export function aircraftPartBounds(p: AircraftPart): { x0: number; y0: number; x1: number; y1: number } {
  if (p.kind === 'poly') {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const q of p.pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    return { x0, y0, x1, y1 };
  }
  if (p.kind === 'rect') return { x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h };
  if (p.kind === 'disc') return { x0: p.cx - p.r, y0: p.cy - p.r, x1: p.cx + p.r, y1: p.cy + p.r };
  return { x0: p.cx - p.rx, y0: p.cy - p.ry, x1: p.cx + p.rx, y1: p.cy + p.ry };
}
