// 兵装の上の 1 行（v0.6.8 S4。ui/arms-lines・spec-v068 §4.5）: 文と色、どの文も 22 px で 264 px 以内（帯 W − 288〜W − 24）、魚雷の出来事は魚雷の上・ほかは機銃の上、
// 選び方（魚雷を押している間は隠す > 出ている出来事 > 状態 > 無し・出来事は通し番号が変わったときだけ・撃墜は 2.2 秒で飛び出す・Hud を作ったときの通し番号は出さない）。
// S5: Briefing の「条件」のもう一つの兵装の一言（行の数は v0.6.7 の最大を超えない。半角スペースだけで折る模擬）・Title の一言の幅・Result の 1 行の文と並び。
import { describe, expect, it } from 'vitest';
import { enemyNameJa, getBriefingRecord, riskLabelJa } from '../src/config/briefing-data';
import { gameData, getAimAssistLevels } from '../src/config/game-data';
import { TITLE_HINT_BY_CAMPAIGN_JA, TITLE_HINT_PX } from '../src/config/title-hint-config';
import { PATROL_WEAPON_BRIEFING_JA, briefingRows } from '../src/core/briefing';
import { aimAssistStatusJa } from '../src/core/progress';
import { briefingNumbers, buildWorldSetup } from '../src/systems/world-setup';
import { ARMS_BRIEFING_BARGE_JA, ARMS_BRIEFING_SHIP_JA, armsBriefingJa, armsResultLineJa, blindKindJa } from '../src/ui/arms-lines';
import type { ArmsResult } from '../src/ui/result-types';
import { ARMS_CUE_DOWN_MS, ARMS_CUE_TORP_MS, CUE_DOWN_COLOR } from '../src/config/arms-config';
import { CUE_MAX_W, CUE_PX } from '../src/config/hud-layout-config';
import { HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../src/config/hud-text-config';
import {
  CUE_NONE,
  EV_DOWN_SEAPLANE,
  EV_DOWN_SORTIE,
  EV_DOWN_STRIKE,
  EV_TORP_BARGE,
  EV_TORP_EMPTY,
  EV_TORP_NOSHIP,
  EV_TORP_PT,
  ST_AA,
  ST_ARC,
  ST_NONE,
  ST_RELOAD,
  ST_SHIP,
  ST_SMOKE,
  createArmsTelemetry,
} from '../src/core/arms-cue';
import { ArmsCuePicker, armsCueDurationMs, armsCueIsDown, armsCueJa, armsCueOverTorpedo } from '../src/ui/arms-lines';
import { textWidthPx } from './pt-ui-kit';

const EVENTS = [EV_TORP_BARGE, EV_TORP_PT, EV_TORP_NOSHIP, EV_DOWN_STRIKE, EV_DOWN_SEAPLANE, EV_DOWN_SORTIE, EV_TORP_EMPTY];
const STATES = [ST_SHIP, ST_AA, ST_ARC, ST_NONE, ST_SMOKE, ST_RELOAD];

describe('文と色（spec-v068 §4.5）', () => {
  it('出来事の文', () => {
    expect(EVENTS.map((c) => armsCueJa(c, 3).text)).toEqual(['大発の下を抜ける', 'PTの下を抜ける', '狙う艦がいない', '敵機 撃墜！ 残り 3 機', '水上機 撃墜！', '哨戒機 撃墜！', '魚雷は撃ち尽くした']);
  });
  it('状態の文（機銃を押している間）', () => {
    expect(STATES.map((c) => armsCueJa(c, 4).text)).toEqual(['艦には効かない', '対空 ・ まず当たらない', '射界外 ・ 舷側に向けよ', '射程に敵なし', '煙幕で見えない', '弾倉交換 ・ あと 4 秒']);
  });
  it('色: 撃墜は金・艦には効かないは警告・ほかはいつもの白', () => {
    for (const c of [...EVENTS, ...STATES]) {
      const want = armsCueIsDown(c) ? CUE_DOWN_COLOR : c === ST_SHIP ? HUD_COLOR_WARN : HUD_COLOR_STRONG;
      expect(armsCueJa(c, 1).color, String(c)).toBe(want);
    }
  });
  it('無し（CUE_NONE）と知らない番号は空の文', () => {
    expect(armsCueJa(CUE_NONE, 0).text).toBe('');
    expect(armsCueJa(99, 0).text).toBe('');
  });
  it(`どの文も ${CUE_PX} px で ${CUE_MAX_W} px 以内（数は 2 桁まで）`, () => {
    for (const c of [...EVENTS, ...STATES]) for (const n of [0, 4, 9, 99]) expect(textWidthPx(armsCueJa(c, n).text, CUE_PX), `${c} ${n}`).toBeLessThanOrEqual(CUE_MAX_W);
  });
  it('寄せる先: 魚雷の出来事（狙う艦の無い魚雷・0 本）は魚雷の上、撃墜と状態は機銃の上', () => {
    expect(EVENTS.filter(armsCueOverTorpedo)).toEqual([EV_TORP_BARGE, EV_TORP_PT, EV_TORP_NOSHIP, EV_TORP_EMPTY]);
    expect(STATES.some(armsCueOverTorpedo)).toBe(false);
  });
  it('出す秒: 撃墜 2.2 秒・魚雷 1.6 秒', () => {
    expect([armsCueDurationMs(EV_DOWN_STRIKE), armsCueDurationMs(EV_DOWN_SEAPLANE), armsCueDurationMs(EV_DOWN_SORTIE)]).toEqual([ARMS_CUE_DOWN_MS, ARMS_CUE_DOWN_MS, ARMS_CUE_DOWN_MS]);
    expect([armsCueDurationMs(EV_TORP_BARGE), armsCueDurationMs(EV_TORP_EMPTY)]).toEqual([ARMS_CUE_TORP_MS, ARMS_CUE_TORP_MS]);
    expect([ARMS_CUE_DOWN_MS, ARMS_CUE_TORP_MS]).toEqual([2200, 1600]);
  });
});

describe('選び方（ArmsCuePicker）', () => {
  const tele = (): ReturnType<typeof createArmsTelemetry> => createArmsTelemetry();
  it('Hud を作ったときの通し番号の出来事は出さない・状態が無ければ無し', () => {
    const a = tele();
    a.evCode = EV_TORP_PT;
    a.evSeq = 5;
    const p = new ArmsCuePicker(5);
    p.pick(a, 0, false);
    expect([p.code, p.n]).toEqual([CUE_NONE, 0]);
  });
  it('通し番号が変わったら出来事をその秒だけ出し、終われば状態へ（出来事 > 状態）', () => {
    const a = tele();
    const p = new ArmsCuePicker(0);
    a.stCode = ST_AA;
    p.pick(a, 1000, false);
    expect(p.code).toBe(ST_AA);
    a.evCode = EV_DOWN_STRIKE;
    a.evN = 3;
    a.evSeq = 1;
    p.pick(a, 2000, false);
    expect([p.code, p.n, p.popPending]).toEqual([EV_DOWN_STRIKE, 3, true]);
    p.popPending = false;
    p.pick(a, 2000 + ARMS_CUE_DOWN_MS - 1, false);
    expect(p.code).toBe(EV_DOWN_STRIKE);
    p.pick(a, 2000 + ARMS_CUE_DOWN_MS, false);
    expect(p.code).toBe(ST_AA);
    a.stCode = ST_RELOAD;
    a.stN = 2;
    p.pick(a, 5000, false);
    expect([p.code, p.n, p.popPending]).toEqual([ST_RELOAD, 2, false]);
  });
  it('魚雷を押している間は何も出さない（「一斉 N 本」と重ねない）。離せば残りの秒だけ出来事', () => {
    const a = tele();
    const p = new ArmsCuePicker(0);
    a.evCode = EV_TORP_BARGE;
    a.evSeq = 1;
    a.stCode = ST_NONE;
    p.pick(a, 0, true);
    expect(p.code).toBe(CUE_NONE);
    p.pick(a, 500, false);
    expect(p.code).toBe(EV_TORP_BARGE);
    p.pick(a, ARMS_CUE_TORP_MS, false);
    expect(p.code).toBe(ST_NONE);
  });
  it('HUD だけの出来事（0 本で魚雷）: local で始まり 1.6 秒。続く世界の出来事が上書きする', () => {
    const a = tele();
    const p = new ArmsCuePicker(0);
    p.local(EV_TORP_EMPTY, 100);
    p.pick(a, 100, false);
    expect(p.code).toBe(EV_TORP_EMPTY);
    a.evCode = EV_DOWN_SEAPLANE;
    a.evSeq = 1;
    p.pick(a, 200, false);
    expect(p.code).toBe(EV_DOWN_SEAPLANE);
    p.pick(a, 200 + ARMS_CUE_DOWN_MS, false);
    expect(p.code).toBe(CUE_NONE);
  });
});

// ---------- S5: Briefing・Title・Result の文 ----------

/** Briefing の値の行（menu-config の BRIEF_ROW_PX 24・BRIEF_VALUE_WRAP 1056。menu-config は game-config の DOM を引くので値で書く）を Phaser の折り返し（半角スペースでだけ切る）で数える */
const ROW_PX = 24;
const WRAP = 1056;
function wrapLines(text: string, px = ROW_PX, wrap = WRAP): number {
  let n = 1;
  let cur = 0;
  for (const word of text.split(' ')) {
    const w = textWidthPx(word, px);
    const add = (cur === 0 ? 0 : textWidthPx(' ', px)) + w;
    if (cur > 0 && cur + add > wrap) {
      n++;
      cur = w;
    } else cur += add;
  }
  return n;
}
const PLAYABLE = ['us_01', 'us_02', 'us_03', 'jp_06', 'jp_01', 'jp_05', 'jp_02'] as const;
const LEVELS = getAimAssistLevels(gameData);
/** 見越し点マーカーの句: なし・解放前・使わない・使用可・史実モード（briefing-scene が条件の行に足す） */
const AIM = ['', aimAssistStatusJa(LEVELS, 0, false, true), aimAssistStatusJa(LEVELS, 3, false, false), aimAssistStatusJa(LEVELS, 3, false, true), aimAssistStatusJa(LEVELS, 0, true, true)];
const nameOf = (e: string): string => enemyNameJa(gameData, e);
const labelOf = (h: string): string => riskLabelJa(gameData, h);
/** 条件の行（v0.6.8）と、もう一つの兵装の一言を除いた v0.6.7 の行（jp_02 は武器の句を v0.6.7 の「武器なし（…）」に戻す） */
function conditionRows(id: string, hard: boolean, aim: string): { now: string; v067: string } {
  const s = buildWorldSetup(gameData, id, { hard });
  const rec = { ...getBriefingRecord(gameData, id, hard), hazardIds: s.hazardsTonight, absentHazardIds: s.absentHazards };
  const n = briefingNumbers(s, aim);
  const old = { ...n };
  delete old.secondaryJa;
  if (old.weaponJa !== undefined) old.weaponJa = old.weaponJa.replace(PATROL_WEAPON_BRIEFING_JA, '武器なし（止まって隠れ、投下で転舵）');
  return { now: briefingRows(rec, n, nameOf, labelOf)[5]!.text, v067: briefingRows(rec, old, nameOf, labelOf)[5]!.text };
}

describe('Briefing の「条件」のもう一つの兵装の一言（v0.6.8 S5。spec-v068 §4.6）', () => {
  it('WorldSetup だけから: 魚雷が主の艦の任務は「機銃は艦に効かない」、大発の任務は「魚雷は大発の下を抜ける」、米PT と jp_02 は無い（鍵ごと省く）', () => {
    const want: Record<string, string | undefined> = { us_01: ARMS_BRIEFING_SHIP_JA, us_02: ARMS_BRIEFING_SHIP_JA, jp_06: ARMS_BRIEFING_SHIP_JA, us_03: ARMS_BRIEFING_BARGE_JA, jp_01: undefined, jp_05: undefined, jp_02: undefined };
    for (const id of PLAYABLE) {
      const s = buildWorldSetup(gameData, id);
      const n = briefingNumbers(s);
      expect(n.secondaryJa, id).toBe(want[id]);
      expect('secondaryJa' in n, id).toBe(want[id] !== undefined);
      expect(armsBriefingJa(s), id).toBe(want[id] ?? '');
    }
    for (const t of [ARMS_BRIEFING_SHIP_JA, ARMS_BRIEFING_BARGE_JA]) expect(t).not.toContain(' '); // 半角スペースを入れない（jp05-mission の規則）
  });
  it('「・」の後はノーブレークスペース（「・」を行末に残さない）。見越し点マーカーの句はもう一つの兵装の一言の後ろ', () => {
    const { now } = conditionRows('us_01', false, AIM[1]!);
    expect(now).toBe(`夜明けまで 180 秒（以後は空襲） ・ 燃料 40 gal ・ 魚雷 4 本 ・\u00a0機銃は艦に効かない ・ ${AIM[1]!}`);
    expect(conditionRows('us_03', false, '').now.endsWith(' ・\u00a0魚雷は大発の下を抜ける')).toBe(true);
    expect(conditionRows('jp_01', false, '').now).toBe(conditionRows('jp_01', false, '').v067); // 米PT の任務は変わらない（武器の句が既に「魚雷はPTの下を抜ける」）
    expect(conditionRows('jp_05', false, '').now).toBe(conditionRows('jp_05', false, '').v067);
  });
  it('行の数（24 px・折り返し 1,056 px・半角スペースでだけ切る）: どの任務・どのマーカーの句でも、v0.6.7 のその任務の最大（us_03 は 3、ほかは 2）を超えない', () => {
    const got: Record<string, string> = {};
    for (const id of PLAYABLE) {
      for (const hard of [false, true]) {
        const r = AIM.map((a) => conditionRows(id, hard, a));
        const maxOld = Math.max(...r.map((x) => wrapLines(x.v067)));
        expect(maxOld, `${id} ${hard}`).toBe(id === 'us_03' ? 3 : 2);
        for (const x of r) expect(wrapLines(x.now), `${id} ${hard} ${x.now}`).toBeLessThanOrEqual(maxOld);
        if (!hard) got[id] = r.map((x) => `${wrapLines(x.v067)}→${wrapLines(x.now)}`).join(' ');
      }
    }
    // spec-v068 §4.6 の表（[なし, 解放前, 使わない, 使用可, 史実]。マーカーの句の出ない米PT と jp_02 は 5 つとも同じ）
    expect(got).toEqual({
      us_01: '1→1 2→2 2→2 2→2 2→2',
      us_02: '1→2 2→2 2→2 2→2 2→2',
      us_03: '2→2 3→3 2→3 3→3 2→3',
      jp_06: '1→1 2→2 2→2 2→2 2→2',
      jp_01: '2→2 2→2 2→2 2→2 2→2',
      jp_05: '2→2 2→2 2→2 2→2 2→2',
      jp_02: '2→2 2→2 2→2 2→2 2→2',
    });
  });
  it('どの任務の「条件」にも「武器なし」は無い（jp_02 は「機銃は機にまず当たらない」）', () => {
    for (const id of PLAYABLE) for (const hard of [false, true]) expect(conditionRows(id, hard, '').now, id).not.toContain('武器なし');
    expect(conditionRows('jp_02', false, '').now).toContain('機銃は機にまず当たらない（止まって隠れ、投下で転舵）');
  });
});

describe('Title の操作の一言（v0.6.8 S5）', () => {
  it('米PT は 1 列の 960 px の内（792 px）、日本は 1,170 px（格子の 1,218 px の内）。どちらも「魚雷と機銃」「隅の大きいボタン」', () => {
    const us = TITLE_HINT_BY_CAMPAIGN_JA['us_pt']!;
    const jp = TITLE_HINT_BY_CAMPAIGN_JA['jp_hard']!;
    expect(textWidthPx(us, TITLE_HINT_PX)).toBeLessThanOrEqual(960);
    expect(Math.round(textWidthPx(us, TITLE_HINT_PX))).toBe(792);
    expect(Math.round(textWidthPx(jp, TITLE_HINT_PX))).toBe(1170);
    for (const h of [us, jp]) {
      expect(h).toContain('魚雷と機銃');
      expect(h).toContain('隅の大きいボタン');
      expect(h).not.toContain('角の大きい'); // 扇の角度のボタンと紛れる（レビュー F6）
    }
    expect(us).toContain('その上で煙幕');
    expect(us).not.toContain('右上');
  });
});

const NONE: ArmsResult = { shipRounds: 0, shipHits: 0, aaRounds: 0, downs: 0, downsSeaplane: 0, downsSortie: 0, blindTorpedoes: 0, blindKind: 'noship' };

describe('Result の兵装の 1 行（v0.6.8 S5。spec-v068 §4.7）', () => {
  it('数が 0 の部分は出さず、艦への機銃 → 対空 → 狙う艦の無い魚雷の順に「 ・ 」でつなぐ', () => {
    expect(armsResultLineJa(NONE)).toBe('');
    expect(armsResultLineJa({ ...NONE, shipRounds: 142, shipHits: 30, aaRounds: 218, downs: 1, downsSeaplane: 1, blindTorpedoes: 4 })).toBe('機銃 艦へ 142 発（命中 30・効かない） ・ 対空 218 発 撃墜 1 機（水上機） ・ 魚雷 4 本（狙う艦なし）');
    expect(armsResultLineJa({ ...NONE, shipRounds: 12, shipHits: 0 })).toBe('機銃 艦へ 12 発（命中 0・効かない）');
    expect(armsResultLineJa({ ...NONE, aaRounds: 45, downs: 0 })).toBe('対空 45 発 撃墜 0 機');
    expect(armsResultLineJa({ ...NONE, aaRounds: 90, downs: 2 })).toBe('対空 90 発 撃墜 2 機');
    expect(armsResultLineJa({ ...NONE, blindTorpedoes: 2, blindKind: 'pt' })).toBe('魚雷 2 本（PTの下を抜けた）');
    expect(armsResultLineJa({ ...NONE, blindTorpedoes: 4, blindKind: 'barge', aaRounds: 3 })).toBe('対空 3 発 撃墜 0 機 ・ 魚雷 4 本（大発の下を抜けた）');
  });
  it('撃墜の内訳: 哨戒機だけなら「（哨戒機）」、夜明けの空襲と混ざれば「（うち哨戒機 N）」（jp_02。レビュー F10）', () => {
    expect(armsResultLineJa({ ...NONE, aaRounds: 120, downs: 2, downsSortie: 2, blindTorpedoes: 2 })).toBe('対空 120 発 撃墜 2 機（哨戒機） ・ 魚雷 2 本（狙う艦なし）');
    expect(armsResultLineJa({ ...NONE, aaRounds: 260, downs: 3, downsSortie: 1, blindTorpedoes: 2 })).toBe('対空 260 発 撃墜 3 機（うち哨戒機 1） ・ 魚雷 2 本（狙う艦なし）');
  });
  it('行き先の文と幅: 最長の例は 20 px で 1,041 px（W 1280 の 1,232 px に収まる）', () => {
    expect(['barge', 'pt', 'noship'].map((k) => blindKindJa(k as ArmsResult['blindKind']))).toEqual(['大発の下を抜けた', 'PTの下を抜けた', '狙う艦なし']);
    const longest = armsResultLineJa({ ...NONE, shipRounds: 142, shipHits: 30, aaRounds: 218, downs: 1, downsSeaplane: 1, blindTorpedoes: 4 });
    expect(Math.round(textWidthPx(longest, 20))).toBe(1041);
    expect(textWidthPx(longest, 20)).toBeLessThanOrEqual(1280 - 48);
  });
});
