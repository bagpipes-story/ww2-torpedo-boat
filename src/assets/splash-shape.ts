// v0.7.0 S4（アートと音①：コードで描く絵。spec-v0700 §5.3・§5.4）: 水柱と沈没の油の輪の Phaser に依らない画素の式（assets/fx-art が Boot で 1 回 ImageData に書く）。tests/fx-art-s4 が確かめる。
// 水柱＝真上から見た水柱の飛沫: 柔らかい不揃いな白い塊（輪郭を 2・3・5 つの山で揺らし、脇にこぶ）＋外の薄い霧＋少しの水滴（向きは乱数）（S3b の放射の筋は雪の結晶・ウニに見えた）。白で描き、表示側の tint で色（外れ 青白・命中 橙）。
// 油の輪＝暗い不揃いな油膜（2・3・6 つの山）＋縁の鈍い光（夜の海 #0b1020 でも形が読める）＋中の泡の小さな輪。色は焼く（tint しない）。乱れは絵だけの SeededRng（種は呼ぶ側の ART_SEED_FX）。
import {
  SLICK_ALPHA, SLICK_BUBBLE_ALPHA, SLICK_BUBBLE_R, SLICK_BUBBLE_SPREAD, SLICK_BUBBLES, SLICK_COLOR, SLICK_LOBES, SLICK_R, SLICK_SHEEN_ALPHA, SLICK_SHEEN_BAND, SLICK_SHEEN_COLOR,
  SPLASH_CORE_ALPHA, SPLASH_CORE_R, SPLASH_DROPLET_ALPHA, SPLASH_HAZE_ALPHA, SPLASH_HAZE_R, SPLASH_LOBES, SPLASH_LUMP_D, SPLASH_LUMP_R, SPLASH_LUMPS,
} from '../config/fx-art-config';
import { SeededRng } from '../core/rng';
import { splashDroplets } from './fx-shape';

/** テクスチャの縁の手前で 0 へ（半径の 94〜100%） */
const EDGE_FROM = 0.94;

function smooth(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** 輪郭の揺れ 1 + Σ amp·sin(n·θ + φ) */
function lobe(th: number, amps: readonly number[], ns: readonly number[], ph: readonly number[]): number {
  let l = 1;
  for (let i = 0; i < amps.length; i++) l += amps[i]! * Math.sin(ns[i]! * th + ph[i]!);
  return l;
}

function phases(rng: SeededRng, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(rng.nextRange(0, Math.PI * 2));
  return out;
}

type Disc = { readonly x: number; readonly y: number; readonly r: number };

/** 塊の脇のこぶ（中心からの向きは乱数・距離と半径は帯の内） */
export function splashLumps(seed: number): Disc[] {
  const rng = new SeededRng(seed + 151);
  const out: Disc[] = [];
  for (let i = 0; i < SPLASH_LUMPS; i++) {
    const a = rng.nextRange(0, Math.PI * 2);
    const d = rng.nextRange(SPLASH_LUMP_D[0], SPLASH_LUMP_D[1]);
    out.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: rng.nextRange(SPLASH_LUMP_R[0], SPLASH_LUMP_R[1]) });
  }
  return out;
}

/** 水柱の α（u, v はテクスチャの半径を 1 にした座標）。塊・こぶ・霧・水滴を重ねた α（0〜1） */
export function splashAlphaAt(u: number, v: number, ph: readonly number[], drops: readonly Disc[], lumps: readonly Disc[] = []): number {
  const rho = Math.hypot(u, v);
  if (rho >= 1) return 0;
  const th = Math.atan2(v, u);
  let core = SPLASH_CORE_ALPHA * (1 - smooth(0.45, 1, rho / (SPLASH_CORE_R * lobe(th, SPLASH_LOBES, [2, 3, 5], ph))));
  for (const l of lumps) core = Math.max(core, SPLASH_CORE_ALPHA * 0.85 * (1 - smooth(0.3, 1, Math.hypot(u - l.x, v - l.y) / l.r)));
  const haze = SPLASH_HAZE_ALPHA * (1 - smooth(0.35, 1, rho / (SPLASH_HAZE_R * lobe(th, SPLASH_LOBES, [2, 4, 6], ph.slice(3)))));
  let keep = (1 - core) * (1 - haze);
  for (const d of drops) keep *= 1 - SPLASH_DROPLET_ALPHA * (1 - smooth(0.55, 1, Math.hypot(u - d.x, v - d.y) / d.r));
  return (1 - keep) * (1 - smooth(EDGE_FROM, 1, rho));
}

