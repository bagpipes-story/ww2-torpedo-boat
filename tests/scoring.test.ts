import { describe, expect, it } from 'vitest';
import hitRateModel from '../data/hit_rate_model.json';
import scoring from '../data/scoring.json';
import { computeScore, isScoringDataRecord, scoringParamsFromData, type ScoreInput } from '../src/core/scoring';

const KPI = hitRateModel.kpi_by_range.map((b) => b.band);
if (!isScoringDataRecord(scoring)) throw new Error('scoring data');
const P = scoringParamsFromData(scoring, KPI);

function input(over: Partial<ScoreInput>): ScoreInput {
  return { returned: false, objectiveDone: false, missionType: 'intercept_destroyer', bands: [], kills: 0, killEnemyId: '', fuelLeftPct: 0, crewAlive: 0, crewTotal: 0, ...over };
}

describe('スコア（docs/02 §6.9）', () => {
  it('data: 帰投 700・撃沈 300・命中 100 × 倍率（≤400yd 1.0 … ≥2000yd 3.0）・燃料 最大 100。帰投は撃沈＋最遠の命中（600）より大きい', () => {
    expect(P.returnedPoints).toBe(700);
    expect(P.crewHalfRatio).toBe(0.5);
    expect(P.crewHalfFactor).toBe(0.5);
    expect(P.returnedPoints).toBeGreaterThan(P.objectiveByType['intercept_destroyer']! + Math.round(P.hitBase * Math.max(...Object.values(P.hitRangeMultiplier))));
    expect(P.objectiveByType['intercept_destroyer']).toBe(300);
    expect(P.hitBase).toBe(100);
    expect(P.hitRangeMultiplier['<=400yd']).toBe(1.0);
    expect(P.hitRangeMultiplier['>=2000yd']).toBe(3.0);
    expect(P.fuelMax).toBe(100);
    expect(P.fuelRequiresReturnedAndObjective).toBe(true);
    expect(P.crewMax).toBe(100);
    expect(P.crewRequiresReturnedAndObjective).toBe(true);
    expect(P.crewMax).toBeLessThanOrEqual(P.fuelMax);
    // "source" のような文字列の値は達成点に入らない
    expect(Object.values(P.objectiveByType).every((v) => typeof v === 'number')).toBe(true);
  });
  it('計算例（38 gal の模擬値）: 慎重に撃沈して帰投（800-1200yd、40%）= 1190、全速で撃沈して帰投（400-800yd、3%）= 1123、外して帰投 = 700、撃沈して漂流 = 420、撃沈して沈没（≤400yd）= 400', () => {
    expect(computeScore(input({ returned: true, objectiveDone: true, bands: [{ band: '800-1200yd', hits: 1, duds: 0 }], fuelLeftPct: 40 }), P).total).toBe(1190);
    expect(computeScore(input({ returned: true, objectiveDone: true, bands: [{ band: '400-800yd', hits: 1, duds: 0 }], fuelLeftPct: 3 }), P).total).toBe(1123);
    expect(computeScore(input({ returned: true, fuelLeftPct: 60 }), P)).toEqual({ survival: 700, objective: 0, hits: 0, kills: 0, evade: 0, fuel: 0, crew: 0, crewHalf: false, total: 700 });
    expect(computeScore(input({ objectiveDone: true, bands: [{ band: '400-800yd', hits: 1, duds: 0 }], fuelLeftPct: 0 }), P).total).toBe(420);
    expect(computeScore(input({ objectiveDone: true, bands: [{ band: '<=400yd', hits: 1, duds: 0 }], fuelLeftPct: 50 }), P).total).toBe(400);
  });
  it('乗員つきの計算例: 1290 / 1223 / 1194（10/14）/ 1276（12/14）/ 700 / 420 / 400 / 600', () => {
    const crew = (alive: number): Partial<ScoreInput> => ({ crewAlive: alive, crewTotal: 14 });
    expect(computeScore(input({ returned: true, objectiveDone: true, bands: [{ band: '800-1200yd', hits: 1, duds: 0 }], fuelLeftPct: 40, ...crew(14) }), P).total).toBe(1290);
    expect(computeScore(input({ returned: true, objectiveDone: true, bands: [{ band: '400-800yd', hits: 1, duds: 0 }], fuelLeftPct: 3, ...crew(14) }), P).total).toBe(1223);
    expect(computeScore(input({ returned: true, objectiveDone: true, bands: [{ band: '400-800yd', hits: 1, duds: 0 }], fuelLeftPct: 3, ...crew(10) }), P).total).toBe(1194);
    expect(computeScore(input({ returned: true, objectiveDone: true, bands: [{ band: '800-1200yd', hits: 1, duds: 0 }], fuelLeftPct: 40, ...crew(12) }), P).total).toBe(1276);
    expect(computeScore(input({ returned: true, fuelLeftPct: 60, ...crew(11) }), P).total).toBe(700);
    expect(computeScore(input({ objectiveDone: true, bands: [{ band: '400-800yd', hits: 1, duds: 0 }], ...crew(14) }), P).total).toBe(420);
    expect(computeScore(input({ objectiveDone: true, bands: [{ band: '<=400yd', hits: 1, duds: 0 }], fuelLeftPct: 50, ...crew(14) }), P).total).toBe(400);
    expect(computeScore(input({ objectiveDone: true, bands: [{ band: '>=2000yd', hits: 1, duds: 0 }], ...crew(14) }), P).total).toBe(600);
  });
  it('乗員点は帰投かつ任務達成のときだけ。定員 0 なら 0。生存は 0〜定員に収める', () => {
    expect(computeScore(input({ returned: true, objectiveDone: true, crewAlive: 14, crewTotal: 14 }), P).crew).toBe(100);
    expect(computeScore(input({ returned: true, objectiveDone: true, crewAlive: 12, crewTotal: 14 }), P).crew).toBe(86);
    expect(computeScore(input({ returned: true, objectiveDone: false, crewAlive: 14, crewTotal: 14 }), P).crew).toBe(0);
    expect(computeScore(input({ returned: false, objectiveDone: true, crewAlive: 14, crewTotal: 14 }), P).crew).toBe(0);
    expect(computeScore(input({ returned: true, objectiveDone: true, crewAlive: 14, crewTotal: 0 }), P).crew).toBe(0);
    expect(computeScore(input({ returned: true, objectiveDone: true, crewAlive: 20, crewTotal: 14 }), P).crew).toBe(100);
    const loose = { ...P, crewRequiresReturnedAndObjective: false };
    expect(computeScore(input({ returned: true, objectiveDone: false, crewAlive: 7, crewTotal: 14 }), loose).crew).toBe(50);
  });
  it('v0.3.5 乗員が半分以下（14 名中 7 名以下）で帰投すると帰投点 350。8 名なら 700。定員 0 なら影響なし', () => {
    expect(computeScore(input({ returned: true, crewAlive: 7, crewTotal: 14 }), P).survival).toBe(350);
    expect(computeScore(input({ returned: true, crewAlive: 7, crewTotal: 14 }), P).crewHalf).toBe(true);
    expect(computeScore(input({ returned: false, crewAlive: 7, crewTotal: 14 }), P).crewHalf).toBe(false);
    expect(computeScore(input({ returned: true, crewAlive: 8, crewTotal: 14 }), P).survival).toBe(700);
    expect(computeScore(input({ returned: true, crewAlive: 0, crewTotal: 0 }), P).survival).toBe(700);
    expect(computeScore(input({ returned: false, crewAlive: 3, crewTotal: 14 }), P).survival).toBe(0);
    // 撃沈して 5/14 で帰投: 350 + 300 + 100 + 0 + 36 = 786 は『外して帰投（無傷）』700 より上
    expect(computeScore(input({ returned: true, objectiveDone: true, bands: [{ band: '<=400yd', hits: 1, duds: 0 }], crewAlive: 5, crewTotal: 14 }), P).total).toBe(786);
  });
  it('順序はすべての距離帯で成り立つ: 帰投＋撃沈の最低点（燃料 0・5/14）> 外して帰投（11/14）= 直帰（14/14）= 700 > 沈めて死ぬ（最大 600）、慎重 > 捨て身', () => {
    for (const band of Object.keys(P.hitRangeMultiplier)) {
      const worstSunk = computeScore(input({ returned: true, objectiveDone: true, bands: [{ band, hits: 1, duds: 0 }], fuelLeftPct: 0, crewAlive: 5, crewTotal: 14 }), P).total;
      const missed = computeScore(input({ returned: true, fuelLeftPct: 40, crewAlive: 11, crewTotal: 14 }), P).total;
      const direct = computeScore(input({ returned: true, fuelLeftPct: 63, crewAlive: 14, crewTotal: 14 }), P).total;
      const died = computeScore(input({ objectiveDone: true, bands: [{ band, hits: 1, duds: 0 }], crewAlive: 14, crewTotal: 14 }), P).total;
      expect(worstSunk).toBeGreaterThanOrEqual(786);
      expect(worstSunk).toBeGreaterThan(missed);
      expect(missed).toBe(700);
      expect(missed).toBe(direct);
      expect(direct).toBeGreaterThan(died);
      expect(died).toBeLessThanOrEqual(600);
      const careful = computeScore(input({ returned: true, objectiveDone: true, bands: [{ band, hits: 1, duds: 0 }], fuelLeftPct: 37, crewAlive: 14, crewTotal: 14 }), P).total;
      const reckless = computeScore(input({ returned: true, objectiveDone: true, bands: [{ band: '<=400yd', hits: 1, duds: 0 }], fuelLeftPct: 8, crewAlive: 10, crewTotal: 14 }), P).total;
      expect(careful).toBeGreaterThan(reckless);
    }
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
  it('順序: 慎重な撃沈 > 捨て身の撃沈 > 外して帰投 = 直帰 > 沈めて死ぬ（最も遠い帯で当てて死んでも）', () => {
    const careful = computeScore(input({ returned: true, objectiveDone: true, bands: [{ band: '800-1200yd', hits: 1, duds: 0 }], fuelLeftPct: 37 }), P).total;
    const reckless = computeScore(input({ returned: true, objectiveDone: true, bands: [{ band: '<=400yd', hits: 1, duds: 0 }], fuelLeftPct: 8 }), P).total;
    const missed = computeScore(input({ returned: true, fuelLeftPct: 40 }), P).total;
    const direct = computeScore(input({ returned: true, fuelLeftPct: 63 }), P).total;
    const died = computeScore(input({ objectiveDone: true, bands: [{ band: '<=400yd', hits: 1, duds: 0 }] }), P).total;
    const diedLong = computeScore(input({ objectiveDone: true, bands: [{ band: '>=2000yd', hits: 1, duds: 0 }] }), P).total;
    expect(diedLong).toBe(600);
    expect(direct).toBeGreaterThan(diedLong);
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
    const noCrew = JSON.parse(JSON.stringify(scoring)) as Record<string, unknown>;
    delete noCrew['crew'];
    expect(isScoringDataRecord(noCrew)).toBe(false);
    const badHalf = JSON.parse(JSON.stringify(scoring)) as Record<string, unknown>;
    (badHalf['survival'] as Record<string, unknown>)['crew_half_factor'] = 1.5;
    expect(isScoringDataRecord(badHalf)).toBe(false);
  });
});
