// v0.7.0 S2a（アートと音①：コードで描く絵。spec-v0700 §4.2）: 大発の絵。敵の大発（tex-barge。us_03。座礁すれば BARGE_BEACHED_TINT の掛け算で灰）と味方の大発（tex-barge-friendly。
// jp_01 の輸送隊。薄い青）は同じ形で色だけ違う。輪郭は v0.4.2 の placeholder のまま（平たい艇首の道板 0.76B が見分けの鍵）。幅 7.3 単位の小艇なので側の暗い帯は描かない（R17）。
// barge-placeholder の generateBargeTextures・generateFriendlyBargeTexture（Boot の呼び出しの行は変えない＝R14）が船形にこれを呼ぶ。機銃の曳光弾の絵はそのまま。
import type Phaser from 'phaser';
import { TEXTURE_KEYS } from '../config/game-config';
import { PALETTE_ALLY, PALETTE_ALLY_MID, PALETTE_ENEMY, PALETTE_ENEMY_MID } from '../config/boat-art-config';
import type { BoatTextureSpec } from './art-dims';
import { paintShipTexture } from './ship-art';
import { bargeShape } from './ship-shape';

/** 大発（敵は薄い赤・味方は薄い青）。原点はテクスチャ中央・艇首が上 */
export function paintBargeTexture(scene: Phaser.Scene, spec: BoatTextureSpec, friendly: boolean): void {
  const shape = bargeShape(spec.lengthUnits, spec.beamUnits);
  if (friendly) paintShipTexture(scene, TEXTURE_KEYS.bargeFriendly, spec, shape, PALETTE_ALLY, PALETTE_ALLY_MID);
  else paintShipTexture(scene, TEXTURE_KEYS.barge, spec, shape, PALETTE_ENEMY, PALETTE_ENEMY_MID);
}