/** 水柱の画素（d × d・半径 R px・白） */
export function splashPixels(d: number, R: number, seed: number): Uint8ClampedArray {
  const ph = phases(new SeededRng(seed + 101), 6);
  const drops = splashDroplets(seed);
  const lumps = splashLumps(seed);
  const px = new Uint8ClampedArray(d * d * 4);
  const c = d / 2;
  for (let y = 0; y < d; y++) {
    for (let x = 0; x < d; x++) {
      const i = (y * d + x) * 4;
      px[i] = 255;
      px[i + 1] = 255;
      px[i + 2] = 255;
      px[i + 3] = Math.round(255 * splashAlphaAt((x + 0.5 - c) / R, (y + 0.5 - c) / R, ph, drops, lumps));
    }
  }
  return px;
}

/** 泡（半径 1 の円の中の位置と半径。テクスチャの半径に対して） */
export function slickBubbles(seed: number): { x: number; y: number; r: number }[] {
  const rng = new SeededRng(seed + 211);
  const out: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < SLICK_BUBBLES; i++) {
    const a = rng.nextRange(0, Math.PI * 2);
    const d = SLICK_BUBBLE_SPREAD * Math.sqrt(rng.next());
    out.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: rng.nextRange(SLICK_BUBBLE_R[0], SLICK_BUBBLE_R[1]) });
  }
  return out;
}

/** 下の色 (r, g, b, a) の上に色 col を α a で重ねる（out に書く） */
function over(out: Float32Array, col: number, a: number): void {
  const oa = a + out[3]! * (1 - a);
  if (oa <= 0) return;
  for (let k = 0; k < 3; k++) {
    const s = (col >> (16 - 8 * k)) & 255;
    out[k] = (s * a + out[k]! * out[3]! * (1 - a)) / oa;
  }
  out[3] = oa;
}

/** 油の輪の画素（d × d・半径 R px・色つき） */
export function slickPixels(d: number, R: number, seed: number): Uint8ClampedArray {
  const ph = phases(new SeededRng(seed + 307), 3);
  const bubbles = slickBubbles(seed);
  const px = new Uint8ClampedArray(d * d * 4);
  const c = d / 2;
  const acc = new Float32Array(4);
  const mid = (SLICK_SHEEN_BAND[0] + SLICK_SHEEN_BAND[1]) / 2;
  for (let y = 0; y < d; y++) {
    for (let x = 0; x < d; x++) {
      const u = (x + 0.5 - c) / R;
      const v = (y + 0.5 - c) / R;
      const rho = Math.hypot(u, v);
      if (rho >= 1) continue;
      const s = rho / (SLICK_R * lobe(Math.atan2(v, u), SLICK_LOBES, [2, 3, 6], ph));
      acc.fill(0);
      over(acc, SLICK_COLOR, SLICK_ALPHA * (1 - smooth(0.82, 1, s)));
      over(acc, SLICK_SHEEN_COLOR, SLICK_SHEEN_ALPHA * smooth(SLICK_SHEEN_BAND[0], mid, s) * (1 - smooth(mid, SLICK_SHEEN_BAND[1], s)));
      for (const b of bubbles) over(acc, 0xffffff, SLICK_BUBBLE_ALPHA * Math.max(0, 1 - Math.abs(Math.hypot(u - b.x, v - b.y) - b.r) * R));
      const i = (y * d + x) * 4;
      px[i] = acc[0]!;
      px[i + 1] = acc[1]!;
      px[i + 2] = acc[2]!;
      px[i + 3] = Math.round(255 * acc[3]! * (1 - smooth(EDGE_FROM, 1, rho)));
    }
  }
  return px;
}
