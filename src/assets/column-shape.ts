// v0.7.0 IP2（U7「魚雷の爆発はもっと轟沈感を出すために派手に水柱を立たせてください」）: 魚雷の命中の水柱の Phaser に依らない式（systems/torpedo-column-fx が毎フレーム使う）。
// 真上から見た画面なので、柱の高さは画面の上へずらして見せる（IP1b の柱 columnPoseInto と同じ見せ方）。式は out へ書くか数を返すだけ（確保しない＝CLAUDE.md §7）。tests/fx-art-ip2 が確かめる。
import {
  COLUMN_BLOBS, COLUMN_BLOB_ALPHA, COLUMN_BLOB_R_BASE_M, COLUMN_BLOB_R_TOP_M, COLUMN_BLOB_STRETCH, COLUMN_FALL_END_S, COLUMN_FALL_LEFT, COLUMN_FALL_SPREAD, COLUMN_HEIGHT_M,
  COLUMN_HOLD_END_S, COLUMN_HOLD_GROW, COLUMN_RISE_S, COLUMN_SKIRT_ALPHA, COLUMN_SKIRT_FLAT, COLUMN_SKIRT_GROW, COLUMN_SKIRT_R_M, COLUMN_SKIRT_S,
} from '../config/column-art-config';

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** 崩れの進み（0＝保つ間・1＝崩れの終わり） */
export function columnFall(age: number): number {
  return clamp01((age - COLUMN_HOLD_END_S) / (COLUMN_FALL_END_S - COLUMN_HOLD_END_S));
}

/** 柱の高さ m: 速く上がって緩む（easeOutCubic）→ 保つ間に少し伸びる → 崩れで縮む（落ちる水は加速する＝2 乗） */
export function columnHeightM(age: number): number {
  if (age <= 0) return 0;
  if (age < COLUMN_RISE_S) {
    const u = 1 - age / COLUMN_RISE_S;
    return COLUMN_HEIGHT_M * (1 - u * u * u);
  }
  const hold = 1 + COLUMN_HOLD_GROW * clamp01((age - COLUMN_RISE_S) / (COLUMN_HOLD_END_S - COLUMN_RISE_S));
  const f = columnFall(age);
  return COLUMN_HEIGHT_M * hold * (1 - (1 - COLUMN_FALL_LEFT) * f * f);
}

/**
 * 柱の塊 j（0＝根元 … COLUMN_BLOBS − 1＝頂）: out[0]＝上へずらす m・out[1]＝横の半径 m・out[2]＝縦の半径 m・out[3]＝α・out[4]＝色の混ぜ（0 根元 → 1 頂）。
 * 上がる間は塊が根元から伸びて太り、崩れで頂から薄れて広がる（頂ほど早く薄れる＝落ちる飛沫）。寿命の外は α 0
 */
export function columnBlobInto(out: Float32Array, age: number, j: number): Float32Array {
  const f = j / (COLUMN_BLOBS - 1);
  const h = columnHeightM(age);
  const rise = clamp01(age / COLUMN_RISE_S);
  const fall = columnFall(age);
  const r = (COLUMN_BLOB_R_BASE_M + (COLUMN_BLOB_R_TOP_M - COLUMN_BLOB_R_BASE_M) * Math.pow(f, 1.3)) * (0.45 + 0.55 * rise) * (1 + COLUMN_FALL_SPREAD * fall * (0.4 + 0.6 * f));
  out[0] = h * f * 0.88;
  out[1] = r;
  out[2] = r * (f > 0 && f < 1 ? COLUMN_BLOB_STRETCH : 1.1);
  out[3] = age <= 0 || age >= COLUMN_FALL_END_S ? 0 : COLUMN_BLOB_ALPHA * Math.min(1, age / 0.08) * Math.pow(1 - fall, 0.7 + 0.8 * f);
  out[4] = f;
  return out;
}

/** 根元の飛沫（平たい白い塊が広がって薄れる）: out[0]＝横の半径 m・out[1]＝縦の半径 m・out[2]＝α */
export function columnSkirtInto(out: Float32Array, age: number): Float32Array {
  const t = clamp01(age / COLUMN_SKIRT_S);
  const e = 1 - (1 - t) * (1 - t);
  const r = COLUMN_SKIRT_R_M * (0.45 + (COLUMN_SKIRT_GROW - 0.45) * e);
  out[0] = r;
  out[1] = r * COLUMN_SKIRT_FLAT;
  out[2] = age <= 0 || t >= 1 ? 0 : COLUMN_SKIRT_ALPHA * Math.min(1, age / 0.06) * (1 - Math.pow(t, 1.4));
  return out;
}

/** 水面の輪（at 秒に始まり life 秒で r0 → r1 m に広がる。速く広がって緩む・入りは 0.15 秒）: out[0]＝半径 m・out[1]＝α（alpha0 → 0） */
export function columnRingInto(out: Float32Array, age: number, at: number, life: number, r0: number, r1: number, alpha0: number): Float32Array {
  const a = age - at;
  const t = clamp01(a / life);
  out[0] = r0 + (r1 - r0) * (1 - Math.pow(1 - t, 2.2));
  out[1] = a <= 0 || t >= 1 ? 0 : alpha0 * Math.min(1, a / 0.15) * (1 - t);
  return out;
}

/** 落ちる水滴の高さ m（放った高さ h0 から重さ g で落ちる。0 で水面＝消える） */
export function rainHeightM(h0: number, t: number, g: number): number {
  return h0 - 0.5 * g * t * t;
}

/** 1 本の柱の見える物の数（年 age。柱の塊・根元の飛沫・輪・霧。水滴は別のプール）。tests の予算の数え方 */
export function columnVisibleParts(age: number, mistAt: number, mistS: number, foamAt: number, foamS: number, sprayS: number): number {
  let n = 0;
  if (age > 0 && age < COLUMN_FALL_END_S) n += COLUMN_BLOBS;
  if (age > 0 && age < COLUMN_SKIRT_S) n += 2;
  if (age > 0 && age < sprayS) n++;
  if (age > foamAt && age < foamAt + foamS) n++;
  if (age > mistAt && age < mistAt + mistS) n += 3;
  return n;
}
