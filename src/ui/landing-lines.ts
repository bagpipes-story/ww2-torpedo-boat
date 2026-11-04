// 停泊して揚陸する味方の輸送船と米PT の雷撃（v0.6.9 S6a。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v069 §5.1〜§5.3・R4・R5・R8（F13d・F16）・R12）の HUD の文とキー:
// 2 行目の平常（揚陸の % と狙う米PT）・見えている PT（静音／速い）・去った後の待ち・モード 36（見張りの報告・走っている雷跡）・モード 35（斉射・被雷・不発・外れ・沈没・揚陸完了）・
// 呼びかけの語（決着「揚陸完了 ・ 」「輸送船 沈没 ・ 」、決着の前の夜明け近し・燃料少の待ち）と、右上の揚陸の時計（ui/landing-clock）。
// R14（S6a-fix）: モード 37「米PT N m（方角） ・ 輸送船が射線に入る！ 離れて戦え」（A1。赤い線のすぐ下）、決着の前の帰投の輪の中「帰投の輪 ・ 揚陸を見届けるまで待て あと N 秒」（A5。モード 3）、
// 慌てた・戦いながらの斉射は「輸送船の{方角} N m から」（A4）、同じステップの斉射は「米PT 2 隻が…輸送船へ 6 本」（A3）、雷跡の秒は 1 以上（A7）。35・36・37・輪の待ちの文は landingLine（A11）。
// S8 のレビュー（F）: モード 37 は輸送船から見た PT の方角と距離「米PT が輸送船を狙う！ 輸送船の{方角} N m ・ 離れて戦え」（前の「輸送船が射線に入る」は自艇の射線とも読めた・
// 視程の外の PT を自艇から言っていた。game-1）、赤い線の行の間は末尾「 ・ 輸送船が狙われる！」（landingPassTailJa。前は赤い線に隠れて斉射の前に出なかった）、
// 外れは被雷の後なら「雷跡 それた ・ 被雷 N のまま」（前は「被雷！」の 2 秒後に「輸送船は無事」と出た。code-1）、モード 35 の文とキーは ui/pt-line-clock が写して持つ出来事（LandingEventView。game-2）。
// v0.6.9 実機 1 回目のレビュー（code-2）: 撃った PT はみな去る（ユーザーの選択 A）ので、撃てる米PT が残らない戦いながらの斉射の後ろは「離れて戦え」でなく「米PT は去る」
// （出来事のフレームのまだ撃てる隻数 eventArmed。まだ撃てる PT がいれば「離れて戦え」のまま）。
// v0.6.10 S6（卯月）: 平常の行の末尾（LD4）とモード 35 の照らされた斉射・撃たずに去った（LE_LIT_*）の文とキーは ui/ally-lines（照らされた斉射も斉射＝足す・待つ重さは斉射）。
// Phaser も DOM を読む config も使わない（文を組むだけ。tests から型検査ごと読める）。どの文も t.landing.enabled の任務（jp_04）だけ: ほかの任務は landingKey 0・待ちは立たない。
// 距離は 100 m 刻みの切り上げ（core/landing の LANDING_DIST_STEP_M。「1800 m」とカンマなし）、% は切り捨て、秒は切り上げ。方角は輸送船から見た 8 方位（見張りの報告）。
// キーは行に出る値だけを詰める（行に出ない値は 0＝無駄に組み直さない）。文はキーと同じ丸めの関数でテレメトリから組む（ui/mission-line がキーでキャッシュする）。
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../config/hud-text-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { bearingJa } from '../core/briefing';
import {
  LANDING_DIST_STEP_M, LANDING_REPORT_NEAR, LD_DONE, LD_SUNK, LD_UNLOADING, LE_CALM, LE_DONE, LE_DUD, LE_ENGAGED, LE_HIT, LE_HURRIED, LE_LIT_SALVO, LE_MISS, LE_SUNK, LE_SUNK_DONE,
  type LandingTelemetry,
} from '../core/landing';
import { LANDING_HITS_MAX, LANDING_UNLOAD_MAX_S } from '../core/landing-data';
import { CALL_DAWN, CALL_FUEL } from '../core/mission-flow';
import { allyEventKey, allyEventLine, allyLandingEvent, allyRunTailJa } from './ally-lines';
import type { HudLine } from './hud-lines';
import { MISSION_CALL, MISSION_LANDING_EVENT, MISSION_LANDING_FIRE_LINE, MISSION_LANDING_THREAT, MISSION_PT, MISSION_PT_PASS, MISSION_WAITING, landingFireLineShown, landingRingWaiting } from './mission-mode';

