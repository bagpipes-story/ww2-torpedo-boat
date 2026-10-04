// 単位変換（docs/02 §6.1）。Phaser 非依存の純粋関数。数値の正はここと data/*.json。
// 世界座標は 1ユニット＝1m、速度は m/s、角度は度で持ち、必要なときだけ変換する。

/** 1 kt = 0.5144 m/s（docs/02 §6.1、data/hit_rate_model.json の注記と同値） */
export const MPS_PER_KNOT = 0.5144;
/** 1 yd = 0.9144 m（国際ヤード） */
export const METERS_PER_YARD = 0.9144;
/** 1 海里 = 1852 m */
export const METERS_PER_NAUTICAL_MILE = 1852;

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

/** 角度を (-180, 180] に正規化する。針路差の計算で使う */
export function wrapDeg180(deg: number): number {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}
