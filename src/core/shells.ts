// 弾の模型（v0.4.2 で gunnery.ts から切り出し。中身は v0.4.1 の updateGuns のまま）: 駆逐艦の砲・大発の機銃・艇の砲が共有する。Phaser 非依存、確保しない。
// 狙いは見越し点（会合の解が無ければ今の位置）＋ 半径 spread の一様円盤（r = spread√u。乱数 2 回）。飛行は game 秒で積分し、着いた点で当たりを判定する。
import type { BoatState } from './boat-motion';
import type { SeededRng } from './rng';
import { interceptTimeS } from './torpedo-solver';
import { degToRad } from './units';

export interface ShellState {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 着弾までの残り（game 秒） */
  leftS: number;
  impactX: number;
  impactY: number;
  gunIndex: number;
}

export function createShells(n: number): ShellState[] {
  const shells: ShellState[] = [];
  for (let i = 0; i < n; i++) shells.push({ active: false, x: 0, y: 0, vx: 0, vy: 0, leftS: 0, impactX: 0, impactY: 0, gunIndex: 0 });
  return shells;
}

export function findFreeShell(shells: ShellState[]): ShellState | null {
  for (let i = 0; i < shells.length; i++) if (!shells[i]!.active) return shells[i]!;
  return null;
}

/**
 * 1 発を撃つ: (sx, sy) から速さ speedMps（game m/秒）の弾で、(tx, ty) を速度 (tvx, tvy) で進む目標の見越し点＋散布へ。
 * 散布は半径 spreadM の円盤に一様（命中率 ≈ 船体の面積 / 円盤の面積）。乱数を必ず 2 回引く
 */
export function launchShell(shell: ShellState, sx: number, sy: number, tx: number, ty: number, tvx: number, tvy: number, speedMps: number, spreadM: number, gunIndex: number, rng: SeededRng): void {
  const t = interceptTimeS(sx, sy, speedMps, tx, ty, tvx, tvy);
  let ax = tx;
  let ay = ty;
  if (t !== null) {
    ax += tvx * t;
    ay += tvy * t;
  }
  const r = spreadM * Math.sqrt(rng.next());
  const th = rng.next() * Math.PI * 2;
  ax += Math.cos(th) * r;
  ay += Math.sin(th) * r;
  const fx = ax - sx;
  const fy = ay - sy;
  const dist = Math.sqrt(fx * fx + fy * fy);
  const flight = Math.max(dist / speedMps, 1e-3);
  shell.active = true;
  shell.x = sx;
  shell.y = sy;
  shell.vx = fx / flight;
  shell.vy = fy / flight;
  shell.leftS = flight;
  shell.impactX = ax;
  shell.impactY = ay;
  shell.gunIndex = gunIndex;
}

/** 飛んでいる弾を dt（game 秒）進める。着いたら active を落として true（着弾点は impactX/Y） */
export function advanceShell(s: ShellState, dt: number): boolean {
  s.leftS -= dt;
  if (s.leftS > 0) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    return false;
  }
  s.active = false;
  return true;
}

/** 点が艇（中心・方位・半長の線分）から radius 以内か（距離二乗で比較） */
export function pointNearBoat(x: number, y: number, boat: BoatState, halfLengthM: number, radiusM: number): boolean {
  const h = degToRad(boat.headingDeg);
  const ux = Math.sin(h) * halfLengthM;
  const uy = -Math.cos(h) * halfLengthM;
  const ax = boat.x - ux;
  const ay = boat.y - uy;
  const abx = 2 * ux;
  const aby = 2 * uy;
  const apx = x - ax;
  const apy = y - ay;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? (apx * abx + apy * aby) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = apx - abx * t;
  const ey = apy - aby * t;
  return ex * ex + ey * ey <= radiusM * radiusM;
}
