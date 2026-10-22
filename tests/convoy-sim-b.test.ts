// 味方の大発を守る模擬の帯（v0.6.4。spec §F.4。行の分け方は tests/convoy-sim-kit の SIM_FILES）: 後ろに付いて撃って転舵（follow_full ★。HUD の教える遊び方の副）と後ろから撃つだけ（follow_shoot ★。転舵しない）。
// 撃って転舵すると 2.3〜2.6 隻・3 隻の夜 50〜65%・自艇の沈没 7〜19%、撃つだけだと 1.9〜2.3 隻で 19〜30% 沈む（転舵の効きが正: follow_full より 8 点以上。同じ seed）。
// 組み立て・上書き・再現は tests/convoy-sim.test.ts。
import { describe, expect } from 'vitest';
import { SIM_FILES, itSimBands } from './convoy-sim-kit';

describe('味方の大発を守る模擬の帯（spec §F.4: 付いて撃って転舵・撃つだけ）', () => {
  // 較正の表は 1 回だけ回す（2 行、N 200 で 13 秒ほど）
  itSimBands('較正（N 200・seed 1〜200）: 後ろに付いて撃って転舵（follow_full ★）は 2.3〜2.6 隻・3 隻の夜 50〜65%・自艇の沈没 7〜19%・夜明け後の帰投 25% 以下。後ろから撃つだけ（follow_shoot ★）は 19〜30% 沈み、転舵より 8 点以上多い（対）。不変', SIM_FILES.b, (run) => {
    // 転舵する艇は追われて連射を受ける（逃げる艇 ≥ 10 kt）、転舵しない艇は航過だけ。どちらも 25mm を 1 夜 60 発より多く撃つ
    expect(run.cell('follow_full').bursts).toBeGreaterThan(1);
    expect(run.cell('follow_shoot').bursts).toBeLessThan(0.5);
    for (const pol of SIM_FILES.b) expect(run.cell(pol).gunShots, pol).toBeGreaterThan(60);
  });
});
