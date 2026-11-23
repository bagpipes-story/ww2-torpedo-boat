// 近すぎて船体の下を通過（v0.8.2 IP1。ユーザーの決め 2026-11-19「推奨通り知らせを出してください。でもメッセージは「近すぎて船体の下を通過」にしてください」）: 自艇の魚雷が
// まだ武装の前（走った距離 runM < 武装の距離 armingM＝hit_rate_model.torpedo_launch.arming_distance_m の 100 m）に狙える艦（出ていない艦＝凍結の core/torpedo-targets の scanTargets が
// 命中に数える艦）の当たりのカプセル（凍結の core/torpedo-solver の pointHitsHull＝武装していれば当たった判定そのもの）に入り、当たらずに抜けた魚雷を 1 本につき 1 回だけ数える。
// 入っただけでは数えない: カプセルの中で武装すれば凍結の torpedo-pool がそのステップに当てる（幅の広い戦艦の真横・向かってくる艦の艦首＝船体が魚雷に沿って長い）ので、
// 「武装の前に入った」魚雷は、走ったままカプセルの外へ出た時に数え、中で当たって消えたら数えない。
// systems/destroyer-step が torpedo-pool の step の直後に呼ぶ（同じ位置・同じ円）。世界（魚雷・艦・乱数）は読むだけで変えない＝再生の世界は今のまま。数は HUD の 2 行目だけが読む。
// 魚雷の枠は 1 発で使い切る（プールは撃つたびに次の枠＝作り直さない）ので、枠ごとの段は世界を作った時に 0 で、発射の時に戻す必要がない。確保は constructor だけ。
// 見るのは武装の前の魚雷と、武装の前に入ってまだ中にいる魚雷だけ（100 m の前後の短い間）。
import type { TorpedoState } from '../core/torpedo';
import type { TorpedoTarget } from '../core/torpedo-targets';
import { pointHitsHull } from '../core/torpedo-solver';

/** 枠の段: まだ・武装の前に入って中にいる・数えた（その魚雷はもう見ない） */
const UNDER_NONE = 0;
const UNDER_INSIDE = 1;
const UNDER_DONE = 2;

export class TorpedoUnder {
  private readonly stage: Uint8Array;
  /** 武装の前に船体の下を通り抜けた魚雷の数（夜の通し） */
  count = 0;

  constructor(capacity: number, private readonly armingM: number) {
    this.stage = new Uint8Array(capacity);
  }

  /** 固定ステップ（魚雷のプールの step の直後）。states はプールの枠・targets は同じステップの目標 */
  step(states: readonly TorpedoState[], targets: readonly TorpedoTarget[]): void {
    for (let i = 0; i < states.length && i < this.stage.length; i++) {
      const st = this.stage[i]!;
      if (st === UNDER_DONE) continue;
      const s = states[i]!;
      if (!s.active || s.resolved) {
        if (st === UNDER_INSIDE) this.stage[i] = UNDER_DONE; // 中で当たった（か決着した）＝数えない
        continue;
      }
      if (st === UNDER_NONE && s.runM >= this.armingM) {
        this.stage[i] = UNDER_DONE; // 武装の前に入らなかった＝もう見ない
        continue;
      }
      const inside = insideAny(s.x, s.y, targets);
      if (st === UNDER_NONE && inside) this.stage[i] = UNDER_INSIDE;
      else if (st === UNDER_INSIDE && !inside) {
        this.stage[i] = UNDER_DONE;
        this.count++;
      }
    }
  }
}

/** 出ていない艦のどれかの当たりのカプセルの中か */
function insideAny(x: number, y: number, targets: readonly TorpedoTarget[]): boolean {
  for (let k = 0; k < targets.length; k++) {
    const t = targets[k]!;
    if (!t.out && pointHitsHull(x, y, t.circles)) return true;
  }
  return false;
}
