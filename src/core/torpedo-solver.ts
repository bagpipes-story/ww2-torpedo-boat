// 見越し角と命中幾何（docs/02 §6.2）。Phaser 非依存。
// 命中判定: 艦の船体を「船体に沿った円の列」で近似し、魚雷（点）との距離二乗で判定する（§7: sqrt を使わない）。
import { degToRad, radToDeg, wrapDeg360 } from './units';

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export function createCircles(count: number): Circle[] {
  const out: Circle[] = [];
  for (let i = 0; i < count; i++) out.push({ x: 0, y: 0, r: 0 });
  return out;
}

/**
 * 船体円を事前確保した配列に書き込む（毎ステップ確保しない）。
 * 円の半径は船幅の半分、中心は船首〜船尾の軸上に等間隔（端は半径分内側）。
 */
export function fillHullCircles(circles: Circle[], cx: number, cy: number, headingDeg: number, lengthM: number, beamM: number): void {
  const n = circles.length;
  const r = beamM / 2;
  const h = degToRad(headingDeg);
  const ux = Math.sin(h);
  const uy = -Math.cos(h);
  const span = Math.max(0, lengthM - 2 * r);
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : -span / 2 + (span * i) / (n - 1);
    const c = circles[i]!;
    c.x = cx + ux * t;
    c.y = cy + uy * t;
    c.r = r;
  }
}

/** 点がいずれかの円の内側か（距離二乗で判定） */
export function pointHitsCircles(x: number, y: number, circles: Circle[]): boolean {
  for (let i = 0; i < circles.length; i++) {
    const c = circles[i]!;
    const dx = x - c.x;
    const dy = y - c.y;
    if (dx * dx + dy * dy <= c.r * c.r) return true;
  }
  return false;
}

/**
 * 点が船体（円の中心を結ぶ線分の周り、半径 r の帯 = カプセル）の内側か。
 * 細長い艦では円が疎らになり円と円の間をすり抜けるので、命中判定はこちらを使う。距離二乗のみで sqrt は使わない。
 */
export function pointHitsHull(x: number, y: number, circles: Circle[]): boolean {
  const n = circles.length;
  if (n === 0) return false;
  if (n === 1) return pointHitsCircles(x, y, circles);
  for (let i = 0; i < n - 1; i++) {
    const a = circles[i]!;
    const b = circles[i + 1]!;
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = x - a.x;
    const apy = y - a.y;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? (apx * abx + apy * aby) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = apx - abx * t;
    const dy = apy - aby * t;
    const r = a.r > b.r ? a.r : b.r;
    if (dx * dx + dy * dy <= r * r) return true;
  }
  return false;
}

/**
 * 艇が艦の船体に触れているか（体当たり判定。docs/02 §6.4）。
 * 艇の 船首・中央・船尾 の 3 点のどれかが艦の船体カプセルに入れば接触。艇の幅は艦の幅に比べて小さいので省く。
 */
export function boatTouchesHull(x: number, y: number, headingDeg: number, halfLengthM: number, hull: Circle[]): boolean {
  if (pointHitsHull(x, y, hull)) return true;
  const h = degToRad(headingDeg);
  const ux = Math.sin(h) * halfLengthM;
  const uy = -Math.cos(h) * halfLengthM;
  return pointHitsHull(x + ux, y + uy, hull) || pointHitsHull(x - ux, y - uy, hull);
}

/**
 * 会合までの時間（秒）: 速度 speed の直進する弾（魚雷・砲弾）が、速度ベクトル (tvx, tvy) で直進する目標に届く時刻。
 * 解が無ければ null。shooter から target への相対位置と目標速度から 2 次方程式を解き、先に会う正の根を返す。
 */
export function interceptTimeS(sx: number, sy: number, speed: number, tx: number, ty: number, tvx: number, tvy: number): number | null {
  const rx = tx - sx;
  const ry = ty - sy;
  const a = tvx * tvx + tvy * tvy - speed * speed;
  const b = 2 * (rx * tvx + ry * tvy);
  const c = rx * rx + ry * ry;
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) < 1e-9) return null;
    const t = -c / b;
    return t > 0 ? t : null;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  const t2 = (-b + sq) / (2 * a);
  const lo = Math.min(t1, t2);
  const hi = Math.max(t1, t2);
  if (lo > 0) return lo;
  if (hi > 0) return hi;
  return null;
}

/**
 * 見越し角: 速度 torpedoSpeed の直進魚雷が、速度ベクトル (tvx, tvy) で直進する目標に当たる発射方位（度）。
 * 解が無ければ null。shooter から target への相対位置と目標速度から 2 次方程式を解く。
 */
export function interceptHeadingDeg(sx: number, sy: number, torpedoSpeed: number, tx: number, ty: number, tvx: number, tvy: number): number | null {
  const rx = tx - sx;
  const ry = ty - sy;
  const a = tvx * tvx + tvy * tvy - torpedoSpeed * torpedoSpeed;
  const b = 2 * (rx * tvx + ry * tvy);
  const c = rx * rx + ry * ry;
  let t: number;
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) < 1e-9) return null;
    t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;
    const sq = Math.sqrt(disc);
    const t1 = (-b - sq) / (2 * a);
    const t2 = (-b + sq) / (2 * a);
    t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
  }
  if (!(t > 0) || !Number.isFinite(t)) return null;
  const ix = rx + tvx * t;
  const iy = ry + tvy * t;
  // 方位: 0=北(-y)、時計回り
  return wrapDeg360(radToDeg(Math.atan2(ix, -iy)));
}

/** 方位（度）と速さから速度ベクトルを求める（出力は引数に書く） */
export function velocityFromHeading(headingDeg: number, speed: number, out: { x: number; y: number }): void {
  const h = degToRad(headingDeg);
  out.x = Math.sin(h) * speed;
  out.y = -Math.cos(h) * speed;
}
