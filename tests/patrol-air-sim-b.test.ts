// 夜の哨戒機の模擬の回帰の帯（v0.6.7。spec-v067 §F.3・§F.4。tests/patrol-air-sim-kit）: HUD どおりの転舵の反応を決めた行（hud/0.35・hud＝0.5 秒・hud/0.7。帰投の向きへ戻す秒は 0.6〜1.4 秒の揺らぎ）。
// あわせて F11（spec C.6。転舵の反応で崖が無い）の 3 点: どれも沈没 ≤ 30%・0.05 秒あたりの差 ≤ 10 点・遅いほど当たりやすい（0.05 刻みの掃きは scripts/patrol-air-sim.ts の TABLE=3）。
import { describe, expect, it } from 'vitest';
import { PATROL_SWEEP_MAX_STEP_PTS, patrolSweepMisses } from '../src/systems/patrol-air-calibration';
import { regCell, regressionCases } from './patrol-air-sim-kit';

describe('夜の哨戒機の模擬（転舵の反応 0.35・0.5・0.7 秒）', () => {
  regressionCases(['hud/0.35', 'hud', 'hud/0.7']);
  it('F11 の 3 点（0.35 → 0.5 → 0.7 秒）: どれも ≤ 30%・0.05 秒あたりの差 ≤ 10 点、遅いほど沈みやすい', () => {
    const sunk = ['hud/0.35', 'hud', 'hud/0.7'].map((p) => regCell(p).sunkPct);
    // 3 点は 0.05 秒の 3 段・4 段ずつ離れている。隣との差の上限（10 点）は 0.05 秒の 1 段の値なので、差を段の数で割って見る
    // （v0.6.7 実機 1 回目の 1 機 3 発・4,200 m で 0.35 → 0.5 秒は 12.5 点＝1 段 4.2 点。0.05 秒刻みの掃きの最大は 5.0 点）
    const gaps = [3, 4];
    expect(sunk.flatMap((v) => patrolSweepMisses([v]))).toEqual([]);
    for (let i = 1; i < sunk.length; i++) expect(Math.abs(sunk[i]! - sunk[i - 1]!) / gaps[i - 1]!, `${i - 1} → ${i}`).toBeLessThanOrEqual(PATROL_SWEEP_MAX_STEP_PTS);
    expect(sunk[0]!).toBeLessThan(sunk[2]!);
  }, 15_000);
});
