// 煙幕の見た目（v0.2.2）。判断は core/smoke.ts。§7: 煙はプールし、毎フレームは位置と alpha だけ触る。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { SMOKE_POOL_SIZE, SMOKE_PUFF_ALPHA, SMOKE_PUFF_TEX_RADIUS_UNITS } from '../config/ui-config';
import type { SmokeParams, SmokeState } from '../core/smoke';

export class SmokeScreen {
  private readonly puffs: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, params: SmokeParams) {
    const scale = params.puffRadiusM / SMOKE_PUFF_TEX_RADIUS_UNITS / RENDER_SCALE;
    for (let i = 0; i < SMOKE_POOL_SIZE; i++) {
      this.puffs.push(scene.add.image(0, 0, TEXTURE_KEYS.smokePuff).setScale(scale).setDepth(DEPTH.smoke).setVisible(false));
    }
  }

  /** 毎フレーム: 生きている煙の位置と濃さ（残り時間で薄く） */
  updateVisuals(state: SmokeState, params: SmokeParams): void {
    const n = Math.min(this.puffs.length, state.puffs.length);
    for (let i = 0; i < n; i++) {
      const puff = state.puffs[i]!;
      const img = this.puffs[i]!;
      if (!puff.active) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      img.setPosition(puff.x, puff.y).setAlpha(SMOKE_PUFF_ALPHA * Math.min(1, (puff.leftS / params.puffLifetimeS) * 1.5));
      if (!img.visible) img.setVisible(true);
    }
  }

  destroy(): void {
    for (const p of this.puffs) p.destroy();
  }
}
