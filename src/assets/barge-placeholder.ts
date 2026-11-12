// 大発の絵（v0.4.2）: 艇首が平たい道板（ランプ）の四角い船形（敵の薄い赤。v0.7.0 S2a からは assets/barge-art＝同じ輪郭に荷台と艇尾の塊を描く。鍵・寸法・原点は同じ）と、
// 色付け用の白い曳光弾（変えない＝R27）。Boot で 1 回だけ（§7。呼び出しの行は変えない＝R14）。
// v0.6.4: 味方の大発（jp_01 の輸送隊）は同じ船形を味方の薄い青で塗った別の 1 枚（赤い絵を tint しても青くならない）。
import Phaser from 'phaser';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { TRACER_LENGTH_UNITS, TRACER_WIDTH_UNITS } from '../config/ui-config';
import { paintBargeTexture } from './barge-art';

export function generateBargeTextures(scene: Phaser.Scene, spec: { lengthUnits: number; beamUnits: number }): void {
  const k = RENDER_SCALE;
  paintBargeTexture(scene, spec, false);
  const tw = Math.ceil(TRACER_WIDTH_UNITS * k) + 1;
  const tl = Math.ceil(TRACER_LENGTH_UNITS * k);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, tw, tl);
  g.generateTexture(TEXTURE_KEYS.gunTracer, tw, tl);
  g.destroy();
}

/** 味方の大発（v0.6.4）: 同じ船形を味方の薄い青で。味方の輸送隊を持つ任務があるときだけ Boot が 1 回作る */
export function generateFriendlyBargeTexture(scene: Phaser.Scene, spec: { lengthUnits: number; beamUnits: number }): void {
  paintBargeTexture(scene, spec, true);
}
