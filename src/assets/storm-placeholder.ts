// 暴風の雨筋のプレースホルダー（v0.3.4）: 白い細長い矩形（表示時に tint・角度）。帯と前線は HP バーの塗りを伸ばして使うので、生成するテクスチャはこれ 1 枚。
import Phaser from 'phaser';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { STORM_RAIN_LENGTH_UNITS, STORM_RAIN_WIDTH_UNITS } from '../config/ui-config';

export function generateRainTexture(scene: Phaser.Scene): void {
  const k = RENDER_SCALE;
  const w = Math.max(1, Math.ceil(STORM_RAIN_WIDTH_UNITS * k));
  const h = Math.ceil(STORM_RAIN_LENGTH_UNITS * k);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, w, h);
  g.generateTexture(TEXTURE_KEYS.rainStreak, w, h);
  g.destroy();
}
