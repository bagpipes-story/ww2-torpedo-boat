// 止まった艦の任務（v0.8.1 S4。us_06）の 2 行目の出来事（spec-v0810 §6 の S4、lead の L61）。時計は ui/strait-line-clock が持ち flags・shown を毎フレーム呼ぶ（レーダーの出来事と同じ作法:
// 2 行目に出ていた ms の和が ANCHOR_EVENT_SHOW_MS に届くまで旗＝上の行に隠れている間は待つ。モードはレーダーの出来事のすぐ下＝ui/mission-mode）。
// - 「暗い岸を背にした ・ 見つかる距離 360 m」: 最寄りの浮いている艦に対する背に岸のビット（t.anchor.backdropOn）が立った時・20 秒に 1 回まで。距離は 3 行目と同じ 50 m の四捨五入
//   （出ている間に 3 行目が変われば文も）。ビットが下りたら出している・待っている文はやめる（3 行目と食い違う文を残さない）。
// - 「停泊していた艦が動き出した！」（警告の色）: 目で見えている艦（t.anchor.seenMask＝mission-telemetry の setSighted と同じ d² ≤ visRange2）が動き出した時・艦ごとに 1 回。見えない艦と
//   夜明けの動き出し（帯が「東へ退く」と言う）は出さない。出ている「背に岸」の文には替わる。音の警報の合図にしない（音の層はこのファイルを import しない＝tests/sfx-rules）。
// 読むのは t.anchor・3 行目の見つかる距離・輸送船と撃沈の数だけ（艦の AI・止まった段の旗・見えない艦の位置は読まない＝tests/anchor-lines の走査）。Phaser・DOM を読まない。確保しない。
import { ANCHOR_BACKDROP_MIN_GAP_MS, ANCHOR_EVENT_SHOW_MS } from '../config/anchor-hud-config';
import { HUD_COLOR_STRONG, HUD_COLOR_WARN } from '../config/hud-text-config';
import type { BoatTelemetry } from '../core/boat-telemetry';
import { ANCHOR_REASON_DAWN } from '../core/anchored-ship';
import { DETECT_RANGE_STEP_M, type HudLine } from './hud-lines';
import { MISSION_ANCHOR_EVENT, MODE_FLAG_ANCHOR_EVENT } from './mission-mode';

/** 出来事の種類（0 なし・1 暗い岸を背にした・2 停泊していた艦が動き出した）。ビットで持てる艦の数（隊は 4 隻まで） */
export const ANCHOR_EV_NONE = 0, ANCHOR_EV_BACKDROP = 1, ANCHOR_EV_UNDERWAY = 2;
const ANCHOR_LINE_MAX_SHIPS = 30;
export const ANCHOR_UNDERWAY_JA = '停泊していた艦が動き出した！';
export const anchorBackdropLineJa = (step: number): string => `暗い岸を背にした ・ 見つかる距離 ${step * DETECT_RANGE_STEP_M} m`;

/** 2 行目の文が読む時計の部分（AnchorLineClock がそのまま満たす） */
export interface AnchorLineView { readonly kind: number; readonly step: number }
/** モード 41 の行（kind が無ければ null） */
export function anchorLine(c: AnchorLineView): HudLine | null {
  if (c.kind === ANCHOR_EV_UNDERWAY) return { text: ANCHOR_UNDERWAY_JA, color: HUD_COLOR_WARN };
  return c.kind === ANCHOR_EV_BACKDROP ? { text: anchorBackdropLineJa(c.step), color: HUD_COLOR_STRONG } : null;
}

