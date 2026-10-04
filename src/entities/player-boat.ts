// 自艇。core の BoatState を持ち、スプライトへ位置・角度を反映するだけ。運動は src/core/boat-motion.ts。
import Phaser from 'phaser';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import type { BoatState } from '../core/boat-motion';

export class PlayerBoat {
  readonly sprite: Phaser.GameObjects.Image;
  readonly state: BoatState;

  constructor(scene: Phaser.Scene, start: { x: number; y: number; headingDeg: number }, initialSpeedMps: number) {
    this.state = { x: start.x, y: start.y, headingDeg: start.headingDeg, speedMps: initialSpeedMps };
    // テクスチャは RENDER_SCALE 倍で作ってあるので、世界単位に戻す
    this.sprite = scene.add.image(start.x, start.y, TEXTURE_KEYS.playerBoat).setScale(1 / RENDER_SCALE).setDepth(10);
    this.syncSprite();
  }

  /** 物理ステップ後に 1 回呼ぶ。方位角 0=北=上、時計回り。テクスチャは船首が上なので angle にそのまま渡せる */
  syncSprite(): void {
    this.sprite.setPosition(this.state.x, this.state.y);
    this.sprite.setAngle(this.state.headingDeg);
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
