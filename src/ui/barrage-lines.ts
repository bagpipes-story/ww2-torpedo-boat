// 「煙の中へ乱射されている」（v0.8.4。史実モードだけ。ユーザーの要望 2026-11-23 の煙幕への乱射）の 2 行目の出来事の時計と文。ui/strait-line-clock が 1 つ持ち、flags・shown を毎フレーム呼ぶ
// （近すぎて船体の下を通過＝ui/under-lines と同じ作法: 2 行目に出ていた ms の和が SMOKE_BARRAGE_EVENT_SHOW_MS に届くまで旗＝上の行に隠れている間は待つ）。
// 読むのはテレメトリの数 t.smokeBarrage（乱射の弾が自艇から SMOKE_BARRAGE_HUD_NEAR_M 以内に落ちた累計）だけ。数が増えたら始め、出ている間に増えたら 4 秒を数え直す（撃たれ続ける間は出し続ける。
// 通し番号は変えない＝setText しない）。乱射の無い世界は数が 0 のまま＝旗も 0（ほかの任務・史実モードのオフは 1 ビットも変わらない）。音の警報の合図にしない（音の層はこのファイルを import しない）。
// Phaser・DOM を読まない。確保しない。
import { SMOKE_BARRAGE_EVENT_SHOW_MS } from '../config/barrage-hud-config';
import { HUD_COLOR_WARN } from '../config/hud-text-config';
import type { BoatTelemetry } from '../core/boat-telemetry';
import type { HudLine } from './hud-lines';
import { MISSION_BARRAGE_EVENT, MODE_FLAG_BARRAGE_EVENT } from './mission-mode';

/** 2 行目の文 */
export const BARRAGE_LINE_JA = '煙の中へ乱射されている';
export const BARRAGE_LINE: HudLine = { text: BARRAGE_LINE_JA, color: HUD_COLOR_WARN };

export class BarrageLineClock {
  /** 見た数・出している・始めた通し番号・出ていた ms の和・前のフレームに出ていた */
  private seenCount = 0;
  private active = false;
  private seq = 0;
  private onMs = 0;
  private onPrev = false;
  private prevShownMs = 0;
  /** 2 行目のキー（ui/mission-line-keys の lKey） */
  get key(): number {
    return this.seq;
  }

  /** 毎フレーム（モードを決める前）: MODE_FLAG_BARRAGE_EVENT */
  flags(t: BoatTelemetry, _nowMs: number): number {
    const n = t.smokeBarrage;
    if (n > this.seenCount) {
      this.seenCount = n;
      if (!this.active) {
        this.active = true;
        this.seq++;
      }
      this.onMs = 0;
    }
    if (this.active && this.onMs >= SMOKE_BARRAGE_EVENT_SHOW_MS) this.active = false;
    return this.active ? MODE_FLAG_BARRAGE_EVENT : 0;
  }

  /** モードが決まった後（nowMs は flags と同じ時刻）: 前のフレームから今まで出ていた ms を足す */
  shown(mode: number, nowMs: number): void {
    if (this.onPrev) this.onMs += nowMs - this.prevShownMs;
    this.onPrev = mode === MISSION_BARRAGE_EVENT;
    this.prevShownMs = nowMs;
  }
}
