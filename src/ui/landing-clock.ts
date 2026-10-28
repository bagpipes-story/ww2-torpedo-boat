// 右上 2 段目の揚陸の時計（v0.6.9 S6a。jp_04「多号作戦・オルモック湾へ」。spec-v069 §5.3・L5）: 揚陸中「揚陸 あと N 秒」、揚陸完了、揚陸の前に沈んだ「輸送船 沈没」、完了の後に沈んだ「揚陸完了（沈没）」。
// 左上の夜明けの時計（ui/dawn-clock）と同じ段・同じ文字で右寄せ（W − HUD_MARGIN）。T-38 は煙幕発生器が無いので右端の縦一列の煙幕の段は空いている（Boot の V12 が smoke_generator false を確かめる。
// tests/hud-layout が時計の箱と jp_04 のボタンの当たりの重なりを確かめる）。上中央の 2 行目は左右対称に時計の幅を避ける（lineFitScale）ので、2 行目の置き方は変わらない。
// 揚陸の任務だけ ui/boat-hud が作る。§7: キーが変わったとき（1 秒に 1 回）だけ setText、色は変わったときだけ。文とキーは ui/landing-lines。
import Phaser from 'phaser';
import { DEPTH, GAME_WIDTH, HUD_MARGIN } from '../config/game-config';
import { HUD_COLOR_STRONG, HUD_FONT_CLOCK_PX } from '../config/hud-text-config';
import { HUD_DEBUG_LINE_HEIGHT, hudTextStyle } from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { landingClockKey, landingClockLine } from './landing-lines';

export class LandingClock {
  private readonly text: Phaser.GameObjects.Text;
  private lastKey = -1;
  private lastColor = HUD_COLOR_STRONG;

  constructor(scene: Phaser.Scene) {
    this.text = scene.add
      .text(GAME_WIDTH - HUD_MARGIN, HUD_MARGIN + HUD_DEBUG_LINE_HEIGHT, '', hudTextStyle(HUD_FONT_CLOCK_PX, HUD_COLOR_STRONG))
      .setOrigin(1, 0)
      .setDepth(DEPTH.hud);
  }

  /** 毎フレーム。表示の秒・段階が変わったときだけ組み直す */
  refresh(t: BoatTelemetry): void {
    const key = landingClockKey(t.landing);
    if (key === this.lastKey) return;
    this.lastKey = key;
    const l = landingClockLine(t.landing);
    this.text.setText(l.text);
    if (l.color !== this.lastColor) {
      this.lastColor = l.color;
      this.text.setColor(l.color);
    }
  }

  destroy(): void {
    this.text.destroy();
  }
}
