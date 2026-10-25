// jp_01 のハードの模擬の帯（v0.6.6。spec-v066 §F.5。行の分け方は tests/convoy-sim-hard-kit の HARD_FILES）: ユーザーの型（shield_shoot: 間に入って止まり気味に撃ち、転舵しない）。撃つだけで追う型は tests/convoy-sim-hard-g。
// 設計: ユーザーの型は 3 隻とも上陸して帰投 45〜65%・自艇の沈没 32〜50%。隼艇の沈没 ≤ 1%。
import { describe, expect, it } from 'vitest';
import { HARD_FILES, itHardBands } from './convoy-sim-hard-kit';

describe('jp_01 のハードの模擬の帯（spec-v066 §F.5: ユーザーの型）', () => {
  const run = itHardBands('較正（N 200・seed 1〜200）: ユーザーの型 3 隻とも帰投 49.5〜59.5%・沈没 35〜47%（回帰の帯）。設計の行の帯・隼艇の沈没 ≤ 1%・不変', HARD_FILES.b);

  it('転舵しないユーザーの型でも隼艇は守りの砲を撃つ（1 夜 10 発以上）。決着の後は撃たず撃たれない', () => {
    for (const pol of HARD_FILES.b) {
      const g = run.cell(pol).gunboat!;
      expect(g.shots, pol).toBeGreaterThan(10);
      expect([g.postFire, g.postHits, g.beyond], pol).toEqual([0, 0, 0]);
    }
  });
});
