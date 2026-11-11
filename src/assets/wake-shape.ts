// v0.7.0 IP1a（アートと音①：コードで描く絵。ユーザーの U5「航跡が直線すぎるので少し揺らぎを出してください」）: 航跡の尾の Phaser に依らない式。
// 泡を置くか（艇尾の進んだ距離の 2 乗で比べる）・置く時の濃さと寿命（自艇は速力帯、ほかは速さ）・泡の α と広がりの曲線・横の揺れ・泡の絵の画素（assets/fx-art が ImageData に書く）。
// systems/wake-fx が毎フレーム使う式は out へ書くだけ（確保しない＝CLAUDE.md §7）。tests/wake-trail が確かめる。
import { WAKE_HIDE_BELOW_MPS, WAKE_HULL_ALPHA_MIN, type WakeKindArt } from '../config/fx-art-config';
import {
  WAKE_JUMP_SPACINGS, WAKE_PUFF_ALPHA_MAX, WAKE_PUFF_BUBBLES, WAKE_PUFF_CENTER_ALPHA, WAKE_PUFF_CRUISE_SHARE, WAKE_PUFF_EDGE_AT, WAKE_PUFF_FADE_IN, WAKE_PUFF_SILENT_ALPHA,
  WAKE_PUFF_SILENT_LIFE_SHARE, WAKE_PUFF_SILENT_WIDTH_SHARE, WAKE_PUFF_SPEED_FLOOR,
} from '../config/wake-art-config';
import { SeededRng } from '../core/rng';
import { easeOutCubic, type SpeedBand } from './fx-shape';

/** 泡を置く時の値（update が out へ書く）: on＝置く・a0＝α の上限・lifeShare・widthShare＝寿命と幅の割合・bubble＝静音の小さな泡の絵 */
export interface TrailEmit {
  on: boolean;
  a0: number;
  lifeShare: number;
  widthShare: number;
  bubble: boolean;
}

function set(out: TrailEmit, on: boolean, a0: number, lifeShare: number, widthShare: number, bubble: boolean): TrailEmit {
  out.on = on;
  out.a0 = a0;
  out.lifeShare = lifeShare;
  out.widthShare = widthShare;
  out.bubble = bubble;
  return out;
}

/**
 * 泡を置く時の値。自艇（band が null でない＝jp_03 は座席の隊長艇）は速力帯（R1・D9）: 停止＝置かない、静音＝薄い小さな泡（α ≤ 0.12）、巡航＝上限 × 割合、全速＝上限。
 * ほかの船体は 隠す速さ未満で置かない、α ＝ 上限 × (下限 ＋ (1 − 下限) × min(1, 速さ/基準))。どれも船体の絵が見えない・薄い（夜の sighted・陰に隠れた隊・沈む途中）なら置かない（敵の位置をばらさない）
 */
export function trailEmit(band: SpeedBand | null, kind: WakeKindArt, speedMps: number, hullVisible: boolean, hullAlpha: number, out: TrailEmit): TrailEmit {
  if (!hullVisible || hullAlpha < WAKE_HULL_ALPHA_MIN) return set(out, false, 0, 1, 1, false);
  if (band === null) {
    if (speedMps < WAKE_HIDE_BELOW_MPS) return set(out, false, 0, 1, 1, false);
    const share = WAKE_PUFF_SPEED_FLOOR + (1 - WAKE_PUFF_SPEED_FLOOR) * Math.min(1, speedMps / kind.refMps);
    return set(out, true, WAKE_PUFF_ALPHA_MAX * share * hullAlpha, 1, 1, false);
  }
  if (band === 'stop') return set(out, false, 0, 1, 1, false);
  if (band === 'silent') return set(out, true, WAKE_PUFF_SILENT_ALPHA * hullAlpha, WAKE_PUFF_SILENT_LIFE_SHARE, WAKE_PUFF_SILENT_WIDTH_SHARE, true);
  return set(out, true, WAKE_PUFF_ALPHA_MAX * (band === 'cruise' ? WAKE_PUFF_CRUISE_SHARE : 1) * hullAlpha, 1, 1, false);
}

