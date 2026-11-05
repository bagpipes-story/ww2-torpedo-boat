// 空襲下の退避（v0.6.11 S4。jp_03。spec-v0611-r2 §3.7・§11）の世界の組み立て（生成は 1 か所＝world-hazards の作法。r2 L11）: 編隊（波 × 枠＝ノーマル 8・ハード 12）を凍結の
// systems/air-strike-flight の AirStrikeFlight で起動時に全部作り（機・爆弾・着弾の輪・進路の線の Image は凍結の物が作るプール。r2 M8）、着弾（命中の onPlayerHit・外れの splash の両方）を
// core/evac-hits の走査へ、水柱は世界の SplashPool（共有 32）、座席への命中は世界の hitBoat（終わりの理由 air_strike）。毎フレームの絵は動く編隊と止まったフレームの 1 回だけ
// （core/evac-air の evacDrawPass。r2 M2）・18 隻の Image（evac-boats-view）・地形は起動時に 1 回描く静的な Graphics（evac-terrain。r2 L4）。evac の無い任務は null（何も作らない）。
// AirStrikeFlight を import する（DOM の game-config を読む）のはこのファイルだけ。tests が読む面は systems/world-evac（構造の型）。
import type Phaser from 'phaser';
import { boatTextureKey } from '../config/game-config';
import { evacDrawPass } from '../core/evac-air';
import type { BoatState } from '../core/boat-motion';
import type { HitSpec } from '../core/gunnery';
import type { MissionEndReason } from '../core/mission-flow';
import type { SeededRng } from '../core/rng';
import { AirStrikeFlight } from './air-strike-flight';
import type { BoatDamage } from './boat-damage';
import { EvacBoatsView } from './evac-boats-view';
import { EvacTerrain } from './evac-terrain';
import type { MissionWorld } from './mission-world';
import { WorldEvac } from './world-evac';

export type { WorldEvac };

const noop = (): void => {};

/** mission-world の constructor の最後に 1 回（hit は世界の hitBoat、damage は自艇の BoatDamage＝沈没の振り替えを置く） */
export function buildEvac(scene: Phaser.Scene, w: MissionWorld, seed: number, hit: (spec: HitSpec, rng: SeededRng, x: number, y: number, reason: MissionEndReason) => void, damage: BoatDamage): WorldEvac | null {
  const ev = w.setup.evac;
  if (!ev) return null;
  const flights: AirStrikeFlight[] = [];
  const evac = new WorldEvac(
    ev,
    w,
    seed,
    (_i, p, rng, onImpact) => {
      const f = new AirStrikeFlight(scene, p, rng, (x, y) => onImpact(x, y), (x, y) => onImpact(x, y), noop);
      flights.push(f);
      return f;
    },
    (spec, rng, x, y) => hit(spec, rng, x, y, 'air_strike'),
    (x, y, h) => w.splashes.splash(x, y, h),
    damage,
  );
  const terrain = new EvacTerrain(scene, ev, w.setup.mission.bounds);
  const boats = new EvacBoatsView(scene, evac.sq, boatTextureKey(ev.params.boatId), w.boat.sprite);
  const draw = (i: number, center: BoatState): void => flights[i]!.updateVisuals(center, null);
  evac.view = {
    update: () => {
      evacDrawPass(evac.plan, draw);
      boats.update(w.stepTimeS);
    },
    destroy: () => {
      for (const f of flights) f.destroy();
      boats.destroy();
      terrain.destroy();
    },
  };
  return evac;
}
