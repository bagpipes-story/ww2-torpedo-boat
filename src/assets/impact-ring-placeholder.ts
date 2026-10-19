// 空襲の着弾点の輪のプレースホルダー（v0.6.1。docs/02 §6.8）: 白い太線の円と薄い塗り（表示時に tint・命中の半径へ setScale）。
// 帰投地点の輪（半径 128 に線 4）を流用すると約 28 m に縮めたとき線が 1 px 未満になるので、線の比を大きくした専用の 1 枚。起動時に 1 回だけテクスチャ化する。
import Phaser from 'phaser';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { AIR_STRIKE_RING_FILL_ALPHA, AIR_STRIKE_RING_LINE_UNITS, AIR_STRIKE_RING_TEX_RADIUS_UNITS } from '../config/dawn-config';

export function generateImpactRingTexture(scene: Phaser.Scene): void {
  const k = RENDER_SCALE;
  const r = AIR_STRIKE_RING_TEX_RADIUS_UNITS * k;
  const lw = AIR_STRIKE_RING_LINE_UNITS * k;
  const size = Math.ceil((r + lw) * 2);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, AIR_STRIKE_RING_FILL_ALPHA);
  g.fillCircle(size / 2, size / 2, r);
  g.lineStyle(lw, 0xffffff, 1);
  g.strokeCircle(size / 2, size / 2, r);
  g.generateTexture(TEXTURE_KEYS.impactRing, size, size);
  g.destroy();
}