/** 決着の前の「帰投せよ」の代わり（13mm／25mm の出来事で戦う PT が残っていない・みな去った・夜明け近し。spec §5.2 の K_WAIT の語。連射の結果を足した短い形も同じ 5 字） */
export const LANDING_WAIT_JA = '揚陸を待て';

/** 揚陸がまだ決着していない（揚陸完了でも沈没でもない。揚陸の無い任務は false＝ほかの任務の文とキーは変わらない）: この間は「帰投せよ」と言わない（R4: 燃料少は待ちの形） */
export function landingWaiting(l: LandingTelemetry): boolean {
  return l.enabled && !l.resolved;
}

/** 揚陸の残りの秒（切り上げ。キーの 8 ビット＝LANDING_UNLOAD_MAX_S まで） */
export function landingLeftS(l: LandingTelemetry): number {
  return Math.min(LANDING_UNLOAD_MAX_S, Math.max(0, Math.ceil(l.leftS)));
}

/** 揚陸の %（切り捨て。0〜100） */
export function landingPct(pct01: number): number {
  return Math.min(100, Math.max(0, Math.floor(pct01 * 100)));
}

/** 「揚陸を待て あと 110 秒」（みな去った平常の行の後ろ・夜明け近しの呼びかけ） */
export function landingWaitTailJa(leftS: number): string {
  return `${LANDING_WAIT_JA} あと ${leftS} 秒`;
}

/** 呼びかけの語（決着＝CALL_SUNK のとき hud-lines の callLabel が返す。後ろに mission-line の「帰投せよ  N m」）: 揚陸の前に沈んだら「輸送船 沈没 ・ 」、揚陸完了（その後に沈んでも）は「揚陸完了 ・ 」 */
export function landingCallJa(l: LandingTelemetry): string {
  return l.phase === LD_SUNK ? '輸送船 沈没 ・ ' : '揚陸完了 ・ ';
}

/**
 * 決着の前の呼びかけの後ろ（頭は dawnCallLabel の「夜明け近し 」「空襲下 」「燃料少 」）: 夜明けは「・ 揚陸を待て あと N 秒」、燃料少は「・ 揚陸まで あと N 秒 ・ 帰投の輪で止まって待て」
 * （R4。R14 A5: 決着の前に輪に入っても任務は終わらず、輪の中で揚陸を見届けられる）
 */
export function landingWaitCallJa(call: number, leftS: number): string {
  return call === CALL_FUEL ? `・ 揚陸まで あと ${leftS} 秒 ・ 帰投の輪で止まって待て` : `・ ${landingWaitTailJa(leftS)}`;
}

/** 決着の前の帰投の輪の中（R14 A5。モード 3＝MISSION_WAITING の揚陸の任務の文。任務は揚陸の決着まで終わらない） */
export function landingRingLine(l: LandingTelemetry): HudLine {
  return { text: `帰投の輪 ・ 揚陸を見届けるまで待て あと ${landingLeftS(l)} 秒`, color: HUD_COLOR_STRONG };
}

/**
 * 輸送船が射線に入る（R14 A1。モード 37。警告色）: 輸送船から見たその PT の方角と距離（100 m 刻み。戦いながらの斉射の行「輸送船の{方角} N m から」と同じ枠）、教え「離れて戦え」。
 * 自艇から見た向きは赤い「雷撃 N m」の印（ui/landing-markers。S8 のレビュー game-1）
 */
