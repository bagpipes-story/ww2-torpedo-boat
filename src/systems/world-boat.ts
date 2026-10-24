// 自艇の運動の固定ステップ（v0.6.5 の準備で systems/mission-world.ts の stepFn から移した。順と式は 1 字も変えていない）: 座礁・stepBoat・海域の縁・浅瀬・燃料・帰投の輪。
// 沈み始めたら何もしない（乗員と setPerformance は沈み始めても回るので mission-world に残す）。§7: 確保しない。
import { clampToBounds, stepBoat } from '../core/boat-motion';
import { stepFuel } from '../core/fuel';
import { insideRing } from '../core/mission-flow';
import { shallowIndexAt } from '../core/shallows';
import type { MissionWorld } from './mission-world';
import { DRIFT_INPUT } from './world-events';

/** 1 固定ステップ。dt は体感の秒に time_scale を掛けた秒（mission-world の stepFn の dt。運動と燃料は同じ dt で積分する） */
export function stepPlayerBoat(w: MissionWorld, dt: number): void {
  const boat = w.boat.state;
  const c = w.setup;
  if (!w.boat.sinking) {
    if (w.grounded) {
      boat.speedMps = 0;
    } else {
      // 燃料切れなら漂流（舵も速度指令も効かない）。燃料は運動と同じ game dt で積分する
      stepBoat(boat, w.fuel.empty ? DRIFT_INPUT : w.input, w.params, dt);
      clampToBounds(boat, c.mission.bounds, c.boundsMarginM);
      // 浅瀬: 安全速力を超えて中に入ると座礁（docs/02 §6.8）。安全速力以下なら通れる
      if (boat.speedMps > c.grounding.safeSpeedMps && shallowIndexAt(c.mission.shallows, boat.x, boat.y) >= 0) {
        w.grounded = true;
        boat.speedMps = 0;
        w.events.onGrounded(boat.x, boat.y);
      }
    }
    stepFuel(w.fuel, w.fuelCurve, boat.speedMps, dt);
    w.atHome = insideRing(w.returnPoint, boat.x, boat.y);
  }
}
