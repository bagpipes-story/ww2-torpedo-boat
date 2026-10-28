// 停泊して揚陸する味方の輸送船と米PT の雷撃（v0.6.9 S6a。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v069 §5.1〜§5.3・R4・R5・R8（F13d・F16）・R12）の HUD の文とキー:
// 2 行目の平常（揚陸の % と狙う米PT）・見えている PT（静音／速い）・去った後の待ち・モード 36（見張りの報告・走っている雷跡）・モード 35（斉射・被雷・不発・外れ・沈没・揚陸完了）・
// 呼びかけの語（決着「揚陸完了 ・ 」「輸送船 沈没 ・ 」、決着の前の夜明け近し・燃料少の待ち）と、右上の揚陸の時計（ui/landing-clock）。
// Phaser も DOM を読む config も使わない（文を組むだけ。tests から型検査ごと読める）。どの文も t.landing.enabled の任務（jp_04）だけ: ほかの任務は landingKey 0・待ちは立たない。
// 距離は 100 m 刻みの切り上げ（core/landing の LANDING_DIST_STEP_M。「1800 m」とカンマなし）、% は切り捨て、秒は切り上げ。方角は輸送船から見た 8 方位（見張りの報告）。
// キーは行に出る値だけを詰める（行に出ない値は 0＝無駄に組み直さない）。文はキーと同じ丸めの関数でテレメトリから組む（ui/mission-line がキーでキャッシュする）。
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../config/hud-text-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { bearingJa } from '../core/briefing';
import {
  LANDING_DIST_STEP_M, LANDING_REPORT_NEAR, LD_DONE, LD_SUNK, LD_UNLOADING, LE_CALM, LE_DONE, LE_DUD, LE_ENGAGED, LE_HIT, LE_HURRIED, LE_MISS, LE_SUNK, LE_SUNK_DONE, type LandingTelemetry,
} from '../core/landing';
import { LANDING_HITS_MAX, LANDING_UNLOAD_MAX_S } from '../core/landing-data';
import { CALL_DAWN, CALL_FUEL } from '../core/mission-flow';
import type { HudLine } from './hud-lines';
import { MISSION_CALL, MISSION_LANDING_THREAT, MISSION_PT } from './mission-mode';

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

/** 「揚陸を待て あと 140 秒」（みな去った平常の行の後ろ・夜明け近しの呼びかけ） */
export function landingWaitTailJa(leftS: number): string {
  return `${LANDING_WAIT_JA} あと ${leftS} 秒`;
}

/** 呼びかけの語（決着＝CALL_SUNK のとき hud-lines の callLabel が返す。後ろに mission-line の「帰投せよ  N m」）: 揚陸の前に沈んだら「輸送船 沈没 ・ 」、揚陸完了（その後に沈んでも）は「揚陸完了 ・ 」 */
export function landingCallJa(l: LandingTelemetry): string {
  return l.phase === LD_SUNK ? '輸送船 沈没 ・ ' : '揚陸完了 ・ ';
}

/** 決着の前の呼びかけの後ろ（頭は dawnCallLabel の「夜明け近し 」「空襲下 」「燃料少 」）: 夜明けは「・ 揚陸を待て あと N 秒」、燃料少は「・ 揚陸まで あと N 秒 ・ 輪に入ると揚陸を見届けられない」（R4） */
export function landingWaitCallJa(call: number, leftS: number): string {
  return call === CALL_FUEL ? `・ 揚陸まで あと ${leftS} 秒 ・ 輪に入ると揚陸を見届けられない` : `・ ${landingWaitTailJa(leftS)}`;
}

/** 呼びかけで待ちの形を使う（決着の前の夜明け近し・燃料少。jp_04 では撃ち尽くしの呼びかけは立たない＝noTargetsLeft が偽） */
export function landingCallWaits(l: LandingTelemetry, call: number): boolean {
  return landingWaiting(l) && (call === CALL_DAWN || call === CALL_FUEL);
}

