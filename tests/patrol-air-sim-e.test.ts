// 夜の哨戒機の模擬の回帰の帯（v0.6.7。spec-v067 §F.3・§F.4。tests/patrol-air-sim-kit）: 全速でまっすぐ（run_straight。1 発 0.40〜0.55）・投下で減速（run_slow。減速は爆弾をかわさない）・
// 出発点で夜明けまで止まる（hide_wait。夜明けの 4 機の空襲で沈む＝退化の確かめ）。N 200・seed 1。
import { describe } from 'vitest';
import { regressionCases } from './patrol-air-sim-kit';

describe('夜の哨戒機の模擬（まっすぐ・投下で減速・夜明けまで止まる）', () => {
  regressionCases(['run_straight', 'run_slow', 'hide_wait']);
});
