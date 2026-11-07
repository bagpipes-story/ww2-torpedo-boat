// 空襲下の退避（v0.6.11 IP2 の U11。jp_03）の岩の絵: 陰「屋我地の陰（東）」（張り出した崖・入り江の腕・その下の海の暗い陰・口の外の岩・岩に当たる波・崖の上の木々・岸の岩の並び）と
// 壕の口の周りの岩の縁・脇の岩・木々。任務で初めて使う時に 1 回だけ Graphics に描いて generateTexture し（テクスチャはページの間残る＝やり直しは描かない）、
// systems/evac-terrain が Image で置く（毎フレームは画像 1 枚の描画だけ＝§7。Graphics のまま置くと岩の多角形を毎フレーム三角形に分けることになる）。
// 乱れは絵だけの SeededRng（EVAC_ART_SEED。ゲームの乱数とは別）。座標は世界の m を EVAC_ART_PX_PER_M 倍したテクスチャの px。
import type Phaser from 'phaser';
import {
  CAVE_ART_DOWN_M, CAVE_ART_HALF_W_M, CAVE_ART_UP_M, CAVE_RIM_CHUNK_M, CAVE_RIM_CHUNKS, CAVE_RIM_RX_M, CAVE_RIM_RY_M, CAVE_SIDE_ROCKS, CAVE_TREES, COVER_ARM_INNER_DX_M, COVER_ARM_M,
  COVER_ART_HALF_W_M, COVER_ART_LAND_M, COVER_ART_SEA_M, COVER_BOULDERS, COVER_CLIFF_HALF_W_M, COVER_CLIFF_TOP_M, COVER_LIP_M, COVER_SHADE, COVER_SHADE_COLOR, COVER_TREES, EVAC_ART_PX_PER_M,
  EVAC_ART_SEED, FOAM_ALPHA, FOAM_COLOR, ROCK_CRACK, ROCK_DARK, ROCK_LIGHT, ROCK_MID, ROCK_SHADOW, SHORE_ROCK_MAX_M, SHORE_ROCK_MIN_M, SHORE_ROCK_STEP_M, TREE_DARK, TREE_LIGHT, TREE_MID,
} from '../config/evac-art-config';
import { SeededRng } from '../core/rng';

/** 置く時の左上（世界の m）と画像の大きさ */
export interface EvacArtPlacement {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

type Pt = { x: number; y: number };
const K = EVAC_ART_PX_PER_M;

/** 世界の m をテクスチャの px へ（左上 x0, y0） */
class Pen {
  constructor(readonly g: Phaser.GameObjects.Graphics, private readonly x0: number, private readonly y0: number, readonly rng: SeededRng) {}
  p(x: number, y: number): Pt {
    return { x: (x - this.x0) * K, y: (y - this.y0) * K };
  }
  poly(pts: readonly Pt[], color: number, alpha: number, dx = 0, dy = 0, s = 1, cx = 0, cy = 0): void {
    this.g.fillStyle(color, alpha);
    this.g.fillPoints(pts.map((q) => this.p(cx + (q.x - cx) * s + dx, cy + (q.y - cy) * s + dy)), true);
  }
  circle(x: number, y: number, r: number, color: number, alpha: number): void {
    const q = this.p(x, y);
    this.g.fillStyle(color, alpha);
    this.g.fillCircle(q.x, q.y, r * K);
  }
  ellipse(x: number, y: number, w: number, h: number, color: number, alpha: number): void {
    const q = this.p(x, y);
    this.g.fillStyle(color, alpha);
    this.g.fillEllipse(q.x, q.y, w * K, h * K);
  }
  line(x0: number, y0: number, x1: number, y1: number, w: number, color: number, alpha: number): void {
    const a = this.p(x0, y0);
    const b = this.p(x1, y1);
    this.g.lineStyle(w * K, color, alpha);
    this.g.lineBetween(a.x, a.y, b.x, b.y);
  }
}

/** 不揃いな岩の輪郭（世界の m） */
function rockOutline(rng: SeededRng, x: number, y: number, r: number, squash = 0.82): Pt[] {
  const n = 7 + Math.floor(rng.next() * 3);
  const a0 = rng.next() * Math.PI * 2;
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2;
    const rr = r * rng.nextRange(0.72, 1.08);
    pts.push({ x: x + Math.cos(a) * rr, y: y + Math.sin(a) * rr * squash });
  }
  return pts;
}

/** 1 つの岩: 南東に落ちる影・暗い面・中の面・北西の明るい上の縁（光は北西から）。foam なら海の岩（足元に白い波） */
function rock(pen: Pen, x: number, y: number, r: number, foam: boolean): void {
  const pts = rockOutline(pen.rng, x, y, r);
  pen.poly(pts, ROCK_SHADOW, 0.42, r * 0.28, r * 0.36);
  if (foam) {
    pen.ellipse(x + r * 0.1, y + r * 0.35, r * 2.5, r * 1.5, FOAM_COLOR, FOAM_ALPHA * 0.45);
    pen.ellipse(x + r * 0.1, y + r * 0.3, r * 2.15, r * 1.25, FOAM_COLOR, FOAM_ALPHA * 0.5);
  }
  pen.poly(pts, ROCK_DARK, 1);
  pen.poly(pts, ROCK_MID, 1, -r * 0.08, -r * 0.12, 0.8, x, y);
  pen.poly(pts, ROCK_LIGHT, 0.8, -r * 0.3, -r * 0.32, 0.4, x, y);
}

