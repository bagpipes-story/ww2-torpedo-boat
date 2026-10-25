// HUD の画面端のマーカー 4 本（v0.6.4 で scenes/hud-scene から切り出し。中身はそのまま）: 敵（駆逐艦・大発・脅威の PT）・帰投地点・敵機（水上機・夜明けの空襲）・岸。
// 作る順と refresh の順は hud-scene にあったときと同じ（同じ depth の重なりを変えない）: hud-scene は燃料の目盛りの後に作り、update では燃料の後・夜明けの帯の前に refresh する。
// v0.6.4（jp_01）: 5 本目＝味方の大発の輸送隊（最寄りの航行中の大発へ青い「大発 N m」）。「岸」の矢印は大発を狩る任務（barges）だけ（輸送隊の任務は大発が浜へ向かうので要らない）。
// v0.6.6（jp_01 のハード）: 6 本目＝隼艇（生きていて決着の前の間に画面外なら僚艇の青い「隼艇 N m」。ラベルは矢印の下）。輸送隊の矢印の後に refresh し、縁で近ければ縁に沿ってずらす（ui/marker-separation。レビュー R6）。
import Phaser from 'phaser';
import { CONVOY_MARKER_LABEL, CONVOY_MARKER_STEP_M } from '../config/convoy-config';
import { GAME_HEIGHT, GAME_WIDTH, TEXTURE_KEYS } from '../config/game-config';
import { BARGE_MARKER_LABEL, COAST_MARKER_LABEL, COAST_MARKER_TEXT_COLOR } from '../config/hunt-config';
import type { PrototypeMission } from '../config/mission-data';
import { PT_MARKER_LABEL } from '../config/pt-config';
import {
  ESCORT_TEXT_COLOR,
  ESCORT_TINT,
  HOME_COLOR_TEXT,
  HOME_MARKER_DISTANCE_STEP_M,
  HUD_FONT_MARKER_PX,
  HOME_MARKER_TOP_MARGIN,
  HUD_COLOR_WARN,
  PLANE_DISTANCE_STEP_M,
  PLANE_MARKER_TOP_MARGIN,
  TARGET_MARKER_DISTANCE_STEP_M,
  TARGET_MARKER_MARGIN,
  TARGET_MARKER_RIGHT_MARGIN,
  TARGET_MARKER_TOP_MARGIN,
} from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { EdgeMarker } from './edge-marker';
import { separateMarker, type MarkerRect, type MarkerShift } from './marker-separation';

/** 味方の大発の矢印「大発 N m」（v0.6.4）の上端の余白: 敵機の矢印の下（帰投の矢印と同じく上にラベル。ui-config は 300 行を超えているのでここに置く） */
const CONVOY_MARKER_TOP_MARGIN = PLANE_MARKER_TOP_MARGIN + HUD_FONT_MARKER_PX + 20;
/** 隼艇の矢印（v0.6.6）を輸送隊の矢印から離す px（字 2 行ぶん）と、2 本が止まる縁の矩形（ui/edge-marker の縁。上端は同じ CONVOY_MARKER_TOP_MARGIN）・ずれの書き込み先（1 個だけ） */
const GUNBOAT_MARKER_SEP_PX = HUD_FONT_MARKER_PX * 2 + 8;
const CONVOY_MARKER_RECT: MarkerRect = { left: TARGET_MARKER_MARGIN, top: CONVOY_MARKER_TOP_MARGIN, right: GAME_WIDTH - TARGET_MARKER_RIGHT_MARGIN, bottom: GAME_HEIGHT - TARGET_MARKER_MARGIN };
const shift: MarkerShift = { dx: 0, dy: 0 };

export class HudMarkers {
  private targetMarker?: EdgeMarker;
  private homeMarker?: EdgeMarker;
  /** 敵機（v0.4.1 の水上機、v0.6.1 から夜明けの空襲の印の機も）。どちらかがある任務だけ。来ている間に画面外なら赤い矢印 */
  private planeMarker?: EdgeMarker;
  private coastMarker?: EdgeMarker;
  /** 味方の大発（v0.6.4。輸送隊の任務だけ）: 最寄りの航行中の大発が画面外のとき青い「大発 N m」（100 m 刻み・切り上げ・矢印の上） */
  private convoyMarker?: EdgeMarker;
  /** 隼艇（v0.6.6。jp_01 のハードだけ）: 生きていて決着の前に画面外なら「隼艇 N m」（100 m 刻み・切り上げ・矢印の下・僚艇の青） */
  private gunboatMarker?: EdgeMarker;