/** 平常の行（米PT が見えていない間。jp_05 の「米PT 2 隻が哨戒中」の代わり）: 揚陸の %・まだ撃てる米PT（みな撃てれば来る方角、減れば残り、0 ならもう撃てない） */
export function landingNormalLine(t: BoatTelemetry): HudLine {
  const l = t.landing;
  const armed = Math.min(3, l.armed);
  const who = armed === 0 ? '米PT はもう魚雷を撃てない' : armed >= l.total ? `米PT ${armed} 隻が${l.fromDirsJa}から輸送船を狙う` : `米PT 残り ${armed} 隻が輸送船を狙う`;
  return { text: `揚陸 ${landingPct(l.pct)}% ・ ${who}`, color: HUD_COLOR_STRONG };
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

/** 報告の 100 m 刻み（63 まで）・雷跡の最接近までの秒（切り上げ。63 まで）・雷跡の本数（127 まで） */
const reportStepOf = (l: LandingTelemetry): number => Math.min(63, l.reportStep);
const wakeSOf = (l: LandingTelemetry): number => (Number.isNaN(l.wakeCpaS) ? 0 : Math.min(63, Math.ceil(l.wakeCpaS)));
const wakesOf = (l: LandingTelemetry): number => Math.min(127, l.wakes);

/** モード 36 の行（警告色）: 報告が先（遠い＝今なら引きつけられる・近い＝寄れば慌てて撃つ）、報告が無ければ走っている雷跡と最接近までの秒 */
export function landingThreatLine(t: BoatTelemetry): HudLine {
  const l = t.landing;
  if (l.reportSub === 0) return { text: `雷跡 ${wakesOf(l)} 本が輸送船へ ・ あと ${wakeSOf(l)} 秒`, color: HUD_COLOR_WARN };
  const where = `輸送船の${bearingJa(l.reportDirIdx * 45)} ${reportStepOf(l) * LANDING_DIST_STEP_M} m`;
  if (l.reportSub === LANDING_REPORT_NEAR) return { text: `米PT 雷撃が近い！ ${where} ・ 寄れば慌てて撃つ（外れやすい）`, color: HUD_COLOR_WARN };
  return { text: `米PT 雷撃に来る！ ${where} ・ 今なら引きつけられる`, color: HUD_COLOR_WARN };
}

/** landingKey の副（bits 1〜3）: 平常・報告（遠い・近い）・雷跡・決着の前の待ち */
export const LK_NORMAL = 0;
export const LK_FAR = 1;
export const LK_NEAR = 2;
export const LK_WAKES = 3;
export const LK_WAIT = 4;
/** landingKey の欄の位置（spec §5.2）: 副 << 1（3）| 方角 << 4（3）| 刻み << 7（6: 報告の 100 m か雷跡の秒）| % か雷跡の本数 << 13（7）| 残りの秒 << 20（8: 待ちだけ）| 撃てる隻数 << 28（2: 平常だけ） */
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
  if (mode === MISSION_LANDING_THREAT) {
    if (l.reportSub === 0) return 1 | (LK_WAKES << 1) | (wakeSOf(l) << LK_STEP) | (wakesOf(l) << LK_PCT);
    return 1 | ((l.reportSub === LANDING_REPORT_NEAR ? LK_NEAR : LK_FAR) << 1) | (l.reportDirIdx << LK_DIR) | (reportStepOf(l) << LK_STEP);
  }
  const wait = 1 | (LK_WAIT << 1) | (landingLeftS(l) << LK_LEFT);
  if (mode === MISSION_CALL) return landingWaiting(l) ? wait : 1;
  if (mode !== MISSION_PT) return 1;
  if (t.pt.alive === 0) return landingWaiting(l) ? wait : 1;
  if (t.pt.sighted) return 1;
  return 1 | (landingPct(l.pct) << LK_PCT) | (Math.min(3, l.armed) << LK_ARMED);
}

/** 出来事の距離の 100 m 刻み（切り上げ。63 まで。斉射の距離が無ければ 0） */
const eventStepOf = (l: LandingTelemetry): number => (Number.isNaN(l.eventM) ? 0 : Math.min(63, Math.ceil(l.eventM / LANDING_DIST_STEP_M)));
/** 沈むまであと何本（被雷・不発の出来事のときの被雷の数から） */
const hitsLeftOf = (l: LandingTelemetry): number => Math.max(0, Math.min(LANDING_HITS_MAX, l.hitsToSink - l.eventHits));

