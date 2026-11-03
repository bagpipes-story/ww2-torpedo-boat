// 停泊して揚陸する輸送船の任務（v0.6.9 S7。jp_04。spec-v069 §5.5・§5.7・R8/F10・F11・R12・R14 A5）の Briefing と Result: 条件の句・敵の方角・帰投地点の方角（自艇の出発点から）、
// Result の本文の頭の 3 行（輸送船の結末の形・PT ごとの雷撃の語・米PT の魚雷の和）と状況の行の頭、幅（Result は W 1280 の 1,232 px の内。tests/pt-ui-kit の見積もり）、
// 材料（systems/landing-telemetry の landingResultPart。揚陸の無い任務は鍵ごと無い）と本文の並び（ui/result-body）、得点と頭の配線（scenes/result-scene のソース）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { enemyNameJa, getBriefingRecord, riskLabelJa } from '../src/config/briefing-data';
import { gameData, getScoringParams } from '../src/config/game-data';
import { playableMissionIds } from '../src/config/campaign-data';
import { briefingRows, landingBriefingJa } from '../src/core/briefing';
import { createLanding, hitLanding, LD_DONE, LD_SUNK, LD_UNLOADING, tickLanding } from '../src/core/landing';
import { OUT_CALM, OUT_DAWN, OUT_ENGAGED, OUT_GOAL_GONE, OUT_HURRIED, OUT_LEFT, OUT_NONE, OUT_RETIRED, OUT_SUNK, PT_SALVO_CALM, PT_SALVO_HURRIED, createPtTorpedoState } from '../src/core/pt-torpedo';
import { PT_FATE_HULL, PT_LEAVE, PT_PATROL } from '../src/core/pt-boats';
import { computeScore } from '../src/core/scoring';
import { landingResultPart } from '../src/systems/landing-telemetry';
import { briefingNumbers, buildWorldSetup } from '../src/systems/world-setup';
import {
  LR_END_ADRIFT, LR_END_GROUNDED, LR_END_NONE, LR_END_RETURNED, LR_END_SUNK, landingEndKind, landingHeadJa, landingResultHeadLineJa, landingResultLines, landingRunLogJa, landingRunWordJa, landingTorpedoTotalsJa,
} from '../src/ui/landing-result';
import { ptResultLines } from '../src/ui/pt-lines';
import { resultBodyLines, type ResultBodySource } from '../src/ui/result-body';
import type { LandingResult, PtResult } from '../src/ui/result-types';
import { textWidthPx } from './pt-ui-kit';

const NBSP = ' ';
const RESULT_MAX_W = 1280 - 2 * 24; // 論理幅の最小 1,280 − 左右の HUD_MARGIN（result-scene の maxW）
const rowsOf = (id: string, hard = false): string[] => {
  const s = buildWorldSetup(gameData, id, { hard });
  const rec = { ...getBriefingRecord(gameData, id, hard), hazardIds: s.hazardsTonight, absentHazardIds: s.absentHazards };
  return briefingRows(rec, briefingNumbers(s), (e) => enemyNameJa(gameData, e), (h) => riskLabelJa(gameData, h)).map((r) => r.text);
};

describe('Briefing（spec §5.5・R8/F10）', () => {
  it('jp_04: 成功は西の青い輪（自艇の出発点から）、月没後、敵は泊地から見た全隻の方角、条件の最後に揚陸の句（帰投の輪で待てる・140 秒・被雷 2 で沈む・離れて戦え・下を抜ける）', () => {
    const tail = landingBriefingJa(140, 2);
    expect(tail).toBe(`帰投の輪で待てる ・${NBSP}揚陸${NBSP}140${NBSP}秒（被雷${NBSP}2${NBSP}で沈む。輸送船から離れて戦え。米PTの魚雷も自艇の下を抜ける）`);
    for (const [hard, enemy] of [[false, '米PTボート ×2（北と東から）'], [true, '米PTボート ×3（北・東・北東から）']] as const) {
      const r = rowsOf('jp_04', hard);
      expect(r[1]).toBe('輸送船の揚陸完了を見届けて帰投（帰投地点は西の青い輪）');
      expect(r[2]).toBe('月没後 ・ 見える 900 m ・ 見つかる 巡航 1200 m／静音 600 m');
      expect(r[3]).toBe(`${enemy} ・${NBSP}輸送船の北東に味方の卯月。走るPTを照らして撃つ`); // v0.6.10 S7: 卯月の句（LD4・LD16。tests/ally-result）
      expect(r[4]).toBe('敵艦艇の砲撃・衝突、夜明けの空襲');
      expect(r[5]).toBe(`夜明けまで 160 秒（以後は空襲） ・ 燃料 19 gal ・${NBSP}25mm機銃1挺（撃つと閃光で見つかる。魚雷はPTの下を抜ける） ・${NBSP}${tail}`);
    }
  });
  it('ほかの遊べる任務: 揚陸の句・帰投地点の差し替えは鍵ごと無い（jp_01 の帰投地点の差し替えは前から）', () => {
    for (const id of [...playableMissionIds(gameData, 'us_pt'), ...playableMissionIds(gameData, 'jp_hard')]) {
      for (const hard of [false, true]) {
        const n = briefingNumbers(buildWorldSetup(gameData, id, { hard }));
        expect('landingJa' in n, id).toBe(id === 'jp_04');
        expect('allyJa' in n, id).toBe(id === 'jp_04'); // v0.6.10 S7: 卯月の句も jp_04 だけ
        expect('homeFromJa' in n, id).toBe(id === 'jp_01' || id === 'jp_04');
        if (id !== 'jp_04') expect(rowsOf(id, hard)[5], id).not.toContain('揚陸');
      }
    }
  });
});

