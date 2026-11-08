// 味方の駆逐艦 卯月の絵と見張りの扇（v0.6.10 S5a。jp_04「多号作戦・オルモック湾へ」。spec-v0610 リードの決定 LD15）: 艦の 1 枚（v0.7.0 S2a からは assets/destroyer-art の
// paintAllyDestroyerTexture＝睦月型を味方の薄い青で。鍵・寸法・原点は v0.6.10 の placeholder と同じ＝entities/ally-destroyer が displayWidth/Height から名前の y を決める）と、
// 海の上の見張りの扇の 1 枚（ui/ally-fan の形。陸を切り落とした薄い一色。表示の濃さは sprite の alpha。UI なので今のまま＝R27）。
// 卯月のいる任務（v0_1_prototype.ally_destroyer。V-A8 で 1 任務だけ）があるときだけ Boot が 1 回作る（CLAUDE.md §7。呼び出しの行は変えない＝R14）。
import Phaser from 'phaser';
import { TEXTURE_KEYS } from '../config/game-config';
import { ESCORT_TINT } from '../config/ui-config';
import type { AllyFanShape } from '../ui/ally-fan';
import { paintAllyDestroyerTexture } from './destroyer-art';

/** 卯月（記録の寸法 × sprite_scale の単位。艇首が上）と見張りの扇（fan の px のまま） */
export function generateAllyDestroyerTextures(scene: Phaser.Scene, spec: { lengthUnits: number; beamUnits: number }, fan: AllyFanShape): void {
  paintAllyDestroyerTexture(scene, spec);

  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(ESCORT_TINT, 1);
  g.fillPoints(fan.points as Phaser.Types.Math.Vector2Like[], true);
  g.generateTexture(TEXTURE_KEYS.allyFan, fan.widthPx, fan.heightPx);
  g.destroy();
}
