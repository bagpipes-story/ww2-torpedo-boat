// 揚陸の任務（v0.6.9。jp_04）の米PT の線の幾何（spec-v069 §4.9 の V7・V9・V13 と §3.7 の表）。config/landing-mission-data の検査と tests/jp04-mission が読む。
// 線の今夜の形は core/pt-night の ptStartAt（線ごと南北のずれ dy・縁の余白への押し戻し込み。線に沿ったずれ dx は出発点だけを動かし線は変えない）。
// 東西反転は見ない（揚陸の任務は night.mirror_chance 0＝V1）。Phaser 非依存。出撃の組み立てで 1 回（毎ステップは呼ばない）。
import { ptStartAt, type PtParams } from './pt-data';
import { bearingDeg } from './ship-ai';
import { clamp, wrapDeg180 } from './units';

/** V13 の南北のずれの刻みの数（−jy〜+jy を等分。両端を含む 21 点。押し戻しの角も入る） */
export const LANDING_JITTER_STEPS = 20;

const LEG = { x0: 0, y0: 0, x1: 0, y1: 0, x: 0, y: 0, headingDeg: 0 };

/** i 隻目の線を南北のずれ dy（押し戻し込み）で LEG に書く */
function legAt(p: PtParams, i: number, dy: number): typeof LEG {
  ptStartAt(p, i, 0, dy, false, LEG);
  return LEG;
}

/** V7・§3.7: i 隻目の線の終わりから点 (ax, ay) までの m の [最短, 最長]（南北のずれの両端 ±jy） */
export function legEndRangeM(p: PtParams, i: number, jy: number, ax: number, ay: number): [number, number] {
  let lo = Infinity;
  let hi = 0;
  for (const dy of [-jy, jy]) {
    const l = legAt(p, i, dy);
    const d = Math.hypot(l.x1 - ax, l.y1 - ay);
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  return [lo, hi];
}

/** V9: i 隻目の線の向きと、線の終わりから (ax, ay) への方位の差の最大 deg（ずれの両端）。まっすぐ寄る線では終わりが最大（途中の点の差はこれ以下） */
export function legEndBowErrDeg(p: PtParams, i: number, jy: number, ax: number, ay: number): number {
  let m = 0;
  for (const dy of [-jy, jy]) {
    const l = legAt(p, i, dy);
    m = Math.max(m, Math.abs(wrapDeg180(bearingDeg(l.x0, l.y0, l.x1, l.y1) - bearingDeg(l.x1, l.y1, ax, ay))));
  }
  return m;
}

/**
 * V13: i 隻目の線のうち (ax, ay) から farM より遠い部分（今夜の南北のずれを steps 等分・押し戻し込み）と点 (px, py) の最短 m。
 * 遠い部分が無ければ Infinity。線分から円を除いた区間（多くて 2 つ）への距離を解いて求める（標本の点ではない）
 */
export function farLegClearM(p: PtParams, i: number, jy: number, ax: number, ay: number, farM: number, px: number, py: number, steps: number = LANDING_JITTER_STEPS): number {
  let best2 = Infinity;
  for (let k = 0; k <= steps; k++) {
    const dy = steps === 0 ? 0 : -jy + (2 * jy * k) / steps;
    const l = legAt(p, i, dy);
    best2 = Math.min(best2, outsideDiskDist2(l.x0, l.y0, l.x1, l.y1, ax, ay, farM, px, py));
  }
  return Math.sqrt(best2);
}

/** 線分 (x0, y0)–(x1, y1) のうち中心 (ax, ay)・半径 r の円の外の部分と点 (px, py) の最短距離の二乗（外の部分が無ければ Infinity） */
export function outsideDiskDist2(x0: number, y0: number, x1: number, y1: number, ax: number, ay: number, r: number, px: number, py: number): number {
  const vx = x1 - x0;
  const vy = y1 - y0;
  const fx = x0 - ax;
  const fy = y0 - ay;
  const a = vx * vx + vy * vy;
  const c = fx * fx + fy * fy - r * r;
  if (a === 0) return c > 0 ? (x0 - px) * (x0 - px) + (y0 - py) * (y0 - py) : Infinity;
  const b = 2 * (vx * fx + vy * fy);
  const disc = b * b - 4 * a * c;
  if (disc <= 0) return segDist2(px, py, x0, y0, x1, y1); // 円に入らない（触れるだけ）: 線分のすべてが外
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a);
  const t2 = (-b + s) / (2 * a);
  let best = Infinity;
  if (t1 > 0) {
    const t = Math.min(t1, 1);
    best = Math.min(best, segDist2(px, py, x0, y0, x0 + vx * t, y0 + vy * t));
  }
  if (t2 < 1) {
    const t = Math.max(t2, 0);
    best = Math.min(best, segDist2(px, py, x0 + vx * t, y0 + vy * t, x1, y1));
  }
  return best;
}

function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  const t = l2 > 0 ? clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1) : 0;
  const dx = ax + vx * t - px;
  const dy = ay + vy * t - py;
  return dx * dx + dy * dy;
}
