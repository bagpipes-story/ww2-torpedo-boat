// 世界の兵装（v0.6.8。spec-v068 §3.2）: systems/arms-step の ArmsStep（Phaser 非依存の段）を継ぎ、絵を足す（S3: 艦への機銃の曳光弾・対空の曳光弾・閃光・落ちる機）。
// S2 は狙う艦の無い魚雷の数と文・終わりの待ちだけ（魚雷の絵は魚雷のプールがそのまま描く）。MissionWorld が敵の側・危険の後に 1 回だけ作る（乱数の系列は作らない）。
import type Phaser from 'phaser';
import type { GameData } from '../config/game-data';
import { getLoadout } from '../config/loadout-data';
import type { BlindKind } from '../core/arms-cue';
import { ArmsStep } from './arms-step';
import type { MissionWorld } from './mission-world';

export class WorldArms extends ArmsStep {
  /** 毎フレームの絵（mission-world の updateFrame の最後。S2 は描く物が無い） */
  updateVisuals(_realDt: number, _w: MissionWorld): void {}

  destroy(): void {}
}

/**
 * 任務の兵装を作る（艇が魚雷も砲も積まなければ null。遊べる任務ではいつも作る）。狙う艦の無い魚雷の文は任務の敵から: 大発の隊（us_03）・米PT の隊（jp_01・jp_05）・それ以外（艦なし）。
 * scene・seed・onSunk は S3 の絵・乱数の系列（+24・+25）・撃墜の爆発で使う
 */
export function buildArms(scene: Phaser.Scene, w: MissionWorld, data: GameData, seed: number, onSunk: (x: number, y: number) => void): WorldArms | null {
  const lo = getLoadout(data, w.setup.mission);
  if (lo.torpedoes <= 0 && lo.gun === null) return null;
  const kind: BlindKind = w.hunt ? 'barge' : w.pts ? 'pt' : 'noship';
  return new WorldArms(kind);
}
