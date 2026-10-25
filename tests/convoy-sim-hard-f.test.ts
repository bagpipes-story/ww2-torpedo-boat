// jp_01 のハードの模擬の帯（v0.6.6。spec-v066 §F.5。行の分け方は tests/convoy-sim-hard-kit の HARD_FILES。1 ファイル 15 秒以内のため a から分けた＝レビュー neutral:NP-2）: 追うだけ（follow_full ★: 後ろに付いて撃って転舵）。
// 設計: 3 隻とも上陸して帰投 25〜45%・自艇の沈没 ≤ 12%。隼艇の沈没 ≤ 1%。
import { describe, expect, it } from 'vitest';
import { HARD_FILES, itHardBands } from './convoy-sim-hard-kit';

describe('jp_01 のハードの模擬の帯（spec-v066 §F.5: 追うだけ）', () => {
  const run = itHardBands('較正（N 200・seed 1〜200）: 追うだけ 3 隻とも帰投 27.5〜41%・沈没 ≤ 12%（回帰の帯）。設計の行の帯・隼艇の沈没 ≤ 1%・不変', HARD_FILES.f);

  it('追うだけの夜も隼艇は撃ち、決着の後は撃たず撃たれない', () => {
    const g = run.cell('follow_full').gunboat!;
    expect(g.shots).toBeGreaterThan(10);
    expect([g.postFire, g.postHits, g.beyond]).toEqual([0, 0, 0]);
  });
});
