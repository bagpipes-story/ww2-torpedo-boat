// 味方の大発を守る模擬の帯（v0.6.4。spec §F.4。行の分け方は tests/convoy-sim-kit の SIM_FILES）: 隠れる（none ★）と HUD どおり（shield_full ★: 狙われた大発のそばへ寄って 25mm で撃ち返し、自艇への赤い線は全速で転舵）。
// 隠れると 0.7〜1.1 隻しか届かず（守らなければ約 2 隻沈む）、決着が早いので夜明けの前に帰り道へ出て 30〜43% 沈む（v0.6.4 実機 1 回目の浜。前は夜明けの後の空襲）。
// HUD どおりで 2.3〜2.52 隻・3 隻の夜 47〜58%・自艇の沈没 6〜17%・2 隻以上 84% 以上・撃退の夜 42% 以上・撃退/夜 0.44〜0.70、撃たずに転舵するだけ（shield_dodge）より 0.15 隻以上多い（対）。
// 組み立て・上書き・再現は tests/convoy-sim.test.ts。
import { describe, expect, it } from 'vitest';
import { SIM_FILES, itSimBands } from './convoy-sim-kit';

describe('味方の大発を守る模擬の帯（spec §F.4: 隠れる・HUD どおり）', () => {
  // 較正の表は 1 回だけ回す（2 行＋対の相手 shield_dodge、N 200 で 20 秒ほど）
  const run = itSimBands('較正（N 200・seed 1〜200）: 隠れる（none ★）と 0.7〜1.1 隻しか届かず 30〜43% 沈む（帰り道）、HUD どおり（shield_full ★: 寄って撃って転舵）で 2.3〜2.52 隻・3 隻の夜 47〜58%・自艇の沈没 6〜17%・2 隻以上 84% 以上・撃退/夜 0.44〜0.70・転舵だけより 0.15 隻以上多い。不変', SIM_FILES.a);

  it('不変は数でも（spec §F.4）: 予告から初弾 ≥ 2.5 秒・同時に撃つ攻撃 1・射程と視程（標的から）の外 0 発・1 回の攻撃 ≤ 10 発（自艇は × 4 < 60）・大発への連射 0・打ち切り 0・夜明け後の決着 0。隠れると自艇の視程の外からの掃射（遠くの大発へ）、HUD どおりでは 0', () => {
    const p = run.setup.pt;
    for (const pol of SIM_FILES.a) {
      const c = run.cell(pol);
      expect(c.minWarnS, pol).toBeGreaterThanOrEqual(p.openFireS - 1e-9);
      expect([c.maxPassing, c.beyond, c.burstsBarge, c.timeoutPct, c.resolvedAfterDawnPct], pol).toEqual([1, 0, 0, 0, 0]);
      expect([c.worstBarge <= p.roundsPerPass, c.worstPlayer <= p.roundsPerPass, c.worstPlayer * p.hit.damage < run.setup.damage.maxHp], pol).toEqual([true, true, true]);
      expect(c.detectedPct, pol).toBeGreaterThan(95); // 船団は見つかる（大発は隠せない）
    }
    expect(run.cell('none').beyondPlayerSight).toBeGreaterThan(1000); // 見捨てた艇が見る遠くの掃射（1 夜 約 30 発）
    expect(run.cell('shield_full').beyondPlayerSight).toBe(0);
    expect(run.cell('none').firstBargePct).toBeGreaterThan(80); // 隠れていれば最初の標的はほとんど大発（85〜90%）
    expect(run.cell('shield_full').gunShots).toBeGreaterThan(60); // 1 夜 100 発ほど撃つ
  });
});
