// jp_01 のハードの模擬の帯（v0.6.6。spec-v066 §F.5。行の分け方は tests/convoy-sim-hard-kit の HARD_FILES）: 後ろで転舵だけ（follow_dodge）・見捨てる（dash_home。短い夜）。
// 設計: 見捨てるは 3 隻とも上陸して帰投 0%・自艇の沈没 6〜15%。隼艇の沈没 ≤ 1%（転舵ばかりの夜がいちばん狙われる）。隠れる（none ★）は tests/convoy-sim-hard-e。
import { describe, expect, it } from 'vitest';
import { HARD_FILES, itHardBands } from './convoy-sim-hard-kit';

describe('jp_01 のハードの模擬の帯（spec-v066 §F.5: 転舵だけ・見捨てる）', () => {
  const run = itHardBands('較正（N 200・seed 1〜200）: 転舵だけ 3 隻とも帰投 10〜25%・沈没 ≤ 9.5%、見捨てる 0%・4.5〜15.5%（回帰の帯）。設計の行の帯・隼艇の沈没 ≤ 1%・不変', HARD_FILES.d);

  it('転舵ばかりの夜は隼艇が攻撃を引き受ける（隼艇への航過と連射が 1 夜 0.5 回より多い）。見捨てる夜は隼艇も撃たず撃たれない', () => {
    const g = run.cell('follow_dodge').gunboat!;
    expect(g.passes + g.bursts).toBeGreaterThan(0.5);
    const d = run.cell('dash_home').gunboat!;
    expect([d.shots, d.hits, d.hpLostMean]).toEqual([0, 0, 0]);
  });
});