  constructor(scene: Phaser.Scene, mission: PrototypeMission, telemetry: BoatTelemetry) {
    // 画面外マーカー: 敵は赤・50 m 刻み・ラベルは矢印の下（視程内だけ。大発の任務は「大発」、米PT の任務（v0.6.3）は脅威の PT を「PT」で、どちらも切り上げ＝2 行目と同じ距離）、帰投地点は青・100 m 刻み・ラベルは矢印の上（常に。画面内なら隠す）
    const guns = mission.mainWeapon === 'guns';
    this.targetMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.targetMarker, labelPrefix: mission.ptBoats ? PT_MARKER_LABEL : guns ? BARGE_MARKER_LABEL : '敵', stepM: TARGET_MARKER_DISTANCE_STEP_M, labelAbove: false, roundUp: guns || mission.ptBoats !== null, topMargin: TARGET_MARKER_TOP_MARGIN });
    this.homeMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.homeMarker, labelPrefix: '帰投', stepM: HOME_MARKER_DISTANCE_STEP_M, labelAbove: true, roundUp: true, topMargin: HOME_MARKER_TOP_MARGIN, color: HOME_COLOR_TEXT });
    // 岸のある任務（大発）: 砂色の「岸 N m」（浅瀬の縁が画面外の間。出発点から南へ 1,900 m。v0.4.2 の実機で、どこへ行けばよいか分からなかった）
    if (mission.coast && mission.barges) this.coastMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.coastMarker, labelPrefix: COAST_MARKER_LABEL, stepM: HOME_MARKER_DISTANCE_STEP_M, labelAbove: true, roundUp: true, topMargin: TARGET_MARKER_TOP_MARGIN, color: COAST_MARKER_TEXT_COLOR });
    if (mission.convoy) this.convoyMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.homeMarker, labelPrefix: CONVOY_MARKER_LABEL, stepM: CONVOY_MARKER_STEP_M, labelAbove: true, roundUp: true, topMargin: CONVOY_MARKER_TOP_MARGIN, color: HOME_COLOR_TEXT });
    if (telemetry.gunboat.enabled) this.gunboatMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.homeMarker, labelPrefix: telemetry.gunboat.labelJa, stepM: CONVOY_MARKER_STEP_M, labelAbove: false, roundUp: true, topMargin: CONVOY_MARKER_TOP_MARGIN, color: ESCORT_TEXT_COLOR, tint: ESCORT_TINT });
    if (telemetry.seaplaneEnabled || telemetry.dawn.strikeEnabled) this.planeMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.targetMarker, labelPrefix: '敵機', stepM: PLANE_DISTANCE_STEP_M, labelAbove: false, roundUp: true, topMargin: PLANE_MARKER_TOP_MARGIN, color: HUD_COLOR_WARN });
  }

  /** 毎フレーム（距離の刻みが変わったときだけ EdgeMarker が setText する） */
  refresh(telemetry: BoatTelemetry): void {
    this.targetMarker?.refresh(telemetry.enemyDx, telemetry.enemyDy, telemetry.enemySighted, telemetry);
    this.homeMarker?.refresh(telemetry.homeDx, telemetry.homeDy, !telemetry.atHome, telemetry, telemetry.homeEdgeM);
    this.planeMarker?.refresh(telemetry.planeDx, telemetry.planeDy, !Number.isNaN(telemetry.planeDx), telemetry);
    this.coastMarker?.refresh(telemetry.coastDx, telemetry.coastDy, !Number.isNaN(telemetry.coastDy), telemetry);
    this.convoyMarker?.refresh(telemetry.convoy.nearestDx, telemetry.convoy.nearestDy, !Number.isNaN(telemetry.convoy.nearestDx), telemetry, telemetry.convoy.nearestM); // 平方根は convoy-telemetry の 1 回（レビュー neutral:N2）
    const gb = telemetry.gunboat;
    const gm = this.gunboatMarker;
    if (!gm) return;
    gm.refresh(gb.dx, gb.dy, !gb.sunk && !gb.resolved, telemetry, gb.distM); // 平方根は隼艇のテレメトリの 1 回
    const cm = this.convoyMarker;
    if (cm && cm.isShown && gm.isShown) gm.nudge(separateMarker(cm.shownX, cm.shownY, gm.shownX, gm.shownY, CONVOY_MARKER_RECT, GUNBOAT_MARKER_SEP_PX, shift).dx, shift.dy);
  }

  destroy(): void {
    this.targetMarker?.destroy();
    this.homeMarker?.destroy();
    this.planeMarker?.destroy();
    this.coastMarker?.destroy();
    this.convoyMarker?.destroy();
    this.gunboatMarker?.destroy();
    this.targetMarker = undefined;
    this.homeMarker = undefined;
    this.planeMarker = undefined;
    this.coastMarker = undefined;
    this.convoyMarker = undefined;
    this.gunboatMarker = undefined;
  }
}
