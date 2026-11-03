// v0.6.10 S7（spec-v0610 part 2 の S7・リードの決定 LD4・LD8・LD12・LD16）: 卯月のいる jp_04 の Briefing と Result。
// Briefing: 敵の行の後ろの卯月の句（輸送船の北東・走る PT だけ＝LD4）と、史実メモの言い方（LD12）、行の数（目的 2・敵 1・条件 3・史実 3。1 字の余白でも＝tests/wrap-kit）。
// Result: 材料（systems/ally-telemetry の allyResult・landing-telemetry の landingResultPart の ally）・卯月の 1 行（ui/ally-result）・雷撃の行の語（ui/landing-result）・
// 自艇の砲の行から卯月の分を引く（ui/pt-lines）・本文の並び（ui/result-body）。卯月の無い夜（ほかの任務・&noally）は前の文のまま。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { enemyNameJa, getBriefingRecord, riskLabelJa } from '../src/config/briefing-data';
import { playableMissionIds } from '../src/config/campaign-data';
import { gameData } from '../src/config/game-data';
import { ALLY_RUN_LIGHT_JA, allyBriefingJa, briefingRows } from '../src/core/briefing';
import { directSortie } from '../src/core/sortie';
import { LD_DONE } from '../src/core/landing';
import { PT_FATE_CREW, PT_FATE_HULL, PT_FATE_NONE, PT_FATE_SUNK, type PtSection } from '../src/core/pt-boats';
import { OUT_CALM, OUT_HURRIED, OUT_LIT_AWAY, OUT_LIT_HURRIED, OUT_RETIRED, OUT_SUNK, createPtTorpedoState } from '../src/core/pt-torpedo';
import { allyResult, type AllyResultSource } from '../src/systems/ally-telemetry';
import { FATE_BY_ALLY, FATE_BY_PLAYER } from '../src/systems/gunboat-credit';
import { landingResultPart } from '../src/systems/landing-telemetry';
import { briefingNumbers, buildWorldSetup } from '../src/systems/world-setup';
import { NO_ALLY_GUN_SHARE, allyGunShare, allyResultLineJa } from '../src/ui/ally-result';
import { LR_END_NONE, landingResultLines, landingRunLogJa, landingRunWordJa } from '../src/ui/landing-result';
import { ptResultLines } from '../src/ui/pt-lines';
import { resultBodyLines, type ResultBodySource } from '../src/ui/result-body';
import type { AllyResult, LandingResult, PtResult } from '../src/ui/result-types';
import { textWidthPx } from './pt-ui-kit';
import { BRIEF_NOTE_PX, BRIEF_ROW_PX, BRIEF_WRAP, phaserWrap } from './wrap-kit';

type Rec = Record<string, unknown>;
const NBSP = ' ';
const RESULT_MAX_W = 1280 - 2 * 24; // 論理幅の最小 1,280 − 左右の HUD_MARGIN（result-scene の maxW）
const M = (gameData.missionsSeed.missions as unknown as Rec[]).find((m) => m['id'] === 'jp_04')!;
const HARD = (M['v0_1_prototype'] as Rec)['hard'] as Rec;
const ALLY_JA = '味方の卯月は輸送船の北東で走るPTを照らして撃つ';

const rowsOf = (id: string, hard: boolean, o: { allyOff?: boolean; seed?: number } = {}): string[] => {
  const s = buildWorldSetup(gameData, id, { hard, ...(o.allyOff ? { allyOff: true } : {}), ...(o.seed ? { sortie: directSortie(id, o.seed, 'none', hard, false) } : {}) });
  const rec = { ...getBriefingRecord(gameData, id, hard), hazardIds: s.hazardsTonight, absentHazardIds: s.absentHazards };
  return briefingRows(rec, briefingNumbers(s), (e) => enemyNameJa(gameData, e), (h) => riskLabelJa(gameData, h)).map((r) => r.text);
};

