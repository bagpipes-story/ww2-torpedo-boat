// 米PT の航過の読みやすさの部品（v0.6.3。docs/02 §6.4、spec §C.7）: 最接近までの体感秒・突撃の狙いの点・艇首尾の撃たない円錐・かわす向き。
// Phaser 非依存・確保しない（狙いの点は呼ぶ側の使い回しの out に書く）。方位は北 0・時計回り、x は東・y は南。
import { interceptTimeS } from './torpedo-solver';
import { clamp, degToRad, wrapDeg180 } from './units';

/** かわす向きの言い方の境目 deg: 逃げる針路（航過の線の直角）との差がこれ未満なら「そのまま」。言い回しの閾値で、強さの調整値ではない（seaplane-ordnance の DODGE_TURN_DEG と同じ考え） */
export const PT_DODGE_STRAIGHT_DEG = 30;

/** かわす向き: +1 = 右へ（時計回り）、−1 = 左へ、0 = そのまま */
export type PtDodge = -1 | 0 | 1;

/**
 * 最接近までの体感秒: r は相手の位置 − 自分の位置、rv は相手の速度 − 自分の速度（game m/s）。
 * 近づいていない（r·rv ≥ 0）か相対速度 0 なら Infinity。game 秒を time_scale で割って体感秒にする
 */
export function tcpaFeltS(rx: number, ry: number, rvx: number, rvy: number, timeScale: number): number {
  const rr = rx * rvx + ry * rvy;
  const vv = rvx * rvx + rvy * rvy;
  return rr < 0 && vv > 0 ? -rr / vv / timeScale : Infinity;
}

/**
 * 突撃の狙いの点を out に書く: 目標 (tx, ty)・速度 (tvx, tvy) との会合点（解が無ければ今の距離 / 速さ の秒だけ先）から、
 * 進む向きの直角に side × offsetM ずらす（side +1 は目標を PT の右に見て航過する側）。海域の縁から marginM の内に収める
 */
export function aimPoint(
  out: { x: number; y: number },
  bx: number, by: number, speedMps: number,
  tx: number, ty: number, tvx: number, tvy: number,
  side: number, offsetM: number, w: number, h: number, marginM: number,
): void {
  const rx = tx - bx;
  const ry = ty - by;
  const tau = interceptTimeS(bx, by, speedMps, tx, ty, tvx, tvy) ?? Math.sqrt(rx * rx + ry * ry) / speedMps;
  let ax = tx + tvx * tau;
  let ay = ty + tvy * tau;
  const ux = ax - bx;
  const uy = ay - by;
  const len = Math.sqrt(ux * ux + uy * uy);
  if (len > 0) {
    ax += (side * offsetM * uy) / len;
    ay -= (side * offsetM * ux) / len;
  }
  out.x = clamp(ax, marginM, w - marginM);
  out.y = clamp(ay, marginM, h - marginM);
}

/** 艇首・艇尾の円錐（半角の cos²）の中か: 向き (hx, hy) は単位ベクトル、(dx, dy) は相手への相対位置、d2 はその二乗の長さ。平方根なし */
export function inDeadCone(hx: number, hy: number, dx: number, dy: number, d2: number, cosDead2: number): boolean {
  const dot = hx * dx + hy * dy;
  return dot * dot > cosDead2 * d2;
}

/**
 * かわす向き（航過の進路を固めた瞬間に 1 回。HUD の「右へ／左へ転舵」）: 航過の線（PT (bx, by) から lockDeg）のどちら側に艇がいるかで、
 * 線から離れる直角（線の右なら lockDeg + 90）へ向くのに右回りか左回りか。差が PT_DODGE_STRAIGHT_DEG 未満なら 0（そのまま全速で離れる）
 */
export function dodgeTurn(lockDeg: number, bx: number, by: number, px: number, py: number, playerHeadingDeg: number): PtDodge {
  const r = degToRad(lockDeg);
  const hx = Math.sin(r);
  const hy = -Math.cos(r);
  const cross = hx * (py - by) - hy * (px - bx);
  const escape = lockDeg + (cross >= 0 ? 90 : -90);
  const turn = wrapDeg180(escape - playerHeadingDeg);
  if (Math.abs(turn) < PT_DODGE_STRAIGHT_DEG) return 0;
  return turn > 0 ? 1 : -1;
}

/** 目標 (tx, ty) が針路 headingDeg の (bx, by) から見て右（+1）か左（−1）か（真正面・真後ろは右） */
export function targetSide(headingDeg: number, bx: number, by: number, tx: number, ty: number): number {
  const r = degToRad(headingDeg);
  return Math.sin(r) * (ty - by) + Math.cos(r) * (tx - bx) >= 0 ? 1 : -1;
}

/** 海域の縁から marginM の内側の帯にいる（航過・離脱を打ち切る） */
export function nearEdge(x: number, y: number, bounds: { width: number; height: number }, marginM: number): boolean {
  return x < marginM || y < marginM || x > bounds.width - marginM || y > bounds.height - marginM;
}
