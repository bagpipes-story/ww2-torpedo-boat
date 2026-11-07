// v0.6.11 S6（spec-v0611-r2 §3.10・§13 の S6・ユーザーの U6）: 空襲下の退避（jp_03）の点と達成。
// 点: 帰投 700（今のまま）・達成 objective_by_type.evacuate_under_air_raid 300＝帰投と同じに数える終わりで残存（座席の艇を含む 18 中）≥ survivor_quota 6・
// 残った艇 evac.points_per_survivor 30 × 座席を除く残存（core/evac-result の evacScoredBoats。帰投の有無に関わらず＝大発の上陸の作法。core/scoring の deliveries）。
// 最大 17 × 30 ＝ 510 < 帰投 700＝「残して沈むより隠れて帰る方が上」。退避の無い任務の点は今のまま（鍵が無ければ 0）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData, getScoringParams } from '../src/config/game-data';
import { evacScoredBoats, type EvacResult } from '../src/core/evac-result';
import { createEvacSquadron } from '../src/core/evac-squadron';
import type { MissionEndReason } from '../src/core/mission-flow';
import { computeScore, isScoringDataRecord, scoringParamsFromData, type ScoreInput } from '../src/core/scoring';
import { objectiveDoneOf, type ObjectiveWorld } from '../src/systems/mission-objective';
import { evacSimSetup } from '../src/systems/evac-sim-setup';
import { SeededRng } from '../src/core/rng';

type Rec = Record<string, unknown>;
const P = getScoringParams(gameData);
const TYPE = 'evacuate_under_air_raid';
const clone = (): Rec => JSON.parse(JSON.stringify(gameData.scoring)) as Rec;
const base: ScoreInput = { returned: true, objectiveDone: false, missionType: TYPE, bands: [], kills: 0, killEnemyId: '', fuelLeftPct: 100, crewAlive: 0, crewTotal: 0, detections: 0 };
const ev = (survivors: number, seatAfloat: boolean): EvacResult => ({ survivors, seatAfloat }) as unknown as EvacResult;