/** 木々の塊（上から見た丸い樹冠の重なり） */
function trees(pen: Pen, x: number, y: number, r: number): void {
  const rng = pen.rng;
  pen.circle(x + r * 0.25, y + r * 0.3, r * 1.02, ROCK_SHADOW, 0.35);
  pen.circle(x, y, r, TREE_DARK, 1);
  for (let i = 0; i < 4; i++) {
    const a = rng.next() * Math.PI * 2;
    const d = r * rng.nextRange(0.15, 0.5);
    const cr = r * rng.nextRange(0.38, 0.55);
    const cx = x + Math.cos(a) * d;
    const cy = y + Math.sin(a) * d;
    pen.circle(cx, cy, cr, TREE_MID, 1);
    pen.circle(cx - cr * 0.3, cy - cr * 0.3, cr * 0.45, TREE_LIGHT, 0.9);
  }
}

/** 半楕円（中心 x, 岸の線 y0 から海へ深さ d・幅の半分 a） */
function halfEllipse(x: number, y0: number, a: number, d: number): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * Math.PI;
    pts.push({ x: x + Math.cos(t) * a, y: y0 + Math.sin(t) * d });
  }
  return pts;
}

/** 崖の海の側の縁の深さ（陰の点の x からの dx。岸の線から海へ m）: 真ん中は張り出し、左右は入り江の腕 */
function lipDepth(dx: number): number {
  const ax = Math.abs(dx);
  if (ax <= COVER_ARM_INNER_DX_M - 40) return COVER_LIP_M;
  if (ax <= COVER_ARM_INNER_DX_M) return COVER_LIP_M + ((ax - (COVER_ARM_INNER_DX_M - 40)) / 40) * (COVER_ARM_M * 0.75 - COVER_LIP_M);
  if (ax <= COVER_ARM_INNER_DX_M + 45) return COVER_ARM_M;
  return Math.max(6, COVER_ARM_M * (1 - (ax - COVER_ARM_INNER_DX_M - 45) / (COVER_CLIFF_HALF_W_M - COVER_ARM_INNER_DX_M - 45)) * 0.9);
}

