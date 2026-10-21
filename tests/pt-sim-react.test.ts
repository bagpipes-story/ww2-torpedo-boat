// 追撃の連射への反応の表（v0.6.3 実機 2 回目。spec r2 §H.1・§H.2・§E.1）: 連射の赤い線（PT → 艇）に、撃つ PT を真後ろに入れる向きへ転舵する（away）か、同じ針路で全速 4 秒（full）か。
// 帯は無い（表に出すだけ。N 400 は scripts/pt-pass-sim の BREACT=away|full）が、不変はどの反応でも守る: 待つ PT の最接近は艇が寄るので PT_HELD_MIN_REACT_M（300 m）、ほかは既定の表と同じ。
// 連射から巡航で離れて戻るのは罠（turn_cruise × away は N 400 で 62.5% 沈む。spec r2 §J.1）、連射のたびに全速は撃たずに助かる上手な遊び方（dodge_silent × full 5.8%。§J.1 の 3）。
import { describe, expect, it } from 'vitest';
import { runPtTrial } from '../src/core/pt-pass-sim';
import type { PtBurstReact, PtPolicy } from '../src/core/pt-sim-policy';
import { PT_HELD_MIN_M, PT_HELD_MIN_REACT_M, ptInvariantMisses } from '../src/systems/pt-pass-sim-setup';
import { simRun } from './pt-sim-kit';

/** 反応ごとの行（6。away は転舵する遊び方だけが動く。full はどの遊び方も） */
const REACT_ROWS: readonly (readonly ['away' | 'full', PtPolicy])[] = [
  ['away', 'turn_cruise'], ['away', 'react_full'], ['away', 'hold_full'],
  ['full', 'cruise'], ['full', 'dodge_silent'], ['full', 'slow_shoot'],
];

describe('追撃の連射への反応の表（v0.6.3 実機 2 回目、spec r2 §H.1）', () => {
  // 較正の表は反応ごとに 1 回だけ回す（6 行、N 200 で 7 秒ほど）
  const runs = { away: simRun({ burstReact: 'away' }), full: simRun({ burstReact: 'full' }) };

  it('どの反応でも不変（spec r2 §E）を守る: 予告から初弾 ≥ open_fire_s・撃つのは同時に 1 隻・射程と視程の外から撃たない・1 回の航過 10 発・連射 6 発・1 隻の連射 6 回・連射の線 ≥ open_fire_s・交互・待つ PT は 300 m より内へ来ない', () => {
    expect([PT_HELD_MIN_REACT_M, PT_HELD_MIN_M]).toEqual([300, 350]);
    const miss: string[] = [];
    for (const [br, pol] of REACT_ROWS) {
      const run = runs[br];
      const c = run.cell(pol);
      expect([run.setup.burstReact, c.shots > 0, c.bursts > 0], `${br} ${pol}`).toEqual([br, true, true]);
      miss.push(...ptInvariantMisses(c, run.setup).map((m) => `${br} ${pol}: ${m}`));
    }
    expect(miss).toEqual([]);
  }, 60_000);

  it('反応は台本を変える: keep（既定）は連射の線で転舵も加速もしない、away は転舵する遊び方だけ、full はどの遊び方も変わる（同じ seed の夜が違う）', () => {
    const keep = simRun().setup;
    const differs = (br: PtBurstReact, pol: PtPolicy): boolean => {
      for (let seed = 1; seed <= 8; seed++) if (JSON.stringify(runPtTrial({ ...keep, burstReact: br }, pol, seed)) !== JSON.stringify(runPtTrial(keep, pol, seed))) return true;
      return false;
    };
    expect([differs('away', 'turn_cruise'), differs('full', 'cruise'), differs('away', 'cruise'), differs('keep', 'turn_cruise')]).toEqual([true, true, false, false]);
  });
});
