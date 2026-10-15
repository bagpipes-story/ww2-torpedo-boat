// 任務の危険（味方機・暴風・水上機）の生成（v0.4.2 で mission-world の constructor から切り出し。中身は v0.4.1 のまま）。
// 乱数は別系列: 味方機の掃射 seed+2、暴風の始まり seed+3（StormFront の中で 1 回）、水上機の散布 seed+5。被害はすべて世界の hitBoat を通る。
import type Phaser from 'phaser';
import { DEBUG_FRIENDLY_FORCE, DEBUG_SEAPLANE, DEBUG_STORM_START_Y } from '../config/game-config';
import type { BoatState } from '../core/boat-motion';
import type { HitSpec } from '../core/gunnery';
import type { MissionEndReason } from '../core/mission-flow';
import { SeededRng } from '../core/rng';
import { EnemySeaplane } from './enemy-seaplane';
import { FriendlyFire } from './friendly-fire';
import type { SplashPool } from './splash-pool';
import { StormFront } from './storm-front';
import type { WorldSetup } from './world-setup';

export interface Hazards {
  friendly: FriendlyFire | null;
  storm: StormFront | null;
  seaplane: EnemySeaplane | null;
}

export function buildHazards(scene: Phaser.Scene, s: WorldSetup, seed: number, boat: BoatState, splashes: SplashPool, hit: (spec: HitSpec, rng: SeededRng, x: number, y: number, reason: MissionEndReason) => void, onSlam: (x: number, y: number) => void): Hazards {
  const splash = (x: number, y: number, h: boolean): void => splashes.splash(x, y, h);
  const fp = s.friendly;
  const friendlyRng = new SeededRng((seed + 2) >>> 0);
  const sp = s.seaplane;
  const planeRng = new SeededRng((seed + 5) >>> 0);
  return {
    friendly: fp ? new FriendlyFire(scene, fp, DEBUG_FRIENDLY_FORCE, splash, (x, y) => hit(fp.hit, friendlyRng, x, y, 'friendly_fire')) : null,
    storm: s.storm ? new StormFront(scene, s.storm, seed, DEBUG_STORM_START_Y, boat, splash, onSlam) : null,
    seaplane: sp ? new EnemySeaplane(scene, sp, DEBUG_SEAPLANE, planeRng, boat, splash, (x, y) => hit(sp.bombHit, planeRng, x, y, 'bombed')) : null,
  };
}
