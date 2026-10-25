// 夜の哨戒機の模擬の回帰の帯（v0.6.7。spec-v067 §F.3・§F.4。tests/patrol-air-sim-kit）: 秒読みに 2 秒遅れて止める（hud@2.0~。目の発見 ≥ 0.6/夜）・逃げるだけ（run~。回避 0）・
// 着弾点の輪から離れる側へ全速で切る理想（run_ring。1 発の命中 ≤ 0.02＝F5）。N 200・seed 1。
import { describe } from 'vitest';
import { regressionCases } from './patrol-air-sim-kit';

describe('夜の哨戒機の模擬（遅れて止める・逃げるだけ・理想の転舵）', () => {
  regressionCases(['hud@2.0~', 'run~', 'run_ring']);
});
