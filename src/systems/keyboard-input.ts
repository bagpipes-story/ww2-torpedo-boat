// PC デバッグ用キー操作（docs/02 §5: 矢印/WASD = 進む方向、C = 全速、Space = 魚雷、Shift = 煙幕（押し続けで消火）、Z = 見張り）。
// 方向キーはスティックに触れている間は無視する。
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
  shift: Phaser.Input.Keyboard.Key;
  z: Phaser.Input.Keyboard.Key;
}

export class KeyboardInput {
  private readonly keys: Keys | null;
  /** キーボードが smokeHeld / lookout を true にした（キーが上がったら自分で戻す。タッチが立てたフラグには触らない） */
  private kbSmoke = false;
  private kbLookout = false;

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
          shift: Phaser.Input.Keyboard.KeyCodes.SHIFT,
          z: Phaser.Input.Keyboard.KeyCodes.Z,
        }) as Keys)
      : null;
  }

  /**
   * 毎フレーム呼ぶ。Space は魚雷 1 本。Shift/Z は押した瞬間と離した瞬間だけ書く（毎フレーム isDown で上書きすると、
   * 同じフラグを使う右側のタッチボタンの押下が次のフレームで消えてしまう）。Shift を離すと煙幕（消火した押下なら Mission が展開を捨てる）。
   * ウィンドウがフォーカスを失うと Phaser はキーを黙ってリセットし JustUp が来ないので、自分が立てたフラグはキーが上がっていれば戻す。
   * 矢印の合成方向が目標方位、押していなければ停止（針路は保つ）。C で全速
   */
  update(): void {
    if (!this.keys) return;
    const k = this.keys;
    if (Phaser.Input.Keyboard.JustDown(k.space)) this.input.fireTap = true;
    if (Phaser.Input.Keyboard.JustDown(k.shift)) {
      this.input.smokeHeld = true;
      this.kbSmoke = true;
    }
    if (Phaser.Input.Keyboard.JustUp(k.shift)) {
      this.input.smokeHeld = false;
      this.input.smokeTap = true;
      this.kbSmoke = false;
    }
    if (this.kbSmoke && !k.shift.isDown) {
      // フォーカス喪失などで離しを取りこぼした: 押し続けを解くだけ（展開はしない）
      this.input.smokeHeld = false;
      this.kbSmoke = false;
    }
    if (Phaser.Input.Keyboard.JustDown(k.z)) {
      this.input.lookout = true;
      this.kbLookout = true;
    }
    if ((Phaser.Input.Keyboard.JustUp(k.z) || !k.z.isDown) && this.kbLookout) {
      this.input.lookout = false;
      this.kbLookout = false;
    }
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