export function landingFireLineLine(l: LandingTelemetry): HudLine {
  return { text: `米PT が輸送船を狙う！ 輸送船の${bearingJa(l.fireLineDirIdx * 45)} ${Math.min(63, l.fireLineStep) * LANDING_DIST_STEP_M} m ・ 離れて戦え`, color: HUD_COLOR_WARN };
}

/** 赤い線の行（モード 22）の末尾（S8 のレビュー game-1。警告色にする）: 輸送船を狙う戦う PT がいる間（モード 37 の条件。赤い線の下に 37 は出ない） */
export const LANDING_PASS_TAIL_JA = ' ・ 輸送船が狙われる！';

/** 赤い線の行に足す末尾（揚陸の無い任務・ほかのモード・射線の PT が無ければ ''） */
export function landingPassTailJa(t: BoatTelemetry, mode: number): string {
  return mode === MISSION_PT_PASS && landingFireLineShown(t) ? LANDING_PASS_TAIL_JA : '';
}

/** 呼びかけで待ちの形を使う（決着の前の夜明け近し・燃料少。jp_04 では撃ち尽くしの呼びかけは立たない＝noTargetsLeft が偽） */
export function landingCallWaits(l: LandingTelemetry, call: number): boolean {
  return landingWaiting(l) && (call === CALL_DAWN || call === CALL_FUEL);
}

/**
 * 平常の行（米PT が見えていない間。jp_05 の「米PT 2 隻が哨戒中」の代わり）: 揚陸の %・まだ撃てる米PT（みな撃てれば来る方角、減れば残り、0 ならもう撃てない）。
 * v0.6.10 S6（LD4）: 卯月のいるノーマルの夜は撃てる米PT がいる間「 ・ 走らせれば卯月が照らす」（ui/ally-lines。ハードは 840 px に収まらないので付けない）
 */
export function landingNormalLine(t: BoatTelemetry): HudLine {
  const l = t.landing;
  const armed = Math.min(3, l.armed);
  const who = armed === 0 ? '米PT はもう魚雷を撃てない' : armed >= l.total ? `米PT ${armed} 隻が${l.fromDirsJa}から輸送船を狙う` : `米PT 残り ${armed} 隻が輸送船を狙う`;
  return { text: `揚陸 ${landingPct(l.pct)}% ・ ${who}${allyRunTailJa(t.ally, armed)}`, color: HUD_COLOR_STRONG };
}

/**
 * 見えている PT に気づかれていない間（停止・静音）: jp_05 の「静音でやり過ごせ」の代わり（R8/F13d: 25mm は gunRangeM の内でしか撃たない）。
 * 「気づいていない ・ 」は入れない（F13d の語で 22 px 942 px と 840 px を超える。気づかれていればモードは米PT との接触）
 */
export function landingSlowLine(distM: number, dirJa: string, gunRangeM: number): HudLine {
  return { text: `米PT ${distM} m（${dirJa}） ・ ${gunRangeM} m まで寄って撃つか速く走って引きつけよ`, color: HUD_COLOR_STRONG };
}

/** 見えている PT に速すぎる間（巡航・全速）: jp_05 の「N kt 以下に」の代わり（輸送船から引きつけるのは良い手。見つかれば赤い線） */
export function landingFastLine(distM: number, dirJa: string): HudLine {
  return { text: `米PT ${distM} m（${dirJa}） ・ まもなく見つかる ・ 赤い線に備えよ`, color: HUD_COLOR_WARN };
}

/** 報告の 100 m 刻み（63 まで）・雷跡の最接近までの秒（切り上げ。1〜63＝R14 A7: 「あと 0 秒」と出さない）・雷跡の本数（127 まで） */
const reportStepOf = (l: LandingTelemetry): number => Math.min(63, l.reportStep);
const wakeSOf = (l: LandingTelemetry): number => (Number.isNaN(l.wakeCpaS) ? 0 : Math.min(63, Math.max(1, Math.ceil(l.wakeCpaS))));
const wakesOf = (l: LandingTelemetry): number => Math.min(127, l.wakes);

