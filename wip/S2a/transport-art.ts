// v0.7.0 S2a（アートと音①：コードで描く絵。spec-v0700 §4.2）: 輸送船の絵。敵の輸送船（tex-transport。us_02。灰がかった赤＝砲台でない）と味方の輸送船（tex-transport-friendly。
// jp_04。薄い青。寸法は厳守＝名前と状態の行の y は displayWidth/Height から）は同じ形（丸い艦首と艦尾・船倉のハッチ 4・船橋と煙突・マスト 2 と荷役の腕）で色だけ違う。
// generateTransportTexture は placeholders と同じ名前・引数・鍵・寸法（Boot の呼び出しの行は変えない＝R14。import の行だけこのファイルに）。
import type Phaser from 'phaser';
import { TEXTURE_KEYS } from '../config/game-config';
import { PALETTE_ALLY, PALETTE_ALLY_MID, PALETTE_TRANSPORT, PALETTE_TRANSPORT_MID } from '../config/boat-art-config';
import { SHIP_ART_LAYOUTS } from '../config/ship-art-config';
import type { BoatTextureSpec } from './art-dims';
import { paintShipTexture } from './ship-art';
import { shipShape } from './ship-shape';

/** 敵の輸送船（灰赤）。原点はテクスチャ中央・艦首が上 */
export function generateTransportTexture(scene: Phaser.Scene, spec: BoatTextureSpec): void {
  paintShipTexture(scene, TEXTURE_KEYS.transport, spec, shipShape(SHIP_ART_LAYOUTS.transport, spec.lengthUnits, spec.beamUnits), PALETTE_TRANSPORT, PALETTE_TRANSPORT_MID);
}

/** 味方の輸送船（薄い青。ally-ship-placeholder の generateFriendlyTransportTexture がこれを呼ぶ） */
export function paintFriendlyTransportTexture(scene: Phaser.Scene, spec: BoatTextureSpec): void {
  paintShipTexture(scene, TEXTURE_KEYS.transportFriendly, spec, shipShape(SHIP_ART_LAYOUTS.transport, spec.lengthUnits, spec.beamUnits), PALETTE_ALLY, PALETTE_ALLY_MID);
}
