// 自艇の被害の適用と沈没の開始（v0.4.1 で mission-world から切り出し。中身は v0.4.0 のまま）。
// 砲弾・掃射・爆弾の命中はすべてここを通る（docs/02 §6.6）。§7: 命中の結果は 1 個の HitOutcome に書き戻す（確保しない）。
import { applyShellHit, type DamageParams, type DamageState, type HitOutcome, type HitSpec } from '../core/gunnery';
import type { BoatParams } from '../core/boat-motion';
import type { MissionEndReason } from '../core/mission-flow';
import type { SeededRng } from '../core/rng';
import type { PlayerBoat } from '../entities/player-boat';
import type { WorldEvents } from './world-events';

export class BoatDamage {
  private readonly out: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
  /** 火災で沈んだときの終了理由＝火災を起こした原因（砲撃か味方機の掃射か爆弾か） */
  fireReason: MissionEndReason = 'destroyed';
  /** 無傷時の最大速力（機関損傷で boatParams.speedMaxMps を下げる） */
  private readonly speedMaxBaseMps: number;

  constructor(
    private readonly boat: PlayerBoat,
    readonly state: DamageState,
    readonly params: DamageParams,
    private readonly boatParams: BoatParams,
    private readonly events: WorldEvents,
    private readonly smallHitRatio: number,
  ) {
    this.speedMaxBaseMps = boatParams.speedMaxMps;
  }

  /** 命中: HP を減らし、火災・機関損傷を抽選。機関損傷は最大速力を下げる（data: damage.engine_damage_speed_factor）。HP 0 なら沈没を始めて true */
  applyHit(spec: HitSpec, rng: SeededRng, x: number, y: number, reason: MissionEndReason): boolean {
    if (this.boat.sinking) return false;
    const o = applyShellHit(this.state, spec, this.params, rng, this.out);
    if (o.engineHit) {
      this.boatParams.speedMaxMps = this.speedMaxBaseMps * this.params.engineSpeedFactor;
      if (this.boatParams.speedCruiseMps > this.boatParams.speedMaxMps) this.boatParams.speedCruiseMps = this.boatParams.speedMaxMps;
    }
    if (o.startedFire) this.fireReason = reason;
    this.events.onShellHit(x, y, spec.damage < this.params.maxHp * this.smallHitRatio, o.destroyed);
    return o.destroyed && this.sink(reason);
  }

  /** 沈没の開始（体当たり・砲撃・掃射・爆弾・火災・荒波）。HP 0・火災なしにして演出、完了で onBoatSunk。すでに沈没中なら false */
  sink(reason: MissionEndReason): boolean {
    if (this.boat.sinking) return false;
    // 沈んだ艇の HP は 0、火災も消す（体当たりでも HUD と Result が 100 のままにならないように）
    this.state.hp = 0;
    this.state.fireLeftS = 0;
    const s = this.boat.state;
    this.events.onBoatSinking(s.x, s.y);
    this.boat.playSinking(() => this.events.onBoatSunk(reason));
    return true;
  }
}
