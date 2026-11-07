// v0.6.11 S6（spec-v0611-r2 §10.3・§10.6・§13 の S6・r2 L1・L9・L15）: 空襲下の退避（jp_03）の Result。材料（core/evac-result）・文（ui/evac-result）・見出し（ui/result-heading の evac）・
// 本文の枝（ui/result-body）。編隊の数は 1 回ごと（S3b の U7: 戻ってきた回も数える）なので分母は「狙われた N 回」（来た「編隊」の数ではない）＝模擬の表（core/evac-sim-cell）と同じ数え方で突き合わせる。
// 本文の下端 ≤ 592（menu-config の RESULT_BODY_MAX_Y。v0.6.8 の ux-result-height-arms。r2 L9）。jp_03 の Result の文に「夜明け」は無い（H6）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { DAWN_AIR_ENEMY, DAWN_AIR_OWN, createDawnResult, type DawnResult } from '../src/core/dawn-air';
import { G_ENTERING, G_FOUND, G_HAULING, G_HIDDEN, G_MOORED, G_UNDERWAY } from '../src/core/evac-data';
import { EVR_ENTERING, EVR_HAULING, EVR_HIDDEN, EVR_NONE, EVR_OUTSIDE, createEvacSettleSnap, evacResultOf, evacResultPart, type EvacResult, type EvacResultSource, type EvacSettleSnap } from '../src/core/evac-result';
import type { EvacMirrorView } from '../src/core/evac-replay';
import { runEvacTrial } from '../src/core/evac-sim';
import type { EvacPolicy } from '../src/core/evac-sim-rows';
import { evacSurvivors } from '../src/core/evac-squadron';
import type { MissionEndReason } from '../src/core/mission-flow';
import { evacSimSetup } from '../src/systems/evac-sim-setup';
import { evacFlightsLineJa, evacHeadLineJa, evacPlacesLineJa, evacRecordLineJa, evacScorePartJa, evacStrikeLineJa, evacTimeLineJa, evacTimeLinesJa } from '../src/ui/evac-result';
import { resultBodyLines, type ResultBodySource } from '../src/ui/result-body';
import { EVAC_REASON_LABEL, REASON_LABEL, resultHeadingJa } from '../src/ui/result-heading';
import { miniWorld } from './evac-world-kit';
import { textWidthPx } from './pt-ui-kit';

const RESULT_MAX_W = 1280 - 2 * 24; // 論理幅の最小 1,280 − 左右の HUD_MARGIN（result-scene の maxW）
const BODY_MAX_Y = 720 - 24 - 96 - 8; // RESULT_BODY_MAX_Y（menu-config。game-config が DOM を読むので値で）

type Src = Omit<EvacResultSource, 'settleSnap'>;
/** 1 回の模擬（世界と同じ core の順）を終わりまで回し、決着の写しを世界と同じ欄で取る（ラッチのステップに隊と段階・決着のステップに残存） */
function trial(hard: boolean, policy: EvacPolicy, seed: number): { e: EvacResult; tr: ReturnType<typeof runEvacTrial>; src: Src; afloat: boolean } {
  const s = evacSimSetup(gameData, hard);
  let v: EvacMirrorView | null = null;
  const snap = createEvacSettleSnap();
  let latched = false;
  const tr = runEvacTrial(s, policy, seed, null, {
    begin(x) {
      v = x;
    },
    frame() {},
    after() {
      const m = v!;
      if (!latched && m.flags.latched) {
        latched = true;
        const g = m.sq.groups[m.sq.control]!;
        [snap.group, snap.phase, snap.shelter, snap.early] = [m.sq.control, g.phase, g.shelter, !Number.isNaN(m.sq.earlyS)];
      }
      if (m.plan.evSettle) snap.survivors = evacSurvivors(m.sq);
    },
  });
  const m = v! as EvacMirrorView;
  const src: Src = { sq: m.sq, plan: m.plan, air: { repass: m.repass } };
  return { e: evacResultOf({ ...src, settleSnap: snap }, !m.flags.sinking), tr, src, afloat: !m.flags.sinking };
}

