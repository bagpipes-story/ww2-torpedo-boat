// 「静音」「倍速」の切り替えボタン（v0.8.3。ユーザーの要望 2026-11-23。docs/02 §5）: 左の一時停止の右に小さい丸を 2 つ（置き方は config/control-toggle-config）。どの任務にも出す（jp_03 も）。
// 離したとき（onUp）に InputState の silentOn・fastOn を入り切りする（世界は core/control-toggles が読む）。入れている間は丸に色と濃さ、倍速は「2×」を足し、静音はスティックの台座にも色。
// 見た目は値が変わったときだけ書く（§7。HoldButton の setTint・setLabel・setAlphaOverride も同じ値は触らない）。一時停止は押しかけを取り消す（cancel）だけで、入り切りは残る。確保は作るときだけ。
import type Phaser from 'phaser';
import { TEXTURE_KEYS } from '../config/game-config';
import { TORPEDO_BUTTON_ARM_MS } from '../config/ui-config';
import { CONTROL_TOGGLE_FONT_PX, CONTROL_TOGGLE_LABELS, CONTROL_TOGGLE_ON_ALPHA, CONTROL_TOGGLE_SCALE, CONTROL_TOGGLE_TINT, controlToggleLayout } from '../config/control-toggle-config';
import type { InputState } from '../core/input-state';
import { HoldButton } from './hold-button';

/** 静音の間の印を受けるスティック（systems/virtual-stick） */
export interface SilentMarkable {
  setSilent(on: boolean): void;
}

export class ControlToggleButtons {
  private readonly silent: HoldButton;
  private readonly fast: HoldButton;
  /** 見た目に出した入り切り（refresh が InputState と比べる。作るときは逆の値にして 1 回目で必ず書く） */
  private shownSilent: boolean;
  private shownFast: boolean;

  constructor(
    scene: Phaser.Scene,
    private readonly input: InputState,
    private readonly stick: SilentMarkable | undefined,
  ) {
    const [s, f] = controlToggleLayout();
    const opts = { armMs: TORPEDO_BUTTON_ARM_MS, fontPx: CONTROL_TOGGLE_FONT_PX }; // 前の画面（Briefing の「出撃」・Result の「もう一度」）の 2 度押しを受けない（機銃と同じ）
    this.silent = new HoldButton(scene, s!.x, s!.y, CONTROL_TOGGLE_LABELS.silent.off, { onUp: () => { input.silentOn = !input.silentOn; } }, TEXTURE_KEYS.roundButton, CONTROL_TOGGLE_SCALE, opts);
    this.fast = new HoldButton(scene, f!.x, f!.y, CONTROL_TOGGLE_LABELS.fast.off, { onUp: () => { input.fastOn = !input.fastOn; } }, TEXTURE_KEYS.roundButton, CONTROL_TOGGLE_SCALE, opts);
    this.shownSilent = !input.silentOn;
    this.shownFast = !input.fastOn;
    this.refresh();
  }

  /** 毎フレーム（Hud の update）: 入り切りが変わったときだけ見た目を書く */
  refresh(): void {
    const s = this.input.silentOn;
    if (s !== this.shownSilent) {
      this.shownSilent = s;
      apply(this.silent, s, CONTROL_TOGGLE_LABELS.silent, CONTROL_TOGGLE_TINT.silent);
      this.stick?.setSilent(s);
    }
    const f = this.input.fastOn;
    if (f !== this.shownFast) {
      this.shownFast = f;
      apply(this.fast, f, CONTROL_TOGGLE_LABELS.fast, CONTROL_TOGGLE_TINT.fast);
    }
  }

  /** 押しかけを取り消す（一時停止。入り切りは変えない） */
  cancel(): void {
    this.silent.cancel();
    this.fast.cancel();
  }

  destroy(): void {
    this.silent.destroy();
    this.fast.destroy();
  }
}

function apply(b: HoldButton, on: boolean, labels: { off: string; on: string }, tint: number): void {
  b.setLabel(on ? labels.on : labels.off);
  b.setTint(on ? tint : null);
  b.setAlphaOverride(on ? CONTROL_TOGGLE_ON_ALPHA : NaN);
}
