// 味方の大発の輸送隊（v0.6.4。jp_01「夜の輸送護衛」。spec §D.2・§D.3・§G.2）の HUD の 2 行目と Result の文: 平常（大発・上陸・浜まで・米PT の哨戒）、米PT が大発を狙うときの航過・突撃・結果、
// 離脱の尾「大発のそばへ戻れ」、出来事（沈没・上陸）とその時計（ui/pt-line-clock）、呼びかけの 3 形、キー（表示が変わるときだけ変わる）、幅（22 px で 840 px 以内）、Result の行と頭。
// jp_05 の文（輸送隊の無い任務）は変わらないことも並べて確かめる。ui-config・game-config は DOM を読むので使わない（色は hud-text-config、幅は tests/pt-ui-kit の見積もり）。
import { describe, expect, it } from 'vitest';
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../src/config/hud-text-config';
import type { BoatTelemetry } from '../src/core/boat-motion';
import { createConvoyTelemetry, type ConvoyTelemetry } from '../src/core/convoy';
import { DAWN_AIR_ENEMY, DAWN_AIR_NONE } from '../src/core/dawn-air';
import { CALL_DAWN, CALL_EXPENDED, CALL_FUEL, CALL_SUNK } from '../src/core/mission-flow';
import { PT_BREAK, PT_PASS, PT_PATROL, PT_RUN_IN, type PtTelemetry } from '../src/core/pt-boats';
import {
  CONVOY_EV_ARRIVED, CONVOY_EV_SUNK, convoyBreakTailJa, convoyCallJa, convoyEventLine, convoyHeadJa, convoyKey, convoyLeftStep, convoyNearStep, convoyNormalLine, convoyPassLine, convoyResultLine, convoySlowLine,
} from '../src/ui/convoy-lines';
import { callLabel } from '../src/ui/hud-lines';
import { dawnCallLabel } from '../src/ui/dawn-lines';
import { MISSION_CALL, MISSION_CONVOY_EVENT, MISSION_PT, MISSION_PT_CONTACT, MISSION_PT_GUN_EVENT, MISSION_PT_PASS, MODE_FLAG_CONVOY_EVENT, MODE_FLAG_PT_GUN_EVENT, MODE_FLAG_PT_RESULT, missionMode } from '../src/ui/mission-mode';
import { PtLineClock } from '../src/ui/pt-line-clock';
import { ptHeadJa, ptResultLines } from '../src/ui/pt-lines';
import type { PtResult } from '../src/ui/result-types';
import { LINE2_MAX_PX, keyOf, row, tele, textWidthPx } from './pt-ui-kit';

/** jp_01 の出撃時の輸送隊のテレメトリ（3 隻・浜まで 3,040 m・先頭が 150 m 南・米PT は東から）に上書き */
function cv(over: Partial<ConvoyTelemetry> = {}): ConvoyTelemetry {
  return { ...createConvoyTelemetry(), enabled: true, total: 3, afloat: 3, arrived: 0, sunk: 0, resolved: false, leftM: 3040, nearestDx: 0, nearestDy: 150, nearestM: 150, fromDirJa: '東', ...over };
}
/** jp_01 の米PT の隊の値のうち jp_05 と違うもの（T-38 の静音の上限 13 kt・去るのは北東） */
const JP01: Partial<PtTelemetry> = { silentMaxKt: 13, leaveDirJa: '北東' };
const t01 = (pt: Partial<PtTelemetry> = {}, convoy: Partial<ConvoyTelemetry> = {}, over: Partial<BoatTelemetry> = {}): BoatTelemetry => tele({ ...JP01, ...pt }, { ...over, convoy: cv(convoy) });
/** 見えている PT（北東 500 m）・大発を狙う赤い線・大発への突撃・航過の結果 */
const SEEN: Partial<PtTelemetry> = { detected: true, sighted: true, dx: 300, dy: -400 };
const PASS_BARGE: Partial<PtTelemetry> = { ...SEEN, passing: true, threatPhase: PT_PASS, dodge: 1, escapeDeg: 315, targetKind: 1 };
const RUSH_BARGE: Partial<PtTelemetry> = { ...SEEN, threatPhase: PT_RUN_IN, targetKind: 1 };
const RESULT_BARGE: Partial<PtTelemetry> = { detected: true, threatPhase: PT_BREAK, passes: 2, maxPasses: 8, lastPassFired: true, lastPassHits: 6, lastPassTargetKind: 1 };
const RESULT = MODE_FLAG_PT_RESULT;
const CV_EVENT = MODE_FLAG_CONVOY_EVENT;