/** 艇尾が前に泡を置いた所から (dx, dy) 動いた時: 0＝まだ・1＝置く（間隔以上）・2＝遠すぎる（間隔 × WAKE_JUMP_SPACINGS より遠い＝尾をつながず置き直す）。2 乗で比べる */
export function trailStep(dx: number, dy: number, spacingM: number): 0 | 1 | 2 {
  const d2 = dx * dx + dy * dy;
  if (d2 > spacingM * spacingM * WAKE_JUMP_SPACINGS * WAKE_JUMP_SPACINGS) return 2;
  return d2 >= spacingM * spacingM ? 1 : 0;
}

/** 泡の α: 寿命の WAKE_PUFF_FADE_IN まで 0 → a0、その後 (1 − t)(1 − t/2) で 0 へ（寿命で 0） */
export function puffAlpha(age: number, lifeS: number, a0: number): number {
  if (age >= lifeS || lifeS <= 0) return 0;
  const t = age / lifeS;
  const fin = t < WAKE_PUFF_FADE_IN ? t / WAKE_PUFF_FADE_IN : 1;
  return a0 * fin * (1 - t) * (1 - t / 2);
}

/** 泡の幅（w0 → w1 を easeOut で＝艇尾の近くで速く広がり、後ろでゆっくり） */
export function puffWidth(age: number, lifeS: number, w0: number, w1: number): number {
  return w0 + (w1 - w0) * easeOutCubic(age / lifeS);
}

/** 横の揺れ（位相 φ の 2 つの正弦の和。−1.35〜1.35 倍） */
export function swayAt(phase: number): number {
  return Math.sin(phase) + 0.35 * Math.sin(2.1 * phase + 1.3);
}

/** 重なった帯の α（1 つの α a の泡が n 枚重なる）。雷跡の点 0.55 と比べる（R7） */
export function stackedAlpha(a: number, n: number): number {
  return 1 - (1 - a) ** n;
}

/** 泡の絵の α（frame p0。u＝横 −1〜1・v＝縦 −1〜1）: 横は中央 CENTER → 両側の EDGE_AT で 1 → 外へ 0、縦は両端へ柔らかく */
export function puffFoamAlpha(u: number, v: number): number {
  const au = Math.abs(u);
  const e = WAKE_PUFF_EDGE_AT;
  const across = au <= e ? WAKE_PUFF_CENTER_ALPHA + (1 - WAKE_PUFF_CENTER_ALPHA) * (au / e) ** 2 : au >= 1 ? 0 : 1 - ((au - e) / (1 - e)) ** 2 * (3 - (2 * (au - e)) / (1 - e));
  const av = Math.abs(v);
  const along = av >= 1 ? 0 : (1 - av * av) * (1 - av * av);
  return across * along;
}

/** 泡の絵の画素（RGBA・w × h を frame 2 枚＝縦に 2h）。p0＝泡の帯、p1＝小さな柔らかい泡の点（絵だけの乱数 seed）。白・α だけ */
export function wakePuffPixels(w: number, h: number, seed: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 2 * 4);
  const rng = new SeededRng(seed);
  const dots: [number, number, number][] = [];
  for (let i = 0; i < WAKE_PUFF_BUBBLES; i++) dots.push([rng.nextRange(-0.55, 0.55), rng.nextRange(-0.7, 0.7), rng.nextRange(0.1, 0.18)]);
  for (let y = 0; y < h * 2; y++) {
    for (let x = 0; x < w; x++) {
      const u = ((x + 0.5) / w) * 2 - 1;
      const v = (((y % h) + 0.5) / h) * 2 - 1;
      let a = 0;
      if (y < h) a = puffFoamAlpha(u, v);
      else for (const [cx, cy, r] of dots) a = Math.max(a, Math.max(0, 1 - Math.hypot(u - cx, (v - cy) * (h / w)) / r));
      const i = (y * w + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = Math.round(255 * Math.min(1, a));
    }
  }
  return px;
}
