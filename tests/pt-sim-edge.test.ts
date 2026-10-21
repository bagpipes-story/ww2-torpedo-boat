// 米PT の掃射の航過と追撃の模擬（v0.6.3 実機 2 回目、spec r2 §H.2）の極端な遊び方（行の分け方は tests/pt-sim-kit の SIM_FILES）: 夜明けまで止まる（見つからない）・
// 縁へ逃げる（v0.6.3 レビュー: 抜け道にならない。床なしの罠）・静音で舷側を向けて撃ち合う（fight。0〜6%・帰投 95% 以上）。
import { describe, expect } from 'vitest';
import { SIM_FILES, itSimBands } from './pt-sim-kit';

describe('米PT の掃射の航過と追撃の模擬（v0.6.3 実機 2 回目、spec r2 §H.2: 夜明けまで止まる・縁へ逃げる・撃ち合う）', () => {
  // 較正の表は 1 回だけ回す（3 行、N 200 で 14 秒ほど）
  itSimBands('較正（N 200・seed 1〜200）: 夜明けまで止まれば見つからずに夜明け後に帰る、縁へ逃げるのは罠（HP 40 以上を失う）、撃ち合うと 6% 以下。漂流の帯・不変', SIM_FILES.edge, (run) => {
    const still = run.cell('stop_dawn');
    expect([still.shots, still.passes, still.bursts, still.maxPassing]).toEqual([0, 0, 0, 0]); // 見つからなければ撃たれない
    // 縁へ逃げる（v0.6.3 レビュー）: 縁で航過が撃たずに終わる抜け道は無い（1 夜 4 発以上当たり、撃ち合うよりずっと痛い）
    const edge = run.cell('edge_flee');
    expect(edge.hits).toBeGreaterThan(4);
    expect(edge.hpMean).toBeGreaterThan(run.cell('fight').hpMean + 20);
  });
});