describe('平常・見えている PT（spec §D.2）', () => {
  it('平常: 「大発 3 隻 ・ 上陸 0/3 ・ 浜まで 3100 m ・ 米PT 2 隻 東で哨戒中」（浜までは 100 m 刻みの切り上げ）。米PT の数は ptKey が、浜までと上陸は convoyKey が組み直させる。jp_05 の文は変わらない', () => {
    expect(row(t01())).toEqual([MISSION_PT, '大発 3 隻 ・ 上陸 0/3 ・ 浜まで 3100 m ・ 米PT 2 隻 東で哨戒中', HUD_COLOR_STRONG]);
    expect(row(t01({ alive: 1 }))[1]).toBe('大発 3 隻 ・ 上陸 0/3 ・ 浜まで 3100 m ・ 米PT 1 隻 東で哨戒中');
    expect(keyOf(t01({ alive: 1 }))).not.toBe(keyOf(t01())); // 隻数は ptKey（N_UNSEEN の隻数 << 18）
    expect(row(t01({}, { afloat: 2, arrived: 1, leftM: 2999 }))[1]).toBe('大発 2 隻 ・ 上陸 1/3 ・ 浜まで 3000 m ・ 米PT 2 隻 東で哨戒中');
    expect(convoyNormalLine(t01({}, { fromDirJa: '北東' })).text).toBe('大発 3 隻 ・ 上陸 0/3 ・ 浜まで 3100 m ・ 米PT 2 隻 北東で哨戒中');
    expect(row(tele())).toEqual([MISSION_PT, '米PT 2 隻が哨戒中 ・ 静音で抜けて帰投', HUD_COLOR_STRONG]);
    // convoyKey: 浜までの刻み（平常の行のときだけ）・航行中・上陸・出来事。文が変わらない値では同じ、輸送隊の無い任務は 0
    expect(convoyLeftStep(cv())).toBe(31);
    expect(convoyKey(cv(), true, 0)).toBe(convoyKey(cv({ leftM: 3001 }), true, 0));
    expect(convoyKey(cv(), true, 0)).not.toBe(convoyKey(cv({ leftM: 3000 }), true, 0));
    expect(convoyKey(cv(), false, 0)).toBe(convoyKey(cv({ leftM: 100 }), false, 0)); // 平常の行でなければ浜までは入れない
    expect(convoyKey(cv(), true, 0)).not.toBe(convoyKey(cv({ afloat: 2, sunk: 1 }), true, 0));
    expect(convoyKey(cv(), true, 0)).not.toBe(convoyKey(cv({ afloat: 2, arrived: 1 }), true, 0));
    expect(convoyKey(cv(), false, CONVOY_EV_SUNK)).not.toBe(convoyKey(cv(), false, CONVOY_EV_ARRIVED));
    expect(convoyKey(createConvoyTelemetry(), true, 0)).toBe(0);
    expect(convoyKey(cv({ leftM: 9999 }), true, 0) >>> 0).toBeLessThan(2 ** 31);
  });
  it('見えている PT に気づかれていない（停止・静音）: 「まだ気づいていない ・ 大発のそばで備えよ」（jp_05 は「静音でやり過ごせ」のまま）。巡航・全速は jp_05 の文（13 kt 以下に）', () => {
    const slow: Partial<PtTelemetry> = { ...SEEN, detected: false, threatPhase: PT_PATROL };
    expect(row(t01(slow))).toEqual([MISSION_PT, '米PT 500 m（北東） ・ まだ気づいていない ・ 大発のそばで備えよ', HUD_COLOR_STRONG]);
    expect(row(tele(slow))).toEqual([MISSION_PT, '米PT 500 m（北東） ・ 気づかれていない ・ 静音でやり過ごせ', HUD_COLOR_STRONG]);
    expect(row(t01(slow, {}, { targetStep: 'cruise', detectRangeM: 1200 }))).toEqual([MISSION_PT, '米PT 500 m ・ 速い！ 1200 m で見つかる ・ 13 kt 以下に', HUD_COLOR_WARN]);
    expect(convoySlowLine(900, '南西').text).toBe('米PT 900 m（南西） ・ まだ気づいていない ・ 大発のそばで備えよ');
    // みな去った後は jp_05 の文のまま（去る方角は jp_01 の北東）
    expect(row(t01({ alive: 0, out: 2 }, {}, { homeEdgeM: 1950 }))[1]).toBe('米PT は北東へ去った ・ 帰投せよ  2000 m');
  });
});

