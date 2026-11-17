// 止まった艦の任務（v0.8.1 S4。us_06）の 2 行目の出来事の時計（spec-v0810 §6 の S4、lead の L61）。ui/strait-line-clock が 1 つ持ち flags・shown を毎フレーム呼ぶ（レーダーの出来事と同じ作法:
// 2 行目に出ていた ms の和が ANCHOR_EVENT_SHOW_MS に届くまで旗＝上の行に隠れている間は待つ。モードはレーダーの出来事のすぐ下＝ui/mission-mode）。文は ui/anchor-texts（IP1 で分けた・ここから再 export）。
// - 「岸の陰に入った ・ 見つかる距離 360 m」（IP1 で「暗い岸を背にした」から）: 最寄りの浮いている艦に対する背に岸のビット（t.anchor.backdropOn）が立った時・20 秒に 1 回まで。距離は 3 行目と同じ
//   50 m の四捨五入（出ている間に 3 行目が変われば文も）。ビットが下りたら出している・待っている文はやめる（3 行目と食い違う文を残さない）。
// - 「停泊していた艦が動き出した！」（警告の色）: 目で見えている艦（t.anchor.seenMask＝mission-telemetry の setSighted と同じ d² ≤ visRange2）が動き出した時・艦ごとに 1 回。見えない艦と
//   夜明けの動き出し（帯が「東へ退く」と言う）は出さない。出ている「岸の陰」・手がかりの文には替わる。音の警報の合図にしない（音の層はこのファイルを import しない＝tests/sfx-rules）。
// - 寄り方の手がかり（IP1。実機 1 回目「浜の方へ向かえばいいという指示やヒントも無い」）: 1 夜に 1 回、レーダーの最初の接触が出た後（モードがレーダーの出来事より下＝それを遅らせない。
//   レーダーの無い夜は出撃から）。自艇が既に岸の陰にいれば出さない。出ている間に岸の陰に入れば「岸の陰に入った」に替わる（手がかりの無い S4 の時計と同じ時刻に始まる）。
// 読むのは t.anchor・t.radar の最初の接触・3 行目の見つかる距離だけ（艦の AI・止まった段の旗・見えない艦の位置は読まない＝tests/anchor-lines の走査）。Phaser・DOM を読まない。確保しない。
import { ANCHOR_BACKDROP_MIN_GAP_MS, ANCHOR_EVENT_SHOW_MS } from '../config/anchor-hud-config';
import type { BoatTelemetry } from '../core/boat-telemetry';
import { ANCHOR_REASON_DAWN } from '../core/anchored-ship';
import { ANCHOR_EV_BACKDROP, ANCHOR_EV_HINT, ANCHOR_EV_NONE, ANCHOR_EV_UNDERWAY, type AnchorLineView } from './anchor-texts';
import { DETECT_RANGE_STEP_M } from './hud-lines';
import { MISSION_ANCHOR_EVENT, MODE_FLAG_ANCHOR_EVENT } from './mission-mode';

export { ANCHOR_EV_BACKDROP, ANCHOR_EV_HINT, ANCHOR_EV_NONE, ANCHOR_EV_UNDERWAY, ANCHOR_HINT_JA, ANCHOR_UNDERWAY_JA, anchorBackdropLineJa, anchorLine, anchorWithdrawJa, type AnchorLineView } from './anchor-texts';
/** ビットで持てる艦の数（隊は 4 隻まで） */
const ANCHOR_LINE_MAX_SHIPS = 30;

export class AnchorLineClock implements AnchorLineView {
  /** 出している出来事・3 行目の見つかる距離の刻み（DETECT_RANGE_STEP_M の数） */
  kind = ANCHOR_EV_NONE; step = 0;
  /** 始めた通し番号・出ていた ms の和・前のフレームに出ていた・動き出しを見た艦のビット・背に岸のビットの前の値・待っている背に岸・最後に背に岸を始めた ms・手がかりを済ませた */
  private seq = 0; private onMs = 0; private onPrev = false; private prevShownMs = 0;
  private underwaySeen = 0; private backdropPrev = false; private backdropPending = false; private lastBackdropMs = -Infinity; private hintDone = false;
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
    if (moved) this.start(ANCHOR_EV_UNDERWAY); // 出ている「岸の陰」・手がかりに替わる・動き出しの文は 4 秒を数え直す
    if (a.backdropOn && !this.backdropPrev && nowMs - this.lastBackdropMs >= ANCHOR_BACKDROP_MIN_GAP_MS) {
      this.lastBackdropMs = nowMs;
      if (this.kind === ANCHOR_EV_NONE || this.kind === ANCHOR_EV_HINT) this.start(ANCHOR_EV_BACKDROP);
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
    // 寄り方の手がかり: レーダーの最初の接触の後（レーダーの無い夜は今）・ほかの出来事の無い時に 1 回。岸の陰にいれば出さずに済ませる
    if (!this.hintDone && (!t.radar.enabled || !Number.isNaN(t.radar.firstS)) && (a.backdropOn || this.kind === ANCHOR_EV_NONE)) {
      this.hintDone = true;
      if (!a.backdropOn) this.start(ANCHOR_EV_HINT);
    }
    return this.kind !== ANCHOR_EV_NONE ? MODE_FLAG_ANCHOR_EVENT : 0;
  }

  /** モードが決まった後（nowMs は flags と同じ時刻）: 前のフレームから今まで出ていた ms を足す */
  shown(mode: number, nowMs: number): void {
    if (this.onPrev) this.onMs += nowMs - this.prevShownMs;
    this.onPrev = mode === MISSION_ANCHOR_EVENT;
    this.prevShownMs = nowMs;
  }
  /** 手がかりに替わる出来事は、手がかりの出ていた ms を 4 秒に数えない（手がかりの無い時計と同じフレームに終わる） */
  private start(kind: number): void { if (this.kind === ANCHOR_EV_HINT) this.onPrev = false; this.kind = kind; this.onMs = 0; this.seq++; }
}
