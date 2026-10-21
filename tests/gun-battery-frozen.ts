// 艇の砲の本体の凍結した写し（v0.6.3 実機 1 回目のレビュー NP-2・F4）: d09000b（共通化の前）の src/core/gun-battery.ts の selectTarget と stepGunBattery を
// `git show d09000b:src/core/gun-battery.ts` から本文そのまま写した（import だけ今の型と定数へ）。tests/gun-battery-generic.test.ts が今の包み（stepGunBattery →
// stepGunBatteryOf）とステップごとに比べる。前は包みと本体を比べていて、どちらも同じ本体を通るので本体の書き違い（乱数の引く順など）を捕まえられなかった。
// ここは直さない（us_03 の砲を変えるなら、比べる相手ではなく tests/gun-battery-generic の決まった値と一緒に、理由を CHANGELOG に書いて替える）。
import type { BoatState, SpeedStep } from '../src/core/boat-motion';
import { bargeAfloat, type BargeState } from '../src/core/barges';
import { GUN_BLOCKED, GUN_FIRING, GUN_NO_TARGET, GUN_OUT_OF_ARC, GUN_OUT_OF_RANGE, GUN_SAFE, type GunBatteryParams, type GunBatteryState, type GunEvents } from '../src/core/gun-battery';
import type { SeededRng } from '../src/core/rng';
import { advanceShell, findFreeShell, launchShell, pointNearBoat } from '../src/core/shells';
import { degToRad } from '../src/core/units';


/**
 * 標的選び（押しているときだけ呼ぶ）: 見えている（visRange2 以内）・射程内・射界内・煙幕に遮られていない大発の最寄り。
 * 状態（理由の優先: 煙幕 > 死角 > 射程外 > いない）を g.status に書き、index を返す（無ければ -1）。g.targetM は撃つときに埋める
 */
export function selectTarget(g: GunBatteryState, p: GunBatteryParams, boat: BoatState, barges: readonly BargeState[], visRange2: number): number {
  const h = degToRad(boat.headingDeg);
  const hx = Math.sin(h);
  const hy = -Math.cos(h);
  const range2 = p.rangeM * p.rangeM;
  let best = -1;
  let bestD2 = Infinity;
  let sighted = false;
  let inRange = false;
  let blocked = false;
  for (let i = 0; i < barges.length; i++) {
    const b = barges[i]!;
    if (!bargeAfloat(b)) continue;
    const dx = b.x - boat.x;
    const dy = b.y - boat.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > visRange2) continue;
    sighted = true;
    if (d2 > range2) continue;
    inRange = true;
    const dot = dx * hx + dy * hy;
    if (dot * dot > p.deadConeCos2 * d2) continue;
    if (b.blocked) {
      blocked = true;
      continue;
    }
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  g.status = best >= 0 ? GUN_FIRING : blocked ? GUN_BLOCKED : inRange ? GUN_OUT_OF_ARC : sighted ? GUN_OUT_OF_RANGE : GUN_NO_TARGET;
  return best;
}

/** 固定ステップ: 標的選び → 組ごとの発射（押していて撃てるとき）→ 弾の飛行と着弾（着いた点にいる最初の浮いている大発に当たる） */
export function stepGunBattery(
  g: GunBatteryState,
  p: GunBatteryParams,
  boat: BoatState,
  band: SpeedStep,
  held: boolean,
  canFire: boolean,
  barges: readonly BargeState[],
  bargeHalfLengthM: number,
  bargeHalfBeamM: number,
  visRange2: number,
  rng: SeededRng,
  feelDt: number,
  dt: number,
  ev: GunEvents,
): void {
  g.fired = false;
  const k = p.spreadFactor[band];
  g.fast = k > 1;
  const target = held && canFire ? selectTarget(g, p, boat, barges, visRange2) : -1;
  if (!held || !canFire) g.status = GUN_SAFE;
  g.target = target;
  g.targetM = 0;
  if (target >= 0) {
    const b = barges[target]!;
    g.targetM = Math.sqrt((b.x - boat.x) * (b.x - boat.x) + (b.y - boat.y) * (b.y - boat.y));
  }
  for (let i = 0; i < p.groups.length; i++) {
    const gr = p.groups[i]!;
    const cd = Math.max(g.cooldownS[i]! - feelDt, -feelDt);
    g.cooldownS[i] = cd;
    if (target < 0 || cd > 0) {
      if (cd < 0) g.cooldownS[i] = 0; // 撃てない間は負の残りを溜めない（押した瞬間の一斉発射を防ぐ）
      continue;
    }
    const s = findFreeShell(g.shells);
    if (!s) continue;
    g.cooldownS[i] = cd + 60 / gr.roundsPerMin;
    const b = barges[target]!;
    const bh = degToRad(b.headingDeg);
    launchShell(s, boat.x, boat.y, b.x, b.y, Math.sin(bh) * b.speedMps, -Math.cos(bh) * b.speedMps, gr.shellSpeedMps, ((gr.dispersionM * g.targetM) / p.rangeM) * k, i, rng);
    g.shots++;
    if (!g.fired) ev.onFire(boat.x, boat.y);
    g.fired = true;
    if (Number.isNaN(g.firstShotM)) {
      g.firstShotM = g.targetM;
      g.firstShotBand = band;
    }
  }
  for (let i = 0; i < g.shells.length; i++) {
    const s = g.shells[i]!;
    if (!s.active || !advanceShell(s, dt)) continue;
    const gr = p.groups[s.gunIndex]!;
    let hit = -1;
    for (let j = 0; j < barges.length && hit < 0; j++) {
      const b = barges[j]!;
      if (bargeAfloat(b) && pointNearBoat(s.impactX, s.impactY, b, bargeHalfLengthM, bargeHalfBeamM + gr.splashRadiusM)) hit = j;
    }
    if (hit >= 0) {
      g.hits++;
      ev.onHit(hit, s.gunIndex, s.impactX, s.impactY);
    } else {
      ev.onMiss(s.impactX, s.impactY);
    }
  }
}
