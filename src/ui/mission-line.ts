// 上中央の 2 行目（v0.4.2 で boat-hud.ts から切り出し。中身は v0.4.1 のまま、大発掃討の 4 つのモードを足した）: 夜明けまで・帰投せよ・味方機・敵機・暴風・浅瀬・射撃・大発の逃走・撃つ前の手引き・撃破と上陸。
// §7: 表示する値のどれかが変わったときだけ文字を組んで setText する。文と表は ui/hud-lines.ts。
import Phaser from 'phaser';
import { DEPTH, GAME_WIDTH, HUD_MARGIN } from '../config/game-config';
import { BARGE_EVENT_SHOW_MS } from '../config/hunt-config';
import {
  HUD_COLOR_STRONG,
  HUD_COLOR_WARN,
  HUD_DEBUG_LINE_HEIGHT,
  HUD_FONT_MISSION_PX,
  HOME_MARKER_DISTANCE_STEP_M,
  PLANE_DISTANCE_STEP_M,
  SHALLOW_WARN_STEP_M,
  STORM_AHEAD_STEP_M,
  TARGET_MARKER_DISTANCE_STEP_M,
  STORM_WARN_STEP_M,
  hudTextStyle,
} from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { FF_CHALLENGE, FF_LEAVING, FF_OUT_GAVE_UP, FF_OUT_IDENTIFIED, FF_STRAFE } from '../core/friendly';
import { GUN_SAFE } from '../core/gun-battery';
import { CALL_DAWN, CALL_FUEL, topCall } from '../core/mission-flow';
import { SP_APPROACH } from '../core/seaplane';
import { SHALLOW_APPROACHING, SHALLOW_GROUNDED, SHALLOW_INSIDE } from '../core/shallows';
import { STORM_AHEAD, STORM_INSIDE, STORM_NEAR } from '../core/storm';
import { GUN_DISTANCE_STEP_M, bargeEventLine, bargeRunLine, bargeSightedLine, callLabel, friendlyLine, friendlyResultLine, gunLine, planeApproaching, planeAttacking, planeLeaving, seaplaneLine } from './hud-lines';

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
/** 9 水上機の攻撃（発見確定〜爆撃）、10 水上機の未確定の接近、11 水上機の結果（去る間）。v0.4.1 */
const MISSION_PLANE_ATTACK = 9;
const MISSION_PLANE = 10;
const MISSION_PLANE_RESULT = 11;
/** 12 射撃（ボタンを押している間）、13 大発が岸へ逃げている、14 大発の撃破・上陸の直後（BARGE_EVENT_SHOW_MS）。v0.4.2 */
const MISSION_GUN = 12;
const MISSION_BARGE_RUN = 13;
const MISSION_BARGE_EVENT = 14;
/** 15 撃つ前の手引き（押していない・大発が見えている・逃げている大発がいない）。v0.4.2 */
const MISSION_BARGE_SIGHTED = 15;

export class MissionLine {
  private readonly missionText: Phaser.GameObjects.Text;
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
  /** 水上機の 2 行目のキー（段階・確定・航跡・照明弾・爆弾・結果・撃沈・距離の刻みを 1 つの数に詰める） */
  private lastPlaneKey = -1;
  /** 大発掃討の 2 行目のキー（射撃の状態・速すぎ・遠い・撃破・上陸・直後の出来事・上陸までの秒・距離の刻み。v0.4.2） */
  private lastBargeKey = -1;
  /** 撃つ前の手引きのキー（気づかれた・最寄りの大発までの 50 m 刻み） */
  private lastSightKey = -1;
  private lastTimeLeft = -1;
  private lastHits = -1;
  /** 撃破・上陸の直後の表示（1 撃破 / 2 上陸）と、その終わりの時刻 ms */
  private eventKind = 0;
  private eventUntil = 0;
  private seenSunk = 0;
  private seenBeached = 0;

  constructor(scene: Phaser.Scene) {
    this.missionText = scene.add
      .text(GAME_WIDTH / 2, HUD_MARGIN + HUD_DEBUG_LINE_HEIGHT, '', hudTextStyle(HUD_FONT_MISSION_PX, HUD_COLOR_STRONG))
      .setOrigin(0.5, 0)
      .setDepth(DEPTH.hud);
  }

