// 味方の大発を守る模擬の帯（v0.6.4。spec §F.4。行の分け方は tests/convoy-sim-kit の SIM_FILES）: 後ろに付いて撃って転舵（follow_full ★。HUD の教える遊び方の副）と後ろから撃つだけ（follow_shoot ★。転舵しない）。
// 撃って転舵すると 2.0〜2.4 隻・3 隻の夜 29〜44%・自艇の沈没 3〜18%、撃つだけだと 1.85〜2.2 隻で 18〜31% 沈む（転舵の効きが正: follow_full より 8 点以上。同じ seed）。
// 組み立て・上書き・再現は tests/convoy-sim.test.ts。
import { describe, expect } from 'vitest';
import { SIM_FILES, itSimBands } from './convoy-sim-kit';

describe('味方の大発を守る模擬の帯（spec §F.4: 付いて撃って転舵・撃つだけ）', () => {
  // 較正の表は 1 回だけ回す（2 行、N 200 で 16 秒ほど）
  itSimBands('較正（N 200・seed 1〜200）: 後ろに付いて撃って転舵（follow_full ★）は 2.0〜2.4 隻・3 隻の夜 29〜44%・自艇の沈没 3〜18%・夜明け後の帰投 13〜26%（夜明け 180 秒。200 秒では 6% 以下）。後ろから撃つだけ（follow_shoot ★）は 18〜31% 沈み、転舵より 8 点以上多い（対）。不変', SIM_FILES.b, (run) => {
    // 転舵する艇は追われて連射を受ける（逃げる艇 ≥ 10 kt。1 夜 1.8〜2.0 回）、転舵しない艇はほぼ航過だけ（決着の後の帰り道の巡航で追われる分が 1 夜 0.5〜0.6 回）。どちらも 25mm を 1 夜 60 発より多く撃つ
    expect(run.cell('follow_full').bursts).toBeGreaterThan(1.4);
    expect(run.cell('follow_shoot').bursts).toBeLessThan(0.8);
    for (const pol of SIM_FILES.b) expect(run.cell(pol).gunShots, pol).toBeGreaterThan(60);
  });
});