/** 陰の絵を描いてテクスチャにする（まだ無ければ）。cx は陰の点の x、sy は陰の点の y（岸の線 y 0 から） */
export function ensureEvacCoverArt(scene: Phaser.Scene, key: string, cx: number, sy: number): EvacArtPlacement {
  const x0 = cx - COVER_ART_HALF_W_M;
  const y0 = -COVER_ART_LAND_M;
  const place = { key, x: x0, y: y0, scale: 1 / K };
  if (scene.textures.exists(key)) return place;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const pen = new Pen(g, x0, y0, new SeededRng(EVAC_ART_SEED));
  const rng = pen.rng;
  // 口の外の岩（陰より下＝陰の濃い所の岩は暗く見える）
  for (const [dx, dy, r] of COVER_BOULDERS) rock(pen, cx + dx, sy + dy, r, true);
  // 海の暗い陰（3 重の半楕円）
  for (const [a, d, al] of COVER_SHADE) pen.poly(halfEllipse(cx, 0, a, d), COVER_SHADE_COLOR, al);
  // 岸の岩の並び（崖の外の左右）
  for (const side of [-1, 1]) {
    for (let ax = COVER_CLIFF_HALF_W_M - 10; ax < COVER_ART_HALF_W_M - SHORE_ROCK_MAX_M; ax += SHORE_ROCK_STEP_M * rng.nextRange(0.7, 1.2)) {
      const k = (ax - COVER_CLIFF_HALF_W_M) / (COVER_ART_HALF_W_M - COVER_CLIFF_HALF_W_M);
      const r = SHORE_ROCK_MAX_M + (SHORE_ROCK_MIN_M - SHORE_ROCK_MAX_M) * k;
      rock(pen, cx + side * ax, rng.nextRange(-r * 0.6, r * 0.5), r * rng.nextRange(0.75, 1.1), true);
    }
  }
  // 崖の輪郭（上の縁は陸の中・下の縁は海の張り出しと腕）
  const top: Pt[] = [];
  const bottom: Pt[] = [];
  const step = 12;
  for (let dx = -COVER_CLIFF_HALF_W_M; dx <= COVER_CLIFF_HALF_W_M; dx += step) {
    const edge = 1 - Math.abs(dx) / COVER_CLIFF_HALF_W_M;
    top.push({ x: cx + dx, y: -(COVER_CLIFF_TOP_M * Math.min(1, edge * 3) + 10) + rng.nextRange(-8, 8) });
    bottom.push({ x: cx + dx + rng.nextRange(-3, 3), y: lipDepth(dx) + rng.nextRange(-5, 5) });
  }
  const body = top.concat(bottom.slice().reverse());
  // 崖が海に落とす影（南東へ）→ 崖の暗い面
  pen.poly(bottom.concat([{ x: cx + COVER_CLIFF_HALF_W_M, y: -4 }, { x: cx - COVER_CLIFF_HALF_W_M, y: -4 }]), ROCK_SHADOW, 0.5, 10, 16);
  pen.poly(body, ROCK_DARK, 1);
  // 崖の面の岩の塊（2 段。下の段は海の縁に沿う）
  for (let dx = -COVER_CLIFF_HALF_W_M + 14; dx <= COVER_CLIFF_HALF_W_M - 14; dx += rng.nextRange(18, 34)) {
    const lip = lipDepth(dx);
    const topY = -(COVER_CLIFF_TOP_M * Math.min(1, (1 - Math.abs(dx) / COVER_CLIFF_HALF_W_M) * 3) + 10);
    const h = lip - topY;
    const v = rng.nextRange(0.6, 1.25);
    rock(pen, cx + dx + rng.nextRange(-6, 6), topY + h * rng.nextRange(0.2, 0.35), Math.min(24, h * 0.3) * v, false);
    if (h > 50) rock(pen, cx + dx + rng.nextRange(-10, 10), topY + h * rng.nextRange(0.5, 0.62), Math.min(18, h * 0.2) * rng.nextRange(0.6, 1.2), false);
    rock(pen, cx + dx + 12 + rng.nextRange(-6, 6), lip - Math.min(14, h * 0.2), Math.min(17, h * 0.24) * rng.nextRange(0.6, 1.2), false);
  }
  // 崖の上の縁の草（木々の手前）
  for (let i = 0; i < top.length; i++) if (rng.next() < 0.7) pen.circle(top[i]!.x + rng.nextRange(-5, 5), top[i]!.y + rng.nextRange(-2, 4), rng.nextRange(5, 9), TREE_MID, 0.9);
  // 割れ目
  for (let i = 0; i < 9; i++) {
    const dx = rng.nextRange(-COVER_CLIFF_HALF_W_M * 0.85, COVER_CLIFF_HALF_W_M * 0.85);
    const y1 = lipDepth(dx) - 4;
    pen.line(cx + dx, y1, cx + dx + rng.nextRange(-10, 10), y1 - rng.nextRange(20, 45), 2, ROCK_CRACK, 0.8);
  }
  // 張り出しの縁の波（崖の下の縁に沿って白い点）
  for (let i = 0; i < bottom.length; i++) {
    const q = bottom[i]!;
    if (rng.next() < 0.25) continue;
    pen.ellipse(q.x + rng.nextRange(-4, 4), q.y + rng.nextRange(3, 7), rng.nextRange(10, 20), rng.nextRange(3, 5), FOAM_COLOR, FOAM_ALPHA);
  }
  // 崖の上の木々
  for (const [dx, dy, r] of COVER_TREES) trees(pen, cx + dx, -dy, r);
  g.generateTexture(key, Math.ceil(COVER_ART_HALF_W_M * 2 * K), Math.ceil((COVER_ART_LAND_M + sy + COVER_ART_SEA_M) * K));
  g.destroy();
  return place;
}

/** 壕の口の周りの岩と木を描いてテクスチャにする（まだ無ければ。3 つの壕で同じ 1 枚）。mx, my は口の中心（世界の m） */
export function ensureEvacCaveArt(scene: Phaser.Scene, key: string, mx: number, my: number): EvacArtPlacement {
  const place = { key, x: mx - CAVE_ART_HALF_W_M, y: my - CAVE_ART_UP_M, scale: 1 / K };
  if (scene.textures.exists(key)) return place;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // テクスチャの中の口の中心を (CAVE_ART_HALF_W_M, CAVE_ART_UP_M) に
  const pen = new Pen(g, -CAVE_ART_HALF_W_M, -CAVE_ART_UP_M, new SeededRng(EVAC_ART_SEED + 1));
  for (const [dx, dy, r] of CAVE_TREES) trees(pen, dx, dy, r);
  pen.ellipse(6, 8, CAVE_RIM_RX_M * 2.3, CAVE_RIM_RY_M * 2.3, ROCK_SHADOW, 0.4);
  pen.ellipse(0, 0, CAVE_RIM_RX_M * 2.2, CAVE_RIM_RY_M * 2.2, ROCK_DARK, 1);
  for (let i = 0; i < CAVE_RIM_CHUNKS; i++) {
    const a = (i / CAVE_RIM_CHUNKS) * Math.PI * 2 + pen.rng.nextRange(-0.12, 0.12);
    rock(pen, Math.cos(a) * CAVE_RIM_RX_M, Math.sin(a) * CAVE_RIM_RY_M, CAVE_RIM_CHUNK_M * pen.rng.nextRange(0.8, 1.15), false);
  }
  for (const [dx, dy, r] of CAVE_SIDE_ROCKS) rock(pen, dx, dy, r, false);
  g.generateTexture(key, Math.ceil(CAVE_ART_HALF_W_M * 2 * K), Math.ceil((CAVE_ART_UP_M + CAVE_ART_DOWN_M) * K));
  g.destroy();
  return place;
}
