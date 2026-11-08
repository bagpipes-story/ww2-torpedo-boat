// v0.7.0 S2a（アートと音①：コードで描く絵。spec-v0700 §4.2）: 魚雷の絵（tex-torpedo。全任務。凍結の torpedo-pool と jp_04 の敵の魚雷が使う）。黄の胴・明るい先端 1.5 単位・
// やや暗い尾 1 単位。寸法は placeholder と同じ ceil(3·k) × ceil(L·k)（art-dims）。黄の面積 100%・平均の明るさ ≥ placeholder × 0.95（R8）。雷跡の点 tex-wake-dot は描き直さない（R8）。
// placeholders の generateTorpedoTextures（魚雷・雷跡の点・爆発の輪）が魚雷の 1 枚にこれを呼ぶ。
import type Phaser from 'phaser';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { TORPEDO_ART, TORPEDO_TAIL_UNITS, TORPEDO_TIP_UNITS } from '../config/boat-art-config';
import { torpedoTexSize } from './art-dims';
import { paintTexture } from './art-pen';

/** 魚雷（先端が上。原点はテクスチャ中央） */
export function paintTorpedoTexture(scene: Phaser.Scene, lengthUnits: number): void {
  const size = torpedoTexSize(lengthUnits, RENDER_SCALE);
  // placeholder は切り上げた px の矩形を全部塗っていた（4 × 14 px）。同じ覆いになるよう、px の矩形いっぱいを世界単位に戻して塗る（3.27 単位で止めると端の列が半透明になり覆いが 75% に落ちる）
  const w = size.w / RENDER_SCALE;
  const l = size.h / RENDER_SCALE;
  paintTexture(scene, TEXTURE_KEYS.torpedo, size, RENDER_SCALE, (pen) => {
    pen.rect(0, 0, w, l, 0, TORPEDO_ART.body, 1);
    pen.rect(0, 0, w, TORPEDO_TIP_UNITS, 0, TORPEDO_ART.tip, 1);
    pen.rect(0, l - TORPEDO_TAIL_UNITS, w, TORPEDO_TAIL_UNITS, 0, TORPEDO_ART.tail, 1);
  });
}