const L0: LandingResult = {
  phase: LD_DONE, pct: 1, pctAtSink: NaN, hits: 1, duds: 1, sunkAfterDone: false, endKind: LR_END_NONE,
  dirJa: ['北', '東'], outcome: [OUT_CALM, OUT_HURRIED], launchM: [873.2, 1246.9], salvoHits: [0, 1], salvoDuds: [1, 0], salvoLeft: [0, 0],
  fired: 6, hurriedFired: 3, engagedFired: 0,
};

describe('Result の本文の頭の 3 行と状況の行の頭（ui/landing-result。spec §5.7・R8/F11・R12）', () => {
  it('終わり方: 決着していれば NONE、帰投・漂流・座礁・それ以外は自艇の沈没', () => {
    expect(landingEndKind(true, 'pt_fire')).toBe(LR_END_NONE);
    expect([landingEndKind(false, 'returned'), landingEndKind(false, 'cleared'), landingEndKind(false, 'adrift'), landingEndKind(false, 'grounded'), landingEndKind(false, 'pt_fire'), landingEndKind(false, 'air_strike')]).toEqual([
      LR_END_RETURNED, LR_END_RETURNED, LR_END_ADRIFT, LR_END_GROUNDED, LR_END_SUNK, LR_END_SUNK,
    ]);
  });
  it('1 行目の形: 揚陸完了（被雷・不発・被雷なし）・その後に撃沈・揚陸の前に撃沈・決着の前に終わった（被雷があれば添える）', () => {
    expect(landingResultHeadLineJa(L0)).toBe('輸送船: 揚陸完了 ・ 被雷 1（不発 1）');
    expect(landingResultHeadLineJa({ ...L0, hits: 0, duds: 0 })).toBe('輸送船: 揚陸完了 ・ 被雷なし');
    expect(landingResultHeadLineJa({ ...L0, hits: 0, duds: 2 })).toBe('輸送船: 揚陸完了 ・ 被雷 0（不発 2）');
    expect(landingResultHeadLineJa({ ...L0, hits: 2, sunkAfterDone: true })).toBe('輸送船: 揚陸完了 ・ その後に撃沈');
    expect(landingResultHeadLineJa({ ...L0, phase: LD_SUNK, pct: 0.627, pctAtSink: 0.627, hits: 2 })).toBe('輸送船: 揚陸 62% で撃沈');
    const open = { ...L0, phase: LD_UNLOADING, pct: 0.999, hits: 0, duds: 0 };
    expect(landingResultHeadLineJa({ ...open, endKind: LR_END_SUNK })).toBe('輸送船: 揚陸 99% ・ 自艇が沈んで任務が終わった');
    expect(landingResultHeadLineJa({ ...open, endKind: LR_END_ADRIFT, hits: 1 })).toBe('輸送船: 揚陸 99% ・ 被雷 1 ・ 自艇が漂流して任務が終わった');
    expect(landingResultHeadLineJa({ ...open, endKind: LR_END_GROUNDED })).toBe('輸送船: 揚陸 99% ・ 自艇が座礁して任務が終わった');
    expect(landingResultHeadLineJa({ ...open, endKind: LR_END_RETURNED })).toBe('輸送船: 揚陸 99% ・ 揚陸の前に帰投');
  });
  it('PT ごとの語（線の順・距離は 100 m の切り上げ）: 斉射 3 種 × 命中・外れ・不発・走行中、撃たなかった PT の 6 つ（R8/F11「輸送船が沈み去った」）', () => {
    const one = (o: number, h = 0, d = 0, left = 0, m = 873.2): string => landingRunWordJa({ ...L0, outcome: [o], launchM: [m], salvoHits: [h], salvoDuds: [d], salvoLeft: [left] }, 0, '25mm');
    expect([one(OUT_CALM, 1), one(OUT_CALM), one(OUT_CALM, 0, 1), one(OUT_CALM, 0, 0, 2), one(OUT_CALM, 1, 1, 1)]).toEqual(['900 m 命中 1', '900 m 外れ', '900 m 不発', '900 m 走行中', '900 m 命中 1']);
    expect([one(OUT_HURRIED, 2, 0, 0, 1246.9), one(OUT_HURRIED, 0, 0, 0, 1300)]).toEqual(['1300 m 慌てて 命中 2', '1300 m 慌てて 外れ']);
    expect([one(OUT_ENGAGED, 1, 0, 0, 640), one(OUT_ENGAGED, 0, 0, 0, 640)]).toEqual(['700 m 戦いながら 命中 1', '700 m 戦いながら 外れ']);
    expect([OUT_RETIRED, OUT_SUNK, OUT_LEFT, OUT_DAWN, OUT_GOAL_GONE, OUT_NONE].map((o) => one(o))).toEqual(['25mm で撃退', '25mm で撃沈', '引きつけて去らせた', '夜明けに去った', '輸送船が沈み去った', '撃たせず']);
    expect(landingRunWordJa({ ...L0, outcome: [OUT_RETIRED] }, 0, '')).toBe('砲 で撃退');
    expect(landingRunLogJa(L0, '25mm')).toBe('雷撃: 北 900 m 不発 ／ 東 1300 m 慌てて 命中 1');
    expect(landingRunLogJa({ ...L0, dirJa: ['北', '東', '北東'], outcome: [OUT_CALM, OUT_HURRIED, OUT_RETIRED], salvoDuds: [0, 0, 0], launchM: [873.2, 1246.9, NaN], salvoHits: [0, 1, 0], salvoLeft: [0, 0, 0] }, '25mm')).toBe(
      '雷撃: 北 900 m 外れ ／ 東 1300 m 慌てて 命中 1 ／ 北東 25mm で撃退',
    );
  });
  it('3 行目: 撃った本数・命中（不発）・慌てて・戦いながら（0 は出さない）か「米PT に一度も魚雷を撃たせなかった」', () => {
    expect(landingTorpedoTotalsJa(L0)).toBe('米PT の魚雷 6 本 ・ 命中 1（不発 1） ・ 慌てて撃った 3 本');
    expect(landingTorpedoTotalsJa({ ...L0, fired: 9, hits: 2, duds: 0, hurriedFired: 3, engagedFired: 3 })).toBe('米PT の魚雷 9 本 ・ 命中 2 ・ 慌てて撃った 3 本 ・ 戦いながら撃った 3 本');
    expect(landingTorpedoTotalsJa({ ...L0, fired: 3, hits: 0, duds: 0, hurriedFired: 0 })).toBe('米PT の魚雷 3 本 ・ 命中 0');
    expect(landingTorpedoTotalsJa({ ...L0, fired: 0, hits: 0, duds: 0, hurriedFired: 0 })).toBe('米PT に一度も魚雷を撃たせなかった');
    expect(landingResultLines(L0, '25mm')).toEqual([landingResultHeadLineJa(L0), landingRunLogJa(L0, '25mm'), landingTorpedoTotalsJa(L0)]);
  });
  it('状況の行の頭: 揚陸完了・揚陸完了（沈没）・沈没・決着の前の %（後ろは米PT の頭）', () => {
    const pt = '米PT: 撃退 1 ・ 健在 1 隻';
    expect(landingHeadJa(L0, pt)).toBe('輸送船 揚陸完了 ・ 米PT: 撃退 1 ・ 健在 1 隻');
    expect(landingHeadJa({ ...L0, sunkAfterDone: true }, pt)).toBe(`輸送船 揚陸完了（沈没） ・ ${pt}`);
    expect(landingHeadJa({ ...L0, phase: LD_SUNK }, pt)).toBe(`輸送船 沈没 ・ ${pt}`);
    expect(landingHeadJa({ ...L0, phase: LD_UNLOADING, pct: 0.42 }, pt)).toBe(`輸送船 揚陸 42% ・ ${pt}`);
  });
  it('幅: いちばん長い形でも 1,232 px の内（1 行目 24 px、2・3 行目 20 px。ハードの 3 隻がみな戦いながら・9900 m でも）', () => {
    const worst1 = landingResultHeadLineJa({ ...L0, phase: LD_UNLOADING, pct: 0.99, hits: 2, duds: 9, endKind: LR_END_ADRIFT });
    expect(textWidthPx(worst1, 24)).toBeLessThanOrEqual(RESULT_MAX_W);
    const worst2 = landingRunLogJa({ ...L0, dirJa: ['北東', '北東', '北東'], outcome: [OUT_ENGAGED, OUT_ENGAGED, OUT_ENGAGED], launchM: [9900, 9900, 9900], salvoHits: [3, 3, 0], salvoDuds: [0, 0, 3], salvoLeft: [0, 0, 3] }, '25mm');
    expect(Math.round(textWidthPx(worst2, 20))).toBe(1085);
    const worst3 = landingTorpedoTotalsJa({ ...L0, fired: 9, hits: 3, duds: 9, hurriedFired: 9, engagedFired: 9 });
    expect(textWidthPx(worst3, 20)).toBeLessThanOrEqual(RESULT_MAX_W);
    expect(Math.round(textWidthPx(landingRunLogJa({ ...L0, dirJa: ['北', '東', '北東'], outcome: [OUT_CALM, OUT_HURRIED, OUT_RETIRED], launchM: [873.2, 1246.9, NaN], salvoHits: [0, 1, 0], salvoDuds: [0, 0, 0], salvoLeft: [0, 0, 0] }, '25mm'), 20))).toBe(721); // spec §5.7 の例
  });
});