describe('Briefing の卯月の句（LD4・LD16）', () => {
  it('敵の行の後ろに「 ・」＋ノーブレークスペースで「味方の卯月は輸送船の北東で走るPTを照らして撃つ」（ノーマル・ハード・seed 1〜30 で北東）。&noally・ほかの任務は前の行', () => {
    expect(allyBriefingJa('卯月', '北東')).toBe(ALLY_JA);
    expect(ALLY_RUN_LIGHT_JA).toBe('走るPTを照らして撃つ');
    for (const hard of [false, true]) {
      const enemy = hard ? '米PTボート ×3（北・東・北東から）' : '米PTボート ×2（北と東から）';
      for (let seed = 1; seed <= 30; seed++) expect(rowsOf('jp_04', hard, { seed })[3], `${hard} ${seed}`).toBe(`${enemy} ・${NBSP}${ALLY_JA}`);
      expect(rowsOf('jp_04', hard, { allyOff: true })[3]).toBe(enemy);
      expect('allyJa' in briefingNumbers(buildWorldSetup(gameData, 'jp_04', { hard, allyOff: true }))).toBe(false);
    }
    for (const id of [...playableMissionIds(gameData, 'us_pt'), ...playableMissionIds(gameData, 'jp_hard')]) {
      if (id === 'jp_04') continue;
      for (const hard of [false, true]) {
        expect('allyJa' in briefingNumbers(buildWorldSetup(gameData, id, { hard })), id).toBe(false);
        expect(rowsOf(id, hard).join('\n'), id).not.toContain('卯月');
      }
    }
  });
  it('LD4: 忍び寄る PT を見張るとは言わない（「走る」PT だけ・見張り・忍び・任せの語なし）。半角スペースなし', () => {
    for (const w of ['見張', '忍び', '任せ', 'すべて', '全']) expect(ALLY_JA, w).not.toContain(w);
    expect(ALLY_JA).toContain('走る');
    expect(ALLY_JA).not.toContain(' ');
  });
  it('行の数（24 px・1,056 px。1 字の余白でも）: 目的 2・成功 1・月 1・敵 1（ハードは 1,018 px）・危険 1・条件 3、史実メモ 3（20 px）。前の句「味方 卯月（輸送船の北東）は走る米PTを…」はハードで 2 行', () => {
    for (const hard of [false, true]) {
      const r = rowsOf('jp_04', hard);
      const want = [2, 1, 1, 1, 1, 3];
      for (const W of [BRIEF_WRAP, BRIEF_WRAP - BRIEF_ROW_PX]) expect(r.map((t) => phaserWrap(t, BRIEF_ROW_PX, W).length), `${hard} ${W}`).toEqual(want);
      const note = getBriefingRecord(gameData, 'jp_04', hard).noteJa;
      for (const W of [BRIEF_WRAP, BRIEF_WRAP - BRIEF_NOTE_PX]) expect(phaserWrap(note, BRIEF_NOTE_PX, W).length, `${hard} ${W}`).toBe(3);
    }
    expect(Math.round(textWidthPx(rowsOf('jp_04', true)[3]!, BRIEF_ROW_PX))).toBe(1018);
    expect(phaserWrap(`米PTボート ×3（北・東・北東から） ・${NBSP}味方${NBSP}卯月（輸送船の北東）は走る米PTを照らして撃つ`).length).toBe(2);
  });
});

describe('史実メモ（LD12）', () => {
  it('ノーマル・ハードとも「卯月が撃ち返した記録は見つからない（ゲーム上の想定）」と「日本の魚雷艇がレイテにいた記録は見つから」。「卯月の代わり」は言わない（卯月がいる）', () => {
    for (const t of [String(M['briefing_note_ja']), String(HARD['note_ja'])]) {
      expect(t).toContain('卯月が撃ち返した記録は見つからない（ゲーム上の想定）');
      expect(t).toContain('日本の魚雷艇がレイテにいた記録は見つから');
      expect(t).not.toContain('卯月の代わり');
      expect(t).not.toContain('撃ち返した記録は無い');
      expect(t).toContain('T-38で代用');
    }
    expect(String(HARD['note_ja'])).toContain('3隻目のPTも想定');
  });
});

/** 卯月の 1 夜の数えの代わり（allyResult が読む欄だけ） */
const src = (o: Partial<{ litPts: number; litAways: number; litSalvos: number; shells: number; hits: number; suppressions: number; fateBy: number[] }> = {}): AllyResultSource => ({
  a: {
    p: { labelJa: '卯月' }, litPts: o.litPts ?? 2, litAways: o.litAways ?? 1, litSalvos: o.litSalvos ?? 0, shells: o.shells ?? 24,
    credit: { hits: o.hits ?? 2, suppressions: o.suppressions ?? 0, eventSeq: 0, fateBy: Int8Array.from(o.fateBy ?? [0, FATE_BY_ALLY]) },
  },
});
const section = (fates: number[]): PtSection => ({ boats: fates.map((fate) => ({ fate, phase: 0 })) }) as unknown as PtSection;
const A0: AllyResult = { labelJa: '卯月', lit: 2, litAway: 1, litSalvo: 0, shells: 24, hits: 2, retired: 1, sunk: 0, suppressions: 0, byAlly: [false, true] };

