// デバッグHUD: FPS とビルド番号を画面隅に常時表示する（CLAUDE.md §3）。
// §7: 毎フレーム setText しない。FPS は一定間隔で整数化して前回値と違うときだけ、表示サイズは RESIZE イベント時だけ更新する。
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
  private lastSize = '';

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

    // 右上: 論理解像度 -> 実表示サイズ(CSS px) @DPR。FIT が効いているか・どの端末かを見るため
    this.sizeText = scene.add
      .text(width - HUD_MARGIN, HUD_MARGIN, '', TEXT_STYLE)
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
