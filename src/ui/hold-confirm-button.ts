// 長押しで決める矩形ボタン（v0.5.1 実機 1 回目。一時停止の「任務をやめる」）。見た目は MenuButton と同じ。押し間違いで任務を捨てないよう、
// ボタンの上で holdMs 押し続けたときだけ決定する（離す・外へ出る・iOS の取り消しで最初から）。押している間は下端の帯が左から伸びる。
// 作るのは 1 回だけ。帯の幅は押している間だけ毎フレーム変える（矩形の幅だけ。§7: 確保しない・setText しない）。
import Phaser from 'phaser';
import { DEPTH } from '../config/game-config';
import { MENU_FILL_ALPHA, MENU_FILL_COLOR, MENU_FILL_PRESSED_ALPHA, MENU_INPUT_DELAY_MS, MENU_STROKE_ALPHA, MENU_STROKE_PX, MENU_SUB_PX, MENU_TWO_LINE_DY } from '../config/menu-config';
import { HUD_COLOR, HUD_COLOR_STRONG, hudTextStyle } from '../config/ui-config';

export interface HoldConfirmSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  titlePx: number;
  sub: string;
  holdMs: number;
  /** 帯の色と太さ */
  barColor: number;
  barH: number;
}

const NO_POINTER = -1;

export class HoldConfirmButton {
  private readonly rect: Phaser.GameObjects.Rectangle;
  private readonly bar: Phaser.GameObjects.Rectangle;
  private readonly texts: Phaser.GameObjects.Text[];
  private readonly timer: Phaser.Time.TimerEvent;
  private armed = false;
  private done = false;
  private pointerId = NO_POINTER;
  private pressedAt = 0;
  private lastFrac = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly spec: HoldConfirmSpec,
    private readonly onConfirm: () => void,
    delayMs: number = MENU_INPUT_DELAY_MS,
  ) {
    const { x, y, w, h } = spec;
    this.rect = scene.add.rectangle(x + w / 2, y + h / 2, w, h, MENU_FILL_COLOR, MENU_FILL_ALPHA).setStrokeStyle(MENU_STROKE_PX, MENU_FILL_COLOR, MENU_STROKE_ALPHA).setDepth(DEPTH.hud).setInteractive();
    this.bar = scene.add.rectangle(x, y + h - spec.barH, 0, spec.barH, spec.barColor, 1).setOrigin(0, 0).setDepth(DEPTH.hud + 1);
    const cx = x + w / 2;
    const cy = y + h / 2;
    this.texts = [
      scene.add.text(cx, cy - MENU_TWO_LINE_DY, spec.title, hudTextStyle(spec.titlePx, HUD_COLOR_STRONG)).setOrigin(0.5).setDepth(DEPTH.hud + 1),
      scene.add.text(cx, cy + MENU_TWO_LINE_DY, spec.sub, hudTextStyle(MENU_SUB_PX, HUD_COLOR)).setOrigin(0.5).setDepth(DEPTH.hud + 1),
    ];
    this.timer = scene.time.delayedCall(delayMs, () => {
      this.armed = true;
    });
    this.rect.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, this.onDown, this);
    this.rect.on(Phaser.Input.Events.GAMEOBJECT_POINTER_OUT, this.onCancel, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onCancel, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onCancel, this);
  }

  /** 毎フレーム（シーンの update から）。押している間だけ帯を伸ばし、holdMs に達したら 1 回だけ決定 */
  update(): void {
    if (this.pointerId === NO_POINTER || this.done) return;
    const frac = Math.min(1, (this.scene.time.now - this.pressedAt) / this.spec.holdMs);
    if (frac !== this.lastFrac) {
      this.lastFrac = frac;
      this.bar.width = this.spec.w * frac;
    }
    if (frac >= 1) {
      this.done = true;
      this.onConfirm();
    }
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onCancel, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onCancel, this);
    this.timer.remove(false);
    this.rect.destroy();
    this.bar.destroy();
    for (const t of this.texts) t.destroy();
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.armed || this.done || this.pointerId !== NO_POINTER) return;
    this.pointerId = p.id;
    this.pressedAt = this.scene.time.now;
    this.rect.setFillStyle(MENU_FILL_COLOR, MENU_FILL_PRESSED_ALPHA);
  }

  /** 離した・ボタンの外へ出た: 最初から（帯を戻す） */
  private onCancel(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId || this.done) return;
    this.pointerId = NO_POINTER;
    this.lastFrac = 0;
    this.bar.width = 0;
    this.rect.setFillStyle(MENU_FILL_COLOR, MENU_FILL_ALPHA);
  }
}