const E0: EvacResult = {
  total: 18, quota: 6, historical: 5, survivors: 8, seatAfloat: true, cave: 6, cover: 2, outside: 0, byGroup: [3, 2, 0, 1, 2, 0],
  aimed: 9, again: 2, lost: 3, came: 6, downed: 1, chaseDowned: 0, bombs: 40, boatHits: 12, switches: 7, promotions: 2,
  settlePlace: EVR_HIDDEN, settleGroupJa: '第1隊', settleShelterJa: '西の壕', settleSurvivors: 8, settleEarly: false,
};
const dawn = (o: Partial<DawnResult> = {}): DawnResult => ({ ...createDawnResult(), reached: true, air: DAWN_AIR_ENEMY, ...o });
const strike = { waves: 1, bombs: 8, bombsAtEscort: 0, hitsPlayer: 0, hitsEscort: 0, damagePlayer: 0, dodgeS: [0.6, NaN], vip: false };

describe('材料（core/evac-result の evacResultOf）: 模擬の 1 回と同じ数え方', () => {
  const cases: [boolean, EvacPolicy, number][] = [[false, 'seq', 1], [false, 'seq_shoot', 2], [true, 'seq', 3], [false, 'stay', 1], [false, 'stay', 3], [true, 'dodge_only', 2], [false, 'follow_ring', 4]];
  it.each(cases)('hard %s %s seed %i: 残存・内訳・隊ごと・1 回ごとの編隊（狙われた・見失わせた・爆撃に来た）・撃墜・爆弾が模擬の記録と同じ', (hard, policy, seed) => {
    const { e, tr } = trial(hard, policy, seed);
    expect(e.survivors).toBe(tr.survivors);
    expect(e.cave + e.cover + e.outside).toBe(e.survivors);
    expect(e.byGroup.reduce((a, b) => a + b, 0)).toBe(e.survivors);
    expect([e.total, e.quota, e.historical]).toEqual([18, 6, 5]);
    // 1 回ごと（予告し直しを含む）: 狙われた回＝予告した回 − 目標なし、見失わせた＝始める前と途中（予告し直して閉じた回も）、爆撃に来た＝始めた回
    expect(e.aimed).toBe(tr.announced - tr.noTarget);
    expect(e.lost).toBe(tr.lostMid + tr.lostEarly);
    expect(e.came).toBe(tr.came);
    expect(e.downed).toBe(tr.downs);
    expect(e.lost).toBeLessThanOrEqual(e.aimed);
    expect(e.again).toBeLessThanOrEqual(e.aimed);
    expect([e.bombs, e.boatHits]).toEqual([tr.evacReleases, tr.boatHits]);
    // 決着まで回った夜は確定した残存と時の段階がある（stay は外のまま）。決着の前に 18 隻すべてが沈んだ夜（stay・dodge_only に多い）は段階なし
    if (Number.isNaN(tr.survivorsAtSettle)) {
      expect([e.settlePlace, e.survivors, e.seatAfloat]).toEqual([EVR_NONE, 0, false]);
      expect(tr.timeS).toBeLessThan(240);
    } else {
      expect(e.settlePlace).not.toBe(EVR_NONE);
      expect(e.settleSurvivors).toBe(tr.survivorsAtSettle);
      if (policy === 'stay') expect(e.settlePlace).toBe(EVR_OUTSIDE);
    }
    // 達成（帰投と同じに数える終わり＋残存 ≥ 6）は模擬の achieved と同じ
    expect(tr.end === 'home' && e.survivors >= e.quota).toBe(tr.achieved);
  });
  it('ノーマルの seq（seed 1）は編隊が戻ってきた回がある（S3b の U7）＝狙われた回は戻ってきた回を含む', () => {
    const { e } = trial(false, 'seq', 1);
    expect(e.again).toBeGreaterThan(0);
    expect(e.aimed).toBeGreaterThan(e.again);
  });
  it('決着の段階 → 時の行の種類（中・入っている途中・上げている途中・外・決着の前に終わった）。隠れ場所の名は中と途中だけ', () => {
    const { src, afloat } = trial(false, 'seq', 1);
    const at = (phase: number, group = 0): EvacResult => evacResultOf({ ...src, settleSnap: { group, phase, shelter: 1, survivors: 8, early: false } }, afloat);
    expect([G_HIDDEN, G_ENTERING, G_HAULING, G_UNDERWAY, G_MOORED, G_FOUND].map((p) => at(p).settlePlace)).toEqual([EVR_HIDDEN, EVR_ENTERING, EVR_HAULING, EVR_OUTSIDE, EVR_OUTSIDE, EVR_OUTSIDE]);
    expect(at(G_HIDDEN, -1).settlePlace).toBe(EVR_NONE);
    expect([at(G_HIDDEN).settleGroupJa, at(G_HIDDEN).settleShelterJa, at(G_UNDERWAY).settleShelterJa]).toEqual(['第1隊', '西の壕', '']);
    // 座席が沈んで終わった（浮いていない）なら残った艇の点に座席を引かない
    expect(evacResultOf({ ...src, settleSnap: createEvacSettleSnap() }, false).seatAfloat).toBe(false);
  });
});

