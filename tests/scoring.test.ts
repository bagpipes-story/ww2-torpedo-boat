import { describe, expect, it } from 'vitest';
import hitRateModel from '../data/hit_rate_model.json';
import scoring from '../data/scoring.json';
import { computeScore, isScoringDataRecord, scoringParamsFromData, type ScoreInput } from '../src/core/scoring';

const KPI = hitRateModel.kpi_by_range.map((b) => b.band);
if (!isScoringDataRecord(scoring)) throw new Error('scoring data');
const P = scoringParamsFromData(scoring, KPI);

function input(over: Partial<ScoreInput>): ScoreInput {
  return { returned: false, objectiveDone: false, missionType: 'intercept_destroyer', bands: [], fuelLeftPct: 0, ...over };
}

describe('スコア（docs/02 §6.9）', () => {
  it('data: 帰投 500・撃沈 300・命中 100 × 倍率（≤400yd 1.0 … ≥2000yd 3.0）・燃料 最大 100', () => {
    expect(P.returnedPoints).toBe(500);
    expect(P.objectiveByType['intercept_destroyer']).toBe(300);
    expect(P.hitBase).toBe(100);
    expect(P.hitRangeMultiplier['<=400yd']).toBe(1.0);
    expect(P.hitRangeMultiplier['>=2000yd']).toBe(3.0);
    expect(P.fuelMax).toBe(100);
    expect(P.fuelRequiresReturnedAndObjective).toBe(true);
    // "source" のような文字列の値は達成点に入らない
    expect(Object.values(P.objectiveByType).every((v) => typeof v === 'number')).toBe(true);
  });
  it('計算例: 慎重に撃沈して帰投（800-1200yd 命中、燃料 37%）= 987、全速で撃沈して帰投（400-800yd、8%）= 928、外して帰投 = 500、撃沈して漂流 = 420、撃沈して沈没（≤400yd）= 400', () => {
    expect(computeScore(input({ returned: true, objectiveDone: true, bands: [{ band: '800-1200yd', hits: 1, duds: 0 }], fuelLeftPct: 37 }), P).total).toBe(987);
    expect(computeScore(input({ returned: true, objectiveDone: true, bands: [{ band: '400-800yd', hits: 1, duds: 0 }], fuelLeftPct: 8 }), P).total).toBe(928);
    expect(computeScore(input({ returned: true, fuelLeftPct: 60 }), P)).toEqual({ survival: 500, objective: 0, hits: 0, fuel: 0, total: 500 });
    expect(computeScore(input({ objectiveDone: true, bands: [{ band: '400-800yd', hits: 1, duds: 0 }], fuelLeftPct: 0 }), P).total).toBe(420);
    expect(computeScore(input({ objectiveDone: true, bands: [{ band: '<=400yd', hits: 1, duds: 0 }], fuelLeftPct: 50 }), P).total).toBe(400);
  });
  it('不発は数えない。複数命中は本数ぶん。帯ごとの倍率は四捨五入した点', () => {
    const s = computeScore(input({ bands: [{ band: '400-800yd', hits: 3, duds: 1 }, { band: '>=2000yd', hits: 1, duds: 0 }] }), P);
    expect(s.hits).toBe(2 * 120 + 300);
    expect(computeScore(input({ bands: [{ band: '400-800yd', hits: 1, duds: 1 }] }), P).hits).toBe(0);
  });
  it('燃料点は帰投かつ任務達成のときだけ。0〜100 に収める。知らない任務 type は達成点 0', () => {
    expect(computeScore(input({ returned: true, objectiveDone: true, fuelLeftPct: 150 }), P).fuel).toBe(100);
    expect(computeScore(input({ returned: true, objectiveDone: false, fuelLeftPct: 80 }), P).fuel).toBe(0);
    expect(computeScore(input({ returned: false, objectiveDone: true, fuelLeftPct: 80 }), P).fuel).toBe(0);
    expect(computeScore(input({ returned: true, objectiveDone: true, missionType: 'unknown', fuelLeftPct: 10 }), P).objective).toBe(0);
    const loose = { ...P, fuelRequiresReturnedAndObjective: false };
    expect(computeScore(input({ returned: true, objectiveDone: false, fuelLeftPct: 80 }), loose).fuel).toBe(80);
  });
  it('順序: 慎重な撃沈 > 捨て身の撃沈 > 外して帰投 = 直帰 > 沈めて死ぬ', () => {
    const careful = computeScore(input({ returned: true, objectiveDone: true, bands: [{ band: '800-1200yd', hits: 1, duds: 0 }], fuelLeftPct: 37 }), P).total;
    const reckless = computeScore(input({ returned: true, objectiveDone: true, bands: [{ band: '<=400yd', hits: 1, duds: 0 }], fuelLeftPct: 8 }), P).total;
    const missed = computeScore(input({ returned: true, fuelLeftPct: 40 }), P).total;
    const direct = computeScore(input({ returned: true, fuelLeftPct: 63 }), P).total;
    const died = computeScore(input({ objectiveDone: true, bands: [{ band: '<=400yd', hits: 1, duds: 0 }] }), P).total;
    expect(careful).toBeGreaterThan(reckless);
    expect(reckless).toBeGreaterThan(missed);
    expect(missed).toBe(direct);
    expect(direct).toBeGreaterThan(died);
  });
  it('data ガード: 帯の欠け・型の崩れ', () => {
    expect(isScoringDataRecord({})).toBe(false);
    expect(() => scoringParamsFromData(scoring, [...KPI, 'nope'])).toThrow();
    const bad = JSON.parse(JSON.stringify(scoring)) as Record<string, unknown>;
    (bad['hit'] as Record<string, unknown>)['range_multiplier'] = { '<=400yd': -1 };
    expect(isScoringDataRecord(bad)).toBe(false);
  });
});
