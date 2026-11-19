// 「近すぎて船体の下を通過」（v0.8.2 IP1。ユーザーの決め 2026-11-19「推奨通り知らせを出してください。でもメッセージは「近すぎて船体の下を通過」にしてください」）の 2 行目の出来事の時計と文。
// ui/strait-line-clock が 1 つ持ち、flags・shown を毎フレーム呼ぶ（止まった艦・報告の出来事と同じ作法: 2 行目に出ていた ms の和が UNDER_EVENT_SHOW_MS に届くまで旗＝上の行に隠れている間は待つ）。
// 読むのはテレメトリの数 t.torpedoUnder（systems/torpedo-under＝武装の前に狙える艦の船体の下を通った自艇の魚雷の数）だけ。数が増えたら始める（出ている間に増えても 4 秒を数え直さない＝1 本ごとに
// 文は同じ）。全任務で同じ（狙える艦の無い任務は数が 0 のまま＝旗も 0）。音の警報の合図にしない（音の層はこのファイルを import しない）。Phaser・DOM を読まない。確保しない。
import { UNDER_EVENT_SHOW_MS } from '../config/under-hud-config';
import { HUD_COLOR_WARN } from '../config/hud-text-config';
import type { BoatTelemetry } from '../core/boat-telemetry';
import type { HudLine } from './hud-lines';
import { MISSION_UNDER_EVENT, MODE_FLAG_UNDER_EVENT } from './mission-mode';

/** 2 行目の文（ユーザーの言葉そのまま） */
export const UNDER_LINE_JA = '近すぎて船体の下を通過';
export const UNDER_LINE: HudLine = { text: UNDER_LINE_JA, color: HUD_COLOR_WARN };

export class UnderLineClock {
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

  /** 毎フレーム（モードを決める前）: MODE_FLAG_UNDER_EVENT */
  flags(t: BoatTelemetry, _nowMs: number): number {
    if (t.torpedoUnder > this.seenCount) {
      this.seenCount = t.torpedoUnder;
      if (!this.active) {
        this.active = true;
        this.onMs = 0;
        this.seq++;
      }
    }
    if (this.active && this.onMs >= UNDER_EVENT_SHOW_MS) this.active = false;
    return this.active ? MODE_FLAG_UNDER_EVENT : 0;
  }

  /** モードが決まった後（nowMs は flags と同じ時刻）: 前のフレームから今まで出ていた ms を足す */
  shown(mode: number, nowMs: number): void {
    if (this.onPrev) this.onMs += nowMs - this.prevShownMs;
    this.onPrev = mode === MISSION_UNDER_EVENT;
    this.prevShownMs = nowMs;
  }
}
