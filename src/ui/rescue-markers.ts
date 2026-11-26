// 救助の任務（v0.8.5 S4。us_07）の画面端の印（spec-v0850 §8.2）: 一番近い群（残りのある群）が画面の外なら橙の「生存者 650 m」（50 m 刻みの切り上げ・満員と救助の時間の後は出さない）、
// 乗せている間はフィッチの輪が画面の外なら味方の青の「フィッチ 1200 m」（輪の縁まで・100 m 刻みの切り上げ）。帰投の印は今のまま（ui/hud-markers）。
// どちらもラベルは矢印の上（帰投の印と同じ置き方）・画面の枠の左右 HUD_MARGIN の内。右下の速力の HUD の角と左下のスティックの台座を避け、帰投の印から縁に沿って離し（上下の縁ではラベルの幅で）、
// 生存者の印はフィッチの印からも離す（ui/marker-separation）。v0.8.5 S5: 最後に一時停止と静音・倍速の衛星の塊を右へ避ける（ui/pause-cluster）。
// 矢印の絵は帰投の印（tex-home-marker）に色を掛ける（新しい絵の鍵は作らない＝tex-ab は変わらない）。救助の無い任務は作らない（ui/hud-markers）。
// v0.8.5 IP5（実機 2 回目「沿岸砲もきちんと描画してください」）: 砲台ごとに赤い「砲台 N m」（敵の印の三角の絵・ラベルは矢印の上）。砲台は浅瀬の縁から 850 m 先の陸で艇の画面にほぼ入らないので、
//   画面の外（砲台の中心が本当の画面の矩形の外＝hideMargin 0）の砲台を、自艇が射界の中にいる間か撃ってから RESCUE_BATTERY_MARKER_HOLD_MS の間だけ縁に出し、撃った時は矢印を膨らませる（砲口の閃光の代わり。実時間）。
//   置き方は生存者・フィッチの印と同じ（角とスティックを避け、帰投・フィッチ・生存者の印から離し、最後に一時停止の塊）。印は作る時の砲台の数（ハード 3）だけ持つが、出すのは一番近い 1 本（IP4/5 の統合）。
// §7: 距離の平方根は出ている印のフレームに 1 回（edge-marker の hypot／フィッチは輪の縁まで）。文は刻みが変わった時だけ setText（edge-marker）。確保しない。
import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, HUD_MARGIN, TEXTURE_KEYS } from '../config/game-config';
import {
  RESCUE_BATTERY_MARKER_HOLD_MS, RESCUE_BATTERY_MARKER_JA, RESCUE_BATTERY_MARKER_STEP_M, RESCUE_BATTERY_PULSE_MS, RESCUE_BATTERY_PULSE_SCALE, RESCUE_FITCH_MARKER_STEP_M, RESCUE_SURVIVOR_MARKER_JA,
  RESCUE_SURVIVOR_MARKER_STEP_M,
} from '../config/rescue-hud-config';
import { BATTERY_LABEL_COLOR } from '../config/hunt-config';
import { SURVIVOR_LABEL_COLOR, SURVIVOR_VEST_COLOR } from '../config/rescue-art-config';
import { HOME_COLOR_TEXT, HOME_MARKER_TOP_MARGIN, HUD_FONT_MARKER_PX, STICK_FIXED_CENTER_X, STICK_FIXED_CENTER_Y, STICK_RADIUS, TARGET_MARKER_MARGIN, TARGET_MARKER_RIGHT_MARGIN } from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { EdgeMarker } from './edge-marker';
import { EDGE_EPS_PX, avoidCorner, separateMarker, type MarkerRect, type MarkerShift } from './marker-separation';
import { clearOfPauseCluster, type PauseCluster } from './pause-cluster';

