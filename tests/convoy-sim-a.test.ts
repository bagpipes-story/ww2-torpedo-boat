// 味方の大発を守る模擬の帯（v0.6.4。spec §F.4。行の分け方は tests/convoy-sim-kit の SIM_FILES）: HUD どおり（shield_full ★: 狙われた大発のそばへ寄って 25mm で撃ち返し、自艇への赤い線は全速で転舵）。
// HUD どおりで 2.3〜2.52 隻・3 隻の夜 47〜58%・自艇の沈没 6〜17%・2 隻以上 84% 以上・撃退の夜 42% 以上・撃退/夜 0.44〜0.70、撃たずに転舵するだけ（shield_dodge）より 0.15 隻以上多い（対。砲が効く）。
// 隠れる（none ★）は tests/convoy-sim-i（v0.6.4 実機 1 回目に対の相手が増えて 1 ファイル 22 秒になったので分けた）。組み立て・上書き・再現は tests/convoy-sim.test.ts。
import { describe, expect, it } from 'vitest';
import { SIM_FILES, expectSimInvariantCounts, itSimBands } from './convoy-sim-kit';

describe('味方の大発を守る模擬の帯（spec §F.4: HUD どおり）', () => {
  // 較正の表は 1 回だけ回す（1 行＋対の相手 shield_dodge、N 200 で 14〜15 秒ほど）
  const run = itSimBands('較正（N 200・seed 1〜200）: HUD どおり（shield_full ★: 寄って撃って転舵）で 2.3〜2.52 隻・3 隻の夜 47〜58%・自艇の沈没 6〜17%・2 隻以上 84% 以上・撃退/夜 0.44〜0.70・夜明け後の帰投 1〜13%（夜明け 180 秒）・転舵だけより 0.15 隻以上多い。不変', SIM_FILES.a);

  it('不変は数でも（spec §F.4）: 予告から初弾 ≥ 2.5 秒・同時に撃つ攻撃 1・射程と視程（標的から）の外 0 発・1 回の攻撃 ≤ 10 発（自艇は × 4 < 60）・大発への連射 0・打ち切り 0・夜明け後の決着 0。HUD どおりでは自艇の視程の外からの掃射 0', () => {
    expectSimInvariantCounts(run, SIM_FILES.a);
    expect(run.cell('shield_full').beyondPlayerSight).toBe(0);
    expect(run.cell('shield_full').gunShots).toBeGreaterThan(60); // 1 夜 100 発ほど撃つ
  });
});
