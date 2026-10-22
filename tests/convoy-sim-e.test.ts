// 味方の大発を守る模擬の帯（v0.6.4。spec §F.4。行の分け方は tests/convoy-sim-kit の SIM_FILES）: 間に入るだけ（shield: 撃たず転舵せず寄る＝罠）と間に入って撃つだけ（shield_shoot: 転舵しない）。
// 組み立て・上書き・再現は tests/convoy-sim.test.ts。
import { describe, expect } from 'vitest';
import { SIM_FILES, itSimBands } from './convoy-sim-kit';

describe('味方の大発を守る模擬の帯（spec §F.4: 間に入るだけ・間に入って撃つだけ）', () => {
  // 較正の表は 1 回だけ回す（2 行、N 200 で 13 秒ほど）
  itSimBands('較正（N 200・seed 1〜200）: 間に入るだけ（shield）は 85% 以上沈む（罠のまま。HUD は「撃ち返せ」「転舵」と言う）。間に入って撃つだけ（shield_shoot）は 1.9〜2.4 隻・17〜38% 沈む。不変', SIM_FILES.e, (run) => {
    // 間に入ると自艇（静音 600 m）が大発（停止の帯 480 m）より先に見つかる＝最初の標的が大発の夜は無い。間に入って撃てば大発はほとんど沈まない
    for (const pol of SIM_FILES.e) expect(run.cell(pol).firstBargePct, pol).toBe(0);
    expect(run.cell('shield_shoot').bargesSunkMean).toBeLessThanOrEqual(0.3);
  });
});
