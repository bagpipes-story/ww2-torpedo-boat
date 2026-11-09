// v0.7.0 S3a（アートと音①：コードで描く絵。spec-v0700 §5.1・§5.6）: 海の面の Phaser に依らない部分。
// - 海の模様のタイル（tex-sea-tile）の中身の「置き方」: 絵だけの SeededRng（ART_SEED_SEA）で波頭の弧・白波・うねりを決め、周期の縁をまたぐ物は折り返しの写しの位置も返す
//   （assets/sea-art が Canvas の 2D で白で描く。同じ種なら同じ画素）。
// - 海の TileSprite の升（世界の座標。周期の倍数に揃え、camera.worldView ＋ 余白を覆う。R5）、夜明けの光の α（0.22 × sin(π × 段/16)。R4）、きらめきの明滅と置き直し（R9）。
// systems/sea-fx が毎フレーム使う式はここ（tests/sea-art で検査）。
import {
  DAWN_GLOW_ALPHA_MAX, GLINT_PERIOD_MIN_S, GLINT_SWING_MAX, SEA_ART_PX_PER_M, SEA_CAP_ALPHA, SEA_CAP_COUNT, SEA_CAP_LEN_PX, SEA_CAP_PX, SEA_CREST_BASE_DEG, SEA_CREST_CORE_ALPHA,
  SEA_CREST_CORE_PX, SEA_CREST_COUNT, SEA_CREST_JITTER_DEG, SEA_CREST_LEN_PX, SEA_CREST_ROWS, SEA_CREST_SAG, SEA_CREST_WIDE_ALPHA, SEA_CREST_WIDE_PX, SEA_PATCH_ARCS, SEA_PATCH_EDGE_FADE_PX,
  SEA_PATCH_FRAMES, SEA_PATCH_H_PX, SEA_PATCH_SCATTER_PX, SEA_PATCH_W_PX, SEA_PATCH_WAVE_PX, SEA_ROW_SCATTER_PX, SEA_ROW_WAVES_PER_TILE, SEA_ROW_WAVE_PX, SEA_SWELL_ALPHA, SEA_SWELL_COUNT,
  SEA_SWELL_R_PX, SEA_TILE_PERIOD_M,
} from '../config/sea-art-config';
import { SeededRng } from '../core/rng';

/** タイルの 1 辺 px（512＝2 の累乗。WebGL の REPEAT で貼れる） */
export const SEA_TILE_TEX_PX = SEA_TILE_PERIOD_M * SEA_ART_PX_PER_M;

/** 波頭の弧・白波の点描（px。中心・長さ・向き rad・たわみ＝長さの割合・太さ・α） */
export interface SeaStroke {
  readonly x: number;
  readonly y: number;
  readonly len: number;
  readonly ang: number;
  readonly sag: number;
  readonly w: number;
  readonly a: number;
}
/** うねりの丸（px。中心・半径・中心の α） */
export interface SeaSwell {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly a: number;
}
export interface SeaTilePlan {
  readonly size: number;
  readonly swells: readonly SeaSwell[];
  /** 下塗り（太い）と芯（細い）の 2 本で 1 つの弧 */
  readonly crests: readonly SeaStroke[];
  readonly caps: readonly SeaStroke[];
}

const DEG = Math.PI / 180;

/** 波の列 r（0〜ROWS−1）の、x での y（うねる列。山の数が整数なので周期の縁で合う） */
export function seaRowY(r: number, x: number, size: number): number {
  return ((r + 0.5) * size) / SEA_CREST_ROWS + SEA_ROW_WAVE_PX * Math.sin((2 * Math.PI * SEA_ROW_WAVES_PER_TILE * x) / size + r);
}