/** 米PT の隊の代わり（ptTorpedoOutcome が読む boats の phase と fate だけ） */
const section = (n: number): { boats: { phase: number; fate: number }[] } => ({ boats: Array.from({ length: n }, () => ({ phase: PT_PATROL, fate: 0 })) });

describe('材料（systems/landing-telemetry の landingResultPart）と本文の並び（ui/result-body）', () => {
  it('揚陸の無い任務・隊の無い世界は {}（landing の鍵ごと無い＝ほかの任務の MissionResult は今までのまま）', () => {
    expect(landingResultPart({ landing: null, pts: null } as never, 'returned')).toEqual({});
    expect(landingResultPart({ landing: null, pts: { section: section(2) } } as never, 'returned')).toEqual({});
  });
  it('jp_04 の値から: 揚陸の段階と %・被雷・PT ごとの結末と斉射の数え（線の順）・決着の前の終わり方', () => {
    const s = buildWorldSetup(gameData, 'jp_04');
    const p = s.landing!.params;
    const st = createLanding(p);
    const tst = createPtTorpedoState(2, 3);
    const q = section(2);
    tst.kind[0] = PT_SALVO_CALM;
    tst.launchM[0] = 873.2;
    tst.salvoHits[0] = 1;
    tst.fired = 3;
    q.boats[0]!.phase = PT_LEAVE;
    q.boats[1]!.fate = PT_FATE_HULL;
    hitLanding(st, p, 30);
    tickLanding(st, p, 70);
    const world = (): never => ({ landing: { state: st, tst, p }, pts: { section: q } }) as never;
    const a = landingResultPart(world(), 'pt_fire').landing!;
    expect([a.phase, a.pct, a.hits, a.endKind, a.dirJa, a.outcome, a.fired]).toEqual([LD_UNLOADING, 0.5, 1, LR_END_SUNK, ['北', '東'], [OUT_CALM, OUT_RETIRED], 3]);
    expect(landingResultLines(a, '25mm')).toEqual(['輸送船: 揚陸 50% ・ 被雷 1 ・ 自艇が沈んで任務が終わった', '雷撃: 北 900 m 命中 1 ／ 東 25mm で撃退', '米PT の魚雷 3 本 ・ 命中 1']);
    tickLanding(st, p, p.unloadS);
    const b = landingResultPart(world(), 'returned').landing!;
    expect([b.phase, b.endKind]).toEqual([LD_DONE, LR_END_NONE]);
    // 得点: 揚陸完了なら帰投の有無に関わらず揚陸 300（core/scoring の deliveries）。無い任務は鍵ごと無い＝0
    const sp = getScoringParams(gameData);
    const inp = { returned: false, objectiveDone: false, missionType: 'escort_convoy', bands: [], kills: 0, killEnemyId: 'us_pt_enemy', fuelLeftPct: 50, crewAlive: 12, crewTotal: 12, detections: 0, afterDawn: false, arrivals: 0 };
    expect([computeScore({ ...inp, landed: b.phase === LD_DONE }, sp).deliveries, computeScore({ ...inp, landed: a.phase === LD_DONE }, sp).deliveries, computeScore(inp, sp).deliveries]).toEqual([300, 0, 0]);
  });
  it('本文: 米PT の枝の頭に揚陸の 3 行（24 px 強調・20 px KPI・20 px KPI）と節、その下に米PT の 1 行目（20 px）。揚陸の無い米PT の枝は今までのまま', () => {
    const PT: PtResult = {
      enemyId: 'us_pt_enemy', total: 2, out: 1, alive: 1, leftAtDawn: false, passes: 3, maxPasses: 4, firedPasses: 2, cleanPasses: 1, shots: 18, hits: 2, damagePerHit: 6, hpMax: 60,
      firstDetectM: 612.3, firstDetectBand: 'cruise', lostContacts: 1, closestM: 88.2, minWarnS: 1.94, gunEnabled: true, gunShots: 40, gunHits: 7, retired: 1, sunk: 0, flashFirst: false,
      bursts: 1, suppressions: 1, passesOnBarges: 0, firstDetectKind: 0, gunLabel: '25mm',
    };
    const src = (o: Partial<ResultBodySource>): ResultBodySource => ({
      hunt: null, pt: PT, convoy: null, engine: null, gunboat: null, detections: 2, returned: true, objectiveDone: true, shots: [], capacity: 2, hits: 0, duds: 0, misses: 0, bands: [], kpi: null, sortie: { historical: false }, ...o,
    });
    const STRONG = '#e6eef7';
    const KPI = '#e8d48a';
    const withL = resultBodyLines(src({ landing: L0 }), false).map((l) => [l.text, l.px, l.color, l.sectionAfter]);
    const without = resultBodyLines(src({}), false).map((l) => [l.text, l.px, l.color, l.sectionAfter]);
    const [l1, l2, l3] = landingResultLines(L0, '25mm');
    const [a] = ptResultLines(PT, 2, true);
    expect(withL.slice(0, 4)).toEqual([[l1, 24, STRONG, false], [l2, 20, KPI, false], [l3, 20, KPI, true], [a, 20, undefined, false]]);
    expect(without[0]).toEqual([a, 24, STRONG, true]);
    expect(withL.slice(4)).toEqual(without.slice(1));
  });
  it('S8 のレビュー game-5: 揚陸の任務で一度も見つからずに帰っても「米PT に一度も見つからずに抜けた」とほめない（「米PT に一度も見つからなかった」）。揚陸の無い任務は前のまま', () => {
    const PT0: PtResult = {
      enemyId: 'us_pt_enemy', total: 2, out: 2, alive: 0, leftAtDawn: false, passes: 0, maxPasses: 4, firedPasses: 0, cleanPasses: 0, shots: 0, hits: 0, damagePerHit: 6, hpMax: 60,
      firstDetectM: NaN, firstDetectBand: '', lostContacts: 0, closestM: 1500, minWarnS: Infinity, gunEnabled: true, gunShots: 0, gunHits: 0, retired: 0, sunk: 0, flashFirst: false,
      bursts: 0, suppressions: 0, passesOnBarges: 0, firstDetectKind: 0, gunLabel: '25mm',
    };
    const src = (o: Partial<ResultBodySource>): ResultBodySource => ({
      hunt: null, pt: PT0, convoy: null, engine: null, gunboat: null, detections: 0, returned: true, objectiveDone: false, shots: [], capacity: 2, hits: 0, duds: 0, misses: 0, bands: [], kpi: null, sortie: { historical: false }, ...o,
    });
    const texts = (o: Partial<ResultBodySource>): string[] => resultBodyLines(src(o), false).map((l) => l.text);
    expect(texts({ landing: L0 })).toContain('米PT に一度も見つからなかった');
    expect(texts({ landing: L0 })).not.toContain('米PT に一度も見つからずに抜けた');
    expect(texts({})).toContain('米PT に一度も見つからずに抜けた');
  });
  it('配線（ソース）: buildMissionResult が landingResultPart を広げ、Result は揚陸 300 の項（達成の次）・状況の行の頭・landed を computeScore へ', () => {
    const read = (f: string): string => readFileSync(join(__dirname, '..', 'src', f), 'utf8');
    expect(read('systems/mission-telemetry.ts')).toContain('...landingResultPart(w, reason),');
    const rs = read('scenes/result-scene.ts');
    expect(rs).toContain('...(r.landing ? { landed: r.landing.phase === LD_DONE } : {})');
    expect(rs).toContain("r.landing ? ` ・ 揚陸 ${score.deliveries}` : ''");
    expect(rs).toContain('r.landing ? landingHeadJa(r.landing, ptHeadJa(r.pt))');
  });
});
