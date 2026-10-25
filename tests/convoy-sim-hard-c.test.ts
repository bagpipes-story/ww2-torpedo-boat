// jp_01 のハードの模擬の帯（v0.6.6。spec-v066 §F.5。行の分け方は tests/convoy-sim-hard-kit の HARD_FILES）: 遠くから撃って転舵（far_full）。寄って転舵だけ（shield_dodge）は tests/convoy-sim-hard-h。
// 回帰の帯だけ（設計の帯は対の帯「自艇に易しすぎない」＝scripts の TABLE=2）。隼艇の沈没 ≤ 1%。
import { describe, expect, it } from 'vitest';
import { HARD_FILES, itHardBands } from './convoy-sim-hard-kit';

describe('jp_01 のハードの模擬の帯（spec-v066 §F.5: 遠くから）', () => {
  const run = itHardBands('較正（N 200・seed 1〜200）: 遠くから 3 隻とも帰投 16〜32%・沈没 4〜17.5%（回帰の帯）。隼艇の沈没 ≤ 1%・不変', HARD_FILES.c);

  it('遠くから撃つ夜も隼艇は守りの砲を撃ち、決着の後は撃たず撃たれない', () => {
    const g = run.cell('far_full').gunboat!;
    expect(g.shots).toBeGreaterThan(10);
    expect([g.postFire, g.postHits, g.beyond]).toEqual([0, 0, 0]);
  });
});
