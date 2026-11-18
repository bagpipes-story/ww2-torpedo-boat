// v0.8.2 S2（lead の L18。S1 の L11 から移した）: core/scoring の任意の入力 shipKills（魚雷で沈めた艦の id と数）と、us_05「スリガオ海峡・最初の接触」の点の釣り合い（spec-v0820 §4.8 D-P2・D-P3）。
// - 報告して帰投 ≥ 700 ＋ 300 ＝ 1,000（燃料・乗員 0 でも）。戦艦を弾薬庫の誘爆で沈めて沈む＝命中 4 本 × 最大 200（1,200〜2,000 yd）＋ 轟沈 200 ＝ 1,000 以下（2,000 yd の内の帯はどれも）。
//   重巡を沈めて沈む 3 × 200 ＋ 200 ＝ 800 ＜ 1,000。≥ 2,000 yd の 4 本だけは 1,400 で崩れうる（既知の制約＝扇 1 回 0.2% 未満）。
// - 点のある艦は ijn_battleship_fuso・ijn_cruiser_mogami だけ（駆逐艦は 0＝us_01・us_02・us_04 の点は変わらない）。shipKills の無い入力は今の式（空の配列・点の無い id でも同じ内訳）。
import { describe, expect, it } from 'vitest';
import enemies from '../data/enemies.json';
import hitRateModel from '../data/hit_rate_model.json';
import scoring from '../data/scoring.json';
import { computeScore, isScoringDataRecord, scoringParamsFromData, type ScoreInput } from '../src/core/scoring';

const KPI = hitRateModel.kpi_by_range.map((b) => b.band);
if (!isScoringDataRecord(scoring)) throw new Error('scoring data');
const P = scoringParamsFromData(scoring, KPI);
const RECON = 'recon_and_attack';
const BB = 'ijn_battleship_fuso';
const CA = 'ijn_cruiser_mogami';

function input(over: Partial<ScoreInput>): ScoreInput {
  return { returned: false, objectiveDone: false, missionType: RECON, bands: [], kills: 0, killEnemyId: '', fuelLeftPct: 0, crewAlive: 0, crewTotal: 0, ...over };
}

describe('D-P2: 魚雷で沈めた艦の点（shipKills）', () => {
  it('data: 報告して帰投の達成は 300・戦艦と重巡は 1 隻 200。軍艦（艦種の鍵 ship_class か駆逐艦・軽巡・駆潜艇の記録）のうち点のあるのはこの 2 つだけ（駆逐艦は 0 のまま）', () => {
    expect(P.objectiveByType[RECON]).toBe(300);
    expect([P.killPoints[BB], P.killPoints[CA]]).toEqual([200, 200]);
    const warships = (enemies.enemies as { id: string; ship_class?: string }[]).filter((e) => e.ship_class !== undefined || /destroyer|cruiser|subchaser/.test(e.id)).map((e) => e.id);
    expect(warships.length).toBeGreaterThanOrEqual(7);
    expect(warships.filter((id) => P.killPoints[id] !== undefined).sort()).toEqual([BB, CA]);
    expect(P.killPoints['ijn_destroyer']).toBeUndefined();
  });
  it('1 件ごとに count × 点を kills に足す（砲で沈めた kills と並ぶ）。点の無い id は 0', () => {
    expect(computeScore(input({ shipKills: [{ enemyId: BB, count: 1 }] }), P).kills).toBe(200);
    expect(computeScore(input({ shipKills: [{ enemyId: BB, count: 2 }, { enemyId: CA, count: 1 }] }), P).kills).toBe(600);
    expect(computeScore(input({ shipKills: [{ enemyId: 'ijn_destroyer', count: 4 }] }), P).kills).toBe(0);
    expect(computeScore(input({ kills: 2, killEnemyId: 'daihatsu_barge', shipKills: [{ enemyId: CA, count: 1 }] }), P).kills).toBe(2 * 75 + 200);
  });
});

describe('D-P3: 報告して帰る方が、沈めて死ぬより上', () => {
  const report = computeScore(input({ returned: true, objectiveDone: true }), P).total;
  it('報告して帰投（燃料・乗員 0）は 1,000 ちょうど＝下限', () => {
    expect(report).toBe(1000);
    expect(computeScore(input({ returned: true, objectiveDone: true, fuelLeftPct: 30, crewAlive: 14, crewTotal: 14 }), P).total).toBeGreaterThan(1000);
  });
  it('戦艦を轟沈させて沈む: 2,000 yd の内のどの帯の 4 本でも 1,000 以下（1,200〜2,000 yd で 1,000 ちょうど）。≥ 2,000 yd だけ 1,400（既知の制約）', () => {
    const sinkBb = (band: string): number => computeScore(input({ bands: [{ band, hits: 4, duds: 0 }], shipKills: [{ enemyId: BB, count: 1 }] }), P).total;
    for (const band of KPI.filter((b) => b !== '>=2000yd')) expect(sinkBb(band), band).toBeLessThanOrEqual(report);
    expect(sinkBb('1200-2000yd')).toBe(1000);
    expect(sinkBb('>=2000yd')).toBe(1400);
  });
  it('重巡を沈めて沈む: 3 本 × 最大 200 ＋ 200 ＝ 800 ＜ 1,000', () => {
    const v = computeScore(input({ bands: [{ band: '1200-2000yd', hits: 3, duds: 0 }], shipKills: [{ enemyId: CA, count: 1 }] }), P).total;
    expect(v).toBe(800);
    expect(v).toBeLessThan(report);
  });
  it('報告せずに沈む・報告して沈む（達成は帰投が要る）は 0 点の達成', () => {
    expect(computeScore(input({ objectiveDone: false }), P).objective).toBe(0);
  });
});

describe('shipKills の無い任務は今の式（L18）', () => {
  it('どの type・帰投・達成・帯・砲の撃破・燃料・乗員・夜明けでも、省略・空の配列・点の無い id の内訳は同じ', () => {
    const types = Object.keys(P.objectiveByType);
    expect(types.length).toBeGreaterThanOrEqual(8);
    let n = 0;
    for (const missionType of types) {
      for (const returned of [false, true]) {
        for (const objectiveDone of [false, true]) {
          for (const [kills, killEnemyId] of [[0, ''], [3, 'daihatsu_barge'], [1, 'ijn_transport']] as const) {
            const base = input({ missionType, returned, objectiveDone, kills, killEnemyId, bands: [{ band: '800-1200yd', hits: 2, duds: 1 }], fuelLeftPct: 41, crewAlive: 9, crewTotal: 14, afterDawn: returned && kills === 3, detections: kills === 0 ? 0 : 2 });
            const want = computeScore(base, P);
            expect(computeScore({ ...base, shipKills: [] }, P)).toEqual(want);
            expect(computeScore({ ...base, shipKills: [{ enemyId: 'ijn_destroyer', count: 2 }, { enemyId: 'us_destroyer', count: 1 }] }, P)).toEqual(want);
            n++;
          }
        }
      }
    }
    expect(n).toBe(types.length * 12);
  });
  it('Result（scenes/result-scene）は S2 ではまだ shipKills を渡さない（S4 の Result）', async () => {
    const { readFileSync } = await import('node:fs');
    expect(readFileSync('src/scenes/result-scene.ts', 'utf8')).not.toContain('shipKills');
  });
});