  /** 毎フレーム。nowMs は scene.time.now（撃破・上陸の直後の表示の時間） */
  refresh(t: BoatTelemetry, nowMs: number): void {
    if (t.bargesSunk > this.seenSunk || t.bargesBeached > this.seenBeached) {
      this.eventKind = t.bargesSunk > this.seenSunk ? 1 : 2;
      this.eventUntil = nowMs + BARGE_EVENT_SHOW_MS;
      this.seenSunk = t.bargesSunk;
      this.seenBeached = t.bargesBeached;
    }
    const event = nowMs < this.eventUntil ? this.eventKind : 0;
    // 優先順: 魚雷待ち > 燃料切れ > 水上機の攻撃 > 味方機（要求・航過）> 座礁 > 射撃 > 大発の逃走 > 撃つ前の手引き > 浅瀬 > 暴風の警告 > 水上機の接近 > 大発の結果 > 味方機の結果 > 水上機の結果 > 暴風の情報 > 帰投せよ > 平常（docs/02 §6.7・§6.8）
    const timeLeft = Math.max(0, Math.ceil(t.timeLeftS));
    const call = topCall(t.callFlags);
    const ffLive = t.friendlyPhase === FF_CHALLENGE || t.friendlyPhase === FF_STRAFE;
    const ffResult = t.friendlyPhase === FF_LEAVING && (t.friendlyOutcome === FF_OUT_IDENTIFIED || t.friendlyOutcome === FF_OUT_GAVE_UP);
    const stormClose = t.stormState === STORM_NEAR || t.stormState === STORM_INSIDE;
    const stormWarn = stormClose && t.stormFast;
    const stormInfo = stormClose && !t.stormFast;
    // 射撃（押している間）と大発の逃走は浅瀬の警告を後ろに付けて浅瀬より上（v0.4.2。浅瀬が狩り場）。座礁だけはその上
    const gunLive = t.gunMission && t.gunStatus !== GUN_SAFE && t.bargesSunk + t.bargesBeached < t.bargesTotal;
    const bargeRun = t.gunMission && !Number.isNaN(t.bargeEscapeS);
    const sighted = t.gunMission && t.gunStatus === GUN_SAFE && t.enemySighted;
    const mode = t.homeWaiting
      ? MISSION_WAITING
      : t.fuelEmpty
        ? MISSION_ADRIFT
        : planeAttacking(t)
          ? MISSION_PLANE_ATTACK
          : ffLive
            ? MISSION_FRIENDLY
            : t.shallowState === SHALLOW_GROUNDED
              ? MISSION_SHALLOWS
              : gunLive
                ? MISSION_GUN
                : bargeRun
                  ? MISSION_BARGE_RUN
                  : sighted
                    ? MISSION_BARGE_SIGHTED
                    : t.shallowState !== 0
                      ? MISSION_SHALLOWS
                      : stormWarn
                        ? MISSION_STORM_WARN
                        : planeApproaching(t)
                          ? MISSION_PLANE
                          : event !== 0
                            ? MISSION_BARGE_EVENT
                            : ffResult
                              ? MISSION_FRIENDLY_RESULT
                              : planeLeaving(t)
                                ? MISSION_PLANE_RESULT
                                : stormInfo
                                  ? MISSION_STORM
                                  : call !== 0
                                    ? MISSION_CALL
                                    : MISSION_NORMAL;
    const planeMode = mode === MISSION_PLANE_ATTACK || mode === MISSION_PLANE || mode === MISSION_PLANE_RESULT;
    // 敵機までの距離は接近中だけ 100 m 刻み（切り上げ）
    const planeStep = t.planePhase === SP_APPROACH ? Math.ceil(t.planeDistM / PLANE_DISTANCE_STEP_M) : 0;
    const planeKey = planeMode
      ? t.planePhase | (t.planeLocked ? 8 : 0) | (t.planeWake ? 16 : 0) | (t.planeFlareOn ? 32 : 0) | (t.planeBombAir ? 64 : 0) | (t.planeBombsDropped << 7) | (t.planeOutcome << 9) | (t.destroyerSunk ? 2048 : 0) | (t.planeBombsHit << 12) | (planeStep << 14)
      : 0;
    // 暴風の距離の刻み: 近いときは 50 m、予報は 100 m（それ以外は 0）
    const stormStep = t.stormState === STORM_NEAR ? Math.ceil(t.stormGapM / STORM_WARN_STEP_M) : t.stormState === STORM_AHEAD ? Math.ceil(t.stormGapM / STORM_AHEAD_STEP_M) : 0;
    const shallowStep = Math.ceil(t.shallowAheadM / SHALLOW_WARN_STEP_M);
    // 大発掃討のキー（v0.4.2）: 射撃の状態・速すぎ・遠い・撃破・上陸・直後の出来事・上陸までの秒（31 まで）・距離の刻み（127 まで）。
    // 距離は切り上げ（表示が実際より近くならない。「遠い」も表示の値で決める＝gunLine と同じ）
    const distStep = Math.min(127, Math.ceil(t.gunTargetM / GUN_DISTANCE_STEP_M));
    const escapeS = bargeRun ? Math.min(31, Math.ceil(t.bargeEscapeS)) : 0;
    const bargeKey = t.gunMission
      ? t.gunStatus | (t.gunFast ? 8 : 0) | (distStep * GUN_DISTANCE_STEP_M > t.gunEffectiveM ? 16 : 0) | (t.bargesSunk << 5) | (t.bargesBeached << 8) | (event << 11) | (escapeS << 13) | (distStep << 18)
      : 0;
    // 撃つ前の手引き: 最寄りの浮いている大発まで 50 m 刻みの切り上げ（「300 m で撃て」の 300 m は 300 m 以内。画面外の矢印も大発の任務は切り上げ。平方根はこのモードの間だけフレームに 1 回）
    const sightStep = mode === MISSION_BARGE_SIGHTED ? Math.ceil(Math.sqrt(t.enemyDx * t.enemyDx + t.enemyDy * t.enemyDy) / TARGET_MARKER_DISTANCE_STEP_M) : 0;
    const sightKey = mode === MISSION_BARGE_SIGHTED ? 1 | (t.playerDetected ? 2 : 0) | (sightStep << 2) : 0;
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
      (planeMode && planeKey !== this.lastPlaneKey) ||
      bargeKey !== this.lastBargeKey ||
      sightKey !== this.lastSightKey ||
      ((mode === MISSION_GUN || mode === MISSION_BARGE_RUN || mode === MISSION_BARGE_SIGHTED) && (t.shallowState !== this.lastShallowState || shallowStep !== this.lastShallowStep)) ||
      (mode === MISSION_PLANE_ATTACK && (t.shallowState !== this.lastShallowState || shallowStep !== this.lastShallowStep || t.stormFast !== this.lastStormFast || t.stormState !== this.lastStormState)) ||
      // 暴風のキー: 警告・情報・味方機の行は fast も文に効く。平常の予報は state・向き・距離だけ（fast は文に出ないので見ない）
      ((mode === MISSION_STORM_WARN || mode === MISSION_STORM || mode === MISSION_FRIENDLY) && t.stormFast !== this.lastStormFast) ||
      ((mode === MISSION_STORM_WARN || mode === MISSION_STORM || mode === MISSION_NORMAL || mode === MISSION_FRIENDLY) &&
        (t.stormState !== this.lastStormState || t.stormNorth !== this.lastStormNorth || stormStep !== this.lastStormStep))
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
      this.lastPlaneKey = planeKey;
      this.lastBargeKey = bargeKey;
      this.lastSightKey = sightKey;
      if (mode === MISSION_GUN || mode === MISSION_BARGE_RUN || mode === MISSION_BARGE_EVENT || mode === MISSION_BARGE_SIGHTED) {
        const l =
          mode === MISSION_GUN
            ? gunLine(t, distStep, escapeS, shallowStep)
            : mode === MISSION_BARGE_RUN
              ? bargeRunLine(t, escapeS, shallowStep)
              : mode === MISSION_BARGE_SIGHTED
                ? bargeSightedLine(t, sightStep * TARGET_MARKER_DISTANCE_STEP_M, shallowStep)
                : bargeEventLine(t, event);
        this.missionText.setText(l.text).setColor(l.color);
      } else if (planeMode) {
        const l = seaplaneLine(t, planeStep, shallowStep, stormWarn);
        this.missionText.setText(l.text).setColor(l.color);
      } else if (mode === MISSION_FRIENDLY) {
        const l = friendlyLine(t, ffLeft, shallowStep, stormWarn);
        this.missionText.setText(l.text).setColor(l.color);
      } else if (mode === MISSION_FRIENDLY_RESULT) {
        const l = friendlyResultLine(t);
        this.missionText.setText(l.text).setColor(l.color);
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
        this.missionText.setText(`${callLabel(call, t.gunMission)}帰投せよ  ${homeStep * HOME_MARKER_DISTANCE_STEP_M} m  夜明けまで ${timeLeft} 秒`).setColor(warn ? HUD_COLOR_WARN : HUD_COLOR_STRONG);
      } else {
        // 平常: 帯が近づいていれば予報を付ける。大発の任務は、見えている大発が無く残りがあれば狩り場と来る方角（「大発は南の岸沿いを東から」）
        const forecast = t.stormState === STORM_AHEAD ? ` ・ ${t.stormNorth ? '北' : '南'}に暴風 ${stormStep * STORM_AHEAD_STEP_M} m` : '';
        const hint = t.gunMission && !t.enemySighted && t.bargesSunk + t.bargesBeached < t.bargesTotal ? ` ・ ${t.bargeHint}` : '';
        const score = t.gunMission ? `大発 撃破 ${t.bargesSunk}/${t.bargesQuota}${hint}` : `命中 ${t.hits}`;
        this.missionText.setText(`夜明けまで ${timeLeft} 秒 ・ ${score}${forecast}`).setColor(HUD_COLOR_STRONG);
      }
    }
  }

  destroy(): void {
    this.missionText.destroy();
  }
}
