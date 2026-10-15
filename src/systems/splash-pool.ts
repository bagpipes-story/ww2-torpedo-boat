// 水柱（着弾の輪）のプール（v0.4.2 で EnemyFire から切り出し。中身は v0.4.1 のまま）: 砲弾・掃射・爆弾・波の叩きつけ・大発の機銃・艇の砲が借りる。
// §7: 起動時に size 枚作り、置くときは古いものから使い回し、毎フレームは alpha だけ触る。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { SPLASH_LIFETIME_S, SPLASH_TINT_HIT, SPLASH_TINT_MISS } from '../config/ui-config';

export class SplashPool {
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly ages: Float32Array;
  private next = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly size: number,
    private readonly scaleMiss: number,
    private readonly scaleHit: number,
  ) {
    this.ages = new Float32Array(size).fill(Infinity);
    for (let i = 0; i < size; i++) this.images.push(scene.add.image(0, 0, TEXTURE_KEYS.explosionRing).setDepth(DEPTH.effects).setVisible(false));
  }

  /** 水柱を置く（hit なら橙で大きく） */
  splash(x: number, y: number, hit: boolean): void {
    const i = this.next;
    this.next = (this.next + 1) % this.size;
    this.ages[i] = 0;
    this.images[i]!
      .setPosition(x, y)
      .setScale((hit ? this.scaleHit : this.scaleMiss) / RENDER_SCALE)
      .setTint(hit ? SPLASH_TINT_HIT : SPLASH_TINT_MISS)
      .setAlpha(1)
      .setVisible(true);
  }

  /** 毎フレーム: 寿命で薄くして消す */
  updateVisuals(realDt: number): void {
    for (let i = 0; i < this.size; i++) {
      const age = this.ages[i]!;
      if (age === Infinity) continue;
      const next = age + realDt;
      if (next >= SPLASH_LIFETIME_S) {
        this.ages[i] = Infinity;
        this.images[i]!.setVisible(false);
        continue;
      }
      this.ages[i] = next;
      this.images[i]!.setAlpha(1 - next / SPLASH_LIFETIME_S);
    }
  }

  destroy(): void {
    for (const s of this.images) s.destroy();
  }
}