/** モード 36 の行（警告色）: 報告が先（遠い＝今なら引きつけられる・近い＝寄れば慌てて撃つ）、報告が無ければ走っている雷跡と最接近までの秒 */
export function landingThreatLine(t: BoatTelemetry): HudLine {
  const l = t.landing;
  if (l.reportSub === 0) return { text: `雷跡 ${wakesOf(l)} 本が輸送船へ ・ あと ${wakeSOf(l)} 秒`, color: HUD_COLOR_WARN };
  const where = `輸送船の${bearingJa(l.reportDirIdx * 45)} ${reportStepOf(l) * LANDING_DIST_STEP_M} m`;
  if (l.reportSub === LANDING_REPORT_NEAR) return { text: `米PT 雷撃が近い！ ${where} ・ 寄れば慌てて撃つ（外れやすい）`, color: HUD_COLOR_WARN };
  return { text: `米PT 雷撃に来る！ ${where} ・ 今なら引きつけられる`, color: HUD_COLOR_WARN };
}

/** landingKey の副（bits 1〜3）: 平常・報告（遠い・近い）・雷跡・決着の前の待ち・輸送船が射線に入る（R14 A1。赤い線の行の末尾も）・決着の前の帰投の輪の中（R14 A5） */
export const LK_NORMAL = 0;
export const LK_FAR = 1;
export const LK_NEAR = 2;
export const LK_WAKES = 3;
export const LK_WAIT = 4;
export const LK_FIRE = 5;
export const LK_RING = 6;
/** landingKey の欄の位置（spec §5.2）: 副 << 1（3）| 方角 << 4（3）| 刻み << 7（6: 報告・射線の PT の 100 m か雷跡の秒）| % か雷跡の本数 << 13（7）| 残りの秒 << 20（8: 待ち・輪の中だけ）| 撃てる隻数 << 28（2: 平常だけ） */
export const LK_DIR = 4;
export const LK_STEP = 7;
export const LK_PCT = 13;
export const LK_LEFT = 20;
export const LK_ARMED = 28;

/**
 * 揚陸の 2 行目のキー（ui/mission-line が ptKey と並べて持つ。jp_01 の convoyKey と同じ作法）: 揚陸の無い任務は 0。
 * モード 36 は報告（副・輸送船からの方角・100 m 刻み）か雷跡（副・秒・本数）、呼びかけは決着の前の待ち（残りの秒）、米PT の平常（見えていない）は % と撃てる隻数、
 * みな去った後は決着の前の待ち（残りの秒。ptKey の K_WAIT と並ぶ）。見えている PT の行（距離と方角は ptKey）とほかのモードは 1（1 は揚陸の任務の印）
 */
export function landingKey(t: BoatTelemetry, mode: number): number {
  const l = t.landing;
  if (!l.enabled) return 0;
  if (mode === MISSION_LANDING_FIRE_LINE) return 1 | (LK_FIRE << 1) | (l.fireLineDirIdx << LK_DIR) | (Math.min(63, l.fireLineStep) << LK_STEP);
  if (mode === MISSION_WAITING) return landingRingWaiting(t) ? 1 | (LK_RING << 1) | (landingLeftS(l) << LK_LEFT) : 1;
  if (mode === MISSION_LANDING_THREAT) {
    if (l.reportSub === 0) return 1 | (LK_WAKES << 1) | (wakeSOf(l) << LK_STEP) | (wakesOf(l) << LK_PCT);
    return 1 | ((l.reportSub === LANDING_REPORT_NEAR ? LK_NEAR : LK_FAR) << 1) | (l.reportDirIdx << LK_DIR) | (reportStepOf(l) << LK_STEP);
  }
  const wait = 1 | (LK_WAIT << 1) | (landingLeftS(l) << LK_LEFT);
  if (mode === MISSION_CALL) return landingWaiting(l) ? wait : 1;
  if (mode === MISSION_PT_PASS) return landingFireLineShown(t) ? 1 | (LK_FIRE << 1) : 1; // 赤い線の行の末尾「輸送船が狙われる！」（game-1。航過のキー ptKey は保つ間は前の値）
  if (mode !== MISSION_PT) return 1;
  if (t.pt.alive === 0) return landingWaiting(l) ? wait : 1;
  if (t.pt.sighted) return 1;
  return 1 | (landingPct(l.pct) << LK_PCT) | (Math.min(3, l.armed) << LK_ARMED);
}

