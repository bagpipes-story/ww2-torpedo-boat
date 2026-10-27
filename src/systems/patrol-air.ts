// 夜の哨戒機（v0.6.7。日本ハードモード⑥・jp_02「孤島の哨戒」。docs/02 §6.8、spec-v067 §C.2・§D.3）の世界側の絵: 段は systems/patrol-air-step の PatrolAirStep（Phaser なし）。
// 夜の出撃は AirStrikeFlight（systems/air-strike-flight。凍結のまま使う。seed+23 の系列・自艇への命中は世界の hitBoat の 'bombed'。world-hazards が作る）。ここは捜索の 2 機の絵と受け渡しの向き。
// 受け渡し（見た目だけ。R10）: 発見の瞬間に捜索の絵を隠し、出撃の 2 機が同じ方位・距離に濃さ 1 で出る（restartAirSortie）。向きは捜索の向き（付近の捜索の発見なら接線）から
// 出撃の向き（機首が自艇）へ AIR_STRIKE_FADE_S かけて最短で回す（凍結の AirStrikeFlight は機の絵を外に出さないので、その private の配列を constructor で 1 回だけ読む。書くのは角度だけ）。
// §7: 絵 2 枚は constructor で 1 回だけ作り、毎フレームは transform/alpha と表示の切り替え（前回の値と比べる）だけ。
import type Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { PATROL_SEARCH_ALPHA } from '../config/patrol-config';
import type { PatrolAirSetup } from '../config/patrol-air-mission-data';
import { AIR_STRIKE_FADE_S, strikePose } from '../core/air-strike';
import type { BoatState } from '../core/boat-motion';
import type { AircraftPose } from '../core/friendly';
import { wrapDeg180 } from '../core/units';
import type { AirStrikeFlight } from './air-strike-flight';
import { PatrolAirStep } from './patrol-air-step';

export class PatrolAir extends PatrolAirStep {
  private readonly pose: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };
  private readonly search: Phaser.GameObjects.Image[] = [];
  private readonly searchShown: boolean[] = [];
  /** 出撃の機の絵（AirStrikeFlight の中の配列。受け渡しの向きを回すときだけ角度を書く） */
  private readonly sortiePlanes: readonly Phaser.GameObjects.Image[];

  constructor(scene: Phaser.Scene, setup: PatrolAirSetup, private readonly strike: AirStrikeFlight) {
    super(setup, strike);
    this.sortiePlanes = strike['planes'];
    for (let i = 0; i < this.gate.planes; i++) {
      this.search.push(scene.add.image(0, 0, TEXTURE_KEYS.enemyAircraft).setScale(1 / RENDER_SCALE).setDepth(DEPTH.aircraft).setVisible(false));
      this.searchShown.push(false);
    }
  }

  /** 毎フレーム: 夜の出撃（機・爆弾・着弾点の輪・爆撃進路の線）、受け渡しの向き、捜索の 2 機（変わるものだけ触る） */
  updateVisuals(player: BoatState, escort: BoatState | null): void {
    this.strike.updateVisuals(player, escort);
    if (this.handoffS > 0) {
      const k = this.handoffS / AIR_STRIKE_FADE_S;
      for (let i = 0; i < this.sortiePlanes.length; i++) {
        const img = this.sortiePlanes[i]!;
        if (!img.visible) continue;
        const h = strikePose(this.strike.state, this.sortie, i, this.pose).headingDeg;
        img.setAngle(h + wrapDeg180(this.findHeadingDeg[i]! - h) * k);
      }
    }
    for (let i = 0; i < this.search.length; i++) {
      const q = this.searchPose(i, this.pose);
      const show = q.alpha > 0;
      if (show !== this.searchShown[i]) {
        this.searchShown[i] = show;
        this.search[i]!.setVisible(show);
      }
      if (show) this.search[i]!.setPosition(player.x + q.dx, player.y + q.dy).setAngle(q.headingDeg).setAlpha(q.alpha * PATROL_SEARCH_ALPHA);
    }
  }

  destroy(): void {
    this.strike.destroy();
    for (const img of this.search) img.destroy();
  }
}
