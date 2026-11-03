// v0.6.10 S6（spec-v0610 part 2 の S6・リードの決定 LD3・LD4・LD8）: 卯月のいる jp_04 の HUD の 2 行目。
// t.ally（systems/ally-telemetry: 出撃で決まる呼び名・帰投の輪の呼びかけ・平常の行の末尾、毎フレームの「最後の砲の出来事は卯月」）、ui/ally-lines の文とキー
// （照らされた斉射・撃たずに去った・平常の行の末尾「走らせれば卯月が照らす」はノーマルだけ・「帰投の輪で揚陸を待て」）、ui/pt-gun-lines の出来事の頭「卯月 撃退！」、
// ui/pt-line-clock の重さ（撃たずに去ったは待っている斉射を消さない・照らされた斉射は足す）、22 px で 840 px の内、キーが同じ ⇔ 文が同じ、卯月の無い夜は前の文とキー。
// mission-line と同じ順（モード → キー → 文。tests/landing-ui-kit の frame）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG } from '../src/config/hud-text-config';
import { PT_SHELL_POOL_SIZE } from '../src/config/pt-config';
import { createAllyTelemetry } from '../src/core/ally-telemetry';
import { DAWN_AIR_ENEMY, createDawnTelemetry } from '../src/core/dawn-air';
import { LE_CALM, LE_HIT, LE_HURRIED, LE_LIT_AWAY, LE_LIT_SALVO, type LandingTelemetry } from '../src/core/landing';
import { CALL_DAWN, CALL_FUEL } from '../src/core/mission-flow';
import { createPtSection, type PtTelemetry } from '../src/core/pt-boats';
import { PT_GUN_EV_CREW, PT_GUN_EV_HULL, PT_GUN_EV_SUNK, PT_GUN_EV_SUPPRESS } from '../src/core/pt-damage';
import { initAllyTelemetry, refreshAllyTelemetry, type AllyTelemetryWorld } from '../src/systems/ally-telemetry';
import { buildWorldSetup } from '../src/systems/world-setup';
import { ALLY_RING_JA, K_ALLY_EVENT, allyEventKey, allyEventLine, allyRunTailJa } from '../src/ui/ally-lines';
import { callLineText } from '../src/ui/dawn-lines';
import { landingEventKey, landingEventLine, landingNormalLine } from '../src/ui/landing-lines';
import { MISSION_CALL, MISSION_LANDING_EVENT, MISSION_PT, MISSION_PT_GUN_EVENT, MODE_FLAG_LANDING_EVENT, MODE_FLAG_PT_GUN_EVENT } from '../src/ui/mission-mode';
import { PtLineClock } from '../src/ui/pt-line-clock';
import { mergeBurstBits, ptGunEventKey } from '../src/ui/pt-gun-lines';
import { L0, S04, S04H, ally0, frame, landing0, tl, tla } from './landing-ui-kit';
import { LINE2_MAX_PX, tele, textWidthPx } from './pt-ui-kit';

const NAME = '卯月';
const EV = MODE_FLAG_LANDING_EVENT;
const GUN = MODE_FLAG_PT_GUN_EVENT;
/** 見えていない・気づかれていない 2 隻（平常の行） */
const QUIET: Partial<PtTelemetry> = { alive: 2, detected: false, sighted: false, passing: false };
/** みな去った（海域の外） */
const GONE: Partial<PtTelemetry> = { alive: 0, out: 2, sunk: 0, detected: false, sighted: false };
/** 揚陸の出来事（既定は揚陸中・被雷なし・まだ撃てる米PT が 1 隻） */
const ev = (o: Partial<LandingTelemetry>): Partial<LandingTelemetry> => ({ eventSeq: 1, eventDirIdx: 2, eventCount: 3, eventM: NaN, eventHits: 0, eventPct: 0.5, eventArmed: 1, eventBoats: 0, ...o });
const DAWN = { dawn: { ...createDawnTelemetry(), reached: true, air: DAWN_AIR_ENEMY } };
const code = (f: string): string => readFileSync(join(__dirname, '..', 'src', f), 'utf8');

