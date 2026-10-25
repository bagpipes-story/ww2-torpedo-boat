// jp_01 のハードの模擬の帯（v0.6.6。spec-v066 §F.5。行の分け方は tests/convoy-sim-hard-kit の HARD_FILES。1 ファイル 15 秒以内のため b から分けた＝レビュー neutral:NP-2）: 撃つだけで追う型（follow_shoot）。
// 回帰の帯だけ（設計の帯は対の帯「自艇に易しすぎない」＝scripts の TABLE=2）。隼艇の沈没 ≤ 1%。
import { describe, expect, it } from 'vitest';
import { HARD_FILES, itHardBands } from './convoy-sim-hard-kit';

describe('jp_01 のハードの模擬の帯（spec-v066 §F.5: 撃つだけで追う）', () => {
  const run = itHardBands('較正（N 200・seed 1〜200）: 撃つだけで追う 3 隻とも帰投 23.5〜36%・沈没 9.5〜23%（回帰の帯）。隼艇の沈没 ≤ 1%・不変', HARD_FILES.g);

  it('転舵しない撃つだけの型でも隼艇は守りの砲を撃つ（1 夜 10 発以上）。決着の後は撃たず撃たれない', () => {
    const g = run.cell('follow_shoot').gunboat!;
    expect(g.shots).toBeGreaterThan(10);
    expect([g.postFire, g.postHits, g.beyond]).toEqual([0, 0, 0]);
  });
});
