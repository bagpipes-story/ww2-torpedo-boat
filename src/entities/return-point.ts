// 帰投地点の輪（docs/02 §6.7、v0.3.0）。静的な Image と中心のラベル。§7: 毎フレームは触らない。呼びかけが出た瞬間に 1 回だけ点滅の tween を作る。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { HOME_COLOR, HOME_COLOR_TEXT, HOME_LABEL_FONT_PX, RETURN_RING_ALPHA, RETURN_RING_PULSE_ALPHA, RETURN_RING_PULSE_MS, RETURN_RING_TEX_RADIUS_UNITS, hudTextStyle } from '../config/ui-config';
import type { ReturnPoint } from '../core/mission-flow';

export class ReturnPointView {
  private readonly ring: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private pulsing = false;

  constructor(
    private readonly scene: Phaser.Scene,
    rp: ReturnPoint,
  ) {
    this.ring = scene.add
      .image(rp.x, rp.y, TEXTURE_KEYS.returnRing)
      .setScale(rp.radiusM / RETURN_RING_TEX_RADIUS_UNITS / RENDER_SCALE)
      .setTint(HOME_COLOR)
      .setAlpha(RETURN_RING_ALPHA)
      .setDepth(DEPTH.returnRing);
    this.label = scene.add.text(rp.x, rp.y, '帰投地点', hudTextStyle(HOME_LABEL_FONT_PX, HOME_COLOR_TEXT)).setOrigin(0.5).setAlpha(RETURN_RING_ALPHA).setDepth(DEPTH.returnRing);
  }

  /** 「帰投せよ」が出た瞬間に呼ぶ。進行中なら何もしない */
  pulse(): void {
    if (this.pulsing) return;
    this.pulsing = true;
    this.scene.tweens.add({
      targets: [this.ring, this.label],
      alpha: RETURN_RING_PULSE_ALPHA,
      duration: RETURN_RING_PULSE_MS,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        this.pulsing = false;
        this.ring.setAlpha(RETURN_RING_ALPHA);
        this.label.setAlpha(RETURN_RING_ALPHA);
      },
    });
  }

  destroy(): void {
    this.ring.destroy();
    this.label.destroy();
  }
}
