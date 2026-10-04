// デバッグHUD: FPS とビルド番号を画面に常時表示する（CLAUDE.md §3）。
// §7: 毎フレーム setText しない。FPS は一定間隔で整数化して前回値と違うときだけ、表示サイズは RESIZE イベント時だけ更新する。
import Phaser from 'phaser';
import { GAME_WIDTH, HUD_DEPTH, HUD_FPS_INTERVAL_MS, HUD_MARGIN } from '../config/game-config';
import { hudTextStyle } from '../config/ui-config';

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
    const style = hudTextStyle(18);

    // 左上: FPS（値が変わったときだけ更新）
    this.fpsText = scene.add.text(HUD_MARGIN, HUD_MARGIN, 'FPS --', style).setDepth(HUD_DEPTH);

    // 上中央: ビルド番号とデータ版（固定文字列。1回だけ描く）。左下はスティック、右下は速力 HUD が使う
    this.infoText = scene.add
      .text(GAME_WIDTH / 2, HUD_MARGIN, `${options.buildLabel}  |  ${options.dataSummary}`, style)
      .setOrigin(0.5, 0)
      .setDepth(HUD_DEPTH);

    // 左上2行目: 描画解像度 -> 実表示サイズ(CSS px) @DPR。FIT が効いているか・どの端末かを見るため（上中央のビルド番号と重ならない位置）
    this.sizeText = scene.add.text(HUD_MARGIN, HUD_MARGIN + 26, '', style).setDepth(HUD_DEPTH);

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
    const text = `${width}x${height} -> ${Math.round(displaySize.width)}x${Math.round(displaySize.height)} @${dpr}x`;
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
