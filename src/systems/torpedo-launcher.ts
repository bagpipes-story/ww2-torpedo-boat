// 発射管制: タップ 1 本／扇状一斉を待ち行列にし、data の salvo_interval_s 間隔で 1 本ずつ発射する。
// 発射位置は艇の両舷交互（docs/02 §6.2）。信頼性ロールはシード付き乱数で発射時に 1 回。確保はイベント時のみ。
import type { BoatState } from '../core/boat-motion';
import type { SeededRng } from '../core/rng';
import { fillSalvoHeadings } from '../core/salvo';
import type { TorpedoReliability } from '../core/torpedo';
import { degToRad } from '../core/units';
import type { TorpedoPool } from './torpedo-pool';

export class TorpedoLauncher {
  private readonly headings: number[] = [];
  private pending = 0;
  private nextIndex = 0;
  private cooldownS = 0;
  private side = 1;

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
  ) {
    for (let i = 0; i < pool.capacity; i++) this.headings.push(0);
  }

  /** 待ち行列に残っている本数 */
  get queued(): number {
    return this.pending;
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

  /** 毎フレーム。間隔が来ていれば 1 本発射する */
  update(realDt: number, boat: BoatState, target: BoatState): void {
    if (this.pending === 0) return;
    this.cooldownS -= realDt;
    if (this.cooldownS > 0) return;
    this.fireOne(this.headings[this.nextIndex]!, boat, target);
    this.nextIndex++;
    this.pending--;
    this.cooldownS = this.intervalS;
  }

  private fireOne(headingDeg: number, boat: BoatState, target: BoatState): void {
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
    this.pool.fire(x, y, headingDeg, dud, erratic, bias, rangeAtLaunch);
  }
}
