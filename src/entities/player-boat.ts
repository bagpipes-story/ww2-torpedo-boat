// 自艇。core の BoatState を持ち、スプライトへ位置・角度を反映するだけ。運動は src/core/boat-motion.ts。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { SINK_DURATION_MS, SINK_SCALE_TO, SINK_TILT_DEG } from '../config/ui-config';
import type { BoatState } from '../core/boat-motion';

export class PlayerBoat {
  readonly sprite: Phaser.GameObjects.Image;
  readonly state: BoatState;
  /** 沈没演出中または沈没済み（体当たりされた）。運動・発射・当たり判定を止める */
  sinking = false;

  constructor(
    private readonly scene: Phaser.Scene,
    start: { x: number; y: number; headingDeg: number },
    initialSpeedMps: number,
  ) {
    this.state = { x: start.x, y: start.y, headingDeg: start.headingDeg, speedMps: initialSpeedMps };
    // テクスチャは RENDER_SCALE 倍で作ってあるので、世界単位に戻す
    this.sprite = scene.add.image(start.x, start.y, TEXTURE_KEYS.playerBoat).setScale(1 / RENDER_SCALE).setDepth(DEPTH.playerBoat);
    this.syncSprite();
  }

  /** 物理ステップ後に 1 回呼ぶ。方位角 0=北=上、時計回り。テクスチャは船首が上なので angle にそのまま渡せる。沈没演出中は tween に任せる */
  syncSprite(): void {
    if (this.sinking) return;
    this.sprite.setPosition(this.state.x, this.state.y);
    this.sprite.setAngle(this.state.headingDeg);
  }

  /** 沈没演出（駆逐艦と同じ: 縮みながら傾いて消える）。終わったら onDone。1 回だけ tween を作る */
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
