// 救助の世界の組み立て（v0.8.5 S2。us_07）: 今夜の群と機雷原（systems/rescue-field-setup の rescueFieldOf＝seed+47。S3 の模擬と同じ関数）から systems/world-rescue を作り、
// 絵（systems/rescue-view）を付ける。setup.rescue の無い任務は null（系列も絵も作らない）。mission-world が敵の側の前に 1 回呼ぶ（沿岸砲の着弾が群を奪う）。
import type Phaser from 'phaser';
import type { HitSpec } from '../core/gunnery';
import type { MissionEndReason } from '../core/mission-flow';
import type { SeededRng } from '../core/rng';
import { rescueFieldOf } from './rescue-field-setup';
import { RescueView } from './rescue-view';
import type { SplashPool } from './splash-pool';
import { WorldRescue } from './world-rescue';
import type { WorldSetup } from './world-setup';

export function buildRescue(scene: Phaser.Scene, s: WorldSetup, seed: number, splashes: SplashPool, hitBoat: (spec: HitSpec, rng: SeededRng, x: number, y: number, reason: MissionEndReason) => void): WorldRescue | null {
  const f = rescueFieldOf(s, seed);
  return f ? new WorldRescue(s, f, splashes, hitBoat, (src) => new RescueView(scene, s, src, splashes)) : null;
}
