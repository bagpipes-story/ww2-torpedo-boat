// 夜明けの帯（v0.6.1。spec §8.3）: HUD 中央に「夜明け — 空襲」／「夜明け」と 2 行までの説明を DAWN_BANNER_MS だけ出す。夜明けのラッチで 1 回だけ。
// 高さは上の縁の印（帰投・敵機の矢印と距離）の帯より下（DAWN_BANNER_OFFSET_Y。帯の文字が矢印に重ならない）。
// §7: Text 3 つは HUD の create で 1 回だけ作る。文を組むのは出す瞬間の 1 回（ui/dawn-lines の dawnBannerLines）。毎フレームは濃さ（alpha）だけで、tween は使わない。
// v0.6.11 S5（jp_03。spec-v0611-r2 §10.1「中央の帯 2 秒」）: 空襲下の退避の予告（波の予告と、もう一度来る編隊の予告し直し）も同じ帯に EVAC_BANNER_MS（ui/evac-lines の evacBannerLines。
// 予告の通し番号 t.evac.annSeq が変わったとき）。240 秒の帯は dawnBannerLines が「第1次の空襲が去った」にする。evac の無い任務は今のまま。
import Phaser from 'phaser';
import { DAWN_BANNER_FADE_MS, DAWN_BANNER_LINE_GAP, DAWN_BANNER_MS, DAWN_BANNER_OFFSET_Y } from '../config/dawn-config';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH } from '../config/game-config';
import { HUD_COLOR_STRONG, HUD_COLOR_WARN, HUD_FONT_MISSION_PX, HUD_FONT_SPEED_PX, hudTextStyle } from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { DAWN_AIR_ENEMY } from '../core/dawn-air';
import { EVAC_BANNER_MS } from '../config/evac-config';
import { dawnBannerLines } from './dawn-lines';
import { evacBannerLines } from './evac-lines';

export class DawnBanner {
  /** 見出しと説明 2 行 */
  private readonly texts: Phaser.GameObjects.Text[] = [];
  /** 出した（夜明けに 1 回だけ。HUD を作った時点で夜明けの後なら出さない） */
  private shown: boolean;
  /** 消える時刻 ms（0 は出していない） */
  private untilMs = 0;
  private lastAlpha = -1;
  /** 見た空襲下の退避の予告の通し番号（v0.6.11 S5。HUD を作った時点の予告は出さない） */
  private seenAnn: number;

  constructor(scene: Phaser.Scene, alreadyReached: boolean, annSeq = 0) {
    this.shown = alreadyReached;
    this.seenAnn = annSeq;
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
    } else if (t.evac.enabled && t.evac.annSeq !== this.seenAnn) {
      this.seenAnn = t.evac.annSeq;
      if (t.evac.annKind !== 0) this.show(evacBannerLines(t.evac), true, nowMs, EVAC_BANNER_MS);
    }
    this.update(nowMs);
  }

  /** lines は [見出し, 説明…]（3 行まで）。warn なら見出しを警告色に。ms は出す長さ（既定は夜明けの帯の DAWN_BANNER_MS） */
  show(lines: readonly string[], warn: boolean, nowMs: number, ms: number = DAWN_BANNER_MS): void {
    for (let i = 0; i < this.texts.length; i++) {
      const tx = this.texts[i]!;
      tx.setText(lines[i] ?? '').setVisible(i < lines.length).setAlpha(1);
      if (i === 0) tx.setColor(warn ? HUD_COLOR_WARN : HUD_COLOR_STRONG);
    }
    this.untilMs = nowMs + ms;
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
