// 駆逐艦（v0.1: 一定針路・一定速力で直進。docs/02 §6.4）。運動は core、船体円は事前確保して座標だけ更新する（§7）。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { SINK_DURATION_MS, SINK_SCALE_TO, SINK_TILT_DEG } from '../config/ui-config';
import { stepStraight, type BoatState } from '../core/boat-motion';
import { createCircles, fillHullCircles, type Circle } from '../core/torpedo-solver';

export interface DestroyerSpec {
  lengthM: number;
  beamM: number;
  hullCircles: number;
  hitsToSink: number;
  /** 当たり判定に使う寸法の倍率（data: world.hit_scale。1=実寸） */
  hitScale: number;
}

export class Destroyer {
  readonly sprite: Phaser.GameObjects.Image;
  readonly state: BoatState;
  /** 船体を近似する円の列（実寸。当たり判定は実寸、見た目は sprite_scale 倍。docs/02 §6.10） */
  readonly circles: Circle[];
  hitsTaken = 0;
  /** 沈没演出中または沈没済み。運動と当たり判定を止める */
  sinking = false;

  constructor(
    private readonly scene: Phaser.Scene,
    start: { x: number; y: number; headingDeg: number },
    speedMps: number,
    readonly spec: DestroyerSpec,
  ) {
    this.state = { x: start.x, y: start.y, headingDeg: start.headingDeg, speedMps };
    this.circles = createCircles(spec.hullCircles);
    this.sprite = scene.add.image(start.x, start.y, TEXTURE_KEYS.destroyer).setScale(1 / RENDER_SCALE).setDepth(DEPTH.destroyer);
    this.refreshHull();
    this.syncSprite();
  }

  step(dt: number): void {
    if (this.sinking) return;
    stepStraight(this.state, dt);
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
