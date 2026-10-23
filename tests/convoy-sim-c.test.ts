// 味方の大発を守る模擬の帯（v0.6.4。spec §F.4。行の分け方は tests/convoy-sim-kit の SIM_FILES）: 遠くから撃つだけ（far_shoot: 最後尾の 450 m 後ろ。対の相手 follow_shoot も同じ seed で回る）。遠くからでも逃れられない（follow_shoot − 1 以上沈む）。
// 組み立て・上書き・再現は tests/convoy-sim.test.ts。
import { describe, expect } from 'vitest';
import { SIM_FILES, itSimBands } from './convoy-sim-kit';

describe('味方の大発を守る模擬の帯（spec §F.4: 遠くから撃つだけ）', () => {
  // 較正の表は 1 回だけ回す（1 行＋相手 1 行、N 200 で 13〜14 秒ほど）
  itSimBands('較正（N 200・seed 1〜200）: 遠くから撃つだけ（far_shoot）は 1.45〜1.9 隻・自艇の沈没 26〜40% で、後ろから撃つだけ（follow_shoot）より 1 点以上少なくはならない（遠くからでも逃れられない）。不変', SIM_FILES.c, (run) => {
    // 遠いと最初の標的はほとんど大発（85〜90%）。自艇の視程の外からの掃射はほぼ無い（撃ちに寄るので 1 夜 0〜数発）
    expect(run.cell('far_shoot').firstBargePct).toBeGreaterThan(80);
    expect(run.cell('far_shoot').beyondPlayerSight).toBeLessThanOrEqual(10);
  });
});