describe('赤い線・突撃・航過の結果・離脱（標的が大発。spec §D.2）', () => {
  it('赤い線: 標的が大発なら「米PT 航過！ 大発を狙う ・ 近づいて撃ち返せ」→ 撃ち始めたら「掃射！」（警告色）。自艇なら jp_05 のまま。キーは bit 28 で分かれ、被弾で黙った航過は今のまま', () => {
    expect(row(t01(PASS_BARGE))).toEqual([MISSION_PT_PASS, '米PT 航過！ 大発を狙う ・ 近づいて撃ち返せ', HUD_COLOR_WARN]);
    expect(row(t01({ ...PASS_BARGE, fired: true }))).toEqual([MISSION_PT_PASS, '米PT 掃射！ 大発を狙う ・ 近づいて撃ち返せ', HUD_COLOR_WARN]);
    expect(row(t01({ ...PASS_BARGE, targetKind: 0 }))).toEqual([MISSION_PT_PASS, '米PT 航過！ 北西へ全速で転舵', HUD_COLOR_WARN]);
    expect(row(t01({ ...PASS_BARGE, targetKind: 0, fired: true, dodge: 0 }))[1]).toBe('米PT 掃射！ そのまま全速で離れろ');
    expect([(keyOf(t01(PASS_BARGE)) >> 28) & 1, (keyOf(t01({ ...PASS_BARGE, targetKind: 0 })) >> 28) & 1]).toEqual([1, 0]);
    expect(keyOf(t01(PASS_BARGE))).toBe(keyOf(t01({ ...PASS_BARGE, escapeDeg: 45, dodge: 0 }))); // 大発への線はかわす向きを出さないので、向きでは組み直さない
    expect(keyOf(t01(PASS_BARGE))).not.toBe(keyOf(t01({ ...PASS_BARGE, fired: true })));
    expect(row(t01({ ...PASS_BARGE, fired: true, passSilenced: true }))).toEqual([MISSION_PT_PASS, '米PT 被弾で沈黙！ もう撃ってこない', HOME_COLOR_TEXT]);
    expect(convoyPassLine(false).text).toBe('米PT 航過！ 大発を狙う ・ 近づいて撃ち返せ');
  });
  it('突撃: 見えていれば「米PT 北東から突撃 500 m ・ 大発を狙う ・ 近づいて撃ち返せ」、音だけなら「米PT のエンジン音 ・ 北東から突撃 ・ 大発を狙う」。自艇なら jp_05 のまま。キーは bit 28', () => {
    expect(row(t01(RUSH_BARGE))).toEqual([MISSION_PT_CONTACT, '米PT 北東から突撃 500 m ・ 大発を狙う ・ 近づいて撃ち返せ', HUD_COLOR_WARN]);
    expect(row(t01({ ...RUSH_BARGE, sighted: false }))).toEqual([MISSION_PT_CONTACT, '米PT のエンジン音 ・ 北東から突撃 ・ 大発を狙う', HUD_COLOR_WARN]);
    expect(row(t01({ ...RUSH_BARGE, targetKind: 0 }))).toEqual([MISSION_PT_CONTACT, '米PT 北東から突撃 500 m ・ 赤い線で転舵', HUD_COLOR_WARN]);
    expect(row(t01({ ...RUSH_BARGE, targetKind: 0, sighted: false }))[1]).toBe('米PT のエンジン音 ・ 北東から突撃');
    expect(keyOf(t01(RUSH_BARGE)) - keyOf(t01({ ...RUSH_BARGE, targetKind: 0 }))).toBe(1 << 28);
  });
  it('航過の結果（最後の攻撃の標的が大発）: 「大発 被弾 6 発（HP −24） ・ 航過 2/8」（強調）／「大発 被弾なし」／撃たずに終わった航過は「大発への航過 撃たず」（強調。「撃たせなかった！」は自艇だけ）', () => {
    expect(row(t01(RESULT_BARGE), 0, RESULT)).toEqual([MISSION_PT_CONTACT, '大発 被弾 6 発（HP −24） ・ 航過 2/8', HUD_COLOR_STRONG]);
    expect(row(t01({ ...RESULT_BARGE, lastPassHits: 0 }), 0, RESULT)).toEqual([MISSION_PT_CONTACT, '大発 被弾なし ・ 航過 2/8', HOME_COLOR_TEXT]);
    expect(row(t01({ ...RESULT_BARGE, lastPassFired: false, lastPassHits: 0 }), 0, RESULT)).toEqual([MISSION_PT_CONTACT, '大発への航過 撃たず ・ 航過 2/8', HUD_COLOR_STRONG]);
    // 自艇への結果は jp_05 のまま
    expect(row(t01({ ...RESULT_BARGE, lastPassTargetKind: 0 }), 0, RESULT)).toEqual([MISSION_PT_CONTACT, '被弾 6 発（HP −24） ・ 航過 2/8', HUD_COLOR_STRONG]);
    expect(row(t01({ ...RESULT_BARGE, lastPassTargetKind: 0, lastPassHits: 0 }), 0, RESULT)).toEqual([MISSION_PT_CONTACT, 'かわした！ 被弾なし ・ 航過 2/8', HOME_COLOR_TEXT]);
    expect(row(t01({ ...RESULT_BARGE, lastPassTargetKind: 0, lastPassFired: false, lastPassHits: 0 }), 0, RESULT)).toEqual([MISSION_PT_CONTACT, '撃たせなかった！ ・ 航過 2/8', HOME_COLOR_TEXT]);
    expect(keyOf(t01(RESULT_BARGE), 0, RESULT) - keyOf(t01({ ...RESULT_BARGE, lastPassTargetKind: 0 }), 0, RESULT)).toBe(1 << 28);
    // 連射の結果（自艇だけ）は標的の種類を見ない（連射のキーのビットはそのまま）
    const burst: Partial<PtTelemetry> = { ...RESULT_BARGE, burstFired: true, bursts: 3, lastPassTargetKind: 0 };
    expect(row(t01(burst), 0, RESULT)[1]).toBe('連射 被弾 6 発（HP −24） ・ 計 3 回');
    expect(keyOf(t01(burst), 0, RESULT)).toBe(keyOf(t01({ ...burst, lastPassTargetKind: 1 }), 0, RESULT));
  });
  it('離脱: 最寄りの航行中の大発が 500 m より遠ければ「大発のそばへ戻れ（600 m）」（100 m 刻みの切り上げ）を挟む。射撃を撃つ前は末尾が「右下の射撃で撃ち返せ」。刻みは ptKey の bit 6〜11', () => {
    const brk: Partial<PtTelemetry> = { detected: true, threatPhase: PT_BREAK, gunEverFired: true };
    expect(row(t01(brk, { nearestM: 560 }))).toEqual([MISSION_PT_CONTACT, '米PT 離脱 ・ 大発のそばへ戻れ（600 m） ・ 次の赤い線に備えよ', HUD_COLOR_STRONG]);
    expect(row(t01({ ...brk, gunEverFired: false }, { nearestM: 560 }))[1]).toBe('米PT 離脱 ・ 大発のそばへ戻れ（600 m） ・ 右下の射撃で撃ち返せ');
    expect(row(t01(brk, { nearestM: 500 }))[1]).toBe('米PT 離脱 ・ 次の赤い線に備えよ');
    expect(row(t01(brk, { nearestM: NaN }))[1]).toBe('米PT 離脱 ・ 次の赤い線に備えよ'); // 航行中の大発が無い
    expect(row(tele(brk))[1]).toBe('米PT 離脱 ・ 次の赤い線に備えよ'); // jp_05 のまま
    expect((keyOf(t01(brk, { nearestM: 560 })) >> 6) & 63).toBe(6);
    expect(keyOf(t01(brk, { nearestM: 560 }))).toBe(keyOf(t01(brk, { nearestM: 590 })));
    expect(keyOf(t01(brk, { nearestM: 560 }))).not.toBe(keyOf(t01(brk, { nearestM: 610 })));
    expect(keyOf(t01(brk, { nearestM: 500 }))).toBe(keyOf(tele(brk)));
    expect([convoyNearStep(cv({ nearestM: 2750 })), convoyNearStep(cv({ nearestM: 400 })), convoyNearStep(createConvoyTelemetry())]).toEqual([28, 0, 0]);
    expect(convoyBreakTailJa(0)).toBe('');
  });
});

