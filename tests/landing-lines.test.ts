// v0.6.9 S6a（spec-v069 §5.2・§5.3・R4・R8（F13d・F14・F16）・R12）: 揚陸の任務（jp_04）の 2 行目と右上の時計の文（ui/landing-lines）。
// mission-line と同じ順（モード → キー → 文。tests/landing-ui-kit の frame）で、§5.2 の表のすべての行の字・色、22 px で 840 px（時計は 20 px で 184 px）の内、
// キーが変わる ⇔ 文が変わる（landingKey・landingEventKey は文に出る値だけを持つ）。ほかの任務の文とキーは tests/landing-neutral と既存の行のテストのまま。
import { describe, expect, it } from 'vitest';
import { CONVOY_EVENT_SHOW_MS } from '../src/config/convoy-config';
import { HOME_COLOR_TEXT, HUD_CLOCK_MAX_W_PX, HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../src/config/hud-text-config';
import { LANDING_EVENT_SHOW_MS } from '../src/config/landing-config';
import { DAWN_AIR_ENEMY, createDawnTelemetry } from '../src/core/dawn-air';
import { LD_DONE, LD_SUNK, LD_UNLOADING, LE_CALM, LE_DONE, LE_DUD, LE_ENGAGED, LE_HIT, LE_HURRIED, LE_MISS, LE_SUNK, LE_SUNK_DONE, type LandingTelemetry } from '../src/core/landing';
import { CALL_DAWN, CALL_FUEL, CALL_SUNK } from '../src/core/mission-flow';
import { PT_GUN_EV_CREW, PT_GUN_EV_SUPPRESS } from '../src/core/pt-damage';
import { LANDING_WAIT_JA, landingClockKey, landingClockLine, landingLine, landingNormalLine } from '../src/ui/landing-lines';
import {
  MISSION_CALL, MISSION_LANDING_EVENT, MISSION_LANDING_FIRE_LINE, MISSION_LANDING_THREAT, MISSION_PT, MISSION_PT_GUN_EVENT, MISSION_WAITING, MODE_FLAG_LANDING_EVENT, MODE_FLAG_PT_GUN_EVENT,
} from '../src/ui/mission-mode';
import { PT_CHASE } from '../src/core/pt-boats';
import { mergeBurstBits } from '../src/ui/pt-gun-lines';
import { L0, PT04, S04, frame, landing0, tl } from './landing-ui-kit';
import { LINE2_MAX_PX, tele, textWidthPx } from './pt-ui-kit';

const EV = MODE_FLAG_LANDING_EVENT;
/** 見えていない・気づかれていない 2 隻（平常の行） */
const QUIET = { alive: 2, detected: false, sighted: false, passing: false };
/** みな去った（海域の外） */
const GONE = { alive: 0, out: 2, sunk: 0, detected: false, sighted: false };
const ev = (o: Partial<LandingTelemetry>): Partial<LandingTelemetry> => ({ eventSeq: 1, eventDirIdx: 1, eventCount: 3, eventM: NaN, eventHits: 0, eventPct: 0.5, ...o });
const row = (f: { mode: number; text: string; color: string }): [number, string, string] => [f.mode, f.text, f.color];

describe('揚陸の 2 行目の文（spec §5.2）', () => {
  it('出撃時の値（jp_04 のノーマル・ハード）と、出来事の表示の秒は輸送隊と同じ 3.5 秒', () => {
    expect([L0.enabled, L0.unloadS, L0.hitsToSink, L0.salvoCount, L0.total, L0.fromDirsJa, L0.hurriedM]).toEqual([true, 140, 2, 3, 2, '北と東', 1300]);
    const h = landing0(true);
    expect([h.total, h.fromDirsJa]).toEqual([3, '北・東・北東']);
    expect(LANDING_EVENT_SHOW_MS).toBe(CONVOY_EVENT_SHOW_MS);
    expect(PT04.gunRangeM).toBe(600);
    expect(PT04.leaveDirJa).toBe('北');
  });

  it('平常（MISSION_PT・見えていない）: 揚陸の %（切り捨て）と狙う米PT（みな撃てれば来る方角、減れば残り、0 ならもう撃てない）', () => {
    expect(row(frame(tl({ pct: 0.995, armed: 2 }, QUIET)))).toEqual([MISSION_PT, '揚陸 99% ・ 米PT 2 隻が北と東から輸送船を狙う', HUD_COLOR_STRONG]);
    expect(frame(tl({ pct: 0.995, armed: 3 }, { ...QUIET, alive: 3 }, {}, true)).text).toBe('揚陸 99% ・ 米PT 3 隻が北・東・北東から輸送船を狙う');
    expect(frame(tl({ pct: 0.5, armed: 1 }, QUIET)).text).toBe('揚陸 50% ・ 米PT 残り 1 隻が輸送船を狙う');
    expect(frame(tl({ pct: 0.5, armed: 0 }, { ...QUIET, alive: 1 })).text).toBe('揚陸 50% ・ 米PT はもう魚雷を撃てない');
    expect(frame(tl({}, QUIET)).text).toBe('揚陸 0% ・ 米PT 2 隻が北と東から輸送船を狙う');
  });

  it('見えている PT（R8/F13d）: 止まって・静音は「600 m まで寄って撃つか速く走って引きつけよ」、速いと「まもなく見つかる ・ 赤い線に備えよ」（どちらも方角）', () => {
    const seen = { ...QUIET, sighted: true, dx: 600, dy: -600 };
    expect(row(frame(tl({}, seen, { targetStep: 'silent' })))).toEqual([MISSION_PT, '米PT 850 m（北東） ・ 600 m まで寄って撃つか速く走って引きつけよ', HUD_COLOR_STRONG]);
    expect(frame(tl({}, seen, { targetStep: 'stop' })).text).toBe('米PT 850 m（北東） ・ 600 m まで寄って撃つか速く走って引きつけよ');
    expect(row(frame(tl({}, { ...seen, dx: -300, dy: 400 }, { targetStep: 'cruise' })))).toEqual([MISSION_PT, '米PT 500 m（南西） ・ まもなく見つかる ・ 赤い線に備えよ', HUD_COLOR_WARN]);
    expect(frame(tl({}, seen, { targetStep: 'full' })).text).toBe('米PT 850 m（北東） ・ まもなく見つかる ・ 赤い線に備えよ');
  });

  it('みな去った・沈めた（決着の前）: 「揚陸を待て あと N 秒」（秒は切り上げ。F14: 夜明けが先なら「夜明け ・ 」）。決着の後は「帰投せよ  N m」', () => {
    expect(row(frame(tl({ leftS: 61.2 }, GONE)))).toEqual([MISSION_PT, '米PT は北へ去った ・ 揚陸を待て あと 62 秒', HUD_COLOR_STRONG]);
    expect(frame(tl({ leftS: 61.2 }, { ...GONE, out: 0, sunk: 2 })).text).toBe('米PT は全隻撃沈 ・ 揚陸を待て あと 62 秒');
    const dawn = { dawn: { ...createDawnTelemetry(), reached: true, air: DAWN_AIR_ENEMY } };
    expect(frame(tl({ leftS: 61.2 }, { ...GONE, out: 1 }, dawn), CALL_DAWN).text).toBe('夜明け ・ 米PT は北へ去る ・ 揚陸を待て あと 62 秒');
    expect(frame(tl({ resolved: true, phase: LD_DONE, pct: 1, leftS: 0 }, GONE)).text).toBe('米PT は北へ去った ・ 帰投せよ  2000 m');
  });

  it('モード 36（警告色）: 報告の遠い・近い（輸送船から見た方角と 100 m 刻み）、報告が無ければ走っている雷跡と最接近までの秒（切り上げ）', () => {
    expect(row(frame(tl({ reportSub: 1, reportI: 0, reportStep: 18, reportDirIdx: 1 }, QUIET)))).toEqual([MISSION_LANDING_THREAT, '米PT 雷撃に来る！ 輸送船の北東 1800 m ・ 今なら引きつけられる', HUD_COLOR_WARN]);
    expect(row(frame(tl({ reportSub: 2, reportI: 1, reportStep: 13, reportDirIdx: 2 }, QUIET)))).toEqual([MISSION_LANDING_THREAT, '米PT 雷撃が近い！ 輸送船の東 1300 m ・ 寄れば慌てて撃つ（外れやすい）', HUD_COLOR_WARN]);
    expect(row(frame(tl({ wakes: 3, wakeCpaS: 11.2 }, QUIET)))).toEqual([MISSION_LANDING_THREAT, '雷跡 3 本が輸送船へ ・ あと 12 秒', HUD_COLOR_WARN]);
    expect(frame(tl({ wakes: 1, wakeCpaS: 0.01 }, QUIET)).text).toBe('雷跡 1 本が輸送船へ ・ あと 1 秒'); // R14 A7: 0 秒と出さない
    // 報告と雷跡が両方あれば報告（打てる手がある方）
    expect(frame(tl({ reportSub: 1, reportStep: 18, reportDirIdx: 0, wakes: 3, wakeCpaS: 5 }, QUIET)).text).toBe('米PT 雷撃に来る！ 輸送船の北 1800 m ・ 今なら引きつけられる');
  });

  it('モード 35（出来事）: 斉射（R12 の戦いながら）・被雷・不発（F16）・外れ・沈没・揚陸完了・揚陸の後の沈没', () => {
    const f = (o: Partial<LandingTelemetry>, pt = QUIET) => row(frame(tl(ev(o), pt), 0, EV));
    expect(f({ eventKind: LE_CALM, eventDirIdx: 0, eventM: 899 })).toEqual([MISSION_LANDING_EVENT, '米PT 雷撃！ 北から輸送船へ 3 本', HUD_COLOR_WARN]);
    // R14 A4: 慌てた・戦いながらは輸送船から見た方角と距離（「輸送船の」）。A1: 戦いながらの後ろは「離れて戦え」（「外れやすい」は慌てただけ）
    expect(f({ eventKind: LE_HURRIED, eventM: 1250 })).toEqual([MISSION_LANDING_EVENT, '米PT 慌てて発射！ 輸送船の北東 1300 m から 3 本 ・ 外れやすい', HUD_COLOR_STRONG]);
    expect(f({ eventKind: LE_ENGAGED, eventDirIdx: 2, eventM: 812 }, { ...QUIET, detected: true })).toEqual([MISSION_LANDING_EVENT, '米PT 戦いながら発射！ 輸送船の東 900 m から 3 本 ・ 離れて戦え', HUD_COLOR_WARN]);
    // R14 A3: 同じステップに足した斉射は隻数と本数（方角・距離は言わない）
    expect(f({ eventKind: LE_HURRIED, eventM: 1250, eventCount: 6, eventBoats: 2 })).toEqual([MISSION_LANDING_EVENT, '米PT 2 隻が慌てて発射！ 輸送船へ 6 本 ・ 外れやすい', HUD_COLOR_STRONG]);
    expect(f({ eventKind: LE_ENGAGED, eventM: 812, eventCount: 6, eventBoats: 2 })).toEqual([MISSION_LANDING_EVENT, '米PT 2 隻が戦いながら発射！ 輸送船へ 6 本 ・ 離れて戦え', HUD_COLOR_WARN]);
    expect(f({ eventKind: LE_CALM, eventM: 880, eventCount: 9, eventBoats: 3 })).toEqual([MISSION_LANDING_EVENT, '米PT 3 隻が雷撃！ 輸送船へ 9 本', HUD_COLOR_WARN]);
    expect(f({ eventKind: LE_HURRIED, eventM: 1250, eventBoats: 1 })[1]).toBe('米PT 慌てて発射！ 輸送船の北東 1300 m から 3 本 ・ 外れやすい'); // 1 隻は前の形
    expect(f({ eventKind: LE_HIT, eventHits: 1 })).toEqual([MISSION_LANDING_EVENT, '輸送船 被雷！ あと 1 本で沈む', HUD_COLOR_WARN]);
    expect(f({ eventKind: LE_DUD, eventHits: 0 })).toEqual([MISSION_LANDING_EVENT, '輸送船に命中 ・ 不発！ 輸送船は無事', HOME_COLOR_TEXT]);
    expect(f({ eventKind: LE_DUD, eventHits: 1 })).toEqual([MISSION_LANDING_EVENT, '輸送船に命中 ・ 不発！ 被雷 1 のまま', HUD_COLOR_STRONG]);
    expect(f({ eventKind: LE_MISS, eventPct: 0.55 })).toEqual([MISSION_LANDING_EVENT, '雷跡 それた！ 輸送船は無事 ・ 揚陸を続ける', HOME_COLOR_TEXT]);
    expect(f({ eventKind: LE_MISS, eventPct: 1 })[1]).toBe('雷跡 それた！ 輸送船は無事'); // 揚陸の後の外れ（「揚陸を続ける」を言わない）
    expect(f({ eventKind: LE_SUNK, eventPct: 0.649, eventHits: 2 })).toEqual([MISSION_LANDING_EVENT, '輸送船 撃沈… 揚陸は 64% で止まった ・ 帰投せよ', HUD_COLOR_WARN]);
    expect(f({ eventKind: LE_DONE, eventPct: 1 })).toEqual([MISSION_LANDING_EVENT, '揚陸完了！ あとは生きて帰れ', HOME_COLOR_TEXT]);
    expect(f({ eventKind: LE_SUNK_DONE, eventPct: 1, eventHits: 2 })).toEqual([MISSION_LANDING_EVENT, '輸送船 撃沈…（揚陸は済んでいた）', HUD_COLOR_STRONG]);
  });

  it('呼びかけ（MISSION_CALL）: 決着は「揚陸完了 ・ 」「輸送船 沈没 ・ 」＋「帰投せよ  N m」、決着の前の夜明け近しは待ち、燃料少は「揚陸まで あと N 秒 ・ 帰投の輪で止まって待て」（R4・R14 A5）', () => {
    const done = { resolved: true, phase: LD_DONE, pct: 1, leftS: 0 };
    expect(frame(tl(done, QUIET), CALL_SUNK)).toMatchObject({ mode: MISSION_CALL, text: '揚陸完了 ・ 帰投せよ  2000 m' });
    expect(frame(tl({ ...done, sunkAfterDone: true }, QUIET), CALL_SUNK).text).toBe('揚陸完了 ・ 帰投せよ  2000 m');
    expect(frame(tl({ resolved: true, phase: LD_SUNK, pct: 0.64, leftS: 0 }, QUIET), CALL_SUNK).text).toBe('輸送船 沈没 ・ 帰投せよ  2000 m');
    expect(frame(tl({ leftS: 61.2 }, QUIET), CALL_DAWN)).toMatchObject({ mode: MISSION_CALL, text: '夜明け近し ・ 揚陸を待て あと 62 秒' });
    expect(frame(tl({ leftS: 61.2 }, QUIET, { dawn: { ...createDawnTelemetry(), reached: true, air: DAWN_AIR_ENEMY } }), CALL_DAWN).text).toBe('空襲下 ・ 揚陸を待て あと 62 秒');
    expect(frame(tl({ leftS: 61.2 }, QUIET), CALL_FUEL).text).toBe('燃料少 ・ 揚陸まで あと 62 秒 ・ 帰投の輪で止まって待て');
    expect(frame(tl(done, QUIET), CALL_FUEL).text).toBe('燃料少 帰投せよ  2000 m');
    expect(frame(tl(done, QUIET), CALL_DAWN).text).toBe('夜明け近し 帰投せよ  2000 m');
    // 揚陸の任務の決着の後は呼びかけが突撃・追撃・離脱の行に勝つ（jp_01 の ux-4 と同じ）。決着の前は接触の行
    expect(frame(tl(done, { ...QUIET, detected: true }), CALL_SUNK).mode).toBe(MISSION_CALL);
    expect(frame(tl({ leftS: 61.2 }, { ...QUIET, detected: true }), CALL_DAWN).mode).not.toBe(MISSION_CALL);
  });

  it('25mm の出来事で戦う PT が残らない（決着の前）: 「揚陸を待て」（連射の結果を足した行も同じ語。キーの bit 14）。残っていれば「残り N 隻」、決着の後は「帰投せよ」', () => {
    const gun = { ...QUIET, alive: 0, fighting: 0, gunEventSeq: 1, gunEvent: PT_GUN_EV_CREW, gunEventBoat: 0 };
    expect(row(frame(tl({}, gun), 0, MODE_FLAG_PT_GUN_EVENT))).toEqual([MISSION_PT_GUN_EVENT, `米PT 撃退！ 死傷者が出て離脱 ・ ${LANDING_WAIT_JA}`, HOME_COLOR_TEXT]);
    expect(frame(tl({}, { ...gun, fighting: 1, alive: 1 }), 0, MODE_FLAG_PT_GUN_EVENT).text).toBe('米PT 撃退！ 死傷者が出て離脱 ・ 残り 1 隻');
    expect(frame(tl({ resolved: true, phase: LD_DONE }, gun), 0, MODE_FLAG_PT_GUN_EVENT).text).toBe('米PT 撃退！ 死傷者が出て離脱 ・ 帰投せよ');
    const hits = S04.ptBoats!.burstRounds;
    const merge = mergeBurstBits(tele({ lastPassFired: true, lastPassHits: hits }).pt);
    for (const gunEvent of [PT_GUN_EV_CREW, PT_GUN_EV_SUPPRESS]) {
      const text = frame(tl({}, { ...gun, gunEvent }), 0, MODE_FLAG_PT_GUN_EVENT, 0, merge).text;
      expect(text).toMatch(new RegExp(`・ 連射 被弾 ${hits} 発（HP −${hits * S04.ptBoats!.hit.damage}） ・ ${LANDING_WAIT_JA}$`));
      if (gunEvent === PT_GUN_EV_CREW) expect(textWidthPx(text, 22), text).toBeLessThanOrEqual(LINE2_MAX_PX); // jp_01 の短い「上陸を待て」と同じ幅・同じ上限（tests/convoy-review-ux）
    }
  });

  it('右上の揚陸の時計（spec §5.3）: 揚陸中・揚陸完了・揚陸の前に沈んだ・完了の後に沈んだ（20 px・184 px の内）。キーは表示の秒と段階が変わったときだけ変わる', () => {
    const c = (o: Partial<LandingTelemetry>) => landingClockLine({ ...L0, ...o });
    expect(c({ leftS: 139.2 })).toEqual({ text: '揚陸 あと 140 秒', color: HUD_COLOR_STRONG });
    expect(c({ leftS: 0.2 })).toEqual({ text: '揚陸 あと 1 秒', color: HUD_COLOR_STRONG });
    expect(c({ phase: LD_DONE, resolved: true, leftS: 0 })).toEqual({ text: '揚陸完了', color: HOME_COLOR_TEXT });
    expect(c({ phase: LD_SUNK, resolved: true, leftS: 0 })).toEqual({ text: '輸送船 沈没', color: HUD_COLOR_WARN });
    expect(c({ phase: LD_DONE, resolved: true, sunkAfterDone: true, leftS: 0 })).toEqual({ text: '揚陸完了（沈没）', color: HOME_COLOR_TEXT });
    for (const o of [{ leftS: 255 }, { phase: LD_DONE }, { phase: LD_SUNK }, { phase: LD_DONE, sunkAfterDone: true }]) expect(textWidthPx(c(o).text, 20), c(o).text).toBeLessThanOrEqual(HUD_CLOCK_MAX_W_PX);
    const k = (o: Partial<LandingTelemetry>) => landingClockKey({ ...L0, ...o });
    expect(k({ leftS: 139.2 })).toBe(k({ leftS: 139.9 }));
    expect(k({ leftS: 139.2 })).not.toBe(k({ leftS: 138.9 }));
    expect(new Set([k({ phase: LD_UNLOADING, leftS: 0 }), k({ phase: LD_DONE }), k({ phase: LD_SUNK }), k({ phase: LD_DONE, sunkAfterDone: true })]).size).toBe(4);
  });
});

describe('R14 の行（S6a-fix）', () => {
  it('A1 モード 37（警告色）: 自艇から見た射線の PT の距離（100 m 刻み）と方角・「輸送船が射線に入る！ 離れて戦え」', () => {
    const fight = { ...QUIET, detected: true, threatPhase: PT_CHASE };
    expect(row(frame(tl({ fireLineI: 0, fireLineDirIdx: 1, fireLineStep: 7 }, fight)))).toEqual([MISSION_LANDING_FIRE_LINE, '米PT 700 m（北東） ・ 輸送船が射線に入る！ 離れて戦え', HUD_COLOR_WARN]);
    expect(frame(tl({ fireLineI: 1, fireLineDirIdx: 4, fireLineStep: 12 }, QUIET)).text).toBe('米PT 1200 m（南） ・ 輸送船が射線に入る！ 離れて戦え');
  });
  it('A5 帰投の輪の中（決着の前・強調色）: 「帰投の輪 ・ 揚陸を見届けるまで待て あと N 秒」（秒は切り上げ）。決着の後・輪の外・揚陸の無い任務は landingLine が null', () => {
    expect(row(frame(tl({ leftS: 61.2 }, QUIET, { atHome: true })))).toEqual([MISSION_WAITING, '帰投の輪 ・ 揚陸を見届けるまで待て あと 62 秒', HUD_COLOR_STRONG]);
    expect(landingLine(tl({ resolved: true, phase: LD_DONE, leftS: 0 }, QUIET, { atHome: true, homeWaiting: true }), MISSION_WAITING)).toBeNull();
    expect(landingLine(tl({ leftS: 61.2 }, QUIET, { homeWaiting: true }), MISSION_WAITING)).toBeNull();
    expect(landingLine(tele(QUIET, { atHome: true }), MISSION_WAITING)).toBeNull();
    for (const m of [MISSION_LANDING_EVENT, MISSION_LANDING_THREAT, MISSION_LANDING_FIRE_LINE]) expect(landingLine(tele(QUIET), m)).toBeNull();
    expect(landingLine(tl({}, QUIET), MISSION_PT)).toBeNull(); // 平常の行は ui/pt-lines
  });
  it('キーが変わる ⇔ 文が変わる（37 の方角と 100 m・輪の中の残りの秒）', () => {
    const fire: Array<[number, string]> = [];
    for (const dir of [0, 1, 6]) for (const step of [3, 7, 12]) fire.push(keyText(tl({ fireLineI: 0, fireLineDirIdx: dir, fireLineStep: step }, QUIET)));
    const ring: Array<[number, string]> = [];
    for (const leftS of [140, 139.5, 139, 61.2, 61.9, 0.4]) ring.push(keyText(tl({ leftS }, QUIET, { atHome: true })));
    for (const rows of [fire, ring]) {
      for (const r of rows) expect(r[1]).not.toBe('');
      for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) expect(rows[i]![0] === rows[j]![0], `${rows[i]![1]} / ${rows[j]![1]}`).toBe(rows[i]![1] === rows[j]![1]);
    }
  });
});

