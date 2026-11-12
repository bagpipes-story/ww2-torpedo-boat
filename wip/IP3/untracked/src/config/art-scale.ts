// v0.7.0 IP3（実機 3 回目。U10「自機（魚雷艇）と大発も視覚的なクオリティを上げてください」）: 船形の絵の Image の表示の倍率を 1 か所に。
// 絵は 1 世界単位 ＝ RENDER_SCALE × artTexDensity(鍵) px で描く（IP2b の艦の 5 つの鍵・IP3 で艇・米PT・大発の 8 つの鍵を足した）ので、Image は 1 / (RENDER_SCALE × 密度) で表示する。
// 計算の順は IP2b と同じ (1 / RENDER_SCALE) / 密度（密度は 2 の冪＝displayWidth・displayHeight と沈む tween の倍率は密度 1 とビット同一。tests/art-inventory）。
import { RENDER_SCALE } from './game-config';
import { artTexDensity } from './ship-art-config';

/** 鍵 key の船形の絵の Image の倍率（世界の大きさは密度に依らない） */
export function artImageScale(key: string): number {
  return 1 / RENDER_SCALE / artTexDensity(key);
}
