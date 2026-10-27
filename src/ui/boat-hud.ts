// 速力・速力段・舵の HUD（右下）と上中央の 3 行目（敵影と発見（雨））。§7: setText は値が変わったときだけ。舵は静的バー＋マーカーの位置だけ動かす。
// 2 行目は ui/mission-line.ts（v0.4.2 で切り出し）、文と表は ui/hud-lines.ts（v0.4.1 で切り出し）。左上 2 段目の夜明けの時計は ui/dawn-clock.ts（v0.6.2 実機 1 回目）。
import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, HUD_MARGIN, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  HUD_COLOR,
  HUD_COLOR_STRONG,
  HUD_COLOR_WARN,
  HUD_FONT_HEADING_PX,
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
  SPEED_HUD_RIGHT_X,
  hudTextStyle,
} from '../config/ui-config';
import type { BoatTelemetry, SpeedStep } from '../core/boat-motion';
import { DETECT_RANGE_STEP_M, STATUS_GONE, STATUS_LABEL, STATUS_SUNK, STEP_LABEL } from './hud-lines';
import { shipsGoneStatusJa } from './dawn-lines';
import { DawnClock } from './dawn-clock';
import { MissionLine } from './mission-line';
import { patrolStatusLine, patrolStatusOf } from './patrol-lines';
import { STORM_INSIDE } from '../core/storm';
import { SHALLOW_INSIDE } from '../core/shallows';
import { SHALLOW_SPEED_WARN_MARGIN_KT } from '../config/hunt-config';
import { mpsToKt } from '../core/units';


export class BoatHud {
  private readonly speedText: Phaser.GameObjects.Text;
  private readonly stepText: Phaser.GameObjects.Text;
  private readonly headingText: Phaser.GameObjects.Text;
  private readonly rudderBar: Phaser.GameObjects.Image;
  private readonly rudderMarker: Phaser.GameObjects.Image;
  /** 上中央 2 行目（ui/mission-line.ts。v0.4.2 で切り出し） */
  private readonly missionLine: MissionLine;
  /** 左上 2 段目の夜明けの時計（v0.6.2 実機 1 回目） */
  private readonly clock: DawnClock;
  private readonly statusText: Phaser.GameObjects.Text;
  private readonly barCenterX: number;
  private lastStatus = -1;
  private lastDetectStep = -1;
  private lastSpeedWarn = false;
  private lastRain = false;
  private lastSpeedKt = -1;
  private lastStep: SpeedStep | '' = '';
  private lastHeading = -1;
  private lastRudderX = NaN;

  constructor(scene: Phaser.Scene) {
    // 右側の 2 列の兵装・技能のパネル（v0.6.8。config/hud-layout-config）の左に置く（右端 W − 312。v0.6.7 までは右下の魚雷ボタンの左 W − 176）
    const right = SPEED_HUD_RIGHT_X;
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

    this.missionLine = new MissionLine(scene);
    this.clock = new DawnClock(scene);
    // 上中央 3 行目: 敵影と発見状態（docs/02 §6.5）
    this.statusText = scene.add
      .text(GAME_WIDTH / 2, HUD_MARGIN + HUD_STATUS_OFFSET_Y, '', hudTextStyle(HUD_FONT_STATUS_PX))
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.hud);
  }

  /** 毎フレーム呼ぶ。表示値が変わったときだけ setText / setX する。nowMs は scene.time.now（2 行目の出来事の表示時間） */
  refresh(t: BoatTelemetry, nowMs: number): void {
    const kt = Math.round(mpsToKt(t.speedMps));
    if (kt !== this.lastSpeedKt) {
      this.lastSpeedKt = kt;
      this.speedText.setText(`${kt} kt`);
    }
    // 暴風の帯の中で安全速力を超えている間（v0.3.4）と、浅瀬の中で安全速力の 1 kt 手前から（v0.4.2。座礁の前に気づけるように）は速力の数字を赤に
    const speedWarn = (t.stormState === STORM_INSIDE && t.stormFast) || (t.shallowState === SHALLOW_INSIDE && kt >= t.shallowSafeKt - SHALLOW_SPEED_WARN_MARGIN_KT);
    if (speedWarn !== this.lastSpeedWarn) {
      this.lastSpeedWarn = speedWarn;
      this.speedText.setColor(speedWarn ? HUD_COLOR_WARN : HUD_COLOR_STRONG);
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
    this.missionLine.refresh(t, nowMs);
    this.clock.refresh(t);
    // 3 行目: 敵影と発見。撃沈後は「駆逐艦を撃沈」、夜明けに退いて狙う艦がいなくなった後（v0.6.2）は「東京急行は北へ去った ・ 狙う艦なし」に固定
    // 夜の哨戒機の任務（v0.6.7。jp_02）は空からの見え方（40 番台。ui/patrol-lines。夜明けの後は空襲の行、空襲の無い OFF は今の行）
    const pst = patrolStatusOf(t.patrol, t.targetStep, t.dawn.reached && t.dawn.strikeEnabled);
    const status = pst >= 0 ? pst : t.destroyerSunk ? STATUS_SUNK : t.dawn.shipsGone ? STATUS_GONE : (t.enemySighted ? 1 : 0) | (t.playerDetected ? 2 : 0) | (t.illuminated ? 4 : 0) | (t.starLit ? 8 : 0) | (t.hiddenBySmoke ? 16 : 0);
    const detectStep = Math.round(t.detectRangeM / DETECT_RANGE_STEP_M);
    // 雨: 艦と艇を結ぶ線が暴風の帯にかかっている（発見距離・視程が下がる。v0.3.4）
    const rain = t.stormLos && !t.destroyerSunk;
    if (status !== this.lastStatus || detectStep !== this.lastDetectStep || rain !== this.lastRain) {
      this.lastStatus = status;
      this.lastDetectStep = detectStep;
      this.lastRain = rain;
      if (pst >= 0) {
        const l = patrolStatusLine(t.patrol, pst);
        this.statusText.setText(l.text).setColor(l.warn ? HUD_COLOR_WARN : HUD_COLOR);
      } else if (status === STATUS_SUNK) {
        this.statusText.setText('駆逐艦を撃沈').setColor(HUD_COLOR_STRONG);
      } else if (status === STATUS_GONE) {
        this.statusText.setText(shipsGoneStatusJa(t.dawn)).setColor(HUD_COLOR_STRONG);
      } else {
        this.statusText
          .setText(`${STATUS_LABEL[status]!} ・ 見つかる距離 ${detectStep * DETECT_RANGE_STEP_M} m${rain ? '（雨）' : ''}`)
          .setColor(t.playerDetected ? HUD_COLOR_WARN : HUD_COLOR);
      }
    }
  }

  destroy(): void {
    this.speedText.destroy();
    this.stepText.destroy();
    this.headingText.destroy();
    this.rudderBar.destroy();
    this.rudderMarker.destroy();
    this.missionLine.destroy();
    this.clock.destroy();
    this.statusText.destroy();
  }
}
