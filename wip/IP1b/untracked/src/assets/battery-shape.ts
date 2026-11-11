// v0.7.0 IP1b（U4「沿岸砲もリメイクお願いします」）: 沿岸砲の砲台の Phaser に依らない形（真上から・海＝北が上・中心が砲の回り軸・単位 m）。
// コンクリートの床と砲の穴の周りに土嚢の輪（後ろ＝陸の側は出入りの口で開く）、その外の擬装の網と草木の塊（海の側の射界は空ける）、敵の赤の印（床の縁の輪と土嚢の上の三角 4 つ）。
// 砲の向き（狙う時は艇へ・ふだんは海へゆっくり首を振る・射界の内に限る）と回る速さの式も。assets/battery-art が描き、systems/shore-battery が回す。tests/fx-art-ip1b が確かめる。
import {
  BATTERY_AIM_LIMIT_DEG, BATTERY_BAG_GAP_DEG, BATTERY_BAG_RING_R, BATTERY_BAG_THICK_M, BATTERY_BAGS, BATTERY_IDLE_PERIOD_S, BATTERY_IDLE_SWING_DEG, BATTERY_NET_BLOBS, BATTERY_NET_R, BATTERY_NET_RING,
  BATTERY_RED_MARKS,
} from '../config/blast-art-config';
import { SeededRng } from '../core/rng';

/** 土嚢 1 つ（中心・接線の向き＝ラジアン・長さと厚み m・色の番） */
export interface BatteryBag {
  readonly x: number;
  readonly y: number;
  readonly ang: number;
  readonly len: number;
  readonly thick: number;
  readonly shade: 0 | 1;
}

/** 方位（度・0＝北＝海・時計回り）→ 中心からの向き（x 東・y 南が正） */
function dir(deg: number): [number, number] {
  const r = (deg * Math.PI) / 180;
  return [Math.sin(r), -Math.cos(r)];
}

/** 土嚢の輪: 南（180°）を中心に BATTERY_BAG_GAP_DEG だけ開けて、残りの角に BATTERY_BAGS 個を等しく並べる（隣と少し重ねる） */
export function batteryBags(): BatteryBag[] {
  const span = 360 - BATTERY_BAG_GAP_DEG;
  const step = span / BATTERY_BAGS;
  const out: BatteryBag[] = [];
  for (let i = 0; i < BATTERY_BAGS; i++) {
    const deg = 180 + BATTERY_BAG_GAP_DEG / 2 + step * (i + 0.5);
    const [ux, uy] = dir(deg);
    out.push({ x: ux * BATTERY_BAG_RING_R, y: uy * BATTERY_BAG_RING_R, ang: Math.atan2(uy, ux) + Math.PI / 2, len: ((step * Math.PI) / 180) * BATTERY_BAG_RING_R * 1.08, thick: BATTERY_BAG_THICK_M, shade: (i % 2) as 0 | 1 });
  }
  return out;
}

/** 擬装の網と草木の塊 1 つ（中心・半径・色の番・輪郭の点＝閉じた多角形） */
export interface BatteryBlob {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly color: number;
  readonly pts: readonly (readonly [number, number])[];
}

/** 擬装の塊: 方位は海の側 ±40° を空けて散らす（射界の前は開けた地）。輪郭は角ごとに揺れる 9 点。同じ種なら同じ */
export function batteryNet(seed: number): BatteryBlob[] {
  const rng = new SeededRng(seed);
  const out: BatteryBlob[] = [];
  for (let i = 0; i < BATTERY_NET_BLOBS; i++) {
    const deg = 40 + (280 * (i + rng.nextRange(0.1, 0.9))) / BATTERY_NET_BLOBS;
    const d = rng.nextRange(BATTERY_NET_RING[0], BATTERY_NET_RING[1]);
    const [ux, uy] = dir(deg);
    const r = rng.nextRange(BATTERY_NET_R[0], BATTERY_NET_R[1]);
    const pts: [number, number][] = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      const rr = r * rng.nextRange(0.7, 1.08);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    out.push({ x: ux * d, y: uy * d, r, color: Math.floor(rng.nextRange(0, 3)) % 3, pts });
  }
  return out;
}

/** 敵の赤の三角の印（土嚢の上・斜め 4 方位）: 中心と外を指す向き（ラジアン） */
export function batteryRedMarks(): { readonly x: number; readonly y: number; readonly ang: number }[] {
  const out: { x: number; y: number; ang: number }[] = [];
  for (let i = 0; i < BATTERY_RED_MARKS; i++) {
    const [ux, uy] = dir(45 + (360 * i) / BATTERY_RED_MARKS);
    out.push({ x: ux * BATTERY_BAG_RING_R, y: uy * BATTERY_BAG_RING_R, ang: Math.atan2(uy, ux) });
  }
  return out;
}

/**
 * 砲の向きの的（度・0＝北＝海・時計回り）: 艇に気づいて射界の中なら艇の方位（射界の限り ±BATTERY_AIM_LIMIT_DEG に収める）、ふだんは海へ ±BATTERY_IDLE_SWING_DEG をゆっくり（周期 BATTERY_IDLE_PERIOD_S）首振り
 */
export function batteryAimDeg(tracking: boolean, dx: number, dy: number, t: number): number {
  if (tracking) {
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    return Math.max(-BATTERY_AIM_LIMIT_DEG, Math.min(BATTERY_AIM_LIMIT_DEG, deg));
  }
  return BATTERY_IDLE_SWING_DEG * Math.sin((2 * Math.PI * t) / BATTERY_IDLE_PERIOD_S);
}

/** 今の向きから的へ、1 回に maxStep 度まで回す（射界の内なので ±180° の折り返しは無い） */
export function turnToward(cur: number, target: number, maxStep: number): number {
  const d = target - cur;
  return Math.abs(d) <= maxStep ? target : cur + Math.sign(d) * maxStep;
}

/** 擬装・土嚢・印のどれもが絵の一辺（size m）の内か（描いて切れないこと） */
export function batteryFits(size: number, seed: number): boolean {
  const h = size / 2;
  for (const b of batteryBags()) if (Math.hypot(b.x, b.y) + Math.hypot(b.len, b.thick) / 2 > h) return false;
  for (const n of batteryNet(seed)) if (Math.hypot(n.x, n.y) + n.r * 1.08 > h) return false;
  return true;
}
