// 敵の米PT の絵（v0.6.3。spec §D.5。v0.7.0 S2a からは assets/boat-art の paintPtBoatTexture＝自艇の Elco 80 と同じ形を敵の薄い赤で。鍵・寸法・原点は v0.6.3 の placeholder と同じ）。
// 寸法は boats.json の us_elco80（24.4 × 6.3 m）× sprite_scale（core/pt-data の spriteLengthUnits・spriteBeamUnits）。Boot で 1 回だけ（§7。呼び出しの行は変えない＝R14）。
import type Phaser from 'phaser';
import { paintPtBoatTexture } from './boat-art';

export function generatePtBoatTexture(scene: Phaser.Scene, spec: { lengthUnits: number; beamUnits: number }): void {
  paintPtBoatTexture(scene, spec);
}
