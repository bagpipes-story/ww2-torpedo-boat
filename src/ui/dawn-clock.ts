// 左上 2 段目（FPS の下）の夜明けの時計（v0.6.2 実機 1 回目「夜明けまで何秒の表示が別のメッセージが出ると見えなくなる」）: 夜明け前は「夜明けまで N 秒」、
// 夜明けの後は「夜明け後 N 秒」（敵の空襲がある任務は警告色）。文とキーは ui/dawn-lines の clockJa・clockKey。v0.6.2 実機 2 回目から夜明けの秒数はここだけ（2 行目には出さない）。
// §7: キーが変わったとき（1 秒に 1 回）だけ setText、色は変わったときだけ。上中央の 2 行目は同じ段なので mission-line がこの幅を避ける（HUD_CLOCK_MAX_W_PX）。
import Phaser from 'phaser';
import { DEPTH, HUD_MARGIN } from '../config/game-config';
import { HUD_COLOR_STRONG, HUD_FONT_CLOCK_PX } from '../config/hud-text-config';
import { HUD_DEBUG_LINE_HEIGHT, hudTextStyle } from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { clockColor, clockJa, clockKey } from './dawn-lines';

export class DawnClock {
  private readonly text: Phaser.GameObjects.Text;
  /** clockKey は夜明け前 0 以上・夜明けの後 -1 以下なので、まだ組んでいない印は NaN */
  private lastKey = NaN;
  private lastColor = HUD_COLOR_STRONG;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add.text(HUD_MARGIN, HUD_MARGIN + HUD_DEBUG_LINE_HEIGHT, '', hudTextStyle(HUD_FONT_CLOCK_PX, HUD_COLOR_STRONG)).setDepth(DEPTH.hud);
  }

  /** 毎フレーム。表示の秒が変わったときだけ組み直す */
  refresh(t: BoatTelemetry): void {
    const key = clockKey(t);
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.text.setText(clockJa(t));
    const color = clockColor(t);
    if (color !== this.lastColor) {
      this.lastColor = color;
      this.text.setColor(color);
    }
  }

  destroy(): void {
    this.text.destroy();
  }
}