/** 2 本の印を離す px（左右の縁は字 2 行ぶん＝ui/hud-markers の隼艇・中継と同じ。上下の縁はラベルが横に並ぶのでラベルの幅の半分ずつ＋すき間＝ui/evac-markers と同じ） */
const RESCUE_MARKER_SEP_PX = HUD_FONT_MARKER_PX * 2 + 8;
const RESCUE_LABEL_SEP_GAP_PX = 12;
const RECT: MarkerRect = { left: TARGET_MARKER_MARGIN, top: HOME_MARKER_TOP_MARGIN, right: GAME_WIDTH - TARGET_MARKER_RIGHT_MARGIN, bottom: GAME_HEIGHT - TARGET_MARKER_MARGIN };
const shift: MarkerShift = { dx: 0, dy: 0 };
/** 左下のスティックの台座（矢印とラベルの余白込み）: これより左・下の縁の点は縁に沿って外へ（コリーの群は出発点の南西＝出撃の直後に台座の上に出た。S4 の画面写し） */
const STICK_KEEP_RIGHT = STICK_FIXED_CENTER_X + STICK_RADIUS + HUD_FONT_MARKER_PX * 4;
const STICK_KEEP_TOP = STICK_FIXED_CENTER_Y - STICK_RADIUS - HUD_FONT_MARKER_PX * 2;

export class RescueEdgeMarkers {
  private readonly survivors: EdgeMarker;
  private readonly fitch: EdgeMarker;
  /** 砲台の印（v0.8.5 IP5。砲台ごと）・最後に見た撃った数・撃った実時刻 ms（まだ撃っていなければ −∞） */
  private readonly batteries: EdgeMarker[] = [];
  private readonly fired: Uint32Array;
  private readonly firedAt: Float64Array;