/** landingEventKey の欄の位置（spec §5.2）: 種類（4）| 方角 << 4（3）| 斉射の 100 m << 7（6）| 本数 << 13（4）| %（沈没）か揚陸の後（外れ）<< 17（7）| 沈むまであと何本 << 24（2） */
export const LEK_DIR = 4;
export const LEK_STEP = 7;
export const LEK_COUNT = 13;
export const LEK_PCT = 17;
export const LEK_LEFT = 24;

/** モード 35 の行のキー（出来事の種類ごとに、その文に出る値だけ）: 斉射は方角と本数（慌てた・戦いながらは距離も）、被雷・不発は沈むまでの本数、沈没は %、外れは揚陸の後か */
export function landingEventKey(l: LandingTelemetry): number {
  const k = l.eventKind;
  const salvo = k === LE_CALM || k === LE_HURRIED || k === LE_ENGAGED;
  const far = k === LE_HURRIED || k === LE_ENGAGED;
  const pct = k === LE_SUNK ? landingPct(l.eventPct) : k === LE_MISS && l.eventPct >= 1 ? 1 : 0;
  return k | ((salvo ? l.eventDirIdx : 0) << LEK_DIR) | ((far ? eventStepOf(l) : 0) << LEK_STEP) | ((salvo ? Math.min(15, l.eventCount) : 0) << LEK_COUNT) | (pct << LEK_PCT) | ((k === LE_HIT || k === LE_DUD ? hitsLeftOf(l) : 0) << LEK_LEFT);
}

/**
 * モード 35 の行（LANDING_EVENT_SHOW_MS。ui/pt-line-clock の待ちの鎖）: 斉射（気づかれていない＝警告・慌てた＝強調・戦いながら＝警告。R12）、被雷（あと N 本）、不発（F16: 被雷の後なら「被雷 N のまま」）、
 * 外れ（揚陸の後なら「揚陸を続ける」を付けない）、揚陸の前の沈没（%）、揚陸完了、揚陸の後の沈没
 */
export function landingEventLine(t: BoatTelemetry): HudLine {
  const l = t.landing;
  const dir = bearingJa(l.eventDirIdx * 45);
  const n = Math.min(15, l.eventCount);
  const d = eventStepOf(l) * LANDING_DIST_STEP_M;
  switch (l.eventKind) {
    case LE_CALM: return { text: `米PT 雷撃！ ${dir}から輸送船へ ${n} 本`, color: HUD_COLOR_WARN };
    case LE_HURRIED: return { text: `米PT 慌てて発射！ ${dir} ${d} m から ${n} 本 ・ 外れやすい`, color: HUD_COLOR_STRONG };
    case LE_ENGAGED: return { text: `米PT 戦いながら発射！ ${dir} ${d} m から ${n} 本 ・ 外れやすい`, color: HUD_COLOR_WARN };
    case LE_HIT: return { text: `輸送船 被雷！ あと ${hitsLeftOf(l)} 本で沈む`, color: HUD_COLOR_WARN };
    case LE_DUD: {
      const hits = l.hitsToSink - hitsLeftOf(l);
      return hits > 0 ? { text: `輸送船に命中 ・ 不発！ 被雷 ${hits} のまま`, color: HUD_COLOR_STRONG } : { text: '輸送船に命中 ・ 不発！ 輸送船は無事', color: HOME_COLOR_TEXT };
    }
    case LE_MISS: return { text: l.eventPct >= 1 ? '雷跡 それた！ 輸送船は無事' : '雷跡 それた！ 輸送船は無事 ・ 揚陸を続ける', color: HOME_COLOR_TEXT };
    case LE_SUNK: return { text: `輸送船 撃沈… 揚陸は ${landingPct(l.eventPct)}% で止まった ・ 帰投せよ`, color: HUD_COLOR_WARN };
    case LE_DONE: return { text: '揚陸完了！ あとは生きて帰れ', color: HOME_COLOR_TEXT };
    case LE_SUNK_DONE: return { text: '輸送船 撃沈…（揚陸は済んでいた）', color: HUD_COLOR_STRONG };
    default: return { text: '', color: HUD_COLOR_STRONG };
  }
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