describe('data（scoring.json）', () => {
  it('達成 300・残った艇 30 点（design）。最大 17 × 30 ＝ 510 < 帰投 700', () => {
    expect(P.objectiveByType[TYPE]).toBe(300);
    expect(P.evacBoatPoints).toBe(30);
    expect(P.returnedPoints).toBe(700);
    const raid = evacSimSetup(gameData, false).raid;
    expect((raid.survivorsTotal - 1) * P.evacBoatPoints).toBe(510);
    expect((raid.survivorsTotal - 1) * P.evacBoatPoints).toBeLessThan(P.returnedPoints);
    expect(String(((gameData.scoring as unknown as Rec)['evac'] as Rec)['source'])).toMatch(/^design \(v0\.6\.11/);
  });
  it('形の検査: evac は省略可（無ければ 0）・points_per_survivor は 0 以上の数。壊れた値は false', () => {
    const none = clone();
    delete none['evac'];
    expect(isScoringDataRecord(none)).toBe(true);
    expect(scoringParamsFromData(none as never, gameData.hitRateModel.kpi_by_range.map((b) => b.band)).evacBoatPoints).toBe(0);
    for (const bad of [-1, '30', NaN, null]) {
      const d = clone();
      (d['evac'] as Rec)['points_per_survivor'] = bad;
      expect(isScoringDataRecord(d), String(bad)).toBe(false);
    }
    const d = clone();
    d['evac'] = 'x';
    expect(isScoringDataRecord(d)).toBe(false);
  });
});

describe('残った艇の点（core/scoring の deliveries）と座席の除き方（evacScoredBoats）', () => {
  it('座席が浮いて終われば残存 − 1、沈めば残存のまま（沈んだ座席は数に入っていない）。0 未満にしない', () => {
    expect([evacScoredBoats(ev(8, true)), evacScoredBoats(ev(8, false)), evacScoredBoats(ev(1, true)), evacScoredBoats(ev(0, false))]).toEqual([7, 8, 0, 0]);
  });
  it('帰投の有無に関わらず 1 隻 30 点（大発の上陸と同じ）。退避の無い任務（evacBoats なし）は 0 のまま', () => {
    expect(computeScore({ ...base, evacBoats: 7 }, P).deliveries).toBe(210);
    expect(computeScore({ ...base, returned: false, evacBoats: 7 }, P).deliveries).toBe(210);
    expect(computeScore({ ...base }, P).deliveries).toBe(0);
    expect(computeScore({ ...base, evacBoats: -3 }, P).deliveries).toBe(0);
    // ほかの任務の deliveries（上陸・揚陸）は今の式のまま
    expect(computeScore({ ...base, missionType: 'escort_convoy', arrivals: 2 }, P).deliveries).toBe(2 * P.convoyArrivalPoints);
    expect(computeScore({ ...base, missionType: 'escort_convoy', landed: true }, P).deliveries).toBe(P.landingPoints);
  });
  it('隠れて帰る方が上: 17 隻を残して座席が沈む（510）＜ 座席だけ隠れて帰る（700・達成なし）＜ 6 隻で隠れて帰る（700 ＋ 300 ＋ 150 ＋ 燃料 ＋ 乗員）', () => {
    const sunk17 = computeScore({ ...base, returned: false, objectiveDone: false, evacBoats: 17, fuelLeftPct: 100, crewAlive: 12, crewTotal: 12 }, P).total;
    const alone = computeScore({ ...base, returned: true, objectiveDone: false, evacBoats: 0 }, P).total;
    const six = computeScore({ ...base, returned: true, objectiveDone: true, evacBoats: 5, crewAlive: 12, crewTotal: 12 }, P);
    expect(sunk17).toBe(510);
    expect(alone).toBe(700);
    expect(sunk17).toBeLessThan(alone);
    expect([six.survival, six.objective, six.deliveries]).toEqual([700, 300, 150]);
    expect(six.total).toBeGreaterThan(alone);
    // 空襲が去る時に外で、後で隠れた（帰投 × 0.9 ＝ 630）も 17 隻を残して沈むより上
    expect(computeScore({ ...base, returned: true, afterDawn: true, evacBoats: 0 }, P).survival).toBe(630);
  });
});

describe('達成（systems/mission-objective の evac の枝）', () => {
  const s = evacSimSetup(gameData, false);
  const world = (sunk: number): ObjectiveWorld => {
    const sq = createEvacSquadron({ p: s.params, boat: s.boat, damage: s.damage, crew: s.crew, crewEffects: s.crewEffects, bounds: s.bounds, boundsMarginM: s.boundsMarginM, durationS: s.durationS }, new SeededRng(1));
    for (let i = 0; i < sunk; i++) sq.boats[17 - i]!.sunk = true;
    return { evac: { sq, plan: { raid: s.raid } }, landing: null, convoy: null, escort: null, pts: null, patrol: null, enemy: { objectiveDone: true }, detect: { count: 0 } };
  };
  it('帰投と同じに数える終わりで残存 ≥ 6（ノルマ・ユーザーの U6）。12 隻沈んで 6 隻なら達成、13 隻沈めば未達。沈没・漂流は 18 隻残っても達成でない', () => {
    expect(s.raid.survivorQuota).toBe(6);
    expect(objectiveDoneOf('returned', world(12))).toBe(true);
    expect(objectiveDoneOf('returned', world(13))).toBe(false);
    for (const r of ['air_strike', 'adrift', 'destroyed'] as MissionEndReason[]) expect(objectiveDoneOf(r, world(0)), r).toBe(false);
    // 敵の側の達成（enemy.objectiveDone）は見ない
    expect(objectiveDoneOf('returned', { ...world(13), enemy: { objectiveDone: true } })).toBe(false);
  });
  it('退避の無い任務（evac 無し・null）は今の枝のまま', () => {
    const w: ObjectiveWorld = { landing: null, convoy: null, escort: null, pts: null, patrol: null, enemy: { objectiveDone: true }, detect: { count: 0 } };
    expect([objectiveDoneOf('returned', w), objectiveDoneOf('returned', { ...w, evac: null }), objectiveDoneOf('returned', { ...w, enemy: { objectiveDone: false } })]).toEqual([true, true, false]);
  });
});

describe('配線（ソース）', () => {
  const read = (f: string): string => readFileSync(join(__dirname, '..', 'src', f), 'utf8');
  it('Result は退避の任務だけ evacBoats を computeScore へ・得点の行の項は evacScorePartJa・達成は evac の枝が先', () => {
    const rs = read('scenes/result-scene.ts');
    expect(rs).toContain('...(r.evac ? { evacBoats: evacScoredBoats(r.evac) } : {})');
    expect(rs).toContain('const objPart = r.evac ? evacScorePartJa(r.evac, score.objective, score.deliveries, scoringParams.evacBoatPoints) : h ?');
    const mo = read('systems/mission-objective.ts');
    expect(mo.indexOf('if (w.evac) return endCountsAsReturn(reason) && evacSurvivors(w.evac.sq) >= w.evac.plan.raid.survivorQuota;')).toBeLessThan(mo.indexOf('if (w.landing) return'));
    expect(read('systems/mission-telemetry.ts')).toContain('...evacResultPart(w),');
  });
});