  constructor(private readonly scene: Phaser.Scene, fitchJa: string, private readonly keepLeft: number, private readonly keepTop: number, private readonly pauseKeep: PauseCluster, batteryCount = 0) {
    this.survivors = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.homeMarker, labelPrefix: RESCUE_SURVIVOR_MARKER_JA, stepM: RESCUE_SURVIVOR_MARKER_STEP_M, labelAbove: true, roundUp: true, topMargin: HOME_MARKER_TOP_MARGIN, color: SURVIVOR_LABEL_COLOR, tint: SURVIVOR_VEST_COLOR, labelInset: HUD_MARGIN });
    this.fitch = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.homeMarker, labelPrefix: fitchJa, stepM: RESCUE_FITCH_MARKER_STEP_M, labelAbove: true, roundUp: true, topMargin: HOME_MARKER_TOP_MARGIN, color: HOME_COLOR_TEXT, labelInset: HUD_MARGIN });
    for (let i = 0; i < batteryCount; i++) this.batteries.push(new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.targetMarker, labelPrefix: RESCUE_BATTERY_MARKER_JA, stepM: RESCUE_BATTERY_MARKER_STEP_M, labelAbove: true, topMargin: HOME_MARKER_TOP_MARGIN, color: BATTERY_LABEL_COLOR, labelInset: HUD_MARGIN, hideMargin: 0 }));
    this.fired = new Uint32Array(batteryCount);
    this.firedAt = new Float64Array(batteryCount).fill(-Infinity);
  }

  /** 毎フレーム（home は帰投の印。出ていれば離す） */
  refresh(t: BoatTelemetry, home: EdgeMarker | undefined): void {
    const r = t.rescue;
    if (!r) return;
    const fm = this.fitch;
    const carry = r.aboard > 0;
    fm.refresh(r.fitchDx, r.fitchDy, carry, t, carry ? Math.max(0, Math.hypot(r.fitchDx, r.fitchDy) - r.fitchRingM) : undefined);
    if (fm.isShown) this.place(fm, home, undefined);
    const sm = this.survivors;
    sm.refresh(r.nearDx, r.nearDy, r.nearCount > 0 && !r.timeUp && r.aboard < r.capacity, t);
    if (sm.isShown) this.place(sm, home, fm.isShown ? fm : undefined);
    if (this.batteries.length > 0) this.refreshBatteries(t, home);
  }

  /** 砲台の印（v0.8.5 IP5）: 射界の中か撃ってから HOLD の間・画面の外なら縁へ。撃った時は矢印を膨らませて戻す（実時間）。帰投・フィッチ・生存者から離す。
   *  v0.8.5 IP4/5 の統合: 出すのは条件を満たす砲台のうち自艇に一番近い 1 本だけ（ハードで 3 本が下の縁に並んで字が詰まった＝画面写し）。どの砲台が撃っても矢印を膨らませる */
  private refreshBatteries(t: BoatTelemetry, home: EdgeMarker | undefined): void {
    const r = t.rescue!;
    const now = this.scene.time.now;
    let pick = -1;
    let best = Infinity;
    let youngest = Infinity;
    for (let i = 0; i < this.batteries.length; i++) {
      const f = i < r.batteryFired.length ? r.batteryFired[i]! : 0;
      if (f !== this.fired[i]) {
        this.fired[i] = f;
        this.firedAt[i] = now;
      }
      const age = now - this.firedAt[i]!;
      if (age < youngest) youngest = age;
      const dx = r.batteryDx[i] ?? NaN;
      const dy = r.batteryDy[i] ?? NaN;
      const d2 = dx * dx + dy * dy;
      if ((r.batteryInArc[i] === 1 || age < RESCUE_BATTERY_MARKER_HOLD_MS) && d2 < best) {
        best = d2;
        pick = i;
      }
    }
    for (let i = 0; i < this.batteries.length; i++) {
      const m = this.batteries[i]!;
      m.refresh(r.batteryDx[i] ?? NaN, r.batteryDy[i] ?? NaN, i === pick, t);
      if (!m.isShown) continue;
      m.setArrowScale(youngest < RESCUE_BATTERY_PULSE_MS ? 1 + (RESCUE_BATTERY_PULSE_SCALE - 1) * (1 - youngest / RESCUE_BATTERY_PULSE_MS) : 1);
      this.place(m, home, this.fitch.isShown ? this.fitch : undefined);
      if (this.survivors.isShown) this.apart(this.survivors, m);
      clearOfPauseCluster(m, this.pauseKeep);
    }
  }

  /** 角を避け、帰投の印と（あれば）もう 1 本から離す */
  private place(m: EdgeMarker, home: EdgeMarker | undefined, other: EdgeMarker | undefined): void {
    m.nudge(avoidCorner(m.shownX, m.shownY, RECT, this.keepLeft, this.keepTop, shift).dx, shift.dy);
    if (m.shownX < STICK_KEEP_RIGHT && m.shownY > STICK_KEEP_TOP) {
      if (Math.abs(m.shownX - RECT.left) < EDGE_EPS_PX) m.nudge(0, STICK_KEEP_TOP - m.shownY);
      else if (Math.abs(m.shownY - RECT.bottom) < EDGE_EPS_PX) m.nudge(STICK_KEEP_RIGHT - m.shownX, 0);
    }
    if (home && home.isShown) this.apart(home, m);
    if (other) this.apart(other, m);
    clearOfPauseCluster(m, this.pauseKeep);
  }

  /** m を a から縁に沿って離す（上下の縁ではラベルの幅で） */
  private apart(a: EdgeMarker, m: EdgeMarker): void {
    const side = Math.abs(m.shownX - RECT.left) < EDGE_EPS_PX || Math.abs(m.shownX - RECT.right) < EDGE_EPS_PX;
    const sep = side ? RESCUE_MARKER_SEP_PX : Math.max(RESCUE_MARKER_SEP_PX, (a.labelWidth + m.labelWidth) / 2 + RESCUE_LABEL_SEP_GAP_PX);
    m.nudge(separateMarker(a.shownX, a.shownY, m.shownX, m.shownY, RECT, sep, shift).dx, shift.dy);
  }

  destroy(): void {
    this.survivors.destroy();
    this.fitch.destroy();
    for (const m of this.batteries) m.destroy();
  }
}