/** タイルの置き方（同じ seed なら同じ）。弧は波の列（うねる横の列）に沿って散らばり、向きは波の来る向き ± 乱れ、白波は弧の上に短く太く */
export function seaTilePlan(seed: number): SeaTilePlan {
  const rng = new SeededRng(seed);
  const S = SEA_TILE_TEX_PX;
  const swells: SeaSwell[] = [];
  for (let i = 0; i < SEA_SWELL_COUNT; i++) swells.push({ x: rng.next() * S, y: rng.next() * S, r: rng.nextRange(SEA_SWELL_R_PX[0], SEA_SWELL_R_PX[1]), a: SEA_SWELL_ALPHA });
  const crests: SeaStroke[] = [];
  for (let i = 0; i < SEA_CREST_COUNT; i++) {
    const x = rng.next() * S;
    const y0 = seaRowY(i % SEA_CREST_ROWS, x, S) + rng.nextRange(-SEA_ROW_SCATTER_PX, SEA_ROW_SCATTER_PX);
    const y = ((y0 % S) + S) % S;
    const len = rng.nextRange(SEA_CREST_LEN_PX[0], SEA_CREST_LEN_PX[1]);
    const ang = (SEA_CREST_BASE_DEG + rng.nextRange(-SEA_CREST_JITTER_DEG, SEA_CREST_JITTER_DEG)) * DEG;
    const sag = rng.nextRange(SEA_CREST_SAG[0], SEA_CREST_SAG[1]);
    crests.push({ x, y, len, ang, sag, w: SEA_CREST_WIDE_PX, a: SEA_CREST_WIDE_ALPHA });
    crests.push({ x, y, len, ang, sag, w: SEA_CREST_CORE_PX, a: SEA_CREST_CORE_ALPHA });
  }
  const caps: SeaStroke[] = [];
  for (let i = 0; i < SEA_CAP_COUNT; i++) {
    const c = crests[2 * Math.floor(rng.next() * SEA_CREST_COUNT)]!;
    const along = rng.nextRange(-0.3, 0.3) * c.len;
    caps.push({ x: c.x + Math.cos(c.ang) * along, y: c.y + Math.sin(c.ang) * along, len: rng.nextRange(SEA_CAP_LEN_PX[0], SEA_CAP_LEN_PX[1]), ang: c.ang, sag: 0, w: SEA_CAP_PX, a: SEA_CAP_ALPHA });
  }
  return { size: S, swells, crests, caps };
}

/** 波頭の群れ（patches 方式）の絵: 同じ鍵の frame p0〜p(FRAMES−1)。1 枚は W × H px、弧はうねる 1 本の列に沿い、縁へ向けて α を落とす（矩形に見せない） */
export interface SeaPatchPlan {
  readonly w: number;
  readonly h: number;
  readonly frames: readonly (readonly SeaStroke[])[];
}

/** 縁からの距離で α を落とす係数（0〜1。SEA_PATCH_EDGE_FADE_PX より内は 1） */
export function patchEdgeFade(x: number, y: number, w: number, h: number): number {
  const d = Math.min(x, w - x, y, h - y);
  return d <= 0 ? 0 : d >= SEA_PATCH_EDGE_FADE_PX ? 1 : d / SEA_PATCH_EDGE_FADE_PX;
}

