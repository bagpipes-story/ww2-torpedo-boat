// 上中央の 2 行目（v0.4.2 で boat-hud.ts から切り出し。中身は v0.4.1 のまま、大発掃討の 4 つのモードを足した）: 夜明けまで・帰投せよ・味方機・敵機・暴風・浅瀬・射撃・大発の逃走・撃つ前の手引き・撃破と上陸・夜明けの空襲（v0.6.1）。
// §7: 表示する値のどれかが変わったときだけ文字を組んで setText する。文と表は ui/hud-lines.ts（夜明けの時計・空襲は ui/dawn-lines.ts）、どの行を出すかの優先順は ui/mission-mode.ts（v0.6.1 で切り出し）。
// v0.6.2 実機 1 回目: 左上 2 段目の時計（ui/dawn-clock）と同じ段なので、組み直したときだけ時計を左右対称に避ける幅に縮める（lineFitScale。収まれば等倍）。
// v0.6.3: 米PT の 3 つのモード（文とキーは ui/pt-lines.ts）。航過の結果は航過の通し番号が増えてから PT_RESULT_SHOW_MS の間（通し番号は撃った弾がみな落ちてから増える。ui/mission-mode の ptResultShown）。
// 実機 1 回目: T-14 の 13mm の 2 つ（射撃・撃退と撃沈。ui/pt-gun-lines）。出来事は 13mm の出来事の通し番号が増えてから PT_RESULT_SHOW_MS の間（赤い線に隠れている間は始めず、航過の結果は出来事の後に出す）。
// 実機 2 回目のレビュー R2・ux-3: 米PT の時刻の旗は ui/pt-line-clock（出来事は 1 度出たら出し直さない・同じ PT の連射の結果は出来事の行に足す）。
import Phaser from 'phaser';
import { DEPTH, GAME_WIDTH, HUD_MARGIN } from '../config/game-config';
import { HUD_CLOCK_GAP_PX, HUD_CLOCK_MAX_W_PX } from '../config/hud-text-config';
import { BARGE_EVENT_SHOW_MS } from '../config/hunt-config';
import { ESCORT_EVENT_SHOW_MS } from '../config/ui-config';
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
import { FF_CHALLENGE } from '../core/friendly';
import { CALL_DAWN, CALL_FUEL, topCall } from '../core/mission-flow';
import { SP_APPROACH } from '../core/seaplane';
import { SHALLOW_APPROACHING, SHALLOW_GROUNDED, SHALLOW_INSIDE } from '../core/shallows';
import { STORM_AHEAD, STORM_NEAR } from '../core/storm';
import { DETECT_RANGE_STEP_M, ESCORT_DISTANCE_STEP_M, GUN_DISTANCE_STEP_M, bargeEventLine, bargeRunLine, bargeSightedLine, batteryLine, escortHitLine, escortLagLine, escortLostLine, friendlyLine, friendlyResultLine, gunLine, seaplaneLine, sightedFast } from './hud-lines';
import { DAWN_AIR_NONE } from '../core/dawn-air';
import { airRaidTagJa, bargeHideTagKey, clockKey, dawnCallLabel, lineFitScale, strikeKey, strikeLine } from './dawn-lines';
import { ptKey, ptLine } from './pt-lines';
import { PtLineClock } from './pt-line-clock';
import {
  MISSION_ADRIFT, MISSION_BARGE_EVENT, MISSION_BARGE_RUN, MISSION_BARGE_SIGHTED, MISSION_BATTERY, MISSION_CALL, MISSION_ESCORT_HIT, MISSION_ESCORT_LAG, MISSION_ESCORT_LOST, MISSION_FRIENDLY, MISSION_FRIENDLY_RESULT, MISSION_GUN,
  MISSION_NORMAL, MISSION_PLANE, MISSION_PLANE_ATTACK, MISSION_PLANE_RESULT, MISSION_PT_PASS, MISSION_SHALLOWS, MISSION_STORM, MISSION_STORM_WARN, MISSION_STRIKE, MISSION_STRIKE_REST, MISSION_WAITING,
  MISSION_PT_GUN_EVENT, MODE_FLAG_BARGE_EVENT, MODE_FLAG_ESCORT_HIT, bargeRunning, missionMode, stormWarning,
} from './mission-mode';

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
  /** 撃つ前の手引きのキー（気づかれた・速い・最寄りの大発までの 50 m 刻み・見つかる距離の刻み） */
  private lastSightKey = -1;
  private lastTimeLeft = -1;
  private lastHits = -1;
  private lastShipsSunk = -1;
  private lastTransportSunk = false;
  /** 撃破・上陸の直後の表示（1 撃破 / 2 上陸）と、その終わりの時刻 ms */
  private eventKind = 0;
  private eventUntil = 0;
  private seenSunk = 0;
  private seenBeached = 0;
  /** 僚艇（v0.4.4）: 前回見た HP と被弾の表示の終わり ms、2 行目のキー（沈没・被弾・HP・遅れの刻み） */
  private seenEscortHp = -1;
  private escortHitUntil = 0;
  private lastEscortKey = -1;
  /** 夜明けの空襲の 2 行目のキー（v0.6.1。ui/dawn-lines の strikeKey）と、後ろの「大発 岸へ N 隻」のキー（v0.6.2 実機 1 回目。bargeHideTagKey） */
  private lastStrikeKey = -1;
  private lastBargeTagKey = 0;
  /** 米PT（v0.6.3）: 2 行目のキー（ui/pt-lines の ptKey）と、攻撃の結果・13mm の出来事の時刻の旗（ui/pt-line-clock） */
  private lastPtKey = -1;
  private readonly ptClock = new PtLineClock();

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
    // 僚艇の被弾（v0.4.4）: HP が減ったら ESCORT_EVENT_SHOW_MS の間「被弾！」（沈んだら「沈没」の行が勝つ）
    if (t.escortEnabled) {
      if (this.seenEscortHp >= 0 && t.escortHp < this.seenEscortHp) this.escortHitUntil = nowMs + ESCORT_EVENT_SHOW_MS;
      this.seenEscortHp = t.escortHp;
    }
    const escortHit = t.escortEnabled && !t.escortSunk && nowMs < this.escortHitUntil;
    // 時計のキー（夜明け前は残り秒の切り上げ、夜明けの後は負の数で夜明け後の秒。v0.6.1）。v0.6.2 実機 2 回目から 2 行目に時計の文字は出さない（左上の時計と重なる）が、
    // キーに入っていない値（見えている敵・大発の手引きなど）を毎秒拾い直すために、見直しの合図としては残す（同じ文字なら setText は描き直さない）
    const timeLeft = clockKey(t);
    const call = topCall(t.callFlags);
    const stormWarn = stormWarning(t);
    const bargeRun = bargeRunning(t);
    // 米PT: 赤い線 > 13mm の出来事 > 攻撃の結果（上の行に隠れている間は始めない）と、攻撃の後に弾が飛んでいる間の赤い線の行の保ち（ui/pt-line-clock）
    const flags = (event !== 0 ? MODE_FLAG_BARGE_EVENT : 0) | (escortHit ? MODE_FLAG_ESCORT_HIT : 0) | this.ptClock.flags(t, nowMs, this.lastMissionMode);
    const mode = missionMode(t, call, flags);
    this.ptClock.shown(mode);
    const ptMode = mode >= MISSION_PT_PASS && mode <= MISSION_PT_GUN_EVENT; // 米PT の 5 つ（22〜26）。距離と方角はこのときだけ ptKey が求める
    const pKey = ptMode ? ptKey(t, mode, flags, this.lastPtKey, this.ptClock.merge) : 0;
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
      ? t.gunStatus | (t.gunFast ? 8 : 0) | (distStep * GUN_DISTANCE_STEP_M > t.gunEffectiveM ? 16 : 0) | (t.bargesSunk << 5) | (t.bargesBeached << 8) | (event << 11) | (escapeS << 13) | (distStep << 18) | (t.batteryInArc ? 1 << 25 : 0) | (t.batteryAlerted ? 1 << 26 : 0)
      : 0;
    // 撃つ前の手引き: 最寄りの浮いている大発まで 50 m 刻みの切り上げ（「300 m で撃て」の 300 m は 300 m 以内。画面外の矢印も大発の任務は切り上げ。平方根はこのモードの間だけフレームに 1 回）
    const sightStep = mode === MISSION_BARGE_SIGHTED ? Math.ceil(Math.sqrt(t.enemyDx * t.enemyDx + t.enemyDy * t.enemyDy) / TARGET_MARKER_DISTANCE_STEP_M) : 0;
    // 手引きのキー: 気づかれた・速い（減速の合図）・距離の刻み・見つかる距離の刻み（速いときの文に出る）
    const sightKey = mode === MISSION_BARGE_SIGHTED ? 1 | (t.playerDetected ? 2 : 0) | (sightedFast(t) ? 4 : 0) | (sightStep << 3) | (Math.round(t.detectRangeM / DETECT_RANGE_STEP_M) << 9) : 0;
    // 僚艇のキー（v0.4.4）: 沈没・被弾・HP（整数）・遅れの刻み（遅れの行のときだけ）
    const lagStep = mode === MISSION_ESCORT_LAG ? Math.ceil(t.escortDistM / ESCORT_DISTANCE_STEP_M) : 0;
    const escortKey = t.escortEnabled ? 1 | (t.escortSunk ? 2 : 0) | (escortHit ? 4 : 0) | (Math.ceil(t.escortHp) << 3) | (lagStep << 11) : 0;
    // 識別の残り秒は 5,4,3,2,1（0 は出さない）
    const ffLeft = t.friendlyPhase === FF_CHALLENGE ? Math.max(1, Math.ceil(t.friendlyLeftS)) : 0;
    // 距離は輪の縁まで（目盛り・呼びかけ・Result と同じ基準）。切り上げなので輪の外では 0 にならない
    const homeStep = Math.ceil(t.homeEdgeM / HOME_MARKER_DISTANCE_STEP_M);
    const strikeMode = mode === MISSION_STRIKE || mode === MISSION_STRIKE_REST;
    const sKey = strikeMode ? strikeKey(t) : 0;
    // 夜明けに岸へ逃げる大発（v0.6.2 実機 1 回目）: 上陸の直後の表示（event 2）の間は「上陸 N 隻」
    const landedShow = event === 2;
    const tagKey = strikeMode ? bargeHideTagKey(t.dawn, landedShow) : 0;
    if (
      mode !== this.lastMissionMode ||
      call !== this.lastCall ||
      timeLeft !== this.lastTimeLeft ||
      t.hits !== this.lastHits ||
      t.shipsSunk !== this.lastShipsSunk ||
      t.transportSunk !== this.lastTransportSunk ||
      (mode === MISSION_CALL && homeStep !== this.lastHomeStep) ||
      ((mode === MISSION_SHALLOWS || mode === MISSION_FRIENDLY) && (t.shallowState !== this.lastShallowState || shallowStep !== this.lastShallowStep)) ||
      (mode === MISSION_FRIENDLY &&
        (t.friendlyPhase !== this.lastFriendlyPhase || ffLeft !== this.lastFriendlyLeft || t.friendlyPasses !== this.lastFriendlyPasses || t.friendlyPending !== this.lastFriendlyPending)) ||
      (mode === MISSION_FRIENDLY_RESULT && (t.friendlyOutcome !== this.lastFriendlyOutcome || t.friendlyPasses !== this.lastFriendlyPasses)) ||
      (planeMode && planeKey !== this.lastPlaneKey) ||
      bargeKey !== this.lastBargeKey ||
      sightKey !== this.lastSightKey ||
      escortKey !== this.lastEscortKey ||
      sKey !== this.lastStrikeKey ||
      tagKey !== this.lastBargeTagKey ||
      pKey !== this.lastPtKey ||
      ((mode === MISSION_ESCORT_LOST || mode === MISSION_ESCORT_LAG) && (homeStep !== this.lastHomeStep || t.shallowState !== this.lastShallowState || shallowStep !== this.lastShallowStep || t.stormFast !== this.lastStormFast || t.stormState !== this.lastStormState)) ||
      ((mode === MISSION_GUN || mode === MISSION_BARGE_RUN || mode === MISSION_BARGE_SIGHTED || mode === MISSION_BATTERY) && (t.shallowState !== this.lastShallowState || shallowStep !== this.lastShallowStep)) ||
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
      this.lastShipsSunk = t.shipsSunk;
      this.lastTransportSunk = t.transportSunk;
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
      this.lastEscortKey = escortKey;
      this.lastStrikeKey = sKey;
      this.lastBargeTagKey = tagKey;
      this.lastPtKey = pKey;
      if (ptMode) {
        const l = ptLine(t, mode, pKey);
        this.missionText.setText(l.text).setColor(l.color);
      } else if (strikeMode) {
        // 僚艇の HP と被弾（v0.6.1 レビュー: 空襲の行が被弾の行より上なので、行の中で出す。変わったときは escortKey が組み直させる）
        const l = strikeLine(t, shallowStep, stormWarn, escortHit, landedShow);
        this.missionText.setText(l.text).setColor(l.color);
      } else if (mode === MISSION_ESCORT_LOST || mode === MISSION_ESCORT_HIT || mode === MISSION_ESCORT_LAG) {
        const l = mode === MISSION_ESCORT_LOST ? escortLostLine(homeStep) : mode === MISSION_ESCORT_HIT ? escortHitLine(t) : escortLagLine(t, lagStep, shallowStep, stormWarn);
        this.missionText.setText(l.text).setColor(l.color);
      } else if (mode === MISSION_GUN || mode === MISSION_BARGE_RUN || mode === MISSION_BARGE_EVENT || mode === MISSION_BARGE_SIGHTED || mode === MISSION_BATTERY) {
        const l =
          mode === MISSION_GUN
            ? gunLine(t, distStep, escapeS, shallowStep)
            : mode === MISSION_BARGE_RUN
              ? bargeRunLine(t, escapeS, shallowStep)
              : mode === MISSION_BARGE_SIGHTED
                ? bargeSightedLine(t, sightStep * TARGET_MARKER_DISTANCE_STEP_M, shallowStep)
                : mode === MISSION_BATTERY
                  ? batteryLine(t, shallowStep)
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
        this.missionText.setText('燃料切れ — 漂流').setColor(HUD_COLOR_WARN);
      } else if (mode === MISSION_CALL) {
        const warn = (call & (CALL_FUEL | CALL_DAWN)) !== 0;
        this.missionText.setText(`${dawnCallLabel(call, t.gunMission, t.dawn.reached ? t.dawn.air : DAWN_AIR_NONE)}帰投せよ  ${homeStep * HOME_MARKER_DISTANCE_STEP_M} m`).setColor(warn ? HUD_COLOR_WARN : HUD_COLOR_STRONG);
      } else {
        // 平常: 帯が近づいていれば予報を付ける。大発の任務は、見えている大発が無く残りがあれば狩り場と来る方角（「大発は南の岸沿いを東から」）
        const forecast = t.stormState === STORM_AHEAD ? ` ・ ${t.stormNorth ? '北' : '南'}に暴風 ${stormStep * STORM_AHEAD_STEP_M} m` : '';
        const hint = t.gunMission && !t.enemySighted && t.bargesSunk + t.bargesBeached < t.bargesTotal ? ` ・ ${t.bargeHint}` : '';
        // 僚艇の任務（v0.4.4）は僚艇の HP（命中は後ろ）
        // 駆逐艦が 2 隻以上（ハード。v0.4.5）なら「撃沈 N/M」を足す
        const ships = (t.shipsTotal > 1 ? ` ・ 撃沈 ${t.shipsSunk}/${t.shipsTotal}` : '') + (t.transportEnabled ? ` ・ 輸送船 ${t.transportSunk ? '撃沈' : '健在'}` : '');
        const score = t.gunMission ? `大発 撃破 ${t.bargesSunk}/${t.bargesQuota}${hint}` : t.escortEnabled ? `僚艇 HP ${Math.ceil(t.escortHp)} ・ 命中 ${t.hits}${ships}` : `命中 ${t.hits}${ships}`;
        this.missionText.setText(`${airRaidTagJa(t)}${score}${forecast}`).setColor(HUD_COLOR_STRONG);
      }
      // 左上の時計を避ける（Text.width は等倍の幅）
      const k = lineFitScale(this.missionText.width, GAME_WIDTH, HUD_MARGIN + HUD_CLOCK_MAX_W_PX + HUD_CLOCK_GAP_PX);
      if (k !== this.missionText.scaleX) this.missionText.setScale(k);
    }
  }

  destroy(): void {
    this.missionText.destroy();
  }
}
