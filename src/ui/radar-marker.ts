// 緑の端の印「レーダー N m」（v0.8.0 S4。spec-v0800 §4.9・§3.2 D-R10・§4.10、brief L27）: 画面の外で目の届く距離より遠い一番近い輝点（ui/radar-marker-pick）へ、画面の縁から緑の矢印。
// ラベルは矢印の下・100 m 刻みの切り上げ（ui/edge-marker が刻みの変わった時だけ setText）。帰投・敵・敵機の印と縁で近ければ縁に沿って離し（ui/marker-separation）、
// 右下の速力と兵装の角を避け（avoidCorner）、右の縁ではラベルの広い分だけ左へ寄せる（右端の技能の列は今の印と同じ右の余白 W − 352 で避ける）。
// レーダーのある任務（t.radar.enabled）だけ ui/hud-markers が作る（ほかの任務は作らない＝絵の数も作る順も今のまま）。§7: 確保は constructor だけ（毎フレームは out に書くだけ）。
import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/game-config';
import { RADAR_MARKER_TEX_KEY } from '../config/radar-art-config';
import {
  RADAR_MARKER_LABEL_INSET_PX, RADAR_MARKER_LABEL_JA, RADAR_MARKER_RIGHT_EXTRA_PX, RADAR_MARKER_SAME_SHIP_M, RADAR_MARKER_SEP_PX, RADAR_MARKER_STEP_M, RADAR_MARKER_TEXT_COLOR,
} from '../config/strait-hud-config';
import { CAMERA_LOOK_AHEAD_M, TARGET_MARKER_MARGIN, TARGET_MARKER_RIGHT_MARGIN, TARGET_MARKER_TOP_MARGIN } from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-telemetry';
import { EdgeMarker } from './edge-marker';
import { avoidCorner, separateMarker, type MarkerRect, type MarkerShift } from './marker-separation';
import { pickRadarEdgeBlip, radarRightEdgeShift, type RadarPick, type RadarPickScreen } from './radar-marker-pick';

/** 緑の印が止まる縁の矩形（赤い「敵」の印と同じ上の余白・ラベルは矢印の下） */
const RADAR_MARKER_RECT: MarkerRect = { left: TARGET_MARKER_MARGIN, top: TARGET_MARKER_TOP_MARGIN, right: GAME_WIDTH - TARGET_MARKER_RIGHT_MARGIN, bottom: GAME_HEIGHT - TARGET_MARKER_MARGIN };
const SCREEN: RadarPickScreen = { cx: GAME_WIDTH / 2, cy: GAME_HEIGHT / 2, topMargin: TARGET_MARKER_TOP_MARGIN, sideMargin: TARGET_MARKER_MARGIN, lookAheadM: CAMERA_LOOK_AHEAD_M };

export class RadarEdgeMarker {
  private readonly m: EdgeMarker;
  private readonly pick: RadarPick = { dx: NaN, dy: NaN, d2: Infinity };
  private readonly shift: MarkerShift = { dx: 0, dy: 0 };

  constructor(scene: Phaser.Scene) {
    this.m = new EdgeMarker(scene, {
      textureKey: RADAR_MARKER_TEX_KEY, labelPrefix: RADAR_MARKER_LABEL_JA, stepM: RADAR_MARKER_STEP_M, labelAbove: false, roundUp: true,
      topMargin: TARGET_MARKER_TOP_MARGIN, color: RADAR_MARKER_TEXT_COLOR, labelInset: RADAR_MARKER_LABEL_INSET_PX,
    });
  }

  /**
   * 毎フレーム（ほかの印の refresh の後）: 輝点を選び、縁に置き、出ている印（others。作る時に 1 回組んだ配列）から離し、角を避け、右の縁なら左へ寄せる。keepLeft・keepTop は右下の速力の HUD の塊の左上（ui/hud-markers）。
   * 距離の平方根は印を出す時だけ 1 本
   */
  refresh(t: BoatTelemetry, others: readonly (EdgeMarker | undefined)[], keepLeft: number, keepTop: number): void {
    const seen = t.enemySighted; // 赤い「敵 N m」の艦（目で見えている最寄りの艦）の古い輝点は緑にしない
    const p = pickRadarEdgeBlip(t.radar, t.strait.eyeRange2, seen ? t.enemyDx : NaN, seen ? t.enemyDy : NaN, RADAR_MARKER_SAME_SHIP_M, t.headingDeg, t.cameraZoom, SCREEN, this.pick);
    const show = !Number.isNaN(p.dx);
    const m = this.m;
    m.refresh(p.dx, p.dy, show, t, show ? Math.sqrt(p.d2) : undefined);
    if (!m.isShown) return;
    const sh = this.shift;
    for (let i = 0; i < others.length; i++) {
      const o = others[i];
      if (o && o.isShown) m.nudge(separateMarker(o.shownX, o.shownY, m.shownX, m.shownY, RADAR_MARKER_RECT, RADAR_MARKER_SEP_PX, sh).dx, sh.dy);
    }
    m.nudge(avoidCorner(m.shownX, m.shownY, RADAR_MARKER_RECT, keepLeft - RADAR_MARKER_RIGHT_EXTRA_PX, keepTop, sh).dx, sh.dy); // 下の縁でもラベルの広い分だけ左で止める
    m.nudge(radarRightEdgeShift(m.shownX, RADAR_MARKER_RECT, RADAR_MARKER_RIGHT_EXTRA_PX, sh).dx, 0);
  }

  destroy(): void {
    this.m.destroy();
  }
}
