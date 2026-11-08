// 味方の輸送船の絵（v0.6.9。jp_04「多号作戦・オルモック湾へ」。spec-v069 §5.4）。v0.7.0 S2a からは assets/transport-art の paintFriendlyTransportTexture（敵の輸送船と同じ形を
// 味方の薄い青で。灰色の絵を tint しても青くならないので別の 1 枚＝v0.6.9 のまま）。鍵・寸法・原点は v0.6.9 の placeholder と同じ（entities/ally-ship が displayWidth/Height から名前・状態の行の y を決める）。
// 停泊して揚陸する輸送船を持つ任務（v0_1_prototype.landing）があるときだけ Boot が 1 回作る（CLAUDE.md §7。呼び出しの行は変えない＝R14）。
import type Phaser from 'phaser';
import { paintFriendlyTransportTexture } from './transport-art';

/** 味方の輸送船（記録の寸法 × sprite_scale の単位） */
export function generateFriendlyTransportTexture(scene: Phaser.Scene, spec: { lengthUnits: number; beamUnits: number }): void {
  paintFriendlyTransportTexture(scene, spec);
}