describe('材料（systems/ally-telemetry の allyResult・landingResultPart の ally）', () => {
  it('卯月の無い夜は null。撃退・撃沈は卯月の砲が結末を決めた PT（FATE_BY_ALLY）だけ、命中・制圧は手柄、PT ごとの byAlly', () => {
    expect(allyResult(null, section([0, 0]))).toBeNull();
    expect(allyResult(undefined, section([0, 0]))).toBeNull();
    expect(allyResult(src(), section([PT_FATE_NONE, PT_FATE_HULL]))).toEqual(A0);
    // 卯月が撃退した PT を自艇が沈めても卯月の撃沈（fateBy は卯月のまま＝LD8・模擬の allyFate）。自艇が撃退した PT は数えない
    const b = allyResult(src({ fateBy: [FATE_BY_PLAYER, FATE_BY_ALLY, FATE_BY_ALLY] }), section([PT_FATE_CREW, PT_FATE_SUNK, PT_FATE_HULL]))!;
    expect([b.retired, b.sunk, b.byAlly]).toEqual([1, 1, [false, true, true]]);
  });
  it('landingResultPart は卯月のいる夜だけ landing.ally の鍵（無い夜・null は鍵ごと無い）', () => {
    const s = buildWorldSetup(gameData, 'jp_04');
    const tst = createPtTorpedoState(2, 3);
    const q = section([PT_FATE_NONE, PT_FATE_HULL]);
    const base = { state: { phase: LD_DONE, pct: 1, pctAtSink: NaN, hits: 0, duds: 0, sunkAfterDone: false }, tst, p: s.landing!.params };
    const w = (ally: AllyResultSource | null | undefined): never => ({ landing: { ...base, ...(ally === undefined ? {} : { ally }) }, pts: { section: q } }) as never;
    expect('ally' in landingResultPart(w(undefined), 'returned').landing!).toBe(false);
    expect('ally' in landingResultPart(w(null), 'returned').landing!).toBe(false);
    expect(landingResultPart(w(src()), 'returned').landing!.ally).toEqual(A0);
  });
});

const L0: LandingResult = {
  phase: LD_DONE, pct: 1, pctAtSink: NaN, hits: 0, duds: 0, sunkAfterDone: false, endKind: LR_END_NONE,
  dirJa: ['北', '東'], outcome: [OUT_CALM, OUT_LIT_AWAY], launchM: [873.2, NaN], salvoHits: [0, 0], salvoDuds: [0, 0], salvoLeft: [0, 0],
  fired: 3, hurriedFired: 0, engagedFired: 0, ally: A0,
};

