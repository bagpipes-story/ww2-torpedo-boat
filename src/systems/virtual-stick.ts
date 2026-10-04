// フローティング・バーチャルスティック（docs/02 §5）。画面左半分のタッチ開始点に出て、X=舵、Y=スロットル。
// HUD シーン（論理座標 1280×720）で動かす。結果は共有 InputState に書く（確保しない）。
import Phaser from 'phaser';
import { GAME_WIDTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { STICK_BASE_ALPHA, STICK_DEAD_ZONE, STICK_KNOB_ALPHA, STICK_RADIUS } from '../config/ui-config';
import { applyDeadZone, type InputState } from '../core/input-state';

export class VirtualStick {
  private pointerId = -1;
  private originX = 0;
  private originY = 0;
  private readonly base: Phaser.GameObjects.Image;
  private readonly knob: Phaser.GameObjects.Image;
  private readonly tmp = new Phaser.Math.Vector2();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly input: InputState,
  ) {
    this.base = scene.add
      .image(0, 0, TEXTURE_KEYS.stickBase)
      .setScale(1 / RENDER_SCALE)
      .setAlpha(STICK_BASE_ALPHA)
      .setVisible(false)
      .setDepth(100);
    this.knob = scene.add
      .image(0, 0, TEXTURE_KEYS.stickKnob)
      .setScale(1 / RENDER_SCALE)
      .setAlpha(STICK_KNOB_ALPHA)
      .setVisible(false)
      .setDepth(101);

    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
  }

  /** ポインタの canvas 座標を HUD の論理座標へ（このシーンのカメラ基準） */
  private toLogical(p: Phaser.Input.Pointer): Phaser.Math.Vector2 {
    return this.scene.cameras.main.getWorldPoint(p.x, p.y, this.tmp);
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.pointerId !== -1) return;
    const v = this.toLogical(p);
    if (v.x >= GAME_WIDTH / 2) return; // 右半分はボタン領域（v0.1.3〜）
    this.pointerId = p.id;
    this.originX = v.x;
    this.originY = v.y;
    this.base.setPosition(v.x, v.y).setVisible(true);
    this.knob.setPosition(v.x, v.y).setVisible(true);
    this.input.stickActive = true;
    this.input.rudder = 0;
    this.input.throttle = 0;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId || !p.isDown) return;
    const v = this.toLogical(p);
    let dx = v.x - this.originX;
    let dy = v.y - this.originY;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) {
      const k = STICK_RADIUS / len;
      dx *= k;
      dy *= k;
    }
    this.knob.setPosition(this.originX + dx, this.originY + dy);
    this.input.rudder = applyDeadZone(dx / STICK_RADIUS, STICK_DEAD_ZONE);
    // 画面上（dy<0）が全速なので符号を反転
    this.input.throttle = -applyDeadZone(dy / STICK_RADIUS, STICK_DEAD_ZONE);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.pointerId = -1;
    this.base.setVisible(false);
    this.knob.setVisible(false);
    this.input.stickActive = false;
    this.input.rudder = 0;
    this.input.throttle = 0;
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    this.base.destroy();
    this.knob.destroy();
  }
}
