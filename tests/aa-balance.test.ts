// 対空のつり合い（v0.6.8。core/aa-sim。spec-v068 ★R1・§5.2）: 1 発 0.5%（停止・静音。速力帯の spread_factor で割る）で夜明けの 1 波を機銃を押し続けて受けたとき、
// 1 波の撃墜は Elco 80（us_03）の全速の直進でおよそ 0.37・止まって 0.87、T-38 の全速は 0.11（scripts/aa-sim の N 1000。hit_rate_model.json の anti_aircraft.source）。
// v0.6.8 実機 1 回目に米の艇にも弾倉（Elco 80 は 120 発・3.2 秒）: 前は 0.45・1.06。ここの N 60 は全速の直進 0.372 → 0.306・止まって 0.967 → 0.822 で、帯は変えずに収まる。
// ここは N 60（seed 1〜60）× 3 波で帯を見る（回帰の検出。帯は N 1000 の値の ± 余裕）。波は止まらず（打ち切り 0）、撃墜で波の間隔が延びることは無い（撃墜なしの周期 + 1 ステップ以内）。
import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { getLoadout } from '../src/config/loadout-data';
import { aaSimSetup, aaWaveCell, type AaSimPolicy, type AaSimSetup } from '../src/core/aa-sim';
import { strikeSimSetup } from '../src/systems/air-strike-sim-setup';

const N = 60;
const SEED0 = 1;
const WAVES = 3;

function setup(id: string): AaSimSetup {
  const lo = getLoadout(gameData, getPrototypeMission(gameData, id));
  return aaSimSetup(strikeSimSetup(gameData, id), lo.gun!, lo.aa);
}

/** 撃墜の無い波の始まりの間隔（最初の進路 + 残りの進路の間隔 + 進路 + 波の休み。us 42.3 秒） */
function period(s: AaSimSetup): number {
  const p = s.strike;
  return p.firstRunS + (p.planes * p.bombsPerPlane - 1) * p.runGapS + p.runS + p.waveRestS;
}

const CELLS: Array<{ id: string; boat: string; pol: AaSimPolicy; downs: readonly [number, number] }> = [
  { id: 'us_03', boat: 'Elco 80', pol: 'full_straight', downs: [0.25, 0.65] },
  { id: 'us_03', boat: 'Elco 80', pol: 'stop', downs: [0.7, 1.3] },
  { id: 'jp_06', boat: 'T-38', pol: 'full_straight', downs: [0, 0.18] },
];

describe('対空のつり合い（core/aa-sim、N 60 × 3 波）', () => {
  for (const c of CELLS)
    it(`${c.boat}（${c.id}）${c.pol}: 1 波の撃墜 ${c.downs[0]}〜${c.downs[1]}・打ち切り 0・波の間隔 ≤ 撃墜なしの周期 + 1 ステップ`, () => {
      const s = setup(c.id);
      const r = aaWaveCell(s, c.pol, N, SEED0, WAVES);
      expect(r.downs).toBeGreaterThanOrEqual(c.downs[0]);
      expect(r.downs).toBeLessThanOrEqual(c.downs[1]);
      expect(r.stalls).toBe(0);
      const T = period(s);
      expect(T).toBeCloseTo(42.34, 1);
      expect(r.gapMaxS).toBeLessThanOrEqual(T + s.stepS + 1e-9);
      expect(r.gapMinS).toBeGreaterThan(s.strike.waveRestS); // 早まっても波の休みより短くはならない
      // 撃てば爆弾は減る（落とした機の残りは落ちない）。撃たなければ 1 波 4 機 × 2 発
      expect(r.bombsNoAa).toBe(s.strike.planes * s.strike.bombsPerPlane);
      expect(r.bombs).toBeLessThan(r.bombsNoAa);
      expect(r.rounds).toBeGreaterThan(0);
    });

  it('全速は止まってより落とさない（速いほど散る）。T-38（弾倉 15 発）は Elco 80 より落とさない', () => {
    const e = setup('us_03');
    const t = setup('jp_06');
    const full = aaWaveCell(e, 'full_straight', N, SEED0, WAVES).downs;
    const stop = aaWaveCell(e, 'stop', N, SEED0, WAVES).downs;
    const t38 = aaWaveCell(t, 'full_straight', N, SEED0, WAVES).downs;
    expect(full).toBeLessThan(stop);
    expect(t38).toBeLessThan(full);
  });
});
