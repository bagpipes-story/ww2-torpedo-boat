// jp_01 のハードの模擬の帯（v0.6.6。spec-v066 §F.5。行の分け方は tests/convoy-sim-hard-kit の HARD_FILES）: 隠れる（none ★）。
// 設計: 3 隻とも上陸して帰投 ≤ 18%・自艇の沈没 8〜18%。戦わない人を隼艇は救わない（隼艇は自艇の後ろに付くので大発から遠く、撃たない）。
import { describe, expect, it } from 'vitest';
import { HARD_FILES, itHardBands } from './convoy-sim-hard-kit';

describe('jp_01 のハードの模擬の帯（spec-v066 §F.5: 隠れる）', () => {
  const run = itHardBands('較正（N 200・seed 1〜200）: 隠れる 3 隻とも帰投 7〜19%・沈没 6.5〜19.5%（回帰の帯）。設計の行の帯・隼艇の沈没 ≤ 1%・不変', HARD_FILES.e);

  it('隠れる夜に隼艇は撃たず、撃たれない', () => {
    const g = run.cell('none').gunboat!;
    expect([g.shots, g.hits, g.hpLostMean, g.passes + g.bursts]).toEqual([0, 0, 0, 0]);
  });
});
