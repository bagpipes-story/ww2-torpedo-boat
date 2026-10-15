// 駆逐艦の側の固定ステップ（v0.4.4 で mission-world から切り出し。順序は v0.4.1 のまま: 艦 → 魚雷 → 体当たり → 反撃）。
// 反撃は、僚艇のいる任務（v0.4.4）では自艇と僚艇の 2 目標（core/gunnery-pair。照らされていて近い方）、それ以外は v0.4.1 のまま（EnemyFire.step）。
// 発見の回数（Result の「回避」の根拠）もここで数える: ai.playerDetected が false → true になった回数。確保しない。
import type { BoatState } from '../core/boat-motion';
import { losBlocked } from '../core/smoke';
import type { MissionWorld } from './mission-world';
import type { Destroyer } from '../entities/destroyer';

export function stepDestroyerSide(w: MissionWorld, d: Destroyer, dt: number, feelDt: number, boat: BoatState): void {
  const c = w.setup;
  d.step(dt, feelDt, boat, w.detectRangeM, w.vis.detectHoldS, w.torpedoes.states);
  if (d.ai.playerDetected && !w.detect.prev) w.detect.count++;
  w.detect.prev = d.ai.playerDetected;
  w.torpedoes.step(dt, feelDt, d.sinking ? null : d.circles, d.state.x, d.state.y, c.destroyer!.passRadius2, w.torpedoEvents);
  if (!w.boat.sinking && d.touchesBoat(boat, c.boatHalfLengthM)) w.sinkBoat('rammed');
  const alive = !d.sinking && !w.boat.sinking;
  const detected = d.ai.playerDetected && !d.sinking;
  const e = w.escort;
  if (!e) {
    w.enemyFire!.step(dt, feelDt, d.state, boat, detected, alive, c.boatHalfLengthM, c.boatHalfBeamM, w.hiddenBySmoke, w.flareLit);
    return;
  }
  // 僚艇（v0.4.4）: 艦と僚艇の線が煙幕に遮られていれば僚艇は照らされない。沈んだ僚艇は狙わない
  const eb = e.state.boat;
  const escortBlocked = w.smoke !== null && w.smokeParams !== null && losBlocked(w.smoke, w.smokeParams, d.state.x, d.state.y, eb.x, eb.y);
  w.enemyFire!.stepPair(dt, feelDt, d.state, boat, eb, !e.state.sunk, detected, alive, c.boatHalfLengthM, c.boatHalfBeamM, e.p.halfLengthM, e.p.halfBeamM, e.p.litNearLeaderM, w.hiddenBySmoke, escortBlocked, w.flareLit);
}