/**
 * モード 35 の文とキーが読む出来事（LandingTelemetry の出来事の欄と沈むまでの本数。LandingTelemetry がそのまま満たす）。2 行目は ui/pt-line-clock が写して持つもの
 * （S8 のレビュー game-2: 出たとみなす前の出来事は次の出来事に替わらず、次は 1 つ待つ・同じ種類の斉射は足す）。eventArmed は出来事のフレームのまだ撃てる隻数（斉射の後。code-2）
 */
export interface LandingEventView {
  eventKind: number; eventDirIdx: number; eventM: number; eventCount: number; eventBoats: number; eventHits: number; eventPct: number; eventArmed: number; hitsToSink: number;
}

export function createLandingEventView(): LandingEventView {
  return { eventKind: 0, eventDirIdx: 0, eventM: NaN, eventCount: 0, eventBoats: 0, eventHits: 0, eventPct: 0, eventArmed: 0, hitsToSink: 0 };
}

/** 出来事を写す（確保なし） */
export function copyLandingEvent(dst: LandingEventView, src: Readonly<LandingEventView>): void {
  dst.eventKind = src.eventKind;
  dst.eventDirIdx = src.eventDirIdx;
  dst.eventM = src.eventM;
  dst.eventCount = src.eventCount;
  dst.eventBoats = src.eventBoats;
  dst.eventHits = src.eventHits;
  dst.eventPct = src.eventPct;
  dst.eventArmed = src.eventArmed;
  dst.hitsToSink = src.hitsToSink;
}

/** 斉射の出来事（気づかれていない・慌てた・戦いながら・卯月に照らされた＝v0.6.10 S6。同じ種類は足す・待つ重さは斉射） */
export function landingSalvoEvent(kind: number): boolean {
  return kind === LE_CALM || kind === LE_HURRIED || kind === LE_ENGAGED || kind === LE_LIT_SALVO;
}

/** 出来事の距離の 100 m 刻み（切り上げ。63 まで。斉射の距離が無ければ 0） */
const eventStepOf = (l: LandingEventView): number => (Number.isNaN(l.eventM) ? 0 : Math.min(63, Math.ceil(l.eventM / LANDING_DIST_STEP_M)));
/** 沈むまであと何本（被雷・不発・外れの出来事のときの被雷の数から） */
const hitsLeftOf = (l: LandingEventView): number => Math.max(0, Math.min(LANDING_HITS_MAX, l.hitsToSink - l.eventHits));

/**
 * landingEventKey の欄の位置（spec §5.2）: 種類（4）| 方角 << 4（3）| 斉射の 100 m << 7（6）| 本数 << 13（4）| %（沈没）か揚陸の後（外れ）<< 17（7）| 沈むまであと何本 << 24（2）|
 * 足した斉射の隻数 << 26（2。R14 A3）| 撃てる米PT が残らない戦いながらの斉射 << 28（1。code-2）
 */
export const LEK_DIR = 4;
export const LEK_STEP = 7;
export const LEK_COUNT = 13;
export const LEK_PCT = 17;
export const LEK_LEFT = 24;
export const LEK_BOATS = 26;
export const LEK_GONE = 28;

/** 足した斉射の隻数（2 以上なら「米PT N 隻が…輸送船へ N 本」。1 隻の斉射・斉射でない出来事は 0。3 まで） */
const boatsOf = (l: LandingEventView): number => (l.eventBoats >= 2 ? Math.min(3, l.eventBoats) : 0);
/** 撃てる米PT が残らない戦いながらの斉射（もう輸送船を撃てる米PT がいない＝「魚雷は尽きた」。code-2。v0.6.10 実機 1 回目までは撃った PT が去ったので「米PT は去る」） */
const goneOf = (l: LandingEventView): boolean => l.eventKind === LE_ENGAGED && !(l.eventArmed > 0);

