// 近くまで待って撃つ人の型（v0.6.4 実機 1 回目のユーザー「こちらの命中率が高くて割と撃退できますね」。1 夜 60 発 27 命中＝45%・撃退 2）: 間に入って止まり気味に 200 m 以内で撃ち、転舵しない
// （shield_shoot・射撃ボタンを戦う PT が 200 m 以内のときだけ押す）。帯は src/systems/convoy-sim-setup の CONVOY_CLOSE_FIRE（25mm の命中 % と撃退/夜。N 200・seed 1）。
// 最小散布（jp_t38.gun_battery.min_spread_m 22）を外すと命中は 4 割を超える（今の地図で 55%）＝帯はこの直しが効いていることも押さえる。1 行 × 2 回（N 200 で 8 秒ほど）。
import { describe, expect, it } from 'vitest';
import { CONVOY_CLOSE_FIRE } from '../src/systems/convoy-sim-setup';
import { simRun } from './convoy-sim-kit';

describe('近くから撃つ人の型の 25mm（v0.6.4 実機 1 回目。CONVOY_CLOSE_FIRE）', () => {
  it('較正（N 200・seed 1〜200）: shield_shoot を 200 m 以内で撃つと命中 19〜25%・撃退/夜 0.5〜0.8。最小散布を外すと（gunFloorM 0）命中 40% 以上', () => {
    const { policy, fireRangeM, hitPct, retiredMean } = CONVOY_CLOSE_FIRE;
    const run = simRun({ fireRangeM });
    expect([run.setup.fireRangeM, run.setup.gun!.minSpreadM]).toEqual([200, 22]);
    const c = run.cell(policy);
    const hit = (100 * c.gunHits) / c.gunShots;
    expect(hit).toBeGreaterThanOrEqual(hitPct[0]);
    expect(hit).toBeLessThanOrEqual(hitPct[1]);
    expect(c.retiredMean).toBeGreaterThanOrEqual(retiredMean[0]);
    expect(c.retiredMean).toBeLessThanOrEqual(retiredMean[1]);
    expect(c.gunShots).toBeGreaterThan(30); // 1 夜 50 発ほど（ユーザーの夜は 60 発）
    const open = simRun({ fireRangeM, gunFloorM: 0 }).cell(policy);
    expect((100 * open.gunHits) / open.gunShots).toBeGreaterThanOrEqual(40);
  }, 60_000);
});
