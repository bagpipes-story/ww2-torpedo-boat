// 夜明けの帯（v0.6.1。spec §8.3）: HUD 中央に「夜明け — 空襲」／「夜明け」と 2 行までの説明を DAWN_BANNER_MS だけ出す。夜明けのラッチで 1 回だけ。
// §7: Text 3 つは HUD の create で 1 回だけ作る。文を組むのは出す瞬間の 1 回（ui/dawn-lines の dawnBannerLines）。毎フレームは濃さ（alpha）だけで、tween は使わない。
import Phaser from 'phaser';
import { DAWN_BANNER_FADE_MS, DAWN_BANNER_LINE_GAP, DAWN_BANNER_MS, DAWN_BANNER_OFFSET_Y } from '../config/dawn-config';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../config/game-config';
import { HUD_COLOR_STRONG, HUD_COLOR_WARN, HUD_FONT_MISSION_PX, HUD_FONT_SPEED_PX, hudTextStyle } from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { DAWN_AIR_ENEMY } from '../core/dawn-air';
import { dawnBannerLines } from './dawn-lines';

export class DawnBanner {
  /** 見出しと説明 2 行 */
  private readonly texts: Phaser.GameObjects.Text[] = [];
  /** 出した（夜明けに 1 回だけ。HUD を作った時点で夜明けの後なら出さない） */
  private shown: boolean;
  /** 消える時刻 ms（0 は出していない） */
  private untilMs = 0;
  private lastAlpha = -1;

  constructor(scene: Phaser.Scene, alreadyReached: boolean) {
    this.shown = alreadyReached;
    let y = GAME_HEIGHT / 2 + DAWN_BANNER_OFFSET_Y;
    for (let i = 0; i < 3; i++) {
      const px = i === 0 ? HUD_FONT_SPEED_PX : HUD_FONT_MISSION_PX;
      this.texts.push(scene.add.text(GAME_WIDTH / 2, y, '', hudTextStyle(px, HUD_COLOR_STRONG)).setOrigin(0.5, 0).setDepth(DEPTH.hud).setVisible(false));
      y += px + DAWN_BANNER_LINE_GAP;
    }
  }

  /** 毎フレーム: 夜明けに達した最初のフレームで出し、濃さを進める */
  refresh(t: BoatTelemetry, nowMs: number): void {
    if (!this.shown && t.dawn.reached) {
      this.shown = true;
      this.show(dawnBannerLines(t), t.dawn.air === DAWN_AIR_ENEMY && t.dawn.strikeEnabled, nowMs);
    }
    this.update(nowMs);
  }

  /** lines は [見出し, 説明…]（3 行まで）。warn なら見出しを警告色に */
  show(lines: readonly string[], warn: boolean, nowMs: number): void {
    for (let i = 0; i < this.texts.length; i++) {
      const tx = this.texts[i]!;
      tx.setText(lines[i] ?? '').setVisible(i < lines.length).setAlpha(1);
      if (i === 0) tx.setColor(warn ? HUD_COLOR_WARN : HUD_COLOR_STRONG);
    }
    this.untilMs = nowMs + DAWN_BANNER_MS;
    this.lastAlpha = 1;
  }

  /** 終わりの DAWN_BANNER_FADE_MS で薄くし、時間が来たら隠す（濃さが変わったときだけ setAlpha） */
  update(nowMs: number): void {
    if (this.untilMs === 0) return;
    const left = this.untilMs - nowMs;
    if (left <= 0) {
      for (const tx of this.texts) tx.setVisible(false);
      this.untilMs = 0;
      return;
    }
    const a = left >= DAWN_BANNER_FADE_MS ? 1 : left / DAWN_BANNER_FADE_MS;
    if (a === this.lastAlpha) return;
    this.lastAlpha = a;
    for (const tx of this.texts) tx.setAlpha(a);
  }

  destroy(): void {
    for (const tx of this.texts) tx.destroy();
    this.texts.length = 0;
  }
}
