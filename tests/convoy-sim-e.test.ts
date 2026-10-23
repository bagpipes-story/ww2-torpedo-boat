// 味方の大発を守る模擬の帯（v0.6.4。spec §F.4。行の分け方は tests/convoy-sim-kit の SIM_FILES）: 間に入るだけ（shield: 撃たず転舵せず寄る）と間に入って撃つだけ（shield_shoot: 転舵しない）。
// 組み立て・上書き・再現は tests/convoy-sim.test.ts。
import { describe, expect } from 'vitest';
import { SIM_FILES, itSimBands } from './convoy-sim-kit';

describe('味方の大発を守る模擬の帯（spec §F.4: 間に入るだけ・間に入って撃つだけ）', () => {
  // 較正の表は 1 回だけ回す（2 行、N 200 で 13〜14 秒ほど）
  itSimBands('較正（N 200・seed 1〜200）: 間に入るだけ（shield）は 38〜49% 沈む（HUD は「撃ち返せ」「転舵」と言う）。間に入って撃つだけ（shield_shoot）は 2.0〜2.4 隻・26〜37% 沈む。不変', SIM_FILES.e, (run) => {
    // 間に入ると自艇（静音 600 m）と大発（静音の帯 600 m。v0.6.4 実機 1 回目）が同じ距離で見つかり、PT に近い方が先＝最初の標的が大発の夜は 4 割ほど。
    // 撃てば閃光（1,200 m）で自艇が先に狙われ 2 割を切る。間に入って撃てば大発はほとんど沈まない
    expect(run.cell('shield').firstBargePct).toBeLessThanOrEqual(50);
    expect(run.cell('shield_shoot').firstBargePct).toBeLessThanOrEqual(25);
    expect(run.cell('shield_shoot').firstBargePct).toBeLessThan(run.cell('shield').firstBargePct);
    expect(run.cell('shield_shoot').bargesSunkMean).toBeLessThanOrEqual(0.3);
  });
});
