// v0.6.9 S5a（spec-v069 §3.4・§4.8・D13・L10・§9 の landing-score）: 揚陸の任務（jp_04）の得点と達成。揚陸完了で 300（帰投の有無・その後の沈没に関わらず。上陸と同じ deliveries）、
// landed を省いた呼び手（ほかの任務）は 0 点のまま。達成（Result の objectiveDone。systems/mission-objective）は「揚陸完了して帰投」で、米PT の隊の枝（帰投だけ）より先に見る。
import { describe, expect, it } from 'vitest';
import hitRateModel from '../data/hit_rate_model.json';
import scoring from '../data/scoring.json';
import seed from '../data/missions_seed.json';
import { LD_DONE, LD_SUNK, LD_UNLOADING } from '../src/core/landing';
import type { MissionEndReason } from '../src/core/mission-flow';
import { computeScore, isScoringDataRecord, scoringParamsFromData, type ScoreInput, type ScoringDataRecord } from '../src/core/scoring';
import { objectiveDoneOf, type ObjectiveWorld } from '../src/systems/mission-objective';

const KPI = hitRateModel.kpi_by_range.map((b) => b.band);
const REC = scoring as unknown as ScoringDataRecord;
const P = scoringParamsFromData(REC, KPI);
const JP04 = (seed.missions as readonly { id: string; type: string }[]).find((m) => m.id === 'jp_04')!;
const base: ScoreInput = { returned: true, objectiveDone: true, missionType: JP04.type, bands: [], kills: 0, killEnemyId: 'us_pt_enemy', fuelLeftPct: 50, crewAlive: 7, crewTotal: 7 };

describe('揚陸の得点（core/scoring の landed。spec §3.4）', () => {
  it('data: landing.points_complete 300（design）。jp_04 は escort_convoy（達成 300・回避の点なし）', () => {
    expect(isScoringDataRecord(REC)).toBe(true);
    expect(REC.landing).toEqual({ points_complete: 300, source: expect.stringMatching(/^design \(v0\.6\.9。jp_04/) });
    expect(P.landingPoints).toBe(300);
    expect(JP04.type).toBe('escort_convoy');
    expect(P.objectiveByType['escort_convoy']).toBe(300);
    expect(P.evadeByType['escort_convoy']).toBeUndefined();
  });
  it('landed で 300 を deliveries に足す。省略・false は 0（ほかの任務の呼び手は変わらない）。上陸（arrivals）とは足し合わせ', () => {
    expect(computeScore(base, P).deliveries).toBe(0);
    expect(computeScore({ ...base, landed: false }, P).deliveries).toBe(0);
    expect(computeScore({ ...base, landed: true }, P)).toEqual({ survival: 700, objective: 300, hits: 0, kills: 0, evade: 0, fuel: 50, crew: 100, deliveries: 300, crewHalf: false, total: 1450 });
    expect(computeScore({ ...base, landed: true, arrivals: 2 }, P).deliveries).toBe(300 + 2 * P.convoyArrivalPoints);
    // 省略と false は同じ合計（揚陸の無い任務の合計は v0.6.8 のまま）
    for (const over of [{}, { returned: false, objectiveDone: false }, { kills: 2 }, { afterDawn: true }] as Partial<ScoreInput>[]) {
      expect(computeScore({ ...base, ...over }, P).total).toBe(computeScore({ ...base, ...over, landed: false }, P).total);
    }
  });
  it('順: 揚陸を見届けて帰投 1450 > 揚陸の前に帰投・輸送船が沈んで帰投 700 > 揚陸を見届けて沈没（PT 2 隻撃沈）580 > 揚陸を見届けて沈没 300（生きて帰る方が上）', () => {
    const s = (over: Partial<ScoreInput>): number => computeScore({ ...base, ...over }, P).total;
    const landedHome = s({ landed: true });
    const homeEarly = s({ objectiveDone: false });
    const landedSunkKills = s({ landed: true, returned: false, objectiveDone: false, kills: 2, crewAlive: 0 });
    const landedSunk = s({ landed: true, returned: false, objectiveDone: false, crewAlive: 0 });
    expect([landedHome, homeEarly, landedSunkKills, landedSunk]).toEqual([1450, 700, 580, 300]);
  });
  it('landing の鍵が無い data でも読め（0 点）、鍵があれば points_complete は 0 以上の数', () => {
    const { landing: _l, ...noLanding } = REC;
    expect(isScoringDataRecord(noLanding)).toBe(true);
    const p0 = scoringParamsFromData(noLanding as ScoringDataRecord, KPI);
    expect(p0.landingPoints).toBe(0);
    expect(computeScore({ ...base, landed: true }, p0).deliveries).toBe(0);
    expect(isScoringDataRecord({ ...REC, landing: { points_complete: -1 } })).toBe(false);
    expect(isScoringDataRecord({ ...REC, landing: { points_complete: 'x' } })).toBe(false);
    expect(isScoringDataRecord({ ...REC, landing: null })).toBe(false);
  });
});

describe('揚陸の任務の達成（systems/mission-objective。spec §4.8）', () => {
  const world = (phase: number | null, pts = true): ObjectiveWorld => ({
    landing: phase === null ? null : { state: { phase } }, convoy: null, escort: null, pts: pts ? {} : null, patrol: null, enemy: { objectiveDone: false }, detect: { count: 0 },
  });
  const REASONS: MissionEndReason[] = ['returned', 'pt_fire', 'adrift', 'grounded', 'air_strike', 'bombed'];
  it('達成 = 揚陸完了（その後の沈没も LD_DONE のまま）して帰投。揚陸中・揚陸の前の沈没で帰投しても達成でない', () => {
    expect(REASONS.map((r) => objectiveDoneOf(r, world(LD_DONE)))).toEqual([true, false, false, false, false, false]);
    expect(REASONS.map((r) => objectiveDoneOf(r, world(LD_UNLOADING)))).toEqual([false, false, false, false, false, false]);
    expect(REASONS.map((r) => objectiveDoneOf(r, world(LD_SUNK)))).toEqual([false, false, false, false, false, false]);
  });
  it('揚陸の枝は米PT の隊の枝（帰投だけで達成）より先。揚陸の無い米PT の任務（jp_05・jp_01 の形）は今のまま帰投で達成', () => {
    expect(objectiveDoneOf('returned', world(LD_UNLOADING, true))).toBe(false);
    expect(objectiveDoneOf('returned', world(null, true))).toBe(true);
    expect(objectiveDoneOf('pt_fire', world(null, true))).toBe(false);
    expect(objectiveDoneOf('returned', world(null, false))).toBe(false);
  });
});
