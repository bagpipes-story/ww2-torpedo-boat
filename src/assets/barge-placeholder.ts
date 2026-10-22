// 大発のプレースホルダー（v0.4.2）: 艇首が平たい道板（ランプ）の四角い船形（敵の薄い赤）と、色付け用の白い曳光弾。Boot で 1 回だけ（§7）。
// v0.6.4: 味方の大発（jp_01 の輸送隊）は同じ船形を僚艇の薄い青（ESCORT_TINT）で塗った別の 1 枚（赤い絵を tint しても青くならない）。
import Phaser from 'phaser';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { BARGE_WHEELHOUSE_ALPHA, BARGE_WHEELHOUSE_COLOR } from '../config/hunt-config';
import { ESCORT_TINT, TARGET_MARKER_COLOR, TRACER_LENGTH_UNITS, TRACER_WIDTH_UNITS } from '../config/ui-config';

export function generateBargeTextures(scene: Phaser.Scene, spec: { lengthUnits: number; beamUnits: number }): void {
  const k = RENDER_SCALE;
  drawBarge(scene, spec.lengthUnits * k, spec.beamUnits * k, TARGET_MARKER_COLOR, TEXTURE_KEYS.barge);
  const tw = Math.ceil(TRACER_WIDTH_UNITS * k) + 1;
  const tl = Math.ceil(TRACER_LENGTH_UNITS * k);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, tw, tl);
  g.generateTexture(TEXTURE_KEYS.gunTracer, tw, tl);
  g.destroy();
}

/** 味方の大発（v0.6.4）: 同じ船形を僚艇の薄い青で。味方の輸送隊を持つ任務があるときだけ Boot が 1 回作る */
export function generateFriendlyBargeTexture(scene: Phaser.Scene, spec: { lengthUnits: number; beamUnits: number }): void {
  drawBarge(scene, spec.lengthUnits * RENDER_SCALE, spec.beamUnits * RENDER_SCALE, ESCORT_TINT, TEXTURE_KEYS.bargeFriendly);
}

/** 船形（艇首が平たい道板・艇尾は角・艇尾の暗い操舵室）を color で描いて key のテクスチャに */
function drawBarge(scene: Phaser.Scene, L: number, B: number, color: number, key: string): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(color, 1);
  g.fillRect(0, L * 0.08, B, L * 0.92); // 船体（艇尾は角）
  g.fillRect(B * 0.12, 0, B * 0.76, L * 0.1); // 艇首の道板
  g.fillStyle(BARGE_WHEELHOUSE_COLOR, BARGE_WHEELHOUSE_ALPHA);
  g.fillRect(B * 0.3, L * 0.7, B * 0.4, L * 0.18); // 艇尾の操舵室
  g.generateTexture(key, Math.ceil(B), Math.ceil(L));
  g.destroy();
}