describe('幅（22 px の 2 行目は 840 px・spec §5 の上限）', () => {
  it('どの行も最大の値（100%・ハードの 3 方角・4 桁の距離・255 秒・9 本）で 840 px の内', () => {
    const big = { ...QUIET, sighted: true, dx: 9000, dy: -9000 };
    const texts = [
      frame(tl({ pct: 1, armed: 3 }, { ...QUIET, alive: 3 }, {}, true)).text,
      frame(tl({ pct: 1, armed: 1 }, QUIET)).text,
      landingNormalLine(tl({ pct: 1, armed: 0 })).text,
      frame(tl({}, big, { targetStep: 'stop' })).text,
      frame(tl({}, big, { targetStep: 'full' })).text,
      frame(tl({ leftS: 255 }, { ...GONE, out: 1 }, { dawn: { ...createDawnTelemetry(), reached: true } }), CALL_DAWN).text,
      frame(tl({ leftS: 255 }, { ...GONE, out: 0, sunk: 2 })).text,
      frame(tl({ reportSub: 1, reportStep: 63, reportDirIdx: 7 }, QUIET)).text,
      frame(tl({ reportSub: 2, reportStep: 63, reportDirIdx: 7 }, QUIET)).text,
      frame(tl({ wakes: 9, wakeCpaS: 62.5 }, QUIET)).text,
      ...[LE_CALM, LE_HURRIED, LE_ENGAGED, LE_HIT, LE_DUD, LE_MISS, LE_SUNK, LE_DONE, LE_SUNK_DONE].map((k) => frame(tl(ev({ eventKind: k, eventDirIdx: 7, eventCount: 15, eventM: 6300, eventHits: 1, eventPct: 0.99 }), QUIET), 0, EV).text),
      ...[LE_CALM, LE_HURRIED, LE_ENGAGED].map((k) => frame(tl(ev({ eventKind: k, eventDirIdx: 7, eventCount: 15, eventBoats: 3, eventM: 6300 }), QUIET), 0, EV).text),
      frame(tl({ fireLineI: 0, fireLineDirIdx: 7, fireLineStep: 63 }, QUIET)).text,
      frame(tl({ leftS: 255 }, QUIET, { atHome: true })).text,
      frame(tl({ resolved: true, phase: LD_SUNK }, QUIET, { homeEdgeM: 9900 }), CALL_SUNK).text,
      frame(tl({ leftS: 255 }, QUIET), CALL_DAWN).text,
      frame(tl({ leftS: 255 }, QUIET), CALL_FUEL).text,
    ];
    expect(texts.every((s) => s !== '')).toBe(true);
    for (const s of texts) expect(textWidthPx(s, 22), s).toBeLessThanOrEqual(LINE2_MAX_PX);
  });
});

