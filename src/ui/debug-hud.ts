// デバッグHUD: FPS とビルド番号を画面隅に常時表示する（CLAUDE.md §3）。
// §7: 毎フレーム setText しない。一定間隔で整数FPSを取り、前回値と違うときだけ更新する。
import Phaser from 'phaser';
import { HUD_DEPTH, HUD_FPS_INTERVAL_MS, HUD_MARGIN } from '../config/game-config';

export interface DebugHudOptions {
  buildLabel: string;
  dataSummary: string;
}

const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: 'Menlo, Consolas, monospace',
  fontSize: '20px',
  color: '#9fb3c8',
};

export class DebugHud {
  private readonly fpsText: Phaser.GameObjects.Text;
  private readonly infoText: Phaser.GameObjects.Text;
  private readonly sizeText: Phaser.GameObjects.Text;
  private readonly timer: Phaser.Time.TimerEvent;
  private lastFps = -1;

  constructor(private readonly scene: Phaser.Scene, options: DebugHudOptions) {
    const { width, height } = scene.scale;

    // 左上: FPS（値が変わったときだけ更新）
    this.fpsText = scene.add
      .text(HUD_MARGIN, HUD_MARGIN, 'FPS --', TEXT_STYLE)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);

    // 左下: ビルド番号とデータ版（固定文字列。1回だけ描く）
    this.infoText = scene.add
      .text(HUD_MARGIN, height - HUD_MARGIN, `${options.buildLabel}\n${options.dataSummary}`, TEXT_STYLE)
      .setOrigin(0, 1)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);

    // 右上: 画面サイズの確認用（FIT で 1280x720 になっているか）
    this.sizeText = scene.add
      .text(width - HUD_MARGIN, HUD_MARGIN, `${width}x${height}`, TEXT_STYLE)
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(HUD_DEPTH);

    this.timer = scene.time.addEvent({
      delay: HUD_FPS_INTERVAL_MS,
      loop: true,
      callback: this.refreshFps,
      callbackScope: this,
    });
    this.refreshFps();
  }

  private refreshFps(): void {
    const fps = Math.round(this.scene.game.loop.actualFps);
    if (fps === this.lastFps) return;
    this.lastFps = fps;
    this.fpsText.setText(`FPS ${fps}`);
  }

  destroy(): void {
    this.timer.remove(false);
    this.fpsText.destroy();
    this.infoText.destroy();
    this.sizeText.destroy();
  }
}
