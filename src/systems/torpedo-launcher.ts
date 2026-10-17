// 発射管制: タップ 1 本／扇状一斉を待ち行列にし、data の salvo_interval_s 間隔で 1 本ずつ発射する。
// 発射位置は艇の両舷交互（docs/02 §6.2）。信頼性ロールはシード付き乱数で発射時に 1 回。確保はイベント時のみ。
// KPI（v0.5.0）: 1 本ごとに、発射時の見越し角のずれ（目標が今の速さと針路のまま進むとしたときの命中針路との差）と、狙った目標が駆逐艦かを魚雷に書く。
import type { BoatState } from '../core/boat-motion';
import type { SeededRng } from '../core/rng';
import { fillSalvoHeadings } from '../core/salvo';
import type { TorpedoReliability } from '../core/torpedo';
import { interceptHeadingDeg, velocityFromHeading } from '../core/torpedo-solver';
import { degToRad, wrapDeg180 } from '../core/units';
import type { TorpedoPool } from './torpedo-pool';

export class TorpedoLauncher {
  private readonly headings: number[] = [];
  private pending = 0;
  private nextIndex = 0;
  private cooldownS = 0;
  private side = 1;
  /** 目標の速度（見越し角のずれの計算に使い回す。§7 確保しない） */
  private readonly targetVel = { x: 0, y: 0 };

  constructor(
    private readonly pool: TorpedoPool,
    private readonly rng: SeededRng,
    private readonly reliability: TorpedoReliability,
    /** 蛇行魚雷の偏差の最大（度、data の jitter_deg） */
    private readonly jitterDeg: number,
    /** 舷側オフセット m（艇幅の半分） */
    private readonly launchOffsetM: number,
    /** 一斉発射の 1 本ごとの間隔（実時間秒） */
    private readonly intervalS: number,
    /** 魚雷の速さ m/s（見越し角のずれの計算。v0.5.0） */
    private readonly torpedoSpeedMps: number,
  ) {
    for (let i = 0; i < pool.capacity; i++) this.headings.push(0);
  }

  /** 待ち行列に残っている本数 */
  get queued(): number {
    return this.pending;
  }

  /** 待ち行列を捨てる（駆逐艦が沈み始めたら、残りの一斉発射は撃たない。v0.3.0） */
  clearQueue(): void {
    this.pending = 0;
  }

  /** count 本を開き角 spreadDeg の扇で予約する。発射中は無視 */
  queueFan(boat: BoatState, count: number, spreadDeg: number): void {
    if (this.pending > 0) return;
    const n = Math.min(count, this.pool.remaining);
    if (n <= 0) return;
    this.pending = fillSalvoHeadings(boat.headingDeg, n, spreadDeg, this.headings);
    this.nextIndex = 0;
    this.cooldownS = 0;
  }

  /** 毎フレーム。間隔が来ていれば 1 本発射する。target は最寄りの浮いている艦、kpiTarget はそれが駆逐艦か（KPI に数える。v0.5.0） */
  update(realDt: number, boat: BoatState, target: BoatState, kpiTarget: boolean): void {
    if (this.pending === 0) return;
    this.cooldownS -= realDt;
    if (this.cooldownS > 0) return;
    this.fireOne(this.headings[this.nextIndex]!, boat, target, kpiTarget);
    this.nextIndex++;
    this.pending--;
    this.cooldownS = this.intervalS;
  }

  private fireOne(headingDeg: number, boat: BoatState, target: BoatState, kpiTarget: boolean): void {
    const rangeAtLaunch = Math.hypot(target.x - boat.x, target.y - boat.y);
    const h = degToRad(boat.headingDeg);
    const side = this.side;
    this.side = -this.side;
    // 船首方向に直交する単位ベクトル（右舷側）× 舷側オフセット
    const x = boat.x + Math.cos(h) * this.launchOffsetM * side;
    const y = boat.y + Math.sin(h) * this.launchOffsetM * side;
    const dud = this.rng.chance(this.reliability.dud);
    const erratic = this.rng.chance(this.reliability.erratic);
    const bias = erratic ? this.rng.nextRange(-this.jitterDeg, this.jitterDeg) : 0;
    const s = this.pool.fire(x, y, headingDeg, dud, erratic, bias, rangeAtLaunch);
    if (!s) return;
    // 見越し角のずれ: 狙い（蛇行の偏差を除く発射針路）と、発射点から目標へ当たる針路の差
    velocityFromHeading(target.headingDeg, target.speedMps, this.targetVel);
    const aim = interceptHeadingDeg(x, y, this.torpedoSpeedMps, target.x, target.y, this.targetVel.x, this.targetVel.y);
    s.leadErrDeg = aim === null ? Number.NaN : wrapDeg180(headingDeg - aim);
    s.kpiTarget = kpiTarget;
  }
}