describe('世界の材料（systems/world-evac の settleSnap・core/evac-result の evacResultPart）', () => {
  it.each([[false, 'seq', 1], [true, 'seq_shoot', 2], [false, 'stay', 3]] as const)('hard %s %s seed %i: 模擬の台本で小さな世界を終わりまで歩かせると、Result の材料が模擬の 1 回と同じ（決着の写しはラッチのステップ）', (hard, policy, seed) => {
    const w = miniWorld(seed, hard);
    runEvacTrial(evacSimSetup(gameData, hard), policy, seed, null, {
      begin() {},
      frame(_k, fo) {
        w.input.stickActive = true;
        w.input.headingDeg = fo.headingDeg;
        w.input.speed01 = fo.speed01;
        w.input.gunHeld = fo.gunHeld;
        w.input.extinguishHeld = fo.extHeld;
        w.input.switchTap = fo.switchTap;
        w.frame();
      },
      after() {},
    });
    expect(evacResultPart(w).evac).toEqual(trial(hard, policy, seed).e);
    // 退避の無い任務は鍵ごと無い（ほかの任務の Result は同じ）
    expect(evacResultPart({ evac: null, boat: { sinking: false } })).toEqual({});
  }, 120_000);
});

describe('Result の文（ui/evac-result）', () => {
  it('本文の頭の 4 行: 残存と達成（24 px）・隠れ場所と隊ごと・編隊（分母は狙われた回・戻ってきた回を含む）・記録', () => {
    expect(evacHeadLineJa(E0, true)).toBe('残存 8／18（史実 5） ・ 6 隻以上を残して隠れた');
    expect(evacHeadLineJa({ ...E0, survivors: 4 }, false)).toBe('残存 4／18（史実 5） ・ 未達（6 隻以上で達成）');
    expect(evacHeadLineJa(E0, false)).toBe('残存 8／18（史実 5） ・ 未達（操作中の隊が隠れずに終わった）');
    expect(evacPlacesLineJa(E0)).toBe('壕 6 ・ 陰 2 ・ 外 0 ／ 沈没 10 ・ 隊ごと 3・2・0・1・2・0');
    expect(evacFlightsLineJa(E0)).toBe('見失わせた 3／狙われた 9 回（戻ってきた 2 回を含む） ・ 撃墜 1 機');
    // 240 秒の後の追撃の機も兵装の行と同じに数え、内訳を出す（v0.6.11 S8）
    expect(evacFlightsLineJa({ ...E0, chaseDowned: 1 })).toBe('見失わせた 3／狙われた 9 回（戻ってきた 2 回を含む） ・ 撃墜 2 機（うち追撃 1）');
    expect(evacRecordLineJa(E0)).toBe('爆撃 6 回 ・ 爆弾 40 発 ・ 艇に命中 12 ・ 切替 7 回 ・ 隊長艇の交代 2');
    expect(evacScorePartJa(E0, 300, 210, 30)).toBe('達成 300 ・ 残った艇 210（7 隻 × 30）');
    expect(evacScorePartJa({ ...E0, seatAfloat: false }, 0, 240, 30)).toBe('達成 0 ・ 残った艇 240（8 隻 × 30）');
  });
  it('分母の語: 「編隊 N」「来た編隊」と言わない（1 つの編隊が 2 回来る＝U7）。「回」で数える', () => {
    const t = evacFlightsLineJa(E0);
    expect(t).not.toMatch(/来た編隊|編隊 \d|編隊\d/);
    expect(t).toMatch(/狙われた \d+ 回/);
  });
  it('時の行（spec §10.3・r2 L15）: 中・上げている途中・入っている途中・外（後で隠れた・その後の沈没と漂流）・決着の前に全艇が沈んだ。追撃の集計は次の行（外だった夜だけ）', () => {
    const d = dawn({ caughtOutside: false });
    expect(evacTimeLineJa(E0, d, 'returned', true)).toBe('空襲が去る時: 西の壕の中（第1隊） ・ 残存 8 で確定');
    expect(evacTimeLineJa({ ...E0, settlePlace: EVR_HAULING }, d, 'returned', true)).toBe('空襲が去る時: 西の壕で上げている途中（第1隊） ・ 残存 8 で確定');
    expect(evacTimeLineJa({ ...E0, settlePlace: EVR_ENTERING, settleShelterJa: '屋我地の陰（東）' }, d, 'returned', true)).toBe('空襲が去る時: 屋我地の陰（東）に入っている途中（第1隊） ・ 残存 8 で確定');
    const out = { ...E0, settlePlace: EVR_OUTSIDE, settleGroupJa: '第3隊', settleShelterJa: '' };
    const o = dawn({ caughtOutside: true, strike });
    expect(evacTimeLinesJa(out, o, 'returned', true)).toEqual(['空襲が去る時: 外（第3隊） ・ 残存 8 で確定 ・ 後で隠れた', '追撃: 1 波 ・ 爆弾 8 発 ・ 命中 0 ・ 転舵 0.6/— 秒']);
    // 外の座席が追撃で沈むと残存は確定の後に 1 減る（頭の行は 7）。減った数を時の行に書く（v0.6.11 S8）
    expect(evacTimeLinesJa({ ...out, survivors: 7 }, o, 'air_strike', false)).toEqual(['空襲が去る時: 外（第3隊） ・ 残存 8 で確定 ・ 隠れる前に沈没（隊長艇の分 −1 で 7）', '追撃: 1 波 ・ 爆弾 8 発 ・ 命中 0 ・ 転舵 0.6/— 秒']);
    expect(evacTimeLinesJa(out, dawn({ caughtOutside: true }), 'adrift', false)).toEqual(['空襲が去る時: 外（第3隊） ・ 残存 8 で確定 ・ 隠れる前に燃料切れで漂流', '']);
    // 味方の空（来ない任務の形）・中だった夜は追撃の行を出さない
    expect(evacStrikeLineJa(out, dawn({ caughtOutside: true, air: DAWN_AIR_OWN, strike }))).toBe('');
    expect(evacStrikeLineJa(E0, dawn({ strike }))).toBe('');
    const none = { ...E0, settlePlace: EVR_NONE, survivors: 0, settleSurvivors: NaN };
    expect(evacTimeLineJa(none, { ...createDawnResult(), timeLeftAtEndS: 36.2 }, 'air_strike', false)).toBe('空襲が去る前に 18 隻すべてが沈んだ（残り 37 秒）');
    expect(evacTimeLineJa({ ...none, survivors: 3 }, createDawnResult(), 'air_strike', false)).toBe('空襲が去る時: 操作中の隊長艇が沈む途中');
  });
  it('幅（Result の行は 1,232 px の内。縮めない）: 数のいちばん長い形', () => {
    const big: EvacResult = { ...E0, survivors: 18, cave: 18, cover: 18, outside: 18, byGroup: [3, 3, 3, 3, 3, 3], aimed: 99, again: 99, lost: 99, came: 99, downed: 36, chaseDowned: 4, bombs: 999, boatHits: 99, switches: 999, promotions: 18, settleShelterJa: '屋我地の陰（東）', settleSurvivors: 18 };
    const lines: [string, number][] = [
      [evacHeadLineJa(big, false), 24],
      [evacHeadLineJa({ ...big, survivors: 5 }, false), 24],
      [evacPlacesLineJa(big), 20],
      [evacFlightsLineJa(big), 20],
      [evacRecordLineJa(big), 20],
      [evacTimeLineJa({ ...big, settlePlace: EVR_ENTERING }, dawn(), 'returned', true), 20],
      [evacTimeLineJa({ ...big, settlePlace: EVR_OUTSIDE, survivors: 17 }, dawn({ caughtOutside: true }), 'adrift', false), 20],
      [evacStrikeLineJa({ ...big, settlePlace: EVR_OUTSIDE }, dawn({ caughtOutside: true, strike: { ...strike, waves: 99, bombs: 999, hitsPlayer: 99, dodgeS: new Array(12).fill(12.3) } })), 20],
      [`退避 630（空襲後 ×0.9） ・ ${evacScorePartJa(big, 300, 510, 30)} ・ 燃料 100 ・ 乗員 100`, 20],
    ];
    for (const [t, px] of lines) expect(textWidthPx(t, px), t).toBeLessThanOrEqual(RESULT_MAX_W);
  });
});

