// v0.7.0 S3c（アートと音①：コードで描く絵。spec-v0700 §5.5・R2・R32）: 探照灯・星弾・煙幕の絵を Boot で 1 回だけ Canvas の 2D の画素（ImageData）に書いてテクスチャにする
// （Graphics の fillGradientStyle は WebGL だけで generateTexture の Canvas では効かない＝画素の式で描く。式は assets/light-shape）。鍵・寸法・原点は v0.6.11 の placeholder と同じ
// （探照灯 W＝ceil(2·半幅)+2 × ceil(L)・光源 (0.5, 1)、星弾と煙は ceil(2·R·k)+2 の正方形）＝scale は論理の射程・照明半径・煙の半径から（見える広さ＝論理の広さ）。
// 呼び出しは placeholders の generateGunneryTextures・generateSmokeTextures（名前と UI の部分はそのまま＝R14）。色は v0.6.11 と同じ（照明弾・暗い煙の tint は掛け算のまま同じ意味）。
import type Phaser from 'phaser';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { SEARCHLIGHT_COLOR, SEARCHLIGHT_TEX_LENGTH_UNITS, SMOKE_PUFF_COLOR, SMOKE_PUFF_TEX_RADIUS_UNITS, STARSHELL_COLOR, STARSHELL_TEX_RADIUS_UNITS } from '../config/ui-config';
import { searchlightPixels, smokePixels, starshellPixels } from './light-shape';
import { paintCanvas } from './sea-art';

function put(ctx: CanvasRenderingContext2D, w: number, h: number, px: Uint8ClampedArray): void {
  const img = ctx.createImageData(w, h);
  img.data.set(px);
  ctx.putImageData(img, 0, 0);
}

/** 探照灯の扇（光源は下端の中央・光は上＝北へ。長さ 256 単位 × k、幅は cone_deg から） */
export function paintSearchlightTexture(scene: Phaser.Scene, coneDeg: number): void {
  const L = SEARCHLIGHT_TEX_LENGTH_UNITS * RENDER_SCALE;
  const halfW = Math.tan(((coneDeg / 2) * Math.PI) / 180) * L;
  const W = Math.ceil(halfW * 2) + 2;
  const H = Math.ceil(L);
  paintCanvas(scene, TEXTURE_KEYS.searchlight, W, H, (ctx) => put(ctx, W, H, searchlightPixels(W, H, halfW, SEARCHLIGHT_COLOR)));
}

/** 星弾の照明円（半径 128 単位 × k＝照明半径の絵。照明弾も tint で同じ絵） */
export function paintStarshellTexture(scene: Phaser.Scene): void {
  const R = STARSHELL_TEX_RADIUS_UNITS * RENDER_SCALE;
  const d = Math.ceil(R * 2) + 2;
  paintCanvas(scene, TEXTURE_KEYS.starshell, d, d, (ctx) => put(ctx, d, d, starshellPixels(d, R, STARSHELL_COLOR)));
}

/** 煙幕の煙の玉（半径 64 単位 × k。火災の煙・爆発の暗い玉も tint で同じ絵） */
export function paintSmokePuffTexture(scene: Phaser.Scene): void {
  const R = SMOKE_PUFF_TEX_RADIUS_UNITS * RENDER_SCALE;
  const d = Math.ceil(R * 2) + 2;
  paintCanvas(scene, TEXTURE_KEYS.smokePuff, d, d, (ctx) => put(ctx, d, d, smokePixels(d, R, SMOKE_PUFF_COLOR)));
}
