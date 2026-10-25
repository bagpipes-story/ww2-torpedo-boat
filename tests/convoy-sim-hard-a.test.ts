// jp_01 のハードの模擬の帯（v0.6.6。spec-v066 §F.5。行の分け方は tests/convoy-sim-hard-kit の HARD_FILES）: HUD どおり（shield_full ★: 寄って撃って転舵）と追うだけ（follow_full ★: 後ろに付いて撃って転舵）。
// 設計: HUD どおりは 3 隻とも上陸して帰投 50〜70%・自艇の沈没 4〜15%、追うだけは 25〜45%・≤ 12%。隼艇の沈没 ≤ 1%。HUD どおりでは隼艇が自艇の視程（900 m）の外で撃たない。
import { describe, expect, it } from 'vitest';
import { HARD_FILES, itHardBands } from './convoy-sim-hard-kit';

describe('jp_01 のハードの模擬の帯（spec-v066 §F.5: HUD どおり・追うだけ）', () => {
  const run = itHardBands('較正（N 200・seed 1〜200）: HUD どおり 3 隻とも帰投 53〜64.5%・沈没 4.5〜14%、追うだけ 27.5〜41%・≤ 12%（回帰の帯）。設計の行の帯・隼艇の沈没 ≤ 1%・不変', HARD_FILES.a);

  it('隼艇は撃ち、狙われ、ほとんど沈まない（HUD どおり）: 1 夜 20 発以上・命中あり・隼艇への攻撃あり・失う HP は 1 夜 1 発ほど・決着の後は撃たず撃たれない・自艇の視程の外で撃たない', () => {
    const g = run.cell('shield_full').gunboat!;
    expect(g.shots).toBeGreaterThan(20);
    expect(g.hits).toBeGreaterThan(3);
    expect(g.passes + g.bursts).toBeGreaterThan(0.2);
    expect(g.hpLostMean).toBeLessThan(8);
    expect([g.postFire, g.postHits, g.beyond, g.beyondPlayer]).toEqual([0, 0, 0, 0]);
    expect(g.offPct).toBeLessThan(5); // W7: 決着の前に自艇から 480 m の外にいた秒は 1% ほど
    expect(run.cell('shield_full').burstsBarge).toBe(0); // 隼艇への連射は大発への連射に数えない
  });
});
