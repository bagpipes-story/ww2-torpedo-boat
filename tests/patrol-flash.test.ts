// v0.6.8 S3（spec-v068 §1.1 D4・§3.3・§6.1）: 夜の哨戒機の門番（core/patrol-air）に足した機銃の閃光の距離 flashM（scalar。模擬は渡さない＝0）。
// flashM 0 の 7 つ目の引数は 6 つの呼び出しと 1 ビットも違わない（3 つの帯の台本 × 10,000 ステップ・レーダーあり/なし）。
// flashM 1,200 m なら止まっていても付近の捜索（r 900 m）から見え、発見になる（閃光の距離の外は見えない）。
import { describe, expect, it } from 'vitest';
import type { SpeedStep } from '../src/core/boat-motion';
import { PA_EV_FIND, PA_ORBIT, PA_SORTIE, createPatrolAir, patrolVisible, stepPatrolAir, type PatrolParams } from '../src/core/patrol-air';
import { SeededRng } from '../src/core/rng';
import { DT, P, P_EYE } from './patrol-air-kit';

const BANDS: readonly SpeedStep[] = ['stop', 'silent', 'cruise', 'full'];
const rnd = new SeededRng(5);
const RANDOM: SpeedStep[] = [];
for (let i = 0; i < 200; i++) RANDOM.push(BANDS[Math.floor(rnd.next() * 4)]!);
const SCRIPTS: Record<string, (i: number) => SpeedStep> = {
  full: () => 'full',
  cycle: (i) => BANDS[Math.floor((i * DT) / 4) % 4]!,
  random: (i) => RANDOM[Math.floor(i * DT) % RANDOM.length]!,
};

describe('flashM 0 は今までの呼び出しと同じ', () => {
  for (const [name, gate] of [['radar', P], ['eye', P_EYE]] as Array<[string, PatrolParams]>)
    for (const [script, band] of Object.entries(SCRIPTS))
      it(`${name} × ${script}: 10,000 ステップの状態と出来事が同じ`, () => {
        const a = createPatrolAir();
        const b = createPatrolAir();
        let finds = 0;
        for (let i = 0; i < 10000; i++) {
          const done = i % 600 > 300;
          const ea = stepPatrolAir(a, gate, band(i), false, done, DT);
          const eb = stepPatrolAir(b, gate, band(i), false, done, DT, 0);
          expect(eb).toBe(ea);
          if (ea & PA_EV_FIND) finds++;
          if (i % 250 === 0) expect(b).toEqual(a);
        }
        expect(b).toEqual(a);
        expect(finds).toBeGreaterThan(0);
      });
});

describe('flashM > 0 は閃光の距離の内から見える', () => {
  it('付近の捜索（r = near_m 900 m・レーダーなし）で止まっている: 閃光なしは見えない、1,200 m なら見えて発見、800 m は届かない', () => {
    const orbit = () => {
      const s = createPatrolAir();
      s.phase = PA_ORBIT;
      s.r = P_EYE.nearM;
      s.radar = false;
      return s;
    };
    expect(patrolVisible(orbit(), P_EYE, 'stop')).toBe(false);
    expect(patrolVisible(orbit(), P_EYE, 'stop', 1200)).toBe(true);
    expect(patrolVisible(orbit(), P_EYE, 'stop', 800)).toBe(false);
    const quiet = orbit();
    expect(stepPatrolAir(quiet, P_EYE, 'stop', false, false, DT) & PA_EV_FIND).toBe(0);
    const lit = orbit();
    expect(stepPatrolAir(lit, P_EYE, 'stop', false, false, DT, 1200) & PA_EV_FIND).toBe(PA_EV_FIND);
    expect(lit.phase).toBe(PA_SORTIE);
  });
});
