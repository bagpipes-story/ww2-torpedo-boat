// 駆逐艦の側の固定ステップ（v0.4.4 で mission-world から切り出し。順序は v0.4.1 のまま: 艦 → 魚雷 → 体当たり → 反撃。v0.4.5 から隊（複数隻）を艦の順に）。
// 反撃は、僚艇のいる任務（v0.4.4）では自艇と僚艇の 2 目標（core/gunnery-pair。照らされていて近い方）、それ以外は v0.4.1 のまま（EnemyFire.step）。
// 発見の回数（Result の「回避」の根拠）もここで数える: どれかの ai.playerDetected が false → true になった回数。確保しない。
// 夜明けに退く（v0.6.2）: 海域を出た艦（out）は撃たず照らさない。最後の 1 隻が出たら、沈み始めたとき（torpedo-hits）と同じく残りの一斉発射を捨て、決着がついていれば走っている魚雷を外れとして確定する。
import type { BoatState } from '../core/boat-motion';
import { losBlocked } from '../core/smoke';
import type { DestroyerGroup } from './destroyer-group';
import type { MissionWorld } from './mission-world';

export function stepDestroyerSide(w: MissionWorld, g: DestroyerGroup, dt: number, feelDt: number, boat: BoatState): void {
  const c = w.setup;
  let left = false;
  for (const d of g.ships) if (d.step(dt, feelDt, boat, w.detectRangeM, w.vis.detectHoldS, w.torpedoes.states)) left = true;
  if (left && g.allOut) {
    w.launcher.clearQueue();
    if (g.allSettled) w.resolveRemainingAsMisses();
  }
  const detectedNow = g.anyDetected;
  if (detectedNow && !w.detect.prev) w.detect.count++;
  w.detect.prev = detectedNow;
  w.torpedoes.step(dt, feelDt, g.ships, g.passRadius2, w.torpedoEvents);
  if (!w.boat.sinking && g.touchesBoat(boat, c.boatHalfLengthM)) w.sinkBoat('rammed');
  const e = w.escort;
  for (let i = 0; i < g.ships.length; i++) {
    const d = g.ships[i]!;
    const fire = g.fires[i]!;
    const alive = !d.out && !w.boat.sinking;
    const detected = d.ai.playerDetected && !d.out;
    // 他の艦の光（輸送船は自分では照らせない。v0.4.7）か水上機の照明弾の下なら、自分の探照灯が無くても撃てる（1 隻の隊では自分以外がいないので v0.4.6 と同じ）
    const lit = w.flareLit || g.othersIlluminated(i);
    if (!e) {
      fire.step(dt, feelDt, d.state, boat, detected, alive, c.boatHalfLengthM, c.boatHalfBeamM, w.hiddenBySmoke, lit);
      continue;
    }
    // 僚艇（v0.4.4）: 艦と僚艇の線が煙幕に遮られていれば僚艇は照らされない。沈んだ僚艇は狙わない
    const eb = e.state.boat;
    const escortBlocked = w.smoke !== null && w.smokeParams !== null && losBlocked(w.smoke, w.smokeParams, d.state.x, d.state.y, eb.x, eb.y);
    fire.stepPair(dt, feelDt, d.state, boat, eb, !e.state.sunk, detected, alive, c.boatHalfLengthM, c.boatHalfBeamM, e.p.halfLengthM, e.p.halfBeamM, e.p.litNearLeaderM, w.hiddenBySmoke, escortBlocked, lit);
  }
}
