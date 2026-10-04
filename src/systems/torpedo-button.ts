// 魚雷ボタン（docs/02 §5: 右下。タップ=1本、長押し→離す=残弾を扇状に一斉発射、長押し時間で開き角）。
// HUD シーンに置く。結果は共有 InputState に書き、Mission が消費する。
import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, HUD_MARGIN, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  HUD_COLOR_STRONG,
  HUD_FONT_BUTTON_PX,
  TORPEDO_BUTTON_ALPHA,
  TORPEDO_BUTTON_EMPTY_ALPHA_FACTOR,
  TORPEDO_BUTTON_PRESSED_SCALE,
  TORPEDO_SPREAD_LABEL_GAP,
  TORPEDO_BUTTON_RADIUS,
  TORPEDO_BUTTON_TAP_MAX_S,
  hudTextStyle,
} from '../config/ui-config';
import type { InputState } from '../core/input-state';
import { spreadAngleForHold, type SpreadConfig } from '../core/salvo';

export class TorpedoButton {
  private readonly button: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly spreadText: Phaser.GameObjects.Text;
  private pressedAt = -1;
  /** 押している指の pointer id。-1 なら押されていない */
  private pointerId = -1;
  private lastRemaining = -1;
  private lastSpreadShown = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly input: InputState,
    private readonly spread: SpreadConfig,
  ) {
    const cx = GAME_WIDTH - HUD_MARGIN - TORPEDO_BUTTON_RADIUS;
    const cy = GAME_HEIGHT - HUD_MARGIN - TORPEDO_BUTTON_RADIUS;
    this.button = scene.add
      .image(cx, cy, TEXTURE_KEYS.torpedoButton)
      .setScale(1 / RENDER_SCALE)
      .setAlpha(TORPEDO_BUTTON_ALPHA)
      .setDepth(DEPTH.hud)
      .setInteractive();
    this.label = scene.add.text(cx, cy, '', hudTextStyle(HUD_FONT_BUTTON_PX, HUD_COLOR_STRONG)).setOrigin(0.5).setAlign('center').setDepth(DEPTH.hud + 1);
    this.spreadText = scene.add
      .text(cx, cy - TORPEDO_BUTTON_RADIUS - TORPEDO_SPREAD_LABEL_GAP, '', hudTextStyle(HUD_FONT_BUTTON_PX))
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.hud + 1);

    // 押下はボタン上で、解放は同じ指ならどこで離しても拾う（指が滑って外れた・画面外で離した場合も確実に発射する）
    this.button.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.lastRemaining <= 0 || this.pointerId !== -1) return;
    this.pointerId = p.id;
    this.pressedAt = this.scene.time.now;
    this.button.setScale(TORPEDO_BUTTON_PRESSED_SCALE / RENDER_SCALE);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.pointerId === -1 || p.id !== this.pointerId) return;
    const holdS = (this.scene.time.now - this.pressedAt) / 1000;
    this.pointerId = -1;
    this.pressedAt = -1;
    this.button.setScale(1 / RENDER_SCALE);
    this.hideSpread();
    if (holdS < TORPEDO_BUTTON_TAP_MAX_S) {
      this.input.fireTap = true;
    } else {
      this.input.fireSalvoSpreadDeg = spreadAngleForHold(holdS - TORPEDO_BUTTON_TAP_MAX_S, this.spread);
    }
  }

  private hideSpread(): void {
    if (this.lastSpreadShown !== -1) {
      this.lastSpreadShown = -1;
      this.spreadText.setText('');
    }
  }

  /** 残弾表示。値が変わったときだけ setText */
  setRemaining(n: number): void {
    if (n === this.lastRemaining) return;
    this.lastRemaining = n;
    this.label.setText(`魚雷\n${n}`);
    this.button.setAlpha(n > 0 ? TORPEDO_BUTTON_ALPHA : TORPEDO_BUTTON_ALPHA * TORPEDO_BUTTON_EMPTY_ALPHA_FACTOR);
  }

  /** 毎フレーム: 長押し中は開き角の予告を出す（整数が変わったときだけ） */
  update(): void {
    if (this.pressedAt < 0) return;
    const holdS = (this.scene.time.now - this.pressedAt) / 1000;
    if (holdS < TORPEDO_BUTTON_TAP_MAX_S) return;
    const deg = Math.round(spreadAngleForHold(holdS - TORPEDO_BUTTON_TAP_MAX_S, this.spread));
    if (deg === this.lastSpreadShown) return;
    this.lastSpreadShown = deg;
    this.spreadText.setText(`一斉 ${deg}°`);
  }

  destroy(): void {
    this.button.off(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, this.onDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    this.button.destroy();
    this.label.destroy();
    this.spreadText.destroy();
  }
}
