// v0.8.5 S1（spec-v0850 §4.6）: core/scoring の任意の入力 rescued（フィッチへ渡した生存者）と us_07「D-Day・生存者救助」の点の釣り合い。
// - 渡した 1 名 8 点（帰投の有無に関わらず＝deliveries）・達成 300（帰投が要る）・S ボート撃沈 70（砲の kills）。
// - 「沈んで死ぬより帰る方が上」: 60 名 × 8 ＋ S ボート 3 隻 × 70 ＝ 690 < 帰投 700（燃料・乗員 0）。
// - rescued の無い入力は今の式（省略・0 で同じ内訳。scoring.json の rescue の鍵が無ければ 0 点）。
import { describe, expect, it } from 'vitest';
import hitRateModel from '../data/hit_rate_model.json';
import scoring from '../data/scoring.json';
import { gameData } from '../src/config/game-data';
import { rescueObjectiveDone } from '../src/core/mission-flow';
import { computeScore, isScoringDataRecord, scoringParamsFromData, type ScoreInput } from '../src/core/scoring';
import { buildWorldSetup } from '../src/systems/world-setup';

const KPI = hitRateModel.kpi_by_range.map((b) => b.band);
if (!isScoringDataRecord(scoring)) throw new Error('scoring data');
const P = scoringParamsFromData(scoring, KPI);
const RESCUE = 'rescue';
const SBOAT = 'de_sboat_enemy';
const S = buildWorldSetup(gameData, 'us_07');
const HARD = buildWorldSetup(gameData, 'us_07', { hard: true });

function input(over: Partial<ScoreInput>): ScoreInput {
  return { returned: false, objectiveDone: false, missionType: RESCUE, bands: [], kills: 0, killEnemyId: '', fuelLeftPct: 0, crewAlive: 0, crewTotal: 0, ...over };
}

describe('点の値（scoring.json）', () => {
  it('渡した 1 名 8・達成 300・S ボート 70・帰投 700', () => {
    expect([P.rescuePoints, P.objectiveByType[RESCUE], P.killPoints[SBOAT], P.returnedPoints]).toEqual([8, 300, 70, 700]);
  });
  it('rescued は deliveries に足す（帰投の有無に関わらず）。負の数は 0', () => {
    expect(computeScore(input({ rescued: 12 }), P).deliveries).toBe(96);
    expect(computeScore(input({ rescued: 12, returned: true }), P).deliveries).toBe(96);
    expect(computeScore(input({ rescued: -3 }), P).deliveries).toBe(0);
    expect(computeScore(input({ kills: 2, killEnemyId: SBOAT }), P).kills).toBe(140);
  });
  it('達成して帰投（40 名・燃料・乗員 0）: 700 ＋ 300 ＋ 320 ＝ 1,320', () => {
    const done = rescueObjectiveDone('returned', 40, S.rescue!.objectiveDelivered);
    expect(computeScore(input({ returned: true, objectiveDone: done, rescued: 40 }), P).total).toBe(1320);
  });
});

describe('沈んで死ぬより帰る方が上（spec §4.6）', () => {
  it('生存者を全部（60 名）渡し、ハードの S ボート 3 隻を沈めて沈む: 480 ＋ 210 ＝ 690 ＜ 帰投 700', () => {
    const total = S.rescue!.total;
    const boats = HARD.ptBoats!.count;
    expect([total, boats]).toEqual([60, 3]);
    const max = computeScore(input({ rescued: total, kills: boats, killEnemyId: SBOAT, objectiveDone: rescueObjectiveDone('mine', total, 40) }), P);
    expect([max.deliveries, max.kills, max.objective, max.survival, max.total]).toEqual([480, 210, 0, 0, 690]);
    expect(max.total).toBeLessThan(P.returnedPoints);
    expect(computeScore(input({ returned: true }), P).total).toBe(700);
  });
});

describe('rescued の無い任務は今の式', () => {
  it('どの type・帰投・達成・撃破でも、省略と 0 は同じ内訳。scoring.json に rescue の鍵が無ければ 0 点', () => {
    let n = 0;
    for (const missionType of Object.keys(P.objectiveByType)) {
      for (const returned of [false, true]) {
        for (const objectiveDone of [false, true]) {
          const base = input({ missionType, returned, objectiveDone, kills: 1, killEnemyId: 'daihatsu_barge', bands: [{ band: '800-1200yd', hits: 1, duds: 0 }], fuelLeftPct: 40, crewAlive: 9, crewTotal: 12, arrivals: 1 });
          expect(computeScore({ ...base, rescued: 0 }, P)).toEqual(computeScore(base, P));
          n++;
        }
      }
    }
    expect(n).toBeGreaterThanOrEqual(36);
    const none = { ...scoring } as Record<string, unknown>;
    delete none['rescue'];
    expect(isScoringDataRecord(none)).toBe(true);
    expect(scoringParamsFromData(none as never, KPI).rescuePoints).toBe(0);
    expect(isScoringDataRecord({ ...scoring, rescue: { points_per_survivor: -1 } })).toBe(false);
  });
});
