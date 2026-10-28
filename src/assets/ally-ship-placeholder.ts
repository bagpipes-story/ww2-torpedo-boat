// 味方の輸送船のプレースホルダー（v0.6.9。jp_04「多号作戦・オルモック湾へ」。spec-v069 §5.4）: 敵の輸送船（assets/placeholders の generateTransportTexture。灰色）と同じ船形を
// 僚艇の薄い青（ESCORT_TINT）で塗った別の 1 枚（灰色の絵を tint しても青くならない。味方の大発の tex-barge-friendly と同じ考え）。placeholders.ts は触らない（329 行）。
// 停泊して揚陸する輸送船を持つ任務（v0_1_prototype.landing）があるときだけ Boot が 1 回作る（CLAUDE.md §7）。原点はテクスチャ中央・艇首が上。
import Phaser from 'phaser';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { ESCORT_TINT } from '../config/ui-config';

/** 船橋（後ろ寄り）の暗い色と濃さ（敵の輸送船の絵と同じ） */
const BRIDGE_COLOR = 0x0b1020;
const BRIDGE_ALPHA = 0.8;

/** 味方の輸送船（記録の寸法 × sprite_scale の単位）: 幅広い船形を薄い青で＋後ろ寄りの船橋 */
export function generateFriendlyTransportTexture(scene: Phaser.Scene, spec: { lengthUnits: number; beamUnits: number }): void {
  const k = RENDER_SCALE;
  const L = spec.lengthUnits * k;
  const B = spec.beamUnits * k;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(ESCORT_TINT, 1);
  g.beginPath();
  g.moveTo(B / 2, 0);
  g.lineTo(B, L * 0.22);
  g.lineTo(B, L * 0.92);
  g.lineTo(B * 0.7, L);
  g.lineTo(B * 0.3, L);
  g.lineTo(0, L * 0.92);
  g.lineTo(0, L * 0.22);
  g.closePath();
  g.fillPath();
  g.fillStyle(BRIDGE_COLOR, BRIDGE_ALPHA);
  g.fillRect(B * 0.25, L * 0.62, B * 0.5, L * 0.18);
  g.generateTexture(TEXTURE_KEYS.transportFriendly, Math.ceil(B), Math.ceil(L));
  g.destroy();
}
