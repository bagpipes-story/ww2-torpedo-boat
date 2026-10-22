// T-14 の 13mm を撃つ遊び方と追撃の模擬（v0.6.3 実機 2 回目、spec r2 §H.2）: 巡航で全速の転舵（20〜44%・航過 2.5 回以上・前と反対の舷から 0.5 以上）・反応 1.4 秒で全速で線の間（★。22〜46%）と
// その撃ち返し（半分以下）、全速で逃げて 4 秒かわして撃つ（20% 以下）。対の帯の相手は同じファイルで同じ seed で回す（行の分け方は tests/pt-sim-kit の SIM_FILES）。
import { describe, expect } from 'vitest';
import { PT_GUN_SUNK_NIGHT_MAX } from '../src/systems/pt-gun-calibration';
import { PT_HELD_MIN_M } from '../src/systems/pt-pass-sim-setup';
import { SIM_FILES, itSimBands } from './pt-sim-kit';

describe('T-14 の 13mm を撃つ遊び方と追撃の模擬（v0.6.3 実機 2 回目、spec r2 §H.2: 巡航で全速の転舵・反応 1.4 秒）', () => {
  // 較正の表は 1 回だけ回す（5 行、N 200 で 13 秒ほど）
  const rows = SIM_FILES.react;
  itSimBands('較正（N 200・seed 1〜200）: 巡航で全速の転舵・反応 1.4 秒の線の間は 20〜46% 沈むが、撃ち返すと半分以下・HP 4 以上少なく。全速で逃げて撃つのは 20% 以下。不変', rows, (run) => {
    for (const pol of rows) {
      const c = run.cell(pol);
      expect([c.maxPassing, c.gunBeyond, c.timeoutPct, c.flashFirstPct, c.selfRepeats], pol).toEqual([1, 0, 0, 0, 0]); // 見つかってから撃つので閃光が最初の発見にはならない
      expect(c.heldMinM, pol).toBeGreaterThanOrEqual(PT_HELD_MIN_M);
      expect(c.ptSunkPct, pol).toBeLessThanOrEqual(PT_GUN_SUNK_NIGHT_MAX);
    }
  });
});
