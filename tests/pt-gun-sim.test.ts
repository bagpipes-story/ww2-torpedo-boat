// T-14 の 13mm を撃つ遊び方と追撃の模擬（v0.6.3 実機 1 回目・2 回目。core/pt-pass-sim・systems/pt-gun-calibration、spec r1 §G・r2 §H.2）: ゲームと同じ値と core で、帯を N 200・固定 seed で検査する。
// ここは 13mm の再現と、線の間かわし続ける（hold。巡航・全速＝HUD どおり。★ 22〜46%・14〜36%）とその撃ち返し（★ hold_shoot。半分以下）。
// 対の帯の相手は同じファイルで同じ seed で回す（行の分け方は tests/pt-sim-kit の SIM_FILES）。帯を外したら spec r2 §H.2 の順に data だけを直す（source に理由）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { runPtTrial } from '../src/core/pt-pass-sim';
import { PT_GUN_SUNK_NIGHT_MAX } from '../src/systems/pt-gun-calibration';
import { PT_HELD_MIN_M, ptSimSetup } from '../src/systems/pt-pass-sim-setup';
import { SIM_FILES, itSimBands } from './pt-sim-kit';

describe('T-14 の 13mm を撃つ遊び方と追撃の模擬（v0.6.3 実機 2 回目、spec r2 §H.2: 線の間かわし続ける）', () => {
  it('同じ seed なら同じ夜（seed+20 の 13mm も）。撃つと PT に当たり、撃たない遊び方は砲の有無で変わらない。砲の無い任務では撃つ遊び方は使えない', () => {
    const s = ptSimSetup(gameData, 'jp_05');
    const a = runPtTrial(s, 'stop_shoot', 3);
    expect(runPtTrial(s, 'stop_shoot', 3)).toEqual(a);
    expect(a.gunShots).toBeGreaterThan(0);
    expect(a.gunHits).toBeGreaterThan(0);
    expect(runPtTrial({ ...s, gun: null }, 'turn_silent', 5)).toEqual(runPtTrial(s, 'turn_silent', 5));
    expect(() => runPtTrial({ ...s, gun: null }, 'turn_shoot', 1)).toThrow(/砲/);
  });

  // 較正の表は 1 回だけ回す（4 行、N 200 で 12 秒ほど）
  const rows = SIM_FILES.hold;
  const run = itSimBands('較正（N 200・seed 1〜200）: 線の間かわし続けても 14〜46% 沈む（HUD どおりの全速が軽い）が、撃ち返すと半分以下・HP 4 以上少なく。不変', rows, (r) => {
    expect(r.cell('hold_full').sunkPct).toBeLessThan(r.cell('hold_cruise').sunkPct); // 「全速で転舵」の HUD どおりが巡航より沈みにくい（spec r2 §F.1）
  });

  it('不変（spec r1 §G.5・r2 §E）は数でも: 予告から初弾は open_fire_s 以上・撃つのは同時に 1 隻・PT は視程と有効射程の外から撃たない・13mm も視程と射程の外へ撃たない・待つ PT は 350 m より内へ来ない・交互・撃沈の夜は 16% 以下。制圧は追撃の PT にだけ', () => {
    const p = run.setup.pt;
    for (const pol of rows) {
      const c = run.cell(pol);
      expect(c.minWarnS, pol).toBeGreaterThanOrEqual(p.openFireS - 1e-9);
      expect([c.maxPassing, c.beyondEff, c.beyondSight, c.gunBeyond, c.timeoutPct, c.selfRepeats], pol).toEqual([1, 0, 0, 0, 0, 0]);
      expect(c.heldMinM, pol).toBeGreaterThanOrEqual(PT_HELD_MIN_M);
      expect(c.ptSunkPct, pol).toBeLessThanOrEqual(PT_GUN_SUNK_NIGHT_MAX);
      // 見つかってから撃つ遊び方は閃光が最初の発見にならない（閃光で先に見つかるのは暗さに隠れて撃つ dark_shoot だけ）。撃たない遊び方は制圧しない
      expect(c.flashFirstPct, pol).toBe(0);
      if (c.gunShots === 0) expect([c.suppressions, c.retiredPct], pol).toEqual([0, 0]);
    }
    expect(p.retreatHp).toBeLessThan(p.hullHp); // HP だけでは沈まない（F11。沈むのは引火だけ＝core/pt-damage の作り。数えても外れようがないので模擬では数えない＝レビュー R4）
  });
});