/** MissionWorld と同じ形の世界（揚陸の世界の卯月は data の値と手柄だけ。ally が null なら卯月の無い夜） */
function allyWorld(id: string, o: { hard?: boolean; allyOff?: boolean } = {}): AllyTelemetryWorld & { section: ReturnType<typeof createPtSection>; credit: { eventSeq: number } | null } {
  const s = buildWorldSetup(gameData, id, { hard: o.hard ?? false, allyOff: o.allyOff ?? false });
  const section = createPtSection(s.ptBoats!, PT_SHELL_POOL_SIZE);
  const credit = s.allyDestroyer ? { hits: 0, suppressions: 0, eventSeq: 0, fateBy: new Int8Array(section.boats.length) } : null;
  const ally = s.allyDestroyer && credit ? { a: { p: s.allyDestroyer, credit } } : null;
  return { landing: s.landing ? { ally } : null, pts: { section }, setup: { hard: s.hard }, section, credit };
}

describe('t.ally（systems/ally-telemetry）', () => {
  it('jp_04: ノーマルは呼び名「卯月」・帰投の輪の呼びかけ・平常の行の末尾あり、ハードは末尾なし（LD4）。&noally と卯月の無い任務は createAllyTelemetry のまま', () => {
    expect(initAllyTelemetry(allyWorld('jp_04'))).toEqual({ enabled: true, labelJa: NAME, ringCall: true, runHint: true, gunEvent: false });
    expect(initAllyTelemetry(allyWorld('jp_04', { hard: true }))).toEqual({ enabled: true, labelJa: NAME, ringCall: true, runHint: false, gunEvent: false });
    expect(ally0()).toEqual({ enabled: true, labelJa: NAME, ringCall: true, runHint: true, gunEvent: false });
    expect(ally0(true).runHint).toBe(false);
    expect(S04.allyDestroyer!.labelJa).toBe(NAME);
    expect(S04H.allyDestroyer!.ringCallBeforeDawn).toBe(true);
    for (const hard of [false, true]) {
      const w = allyWorld('jp_04', { hard, allyOff: true });
      const t = initAllyTelemetry(w);
      w.section.gunEventSeq = 1;
      refreshAllyTelemetry(t, w);
      expect(t).toEqual(createAllyTelemetry());
    }
    for (const id of ['jp_01', 'jp_05']) {
      const w = allyWorld(id);
      expect(w.landing).toBe(null);
      const t = initAllyTelemetry(w);
      w.section.gunEventSeq = 2;
      refreshAllyTelemetry(t, w);
      expect(t).toEqual(createAllyTelemetry());
    }
  });

  it('gunEvent: 隊の最後の砲の出来事の通し番号が卯月の手柄の eventSeq と同じ（0 は無し）。自艇の砲が後に出来事を起こせば偽', () => {
    const w = allyWorld('jp_04');
    const t = initAllyTelemetry(w);
    const steps: Array<[number, number, boolean]> = [[0, 0, false], [1, 0, false], [1, 1, true], [2, 1, false], [3, 3, true]];
    for (const [seq, cr, want] of steps) {
      w.section.gunEventSeq = seq;
      w.credit!.eventSeq = cr;
      refreshAllyTelemetry(t, w);
      expect(t.gunEvent, `${seq} ${cr}`).toBe(want);
    }
  });

  it('配線: createTelemetry で 1 回・毎フレームは refreshPtTelemetry の後に 1 回。refresh は確保しない（比べるだけ）', () => {
    expect(code('systems/telemetry-create.ts')).toContain('ally: initAllyTelemetry(w),');
    const m = code('systems/mission-telemetry.ts');
    expect(m.indexOf('refreshAllyTelemetry(t.ally, w);')).toBeGreaterThan(m.indexOf('refreshPtTelemetry(t.pt, w);'));
    const r = code('systems/ally-telemetry.ts');
    const body = r.slice(r.indexOf('export function refreshAllyTelemetry'));
    expect(body).not.toMatch(/new |\[\]|=> |\{ [a-z]+:/);
    expect(r).not.toMatch(/^import .*(phaser|world-ally|mission-world)/m);
  });
});

describe('平常の行の末尾（LD4。ノーマルだけ・840 px の内）', () => {
  it('ノーマルの卯月のいる夜は撃てる米PT がいる間「 ・ 走らせれば卯月が照らす」', () => {
    expect(frame(tla({ pct: 0.995, armed: 2 }, QUIET))).toMatchObject({ mode: MISSION_PT, text: '揚陸 99% ・ 米PT 2 隻が北と東から輸送船を狙う ・ 走らせれば卯月が照らす', color: HUD_COLOR_STRONG });
    expect(frame(tla({ pct: 0.5, armed: 1 }, QUIET)).text).toBe('揚陸 50% ・ 米PT 残り 1 隻が輸送船を狙う ・ 走らせれば卯月が照らす');
    expect(frame(tla({ pct: 0.5, armed: 0 }, { ...QUIET, alive: 1 })).text).toBe('揚陸 50% ・ 米PT はもう魚雷を撃てない');
    expect(allyRunTailJa(ally0(), 1)).toBe(' ・ 走らせれば卯月が照らす');
  });
  it('ハード・卯月の無い夜は末尾なし（前の文）', () => {
    expect(frame(tla({ pct: 0.995, armed: 3 }, { ...QUIET, alive: 3 }, {}, true)).text).toBe('揚陸 99% ・ 米PT 3 隻が北・東・北東から輸送船を狙う');
    expect(frame(tla({ pct: 0.5, armed: 1 }, QUIET, {}, true)).text).toBe('揚陸 50% ・ 米PT 残り 1 隻が輸送船を狙う');
    expect(frame(tl({ pct: 0.995, armed: 2 }, QUIET)).text).toBe('揚陸 99% ・ 米PT 2 隻が北と東から輸送船を狙う');
    expect(allyRunTailJa(createAllyTelemetry(), 2)).toBe('');
    expect(allyRunTailJa({ ...ally0(), enabled: false }, 2)).toBe('');
  });
  it('末尾を付けた行は 100% でも 840 px の内、ハードに付けると収まらない（だから付けない）', () => {
    for (const armed of [1, 2]) expect(textWidthPx(landingNormalLine(tla({ pct: 1, armed })).text, 22)).toBeLessThanOrEqual(LINE2_MAX_PX);
    const hardWith = landingNormalLine(tla({ pct: 1, armed: 3 }, {}, { ally: { ...ally0(true), runHint: true } }, true)).text;
    expect(hardWith).toContain('走らせれば');
    expect(textWidthPx(hardWith, 22)).toBeGreaterThan(LINE2_MAX_PX);
  });
  it('キーは前のまま（撃てる隻数が文の末尾の有無も決める＝キーに入っている）', () => {
    for (const armed of [0, 1, 2]) expect(frame(tla({ pct: 0.5, armed }, QUIET)).keys.lKey).toBe(frame(tl({ pct: 0.5, armed }, QUIET)).keys.lKey);
  });
});

describe('帰投の輪の呼びかけ（LD3）', () => {
  it('卯月のいる夜の夜明け近し（決着の前）は「夜明け近し ・ 帰投の輪で揚陸を待て あと N 秒」、夜明けの後は頭が「空襲下 」', () => {
    expect(frame(tla({ leftS: 61.2 }, QUIET), CALL_DAWN)).toMatchObject({ mode: MISSION_CALL, text: '夜明け近し ・ 帰投の輪で揚陸を待て あと 62 秒' });
    expect(callLineText(tla({ leftS: 61.2 }, QUIET, DAWN), CALL_DAWN, 9)).toBe('空襲下 ・ 帰投の輪で揚陸を待て あと 62 秒');
    expect(callLineText(tla({ leftS: 61.2 }, QUIET, {}, true), CALL_DAWN, 9)).toBe('夜明け近し ・ 帰投の輪で揚陸を待て あと 62 秒');
  });
  it('卯月の無い夜・呼びかけが偽の夜は前の文（「夜明け近し ・ 揚陸を待て」）。燃料少・決着の後は前のまま', () => {
    expect(callLineText(tl({ leftS: 61.2 }, QUIET), CALL_DAWN, 9)).toBe('夜明け近し ・ 揚陸を待て あと 62 秒');
    expect(callLineText(tla({ leftS: 61.2 }, QUIET, { ally: { ...ally0(), ringCall: false } }), CALL_DAWN, 9)).toBe('夜明け近し ・ 揚陸を待て あと 62 秒');
    for (const t of [tl({ leftS: 61.2 }, QUIET), tla({ leftS: 61.2 }, QUIET)]) expect(callLineText(t, CALL_FUEL, 9)).toBe('燃料少 ・ 揚陸まで あと 62 秒 ・ 帰投の輪で止まって待て');
    expect(callLineText(tla({ resolved: true, phase: 1 }, QUIET), CALL_DAWN, 9)).toBe(callLineText(tl({ resolved: true, phase: 1 }, QUIET), CALL_DAWN, 9));
  });
  it('みな去った後の待ち: 夜明けの後（呼びかけが立っている）は「帰投の輪で揚陸を待て」、夜明けの前は前の文（呼びかけの行が別に出る）', () => {
    expect(frame(tla({ leftS: 61.2 }, GONE, DAWN), CALL_DAWN).text).toBe('夜明け ・ 米PT は北へ去った ・ 帰投の輪で揚陸を待て あと 62 秒');
    expect(frame(tl({ leftS: 61.2 }, GONE, DAWN), CALL_DAWN).text).toBe('夜明け ・ 米PT は北へ去った ・ 揚陸を待て あと 62 秒');
    expect(frame(tla({ leftS: 61.2 }, GONE)).text).toBe('米PT は北へ去った ・ 揚陸を待て あと 62 秒');
  });
  it('「卯月に任せて」とは言わない（卯月は北・北東の PT を見ない）。語は「帰投の輪で」', () => {
    expect(ALLY_RING_JA).toBe('帰投の輪で');
    const lines = [frame(tla({ leftS: 255 }, QUIET), CALL_DAWN).text, callLineText(tla({ leftS: 255 }, QUIET, DAWN), CALL_DAWN, 9), frame(tla({ leftS: 255 }, GONE, DAWN), CALL_DAWN).text];
    for (const s of lines) {
      expect(s).not.toMatch(/任せ/);
      expect(textWidthPx(s, 22), s).toBeLessThanOrEqual(LINE2_MAX_PX);
    }
  });
});

describe('卯月の砲の出来事（13mm/25mm の出来事の行。頭の名）', () => {
  const gun = { ...QUIET, alive: 1, fighting: 1, gunEventSeq: 1, gunEvent: PT_GUN_EV_HULL, gunEventBoat: 0 };
  const allyEv = { ally: { ...ally0(), gunEvent: true } };
  it('卯月の砲が起こした出来事は「卯月 撃退！ 米PT 1 隻が離脱」「卯月 撃沈！ 米PT 1 隻」「卯月 制圧！ 米PT 追撃をやめた」（味方の青）。自艇の砲の出来事は前の文', () => {
    expect(frame(tla({}, gun, allyEv), 0, GUN)).toMatchObject({ mode: MISSION_PT_GUN_EVENT, text: '卯月 撃退！ 米PT 1 隻が離脱 ・ 残り 1 隻', color: HOME_COLOR_TEXT });
    expect(frame(tla({}, { ...gun, gunEvent: PT_GUN_EV_CREW }, allyEv), 0, GUN).text).toBe('卯月 撃退！ 米PT 1 隻が離脱 ・ 残り 1 隻');
    expect(frame(tla({}, { ...gun, gunEvent: PT_GUN_EV_SUNK, fighting: 0 }, allyEv), 0, GUN).text).toBe('卯月 撃沈！ 米PT 1 隻 ・ 揚陸を待て');
    expect(frame(tla({}, { ...gun, gunEvent: PT_GUN_EV_SUPPRESS }, allyEv), 0, GUN).text).toBe('卯月 制圧！ 米PT 追撃をやめた ・ 残り 1 隻');
    expect(frame(tla({}, gun), 0, GUN).text).toBe('米PT 撃退！ 穴だらけで離脱 ・ 残り 1 隻');
    expect(frame(tl({}, gun), 0, GUN).text).toBe('米PT 撃退！ 穴だらけで離脱 ・ 残り 1 隻');
  });
  it('キー: 卯月の印は bit 16（隼艇の 15 の隣）。卯月の無い夜・自艇の出来事は前のキー', () => {
    expect(K_ALLY_EVENT).toBe(1 << 16);
    const own = ptGunEventKey(tla({}, gun));
    expect(own).toBe(ptGunEventKey(tl({}, gun)));
    expect(ptGunEventKey(tla({}, gun, allyEv))).toBe(own | K_ALLY_EVENT);
    expect(frame(tla({}, gun, allyEv), 0, GUN).keys.pKey).not.toBe(frame(tla({}, gun), 0, GUN).keys.pKey);
  });
  it('足した連射の結果は「自艇 被弾 N 発」（頭の卯月の被弾に読めない）。1 回の連射の弾をみな受けても 840 px の内', () => {
    const hits = S04.ptBoats!.burstRounds;
    const merge = mergeBurstBits(tele({ lastPassFired: true, lastPassHits: hits }).pt);
    for (const gunEvent of [PT_GUN_EV_HULL, PT_GUN_EV_SUNK, PT_GUN_EV_SUPPRESS]) {
      for (const fighting of [0, 1]) {
        const text = frame(tla({}, { ...gun, gunEvent, fighting }, allyEv), 0, GUN, 0, merge).text;
        expect(text).toContain(` ・ 自艇 被弾 ${hits} 発（HP −${hits * S04.ptBoats!.hit.damage}）`);
        expect(text.startsWith(NAME)).toBe(true);
        expect(textWidthPx(text, 22), text).toBeLessThanOrEqual(LINE2_MAX_PX);
      }
    }
    expect(frame(tla({}, gun), 0, GUN, 0, merge).text).toContain('・ 連射 被弾');
  });
});

describe('モード 35 の卯月の出来事（照らされた斉射・撃たずに去った）', () => {
  it('照らされた斉射: 1 隻は輸送船から見た方角と距離（100 m 切り上げ）と本数、足した斉射は隻数と本数（強調色・外れやすい）', () => {
    expect(frame(tla(ev({ eventKind: LE_LIT_SALVO, eventM: 812, eventDirIdx: 2 }), QUIET), 0, EV)).toMatchObject({ mode: MISSION_LANDING_EVENT, text: '米PT 照らされて発射！ 輸送船の東 900 m から 3 本 ・ 外れやすい', color: HUD_COLOR_STRONG });
    expect(frame(tla(ev({ eventKind: LE_LIT_SALVO, eventM: 812, eventBoats: 2, eventCount: 6 }), QUIET), 0, EV).text).toBe('米PT 2 隻が照らされて発射！ 輸送船へ 6 本 ・ 外れやすい');
  });
  it('撃たずに去った（味方の青）: 揚陸の決着の前はまだ撃てる米PT の数か「撃てる米PT はもういない」、揚陸完了・沈没の後は句なし', () => {
    expect(frame(tla(ev({ eventKind: LE_LIT_AWAY, eventArmed: 1 }), QUIET), 0, EV)).toMatchObject({ mode: MISSION_LANDING_EVENT, text: '卯月が照らした！ 米PT は撃たずに去る ・ 残り 1 隻が輸送船を狙う', color: HOME_COLOR_TEXT });
    expect(frame(tla(ev({ eventKind: LE_LIT_AWAY, eventArmed: 0 }), QUIET), 0, EV).text).toBe('卯月が照らした！ 米PT は撃たずに去る ・ 撃てる米PT はもういない');
    expect(frame(tla(ev({ eventKind: LE_LIT_AWAY, eventArmed: 2, eventPct: 1 }), QUIET), 0, EV).text).toBe('卯月が照らした！ 米PT は撃たずに去る');
    expect(frame(tla(ev({ eventKind: LE_LIT_AWAY, eventArmed: 2, eventHits: L0.hitsToSink, eventPct: 0.4 }), QUIET), 0, EV).text).toBe('卯月が照らした！ 米PT は撃たずに去る');
  });
  it('名は t.ally.labelJa（landingLine が渡す）。ほかの種類は ui/ally-lines では空', () => {
    expect(allyEventLine({ ...L0, ...ev({ eventKind: LE_LIT_AWAY }) }, 'X').text).toBe('Xが照らした！ 米PT は撃たずに去る ・ 残り 1 隻が輸送船を狙う');
    expect(allyEventLine({ ...L0, ...ev({ eventKind: LE_HIT }) }, NAME).text).toBe('');
    expect(landingEventLine({ ...L0, ...ev({ eventKind: LE_LIT_AWAY }) }, NAME).text).toContain('卯月が照らした！');
  });
  it('キーが同じ ⇔ 文が同じ（照らされた斉射は方角・距離・本数・隻数、撃たずに去ったは句と撃てる隻数）。ほかの種類のキーとも重ならない', () => {
    const rows: Array<[number, string]> = [];
    const add = (o: Partial<LandingTelemetry>): void => {
      const l = { ...landing0(), ...ev(o) };
      rows.push([landingEventKey(l), landingEventLine(l, NAME).text]);
    };
    for (const dir of [0, 3]) for (const m of [812, 899, 1250]) for (const n of [3, 6]) for (const boats of [0, 1, 2, 3]) add({ eventKind: LE_LIT_SALVO, eventDirIdx: dir, eventM: m, eventCount: n, eventBoats: boats });
    for (const armed of [0, 1, 2, 3]) for (const pct of [0.3, 1]) for (const hits of [0, 1, 2]) for (const dir of [0, 5]) add({ eventKind: LE_LIT_AWAY, eventArmed: armed, eventPct: pct, eventHits: hits, eventDirIdx: dir });
    for (const k of [LE_CALM, LE_HURRIED, LE_HIT]) for (const m of [812, 1250]) add({ eventKind: k, eventM: m });
    for (const r of rows) expect(r[1]).not.toBe('');
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) expect(rows[i]![0] === rows[j]![0], `${rows[i]![1]} / ${rows[j]![1]}`).toBe(rows[i]![1] === rows[j]![1]);
    expect(allyEventKey({ ...L0, ...ev({ eventKind: LE_LIT_SALVO, eventM: 812 }) })).toBe(landingEventKey({ ...L0, ...ev({ eventKind: LE_LIT_SALVO, eventM: 812 }) }));
  });
  it('どの行も最大の値（63 の刻み・15 本・3 隻・撃てる 3 隻）で 22 px・840 px の内', () => {
    const texts = [
      frame(tla(ev({ eventKind: LE_LIT_SALVO, eventM: 6300, eventDirIdx: 7, eventCount: 15 }), QUIET), 0, EV).text,
      frame(tla(ev({ eventKind: LE_LIT_SALVO, eventM: 6300, eventBoats: 3, eventCount: 15 }), QUIET), 0, EV).text,
      ...[0, 3].map((armed) => frame(tla(ev({ eventKind: LE_LIT_AWAY, eventArmed: armed }), QUIET, {}, true), 0, EV).text),
    ];
    for (const s of texts) {
      expect(s).not.toBe('');
      expect(textWidthPx(s, 22), s).toBeLessThanOrEqual(LINE2_MAX_PX);
    }
  });
});