/**
 * モード 35 の行のキー（出来事の種類ごとに、その文に出る値だけ）: 斉射は方角と本数（慌てた・戦いながらは距離も。足した斉射は隻数と本数だけ）、戦いながらは撃てる米PT が残らないか、
 * 被雷・不発・外れは沈むまでの本数、沈没は %、外れは揚陸の後か
 */
export function landingEventKey(l: LandingEventView): number {
  const k = l.eventKind;
  if (allyLandingEvent(k)) return allyEventKey(l); // 卯月に照らされた斉射・撃たずに去った（v0.6.10 S6。ui/ally-lines）
  const salvo = landingSalvoEvent(k);
  const boats = salvo ? boatsOf(l) : 0;
  const one = salvo && boats === 0;
  const far = one && (k === LE_HURRIED || k === LE_ENGAGED);
  const left = k === LE_HIT || k === LE_DUD || k === LE_MISS ? hitsLeftOf(l) : 0;
  const pct = k === LE_SUNK ? landingPct(l.eventPct) : k === LE_MISS && left >= l.hitsToSink && l.eventPct >= 1 ? 1 : 0; // 外れの「揚陸の後」は被雷の無い文だけ
  return (
    k | ((one ? l.eventDirIdx : 0) << LEK_DIR) | ((far ? eventStepOf(l) : 0) << LEK_STEP) | ((salvo ? Math.min(15, l.eventCount) : 0) << LEK_COUNT) | (pct << LEK_PCT) |
    (left << LEK_LEFT) | (boats << LEK_BOATS) | ((goneOf(l) ? 1 : 0) << LEK_GONE)
  );
}

/**
 * モード 35 の行（LANDING_EVENT_SHOW_MS。ui/pt-line-clock の待ちの鎖）: 斉射（気づかれていない＝警告・慌てた＝強調・戦いながら＝警告。R12。慌てた・戦いながらは輸送船から見た方角と距離＝R14 A4、
 * 戦いながらの後ろは教え「離れて戦え」＝A1。撃てる米PT が残らなければ「魚雷は尽きた」＝code-2（撃った PT は去らずに自艇と戦う）。同じステップに足した斉射は隻数と本数＝A3）、被雷（あと N 本）、不発（F16: 被雷の後なら「被雷 N のまま」）、
 * 外れ（被雷の後なら「被雷 N のまま」＝code-1。揚陸の後なら「揚陸を続ける」を付けない）、揚陸の前の沈没（%）、揚陸完了、揚陸の後の沈没。l は ui/pt-line-clock が写して持つ出来事
 */
