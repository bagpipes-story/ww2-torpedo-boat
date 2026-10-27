// 魚雷ボタン（docs/02 §5: 右下。タップ=1本、長押し→離す=扇状に一斉発射。長押し時間で本数 2 → 3 → 4（v0.4.8。何秒で何本かは data の salvo_hold_start_s・salvo_count_step_s）。扇は隣どうしの間隔が固定）。
// HUD シーンに置く。結果は共有 InputState に書き、Mission が消費する。
// v0.6.8: 置き場所と大きさは呼ぶ側（ui/weapon-panel が config/hud-layout-config から。実機 1 回目から全任務で右下の角の R64＝sizeScale 1。縮めれば当たりも絵といっしょに縮む）。
// 撃てない間（輪の中・沈み始め・終わりの待ち。ArmsTelemetry.torpedoUsable）は薄くして押下を受けない。0 本で押すと揺れて onEmpty（「魚雷は撃ち尽くした」）。濃さは 1 か所（applyAlpha）で変わったときだけ書く（§7）。
import Phaser from 'phaser';
import { TORPEDO_EMPTY_SHAKE_MS, TORPEDO_EMPTY_SHAKE_PX } from '../config/arms-config';
import { DEPTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  HUD_COLOR_STRONG,
  HUD_FONT_BUTTON_PX,
  TORPEDO_BUTTON_ALPHA,
  TORPEDO_BUTTON_ARM_MS,
  TORPEDO_BUTTON_EMPTY_ALPHA_FACTOR,
  TORPEDO_BUTTON_PRESSED_SCALE,
  TORPEDO_SPREAD_LABEL_GAP,
  TORPEDO_BUTTON_RADIUS,
  hudTextStyle,
} from '../config/ui-config';
import type { InputState } from '../core/input-state';
import { salvoCountForHold, salvoSpreadDeg, type SpreadConfig } from '../core/salvo';

