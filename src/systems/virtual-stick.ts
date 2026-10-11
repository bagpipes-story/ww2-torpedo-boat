// バーチャルスティック（docs/02 §5）。v0.3.1 実機の要望で左下に固定表示にした（v0.2.1 までは触れた点に出るフローティング）。
// 倒した方向が目標方位（画面上=北）、倒した量が目標速度（中立=停止、いっぱいで全速）。カメラは回転しないので画面の向き＝世界の方位。
// 原点の決め方（ハイブリッド）: 台座に触れればその中心が原点（縁に触れればすぐ倒した扱い＝固定スティックの直感）。
// 左半分の台座の外に触れればその点が原点（置いただけで動き出さない。v0.2.1 の「触れた点が中立」を残す）。ノブはどちらでも台座の上に描く。
// 台座は動かさず、指が半径を越えてもノブは縁で止まる（v0.2.1 実機: 台座が指についてくる方式は不評だった）。
// HUD シーン（論理座標 1280×720）で動かす。結果は共有 InputState に書く（確保しない）。
import Phaser from 'phaser';
import { DEPTH, GAME_WIDTH, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import { STICK_BASE_ALPHA, STICK_DEAD_ZONE, STICK_FIXED_CENTER_X, STICK_FIXED_CENTER_Y, STICK_GRAB_RATIO, STICK_KNOB_ALPHA, STICK_RADIUS } from '../config/ui-config';
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
      .image(STICK_FIXED_CENTER_X, STICK_FIXED_CENTER_Y, TEXTURE_KEYS.stickBase)
      .setScale(1 / RENDER_SCALE)
      .setAlpha(STICK_BASE_ALPHA)
      .setDepth(DEPTH.stickBase);
    this.knob = scene.add
      .image(STICK_FIXED_CENTER_X, STICK_FIXED_CENTER_Y, TEXTURE_KEYS.stickKnob)
      .setScale(1 / RENDER_SCALE)
      .setAlpha(STICK_KNOB_ALPHA)
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
    const bx = v.x - STICK_FIXED_CENTER_X;
    const by = v.y - STICK_FIXED_CENTER_Y;
    const grab = STICK_RADIUS * STICK_GRAB_RATIO;
    this.input.stickActive = true;
    if (bx * bx + by * by <= grab * grab) {
      // 台座の上: 台座の中心が原点。触れた位置がそのまま倒した量になる
      this.originX = STICK_FIXED_CENTER_X;
      this.originY = STICK_FIXED_CENTER_Y;
      this.applyFinger(v.x, v.y);
    } else {
      // 台座の外: 触れた点が原点（中立）。ノブは台座の上に描く
      this.originX = v.x;
      this.originY = v.y;
      this.knob.setPosition(STICK_FIXED_CENTER_X, STICK_FIXED_CENTER_Y);
      this.input.speed01 = 0;
      this.input.headingDeg = NaN;
    }
  }

  /** 指の論理座標から、ノブ位置と目標方位・目標速度を更新する。ノブは台座の中心からの差で描き、縁（半径）で止める */
  private applyFinger(x: number, y: number): void {
    const dx = x - this.originX;
    const dy = y - this.originY;
    const len = Math.hypot(dx, dy);
    const k = len > STICK_RADIUS ? STICK_RADIUS / len : 1;
    this.knob.setPosition(STICK_FIXED_CENTER_X + dx * k, STICK_FIXED_CENTER_Y + dy * k);
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
    this.knob.setPosition(STICK_FIXED_CENTER_X, STICK_FIXED_CENTER_Y);
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
