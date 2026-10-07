// PC デバッグ用キー操作（docs/02 §5: 矢印/WASD = 進む方向、C = 全速、Space = 魚雷）。スティックに触れている間は無視する。
import Phaser from 'phaser';
import type { InputState } from '../core/input-state';
import { radToDeg, wrapDeg360 } from '../core/units';

/** 矢印だけのときの目標速度（全速比）。静音帯の上限付近（18 kt / 39 kt ≈ 0.46 の少し下）。C を押している間は全速 */
const KEY_SPEED01 = 0.45;

interface Keys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
  c: Phaser.Input.Keyboard.Key;
  space: Phaser.Input.Keyboard.Key;
}

export class KeyboardInput {
  private readonly keys: Keys | null;

  constructor(
    scene: Phaser.Scene,
    private readonly input: InputState,
  ) {
    const kb = scene.input.keyboard;
    this.keys = kb
      ? (kb.addKeys({
          up: Phaser.Input.Keyboard.KeyCodes.UP,
          down: Phaser.Input.Keyboard.KeyCodes.DOWN,
          left: Phaser.Input.Keyboard.KeyCodes.LEFT,
          right: Phaser.Input.Keyboard.KeyCodes.RIGHT,
          w: Phaser.Input.Keyboard.KeyCodes.W,
          a: Phaser.Input.Keyboard.KeyCodes.A,
          s: Phaser.Input.Keyboard.KeyCodes.S,
          d: Phaser.Input.Keyboard.KeyCodes.D,
          c: Phaser.Input.Keyboard.KeyCodes.C,
          space: Phaser.Input.Keyboard.KeyCodes.SPACE,
        }) as Keys)
      : null;
  }

  /** 毎フレーム呼ぶ。Space は魚雷 1 本。矢印の合成方向が目標方位、押していなければ停止（針路は保つ）。C で全速 */
  update(): void {
    if (!this.keys) return;
    const k = this.keys;
    if (Phaser.Input.Keyboard.JustDown(k.space)) this.input.fireTap = true;
    if (this.input.stickActive) return;
    const x = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const y = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    if (x === 0 && y === 0) {
      this.input.headingDeg = NaN;
      this.input.speed01 = 0;
      return;
    }
    this.input.headingDeg = wrapDeg360(radToDeg(Math.atan2(x, -y)));
    this.input.speed01 = k.c.isDown ? 1 : KEY_SPEED01;
  }
}
