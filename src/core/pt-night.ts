// 米PT の隊（v0.6.3。docs/02 §6.4、spec §C.4）に今夜の揺らぎを当てる（core/pt-data から分けた。pt-data の行数のため。中身はそのまま）。Phaser 非依存。
// 確保は ptParamsAtNight だけ（出撃の組み立ての 1 回）。ptStartAt は書き込み先を呼ぶ側が持つ（config/pt-mission-data の「出発で見つからない」検査も使う）。
// 使う側は core/pt-data から import する（ここを出し直している）。
import type { PtParams } from './pt-data';
import { bearingDeg } from './ship-ai';
import { clamp } from './units';

/**
 * i 隻目の今夜の線と出発点を out に書く（spec §C.4）: 出発位置を線に沿って dx（線の中に収める）、線ごと南北に dy（端の余白の中へ線ごと戻す。片端だけを動かさない）、
 * mirrored なら東西反転（逆向きに哨戒）。針路は線の向き（始点 → 終点）。p は揺らぎの前（getPtParams の値）
 */
export function ptStartAt(p: PtParams, i: number, dx: number, dy: number, mirrored: boolean, out: { x0: number; y0: number; x1: number; y1: number; x: number; y: number; headingDeg: number }): void {
  const x0 = p.legs[4 * i]!;
  const y0 = p.legs[4 * i + 1]!;
  const x1 = p.legs[4 * i + 2]!;
  const y1 = p.legs[4 * i + 3]!;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const along = clamp(p.startAlongM + dx, 0, len);
  const lo = p.edgeMarginM;
  const hi = p.bounds.height - p.edgeMarginM;
  let sy = dy;
  const top = Math.min(y0, y1) + sy;
  const bottom = Math.max(y0, y1) + sy;
  if (top < lo) sy += lo - top;
  else if (bottom > hi) sy -= bottom - hi;
  const w = p.bounds.width;
  const mx = (x: number): number => (mirrored ? w - x : x);
  out.x0 = mx(x0);
  out.y0 = y0 + sy;
  out.x1 = mx(x1);
  out.y1 = y1 + sy;
  out.x = mx(x0 + ((x1 - x0) * along) / len);
  out.y = y0 + ((y1 - y0) * along) / len + sy;
  out.headingDeg = bearingDeg(out.x0, out.y0, out.x1, out.y1);
}

/** 今夜の揺らぎを当てた複製（systems/world-night の applyPtNight。出撃の組み立ての 1 回だけ）。p は揺らぎの前（getPtParams の値。二重に掛けない） */
export function ptParamsAtNight(p: PtParams, dx: number, dy: number, mirrored: boolean): PtParams {
  const legs = new Float64Array(4 * p.count);
  const startX = new Float64Array(p.count);
  const startY = new Float64Array(p.count);
  const startHeadingDeg = new Float64Array(p.count);
  const s = { x0: 0, y0: 0, x1: 0, y1: 0, x: 0, y: 0, headingDeg: 0 };
  for (let i = 0; i < p.count; i++) {
    ptStartAt(p, i, dx, dy, mirrored, s);
    legs[4 * i] = s.x0;
    legs[4 * i + 1] = s.y0;
    legs[4 * i + 2] = s.x1;
    legs[4 * i + 3] = s.y1;
    startX[i] = s.x;
    startY[i] = s.y;
    startHeadingDeg[i] = s.headingDeg;
  }
  return { ...p, legs, startX, startY, startHeadingDeg };
}
