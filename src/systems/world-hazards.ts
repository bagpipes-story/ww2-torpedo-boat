// 任務の危険（味方機・暴風・水上機・夜明けの空襲）の生成（v0.4.2 で mission-world の constructor から切り出し。中身は v0.4.1 のまま）。
// 乱数は別系列: 味方機の掃射 seed+2、暴風の始まり seed+3（StormFront の中で 1 回）、水上機の散布 seed+5、夜明けの空襲 seed+19（v0.6.1。夜明けまで引かない）。夜の哨戒機の出撃は seed+23（v0.6.7。core/patrol-air-state の PATROL_AIR_SEED_OFFSET。哨戒のある任務だけで作る）。
// 被害はすべて世界の hitBoat を通る（空襲の終了理由は air_strike。僚艇への爆弾は escortHit）。
import type Phaser from 'phaser';
import { DEBUG_FRIENDLY_FORCE, DEBUG_SEAPLANE, DEBUG_STORM_START_Y } from '../config/game-config';
import { AIR_STRIKE_SEED_OFFSET } from '../core/air-strike';
import type { BoatState } from '../core/boat-motion';
import type { HitSpec } from '../core/gunnery';
import type { MissionEndReason } from '../core/mission-flow';
import { SeededRng } from '../core/rng';
import { AirStrikeFlight } from './air-strike-flight';
import { EnemySeaplane } from './enemy-seaplane';
import { FriendlyFire } from './friendly-fire';
import type { SplashPool } from './splash-pool';
import { StormFront } from './storm-front';
import type { WorldSetup } from './world-setup';

export interface Hazards {
  friendly: FriendlyFire | null;
  storm: StormFront | null;
  seaplane: EnemySeaplane | null;
  /** 夜明けの空襲（v0.6.1。setup.airStrike が無ければ null。WorldDawn が持つ） */
  strike: AirStrikeFlight | null;
}

export function buildHazards(
  scene: Phaser.Scene,
  s: WorldSetup,
  seed: number,
  boat: BoatState,
  splashes: SplashPool,
  hit: (spec: HitSpec, rng: SeededRng, x: number, y: number, reason: MissionEndReason) => void,
  onSlam: (x: number, y: number) => void,
  /** 僚艇（要人）への命中（被害 HP と位置。乱数は引かない） */
  escortHit: (damage: number, x: number, y: number) => void,
): Hazards {
  const splash = (x: number, y: number, h: boolean): void => splashes.splash(x, y, h);
  const fp = s.friendly;
  const friendlyRng = new SeededRng((seed + 2) >>> 0);
  const sp = s.seaplane;
  const planeRng = new SeededRng((seed + 5) >>> 0);
  const st = s.airStrike;
  const strikeRng = new SeededRng((seed + AIR_STRIKE_SEED_OFFSET) >>> 0);
  return {
    friendly: fp ? new FriendlyFire(scene, fp, DEBUG_FRIENDLY_FORCE, splash, (x, y) => hit(fp.hit, friendlyRng, x, y, 'friendly_fire')) : null,
    storm: s.storm ? new StormFront(scene, s.storm, seed, DEBUG_STORM_START_Y, boat, splash, onSlam) : null,
    seaplane: sp ? new EnemySeaplane(scene, sp, DEBUG_SEAPLANE, planeRng, boat, splash, (x, y) => hit(sp.bombHit, planeRng, x, y, 'bombed')) : null,
    strike: st ? new AirStrikeFlight(scene, st, strikeRng, splash, (x, y) => hit(st.bombHit, strikeRng, x, y, 'air_strike'), escortHit) : null,
  };
}
