// 得点の材料の抜き出し（v0.9.0 S0。systems/mission-score。spec-v0900 §4.5・§6-2）: Result の create にあったリテラル（v0.8.5 の 24d075c の result-scene.ts:193-199 を
// ここに写した OLD）と、どの任務の形でも同じ鍵・同じ値（Result の「スコア」の行が変わらない）。ストアの点は得点 × 倍率（ハードはハードの違いのある任務だけ・史実 ×1.25）。
import { describe, expect, it } from 'vitest';
import { gameData, getScoringParams } from '../src/config/game-data';
import { computeScore } from '../src/core/scoring';
import { evacScoredBoats } from '../src/core/evac-result';
import { LD_DONE } from '../src/core/landing';
import { directSortie } from '../src/core/sortie';
import { missionScore, missionScoreInput, missionStorePoints, type ScoreMaterial as MissionResult } from '../src/systems/mission-score';

/** 24d075c の Result の create のリテラル（そのまま） */
function OLD(r: MissionResult) {
  const h = r.hunt;
  return { returned: r.returned, objectiveDone: r.objectiveDone, missionType: r.missionType, bands: r.bands, kills: h ? h.sunk : r.pt ? r.pt.sunk : r.transportSunk ? 1 : 0, killEnemyId: h ? h.enemyId : r.pt ? r.pt.enemyId : r.transportEnabled ? 'ijn_transport' : '', fuelLeftPct: r.fuelLeftPct, crewAlive: r.crewAlive, crewTotal: r.crewTotal, detections: r.detections, afterDawn: r.returned && r.dawn.caughtOutside, arrivals: r.convoy ? r.convoy.arrived : 0, ...(r.landing ? { landed: r.landing.phase === LD_DONE } : {}), ...(r.evac ? { evacBoats: evacScoredBoats(r.evac) } : {}), ...(r.rescue ? { rescued: r.rescue.delivered } : {}), ...(r.recon ? { shipKills: r.recon.shipKills } : {}) };
}

const base = {
  returned: true, objectiveDone: true, missionType: 'intercept_destroyer', bands: [{ band: '400-800yd', hits: 2, duds: 0 }], hunt: null, pt: null, transportSunk: false, transportEnabled: false,
  fuelLeftPct: 40, crewAlive: 12, crewTotal: 12, detections: 0, dawn: { caughtOutside: false }, convoy: null, sortie: directSortie('us_02', 1, 'none'),
};
const R = (o: Record<string, unknown>): MissionResult => ({ ...base, ...o }) as unknown as MissionResult;
const SHAPES: [string, MissionResult][] = [
  ['魚雷の夜', R({})],
  ['輸送船', R({ transportEnabled: true, transportSunk: true })],
  ['大発', R({ hunt: { sunk: 3, enemyId: 'ijn_daihatsu' }, missionType: 'barge_hunt' })],
  ['米PT と輸送隊', R({ pt: { sunk: 1, enemyId: 'us_pt_enemy' }, convoy: { arrived: 2 }, missionType: 'convoy_escort' })],
  ['夜明け後', R({ dawn: { caughtOutside: true } })],
  ['揚陸', R({ landing: { phase: LD_DONE } })],
  ['救助', R({ rescue: { delivered: 41 } })],
  ['報告', R({ recon: { shipKills: [{ enemyId: 'ijn_fuso', count: 1 }] } })],
  ['沈没', R({ returned: false, objectiveDone: false })],
];

describe('missionScoreInput は v0.8.5 の Result のリテラルと同じ', () => {
  it.each(SHAPES)('%s', (_n, r) => {
    expect(missionScoreInput(r)).toEqual(OLD(r));
    expect(Object.keys(missionScoreInput(r))).toEqual(Object.keys(OLD(r)));
  });
  it('得点（missionScore）は computeScore(OLD) と同じ', () => {
    const r = SHAPES[0]![1];
    expect(missionScore(r, gameData)).toEqual(computeScore(OLD(r), getScoringParams(gameData)));
  });
});

describe('ストアの点（missionStorePoints）', () => {
  const total = (r: MissionResult): number => missionScore(r, gameData).total;
  it('ノーマル ×1・ハード ×1.5・史実 ×1.25・ハードの違いの無い jp_05 のハードは ×1', () => {
    const n = R({});
    expect(total(n)).toBeGreaterThan(0);
    expect(missionStorePoints(n, gameData)).toBe(total(n));
    expect(missionStorePoints(R({ sortie: directSortie('us_02', 1, 'none', true) }), gameData)).toBe(Math.round(total(n) * 1.5));
    expect(missionStorePoints(R({ sortie: directSortie('us_02', 1, 'none', true, true) }), gameData)).toBe(Math.round(total(n) * 1.5 * 1.25));
    expect(missionStorePoints(R({ sortie: directSortie('jp_05', 1, 'none', true) }), gameData)).toBe(total(n));
    expect(missionStorePoints(R({ sortie: { ...directSortie('us_02', 1, 'none'), custom: { items: ['fuel_tank'] } } }), gameData)).toBe(total(n));
  });
});
