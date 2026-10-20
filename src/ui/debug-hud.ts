// デバッグHUD: FPS とビルド番号を画面に常時表示する（CLAUDE.md §3）。描画サイズの行は ?debug のときだけ（v0.4.2: 2 行目の長い文と同じ段で重なる）。
// v0.6.2 実機 1 回目: 左上 2 段目は夜明けの時計（ui/dawn-clock）が使うので、描画サイズの行は燃料計の下へ移した（SIZE_TEXT_Y）。
// §7: 毎フレーム setText しない。FPS は一定間隔で整数化して前回値と違うときだけ、表示サイズは RESIZE イベント時だけ更新する。
import Phaser from 'phaser';
import { DEBUG_ENABLED, DEPTH, GAME_WIDTH, HUD_FPS_INTERVAL_MS, HUD_MARGIN } from '../config/game-config';
import { FUEL_GAUGE_OFFSET_Y, FUEL_TICK_HEIGHT, HP_BAR_HEIGHT, HP_FONT_PX, HUD_FONT_DEBUG_PX, HUD_TEXT_GAP, hudTextStyle } from '../config/ui-config';

/**
 * ?debug の描画サイズの行の y（v0.6.2 実機 1 回目: 左上 2 段目は夜明けの時計になったので、燃料計の下端（目盛りのはみ出し込み）から HUD_TEXT_GAP 空けた所 = 174。
 * 一時停止ボタンの上端（PAUSE_BUTTON_Y − 半径 = 234）より上。ui-config は 300 行を超えているのでここに置く）
 */
const SIZE_TEXT_Y = HUD_MARGIN + FUEL_GAUGE_OFFSET_Y + HP_FONT_PX + HUD_TEXT_GAP + HP_BAR_HEIGHT / 2 + FUEL_TICK_HEIGHT / 2 + HUD_TEXT_GAP;

export interface DebugHudOptions {
  buildLabel: string;
  dataSummary: string;
}

export class DebugHud {
  private readonly fpsText: Phaser.GameObjects.Text;
  private readonly infoText: Phaser.GameObjects.Text;
  private readonly sizeText: Phaser.GameObjects.Text;
  private readonly timer: Phaser.Time.TimerEvent;
  private lastFps = -1;
  private lastSize = '';

  constructor(private readonly scene: Phaser.Scene, options: DebugHudOptions) {
    const style = hudTextStyle(HUD_FONT_DEBUG_PX);

    // 左上: FPS（値が変わったときだけ更新）
    this.fpsText = scene.add.text(HUD_MARGIN, HUD_MARGIN, 'FPS --', style).setDepth(DEPTH.hud);

    // 上中央: ビルド番号とデータ版（固定文字列。1回だけ描く）。左下はスティック、右下は速力 HUD、右上は v0.2 の煙幕ボタンが使う（CLAUDE.md §3）
    this.infoText = scene.add
      .text(GAME_WIDTH / 2, HUD_MARGIN, `${options.buildLabel}  |  ${options.dataSummary}`, style)
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.hud);

    // 左上・燃料計の下: 描画解像度 -> 実表示サイズ(CSS px) @DPR。FIT が効いているか・どの端末かを見るため。?debug のときだけ出す
    // （v0.4.2: 上中央の 2 行目の長い文の頭に重なった。v0.6.2 実機 1 回目: 左上 2 段目は夜明けの時計になったので燃料計の下へ）
    this.sizeText = scene.add.text(HUD_MARGIN, SIZE_TEXT_Y, '', style).setDepth(DEPTH.hud).setVisible(DEBUG_ENABLED);

    this.timer = scene.time.addEvent({
      delay: HUD_FPS_INTERVAL_MS,
      loop: true,
      callback: this.refreshFps,
      callbackScope: this,
    });
    this.refreshFps();
    this.refreshSize();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.refreshSize, this);
  }

  private refreshFps(): void {
    const fps = Math.round(this.scene.game.loop.actualFps);
    if (fps === this.lastFps) return;
    this.lastFps = fps;
    this.fpsText.setText(`FPS ${fps}`);
  }

  private refreshSize(): void {
    const { width, height, displaySize } = this.scene.scale;
    const dpr = Math.round((window.devicePixelRatio || 1) * 100) / 100;
    const text = `${Math.round(width)}x${Math.round(height)} -> ${Math.round(displaySize.width)}x${Math.round(displaySize.height)} @${dpr}x`;
    if (text === this.lastSize) return;
    this.lastSize = text;
    this.sizeText.setText(text);
  }

  destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.refreshSize, this);
    this.timer.remove(false);
    this.fpsText.destroy();
    this.infoText.destroy();
    this.sizeText.destroy();
  }
}
