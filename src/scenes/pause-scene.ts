// 一時停止の画面（v0.5.1 実機 1 回目。docs/02 §5）: Hud の「一時停止」かアプリが裏に回ったときに、止めた Mission と Hud の上に重ねる。
// 右下「再開」で Mission と Hud を動かし直す。左下「任務をやめる」は 1 秒長押しで Mission を終わらせて任務一覧（Title）へ（Result は出さない・通算の命中率に数えない）。
// 画面ができてから 0.3 秒は押下を受けない（一時停止を押した指の 2 度押しで再開しない）。作るのは 1 回だけ（§7）。
import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, SCENE_KEYS } from '../config/game-config';
import {
  MENU_PRIMARY_W,
  MENU_PRIMARY_X,
  PAUSE_BACKING_ALPHA,
  PAUSE_DIM_ALPHA,
  PAUSE_NOTE_JA,
  PAUSE_NOTE_PX,
  PAUSE_NOTE_Y,
  PAUSE_QUIT_BAR_COLOR,
  PAUSE_QUIT_BAR_H,
  PAUSE_QUIT_HOLD_MS,
  PAUSE_QUIT_JA,
  PAUSE_QUIT_SUB_JA,
  PAUSE_RESUME_JA,
  PAUSE_TITLE_JA,
  PAUSE_TITLE_PX,
  PAUSE_TITLE_Y,
  RESULT_BUTTON_H,
  RESULT_BUTTON_PX,
  RESULT_BUTTON_Y,
  RESULT_LIST_X,
} from '../config/menu-config';
import { HUD_COLOR, HUD_COLOR_STRONG, hudTextStyle } from '../config/ui-config';
import { HoldConfirmButton } from '../ui/hold-confirm-button';
import { MenuButton, addBuildLabel } from '../ui/menu-ui';

export class PauseScene extends Phaser.Scene {
  private resume?: MenuButton;
  private quit?: HoldConfirmButton;
  /** 二重遷移の防止 */
  private leaving = false;

  constructor() {
    super(SCENE_KEYS.pause);
  }

  create(): void {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.leaving = false;
    // 下の Hud・Mission に指を通さない（いちばん上のシーンの当たりで止まる）
    this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, PAUSE_DIM_ALPHA).setOrigin(0, 0).setDepth(DEPTH.hud - 1).setInteractive();
    // 下の Hud の文字が透けて重ならないよう、ビルド番号の行（Hud の「ビルド番号｜データ版」の行を隠す）と 2 つのボタンの下だけ濃くする
    const label = addBuildLabel(this);
    this.back(0, 0, GAME_WIDTH, label.y + label.height);
    this.back(MENU_PRIMARY_X, RESULT_BUTTON_Y, MENU_PRIMARY_W, RESULT_BUTTON_H);
    this.back(RESULT_LIST_X, RESULT_BUTTON_Y, MENU_PRIMARY_W, RESULT_BUTTON_H);
    this.add.text(GAME_WIDTH / 2, PAUSE_TITLE_Y, PAUSE_TITLE_JA, hudTextStyle(PAUSE_TITLE_PX, HUD_COLOR_STRONG)).setOrigin(0.5).setDepth(DEPTH.hud);
    this.add.text(GAME_WIDTH / 2, PAUSE_NOTE_Y, PAUSE_NOTE_JA, hudTextStyle(PAUSE_NOTE_PX, HUD_COLOR)).setOrigin(0.5).setDepth(DEPTH.hud);
    this.resume = new MenuButton(this, { x: MENU_PRIMARY_X, y: RESULT_BUTTON_Y, w: MENU_PRIMARY_W, h: RESULT_BUTTON_H, title: PAUSE_RESUME_JA, titlePx: RESULT_BUTTON_PX, align: 'center' }, () => this.leave(false));
    this.quit = new HoldConfirmButton(
      this,
      { x: RESULT_LIST_X, y: RESULT_BUTTON_Y, w: MENU_PRIMARY_W, h: RESULT_BUTTON_H, title: PAUSE_QUIT_JA, titlePx: RESULT_BUTTON_PX, sub: PAUSE_QUIT_SUB_JA, holdMs: PAUSE_QUIT_HOLD_MS, barColor: PAUSE_QUIT_BAR_COLOR, barH: PAUSE_QUIT_BAR_H },
      () => this.leave(true),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.resume?.destroy();
      this.quit?.destroy();
      this.resume = undefined;
      this.quit = undefined;
    });
  }

  /** 暗幕の上・文字とボタンの下に敷く黒（作るのは create の 1 回だけ） */
  private back(x: number, y: number, w: number, h: number): void {
    this.add.rectangle(x, y, w, h, 0x000000, PAUSE_BACKING_ALPHA).setOrigin(0, 0).setDepth(DEPTH.hud - 0.5);
  }

  override update(): void {
    this.quit?.update();
  }

  private leave(quit: boolean): void {
    if (this.leaving) return;
    this.leaving = true;
    if (quit) {
      // Mission を止めると Hud も止まる（Mission の SHUTDOWN）。一覧（Title）へ
      this.scene.stop(SCENE_KEYS.mission);
      this.scene.start(SCENE_KEYS.title);
      return;
    }
    this.scene.resume(SCENE_KEYS.mission);
    this.scene.resume(SCENE_KEYS.hud);
    this.scene.stop();
  }
}