describe('出来事と呼びかけ（spec §D.2）', () => {
  it('出来事: 沈没は「大発 1 隻 沈没 ・ 残り 2 隻 ・ 近づいて撃ち返せ」（警告色）、残りが無ければ「大発 全滅 ・ 帰投せよ」か「… 上陸 2/3 ・ 帰投せよ」。上陸は「大発 上陸 1/3 ・ 残り 2 隻」（味方の青）', () => {
    expect(convoyEventLine(cv({ afloat: 2, sunk: 1 }), CONVOY_EV_SUNK)).toEqual({ text: '大発 1 隻 沈没 ・ 残り 2 隻 ・ 近づいて撃ち返せ', color: HUD_COLOR_WARN });
    expect(convoyEventLine(cv({ afloat: 0, sunk: 3, resolved: true }), CONVOY_EV_SUNK)).toEqual({ text: '大発 全滅 ・ 帰投せよ', color: HUD_COLOR_WARN });
    expect(convoyEventLine(cv({ afloat: 0, sunk: 1, arrived: 2, resolved: true }), CONVOY_EV_SUNK).text).toBe('大発 1 隻 沈没 ・ 上陸 2/3 ・ 帰投せよ');
    expect(convoyEventLine(cv({ afloat: 2, arrived: 1 }), CONVOY_EV_ARRIVED)).toEqual({ text: '大発 上陸 1/3 ・ 残り 2 隻', color: HOME_COLOR_TEXT });
    // 優先: 赤い線 > 13mm の出来事 > 輸送隊の出来事 > 航過の結果
    const t = t01({ detected: true, threatPhase: PT_BREAK });
    expect(missionMode(t, 0, CV_EVENT)).toBe(MISSION_CONVOY_EVENT);
    expect(missionMode(t, 0, CV_EVENT | RESULT)).toBe(MISSION_CONVOY_EVENT);
    expect(missionMode(t, 0, CV_EVENT | MODE_FLAG_PT_GUN_EVENT)).toBe(MISSION_PT_GUN_EVENT);
    expect(missionMode(t01(PASS_BARGE), 0, CV_EVENT)).toBe(MISSION_PT_PASS);
    expect(missionMode(t, 0, RESULT)).toBe(MISSION_PT_CONTACT);
    expect(missionMode(tele(), 0, CV_EVENT)).toBe(MISSION_CONVOY_EVENT); // 旗は時計が立てるので、輸送隊の無い任務では立たない（pt-line-clock）
  });
  it('出来事の時計（ui/pt-line-clock）: 沈没・上陸の数の立ち上がりから 2.5 秒。赤い線の下では 1 度出るまで待ち、最後の 1 隻の上陸（決着）は出さない。航過の結果は出来事の後', () => {
    const clk = new PtLineClock();
    expect(clk.flags(t01(), 1000, -1) & CV_EVENT).toBe(0);
    expect(clk.flags(tele(), 1000, -1)).toBe(0); // jp_05: 何も立たない
    const sunk = t01({}, { afloat: 2, sunk: 1 });
    expect(clk.flags(sunk, 1000, MISSION_PT) & CV_EVENT).toBe(CV_EVENT);
    expect(clk.convoyEvent).toBe(CONVOY_EV_SUNK);
    clk.shown(MISSION_CONVOY_EVENT);
    expect(clk.flags(sunk, 3400, MISSION_CONVOY_EVENT) & CV_EVENT).toBe(CV_EVENT);
    expect(clk.flags(sunk, 3600, MISSION_CONVOY_EVENT) & CV_EVENT).toBe(0);
    // 上陸（残りあり）は出来事、最後の 1 隻の上陸（決着）は出さない
    const landed = t01({}, { afloat: 1, sunk: 1, arrived: 1 });
    expect(clk.flags(landed, 4000, MISSION_PT) & CV_EVENT).toBe(CV_EVENT);
    expect(clk.convoyEvent).toBe(CONVOY_EV_ARRIVED);
    clk.shown(MISSION_CONVOY_EVENT);
    expect(clk.flags(landed, 6600, MISSION_CONVOY_EVENT) & CV_EVENT).toBe(0);
    expect(clk.flags(t01({}, { afloat: 0, sunk: 1, arrived: 2, resolved: true }), 7000, MISSION_PT) & CV_EVENT).toBe(0);
    // 赤い線の下で沈んだ: 線が消えるまで待ち、消えてから 2.5 秒出す。その間、航過の結果は待つ（結果は出来事の後）
    const c2 = new PtLineClock();
    c2.flags(t01(PASS_BARGE), 500, -1);
    const sunkPass = t01(PASS_BARGE, { afloat: 2, sunk: 1 });
    expect(c2.flags(sunkPass, 1000, MISSION_PT_PASS) & CV_EVENT).toBe(CV_EVENT);
    expect(missionMode(sunkPass, 0, c2.flags(sunkPass, 2000, MISSION_PT_PASS))).toBe(MISSION_PT_PASS);
    c2.shown(MISSION_PT_PASS);
    c2.flags(sunkPass, 3400, MISSION_PT_PASS);
    const after = t01({ detected: true, threatPhase: PT_BREAK, passes: 1, maxPasses: 8, passSeq: 1, lastPassFired: false, lastPassTargetKind: 1 }, { afloat: 2, sunk: 1 });
    let f = c2.flags(after, 3500, MISSION_PT_PASS);
    expect(f & CV_EVENT).toBe(CV_EVENT);
    expect(missionMode(after, 0, f)).toBe(MISSION_CONVOY_EVENT);
    c2.shown(MISSION_CONVOY_EVENT);
    f = c2.flags(after, 5800, MISSION_CONVOY_EVENT);
    expect(missionMode(after, 0, f)).toBe(MISSION_CONVOY_EVENT);
    f = c2.flags(after, 6000, MISSION_CONVOY_EVENT);
    expect(f & CV_EVENT).toBe(0);
    expect(f & RESULT).toBe(RESULT); // 出来事の間は結果を待ち、終わってから 2.5 秒出す
    expect(row(after, 0, f)).toEqual([MISSION_PT_CONTACT, '大発への航過 撃たず ・ 航過 1/8', HUD_COLOR_STRONG]);
    expect(c2.flags(after, 8600, MISSION_PT_CONTACT) & RESULT).toBe(0);
  });
  it('呼びかけの 3 形: 決着は「大発 上陸 2/3 ・ 帰投せよ  2000 m」（全滅なら「大発 全滅 ・ 」）、燃料少・空襲下は既存の頭だけ（topCall は 1 ビット）。jp_05・大発の任務の語は変わらない', () => {
    const done = cv({ afloat: 0, sunk: 1, arrived: 2, resolved: true });
    const line = (call: number, air: number, c: ConvoyTelemetry | null): string => `${dawnCallLabel(call, false, air, c ? convoyCallJa(c) : '')}帰投せよ  2000 m`;
    expect(line(CALL_SUNK, DAWN_AIR_NONE, done)).toBe('大発 上陸 2/3 ・ 帰投せよ  2000 m');
    expect(line(CALL_SUNK, DAWN_AIR_NONE, cv({ afloat: 0, sunk: 3, resolved: true }))).toBe('大発 全滅 ・ 帰投せよ  2000 m');
    expect(line(CALL_FUEL, DAWN_AIR_NONE, done)).toBe('燃料少 帰投せよ  2000 m');
    expect(line(CALL_DAWN, DAWN_AIR_ENEMY, done)).toBe('空襲下 帰投せよ  2000 m');
    expect(line(CALL_DAWN, DAWN_AIR_NONE, done)).toBe('夜明け近し 帰投せよ  2000 m');
    expect(line(CALL_SUNK, DAWN_AIR_NONE, null)).toBe('撃沈！帰投せよ  2000 m');
    expect(callLabel(CALL_SUNK, true, '')).toBe('撃破！');
    expect(callLabel(CALL_EXPENDED, false, convoyCallJa(done))).toBe('魚雷なし ');
    // 決着（CALL_SUNK）で米PT が見えていなければ呼びかけの行、米PT が捉えていれば接触の行が勝つ（jp_05 と同じ優先）
    expect(missionMode(t01({}, done), CALL_SUNK, 0)).toBe(MISSION_CALL);
    expect(missionMode(t01({ detected: true, threatPhase: PT_BREAK }, done), CALL_SUNK, 0)).toBe(MISSION_PT_CONTACT);
  });
});

