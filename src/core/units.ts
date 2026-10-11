// 単位変換（docs/02 §6.1）。Phaser 非依存の純粋関数。数値の正はここと data/*.json。
// 世界座標は 1ユニット＝1m、速度は m/s、角度は度で持ち、必要なときだけ変換する。

/** 1 kt = 0.5144 m/s（docs/02 §6.1、data/hit_rate_model.json の注記と同値） */
export const MPS_PER_KNOT = 0.5144;
/** 1 yd = 0.9144 m（国際ヤード） */
export const METERS_PER_YARD = 0.9144;
/** 1 海里 = 1852 m */
export const METERS_PER_NAUTICAL_MILE = 1852;
/** 燃料の消費率（gal/h）を秒の積分に使うとき */
export const SECONDS_PER_HOUR = 3600;

export function ktToMps(kt: number): number {
  return kt * MPS_PER_KNOT;
}

export function mpsToKt(mps: number): number {
  return mps / MPS_PER_KNOT;
}

export function ydToM(yd: number): number {
  return yd * METERS_PER_YARD;
}

export function mToYd(m: number): number {
  return m / METERS_PER_YARD;
}

export function nmToM(nm: number): number {
  return nm * METERS_PER_NAUTICAL_MILE;
}

export function mToNm(m: number): number {
  return m / METERS_PER_NAUTICAL_MILE;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** 角度を (-180, 180] に正規化する。針路差の計算で使う。範囲内の値は丸め誤差を避けてそのまま返す */
export function wrapDeg180(deg: number): number {
  if (deg > -180 && deg <= 180) return deg;
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

/** 角度を [0, 360) に正規化する。針路（方位）の保持に使う */
export function wrapDeg360(deg: number): number {
  const d = deg % 360;
  const r = d < 0 ? d + 360 : d;
  // ごく小さい負数は d + 360 が丸めで 360 になるので 0 に戻す（-0 も +0 に）
  return r >= 360 ? 0 : r + 0;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
