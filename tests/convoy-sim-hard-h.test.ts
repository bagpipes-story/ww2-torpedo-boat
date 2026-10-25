// jp_01 のハードの模擬の帯（v0.6.6。spec-v066 §F.5。行の分け方は tests/convoy-sim-hard-kit の HARD_FILES。1 ファイル 15 秒以内のため c から分けた＝レビュー neutral:NP-2）: 寄って転舵だけ（shield_dodge。撃たない）。
// 回帰の帯だけ（設計の帯は対の帯「自艇に易しすぎない」＝scripts の TABLE=2）。隼艇の沈没 ≤ 1%。
import { describe, expect, it } from 'vitest';
import { HARD_FILES, itHardBands } from './convoy-sim-hard-kit';

describe('jp_01 のハードの模擬の帯（spec-v066 §F.5: 寄って転舵だけ）', () => {
  const run = itHardBands('較正（N 200・seed 1〜200）: 寄って転舵だけ 3 隻とも帰投 34〜45%・沈没 3〜16.5%（回帰の帯）。隼艇の沈没 ≤ 1%・不変', HARD_FILES.h);

  it('自艇が撃たなくても（shield_dodge）隼艇は大発を襲う PT を撃つ', () => {
    expect(run.cell('shield_dodge').gunShots).toBe(0);
    expect(run.cell('shield_dodge').gunboat!.shots).toBeGreaterThan(20);
  });
});