export class AnchorLineClock implements AnchorLineView {
  /** 出している出来事・3 行目の見つかる距離の刻み（DETECT_RANGE_STEP_M の数） */
  kind = ANCHOR_EV_NONE; step = 0;
  /** 始めた通し番号・出ていた ms の和・前のフレームに出ていた・動き出しを見た艦のビット・背に岸のビットの前の値・待っている背に岸・最後に背に岸を始めた ms */
  private seq = 0; private onMs = 0; private onPrev = false; private prevShownMs = 0;
  private underwaySeen = 0; private backdropPrev = false; private backdropPending = false; private lastBackdropMs = -Infinity;
  /** 2 行目のキー（ui/mission-line-keys の lKey）: 始めた通し番号と、背に岸の文の距離の刻み */
  get key(): number { return this.seq * 256 + (this.kind === ANCHOR_EV_BACKDROP ? this.step : 0); }

  /** 毎フレーム（モードを決める前）: MODE_FLAG_ANCHOR_EVENT。止まった艦の無い任務は 0 */
  flags(t: BoatTelemetry, nowMs: number): number {
    const a = t.anchor;
    if (!a) return 0;
    this.step = Math.round(t.detectRangeM / DETECT_RANGE_STEP_M);
    let moved = false;
    for (let i = 0; i < a.underwayAtS.length && i < ANCHOR_LINE_MAX_SHIPS; i++) {
      const bit = 1 << i;
      if ((this.underwaySeen & bit) !== 0 || Number.isNaN(a.underwayAtS[i]!)) continue;
      this.underwaySeen |= bit;
      moved ||= (a.seenMask & bit) !== 0 && a.reason[i] !== ANCHOR_REASON_DAWN;
    }
    if (moved) this.start(ANCHOR_EV_UNDERWAY); // 出ている「背に岸」に替わる・動き出しの文は 4 秒を数え直す
    if (a.backdropOn && !this.backdropPrev && nowMs - this.lastBackdropMs >= ANCHOR_BACKDROP_MIN_GAP_MS) {
      this.lastBackdropMs = nowMs;
      if (this.kind === ANCHOR_EV_NONE) this.start(ANCHOR_EV_BACKDROP);
      else this.backdropPending = true; // 動き出しの文の後に出す
    }
    this.backdropPrev = a.backdropOn;
    if (!a.backdropOn && this.kind === ANCHOR_EV_BACKDROP) this.kind = ANCHOR_EV_NONE;
    if (!a.backdropOn) this.backdropPending = false;
    if (this.kind !== ANCHOR_EV_NONE && this.onMs >= ANCHOR_EVENT_SHOW_MS) {
      if (this.backdropPending) this.start(ANCHOR_EV_BACKDROP);
      else this.kind = ANCHOR_EV_NONE;
      this.backdropPending = false;
    }
    return this.kind !== ANCHOR_EV_NONE ? MODE_FLAG_ANCHOR_EVENT : 0;
  }

  /** モードが決まった後（nowMs は flags と同じ時刻）: 前のフレームから今まで出ていた ms を足す */
  shown(mode: number, nowMs: number): void {
    if (this.onPrev) this.onMs += nowMs - this.prevShownMs;
    this.onPrev = mode === MISSION_ANCHOR_EVENT;
    this.prevShownMs = nowMs;
  }
  private start(kind: number): void { this.kind = kind; this.onMs = 0; this.seq++; }
}
/** 夜明けの帯の退く行（ui/dawn-lines の withdrawBannerJa の後）: 輸送船は泊地に止まって退かないので、浮いていれば「輸送船は泊地に残る」、駆逐艦が沈んでいれば「退く」と言わない。ほかの任務は base */
export function anchorWithdrawJa(t: BoatTelemetry, base: string): string {
  if (!t.anchor || base === '' || !t.transportEnabled || t.transportSunk) return base;
  if (t.shipsSunk < t.shipsTotal) return `${t.dawn.forceJa}は${t.dawn.retireJa}へ退く ・ 輸送船は泊地に残る ・ ${t.torpedoesLeft > 0 ? '追うか帰投か' : '帰投せよ'}`;
  return `輸送船は泊地に残る ・ ${t.torpedoesLeft > 0 ? '撃つか帰投か' : '帰投せよ'}`;
}
