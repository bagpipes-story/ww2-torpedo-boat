// 速力・速力段・舵の HUD（右下）。§7: setText は値が変わったときだけ。舵は静的バー＋マーカーの位置だけ動かす。
import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, HUD_MARGIN, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  HUD_COLOR,
  HUD_COLOR_STRONG,
  HUD_COLOR_WARN,
  HUD_DEBUG_LINE_HEIGHT,
  HUD_FONT_HEADING_PX,
  HUD_FONT_MISSION_PX,
  HUD_FONT_SPEED_PX,
  HUD_FONT_STATUS_PX,
  HUD_FONT_STEP_PX,
  HUD_HEADING_OFFSET_Y,
  HUD_STATUS_OFFSET_Y,
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

/** 敵影×発見×照射×星弾の 16 状態。index = (敵影あり ? 1 : 0) | (発見された ? 2 : 0) | (照らされている ? 4 : 0) | (星弾 ? 8 : 0) */
const STATUS_BASE = ['敵影なし ・ 未発見', '敵影あり ・ 未発見', '敵影なし ・ 発見された！', '敵影あり ・ 発見された！'] as const;
const STATUS_LABEL: readonly string[] = [
  ...STATUS_BASE,
  ...STATUS_BASE.map((s) => `${s} ・ 探照灯に照射中！`),
  ...STATUS_BASE.map((s) => `${s} ・ 星弾！`),
  ...STATUS_BASE.map((s) => `${s} ・ 星弾！`),
];
/** 発見距離の表示刻み m（速力段ごとの段階値なので、変わるのは段が変わったときだけ） */
const DETECT_RANGE_STEP_M = 50;

export class BoatHud {
  private readonly speedText: Phaser.GameObjects.Text;
  private readonly stepText: Phaser.GameObjects.Text;
  private readonly headingText: Phaser.GameObjects.Text;
  private readonly rudderBar: Phaser.GameObjects.Image;
  private readonly rudderMarker: Phaser.GameObjects.Image;
  private readonly missionText: Phaser.GameObjects.Text;
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly barCenterX: number;
  private lastStatus = -1;
  private lastDetectStep = -1;
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
    // 上中央 3 行目: 敵影と発見状態（docs/02 §6.5）
    this.statusText = scene.add
      .text(GAME_WIDTH / 2, HUD_MARGIN + HUD_STATUS_OFFSET_Y, '', hudTextStyle(HUD_FONT_STATUS_PX))
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
    const status = (t.enemySighted ? 1 : 0) | (t.playerDetected ? 2 : 0) | (t.illuminated ? 4 : 0) | (t.starLit ? 8 : 0);
    const detectStep = Math.round(t.detectRangeM / DETECT_RANGE_STEP_M);
    if (status !== this.lastStatus || detectStep !== this.lastDetectStep) {
      this.lastStatus = status;
      this.lastDetectStep = detectStep;
      this.statusText
        .setText(`${STATUS_LABEL[status]!} ・ 見つかる距離 ${detectStep * DETECT_RANGE_STEP_M} m`)
        .setColor(t.playerDetected ? HUD_COLOR_WARN : HUD_COLOR);
    }
  }

  destroy(): void {
    this.speedText.destroy();
    this.stepText.destroy();
    this.headingText.destroy();
    this.rudderBar.destroy();
    this.rudderMarker.destroy();
    this.missionText.destroy();
    this.statusText.destroy();
  }
}
