// 一時停止（v0.5.1 実機 1 回目。docs/02 §5）: Hud の左端の「一時停止」と、アプリが裏に回ったとき（ホームへ戻った・着信など）。
// 押しかけの HUD の操作（スティック・魚雷・丸ボタン・ピンチ）を取り消し、入力を戻し、Mission と Hud を止めて一時停止の画面（PauseScene）を重ねる。
// 押しても止まるだけ（任務をやめるのは一時停止の画面で 1 秒長押し）なので、押し間違えても失うものが無い。Hud に置く。確保はしない。
// 再開してから PAUSE_RESUME_GUARD_MS は Hud の押下を受けない（右下の「再開」の 2 度押しが、下にある魚雷・扇のボタンに入らないように）。
import Phaser from 'phaser';
import { SCENE_KEYS, TEXTURE_KEYS } from '../config/game-config';
import { PAUSE_RESUME_GUARD_MS } from '../config/menu-config';
import { PAUSE_BUTTON_LABEL, PAUSE_BUTTON_SIZE_SCALE, PAUSE_BUTTON_X, PAUSE_BUTTON_Y } from '../config/ui-config';
import { resetInput, type InputState } from '../core/input-state';
import { HoldButton } from './hold-button';

/** 押しかけを取り消せる操作 */
export interface Cancelable {
  cancel(): void;
}

export class PauseControl {
  private readonly button: HoldButton;
  private paused = false;
  private guard?: Phaser.Time.TimerEvent;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly input: InputState,
    /** 止めるときに取り消す操作（作り直されることがあるので呼ぶたびに集める） */
    private readonly controls: () => readonly (Cancelable | undefined)[],
  ) {
    this.button = new HoldButton(scene, PAUSE_BUTTON_X, PAUSE_BUTTON_Y, PAUSE_BUTTON_LABEL, { onUp: () => this.open() }, TEXTURE_KEYS.roundButton, PAUSE_BUTTON_SIZE_SCALE);
    scene.game.events.on(Phaser.Core.Events.HIDDEN, this.open, this);
    scene.events.on(Phaser.Scenes.Events.RESUME, this.onResume, this);
  }

  /** 止める（任務が動いていて、まだ止めていないときだけ） */
  open(): void {
    if (this.paused || !this.scene.scene.isActive(SCENE_KEYS.mission)) return;
    this.paused = true;
    for (const c of this.controls()) c?.cancel();
    this.button.cancel();
    resetInput(this.input);
    this.scene.scene.pause(SCENE_KEYS.mission);
    this.scene.scene.launch(SCENE_KEYS.pause);
    this.scene.scene.pause();
  }

  /** 一時停止の画面の「再開」で Hud が動き直した。止めている間の入力は捨てる */
  private onResume(): void {
    this.paused = false;
    resetInput(this.input);
    this.scene.input.enabled = false;
    this.guard?.remove(false);
    this.guard = this.scene.time.delayedCall(PAUSE_RESUME_GUARD_MS, () => {
      this.scene.input.enabled = true;
    });
  }

  destroy(): void {
    this.guard?.remove(false);
    this.scene.game.events.off(Phaser.Core.Events.HIDDEN, this.open, this);
    this.scene.events.off(Phaser.Scenes.Events.RESUME, this.onResume, this);
    this.button.destroy();
  }
}
