// v0.7.0 IP1b（U3「もっと派手な演出、数でも大丈夫」）: 派手にした演出の Phaser に依らない式。火花・水滴の弧（真上から見た放物線＝跳んだ高さを画面の上へずらす）、
// 爆発の 2 段目の部品（2 つ目の閃光・2 つ目の火球・水柱の柱・水面の衝撃波）の曲線、沈没の段の 2 次の爆発の時刻と置く所、火花と衝撃波の画素、1 回の演出の見える物の数。
// tests/fx-art-ip1b が確かめる。update で使う式は out へ書くか数を返すだけ（確保しない＝CLAUDE.md §7）。乱数は呼ぶ側の絵だけの SeededRng。
import {
  BLAST_COLUMN_ALPHA, BLAST_COLUMN_RISE_M, BLAST_COLUMN_S, BLAST_COLUMN_STRETCH, BLAST_PARTS, BLAST_SHOCK_ALPHA, BLAST_SHOCK_FROM, BLAST_SHOCK_S, BLAST_SMOKE_BIG, BLAST_SMOKE_SECONDARY,
  BLAST_SMOKE_SMALL, SINK_BLAST_SPREAD, SINK_BLAST_TIMES_BOAT, SINK_BLAST_TIMES_SHIP, SPARK_DEBRIS_BIG, SPARK_DEBRIS_SECONDARY, SPARK_DEBRIS_SMALL, SPARK_DRAG, SPARK_DROPS_BIG, SPARK_GRAVITY,
  SPARK_LIFT_SHOW,
} from '../config/blast-art-config';
import { EXPLOSION_PARTS } from '../config/fx-art-config';

/**
 * 火花・水滴の位置（真上から）: 地の位置は空気の抵抗で縮む等比の進み（τ＝(1 − e^(−D t)) / D）、跳んだ高さ h＝max(0, lift·t − G t²/2) を画面の上へ SPARK_LIFT_SHOW 倍ずらす（弧に見える）。
 * out[0]＝x・out[1]＝y・out[2]＝α（寿命の 2 乗で薄れる。寿命で 0）。age ≥ life なら out[2]＝0
 */
export function sparkPoseInto(out: Float32Array, age: number, life: number, x0: number, y0: number, vx: number, vy: number, lift: number): Float32Array {
  const tau = (1 - Math.exp(-SPARK_DRAG * age)) / SPARK_DRAG;
  const h = Math.max(0, lift * age - 0.5 * SPARK_GRAVITY * age * age);
  out[0] = x0 + vx * tau;
  out[1] = y0 + vy * tau - h * SPARK_LIFT_SHOW;
  const u = age / life;
  out[2] = u >= 1 ? 0 : 1 - u * u;
  return out;
}

/** 水柱の柱（魚雷の命中の白い柱）: out[0]＝横の scale の割合・out[1]＝縦の割合（BLAST_COLUMN_STRETCH まで伸びて戻る）・out[2]＝上がる高さ m（上がって落ちる）・out[3]＝α */
export function columnPoseInto(out: Float32Array, age: number): Float32Array {
  const t = Math.min(1, Math.max(0, age / BLAST_COLUMN_S));
  const up = Math.sin(Math.PI * Math.min(1, t * 1.15));
  out[0] = 0.55 + 0.45 * (1 - (1 - t) * (1 - t));
  out[1] = out[0] * (1 + (BLAST_COLUMN_STRETCH - 1) * up);
  out[2] = BLAST_COLUMN_RISE_M * up;
  out[3] = t >= 1 ? 0 : BLAST_COLUMN_ALPHA * (1 - Math.pow(t, 1.6));
  return out;
}

/** 水面の衝撃波: out[0]＝半径の割合（BLAST_SHOCK_FROM → 1。速く広がって緩む）・out[1]＝α（BLAST_SHOCK_ALPHA → 0） */
export function shockPoseInto(out: Float32Array, age: number): Float32Array {
  const t = Math.min(1, Math.max(0, age / BLAST_SHOCK_S));
  const e = 1 - Math.pow(1 - t, 2.4);
  out[0] = BLAST_SHOCK_FROM + (1 - BLAST_SHOCK_FROM) * e;
  out[1] = t >= 1 ? 0 : BLAST_SHOCK_ALPHA * (1 - t) * (1 - t * 0.35);
  return out;
}

