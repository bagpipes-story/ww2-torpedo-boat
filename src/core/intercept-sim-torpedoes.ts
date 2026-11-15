// 迎撃の模擬（v0.8.0 S3。us_04。spec-v0800 §4.11、lead の L18）の魚雷の写し（Phaser 非依存）: 魚雷のプール（凍結の systems/torpedo-pool の TorpedoPool の状態・fire・step・
// resolveRemainingAsMisses。雷跡の点は絵だけなので置かない＝nextWakeAtM は誰も読まない）と発射管制（systems/torpedo-launcher の TorpedoLauncher。乱数の順は 不発 → 蛇行 → 偏差）。
// 凍結の core（torpedo・torpedo-targets・torpedo-solver）と core/salvo を同じ順で呼ぶ。tests/intercept-sim-a が本物（tests/torpedo-free-kit の TorpedoPool・TorpedoLauncher）と
// 同じ発射の並びで状態と知らせの順を突き合わせる。確保は作る時だけ。
import type { BoatState, SeaBounds } from './boat-motion';
import type { SeededRng } from './rng';
import { fillSalvoHeadings } from './salvo';
import { createTorpedoState, isArmed, launchTorpedo, markMissIfPassed, stepTorpedo, type TorpedoParams, type TorpedoReliability, type TorpedoState } from './torpedo';
import { createTargetScan, scanTargets, type TorpedoEvents, type TorpedoTarget } from './torpedo-targets';
import { interceptHeadingDeg, velocityFromHeading } from './torpedo-solver';
import { degToRad, wrapDeg180 } from './units';

/** 魚雷のプール（TorpedoPool の状態・fire・step・resolveRemainingAsMisses の写し。絵と雷跡の点なし） */
export class SimTorpedoPool {
  readonly states: TorpedoState[] = [];
  private firedCount = 0;
  private readonly scan = createTargetScan();

  constructor(private readonly params: TorpedoParams, readonly capacity: number, private readonly bounds: SeaBounds) {
    for (let i = 0; i < capacity; i++) this.states.push(createTorpedoState());
  }

  get remaining(): number {
    return this.capacity - this.firedCount;
  }

  get unresolvedCount(): number {
    let n = 0;
    for (let i = 0; i < this.states.length; i++) {
      const s = this.states[i]!;
      if (s.active && !s.resolved) n++;
    }
    return n;
  }

  fire(x: number, y: number, headingDeg: number, dud: boolean, erratic: boolean, erraticBiasDeg: number, rangeAtLaunchM: number): TorpedoState | null {
    if (this.remaining <= 0) return null;
    const s = this.states[this.firedCount]!;
    this.firedCount++;
    launchTorpedo(s, x, y, headingDeg, dud, erratic, erraticBiasDeg, rangeAtLaunchM, 0);
    return s;
  }

  step(dt: number, realDt: number, targets: readonly TorpedoTarget[], passRadius2: number, events: TorpedoEvents, nowS: number, settleS: number): void {
    for (let i = 0; i < this.states.length; i++) {
      const s = this.states[i]!;
      if (!s.active) continue;
      const expired = stepTorpedo(s, this.params, dt, realDt);
      if (expired || s.x < 0 || s.y < 0 || s.x > this.bounds.width || s.y > this.bounds.height) {
        s.active = false;
        if (!s.resolved) events.onMiss(s);
        continue;
      }
      if (s.resolved) continue;
      const sc = this.scan;
      scanTargets(sc, s.x, s.y, isArmed(s, this.params), targets, nowS, settleS);
      if (sc.late >= 0) {
        s.active = false;
        s.resolved = true;
        events.onLateHit(sc.late, s.x, s.y, s);
        continue;
      }
      if (sc.nearest < 0) continue;
      if (sc.hit >= 0) {
        s.active = false;
        s.resolved = true;
        events.onHit(sc.hit, s.x, s.y, s);
        continue;
      }
      const n = targets[sc.nearest]!.state;
      if (markMissIfPassed(s, this.params, n.x, n.y, passRadius2)) events.onMiss(s);
    }
  }

  resolveRemainingAsMisses(events: TorpedoEvents): void {
    for (let i = 0; i < this.states.length; i++) {
      const s = this.states[i]!;
      if (!s.active || s.resolved) continue;
      s.resolved = true;
      events.onMiss(s);
    }
  }
}

/** 発射管制（TorpedoLauncher の写し。乱数の順は 不発 → 蛇行 → 偏差） */
export class SimLauncher {
  private readonly headings: number[] = [];
  private pending = 0;
  private nextIndex = 0;
  private cooldownS = 0;
  private side = 1;
  private readonly targetVel = { x: 0, y: 0 };

  constructor(private readonly pool: SimTorpedoPool, private readonly rng: SeededRng, private readonly reliability: TorpedoReliability, private readonly jitterDeg: number, private readonly launchOffsetM: number, private readonly intervalS: number, private readonly torpedoSpeedMps: number) {
    for (let i = 0; i < pool.capacity; i++) this.headings.push(0);
  }

  get queued(): number {
    return this.pending;
  }

  clearQueue(): void {
    this.pending = 0;
  }

  queueFan(boat: BoatState, count: number, spreadDeg: number): void {
    if (this.pending > 0) return;
    const n = Math.min(count, this.pool.remaining);
    if (n <= 0) return;
    this.pending = fillSalvoHeadings(boat.headingDeg, n, spreadDeg, this.headings);
    this.nextIndex = 0;
    this.cooldownS = 0;
  }

  update(realDt: number, boat: BoatState, target: BoatState | null, kpiTarget: boolean): TorpedoState | null {
    if (this.pending === 0) return null;
    this.cooldownS -= realDt;
    if (this.cooldownS > 0) return null;
    const headingDeg = this.headings[this.nextIndex]!;
    this.nextIndex++;
    this.pending--;
    this.cooldownS = this.intervalS;
    const rangeAtLaunch = target ? Math.hypot(target.x - boat.x, target.y - boat.y) : Number.NaN;
    const h = degToRad(boat.headingDeg);
    const side = this.side;
    this.side = -this.side;
    const x = boat.x + Math.cos(h) * this.launchOffsetM * side;
    const y = boat.y + Math.sin(h) * this.launchOffsetM * side;
    const dud = this.rng.chance(this.reliability.dud);
    const erratic = this.rng.chance(this.reliability.erratic);
    const bias = erratic ? this.rng.nextRange(-this.jitterDeg, this.jitterDeg) : 0;
    const s = this.pool.fire(x, y, headingDeg, dud, erratic, bias, rangeAtLaunch);
    if (!s || !target) return s;
    velocityFromHeading(target.headingDeg, target.speedMps, this.targetVel);
    const aim = interceptHeadingDeg(x, y, this.torpedoSpeedMps, target.x, target.y, this.targetVel.x, this.targetVel.y);
    s.leadErrDeg = aim === null ? Number.NaN : wrapDeg180(headingDeg - aim);
    s.kpiTarget = kpiTarget;
    return s;
  }
}
