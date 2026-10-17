import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { simBearings, simulateBands, simulateShot } from '../src/core/hit-rate-sim';
import { SeededRng } from '../src/core/rng';
import { hitRateSimSetup, runHitRateSim } from '../src/systems/hit-rate-sim-setup';

describe('命中率 KPI の模擬（v0.5.0。core/hit-rate-sim）', () => {
  it('避けない艦（雷跡が見えない）には、正しい見越し角の 1 本が 13 方位すべてで当たり、20° ずれれば外れる。同じ seed なら同じ結果', () => {
    const s = hitRateSimSetup(gameData);
    const blind = { ...s, ai: { ...s.ai, torpedoWakeDetectM: 0 } };
    for (const b of simBearings(15)) {
      expect(simulateShot(blind, 730, b, 0, new SeededRng(1)), `方位 ${b}`).toBe(true);
      expect(simulateShot(blind, 730, b, 20, new SeededRng(1)), `方位 ${b}`).toBe(false);
    }
    const a = runHitRateSim(gameData, s, 2);
    const b = runHitRateSim(gameData, s, 2);
    expect(a).toEqual(b);
  });
  it('較正（data の回避・当たり判定 x2 と、戻した x1 の両方）: 距離で下がる。1200yd 以遠は目標帯から 3 点以内、400-1200yd は 10 点以内、≤400yd は回避では下がらない（目標の下限以上）', () => {
    for (const k of [gameData.hitRateModel.world.ship_hit_scale, 1]) {
      const res = runHitRateSim(gameData, hitRateSimSetup(gameData, { shipHitScale: k }));
      const pts = res.map((r) => Math.round(r.rate * 100));
      for (let i = 1; i < res.length; i++) expect(res[i]!.rate, `x${k} ${pts.join('/')}`).toBeLessThan(res[i - 1]!.rate);
      res.forEach((r, i) => {
        const msg = `x${k} ${r.band} ${pts[i]}%（目標 ${r.targetMin * 100}〜${r.targetMax * 100}%）`;
        expect(r.shots, msg).toBeGreaterThan(300);
        if (i === 0) {
          expect(r.rate, msg).toBeGreaterThanOrEqual(r.targetMin);
          return;
        }
        const tol = r.targetMin >= 0.3 ? 0.1 : 0.03;
        expect(r.rate, msg).toBeGreaterThanOrEqual(r.targetMin - tol);
        expect(r.rate, msg).toBeLessThanOrEqual(r.targetMax + tol);
      });
    }
  });
  it('800yd（732 m）前後の正しく狙った 1 本は 35〜45%（CLAUDE.md §2 の「正しく狙った 1 本が 35〜45%」。x1 に戻しても 5 点以内）', () => {
    const near800yd = [{ band: '800yd', target_hit_min: 0.35, target_hit_max: 0.45, sim_ranges_m: [700, 730, 760] }];
    const [x2] = simulateBands(hitRateSimSetup(gameData), near800yd, simBearings(15), [-2, 0, 2], 8, 5);
    const [x1] = simulateBands(hitRateSimSetup(gameData, { shipHitScale: 1 }), near800yd, simBearings(15), [-2, 0, 2], 8, 5);
    expect(x2!.rate).toBeGreaterThanOrEqual(0.35);
    expect(x2!.rate).toBeLessThanOrEqual(0.45);
    expect(x1!.rate).toBeGreaterThanOrEqual(0.3);
    expect(x1!.rate).toBeLessThanOrEqual(0.5);
  });
});
