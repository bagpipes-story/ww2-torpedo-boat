// 航空機のプレースホルダー（v0.3.3）: 上から見た十字（機首は上）。味方＝薄い青、敵の水上機＝薄い赤（docs/02 §7。v0.4.1 で色と key を引数に）。起動時に 1 回だけテクスチャ化する。
import Phaser from 'phaser';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { AIRCRAFT_BODY_UNITS, AIRCRAFT_LENGTH_UNITS, AIRCRAFT_SPAN_UNITS, AIRCRAFT_TAIL_SPAN_UNITS, HOME_COLOR } from '../config/ui-config';

export function generateAircraftTexture(scene: Phaser.Scene, key: string = TEXTURE_KEYS.aircraft, color: number = HOME_COLOR): void {
  const k = RENDER_SCALE;
  const W = Math.ceil(AIRCRAFT_SPAN_UNITS * k);
  const H = Math.ceil(AIRCRAFT_LENGTH_UNITS * k);
  const body = AIRCRAFT_BODY_UNITS * k;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(color, 1);
  // 胴（縦長）、主翼（機首から 35 % 後ろ）、尾翼（後端）
  g.fillRect(W / 2 - body / 2, 0, body, H);
  g.fillRect(0, H * 0.35 - body / 2, W, body);
  const tail = AIRCRAFT_TAIL_SPAN_UNITS * k;
  const tailH = body * 0.7;
  g.fillRect(W / 2 - tail / 2, H - tailH, tail, tailH);
  g.generateTexture(key, W, H);
  g.destroy();
}