describe('見出し（ui/result-heading の evac）', () => {
  it('jp_03: 帰投は「退避完了」、空襲の沈没は「空襲で沈没」、火災は「火災で沈没」、後ろの秒は「（空襲後 N 秒）」。ハード・史実の印はそのまま', () => {
    expect(resultHeadingJa('returned', NaN, false, false, true)).toBe('任務終了 — 退避完了');
    expect(resultHeadingJa('returned', 12.4, true, false, true)).toBe('任務終了 — 退避完了（空襲後 12 秒）（ハード）');
    expect(resultHeadingJa('air_strike', 30, false, true, true)).toBe('任務終了 — 空襲で沈没（空襲後 30 秒）（史実）');
    expect(resultHeadingJa('destroyed', NaN, false, false, true)).toBe('任務終了 — 火災で沈没');
    expect(resultHeadingJa('adrift', 900, false, false, true)).toBe('任務終了 — 燃料切れで漂流（空襲後 900 秒）');
  });
  it('ほかの任務（evac なし）は今の見出しのまま（全部の理由・夜明けの秒あり／なし）', () => {
    for (const reason of Object.keys(REASON_LABEL) as MissionEndReason[]) {
      expect(resultHeadingJa(reason, NaN, false, false), reason).toBe(`任務終了 — ${REASON_LABEL[reason]}`);
      expect(resultHeadingJa(reason, 12, true, true), reason).toBe(`任務終了 — ${REASON_LABEL[reason]}（夜明け後 12 秒）（ハード）（史実）`);
      expect(resultHeadingJa(reason, 12, true, true, false), reason).toBe(resultHeadingJa(reason, 12, true, true));
    }
    expect(Object.keys(EVAC_REASON_LABEL).sort()).toEqual(['air_strike', 'destroyed', 'returned']);
  });
});

