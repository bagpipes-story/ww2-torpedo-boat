// 救助の任務（v0.8.5 S4。us_07）の画面端の印（spec-v0850 §8.2）: 一番近い群（残りのある群）が画面の外なら橙の「生存者 650 m」（50 m 刻みの切り上げ・満員と救助の時間の後は出さない）、
// 乗せている間はフィッチの輪が画面の外なら味方の青の「フィッチ 1200 m」（輪の縁まで・100 m 刻みの切り上げ）。帰投の印は今のまま（ui/hud-markers）。
// どちらもラベルは矢印の上（帰投の印と同じ置き方）・画面の枠の左右 HUD_MARGIN の内。右下の速力の HUD の角と左下のスティックの台座を避け、帰投の印から縁に沿って離し（上下の縁ではラベルの幅で）、
// 生存者の印はフィッチの印からも離す（ui/marker-separation）。
// 矢印の絵は帰投の印（tex-home-marker）に色を掛ける（新しい絵の鍵は作らない＝tex-ab は変わらない）。救助の無い任務は作らない（ui/hud-markers）。
// §7: 距離の平方根は出ている印のフレームに 1 回（edge-marker の hypot／フィッチは輪の縁まで）。文は刻みが変わった時だけ setText（edge-marker）。確保しない。
import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, HUD_MARGIN, TEXTURE_KEYS } from '../config/game-config';
import { RESCUE_FITCH_MARKER_STEP_M, RESCUE_SURVIVOR_MARKER_JA, RESCUE_SURVIVOR_MARKER_STEP_M } from '../config/rescue-hud-config';
import { SURVIVOR_LABEL_COLOR, SURVIVOR_VEST_COLOR } from '../config/rescue-art-config';
import { HOME_COLOR_TEXT, HOME_MARKER_TOP_MARGIN, HUD_FONT_MARKER_PX, STICK_FIXED_CENTER_X, STICK_FIXED_CENTER_Y, STICK_RADIUS, TARGET_MARKER_MARGIN, TARGET_MARKER_RIGHT_MARGIN } from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { EdgeMarker } from './edge-marker';
import { EDGE_EPS_PX, avoidCorner, separateMarker, type MarkerRect, type MarkerShift } from './marker-separation';

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

  constructor(scene: Phaser.Scene, fitchJa: string, private readonly keepLeft: number, private readonly keepTop: number) {
    this.survivors = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.homeMarker, labelPrefix: RESCUE_SURVIVOR_MARKER_JA, stepM: RESCUE_SURVIVOR_MARKER_STEP_M, labelAbove: true, roundUp: true, topMargin: HOME_MARKER_TOP_MARGIN, color: SURVIVOR_LABEL_COLOR, tint: SURVIVOR_VEST_COLOR, labelInset: HUD_MARGIN });
    this.fitch = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.homeMarker, labelPrefix: fitchJa, stepM: RESCUE_FITCH_MARKER_STEP_M, labelAbove: true, roundUp: true, topMargin: HOME_MARKER_TOP_MARGIN, color: HOME_COLOR_TEXT, labelInset: HUD_MARGIN });
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
  }
}
