// 味方の駆逐艦 卯月（v0.6.10 S6。jp_04。docs/02 §6.11、spec-v0610 part 2 の S6・リードの決定 LD3・LD4・R-U5・R-U7）の HUD の 2 行目の文とキー:
// モード 35（揚陸の出来事。ui/landing-lines の landingEventLine・landingEventKey がここへ渡す）の照らされた斉射（LE_LIT_SALVO）と撃たずに去った（LE_LIT_AWAY）、
// 13mm/25mm の出来事の行の「卯月の砲が起こした」印（K_ALLY_EVENT。ui/pt-gun-lines が頭を「卯月 撃退！」に）、平常の行の末尾（LD4）と帰投の輪の呼びかけの語（LD3。ui/dawn-lines・ui/pt-lines）。
// 卯月の無い夜（t.ally.enabled が偽・&noally）はどれも出ない（末尾・輪の語は ''・出来事は来ない）＝文とキーは前と同じ。呼び名は data の label_ja（t.ally.labelJa）。
// Phaser も DOM を読む config も使わない（文を組むだけ。tests から型検査ごと読める）。landing-lines からは型だけを読む（値は読まない＝循環しない）。
// キーは文に出る値だけを詰める（ui/mission-line がキーでキャッシュする）。距離は 100 m 刻みの切り上げ（core/landing の LANDING_DIST_STEP_M。斉射の行と同じ）。
import { HOME_COLOR_TEXT, HUD_COLOR_STRONG } from '../config/hud-text-config';
import type { AllyTelemetry } from '../core/ally-telemetry';
import { bearingJa } from '../core/briefing';
import { LANDING_DIST_STEP_M, LE_LIT_AWAY, LE_LIT_SALVO } from '../core/landing';
import type { HudLine } from './hud-lines';
import type { LandingEventView } from './landing-lines';

/** 13mm/25mm の出来事の行のキーの「卯月の砲が起こした」（bit 16。ui/pt-gun-lines の ptGunEventKey。隼艇の K_GUNBOAT_EVENT 15 の隣。卯月の無い任務は立たない） */
export const K_ALLY_EVENT = 1 << 16;

/** 帰投の輪の呼びかけの語（LD3。「夜明け近し ・ 帰投の輪で揚陸を待て あと N 秒」。「卯月に任せて」とは言わない＝卯月は北・北東の PT を見ない） */
export const ALLY_RING_JA = '帰投の輪で';

/** 揚陸の待ちの語（waitJa は ui/landing-lines の landingWaitTailJa「揚陸を待て あと N 秒」）に、呼びかけのある夜だけ「帰投の輪で」を前に付ける（LD3。無い夜は waitJa のまま） */
export function allyRingWaitJa(a: AllyTelemetry, waitJa: string): string {
  return a.enabled && a.ringCall ? `${ALLY_RING_JA}${waitJa}` : waitJa;
}

/** 平常の行の末尾（LD4）: ノーマルの卯月のいる夜で、まだ撃てる米PT がいる間だけ「 ・ 走らせれば卯月が照らす」（ハード・撃てる PT が無い・卯月の無い夜は ''） */
export function allyRunTailJa(a: AllyTelemetry, armed: number): string {
  return a.enabled && a.runHint && armed > 0 ? ` ・ 走らせれば${a.labelJa}が照らす` : '';
}

/** 卯月の出来事（モード 35 の LE_LIT_SALVO・LE_LIT_AWAY。ui/landing-lines の landingEventKey・landingEventLine がここへ渡す） */
export function allyLandingEvent(kind: number): boolean {
  return kind === LE_LIT_SALVO || kind === LE_LIT_AWAY;
}

/** 撃たずに去った後ろの句の種類: 0 なし（揚陸の決着の後＝輸送船を狙う PT の話は要らない）・1 まだ撃てる米PT が残る・2 もう撃てる米PT がいない */
const AWAY_NONE = 0;
const AWAY_ARMED = 1;
const AWAY_EMPTY = 2;

