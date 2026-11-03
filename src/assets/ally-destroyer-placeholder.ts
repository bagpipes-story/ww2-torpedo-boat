// 味方の駆逐艦 卯月のプレースホルダー（v0.6.10 S5a。jp_04「多号作戦・オルモック湾へ」。spec-v0610 リードの決定 LD15）: 敵の駆逐艦（assets/placeholders の generateDestroyerTexture。灰色）と
// 同じ船形を味方の輸送船と同じ薄い青（ESCORT_TINT）で塗った 1 枚と、海の上の見張りの扇の 1 枚（ui/ally-fan の形。陸を切り落とした薄い一色。表示の濃さは sprite の alpha）。
// 卯月のいる任務（v0_1_prototype.ally_destroyer。V-A8 で 1 任務だけ）があるときだけ Boot が 1 回作る（CLAUDE.md §7）。placeholders.ts は触らない（329 行）。
import Phaser from 'phaser';
import { RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { ESCORT_TINT } from '../config/ui-config';
import type { AllyFanShape } from '../ui/ally-fan';

/** 艦橋の暗い色と濃さ（敵の駆逐艦の絵と同じ） */
const BRIDGE_COLOR = 0x0b1020;
const BRIDGE_ALPHA = 0.8;

/** 卯月（記録の寸法 × sprite_scale の単位。艇首が上）と見張りの扇（fan の px のまま） */
export function generateAllyDestroyerTextures(scene: Phaser.Scene, spec: { lengthUnits: number; beamUnits: number }, fan: AllyFanShape): void {
  const k = RENDER_SCALE;
  const L = spec.lengthUnits * k;
  const B = spec.beamUnits * k;
  let g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(ESCORT_TINT, 1);
  g.beginPath();
  g.moveTo(B / 2, 0);
  g.lineTo(B, L * 0.18);
  g.lineTo(B, L * 0.9);
  g.lineTo(B * 0.75, L);
  g.lineTo(B * 0.25, L);
  g.lineTo(0, L * 0.9);
  g.lineTo(0, L * 0.18);
  g.closePath();
  g.fillPath();
  g.fillStyle(BRIDGE_COLOR, BRIDGE_ALPHA);
  g.fillRect(B * 0.3, L * 0.35, B * 0.4, L * 0.25);
  g.generateTexture(TEXTURE_KEYS.destroyerFriendly, Math.ceil(B), Math.ceil(L));
  g.destroy();

  g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(ESCORT_TINT, 1);
  g.fillPoints(fan.points as Phaser.Types.Math.Vector2Like[], true);
  g.generateTexture(TEXTURE_KEYS.allyFan, fan.widthPx, fan.heightPx);
  g.destroy();
}