/** 波頭の群れの置き方（同じ seed なら同じ。frame ごとに弧 SEA_PATCH_ARCS 本＝下塗りと芯の 2 本ずつ） */
export function seaPatchPlan(seed: number): SeaPatchPlan {
  const rng = new SeededRng(seed);
  const w = SEA_PATCH_W_PX;
  const h = SEA_PATCH_H_PX;
  const frames: SeaStroke[][] = [];
  for (let f = 0; f < SEA_PATCH_FRAMES; f++) {
    const arcs: SeaStroke[] = [];
    const phase = rng.next() * Math.PI * 2;
    for (let i = 0; i < SEA_PATCH_ARCS; i++) {
      const len = rng.nextRange(SEA_CREST_LEN_PX[0], SEA_CREST_LEN_PX[1] * 0.8);
      const lo = len / 2 + 2;
      const xr = lo + ((i + 0.5) / SEA_PATCH_ARCS) * (w - 2 * lo) + rng.nextRange(-10, 10);
      const x = xr < lo ? lo : xr > w - lo ? w - lo : xr;
      const y0 = h / 2 + SEA_PATCH_WAVE_PX * Math.sin((2 * Math.PI * x) / w + phase) + rng.nextRange(-SEA_PATCH_SCATTER_PX, SEA_PATCH_SCATTER_PX) * (i % 2 === 0 ? 1 : 2.2);
      const y = y0 < 4 ? 4 : y0 > h - 4 ? h - 4 : y0;
      const ang = (SEA_CREST_BASE_DEG + rng.nextRange(-SEA_CREST_JITTER_DEG, SEA_CREST_JITTER_DEG) * 0.6) * DEG;
      const sag = rng.nextRange(SEA_CREST_SAG[0], SEA_CREST_SAG[1]);
      const fade = patchEdgeFade(x, y, w, h);
      arcs.push({ x, y, len, ang, sag, w: SEA_CREST_WIDE_PX, a: SEA_CREST_WIDE_ALPHA * fade });
      arcs.push({ x, y, len, ang, sag, w: SEA_CREST_CORE_PX, a: SEA_CREST_CORE_ALPHA * fade });
    }
    frames.push(arcs);
  }
  return { w, h, frames };
}

/** 周期の縁をまたぐ物（中心 x, y から reach px まで届く）を描く位置: 本体と、はみ出す側の反対の写し（最大 4 か所） */
export function wrapOffsets(x: number, y: number, reach: number, size: number): readonly (readonly [number, number])[] {
  const xs: number[] = [0];
  const ys: number[] = [0];
  if (x - reach < 0) xs.push(size);
  if (x + reach > size) xs.push(-size);
  if (y - reach < 0) ys.push(size);
  if (y + reach > size) ys.push(-size);
  const out: (readonly [number, number])[] = [];
  for (const dx of xs) for (const dy of ys) out.push([dx, dy]);
  return out;
}

/** 海の TileSprite の升（周期の単位。out に [左, 上, 横の数, 縦の数] を書く＝毎フレーム呼んでも確保しない）: 左上は view − margin を含む period の倍数、数は view ＋ margin を覆うだけ */
export function seaCellInto(out: Int32Array, viewX: number, viewY: number, viewW: number, viewH: number, period: number, margin: number): void {
  const cx = Math.floor((viewX - margin) / period);
  const cy = Math.floor((viewY - margin) / period);
  out[0] = cx;
  out[1] = cy;
  out[2] = Math.ceil((viewX + viewW + margin) / period) - cx;
  out[3] = Math.ceil((viewY + viewH + margin) / period) - cy;
}

/** 夜明けの光の α: 夜 0・移り変わりの中ほどで最大・昼 0（R4）。昼から始まる任務（dayStart）は 0。段は 0〜steps */
export function dawnGlowAlpha(step: number, steps: number, dayStart: boolean): number {
  if (dayStart || step <= 0 || step >= steps) return 0;
  return DAWN_GLOW_ALPHA_MAX * Math.sin((Math.PI * step) / steps);
}

/** 2 色の線形の混ぜ（f 0 → a・1 → b） */
export function mixRgb(a: number, b: number, f: number): number {
  const ch = (sh: number): number => Math.round(((a >> sh) & 0xff) + (((b >> sh) & 0xff) - ((a >> sh) & 0xff)) * f);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** きらめきの明滅（1 − swing × (0.5 + 0.5 sin)。1 − swing 〜 1 の間。周期 ≥ GLINT_PERIOD_MIN_S・swing ≤ GLINT_SWING_MAX） */
export function glintBlink(t: number, periodS: number, phase: number): number {
  const p = periodS < GLINT_PERIOD_MIN_S ? GLINT_PERIOD_MIN_S : periodS;
  return 1 - GLINT_SWING_MAX * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / p + phase));
}

/** 画面（lo〜hi）＋余白 m の外へ出た座標を反対側へ（出た分だけ内側に） */
export function wrapInto(v: number, lo: number, hi: number, m: number): number {
  const span = hi - lo + 2 * m;
  if (v < lo - m) return v + span;
  if (v > hi + m) return v - span;
  return v;
}
