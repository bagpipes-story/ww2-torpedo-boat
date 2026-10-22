// 米PT の掃射の航過と追撃の模擬（v0.6.3 実機 2 回目、spec r2 §H.2）の暗さ・14 kt の行（行の分け方は tests/pt-sim-kit の SIM_FILES）: 暗さに隠れる（★。発見 25〜55%・5〜25% 沈む・
// 夜明け前の帰投 70% 以上）と隠れて見えたらいつも撃つ（★。0〜4%・最初が閃光の夜 8〜35%・発見は ± 5 点）、HUD の教える 14 kt＋撃つ（★ slow_shoot。0〜10%・撃退の夜 70% 以上・
// 1 夜 2.5 回以上制圧）、ずっと全速で線の間かわす（4〜24%）。
import { describe, expect } from 'vitest';
import { SIM_FILES, itSimBands } from './pt-sim-kit';

describe('米PT の掃射の航過と追撃の模擬（v0.6.3 実機 2 回目、spec r2 §H.2: 暗さ・14 kt＋撃つ）', () => {
  // 較正の表は 1 回だけ回す（4 行、N 200 で 12 秒ほど）
  itSimBands('較正（N 200・seed 1〜200）: 暗さに隠れるのは効き、隠れて撃っても発見は増えない。14 kt＋撃つ（HUD の遊び方）は撃たない遊び方よりはっきり楽（10% 以下）で追撃の PT を制圧する。不変', SIM_FILES.dark, (run) => {
    // 14 kt＋撃つ: 制圧は撃つ遊び方だけ・追撃の PT にだけ（撃たない遊び方は 0）
    expect([run.cell('slow_shoot').suppressions > 2.5, run.cell('dark_stop').suppressions, run.cell('flee_hold').suppressions]).toEqual([true, 0, 0]);
  });
});
