// 押している間と離したときを知らせる丸ボタン（右上「煙幕」・右中「見張り」。docs/02 §5）。HUD シーンに置く。
// 押下はボタン上で、解放は同じ指ならどこで離しても拾う（指が滑っても確実に離しを検出する）。
import Phaser from 'phaser';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { HUD_COLOR_STRONG, HUD_FONT_BUTTON_PX, ROUND_BUTTON_ALPHA, ROUND_BUTTON_DISABLED_ALPHA_FACTOR, ROUND_BUTTON_PRESSED_SCALE, hudTextStyle } from '../config/ui-config';

export interface HoldButtonHandlers {
  onDown?: () => void;
  /** 押していた実秒を渡す */
  onUp?: (holdS: number) => void;
}

export class HoldButton {
  private readonly button: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private pointerId = -1;
  private pressedAt = -1;
  private enabled = true;
  private lastLabel = '';

  constructor(
    private readonly scene: Phaser.Scene,
    cx: number,
    cy: number,
    label: string,
    private readonly handlers: HoldButtonHandlers,
  ) {
    this.button = scene.add.image(cx, cy, TEXTURE_KEYS.roundButton).setScale(1 / RENDER_SCALE).setAlpha(ROUND_BUTTON_ALPHA).setDepth(DEPTH.hud).setInteractive();
    this.label = scene.add.text(cx, cy, '', hudTextStyle(HUD_FONT_BUTTON_PX, HUD_COLOR_STRONG)).setOrigin(0.5).setAlign('center').setDepth(DEPTH.hud + 1);
    this.setLabel(label);
    this.button.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
  }

  get pressed(): boolean {
    return this.pointerId !== -1;
  }

  /** 文字が変わったときだけ setText */
  setLabel(text: string): void {
    if (text === this.lastLabel) return;
    this.lastLabel = text;
    this.label.setText(text);
  }

  /** 使えないときは薄く（押下は受けるが呼び出し側が無視する） */
  setEnabled(v: boolean): void {
    if (v === this.enabled) return;
    this.enabled = v;
    this.button.setAlpha(v ? ROUND_BUTTON_ALPHA : ROUND_BUTTON_ALPHA * ROUND_BUTTON_DISABLED_ALPHA_FACTOR);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.pointerId !== -1) return;
    this.pointerId = p.id;
    this.pressedAt = this.scene.time.now;
    this.button.setScale(ROUND_BUTTON_PRESSED_SCALE / RENDER_SCALE);
    this.handlers.onDown?.();
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.pointerId === -1 || p.id !== this.pointerId) return;
    const holdS = (this.scene.time.now - this.pressedAt) / 1000;
    this.pointerId = -1;
    this.pressedAt = -1;
    this.button.setScale(1 / RENDER_SCALE);
    this.handlers.onUp?.(holdS);
  }

  destroy(): void {
    this.button.off(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, this.onDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    this.button.destroy();
    this.label.destroy();
  }
}