describe('Result の文（ui/ally-result・ui/landing-result）', () => {
  it('卯月の 1 行: 照らした・撃たずに去らせた・命中/弾・撃退・撃沈（照らされた斉射と制圧は 1 以上だけ）・撃たなかった夜', () => {
    expect(allyResultLineJa(A0)).toBe('卯月: 照らした米PT 2 隻 ・ 撃たずに去らせた 1 ・ 命中 2/24 発 ・ 撃退 1 ・ 撃沈 0');
    expect(allyResultLineJa({ ...A0, litSalvo: 1, suppressions: 2, sunk: 1 })).toBe('卯月: 照らした米PT 2 隻 ・ 撃たずに去らせた 1 ・ 照らされて撃った 1 ・ 命中 2/24 発 ・ 撃退 1 ・ 撃沈 1 ・ 制圧 2');
    expect(allyResultLineJa({ ...A0, lit: 0, litAway: 0, shells: 0, hits: 0, retired: 0 })).toBe('卯月: 照らした米PT 0 隻 ・ 撃たずに去らせた 0 ・ 撃たなかった');
    const worst = allyResultLineJa({ ...A0, lit: 3, litAway: 3, litSalvo: 3, shells: 999, hits: 99, retired: 3, sunk: 3, suppressions: 9 }); // 弾 3 桁・命中 2 桁・制圧 1 桁（模擬の 1 夜は弾 7.7・命中 0.67）
    expect(textWidthPx(worst, 20)).toBeLessThanOrEqual(RESULT_MAX_W);
  });
  it('雷撃の語: 照らされた斉射「900 m 照らされて 外れ」・「卯月が照らして去らせた」・卯月の砲の「卯月が撃退」「卯月が撃沈」。自艇の砲は「25mm で撃退」のまま', () => {
    const one = (o: number, al: AllyResult | undefined, h = 0): string => landingRunWordJa({ ...L0, outcome: [o], launchM: [873.2], salvoHits: [h], salvoDuds: [0], salvoLeft: [0], ...(al ? { ally: al } : { ally: undefined }) }, 0, '25mm');
    expect(one(OUT_LIT_HURRIED, A0)).toBe('900 m 照らされて 外れ');
    expect(one(OUT_LIT_HURRIED, A0, 1)).toBe('900 m 照らされて 命中 1');
    expect(one(OUT_LIT_AWAY, A0)).toBe('卯月が照らして去らせた');
    expect(one(OUT_RETIRED, { ...A0, byAlly: [true] })).toBe('卯月が撃退');
    expect(one(OUT_SUNK, { ...A0, byAlly: [true] })).toBe('卯月が撃沈');
    expect(one(OUT_RETIRED, { ...A0, byAlly: [false] })).toBe('25mm で撃退');
    expect(one(OUT_SUNK, undefined)).toBe('25mm で撃沈');
    expect(one(OUT_HURRIED, A0)).toBe('900 m 慌てて 外れ');
    expect(landingRunLogJa(L0, '25mm')).toBe('雷撃: 北 900 m 外れ ／ 東 卯月が照らして去らせた');
    const hard = landingRunLogJa({ ...L0, dirJa: ['北東', '北東', '北東'], outcome: [OUT_LIT_AWAY, OUT_LIT_AWAY, OUT_LIT_HURRIED], launchM: [NaN, NaN, 9900], salvoHits: [0, 0, 3], salvoDuds: [0, 0, 0], salvoLeft: [0, 0, 0] }, '25mm');
    expect(textWidthPx(hard, 20)).toBeLessThanOrEqual(RESULT_MAX_W);
  });
  it('自艇の砲の行（米PT の 4 行目）は卯月の命中・制圧・撃退・撃沈を引いた自艇の分（卯月の無い夜は前の文）', () => {
    const PT: PtResult = {
      enemyId: 'us_pt_enemy', total: 2, out: 2, alive: 0, leftAtDawn: false, passes: 2, maxPasses: 4, firedPasses: 1, cleanPasses: 1, shots: 6, hits: 0, damagePerHit: 6, hpMax: 60,
      firstDetectM: 812.3, firstDetectBand: 'cruise', lostContacts: 0, closestM: 120, minWarnS: 2.1, gunEnabled: true, gunShots: 60, gunHits: 9, retired: 2, sunk: 1, flashFirst: false,
      bursts: 0, suppressions: 3, passesOnBarges: 0, firstDetectKind: 0, gunLabel: '25mm',
    };
    expect(allyGunShare(undefined)).toBe(NO_ALLY_GUN_SHARE);
    expect(ptResultLines(PT, 2, false)[3]).toBe('25mm 射撃 60 発 ・ 命中 9（15%） ・ 制圧 3 ・ 撃退 2 ・ 撃沈 1');
    expect(ptResultLines(PT, 2, false, false, null, allyGunShare({ ...A0, suppressions: 1, sunk: 1 }))[3]).toBe('25mm 射撃 60 発 ・ 命中 7（12%） ・ 制圧 2 ・ 撃退 1 ・ 撃沈 0');
    const body = (landing: LandingResult): ResultBodySource => ({
      hunt: null, pt: PT, convoy: null, engine: null, gunboat: null, landing, detections: 2, returned: true, objectiveDone: true, shots: [], capacity: 2, hits: 0, duds: 0, misses: 0, bands: [], kpi: null, sortie: { historical: false },
    });
    const KPI = '#e8d48a';
    const withA = resultBodyLines(body(L0), false).map((l) => [l.text, l.px, l.color, l.sectionAfter]);
    const { ally: _a, ...noAlly } = L0;
    const without = resultBodyLines(body(noAlly), false).map((l) => [l.text, l.px, l.color, l.sectionAfter]);
    const [l1, l2, l3] = landingResultLines(L0, '25mm');
    expect(withA.slice(0, 4)).toEqual([[l1, 24, '#e6eef7', false], [l2, 20, KPI, false], [l3, 20, KPI, false], [allyResultLineJa(A0), 20, KPI, true]]);
    expect(without.slice(0, 3).map((x) => x[3])).toEqual([false, false, true]); // 卯月の無い夜は 3 行目の後に節（前のまま）
    expect(withA.length).toBe(without.length + 1);
    expect(withA[withA.length - 1]![0]).toBe('25mm 射撃 60 発 ・ 命中 7（12%） ・ 制圧 3 ・ 撃退 1 ・ 撃沈 1');
    expect(without[without.length - 1]![0]).toBe('25mm 射撃 60 発 ・ 命中 9（15%） ・ 制圧 3 ・ 撃退 2 ・ 撃沈 1');
  });
  it('配線（ソース）: 本文は卯月の分を ptResultLines へ・卯月の行は揚陸の 3 行の後。材料は landingResultPart が allyResult を 1 回', () => {
    const read = (f: string): string => readFileSync(join(__dirname, '..', 'src', f), 'utf8');
    const rb = read('ui/result-body.ts');
    expect(rb).toContain('r.gunboat, allyGunShare(r.landing?.ally));');
    expect(rb.indexOf('if (r.landing.ally) line(allyResultLineJa(r.landing.ally)')).toBeGreaterThan(rb.indexOf('line(l3, HUD_FONT_STATUS_PX, HUD_COLOR_KPI);'));
    expect(read('systems/landing-telemetry.ts').split('allyResult(').length).toBe(2);
  });
});