/** 沈没の段の 2 次の爆発の時刻（沈み始めてからの秒。艦と小艇） */
export function sinkBlastTimes(ship: boolean): readonly number[] {
  return ship ? SINK_BLAST_TIMES_SHIP : SINK_BLAST_TIMES_BOAT;
}

/** 2 次の爆発を置く所（船体の中心から艇首の向き rot（ラジアン・0＝北）に沿って長さ × along・横へ船幅 × side。along・side は −0.5〜0.5 の乱数を呼ぶ側が渡す）: out[0]＝x・out[1]＝y */
export function sinkBlastAtInto(out: Float32Array, x: number, y: number, rot: number, lenM: number, beamM: number, along: number, side: number): Float32Array {
  const a = along * 2 * SINK_BLAST_SPREAD * lenM;
  const s = side * beamM * 0.6;
  const fx = Math.sin(rot);
  const fy = -Math.cos(rot);
  out[0] = x + fx * a - fy * s;
  out[1] = y + fy * a + fx * s;
  return out;
}

/** 1 回の演出の見える物の数（予算の確かめ用。大きい版＝爆発の 4 部品＋2 段目の 4＋煙＋破片＋水滴、小さい版＝閃光・輪・暗い玉＋煙＋破片、2 次の爆発＝2 つ目の閃光と火球＋煙＋破片） */
export function blastObjects(kind: 'big' | 'small' | 'secondary'): number {
  if (kind === 'big') return EXPLOSION_PARTS + BLAST_PARTS + BLAST_SMOKE_BIG + SPARK_DEBRIS_BIG + SPARK_DROPS_BIG;
  if (kind === 'small') return 3 + BLAST_SMOKE_SMALL + SPARK_DEBRIS_SMALL;
  return 2 + BLAST_SMOKE_SECONDARY + SPARK_DEBRIS_SECONDARY;
}

/**
 * 火花の絵の画素（白・frame 2 枚を縦に並べる。w × h × 2）: p0＝横長の火の筋（中心線が一番明るく、右＝進む向きの先が明るく後ろへ尾を引く）、p1＝丸い水滴（明るい芯と薄い縁）
 */
export function sparkPixels(w: number, h: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 2 * 4);
  const cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1); // 0＝尾・1＝先
      const v = Math.abs(y - cy) / (h / 2);
      const across = Math.max(0, 1 - v * v * (1.4 + 1.6 * (1 - u)));
      const along = u < 0.85 ? Math.pow(u / 0.85, 1.6) : 1 - (u - 0.85) / 0.15 * 0.7;
      const a = Math.max(0, Math.min(1, across * along));
      const i = (y * w + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = Math.round(a * 255);
    }
  }
  const r = h / 2;
  const cx = (w - 1) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      const a = d >= 1 ? 0 : d < 0.55 ? 1 : 1 - (d - 0.55) / 0.45;
      const i = ((h + y) * w + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = Math.round(Math.max(0, a) * 255);
    }
  }
  return px;
}

/** 衝撃波の輪の画素（白・d × d）: 半径 ringR の所に柔らかい明るい輪（幅 width）、内側に薄い面（泡立った水）。外は 0 */
export function shockwavePixels(d: number, ringR: number, width: number): Uint8ClampedArray {
  const px = new Uint8ClampedArray(d * d * 4);
  const c = (d - 1) / 2;
  for (let y = 0; y < d; y++) {
    for (let x = 0; x < d; x++) {
      const r = Math.hypot(x - c, y - c);
      const ring = Math.max(0, 1 - Math.abs(r - ringR) / width);
      const inner = r < ringR ? 0.16 * (r / ringR) : 0;
      const a = r > ringR + width ? 0 : Math.min(1, ring * ring * (3 - 2 * ring) + inner);
      const i = (y * d + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = Math.round(a * 255);
    }
  }
  return px;
}
