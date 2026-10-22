// 米PT の掃射の航過と追撃の模擬（v0.6.3 実機 2 回目、spec r2 §H.2）の遅い反応の行（行の分け方は tests/pt-sim-kit の SIM_FILES）: 2 秒遅れの巡航の転舵（★。32〜58%）・
// 2 秒遅れで全速で線の間（28〜52%）とその撃ち返し（0.65 倍 + 2 以下）、全速で逃げて撃つ（散る。25% 以下の帯だけ）。
import { describe, expect } from 'vitest';
import { SIM_FILES, itSimBands } from './pt-sim-kit';

describe('米PT の掃射の航過と追撃の模擬（v0.6.3 実機 2 回目、spec r2 §H.2: 遅い反応・全速で逃げて撃つ）', () => {
  // 較正の表は 1 回だけ回す（5 行、N 200 で 11 秒ほど）
  itSimBands('較正（N 200・seed 1〜200）: 2 秒遅れの反応は 28〜58% 沈むが撃てば 0.65 倍 + 2 以下・HP 4 以上少なく、全速で逃げて撃つのは 25% 以下。不変', SIM_FILES.late, (run) => {
    // 全速で逃げて撃つと散る（spread_factor）: 巡航で撃つ late_shoot より 1 夜の命中も追い払う夜も半分より少ない（HUD が「14 kt 以下で」と教える）
    const [flee, late] = [run.cell('flee_shoot'), run.cell('late_shoot')];
    expect([flee.gunHits < 0.5 * late.gunHits, flee.retiredPct < 0.5 * late.retiredPct]).toEqual([true, true]);
  });
});