describe('キーが変わる ⇔ 文が変わる（landingKey・landingEventKey は文に出る値だけ）', () => {
  /** 同じモードの材料のすべての組で、キーが同じ ⇔ 文が同じ */
  function same(rows: Array<[number, string]>): void {
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++) expect(rows[i]![0] === rows[j]![0], `${rows[i]![1]} / ${rows[j]![1]}`).toBe(rows[i]![1] === rows[j]![1]);
  }
  it('モード 36（報告の副・方角・刻みと雷跡の本数・秒）', () => {
    const rows: Array<[number, string]> = [];
    for (const sub of [1, 2]) for (const dir of [0, 1, 5]) for (const step of [9, 13, 18]) rows.push(keyText(tl({ reportSub: sub, reportDirIdx: dir, reportStep: step }, QUIET)));
    for (const n of [1, 3, 6]) for (const cpa of [0, 0.4, 3.2, 3.9, 11]) rows.push(keyText(tl({ wakes: n, wakeCpaS: cpa }, QUIET)));
    for (const r of rows) expect(r[1]).not.toBe('');
    same(rows);
  });
  it('モード 35（出来事の種類ごとに文に出る値だけ。斉射の距離は慌てた・戦いながらだけ、% は沈没と外れの揚陸の後だけ）', () => {
    const rows: Array<[number, string]> = [];
    for (const k of [LE_CALM, LE_HURRIED, LE_ENGAGED, LE_HIT, LE_DUD, LE_MISS, LE_SUNK, LE_DONE, LE_SUNK_DONE])
      for (const dir of [0, 3]) for (const m of [812, 899, 1250]) for (const hits of [0, 1]) for (const pct of [0.41, 0.649, 1]) rows.push(eventKeyText(tl(ev({ eventKind: k, eventDirIdx: dir, eventM: m, eventHits: hits, eventPct: pct }), QUIET)));
    // R14 A3: 足した斉射は隻数と本数だけ（方角・距離は文に出ない＝キーにも入らない）
    for (const k of [LE_CALM, LE_HURRIED, LE_ENGAGED]) for (const boats of [0, 1, 2, 3]) for (const dir of [0, 3]) for (const m of [812, 1250]) for (const n of [3, 6]) rows.push(eventKeyText(tl(ev({ eventKind: k, eventBoats: boats, eventDirIdx: dir, eventM: m, eventCount: n }), QUIET)));
    same(rows);
  });
  it('平常（% と撃てる隻数）・みな去った後の待ち・呼びかけの待ち（残りの秒）', () => {
    const normal: Array<[number, string]> = [];
    for (const pct of [0, 0.004, 0.013, 0.5, 0.505, 0.99]) for (const armed of [0, 1, 2]) normal.push(keyText(tl({ pct, armed }, QUIET)));
    same(normal);
    const gone: Array<[number, string]> = [];
    for (const leftS of [140, 139.5, 139, 61.2, 61.9, 0.4]) gone.push(keyText(tl({ leftS }, GONE)));
    same(gone);
    for (const call of [CALL_DAWN, CALL_FUEL]) {
      const rows: Array<[number, string]> = [];
      for (const leftS of [140, 139.5, 139, 61.2, 61.9, 0.4]) rows.push(keyText(tl({ leftS }, QUIET), call));
      same(rows);
    }
  });
  it('揚陸の無い任務（tests/pt-ui-kit の jp_05）はどのモードでも 0、揚陸の任務は 1 の印が立つ', () => {
    for (const call of [0, CALL_DAWN, CALL_SUNK, CALL_FUEL]) {
      for (const pt of [QUIET, GONE, { ...QUIET, detected: true }]) {
        expect([frame(tele(pt), call).keys.lKey, frame(tele(pt), call, EV).keys.leKey]).toEqual([0, 0]);
        expect(frame(tl({}, pt), call).keys.lKey & 1).toBe(1);
      }
    }
  });
});

/** そのフレームの landingKey と文 */
function keyText(t: ReturnType<typeof tl>, call = 0): [number, string] {
  const f = frame(t, call);
  return [f.keys.lKey, f.text];
}
/** モード 35 のフレームの landingEventKey と文 */
function eventKeyText(t: ReturnType<typeof tl>): [number, string] {
  const f = frame(t, 0, EV);
  expect(f.mode).toBe(MISSION_LANDING_EVENT);
  return [f.keys.leKey, f.text];
}
