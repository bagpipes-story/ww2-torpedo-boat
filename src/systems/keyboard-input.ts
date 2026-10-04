// PC デバッグ用キー操作（docs/02 §5: 矢印/WASD = 舵とスロットル）。スティックに触れている間は無視する。
import Phaser from 'phaser';
import type { InputState } from '../core/input-state';

interface Keys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  w: Phaser.Input.Keyboard.Key;
  a: Phaser.Input.Keyboard.Key;
  s: Phaser.Input.Keyboard.Key;
  d: Phaser.Input.Keyboard.Key;
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
          space: Phaser.Input.Keyboard.KeyCodes.SPACE,
        }) as Keys)
      : null;
  }

  /** 毎フレーム呼ぶ。Space は魚雷 1 本。舵・スロットルはキーが押されていなければ巡航（0,0）に戻す */
  update(): void {
    if (!this.keys) return;
    const k = this.keys;
    if (Phaser.Input.Keyboard.JustDown(k.space)) this.input.fireTap = true;
    if (this.input.stickActive) return;
    const right = k.right.isDown || k.d.isDown ? 1 : 0;
    const left = k.left.isDown || k.a.isDown ? 1 : 0;
    const up = k.up.isDown || k.w.isDown ? 1 : 0;
    const down = k.down.isDown || k.s.isDown ? 1 : 0;
    this.input.rudder = right - left;
    this.input.throttle = up - down;
  }
}
