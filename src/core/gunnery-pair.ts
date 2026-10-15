// 駆逐艦の砲撃を 2 つの目標（自艇と僚艇。v0.4.4）に向ける。gunnery.ts の updateGuns は触らない（us_02 の再生を変えない）: 1 つの砲台の状態のまま、1 発ごとに「照らされていて・有効射程内で・近い方」を狙う。
// 発射速度は目標が 2 つでも変わらない（砲台ごとの間隔は同じ）。着弾は両方の船体に対して判定する。Phaser 非依存・確保しない。
import type { BoatState } from './boat-motion';
import type { GunneryParams, GunneryState } from './gunnery';
import type { SeededRng } from './rng';
import { advanceShell, findFreeShell, launchShell, pointNearBoat } from './shells';
import { degToRad, wrapDeg180, wrapDeg360 } from './units';

/** 目標 1 つ。lit は照らされている（探照灯・星弾・照明弾。煙幕に遮られていれば false）、afloat は浮いている（沈んだ僚艇は狙わず当たらない） */
export interface GunTarget {
  state: BoatState;
  halfLengthM: number;
  halfBeamM: number;
  afloat: boolean;
  lit: boolean;
}

export interface PairShellEvents {
  onFire(gunIndex: number, x: number, y: number): void;
  /** 着弾。target は当たった目標（0 自艇、1 僚艇）、外れなら -1 */
  onImpact(gunIndex: number, x: number, y: number, target: number): void;
}

/** 点 (x, y) が探照灯の扇（点いていれば）か星弾の照明の中にあるか（gunnery の updateIllumination が自艇で更新した状態を、僚艇の位置で読む） */
export function pointIlluminated(g: GunneryState, ship: BoatState, x: number, y: number, p: GunneryParams): boolean {
  const light = g.light;
  if (light.on) {
    const dx = x - ship.x;
    const dy = y - ship.y;
    const bearing = wrapDeg360((Math.atan2(dx, -dy) * 180) / Math.PI);
    if (Math.abs(wrapDeg180(bearing - light.bearingDeg)) <= p.searchlight.coneDeg / 2 && dx * dx + dy * dy <= p.searchlight.rangeM * p.searchlight.rangeM) return true;
  }
  const star = g.star;
  if (star.leftS > 0) {
    const sx = x - star.x;
    const sy = y - star.y;
    if (sx * sx + sy * sy <= p.starshell.illumRadiusM * p.starshell.illumRadiusM) return true;
  }
  return false;
}

/**
 * 砲撃（updateGuns と同じ発射間隔・見越し・散布）。砲台ごとに、浮いていて照らされていて有効射程内の目標のうち近い方を狙う。どちらも狙えなければ撃たない（負の残りは溜めない）。
 * 着弾は a（自艇）→ b（僚艇）の順に船体を判定し、当たった方を onImpact に渡す
 */
export function updateGunsPair(g: GunneryState, ship: BoatState, a: GunTarget, b: GunTarget, canFire: boolean, p: GunneryParams, rng: SeededRng, realDt: number, dt: number, events: PairShellEvents): void {
  const ax = a.state.x - ship.x;
  const ay = a.state.y - ship.y;
  const bx = b.state.x - ship.x;
  const by = b.state.y - ship.y;
  const d2a = ax * ax + ay * ay;
  const d2b = bx * bx + by * by;
  for (let i = 0; i < p.guns.length; i++) {
    const gun = p.guns[i]!;
    const cd = Math.max(g.gunCooldownS[i]! - realDt, -realDt);
    g.gunCooldownS[i] = cd;
    const eff2 = gun.effectiveM * gun.effectiveM;
    const okA = a.afloat && a.lit && d2a <= eff2;
    const okB = b.afloat && b.lit && d2b <= eff2;
    if (!canFire || cd > 0 || (!okA && !okB)) {
      if (cd < 0) g.gunCooldownS[i] = 0;
      continue;
    }
    const shell = findFreeShell(g.shells);
    if (!shell) continue;
    g.gunCooldownS[i] = cd + 60 / (gun.roundsPerMinPerGun * gun.count);
    const t = okA && (!okB || d2a <= d2b) ? a : b;
    const d2 = t === a ? d2a : d2b;
    const ph = degToRad(t.state.headingDeg);
    launchShell(shell, ship.x, ship.y, t.state.x, t.state.y, Math.sin(ph) * t.state.speedMps, -Math.cos(ph) * t.state.speedMps, gun.shellSpeedMps, (gun.dispersionM * Math.sqrt(d2)) / gun.effectiveM, i, rng);
    events.onFire(i, ship.x, ship.y);
  }
  for (let i = 0; i < g.shells.length; i++) {
    const s = g.shells[i]!;
    if (!s.active || !advanceShell(s, dt)) continue;
    const gun = p.guns[s.gunIndex]!;
    const target = a.afloat && pointNearBoat(s.impactX, s.impactY, a.state, a.halfLengthM, a.halfBeamM + gun.splashRadiusM) ? 0 : b.afloat && pointNearBoat(s.impactX, s.impactY, b.state, b.halfLengthM, b.halfBeamM + gun.splashRadiusM) ? 1 : -1;
    events.onImpact(s.gunIndex, s.impactX, s.impactY, target);
  }
}