export class TorpedoButton {
  private readonly button: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly spreadText: Phaser.GameObjects.Text;
  private pressedAt = -1;
  /** 押している指の pointer id。-1 なら押されていない */
  private pointerId = -1;
  private lastRemaining = -1;
  private lastCountShown = -1;
  /** 撃てる（ArmsTelemetry.torpedoUsable。v0.6.8）と、いま書いてある濃さ（変わったときだけ setAlpha） */
  private usable = true;
  private lastAlpha = TORPEDO_BUTTON_ALPHA;
  /** 0 本で押したときの揺れ（押したときだけ作る。走っている間は重ねない） */
  private shake: Phaser.Tweens.Tween | null = null;
  /** 作ってから TORPEDO_BUTTON_ARM_MS は押下を受けない（前の画面の「出撃」の 2 度押し。v0.4.0）。scene.time.now は作った時点では前回の値なのでタイマーで待つ */
  private armed = false;
  private readonly armTimer: Phaser.Time.TimerEvent;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly input: InputState,
    private readonly spread: SpreadConfig,
    private readonly cx: number,
    cy: number,
    /** 絵と当たりの倍率（v0.6.8。実機 1 回目から全任務で 1） */
    private readonly sizeScale: number = 1,
    /** 0 本で押した（揺れの後。HUD の 1 行の文「魚雷は撃ち尽くした」） */
    private readonly onEmpty?: () => void,
    fontPx: number = HUD_FONT_BUTTON_PX,
  ) {
    this.button = scene.add
      .image(cx, cy, TEXTURE_KEYS.torpedoButton)
      .setScale(sizeScale / RENDER_SCALE)
      .setAlpha(TORPEDO_BUTTON_ALPHA)
      .setDepth(DEPTH.hud)
      .setInteractive();
    this.label = scene.add.text(cx, cy, '', hudTextStyle(fontPx, HUD_COLOR_STRONG)).setOrigin(0.5).setAlign('center').setDepth(DEPTH.hud + 1);
    // 「一斉 N 本」の下端は円の上端から TORPEDO_SPREAD_LABEL_GAP 上（縮めたなら縮めた円の上端）
    this.spreadText = scene.add
      .text(cx, cy - TORPEDO_BUTTON_RADIUS * sizeScale - TORPEDO_SPREAD_LABEL_GAP, '', hudTextStyle(HUD_FONT_BUTTON_PX))
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.hud + 1);

    this.armTimer = scene.time.delayedCall(TORPEDO_BUTTON_ARM_MS, () => {
      this.armed = true;
    });
    // 押下はボタン上で、解放は同じ指ならどこで離しても拾う（指が滑って外れた・画面外で離した場合も確実に発射する）
    this.button.on(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
  }

  /** 押している（長押しの途中。HUD の 1 行の文はこの間隠す＝「一斉 N 本」が出る場所と重なる） */
  get pressed(): boolean {
    return this.pointerId !== -1;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.armed || this.pointerId !== -1) return;
    if (this.lastRemaining <= 0) {
      this.shakeEmpty();
      this.onEmpty?.();
      return;
    }
    if (!this.usable) return;
    this.pointerId = p.id;
    this.pressedAt = this.scene.time.now;
    this.button.setScale((TORPEDO_BUTTON_PRESSED_SCALE * this.sizeScale) / RENDER_SCALE);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (this.pointerId === -1 || p.id !== this.pointerId) return;
    const holdS = (this.scene.time.now - this.pressedAt) / 1000;
    this.pointerId = -1;
    this.pressedAt = -1;
    this.button.setScale(this.sizeScale / RENDER_SCALE);
    this.hideSpread();
    // holdStartS 未満（と残弾 1）は 1 本＝タップ。2 本以上は扇
    const n = salvoCountForHold(holdS, this.spread, this.lastRemaining);
    if (n >= 2) {
      this.input.fireSalvoCount = n;
      this.input.fireSalvoSpreadDeg = salvoSpreadDeg(n, this.spread);
    } else if (n === 1) {
      this.input.fireTap = true;
    }
  }

  /** 押している途中を取り消す（一時停止。v0.5.1）。撃たない */
  cancel(): void {
    if (this.pointerId === -1) return;
    this.pointerId = -1;
    this.pressedAt = -1;
    this.button.setScale(this.sizeScale / RENDER_SCALE);
    this.hideSpread();
  }

  private hideSpread(): void {
    if (this.lastCountShown !== -1) {
      this.lastCountShown = -1;
      this.spreadText.setText('');
    }
  }

  /** 0 本で押した: 左右に TORPEDO_EMPTY_SHAKE_PX 揺らして元の x に戻す（押したときだけ tween を作る） */
  private shakeEmpty(): void {
    if (this.shake !== null) return;
    const x = this.cx;
    this.shake = this.scene.tweens.add({
      targets: [this.button, this.label],
      x: { from: x - TORPEDO_EMPTY_SHAKE_PX, to: x + TORPEDO_EMPTY_SHAKE_PX },
      duration: TORPEDO_EMPTY_SHAKE_MS / 4,
      yoyo: true,
      repeat: 1,
      onComplete: () => {
        this.button.x = x;
        this.label.x = x;
        this.shake = null;
      },
    });
  }

  /** 残弾表示（積んでいる本数。v0.6.8）。値が変わったときだけ setText */
  setRemaining(n: number): void {
    if (n === this.lastRemaining) return;
    this.lastRemaining = n;
    this.label.setText(`魚雷\n${n}`);
    this.applyAlpha();
  }

  /** 撃てるか（輪の外・浮いている・終わりの待ちでない。v0.6.8）。撃てなければ薄く、押下を受けない */
  setUsable(b: boolean): void {
    if (b === this.usable) return;
    this.usable = b;
    this.applyAlpha();
  }

  /** 濃さは 1 か所で決める: 積んでいて撃てるならいつもの濃さ、ほかは薄く（変わったときだけ書く） */
  private applyAlpha(): void {
    const a = this.lastRemaining > 0 && this.usable ? TORPEDO_BUTTON_ALPHA : TORPEDO_BUTTON_ALPHA * TORPEDO_BUTTON_EMPTY_ALPHA_FACTOR;
    if (a === this.lastAlpha) return;
    this.lastAlpha = a;
    this.button.setAlpha(a);
  }

  /** 毎フレーム: 長押し中は本数の予告を出す（2 本になってから。本数が変わったときだけ） */
  update(): void {
    if (this.pressedAt < 0) return;
    const n = salvoCountForHold((this.scene.time.now - this.pressedAt) / 1000, this.spread, this.lastRemaining);
    if (n < 2 || n === this.lastCountShown) return;
    this.lastCountShown = n;
    this.spreadText.setText(`一斉 ${n} 本`);
  }

  destroy(): void {
    this.button.off(Phaser.Input.Events.GAMEOBJECT_POINTER_DOWN, this.onDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    this.armTimer.remove(false);
    if (this.shake !== null) this.shake.remove();
    this.shake = null;
    this.button.destroy();
    this.label.destroy();
    this.spreadText.destroy();
  }
}
