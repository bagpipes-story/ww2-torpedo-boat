// ピンチズーム（docs/02 §5、v0.3.2）。右半分（ボタンの列を除く）で始まった 2 本の指の距離の変化を、カメラの論理ズームの要求（InputState.zoomRequest）に写す。
// 左半分はスティック、右端の列はボタン（そこで始まった指は数えない。魚雷ボタンの誤発射を避ける）。
// ここでも data の min〜max に収め、端に当たったら基準を取り直す（端で指を戻した瞬間から効く。戻しの空走りを作らない）。Mission も同じ範囲で clamp して保つ。確保しない。
import Phaser from 'phaser';
import { GAME_WIDTH } from '../config/game-config';
import { PINCH_BUTTON_COLUMN_X, PINCH_MIN_DIST_PX } from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-motion';
import type { InputState } from '../core/input-state';

export class PinchZoom {
  private readonly ids = [-1, -1];
  private readonly xs = [0, 0];
  private readonly ys = [0, 0];
  private startDist = 0;
  private startZoom = 1;
  private pinching = false;
  private readonly tmp = new Phaser.Math.Vector2();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly input: InputState,
    private readonly telemetry: BoatTelemetry,
    private readonly zoomMin: number,
    private readonly zoomMax: number,
  ) {
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
  }

  get active(): boolean {
    return this.pinching;
  }

  private slotOf(id: number): number {
    return this.ids[0] === id ? 0 : this.ids[1] === id ? 1 : -1;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    const v = this.scene.cameras.main.getWorldPoint(p.x, p.y, this.tmp);
    if (v.x < GAME_WIDTH / 2 || v.x >= PINCH_BUTTON_COLUMN_X) return;
    const slot = this.ids[0] === -1 ? 0 : this.ids[1] === -1 ? 1 : -1;
    if (slot === -1) return;
    this.ids[slot] = p.id;
    this.xs[slot] = v.x;
    this.ys[slot] = v.y;
    if (this.ids[0] !== -1 && this.ids[1] !== -1) {
      this.startDist = Math.max(PINCH_MIN_DIST_PX, Math.hypot(this.xs[0]! - this.xs[1]!, this.ys[0]! - this.ys[1]!));
      this.startZoom = this.telemetry.cameraZoom;
      this.pinching = true;
    }
  }

  private onMove(p: Phaser.Input.Pointer): void {
    const slot = this.slotOf(p.id);
    if (slot === -1 || !p.isDown) return;
    const v = this.scene.cameras.main.getWorldPoint(p.x, p.y, this.tmp);
    this.xs[slot] = v.x;
    this.ys[slot] = v.y;
    if (!this.pinching) return;
    const dist = Math.max(PINCH_MIN_DIST_PX, Math.hypot(this.xs[0]! - this.xs[1]!, this.ys[0]! - this.ys[1]!));
    // 指を開けば寄る（ズーム値が大きくなる）、閉じれば引く。端に当たったら基準を取り直す
    const raw = (this.startZoom * dist) / this.startDist;
    const z = raw < this.zoomMin ? this.zoomMin : raw > this.zoomMax ? this.zoomMax : raw;
    if (z !== raw) {
      this.startZoom = z;
      this.startDist = dist;
    }
    this.input.zoomRequest = z;
  }

  private onUp(p: Phaser.Input.Pointer): void {
    const slot = this.slotOf(p.id);
    if (slot === -1) return;
    this.ids[slot] = -1;
    this.pinching = false;
  }

  destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
  }
}
