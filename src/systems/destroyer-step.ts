// 駆逐艦の側の固定ステップ（v0.4.4 で mission-world から切り出し。順序は v0.4.1 のまま: 艦 → 魚雷 → 体当たり → 反撃。v0.4.5 から隊（複数隻）を艦の順に）。
// 反撃は、僚艇のいる任務（v0.4.4）では自艇と僚艇の 2 目標（core/gunnery-pair。照らされていて近い方）、それ以外は v0.4.1 のまま（EnemyFire.step）。
// 発見の回数（Result の「回避」の根拠）もここで数える: どれかの ai.playerDetected が false → true になった回数。確保しない。
// 夜明けに退く（v0.6.2）: 海域を出た艦（out）は撃たず照らさない。最後の 1 隻が出たら、沈み始めたとき（torpedo-hits）と同じく残りの一斉発射を捨てる。
// 走っている魚雷の外れの確定（v0.6.2 実機 1 回目からここだけ）: すべて出て、沈む船体の終わり際の当たりの窓（演出の終わりと沈み始めて torpedo_end_settle_s の遅い方。
// core/torpedo-targets）が閉じたステップから。それまで沈む船体へ当たった魚雷は命中に数える（記録だけ）。沈んだ艦が無ければ退き終えたステップで（v0.6.2 と同じ）。
// 列の通過（v0.8.0 S2。us_04）: 艦を動かした直後に段階を進める（systems/destroyer-transit。現れる艦はこのステップの魚雷・体当たり・反撃から海域の中）。
// 走っている魚雷の外れの確定は戻りの残り（ビラの艦）が 0 の時だけ（R2）。列の無い任務は transit が null・戻りの残りは 0（v0.7.2 と同じ）。
// 暗い岸を背にと止まった艦（v0.8.1 S2。us_06）: 艦ごとの見つける距離は隊の backdrop（systems/shore-backdrop）があればその艦の値、無ければ世界の 1 つの値そのもの（今のまま）。
// 止まった艦の段（systems/destroyer-anchor）は艦を動かし列の段階を当てた直後（動き出した艦は次のステップから動く）。無い任務は anchors が null で何もしない。
// 列の見張り（v0.8.2 S2。us_05）: 列の段階の直後・止まった艦の前に隊の roles（systems/column-roles）。見張りのいない任務は null で何もしない。
import type { BoatState } from '../core/boat-motion';
import { losBlocked } from '../core/smoke';
import { remainingTorpedoesSettled } from '../core/torpedo-targets';
import type { DestroyerGroup } from './destroyer-group';
import type { MissionWorld } from './mission-world';

export function stepDestroyerSide(w: MissionWorld, g: DestroyerGroup, dt: number, feelDt: number, boat: BoatState): void {
  const c = w.setup;
  let left = false;
  const bd = g.backdrop;
  for (let i = 0; i < g.ships.length; i++) {
    const d = g.ships[i]!;
    if (d.step(dt, feelDt, boat, bd ? bd.rangeFor(i, d.state, boat, w) : w.detectRangeM, w.vis.detectHoldS, w.torpedoes.states)) left = true;
  }
  if (g.transit?.step(w, feelDt)) left = true;
  g.roles?.step(w, feelDt); // 列の見張り（v0.8.2 S2。us_05 の時雨）: 列の段階の直後に離れる・戻る（AI の物を替えるのは次のステップから効く。無い任務は null）
  g.anchors?.step(w, feelDt);
  if (left && g.allOut) w.launcher.clearQueue();
  const settleS = w.returnPoint.torpedoEndSettleS;
  if (g.pendingReturns === 0 && remainingTorpedoesSettled(g.ships, w.stepTimeS, settleS)) w.resolveRemainingAsMisses();
  const detectedNow = g.anyDetected;
  if (detectedNow && !w.detect.prev) w.detect.count++;
  w.detect.prev = detectedNow;
  w.torpedoes.step(dt, feelDt, g.ships, g.passRadius2, w.torpedoEvents, w.stepTimeS, settleS);
  if (!w.boat.sinking && g.touchesBoat(boat, c.boatHalfLengthM)) w.sinkBoat('rammed');
  const e = w.escort;
  for (let i = 0; i < g.ships.length; i++) {
    const d = g.ships[i]!;
    const fire = g.fires[i]!;
    const alive = !d.out && !w.boat.sinking;
    const detected = d.ai.playerDetected && !d.out;
    // 他の艦の光（輸送船は自分では照らせない。v0.4.7）か水上機の照明弾の下なら、自分の探照灯が無くても撃てる（1 隻の隊では自分以外がいないので v0.4.6 と同じ）。
    // 他の艦の光はその艦が自分で点けた光だけ（v0.7.0 IP4: illuminated を読むと 2 隻が互いを照らし続け、灯りが消えて見失っても撃ち続けた）
    const lit = w.flareLit || g.othersOwnLit(i);
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
