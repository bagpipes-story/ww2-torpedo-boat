// 駆逐艦（v0.2.0: 巡航・雷跡回避・体当たり。docs/02 §6.4）。判断と操舵は core/ship-ai.ts、船体円は事前確保して座標だけ更新する（§7）。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { SINK_DURATION_MS, SINK_SCALE_TO, SINK_TILT_DEG } from '../config/ui-config';
import { clampToBounds, type BoatState, type SeaBounds } from '../core/boat-motion';
import { createShipAiState, steerShip, turnRateFor, updateShipAi, type ShipAiMode, type ShipAiParams, type ShipAiState } from '../core/ship-ai';
import type { TorpedoState } from '../core/torpedo';
import { boatTouchesHull, createCircles, fillHullCircles, type Circle } from '../core/torpedo-solver';

export interface DestroyerSpec {
  lengthM: number;
  beamM: number;
  hullCircles: number;
  hitsToSink: number;
  /** 当たり判定に使う寸法の倍率（data: world.hit_scale。1=実寸） */
  hitScale: number;
  /** 海域境界から押し戻す余白 m（表示上の船体半分） */
  boundsMarginM: number;
}

export class Destroyer {
  readonly sprite: Phaser.GameObjects.Image;
  readonly state: BoatState;
  /** 船体を近似する円の列（実寸 × hit_scale。見た目は sprite_scale 倍。docs/02 §6.10） */
  readonly circles: Circle[];
  readonly ai: ShipAiState;
  hitsTaken = 0;
  /** 沈没演出中または沈没済み。運動と当たり判定を止める */
  sinking = false;
  private sighted = true;

  constructor(
    private readonly scene: Phaser.Scene,
    start: { x: number; y: number; headingDeg: number },
    readonly spec: DestroyerSpec,
    private readonly aiParams: ShipAiParams,
    private readonly bounds: SeaBounds,
  ) {
    this.state = { x: start.x, y: start.y, headingDeg: start.headingDeg, speedMps: aiParams.cruiseSpeedMps };
    this.ai = createShipAiState(start.headingDeg, aiParams.cruiseSpeedMps);
    this.circles = createCircles(spec.hullCircles);
    this.sprite = scene.add.image(start.x, start.y, TEXTURE_KEYS.destroyer).setScale(1 / RENDER_SCALE).setDepth(DEPTH.destroyer);
    this.refreshHull();
    this.syncSprite();
  }

  get mode(): ShipAiMode {
    return this.ai.mode;
  }

  /**
   * 固定ステップ。dt は time_scale 込み、realDt は実時間（反応遅れ・警戒解除）。
   * playerDetectRangeM はこのステップで自艇を見つける距離（速力・月明・煙幕込み）。torpedoes は雷跡の発見に読むだけ。
   */
  step(dt: number, realDt: number, player: BoatState, playerDetectRangeM: number, detectHoldS: number, torpedoes: readonly TorpedoState[]): void {
    if (this.sinking) return;
    updateShipAi(this.ai, this.state, player, playerDetectRangeM, detectHoldS, torpedoes, this.aiParams, this.bounds, realDt);
    steerShip(this.state, this.ai.desiredHeadingDeg, this.ai.desiredSpeedMps, turnRateFor(this.ai.mode, this.aiParams), this.aiParams.accelMps2, dt);
    clampToBounds(this.state, this.bounds, this.spec.boundsMarginM);
    this.refreshHull();
  }

  private refreshHull(): void {
    fillHullCircles(this.circles, this.state.x, this.state.y, this.state.headingDeg, this.spec.lengthM * this.spec.hitScale, this.spec.beamM * this.spec.hitScale);
  }

  /** 沈没演出中は tween が角度と拡縮を持つので触らない */
  syncSprite(): void {
    if (this.sinking) return;
    this.sprite.setPosition(this.state.x, this.state.y);
    this.sprite.setAngle(this.state.headingDeg);
  }

  /** 自艇の視程内かどうかでスプライトを出し入れする（変わったときだけ setVisible。沈没演出中は触らない） */
  setSighted(v: boolean): void {
    if (v === this.sighted || this.sinking) return;
    this.sighted = v;
    this.sprite.setVisible(v);
  }

  /** 艇（中心・方位・半長）が船体に触れているか（体当たり） */
  touchesBoat(boat: BoatState, boatHalfLengthM: number): boolean {
    return !this.sinking && boatTouchesHull(boat.x, boat.y, boat.headingDeg, boatHalfLengthM, this.circles);
  }

  /** 命中（有効弾）。沈没に達したら true */
  takeHit(): boolean {
    this.hitsTaken++;
    return this.hitsTaken >= this.spec.hitsToSink;
  }

  /** 沈没演出（図形: 縮みながら傾いて消える）。終わったら onDone。発生時に 1 回だけ tween を作る */
  playSinking(onDone: () => void): void {
    if (this.sinking) return;
    this.sinking = true;
    this.state.speedMps = 0;
    if (!this.sighted) this.sprite.setVisible(true);
    this.scene.tweens.add({
      targets: this.sprite,
      scaleX: this.sprite.scaleX * SINK_SCALE_TO,
      scaleY: this.sprite.scaleY * SINK_SCALE_TO,
      alpha: 0,
      angle: this.sprite.angle + SINK_TILT_DEG,
      duration: SINK_DURATION_MS,
      ease: 'Sine.easeIn',
      onComplete: onDone,
    });
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
