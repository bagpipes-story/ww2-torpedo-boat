// フローティング・バーチャルスティック（docs/02 §5、v0.2.1 で見直し）。画面左半分のタッチ開始点に出て、
// 倒した方向が目標方位（画面上=北）、倒した量が目標速度（中立=停止、いっぱいで全速）。カメラは回転しないので画面の向き＝世界の方位。
// 触れた点がそのまま中立（端に近くても原点をずらさない。ずらすと「置いただけで動き出す」）。台座は触れた点に固定し、指が半径を越えてもノブは縁で止まる
// （v0.2.1 実機: 台座が指についてくる方式は「強く倒すとスティック自体が動く」と不評だった）。
// HUD シーン（論理座標 1280×720）で動かす。結果は共有 InputState に書く（確保しない）。
import Phaser from 'phaser';
import { DEPTH, GAME_WIDTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { STICK_BASE_ALPHA, STICK_DEAD_ZONE, STICK_KNOB_ALPHA, STICK_RADIUS } from '../config/ui-config';
import { stickToCommand, type InputState } from '../core/input-state';

export class VirtualStick {
  private pointerId = -1;
  private originX = 0;
  private originY = 0;
  private readonly base: Phaser.GameObjects.Image;
  private readonly knob: Phaser.GameObjects.Image;
  private readonly tmp = new Phaser.Math.Vector2();
  private readonly cmd = { speed01: 0, headingDeg: NaN };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly input: InputState,
  ) {
    this.base = scene.add
      .image(0, 0, TEXTURE_KEYS.stickBase)
      .setScale(1 / RENDER_SCALE)
      .setAlpha(STICK_BASE_ALPHA)
      .setVisible(false)
      .setDepth(DEPTH.stickBase);
    this.knob = scene.add
      .image(0, 0, TEXTURE_KEYS.stickKnob)
      .setScale(1 / RENDER_SCALE)
      .setAlpha(STICK_KNOB_ALPHA)
      .setVisible(false)
      .setDepth(DEPTH.stickKnob);

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
    // 触れた点が中立。台座が画面からはみ出しても原点はずらさない（ずらすと置いただけで艇が動く）
    this.originX = v.x;
    this.originY = v.y;
    this.base.setPosition(this.originX, this.originY).setVisible(true);
    this.knob.setPosition(this.originX, this.originY).setVisible(true);
    this.input.stickActive = true;
    this.input.speed01 = 0;
    this.input.headingDeg = NaN;
  }

  /** 指の論理座標から、ノブ位置と目標方位・目標速度を更新する。台座は動かさず、ノブは縁（半径）で止める */
  private applyFinger(x: number, y: number): void {
    const dx = x - this.originX;
    const dy = y - this.originY;
    const len = Math.hypot(dx, dy);
    const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
    this.knob.setPosition(this.originX + dx * k, this.originY + dy * k);
    stickToCommand(dx, dy, STICK_RADIUS, STICK_DEAD_ZONE, this.cmd);
    this.input.speed01 = this.cmd.speed01;
    this.input.headingDeg = this.cmd.headingDeg;
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId || !p.isDown) return;
    const v = this.toLogical(p);
    this.applyFinger(v.x, v.y);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (p.id !== this.pointerId) return;
    this.pointerId = -1;
    this.base.setVisible(false);
    this.knob.setVisible(false);
    this.input.stickActive = false;
    this.input.headingDeg = NaN;
    this.input.speed01 = 0;
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