describe('幅と Result（spec §D.2・§D.3）', () => {
  it('2 行目の文はいちばん長い形でも 22 px で 840 px 以内（左上の時計を避けて縮まない）', () => {
    const lines = [
      row(t01({}, { fromDirJa: '北東', leftM: 6300 }))[1],
      convoySlowLine(900, '南西').text,
      convoyPassLine(true).text,
      row(t01({ ...RUSH_BARGE, dx: -600, dy: 600 }))[1],
      row(t01({ ...RUSH_BARGE, dx: -600, dy: 600, sighted: false }))[1],
      row(t01({ ...RESULT_BARGE, lastPassHits: 10, passes: 15, maxPasses: 15 }), 0, RESULT)[1],
      row(t01({ ...RESULT_BARGE, lastPassFired: false, passes: 15, maxPasses: 15 }), 0, RESULT)[1],
      row(t01({ detected: true, threatPhase: PT_BREAK }, { nearestM: 6300 }))[1],
      convoyEventLine(cv({ afloat: 2, sunk: 1 }), CONVOY_EV_SUNK).text,
      convoyEventLine(cv({ afloat: 0, sunk: 1, arrived: 2 }), CONVOY_EV_SUNK).text,
      convoyEventLine(cv({ afloat: 2, arrived: 1 }), CONVOY_EV_ARRIVED).text,
      `${convoyCallJa(cv({ arrived: 2 }))}帰投せよ  6300 m`,
      row(t01({ alive: 0, out: 2 }, {}, { homeEdgeM: 6250, dawn: { ...tele().dawn, reached: true } }))[1],
    ];
    expect(lines.length).toBe(13);
    for (const l of lines) expect(textWidthPx(l, 22), l).toBeLessThanOrEqual(LINE2_MAX_PX);
    expect(textWidthPx(row(t01({ ...RUSH_BARGE, dx: -600, dy: 600 }))[1], 22)).toBeLessThanOrEqual(762); // 最長でも 762 px（spec §I.11）
  });
  const base: PtResult = {
    enemyId: 'us_pt_enemy', total: 2, out: 1, alive: 1, leftAtDawn: false, passes: 6, maxPasses: 8, firedPasses: 4, cleanPasses: 3, shots: 60, hits: 5, damagePerHit: 4, hpMax: 60,
    firstDetectM: 480, firstDetectBand: 'stop', lostContacts: 0, closestM: 120, minWarnS: 2.52,
    gunEnabled: true, gunShots: 82, gunHits: 11, retired: 1, sunk: 0, flashFirst: false, bursts: 2, suppressions: 0,
    passesOnBarges: 3, firstDetectKind: 1, gunLabel: '25mm',
  };
  it('Result: 1 行目は輸送隊、米PT の 1 行目に「（大発へ 3）」、「米PT が捉えた」と最初に捉えた「大発」、砲の行の頭は 25mm（jp_05 は 13mm のまま）、頭は「大発 2/3 ・ 米PT: …」', () => {
    const c = { total: 3, arrived: 2, sunk: 1, quota: 2, hitsTaken: 9 };
    expect(convoyResultLine(c)).toBe('大発 上陸 2/3 ・ 沈没 1（ノルマ 2） ・ 大発の被弾 9 発');
    expect(ptResultLines(base, 1, true, true)).toEqual([
      '米PT 航過 6 回（大発へ 3） ・ 連射 2 回 ・ かわした 3/4 ・ 被弾 5 発（HP −20）',
      '米PT が捉えた 1 回（最初 480 m ・ 大発） ・ 見失わせた 0 回',
      '予告から初弾まで 最短 2.5 秒 ・ 撃たれた弾 60 発',
      '25mm 射撃 82 発 ・ 命中 11（13%） ・ 撃退 1 ・ 撃沈 0',
    ]);
    expect(ptResultLines({ ...base, gunShots: 0, gunHits: 0, retired: 0 }, 1, true, true)[3]).toBe('25mm は撃たなかった');
    expect(ptResultLines({ ...base, passesOnBarges: 0, firstDetectKind: 0 }, 1, true, true).slice(0, 2)).toEqual(['米PT 航過 6 回 ・ 連射 2 回 ・ かわした 3/4 ・ 被弾 5 発（HP −20）', '米PT が捉えた 1 回（最初 480 m ・ 停止） ・ 見失わせた 0 回']);
    expect(ptResultLines({ ...base, firstDetectKind: 0, flashFirst: true }, 1, true, true)[1]).toBe('米PT が捉えた 1 回（最初 480 m ・ 閃光） ・ 見失わせた 0 回');
    // jp_05（輸送隊なし）: 「見つかった」・13mm のまま（大発への航過は 0 なので句は付かない）
    const jp05: PtResult = { ...base, passesOnBarges: 0, firstDetectKind: 0, gunLabel: '13mm', firstDetectBand: 'cruise', firstDetectM: 1200 };
    expect(ptResultLines(jp05, 1, true)).toEqual([
      '米PT 航過 6 回 ・ 連射 2 回 ・ かわした 3/4 ・ 被弾 5 発（HP −20）',
      '見つかった 1 回（最初 1200 m ・ 巡航） ・ 見失わせた 0 回',
      '予告から初弾まで 最短 2.5 秒 ・ 撃たれた弾 60 発',
      '13mm 射撃 82 発 ・ 命中 11（13%） ・ 撃退 1 ・ 撃沈 0',
    ]);
    expect(convoyHeadJa(c, ptHeadJa(base))).toBe('大発 2/3 ・ 米PT: 撃退 1 ・ 健在 1 隻');
  });
  it('Result の行は縮めずに画面の幅に収まる（1 行目 24 px・ほか 20 px・状況の行 20 px。見積もりが 1280 − 左右の HUD_MARGIN 48 の内）。稀な「撃沈 1 ・ 撃退 1 ・ 夜明けに去った」だけ setScale に任せる', () => {
    const MAX = 1280 - 2 * 24;
    const worst = { total: 3, arrived: 0, sunk: 3, quota: 2, hitsTaken: 99 };
    expect(textWidthPx(convoyResultLine(worst), 24)).toBeLessThanOrEqual(MAX);
    const wide: PtResult = { ...base, passes: 15, maxPasses: 15, passesOnBarges: 15, bursts: 15, firedPasses: 15, cleanPasses: 15, shots: 999, hits: 99, lostContacts: 99, minWarnS: 99.9, gunShots: 999, gunHits: 999, suppressions: 9, retired: 2, sunk: 2 };
    const [a, b, c2, d] = ptResultLines(wide, 99, true, true);
    for (const l of [a, b, c2, d]) expect(textWidthPx(l, 20), l).toBeLessThanOrEqual(MAX);
    expect(textWidthPx(a, 20)).toBeLessThanOrEqual(925); // 15 回・（大発へ 15）・連射 15 回・15/15・99 発で約 921 px（spec §I.11）
    const tail = '   帰投: なし   艇 HP 60 / 60   乗員 7/7   燃料 100%   9999 秒';
    for (const pt of [{ ...wide, sunk: 1, retired: 1, alive: 0, out: 1 }, { ...wide, sunk: 1, retired: 0, alive: 1 }, { ...wide, sunk: 0, retired: 2, alive: 0 }, { ...wide, sunk: 2, retired: 0, alive: 0 }, { ...wide, sunk: 0, retired: 0, alive: 2 }]) {
      const status = `${convoyHeadJa(worst, ptHeadJa(pt))}${tail}`;
      expect(textWidthPx(status, 20), status).toBeLessThanOrEqual(MAX);
    }
    expect(textWidthPx(`${convoyHeadJa(worst, ptHeadJa({ ...wide, sunk: 1, retired: 1, alive: 0, leftAtDawn: true }))}${tail}`, 20)).toBeGreaterThan(MAX); // この 1 形だけ 2.4% 縮む
    // 得点の行（夜明け後の帰投・3 隻上陸・2 隻撃沈）
    expect(textWidthPx('帰投 630（夜明け後 ×0.9） ・ 達成 300 ・ 上陸 300 ・ 撃沈 280 ・ 燃料 100 ・ 乗員 100', 20)).toBeLessThanOrEqual(MAX);
  });
});
