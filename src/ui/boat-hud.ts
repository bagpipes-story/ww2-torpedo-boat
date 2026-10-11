// 速力・速力段・舵の HUD（右下）と上中央の 2〜3 行目（夜明けまで・帰投せよ・味方機・暴風／敵影と発見（雨））。§7: setText は値が変わったときだけ。舵は静的バー＋マーカーの位置だけ動かす。
import Phaser from 'phaser';
import { DEPTH, GAME_HEIGHT, GAME_WIDTH, HUD_MARGIN, RENDER_SCALE, TEXTURE_KEYS } from '../config/game-config';
import {
  HUD_COLOR,
  HUD_COLOR_STRONG,
  HUD_COLOR_WARN,
  HOME_COLOR_TEXT,
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
  SHALLOW_WARN_STEP_M,
  STORM_AHEAD_STEP_M,
  STORM_WARN_STEP_M,
  RUDDER_MARKER_HEIGHT,
  TORPEDO_BUTTON_RADIUS,
  hudTextStyle,
} from '../config/ui-config';
import type { BoatTelemetry, SpeedStep } from '../core/boat-motion';
import { FF_CHALLENGE, FF_LEAVING, FF_OUT_GAVE_UP, FF_OUT_IDENTIFIED, FF_STRAFE } from '../core/friendly';
import { CALL_DAWN, CALL_EXPENDED, CALL_FUEL, CALL_SUNK, topCall } from '../core/mission-flow';
import { SHALLOW_APPROACHING, SHALLOW_GROUNDED, SHALLOW_INSIDE } from '../core/shallows';
import { STORM_AHEAD, STORM_INSIDE, STORM_NEAR } from '../core/storm';
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
/** 2 行目の状態: 0 平常、1 帰投せよ、2 燃料切れ、3 輪の中で魚雷待ち、4 浅瀬（接近・中・座礁）、5 味方機（識別要求・航過）、6 味方機の結果（去る間） */
const MISSION_NORMAL = 0;
const MISSION_CALL = 1;
const MISSION_ADRIFT = 2;
const MISSION_WAITING = 3;
const MISSION_SHALLOWS = 4;
const MISSION_FRIENDLY = 5;
const MISSION_FRIENDLY_RESULT = 6;
/** 7 暴風の警告（近い・中で速すぎる）、8 暴風の情報（近い・中で安全速力以下） */
const MISSION_STORM_WARN = 7;
const MISSION_STORM = 8;

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
  private lastShallowState = -1;
  private lastShallowStep = -1;
  private lastFriendlyPhase = -1;
  private lastFriendlyLeft = -1;
  private lastFriendlyPasses = -1;
  private lastFriendlyOutcome = -1;
  private lastFriendlyPending = false;
  private lastStormState = -1;
  private lastStormFast = false;
  private lastStormNorth = true;
  private lastStormStep = -1;
  private lastSpeedWarn = false;
  private lastRain = false;
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
    // 暴風の帯の中で安全速力を超えている間は速力の数字を赤に（v0.3.4）
    const speedWarn = t.stormState === STORM_INSIDE && t.stormFast;
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
    // 2 行目: 夜明けまで・命中。優先順: 魚雷待ち > 燃料切れ > 味方機（要求・航過）> 浅瀬 > 暴風の警告 > 味方機の結果 > 暴風の情報 > 帰投せよ > 平常（docs/02 §6.7・§6.8）。表示する値のどれかが変わったときだけ組み立てる
    const timeLeft = Math.max(0, Math.ceil(t.timeLeftS));
    const call = topCall(t.callFlags);
    const ffLive = t.friendlyPhase === FF_CHALLENGE || t.friendlyPhase === FF_STRAFE;
    const ffResult = t.friendlyPhase === FF_LEAVING && (t.friendlyOutcome === FF_OUT_IDENTIFIED || t.friendlyOutcome === FF_OUT_GAVE_UP);
    const stormClose = t.stormState === STORM_NEAR || t.stormState === STORM_INSIDE;
    const stormWarn = stormClose && t.stormFast;
    const stormInfo = stormClose && !t.stormFast;
    const mode = t.homeWaiting
      ? MISSION_WAITING
      : t.fuelEmpty
        ? MISSION_ADRIFT
        : ffLive
          ? MISSION_FRIENDLY
          : t.shallowState !== 0
            ? MISSION_SHALLOWS
            : stormWarn
              ? MISSION_STORM_WARN
              : ffResult
                ? MISSION_FRIENDLY_RESULT
                : stormInfo
                  ? MISSION_STORM
                  : call !== 0
                    ? MISSION_CALL
                    : MISSION_NORMAL;
    // 暴風の距離の刻み: 近いときは 50 m、予報は 100 m（それ以外は 0）
    const stormStep = t.stormState === STORM_NEAR ? Math.ceil(t.stormGapM / STORM_WARN_STEP_M) : t.stormState === STORM_AHEAD ? Math.ceil(t.stormGapM / STORM_AHEAD_STEP_M) : 0;
    const shallowStep = Math.ceil(t.shallowAheadM / SHALLOW_WARN_STEP_M);
    // 識別の残り秒は 5,4,3,2,1（0 は出さない）
    const ffLeft = t.friendlyPhase === FF_CHALLENGE ? Math.max(1, Math.ceil(t.friendlyLeftS)) : 0;
    // 距離は輪の縁まで（目盛り・呼びかけ・Result と同じ基準）。切り上げなので輪の外では 0 にならない
    const homeStep = Math.ceil(t.homeEdgeM / HOME_MARKER_DISTANCE_STEP_M);
    if (
      mode !== this.lastMissionMode ||
      call !== this.lastCall ||
      timeLeft !== this.lastTimeLeft ||
      t.hits !== this.lastHits ||
      (mode === MISSION_CALL && homeStep !== this.lastHomeStep) ||
      ((mode === MISSION_SHALLOWS || mode === MISSION_FRIENDLY) && (t.shallowState !== this.lastShallowState || shallowStep !== this.lastShallowStep)) ||
      (mode === MISSION_FRIENDLY &&
        (t.friendlyPhase !== this.lastFriendlyPhase || ffLeft !== this.lastFriendlyLeft || t.friendlyPasses !== this.lastFriendlyPasses || t.friendlyPending !== this.lastFriendlyPending)) ||
      (mode === MISSION_FRIENDLY_RESULT && (t.friendlyOutcome !== this.lastFriendlyOutcome || t.friendlyPasses !== this.lastFriendlyPasses)) ||
      ((mode === MISSION_STORM_WARN || mode === MISSION_STORM || mode === MISSION_NORMAL || mode === MISSION_FRIENDLY) &&
        (t.stormState !== this.lastStormState || t.stormFast !== this.lastStormFast || t.stormNorth !== this.lastStormNorth || stormStep !== this.lastStormStep))
    ) {
      this.lastMissionMode = mode;
      this.lastCall = call;
      this.lastTimeLeft = timeLeft;
      this.lastHits = t.hits;
      this.lastHomeStep = homeStep;
      this.lastShallowState = t.shallowState;
      this.lastShallowStep = shallowStep;
      this.lastFriendlyPhase = t.friendlyPhase;
      this.lastFriendlyLeft = ffLeft;
      this.lastFriendlyPasses = t.friendlyPasses;
      this.lastFriendlyOutcome = t.friendlyOutcome;
      this.lastFriendlyPending = t.friendlyPending;
      this.lastStormState = t.stormState;
      this.lastStormFast = t.stormFast;
      this.lastStormNorth = t.stormNorth;
      this.lastStormStep = stormStep;
      if (mode === MISSION_FRIENDLY) {
        // 識別を求めている / 航過中（真上を過ぎてから押した後は「識別完了」）。浅瀬の警告・中と重なれば後ろに付ける
        let text: string;
        let color = HUD_COLOR_WARN;
        if (t.friendlyPhase === FF_STRAFE && t.friendlyPending) {
          text = '識別完了 ・ 味方機が離れる';
          color = HOME_COLOR_TEXT;
        } else if (t.friendlyPhase === FF_STRAFE) text = '味方機の誤射！ ・ 識別せよ';
        else if (t.friendlyPasses > 0) text = `味方機 再接近 ・ 識別せよ ${ffLeft}`;
        else text = `味方機接近 ・ 識別せよ ${ffLeft}`;
        if (t.shallowState === SHALLOW_APPROACHING) text += ` ・ 浅瀬 ${shallowStep * SHALLOW_WARN_STEP_M} m 減速`;
        else if (t.shallowState === SHALLOW_INSIDE) text += ` ・ 浅瀬 ${t.shallowSafeKt} kt 以下`;
        else if (stormWarn) text += ` ・ 暴風 ${t.stormSafeKt} kt 以下`;
        this.missionText.setText(text).setColor(color);
      } else if (mode === MISSION_FRIENDLY_RESULT) {
        if (t.friendlyOutcome === FF_OUT_IDENTIFIED) this.missionText.setText('識別完了 ・ 味方機が離れる').setColor(HOME_COLOR_TEXT);
        else this.missionText.setText(`味方機が離れた ・ 誤射 ${t.friendlyPasses} 回`).setColor(HUD_COLOR_STRONG);
      } else if (mode === MISSION_STORM_WARN || mode === MISSION_STORM) {
        // 暴風: 近づいている（縁までの距離）か中。速すぎれば警告色（docs/02 §6.8）
        const near = t.stormState === STORM_NEAR;
        if (mode === MISSION_STORM_WARN) {
          this.missionText.setText(near ? `暴風まで ${stormStep * STORM_WARN_STEP_M} m ・ ${t.stormSafeKt} kt 以下に減速！` : `暴風 ・ ${t.stormSafeKt} kt 以下に減速！ 波で損傷`).setColor(HUD_COLOR_WARN);
        } else {
          this.missionText.setText(near ? `暴風まで ${stormStep * STORM_WARN_STEP_M} m ・ ${t.stormSafeKt} kt 以下で進め` : `暴風 ・ ${t.stormSafeKt} kt 以下で進め ・ 旋回が鈍い`).setColor(HUD_COLOR_STRONG);
        }
      } else if (mode === MISSION_SHALLOWS) {
        // 接近: 縁までの距離と安全速力。中: 安全速力で進めば通れる。座礁: 終わるまでの短い表示
        if (t.shallowState === SHALLOW_APPROACHING) this.missionText.setText(`浅瀬まで ${shallowStep * SHALLOW_WARN_STEP_M} m ・ ${t.shallowSafeKt} kt 以下に減速！`).setColor(HUD_COLOR_WARN);
        else if (t.shallowState === SHALLOW_INSIDE) this.missionText.setText(`浅瀬 ・ ${t.shallowSafeKt} kt 以下で進め`).setColor(HUD_COLOR_STRONG);
        else if (t.shallowState === SHALLOW_GROUNDED) this.missionText.setText('座礁！').setColor(HUD_COLOR_WARN);
      } else if (mode === MISSION_WAITING) {
        this.missionText.setText('帰投 — 魚雷の決着待ち').setColor(HUD_COLOR_STRONG);
      } else if (mode === MISSION_ADRIFT) {
        this.missionText.setText(`燃料切れ — 漂流 ・ 夜明けまで ${timeLeft} 秒`).setColor(HUD_COLOR_WARN);
      } else if (mode === MISSION_CALL) {
        const warn = (call & (CALL_FUEL | CALL_DAWN)) !== 0;
        this.missionText.setText(`${CALL_LABEL[call] ?? ''}帰投せよ  ${homeStep * HOME_MARKER_DISTANCE_STEP_M} m  夜明けまで ${timeLeft} 秒`).setColor(warn ? HUD_COLOR_WARN : HUD_COLOR_STRONG);
      } else {
        // 平常: 帯が近づいていれば予報を付ける
        const forecast = t.stormState === STORM_AHEAD ? ` ・ ${t.stormNorth ? '北' : '南'}に暴風 ${stormStep * STORM_AHEAD_STEP_M} m` : '';
        this.missionText.setText(`夜明けまで ${timeLeft} 秒 ・ 命中 ${t.hits}${forecast}`).setColor(HUD_COLOR_STRONG);
      }
    }
    // 3 行目: 敵影と発見。撃沈後は「駆逐艦を撃沈」に固定
    const status = t.destroyerSunk ? STATUS_SUNK : (t.enemySighted ? 1 : 0) | (t.playerDetected ? 2 : 0) | (t.illuminated ? 4 : 0) | (t.starLit ? 8 : 0) | (t.hiddenBySmoke ? 16 : 0);
    const detectStep = Math.round(t.detectRangeM / DETECT_RANGE_STEP_M);
    // 雨: 艦と艇を結ぶ線が暴風の帯にかかっている（発見距離・視程が下がる。v0.3.4）
    const rain = t.stormLos && !t.destroyerSunk;
    if (status !== this.lastStatus || detectStep !== this.lastDetectStep || rain !== this.lastRain) {
      this.lastStatus = status;
      this.lastDetectStep = detectStep;
      this.lastRain = rain;
      if (status === STATUS_SUNK) {
        this.statusText.setText('駆逐艦を撃沈').setColor(HUD_COLOR_STRONG);
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
    this.missionText.destroy();
    this.statusText.destroy();
  }
}
