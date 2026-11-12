// v0.7.0 S2a（アートと音①：コードで描く絵。spec-v0700 §4.2）: 大発の絵。敵の大発（tex-barge。us_03。座礁すれば BARGE_BEACHED_TINT の掛け算で灰）と味方の大発（tex-barge-friendly。
// jp_01 の輸送隊。薄い青）は同じ形で色だけ違う。輪郭は v0.4.2 の placeholder のまま（平たい艇首の道板 0.76B が見分けの鍵）。幅 7.3 単位の小艇なので側の暗い帯は描かない（R17）。
// v0.7.0 IP3（U10）: Canvas の 2D に陰影つきで描く（assets/barge-paint: 道板の桁と蝶番・舷の縁と防舷の縄・荷台の窪みと荷・機関の覆い・艇長の台）。画素は 2 倍の密度。
// barge-placeholder の generateBargeTextures・generateFriendlyBargeTexture（Boot の呼び出しの行は変えない＝R14）が船形にこれを呼ぶ。機銃の曳光弾の絵はそのまま。
import type Phaser from 'phaser';
import { TEXTURE_KEYS } from '../config/game-config';
import { PALETTE_ALLY, PALETTE_ENEMY } from '../config/boat-art-config';
import type { BoatTextureSpec } from './art-dims';
import { paintBarge } from './barge-paint';
import { paintHullCanvas } from './ship-art';

/** 大発（敵は薄い赤・味方は薄い青）。原点はテクスチャ中央・艇首が上 */
export function paintBargeTexture(scene: Phaser.Scene, spec: BoatTextureSpec, friendly: boolean): void {
  const base = friendly ? PALETTE_ALLY.deck : PALETTE_ENEMY.deck;
  paintHullCanvas(scene, friendly ? TEXTURE_KEYS.bargeFriendly : TEXTURE_KEYS.barge, spec, (ctx) => paintBarge(ctx, spec.lengthUnits, spec.beamUnits, base));
}
