// v0.7.0 S1（アートと音①：コードで描く絵。spec-v0700 §4.1）: 自艇・僚艇・隼艇の絵（boatTextureKey の 5 枚: Elco 80・Elco 77・T-38・T-14・H-38）。S2a で敵の米PT（同じ形を敵の色で）も。
// placeholders の generatePlayerBoatTexture と同じ名前・引数・鍵・寸法（art-dims の式。D1）で、Boot の呼び出しの行は変えない（R14）。
// 真上から見た絵・艇首が上。無彩色に近い灰で描き、僚艇・隼艇の ESCORT_TINT・jp_03 の EVAC_HIDDEN_TINT の掛け算で薄い青・暗い灰になる。被害・沈没の絵は作らない（§3.6）。
// v0.7.0 IP3（実機 3 回目の U10「自機（魚雷艇）と大発も視覚的なクオリティを上げてください」）: Graphics の平たい部品から、Canvas の 2D に陰影つきで描く形へ（assets/boat-paint。
//   喫水の縁・舷の帯・甲板の陰影と板の筋・船室の風防と操舵の窪み・発射管や魚雷・銃座と砲身・煙幕の発生機・高い物の陰・艇首の光）。画素は 2 倍の密度（ship-art-config の
//   ART_TEX_DENSITY）。鍵・論理の寸法（hullTexSize）・原点（中央）は同じ。色は地の色 1 つの明るさだけ（自艇の灰の彩度はそのまま＝tint が今までどおり効く）。
import type Phaser from 'phaser';
import { TEXTURE_KEYS, boatTextureKey } from '../config/game-config';
import { BOAT_ART_DEFAULT_KIND, BOAT_ART_KIND_BY_ID, BOAT_ART_LAYOUTS, PALETTE_ENEMY, PALETTE_PLAYER, type BoatArtKind } from '../config/boat-art-config';
import { BOAT_PAINT_DETAILS } from '../config/boat-paint-config';
import type { BoatTextureSpec } from './art-dims';
import { paintSmallBoat } from './boat-paint';
import { paintHullCanvas } from './ship-art';

/** 鍵（boatTextureKey(id)）→ 形の種類。表に無い艇は既定 */
export function boatArtKindForKey(key: string): BoatArtKind {
  for (const id of Object.keys(BOAT_ART_KIND_BY_ID)) if (boatTextureKey(id) === key) return BOAT_ART_KIND_BY_ID[id]!;
  return BOAT_ART_DEFAULT_KIND;
}

/** 形の種類 kind を地の色 base で key に（論理の寸法は placeholder と同じ ceil(B·k) × ceil(L·k)・画素は密度の倍） */
function paintBoatKind(scene: Phaser.Scene, key: string, spec: BoatTextureSpec, kind: BoatArtKind, base: number): void {
  paintHullCanvas(scene, key, spec, (ctx) => paintSmallBoat(ctx, BOAT_ART_LAYOUTS[kind], BOAT_PAINT_DETAILS[kind], spec.lengthUnits, spec.beamUnits, base));
}

/** 自艇・僚艇・隼艇: 艇首を上にした絵。原点はテクスチャ中央。key は艇ごと（boatTextureKey。v0.6.0） */
export function generatePlayerBoatTexture(scene: Phaser.Scene, spec: BoatTextureSpec, key: string): void {
  paintBoatKind(scene, key, spec, boatArtKindForKey(key), PALETTE_PLAYER.rim); // 地は白に近いリムの色（陰影で暗くなる分、平均の明るさを placeholder の近くに保つ）
}

/** 敵の米PT（S2a。tex-pt-boat。jp_01・jp_04・jp_05）: Elco 80 と同じ形を敵の色で（形は自艇と同じ＝史実。色で敵。去れば PT_RETIRED_TINT の掛け算で灰）。pt-placeholder の generatePtBoatTexture が呼ぶ */
export function paintPtBoatTexture(scene: Phaser.Scene, spec: BoatTextureSpec): void {
  paintBoatKind(scene, TEXTURE_KEYS.ptBoat, spec, 'elco80', PALETTE_ENEMY.deck);
}