/** 出来事のときに揚陸がまだ決着していない（沈むまでの本数に届いていない・揚陸が 100% でない。LandingEventView の写しから） */
function unresolvedAt(l: Readonly<LandingEventView>): boolean {
  return l.eventHits < l.hitsToSink && l.eventPct < 1;
}

function awayKind(l: Readonly<LandingEventView>): number {
  if (!unresolvedAt(l)) return AWAY_NONE;
  return l.eventArmed > 0 ? AWAY_ARMED : AWAY_EMPTY;
}

/** 照らされた斉射の 100 m 刻み（切り上げ。63 まで。距離が無ければ 0）・足した斉射の隻数（2 以上。1 隻は 0。3 まで）・本数（15 まで） */
const stepOf = (l: Readonly<LandingEventView>): number => (Number.isNaN(l.eventM) ? 0 : Math.min(63, Math.ceil(l.eventM / LANDING_DIST_STEP_M)));
const boatsOf = (l: Readonly<LandingEventView>): number => (l.eventBoats >= 2 ? Math.min(3, l.eventBoats) : 0);

/** allyEventKey の欄（種類 4 ビットの上）: 照らされた斉射は 方角 << 4（3）| 100 m << 7（6）| 本数 << 13（4）| 足した隻数 << 26（2。ui/landing-lines の LEK_* と同じ位置）。撃たずに去ったは 句の種類 << 4（2）| 撃てる隻数 << 6（2） */
export const AK_DIR = 4;
export const AK_STEP = 7;
export const AK_COUNT = 13;
export const AK_BOATS = 26;
export const AK_AWAY = 4;
export const AK_ARMED = 6;

/** モード 35 の卯月の出来事のキー（文に出る値だけ）: 照らされた斉射は 1 隻なら方角と距離と本数・足した斉射は隻数と本数、撃たずに去ったは後ろの句の種類と撃てる隻数（句があるときだけ） */
export function allyEventKey(l: Readonly<LandingEventView>): number {
  const k = l.eventKind;
  if (k === LE_LIT_AWAY) {
    const away = awayKind(l);
    return k | (away << AK_AWAY) | ((away === AWAY_ARMED ? Math.min(3, l.eventArmed) : 0) << AK_ARMED);
  }
  const boats = boatsOf(l);
  const one = boats === 0;
  return k | ((one ? l.eventDirIdx : 0) << AK_DIR) | ((one ? stepOf(l) : 0) << AK_STEP) | (Math.min(15, l.eventCount) << AK_COUNT) | (boats << AK_BOATS);
}

/**
 * モード 35 の卯月の出来事の行: 照らされた斉射（R-U5: 射点の哨戒の PT が照らされて慌てて撃った＝狙い × 2.5。慌てた斉射と同じ強調色・輸送船から見た方角と距離。同じステップの斉射は隻数と本数）、
 * 撃たずに去った（味方の青。揚陸の決着の前なら後ろにまだ撃てる米PT の数か「撃てる米PT はもういない」）。ほかの種類は ''（来ない）。name は卯月の呼び名
 */
export function allyEventLine(l: Readonly<LandingEventView>, name: string): HudLine {
  if (l.eventKind === LE_LIT_AWAY) {
    const away = awayKind(l);
    const tail = away === AWAY_ARMED ? ` ・ 残り ${Math.min(3, l.eventArmed)} 隻が輸送船を狙う` : away === AWAY_EMPTY ? ' ・ 撃てる米PT はもういない' : '';
    return { text: `${name}が照らした！ 米PT は撃たずに去る${tail}`, color: HOME_COLOR_TEXT };
  }
  if (l.eventKind !== LE_LIT_SALVO) return { text: '', color: HUD_COLOR_STRONG };
  const boats = boatsOf(l);
  const n = Math.min(15, l.eventCount);
  const where = boats >= 2 ? '輸送船へ' : `輸送船の${bearingJa(l.eventDirIdx * 45)} ${stepOf(l) * LANDING_DIST_STEP_M} m から`;
  return { text: `${boats >= 2 ? `米PT ${boats} 隻が` : '米PT '}照らされて発射！ ${where} ${n} 本 ・ 外れやすい`, color: HUD_COLOR_STRONG };
}
