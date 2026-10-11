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
  /** 色（null なら無色）と、濃さの上書き（NaN なら有効/無効の濃さ）。v0.3.3 の「識別」の点滅用。適用した濃さは覚えて同じ値は触らない */
  private tint: number | null = null;
  private alphaOverride = NaN;
  private lastAlpha = ROUND_BUTTON_ALPHA;

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
    this.applyAlpha();
  }

  setTint(color: number | null): void {
    if (color === this.tint) return;
    this.tint = color;
    if (color === null) this.button.clearTint();
    else this.button.setTint(color);
  }

  /** 濃さを直接決める（点滅など）。NaN で有効/無効の濃さに戻す */
  setAlphaOverride(a: number): void {
    if (Object.is(a, this.alphaOverride)) return;
    this.alphaOverride = a;
    this.applyAlpha();
  }

  private applyAlpha(): void {
    const a = Number.isNaN(this.alphaOverride) ? (this.enabled ? ROUND_BUTTON_ALPHA : ROUND_BUTTON_ALPHA * ROUND_BUTTON_DISABLED_ALPHA_FACTOR) : this.alphaOverride;
    if (a === this.lastAlpha) return;
    this.lastAlpha = a;
    this.button.setAlpha(a);
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
