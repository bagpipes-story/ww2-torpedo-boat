// 「静音」「倍速」の切り替えボタン（v0.8.3。ユーザーの要望 2026-11-23。docs/02 §5）: 一時停止の右半分の弧に衛星の丸（v0.8.3 IP1。置き方は config/control-toggle-config の
// controlToggleRing、並びは CONTROL_TOGGLES＝1 つ足すなら 1 行）。どの任務にも出す（jp_03 も）。離したとき（onUp）に InputState の入り切りの鍵を返す（世界は core/control-toggles が読む）。
// 入れている間は丸に色と濃さ、倍速は「2×」を足し、静音はスティックの台座にも色。見た目は値が変わったときだけ書く（§7）。一時停止は押しかけを取り消す（cancel）だけで、入り切りは残る。確保は作るときだけ。
import type Phaser from 'phaser';
import { TEXTURE_KEYS } from '../config/game-config';
import { TORPEDO_BUTTON_ARM_MS } from '../config/ui-config';
import { CONTROL_TOGGLES, CONTROL_TOGGLE_FONT_PX, CONTROL_TOGGLE_HIT_R, CONTROL_TOGGLE_ON_ALPHA, CONTROL_TOGGLE_SCALE, controlToggleRing, type ControlToggleDef } from '../config/control-toggle-config';
import type { InputState } from '../core/input-state';
import { HoldButton } from './hold-button';

/** 静音の間の印を受けるスティック（systems/virtual-stick） */
export interface SilentMarkable {
  setSilent(on: boolean): void;
}

/** ヘッドレスの道具（scripts/headless/lib.mjs の isCtrl）が見分ける名前 */
export const CONTROL_TOGGLE_NAME = 'ctrl-toggle';

export class ControlToggleButtons {
  private readonly buttons: HoldButton[] = [];
  /** 見た目に出した入り切り（refresh が InputState と比べる。作るときは逆の値にして 1 回目で必ず書く） */
  private readonly shown: boolean[] = [];

  constructor(
    scene: Phaser.Scene,
    private readonly input: InputState,
    private readonly stick: SilentMarkable | undefined,
  ) {
    const spots = controlToggleRing(CONTROL_TOGGLES.length);
    // 前の画面（Briefing の「出撃」・Result の「もう一度」）の 2 度押しを受けない（機銃と同じ）。当たりは丸より大きい円（直径 81）
    const opts = { armMs: TORPEDO_BUTTON_ARM_MS, fontPx: CONTROL_TOGGLE_FONT_PX, hitR: CONTROL_TOGGLE_HIT_R, name: CONTROL_TOGGLE_NAME };
    CONTROL_TOGGLES.forEach((d, i) => {
      const p = spots[i]!;
      this.buttons.push(new HoldButton(scene, p.x, p.y, d.labels.off, { onUp: () => { input[d.flag] = !input[d.flag]; } }, TEXTURE_KEYS.roundButton, CONTROL_TOGGLE_SCALE, opts));
      this.shown.push(!input[d.flag]);
    });
    this.refresh();
  }

  /** 毎フレーム（Hud の update）: 入り切りが変わったときだけ見た目を書く */
  refresh(): void {
    for (let i = 0; i < CONTROL_TOGGLES.length; i++) {
      const d = CONTROL_TOGGLES[i]!;
      const on = this.input[d.flag];
      if (on === this.shown[i]) continue;
      this.shown[i] = on;
      apply(this.buttons[i]!, on, d);
      if (d.kind === 'silent') this.stick?.setSilent(on);
    }
  }

  /** 押しかけを取り消す（一時停止。入り切りは変えない） */
  cancel(): void {
    for (const b of this.buttons) b.cancel();
  }

  destroy(): void {
    for (const b of this.buttons) b.destroy();
  }
}

function apply(b: HoldButton, on: boolean, d: ControlToggleDef): void {
  b.setLabel(on ? d.labels.on : d.labels.off);
  b.setTint(on ? d.tint : null);
  b.setAlphaOverride(on ? CONTROL_TOGGLE_ON_ALPHA : NaN);
}
