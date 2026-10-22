// HUD の画面端のマーカー 4 本（v0.6.4 で scenes/hud-scene から切り出し。中身はそのまま）: 敵（駆逐艦・大発・脅威の PT）・帰投地点・敵機（水上機・夜明けの空襲）・岸。
// 作る順と refresh の順は hud-scene にあったときと同じ（同じ depth の重なりを変えない）: hud-scene は燃料の目盛りの後に作り、update では燃料の後・夜明けの帯の前に refresh する。
import Phaser from 'phaser';
import { TEXTURE_KEYS } from '../config/game-config';
import { BARGE_MARKER_LABEL, COAST_MARKER_LABEL, COAST_MARKER_TEXT_COLOR } from '../config/hunt-config';
import type { PrototypeMission } from '../config/mission-data';
import { PT_MARKER_LABEL } from '../config/pt-config';
import {
  HOME_COLOR_TEXT,
  HOME_MARKER_DISTANCE_STEP_M,
  HOME_MARKER_TOP_MARGIN,
  HUD_COLOR_WARN,
  PLANE_DISTANCE_STEP_M,
  PLANE_MARKER_TOP_MARGIN,
  TARGET_MARKER_DISTANCE_STEP_M,
  TARGET_MARKER_TOP_MARGIN,
} from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { EdgeMarker } from './edge-marker';

export class HudMarkers {
  private targetMarker?: EdgeMarker;
  private homeMarker?: EdgeMarker;
  /** 敵機（v0.4.1 の水上機、v0.6.1 から夜明けの空襲の印の機も）。どちらかがある任務だけ。来ている間に画面外なら赤い矢印 */
  private planeMarker?: EdgeMarker;
  private coastMarker?: EdgeMarker;

  constructor(scene: Phaser.Scene, mission: PrototypeMission, telemetry: BoatTelemetry) {
    // 画面外マーカー: 敵は赤・50 m 刻み・ラベルは矢印の下（視程内だけ。大発の任務は「大発」、米PT の任務（v0.6.3）は脅威の PT を「PT」で、どちらも切り上げ＝2 行目と同じ距離）、帰投地点は青・100 m 刻み・ラベルは矢印の上（常に。画面内なら隠す）
    const guns = mission.mainWeapon === 'guns';
    this.targetMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.targetMarker, labelPrefix: mission.ptBoats ? PT_MARKER_LABEL : guns ? BARGE_MARKER_LABEL : '敵', stepM: TARGET_MARKER_DISTANCE_STEP_M, labelAbove: false, roundUp: guns || mission.ptBoats !== null, topMargin: TARGET_MARKER_TOP_MARGIN });
    this.homeMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.homeMarker, labelPrefix: '帰投', stepM: HOME_MARKER_DISTANCE_STEP_M, labelAbove: true, roundUp: true, topMargin: HOME_MARKER_TOP_MARGIN, color: HOME_COLOR_TEXT });
    // 岸のある任務（大発）: 砂色の「岸 N m」（浅瀬の縁が画面外の間。出発点から南へ 1,900 m。v0.4.2 の実機で、どこへ行けばよいか分からなかった）
    if (mission.coast) this.coastMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.coastMarker, labelPrefix: COAST_MARKER_LABEL, stepM: HOME_MARKER_DISTANCE_STEP_M, labelAbove: true, roundUp: true, topMargin: TARGET_MARKER_TOP_MARGIN, color: COAST_MARKER_TEXT_COLOR });
    if (telemetry.seaplaneEnabled || telemetry.dawn.strikeEnabled) this.planeMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.targetMarker, labelPrefix: '敵機', stepM: PLANE_DISTANCE_STEP_M, labelAbove: false, roundUp: true, topMargin: PLANE_MARKER_TOP_MARGIN, color: HUD_COLOR_WARN });
  }

  /** 毎フレーム（距離の刻みが変わったときだけ EdgeMarker が setText する） */
  refresh(telemetry: BoatTelemetry): void {
    this.targetMarker?.refresh(telemetry.enemyDx, telemetry.enemyDy, telemetry.enemySighted, telemetry);
    this.homeMarker?.refresh(telemetry.homeDx, telemetry.homeDy, !telemetry.atHome, telemetry, telemetry.homeEdgeM);
    this.planeMarker?.refresh(telemetry.planeDx, telemetry.planeDy, !Number.isNaN(telemetry.planeDx), telemetry);
    this.coastMarker?.refresh(telemetry.coastDx, telemetry.coastDy, !Number.isNaN(telemetry.coastDy), telemetry);
  }

  destroy(): void {
    this.targetMarker?.destroy();
    this.homeMarker?.destroy();
    this.planeMarker?.destroy();
    this.coastMarker?.destroy();
    this.targetMarker = undefined;
    this.homeMarker = undefined;
    this.planeMarker = undefined;
    this.coastMarker = undefined;
  }
}