describe('pt-line-clock の重さ（撃たずに去ったは待っている斉射を消さない・照らされた斉射は足す）', () => {
  const F = 1000 / 60;
  /** 1 フレームずつ mission-line と同じ順で進め、出た 2 行目の文を順に（同じ文が続けば 1 回） */
  function run(seq: Array<[number, Partial<LandingTelemetry>]>, endMs: number): string[] {
    const c = new PtLineClock();
    let mode = -1;
    let ms = 0;
    let k = 0;
    let l: Partial<LandingTelemetry> = {};
    const shown: string[] = [];
    while (ms <= endMs) {
      while (k < seq.length && seq[k]![0] <= ms) l = { ...seq[k++]![1] };
      const t = tla(l, QUIET);
      const flags = c.flags(t, ms, mode);
      const f = frame(t, 0, flags, 0, c.merge, c.landingEv);
      c.shown(f.mode, ms);
      mode = f.mode;
      if (f.mode === MISSION_LANDING_EVENT && shown[shown.length - 1] !== f.text) shown.push(f.text);
      ms += F;
    }
    return shown;
  }
  const hit = { eventSeq: 1, eventKind: LE_HIT, eventHits: 1, eventBoat: 0, eventM: NaN, eventPct: 0.5, eventArmed: 1 };
  const calm = { eventSeq: 2, eventKind: LE_CALM, eventHits: 1, eventBoat: 1, eventM: 1800, eventCount: 3, eventBoats: 1, eventDirIdx: 0, eventPct: 0.5, eventArmed: 0 };
  const away = (seq: number) => ({ eventSeq: seq, eventKind: LE_LIT_AWAY, eventHits: 1, eventBoat: 1, eventM: NaN, eventCount: 0, eventBoats: 0, eventPct: 0.5, eventArmed: 0 });
  const HIT_JA = '輸送船 被雷！ あと 1 本で沈む';
  const CALM_JA = '米PT 雷撃！ 北から輸送船へ 3 本';
  it('待っている斉射の後に来た撃たずに去ったは斉射に替わらない（前は沈没と同じ重さで斉射を消した）', () => {
    expect(run([[0, hit], [300, calm], [600, away(3)]], 9000)).toEqual([HIT_JA, CALM_JA]);
  });
  it('待っている撃たずに去ったは後から来た斉射に替わる', () => {
    expect(run([[0, hit], [300, away(2)], [600, { ...calm, eventSeq: 3 }]], 9000)).toEqual([HIT_JA, CALM_JA]);
  });
  it('待つものが無ければ撃たずに去ったも出る', () => {
    expect(run([[0, hit], [300, away(2)]], 9000)).toEqual([HIT_JA, '卯月が照らした！ 米PT は撃たずに去る ・ 撃てる米PT はもういない']);
  });
  it('出たとみなす前の照らされた斉射に次の照らされた斉射が来れば足す（同じ種類の斉射）', () => {
    const lit = (seq: number, i: number) => ({ eventSeq: seq, eventKind: LE_LIT_SALVO, eventHits: 0, eventBoat: i, eventM: 900, eventCount: 3, eventBoats: 1, eventDirIdx: 2, eventPct: 0.5, eventArmed: 0 });
    expect(run([[0, lit(1, 0)], [500, lit(2, 1)]], 9000)).toEqual(['米PT 照らされて発射！ 輸送船の東 900 m から 3 本 ・ 外れやすい', '米PT 2 隻が照らされて発射！ 輸送船へ 6 本 ・ 外れやすい']);
  });
});

describe('卯月の無い夜は前の文とキー', () => {
  it('ally の無いテレメトリでは末尾・輪の語・卯月の頭が出ない（jp_04 の &noally・ほかの任務）', () => {
    const a = createAllyTelemetry();
    expect(allyRunTailJa(a, 3)).toBe('');
    expect(frame(tl({ leftS: 10 }, QUIET), CALL_DAWN).text).toBe('夜明け近し ・ 揚陸を待て あと 10 秒');
    expect(frame(tl({}, QUIET)).text).not.toContain(NAME);
    const g = { ...QUIET, alive: 1, fighting: 1, gunEventSeq: 1, gunEvent: PT_GUN_EV_SUNK, gunEventBoat: 0 };
    expect(ptGunEventKey(tele(g)) & K_ALLY_EVENT).toBe(0);
  });
});
