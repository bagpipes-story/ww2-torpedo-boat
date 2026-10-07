// 速力・速力段・舵の HUD（右下）と上中央の 2〜3 行目（夜明けまで・帰投せよ／敵影と発見）。§7: setText は値が変わったときだけ。舵は静的バー＋マーカーの位置だけ動かす。
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
  HOME_MARKER_DISTANCE_STEP_M,
  RUDDER_BAR_HALF_WIDTH,
  RUDDER_MARKER_HEIGHT,
  TORPEDO_BUTTON_RADIUS,
  hudTextStyle,
} from '../config/ui-config';
import type { BoatTelemetry, SpeedStep } from '../core/boat-motion';
import { CALL_DAWN, CALL_EXPENDED, CALL_FUEL, CALL_SUNK, topCall } from '../core/mission-flow';
import { mpsToKt } from '../core/units';

const STEP_LABEL: Record<SpeedStep, string> = {
  stop: '停止',
  silent: '静音',
  cruise: '巡航',
  full: '全速',
};

/** 敵影×発見×照射×星弾の 16 状態。index = (敵影あり ? 1 : 0) | (発見された ? 2 : 0) | (照らされている ? 4 : 0) | (星弾 ? 8 : 0) */
const STATUS_BASE = ['敵影なし ・ 未発見', '敵影あり ・ 未発見', '敵影なし ・ 発見された！', '敵影あり ・ 発見された！'] as const;
const STATUS_LIT: readonly string[] = [
  ...STATUS_BASE,
  ...STATUS_BASE.map((s) => `${s} ・ 探照灯に照射中！`),
  ...STATUS_BASE.map((s) => `${s} ・ 星弾！`),
  ...STATUS_BASE.map((s) => `${s} ・ 星弾！`),
];
/** bit0 敵影, bit1 発見, bit2 探照灯, bit3 星弾, bit4 煙幕に隠れている（隠れている間は照らされないので照射の文は出ない） */
const STATUS_LABEL: readonly string[] = [
  ...STATUS_LIT,
  ...STATUS_LIT.map((_, i) => `${STATUS_BASE[i & 3]!} ・ 煙幕に隠れている`),
];
/** 撃沈後の 3 行目（見つかる距離は付けない） */
const STATUS_SUNK = 32;
/** 発見距離の表示刻み m（速力段ごとの段階値なので、変わるのは段が変わったときだけ） */
const DETECT_RANGE_STEP_M = 50;
/** 2 行目「帰投せよ」の理由（core/mission-flow のビット → 文言） */
const CALL_LABEL: Record<number, string> = {
  [CALL_FUEL]: '燃料少 ',
  [CALL_DAWN]: '夜明け近し ',
  [CALL_SUNK]: '撃沈！',
  [CALL_EXPENDED]: '魚雷なし ',
};
/** 2 行目の状態: 0 平常、1 帰投せよ、2 燃料切れ、3 輪の中で魚雷待ち */
const MISSION_NORMAL = 0;
const MISSION_CALL = 1;
const MISSION_ADRIFT = 2;
const MISSION_WAITING = 3;

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
  private lastMissionMode = -1;
  private lastCall = -1;
  private lastHomeStep = -1;
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
    // 2 行目: 夜明けまで・命中。帰投の呼びかけ・燃料切れ・魚雷の決着待ちが優先（docs/02 §6.7）。表示する値のどれかが変わったときだけ組み立てる
    const timeLeft = Math.max(0, Math.ceil(t.timeLeftS));
    const call = topCall(t.callFlags);
    const mode = t.homeWaiting ? MISSION_WAITING : t.fuelEmpty ? MISSION_ADRIFT : call !== 0 ? MISSION_CALL : MISSION_NORMAL;
    const homeStep = Math.round(t.homeDistM / HOME_MARKER_DISTANCE_STEP_M);
    if (mode !== this.lastMissionMode || call !== this.lastCall || timeLeft !== this.lastTimeLeft || t.hits !== this.lastHits || (mode === MISSION_CALL && homeStep !== this.lastHomeStep)) {
      this.lastMissionMode = mode;
      this.lastCall = call;
      this.lastTimeLeft = timeLeft;
      this.lastHits = t.hits;
      this.lastHomeStep = homeStep;
      if (mode === MISSION_WAITING) {
        this.missionText.setText('帰投 — 魚雷の決着待ち').setColor(HUD_COLOR_STRONG);
      } else if (mode === MISSION_ADRIFT) {
        this.missionText.setText(`燃料切れ — 漂流 ・ 夜明けまで ${timeLeft} 秒`).setColor(HUD_COLOR_WARN);
      } else if (mode === MISSION_CALL) {
        const warn = (call & (CALL_FUEL | CALL_DAWN)) !== 0;
        this.missionText.setText(`${CALL_LABEL[call] ?? ''}帰投せよ  ${homeStep * HOME_MARKER_DISTANCE_STEP_M} m  夜明けまで ${timeLeft} 秒`).setColor(warn ? HUD_COLOR_WARN : HUD_COLOR_STRONG);
      } else {
        this.missionText.setText(`夜明けまで ${timeLeft} 秒 ・ 命中 ${t.hits}`).setColor(HUD_COLOR_STRONG);
      }
    }
    // 3 行目: 敵影と発見。撃沈後は「駆逐艦を撃沈」に固定
    const status = t.destroyerSunk ? STATUS_SUNK : (t.enemySighted ? 1 : 0) | (t.playerDetected ? 2 : 0) | (t.illuminated ? 4 : 0) | (t.starLit ? 8 : 0) | (t.hiddenBySmoke ? 16 : 0);
    const detectStep = Math.round(t.detectRangeM / DETECT_RANGE_STEP_M);
    if (status !== this.lastStatus || detectStep !== this.lastDetectStep) {
      this.lastStatus = status;
      this.lastDetectStep = detectStep;
      if (status === STATUS_SUNK) {
        this.statusText.setText('駆逐艦を撃沈').setColor(HUD_COLOR_STRONG);
      } else {
        this.statusText
          .setText(`${STATUS_LABEL[status]!} ・ 見つかる距離 ${detectStep * DETECT_RANGE_STEP_M} m`)
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
    this.missionText.destroy();
    this.statusText.destroy();
  }
}