export function landingEventLine(l: LandingEventView, allyJa = ''): HudLine {
  const dir = bearingJa(l.eventDirIdx * 45);
  const n = Math.min(15, l.eventCount);
  const d = eventStepOf(l) * LANDING_DIST_STEP_M;
  const boats = boatsOf(l);
  const who = boats >= 2 ? `米PT ${boats} 隻が` : '米PT ';
  switch (l.eventKind) {
    case LE_CALM: return { text: boats >= 2 ? `${who}雷撃！ 輸送船へ ${n} 本` : `米PT 雷撃！ ${dir}から輸送船へ ${n} 本`, color: HUD_COLOR_WARN };
    case LE_HURRIED: return { text: `${who}慌てて発射！ ${boats >= 2 ? '輸送船へ' : `輸送船の${dir} ${d} m から`} ${n} 本 ・ 外れやすい`, color: HUD_COLOR_STRONG };
    case LE_ENGAGED: return { text: `${who}戦いながら発射！ ${boats >= 2 ? '輸送船へ' : `輸送船の${dir} ${d} m から`} ${n} 本 ・ ${goneOf(l) ? '魚雷は尽きた' : '離れて戦え'}`, color: HUD_COLOR_WARN };
    case LE_HIT: return { text: `輸送船 被雷！ あと ${hitsLeftOf(l)} 本で沈む`, color: HUD_COLOR_WARN };
    case LE_DUD: {
      const hits = l.hitsToSink - hitsLeftOf(l);
      return hits > 0 ? { text: `輸送船に命中 ・ 不発！ 被雷 ${hits} のまま`, color: HUD_COLOR_STRONG } : { text: '輸送船に命中 ・ 不発！ 輸送船は無事', color: HOME_COLOR_TEXT };
    }
    case LE_MISS: {
      // 別の斉射が先に当てていれば「輸送船は無事」と言わない（S8 のレビュー code-1: 被雷の 2 秒後に「それた！ 輸送船は無事」が被雷の行に替わった）
      const hits = l.hitsToSink - hitsLeftOf(l);
      if (hits > 0) return { text: `雷跡 それた ・ 被雷 ${hits} のまま`, color: HUD_COLOR_STRONG };
      return { text: l.eventPct >= 1 ? '雷跡 それた！ 輸送船は無事' : '雷跡 それた！ 輸送船は無事 ・ 揚陸を続ける', color: HOME_COLOR_TEXT };
    }
    case LE_SUNK: return { text: `輸送船 撃沈… 揚陸は ${landingPct(l.eventPct)}% で止まった ・ 帰投せよ`, color: HUD_COLOR_WARN };
    case LE_DONE: return { text: '揚陸完了！ あとは生きて帰れ', color: HOME_COLOR_TEXT };
    case LE_SUNK_DONE: return { text: '輸送船 撃沈…（揚陸は済んでいた）', color: HUD_COLOR_STRONG };
    default: return allyEventLine(l, allyJa); // 卯月に照らされた斉射・撃たずに去った（v0.6.10 S6。allyJa は卯月の呼び名。ほかの種類は ''）
  }
}

/**
 * 揚陸の任務の 2 行目の文（A11: ui/mission-line の分岐をここへ移した）: 35 出来事・36 輸送船への脅威・37 輸送船が射線に入る・決着の前の帰投の輪の中（MISSION_WAITING）。
 * それ以外（揚陸の無い任務・ほかのモード・決着の後の輪の中の魚雷待ち）は null＝mission-line のいつもの文。ev は 35 の出来事（ui/pt-line-clock の landingEv。省けばテレメトリの最後の出来事）
 */
export function landingLine(t: BoatTelemetry, mode: number, ev: LandingEventView = t.landing): HudLine | null {
  if (!t.landing.enabled) return null;
  if (mode === MISSION_LANDING_EVENT) return landingEventLine(ev, t.ally.labelJa);
  if (mode === MISSION_LANDING_THREAT) return landingThreatLine(t);
  if (mode === MISSION_LANDING_FIRE_LINE) return landingFireLineLine(t.landing);
  if (mode === MISSION_WAITING && landingRingWaiting(t)) return landingRingLine(t.landing);
  return null;
}

/** 右上の揚陸の時計（ui/landing-clock）のキー: 段階 | 揚陸の後に沈んだ << 2 | 揚陸中の残りの秒 << 3（1 秒に 1 回だけ変わる） */
export function landingClockKey(l: LandingTelemetry): number {
  return l.phase | (l.sunkAfterDone ? 4 : 0) | ((l.phase === LD_UNLOADING ? landingLeftS(l) : 0) << 3);
}

/** 右上の揚陸の時計の文と色（20 px・184 px の内）: 揚陸中「揚陸 あと N 秒」、揚陸完了（味方の青。その後に沈めば「揚陸完了（沈没）」）、揚陸の前に沈んだ「輸送船 沈没」（警告色） */
export function landingClockLine(l: LandingTelemetry): HudLine {
  if (l.phase === LD_DONE) return { text: l.sunkAfterDone ? '揚陸完了（沈没）' : '揚陸完了', color: HOME_COLOR_TEXT };
  if (l.phase === LD_SUNK) return { text: '輸送船 沈没', color: HUD_COLOR_WARN };
  return { text: `揚陸 あと ${landingLeftS(l)} 秒`, color: HUD_COLOR_STRONG };
}
