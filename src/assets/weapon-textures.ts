// 兵装のボタンのテクスチャ（v0.6.8。spec-v068 §3.2・§4.3）: 機銃のボタン＝魚雷のボタン（assets/placeholders の generateTorpedoButtonTexture）と同じ大きさ・塗りで、
// 輪を橙（GUN_BUTTON_STROKE）にし、輪の内側の上下左右に 10 px の目盛りを 4 本（白黒でも魚雷の輪と見分けられる）。Boot で 1 回だけ作る（CLAUDE.md §7）。
// 機銃のボタン（列 2。全任務で魚雷の左）はこの 1 枚を GUN_BUTTON_SCALE で縮めて使う（当たりも絵といっしょに縮む）。placeholders.ts は 300 行を超えているのでここに置く。
import Phaser from 'phaser';
import { GUN_BUTTON_FILL, GUN_BUTTON_FILL_ALPHA, GUN_BUTTON_STROKE, GUN_BUTTON_TICK_PX } from '../config/arms-config';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { TORPEDO_BUTTON_RADIUS } from '../config/ui-config';

export function generateGunButtonTexture(scene: Phaser.Scene): void {
  const k = RENDER_SCALE;
  const d = Math.ceil(TORPEDO_BUTTON_RADIUS * 2 * k) + 4;
  const c = d / 2;
  const r = TORPEDO_BUTTON_RADIUS * k;
  const tick = GUN_BUTTON_TICK_PX * k;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(GUN_BUTTON_FILL, GUN_BUTTON_FILL_ALPHA);
  g.fillCircle(c, c, r);
  g.lineStyle(Math.max(2, 3 * k), GUN_BUTTON_STROKE, 1);
  g.strokeCircle(c, c, r);
  g.lineBetween(c, c - r, c, c - r + tick);
  g.lineBetween(c, c + r, c, c + r - tick);
  g.lineBetween(c - r, c, c - r + tick, c);
  g.lineBetween(c + r, c, c + r - tick, c);
  g.generateTexture(TEXTURE_KEYS.gunButton, d, d);
  g.destroy();
}
