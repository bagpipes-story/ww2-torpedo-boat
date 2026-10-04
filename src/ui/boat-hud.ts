// 速力・速力段・舵の HUD（右下）。§7: setText は値が変わったときだけ。舵は静的バー＋マーカーの位置だけ動かす。
import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, HUD_MARGIN, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  HUD_COLOR_STRONG,
  HUD_DEBUG_LINE_HEIGHT,
  HUD_FONT_HEADING_PX,
  HUD_FONT_MISSION_PX,
  HUD_FONT_SPEED_PX,
  HUD_FONT_STEP_PX,
  HUD_HEADING_OFFSET_Y,
  HUD_STEP_BASELINE_NUDGE,
  HUD_STEP_OFFSET_X,
  HUD_TEXT_GAP,
  RUDDER_BAR_HALF_WIDTH,
  RUDDER_MARKER_HEIGHT,
  TORPEDO_BUTTON_RADIUS,
  hudTextStyle,
} from '../config/ui-config';
import type { BoatTelemetry, SpeedStep } from '../core/boat-motion';
import { mpsToKt } from '../core/units';

const STEP_LABEL: Record<SpeedStep, string> = {
  stop: '停止',
  silent: '静音',
  cruise: '巡航',
  full: '全速',
};

export class BoatHud {
  private readonly speedText: Phaser.GameObjects.Text;
  private readonly stepText: Phaser.GameObjects.Text;
  private readonly headingText: Phaser.GameObjects.Text;
  private readonly rudderBar: Phaser.GameObjects.Image;
  private readonly rudderMarker: Phaser.GameObjects.Image;
  private readonly missionText: Phaser.GameObjects.Text;
  private readonly barCenterX: number;
  private lastTimeLeft = -1;
  private lastHits = -1;
  private lastSpeedKt = -1;
  private lastStep: SpeedStep | '' = '';
  private lastHeading = -1;
  private lastRudderX = NaN;

  constructor(scene: Phaser.Scene) {
    // 右下の角は魚雷ボタンが使うので、その左に置く
    const right = GAME_WIDTH - HUD_MARGIN - TORPEDO_BUTTON_RADIUS * 2 - HUD_MARGIN;
    const bottom = GAME_HEIGHT - HUD_MARGIN;

    this.rudderBar = scene.add
      .image(right - RUDDER_BAR_HALF_WIDTH, bottom - RUDDER_MARKER_HEIGHT / 2, TEXTURE_KEYS.rudderBar)
      .setScale(1 / RENDER_SCALE)
      .setDepth(DEPTH.hud);
    this.barCenterX = this.rudderBar.x;
    this.rudderMarker = scene.add
      .image(this.barCenterX, this.rudderBar.y, TEXTURE_KEYS.rudderMarker)
      .setScale(1 / RENDER_SCALE)
      .setDepth(DEPTH.hud + 1);

    const textBottom = this.rudderBar.y - RUDDER_MARKER_HEIGHT / 2 - HUD_TEXT_GAP;
    this.speedText = scene.add
      .text(right, textBottom, '', hudTextStyle(HUD_FONT_SPEED_PX, HUD_COLOR_STRONG))
      .setOrigin(1, 1)
      .setDepth(DEPTH.hud);
    this.stepText = scene.add
      .text(right - HUD_STEP_OFFSET_X, textBottom - HUD_STEP_BASELINE_NUDGE, '', hudTextStyle(HUD_FONT_STEP_PX))
      .setOrigin(1, 1)
      .setDepth(DEPTH.hud);
    this.headingText = scene.add
      .text(right, textBottom - HUD_HEADING_OFFSET_Y, '', hudTextStyle(HUD_FONT_HEADING_PX))
      .setOrigin(1, 1)
      .setDepth(DEPTH.hud);

    // 上中央 2 行目: 残り時間と命中
    this.missionText = scene.add
      .text(GAME_WIDTH / 2, HUD_MARGIN + HUD_DEBUG_LINE_HEIGHT, '', hudTextStyle(HUD_FONT_MISSION_PX, HUD_COLOR_STRONG))
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.hud);
  }

  /** 毎フレーム呼ぶ。表示値が変わったときだけ setText / setX する */
  refresh(t: BoatTelemetry): void {
    const kt = Math.round(mpsToKt(t.speedMps));
    if (kt !== this.lastSpeedKt) {
      this.lastSpeedKt = kt;
      this.speedText.setText(`${kt} kt`);
    }
    if (t.targetStep !== this.lastStep) {
      this.lastStep = t.targetStep;
      this.stepText.setText(STEP_LABEL[t.targetStep]);
    }
    const hdg = Math.round(t.headingDeg) % 360;
    if (hdg !== this.lastHeading) {
      this.lastHeading = hdg;
      this.headingText.setText(`針路 ${String(hdg).padStart(3, '0')}°`);
    }
    const x = this.barCenterX + t.rudder * RUDDER_BAR_HALF_WIDTH;
    if (x !== this.lastRudderX) {
      this.lastRudderX = x;
      this.rudderMarker.setX(x);
    }
    const timeLeft = Math.max(0, Math.ceil(t.timeLeftS));
    if (timeLeft !== this.lastTimeLeft || t.hits !== this.lastHits) {
      this.lastTimeLeft = timeLeft;
      this.lastHits = t.hits;
      this.missionText.setText(`残り ${timeLeft} 秒   命中 ${t.hits}`);
    }
  }

  destroy(): void {
    this.speedText.destroy();
    this.stepText.destroy();
    this.headingText.destroy();
    this.rudderBar.destroy();
    this.rudderMarker.destroy();
    this.missionText.destroy();
  }
}