/** 本文の材料（退避の任務の形） */
const body = (e: EvacResult, o: Partial<ResultBodySource> = {}): ResultBodySource => ({
  hunt: null, pt: null, convoy: null, engine: null, gunboat: null, evac: e, detections: 0, returned: true, objectiveDone: true,
  shots: [], capacity: 0, hits: 0, duds: 0, misses: 0, bands: [], kpi: null, sortie: { historical: false }, ...o,
});

describe('本文（ui/result-body の evac の枝）と「夜明け」なし', () => {
  it('頭の 4 行（24・20・20・20 px。1 行目の後に節の間）。魚雷の行（命中 / 発射・発射なし・通算）は出さない。兵装の 1 行は後ろに', () => {
    const b = resultBodyLines(body(E0), false);
    expect(b.map((l) => [l.text, l.px, l.sectionAfter])).toEqual([
      ['残存 8／18（史実 5） ・ 6 隻以上を残して隠れた', 24, true],
      ['壕 6 ・ 陰 2 ・ 外 0 ／ 沈没 10 ・ 隊ごと 3・2・0・1・2・0', 20, false],
      ['見失わせた 3／狙われた 9 回（戻ってきた 2 回を含む） ・ 撃墜 1 機', 20, false],
      ['爆撃 6 回 ・ 爆弾 40 発 ・ 艇に命中 12 ・ 切替 7 回 ・ 隊長艇の交代 2', 20, false],
    ]);
    const arms = resultBodyLines(body(E0, { arms: { blindTorpedoes: 1 } as never }), false);
    expect(arms.length).toBe(5);
  });
  it('jp_03 の Result の文（見出しの全部の理由・本文・時の行の全部の形・得点の行）に「夜明け」が無い', () => {
    const texts: string[] = [];
    for (const reason of Object.keys(REASON_LABEL) as MissionEndReason[]) for (const s of [NaN, 12]) texts.push(resultHeadingJa(reason, s, true, true, true));
    for (const a of [true, false]) for (const l of resultBodyLines(body(E0, { objectiveDone: a }), false)) texts.push(l.text);
    for (const place of [EVR_NONE, EVR_HIDDEN, EVR_ENTERING, EVR_HAULING, EVR_OUTSIDE]) {
      for (const [reason, ret] of [['returned', true], ['air_strike', false], ['adrift', false]] as const) {
        texts.push(...evacTimeLinesJa({ ...E0, settlePlace: place }, dawn({ caughtOutside: place === EVR_OUTSIDE, strike }), reason, ret));
      }
    }
    const rs = readFileSync(join(__dirname, '..', 'src', 'scenes', 'result-scene.ts'), 'utf8');
    expect(rs).toContain("`（${r.evac ? '空襲後' : '夜明け後'} ×${scoringParams.afterDawnFactor}）`");
    for (const t of texts) expect(t, t).not.toContain('夜明け');
  });
  it('本文の下端 ≤ 592（作るときの y の足し方＝result-scene の line(): 行ごとに字の大きさ ＋ 12、節の間 10。下端は最後の行の y ＋ 行の高さ（字の大きさ × 1.25 で多めに））', () => {
    // 行の多い形: 見出し・本文 4 行・兵装の 1 行・スコア・得点の行・状況の行・時の行・追撃の行・乗員の死傷の行（jp_03 に暴風・味方機・水上機・帰投地点までの行は無い）
    const lines: [number, boolean][] = [[44, false]];
    for (const l of resultBodyLines(body(E0, { arms: { blindTorpedoes: 1 } as never }), false)) lines.push([l.px, l.sectionAfter]);
    lines[lines.length - 1]![1] = true; // 本文の後の節の間
    lines.push([44, false], [20, true], [20, false], [20, false], [20, false], [20, false]);
    let y = 56; // RESULT_TOP_Y
    let lastTop = y;
    for (const [px, sec] of lines) {
      lastTop = y;
      y += px + 12 + (sec ? 10 : 0);
    }
    const bottom = lastTop + Math.ceil(20 * 1.25);
    expect(lines.length).toBe(12);
    expect(bottom).toBeLessThanOrEqual(BODY_MAX_Y);
    expect(bottom).toBe(515);
    // 配線: 時の行は夜明けの行の代わり・帰投地点までの行は出さない・見出しは evac の印
    const rs = readFileSync(join(__dirname, '..', 'src', 'scenes', 'result-scene.ts'), 'utf8');
    expect(rs).toContain('...(r.evac ? evacTimeLinesJa(r.evac, r.dawn, r.reason, r.returned) : [dawnResultLine(r.dawn, r.returned, r.reason === \'cleared\')])');
    expect(rs).toContain('if (!r.returned && !r.evac) {');
    expect(rs).toContain('resultHeadingJa(r.reason, resultDawnSuffixS(r.returned, r.dawn), hardV, r.sortie.historical, r.evac !== undefined)');
    expect(rs).toContain(": r.patrol || r.evac ? '' : ships;");
  });
});
