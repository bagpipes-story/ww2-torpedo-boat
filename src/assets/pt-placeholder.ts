// 敵の米PT のプレースホルダー（v0.6.3。spec §D.5）: 自艇と同じ尖った船形（generatePlayerBoatTexture）を敵の薄い赤で塗り、艇首側に暗い線。Boot で 1 回だけ（§7）。
// 寸法は boats.json の us_elco80（24.4 × 6.3 m）× sprite_scale（core/pt-data の spriteLengthUnits・spriteBeamUnits）。
import Phaser from 'phaser';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { TARGET_MARKER_COLOR } from '../config/ui-config';

/** 艇首の線の色と濃さ（自艇の絵と同じ） */
const PT_BOW_LINE_COLOR = 0x0b1020;
const PT_BOW_LINE_ALPHA = 0.9;

export function generatePtBoatTexture(scene: Phaser.Scene, spec: { lengthUnits: number; beamUnits: number }): void {
  const k = RENDER_SCALE;
  const L = spec.lengthUnits * k;
  const B = spec.beamUnits * k;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(TARGET_MARKER_COLOR, 1);
  g.beginPath();
  g.moveTo(B / 2, 0);
  g.lineTo(B, L * 0.3);
  g.lineTo(B * 0.92, L);
  g.lineTo(B * 0.08, L);
  g.lineTo(0, L * 0.3);
  g.closePath();
  g.fillPath();
  g.lineStyle(Math.max(1, k), PT_BOW_LINE_COLOR, PT_BOW_LINE_ALPHA);
  g.beginPath();
  g.moveTo(B / 2, L * 0.08);
  g.lineTo(B / 2, L * 0.45);
  g.strokePath();
  g.generateTexture(TEXTURE_KEYS.ptBoat, Math.ceil(B), Math.ceil(L));
  g.destroy();
}
