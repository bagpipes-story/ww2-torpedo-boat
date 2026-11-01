// HUD の画面端のマーカー（v0.6.4 で scenes/hud-scene から切り出し。中身はそのまま）: 敵（駆逐艦・大発・脅威の PT）・帰投地点・敵機（水上機・夜明けの空襲）・岸。
// 作る順と refresh の順は hud-scene にあったときと同じ（同じ depth の重なりを変えない）: hud-scene は燃料の目盛りの後に作り、update では燃料の後・夜明けの帯の前に refresh する。
// v0.6.4（jp_01）: 5 本目＝味方の大発の輸送隊（最寄りの航行中の大発へ青い「大発 N m」）。「岸」の矢印は大発を狩る任務（barges）だけ（輸送隊の任務は大発が浜へ向かうので要らない）。
// v0.6.6（jp_01 のハード）: 6 本目＝隼艇（生きていて決着の前の間に画面外なら僚艇の青い「隼艇 N m」。ラベルは矢印の下）。輸送隊の矢印の後に refresh し、縁で近ければ縁に沿ってずらす（ui/marker-separation。レビュー R6）。
// 隼艇の矢印の「画面の内」は本当の画面の矩形で、隼艇の絵が出ている（自艇の視程の内）間だけ（hideMargin 0・drawn＝inSight。上の余白 293 px のままだと画面の上 4 割に見えている隼艇にも矢印が出た。レビュー ux:ux-1）。
// v0.6.7 レビュー（夜の哨戒機の任務だけ。ほかの任務の矢印は今のまま）: 「敵機 N m」の距離は µm に丸めた hypot（ux:ux-2）、右下の速力の HUD に乗れば縁に沿ってずらす（ux:ux-5）。
// v0.6.9 S6b（揚陸の任務 jp_04 だけ。ほかの任務は作らない＝矢印の数・作る順・refresh は今のまま）: 7・8 本目＝「雷撃 N m」（赤。見張りの報告の PT が画面の外か、視程の外で海の上の ▼ の立てない所＝
// 上の HUD の帯・右端の技能のボタン・兵装の下。▼ が出ていれば出さない。F12: 視程の内の脅威の PT なら出さない）と
// 「輸送 N m」（味方の青。輸送船が画面の外で揚陸の決着の前）。決まりは ui/landing-markers。どちらも右下の速力と兵装の HUD の角を避け、近い印から縁に沿ってずらす（雷撃は「PT」から、輸送は雷撃と帰投から）。
import Phaser from 'phaser';
import { CONVOY_MARKER_LABEL, CONVOY_MARKER_STEP_M } from '../config/convoy-config';
import { GAME_HEIGHT, GAME_WIDTH, HUD_MARGIN, TEXTURE_KEYS } from '../config/game-config';
import { BARGE_MARKER_LABEL, COAST_MARKER_LABEL, COAST_MARKER_TEXT_COLOR } from '../config/hunt-config';
import type { PrototypeMission } from '../config/mission-data';
import { LANDING_RUNNER_MARKER_LABEL, LANDING_SHIP_MARKER_LABEL } from '../config/landing-config';
import { PT_MARKER_LABEL } from '../config/pt-config';
import {
  ESCORT_TEXT_COLOR,
  ESCORT_TINT,
  HOME_COLOR_TEXT,
  HOME_MARKER_DISTANCE_STEP_M,
  HUD_FONT_MARKER_PX,
  HOME_MARKER_TOP_MARGIN,
  HUD_COLOR_WARN,
  HUD_FONT_HEADING_PX,
  HUD_HEADING_OFFSET_Y,
  HUD_TEXT_GAP,
  PLANE_DISTANCE_STEP_M,
  PLANE_MARKER_TOP_MARGIN,
  TARGET_MARKER_DISTANCE_STEP_M,
  TARGET_MARKER_MARGIN,
  TARGET_MARKER_RIGHT_MARGIN,
  TARGET_MARKER_SIZE,
  TARGET_MARKER_TOP_MARGIN,
  RUDDER_BAR_HALF_WIDTH,
  RUDDER_MARKER_HEIGHT,
  SPEED_HUD_RIGHT_X,
} from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { LANDING_DIST_STEP_M } from '../core/landing';
import { EdgeMarker } from './edge-marker';
import { snappedDistM } from './edge-marker-screen';
import { landingRunnerMarkerShown, landingShipMarkerShown, separateLandingMarker } from './landing-markers';
import { avoidCorner, separateMarker, type MarkerRect, type MarkerShift } from './marker-separation';

/** 味方の大発の矢印「大発 N m」（v0.6.4）の上端の余白: 敵機の矢印の下（帰投の矢印と同じく上にラベル。ui-config は 300 行を超えているのでここに置く） */
const CONVOY_MARKER_TOP_MARGIN = PLANE_MARKER_TOP_MARGIN + HUD_FONT_MARKER_PX + 20;
/** 隼艇の矢印（v0.6.6）を輸送隊の矢印から離す px（字 2 行ぶん）と、2 本が止まる縁の矩形（ui/edge-marker の縁。上端は同じ CONVOY_MARKER_TOP_MARGIN）・ずれの書き込み先（1 個だけ） */
const GUNBOAT_MARKER_SEP_PX = HUD_FONT_MARKER_PX * 2 + 8;
const CONVOY_MARKER_RECT: MarkerRect = { left: TARGET_MARKER_MARGIN, top: CONVOY_MARKER_TOP_MARGIN, right: GAME_WIDTH - TARGET_MARKER_RIGHT_MARGIN, bottom: GAME_HEIGHT - TARGET_MARKER_MARGIN };
const shift: MarkerShift = { dx: 0, dy: 0 };
/** 夜の哨戒機の矢印（v0.6.7 レビュー ux:ux-5）が避ける右下の速力の HUD（ui/boat-hud の舵のバー・速力・段・針路の塊）の左と上。左はラベルの半分と矢印の分（字 4 つ）、上はラベルが矢印の下に出る分（字 3 行）の余白込み */
const SPEED_HUD_KEEP_LEFT = SPEED_HUD_RIGHT_X - RUDDER_BAR_HALF_WIDTH * 2 - HUD_FONT_MARKER_PX * 4;
export const SPEED_HUD_KEEP_TOP = GAME_HEIGHT - HUD_MARGIN - RUDDER_MARKER_HEIGHT - HUD_TEXT_GAP - HUD_HEADING_OFFSET_Y - HUD_FONT_HEADING_PX - HUD_FONT_MARKER_PX * 3;
/** 速力の表示（針路の文）の上端（v0.6.9 S6b。端の印の避ける角の上端から字 3 行ぶん下。輸送船の字が避ける＝systems/world-landing） */
export const SPEED_HUD_TOP = SPEED_HUD_KEEP_TOP + HUD_FONT_MARKER_PX * 3;
const PLANE_MARKER_RECT: MarkerRect = { left: TARGET_MARKER_MARGIN, top: PLANE_MARKER_TOP_MARGIN, right: GAME_WIDTH - TARGET_MARKER_RIGHT_MARGIN, bottom: GAME_HEIGHT - TARGET_MARKER_MARGIN };
/**
 * 上の HUD の帯の下端（v0.6.9 S6b）: 端の印の矢印の上端（TARGET_MARKER_TOP_MARGIN − 三角の半分）。ビルド番号・2・3 行目・左上の時計・HP・燃料計（下端 166）・右上の揚陸の時計はその上。
 * 海の上の ▼ と輸送船の字はこの帯に重ねない（systems/world-landing）
 */
export const HUD_TOP_BAND_BOTTOM = TARGET_MARKER_TOP_MARGIN - TARGET_MARKER_SIZE / 2;
/** 揚陸の任務の 2 本（v0.6.9 S6b）が止まる縁の矩形: 「雷撃」は「PT」と同じ上端（ラベルは矢印の下）、「輸送」は輸送隊の矢印の段（jp_04 に輸送隊は無い。ラベルは矢印の下＝帰投のラベル（上）と逆の側） */
const RUNNER_MARKER_RECT: MarkerRect = { left: TARGET_MARKER_MARGIN, top: TARGET_MARKER_TOP_MARGIN, right: GAME_WIDTH - TARGET_MARKER_RIGHT_MARGIN, bottom: GAME_HEIGHT - TARGET_MARKER_MARGIN };
const SHIP_MARKER_RECT: MarkerRect = { left: TARGET_MARKER_MARGIN, top: CONVOY_MARKER_TOP_MARGIN, right: GAME_WIDTH - TARGET_MARKER_RIGHT_MARGIN, bottom: GAME_HEIGHT - TARGET_MARKER_MARGIN };

export class HudMarkers {
  private targetMarker?: EdgeMarker;
  private homeMarker?: EdgeMarker;
  /** 敵機（v0.4.1 の水上機、v0.6.1 から夜明けの空襲の印の機も、v0.6.7 から夜の哨戒機も）。どれかがある任務だけ（?debug&nostrike の jp_02 でも夜の機）。来ている間に画面外なら赤い矢印 */
  private planeMarker?: EdgeMarker;
  private coastMarker?: EdgeMarker;
  /** 味方の大発（v0.6.4。輸送隊の任務だけ）: 最寄りの航行中の大発が画面外のとき青い「大発 N m」（100 m 刻み・切り上げ・矢印の上） */
  private convoyMarker?: EdgeMarker;
  /** 隼艇（v0.6.6。jp_01 のハードだけ）: 生きていて決着の前に画面外なら「隼艇 N m」（100 m 刻み・切り上げ・矢印の下・僚艇の青） */
  private gunboatMarker?: EdgeMarker;
  /** 揚陸の任務（v0.6.9 S6b。jp_04 だけ）: 見張りの報告の PT「雷撃 N m」（赤・100 m 刻み・切り上げ・矢印の下。海の上の ▼ が出ていれば出さない。視程の内の PT は画面の内か縁から TARGET_MARKER_MARGIN の内なら隠し、視程の外の PT は画面の内でも ▼ の立てない所＝上の HUD の帯・右端の技能のボタン・兵装の下なら縁から指す）と輸送船「輸送 N m」（味方の青・同じ刻み・矢印の下。本当の画面の矩形の内なら隠す＝大きな船体が見えている間は出さない。縁から 56 px にすると、右の縁のすぐ内に見えている船へ W − 352 の縁から矢印が向いた） */
  private runnerMarker?: EdgeMarker;
  private shipMarker?: EdgeMarker;

  constructor(scene: Phaser.Scene, mission: PrototypeMission, telemetry: BoatTelemetry) {
    // 画面外マーカー: 敵は赤・50 m 刻み・ラベルは矢印の下（視程内だけ。大発の任務は「大発」、米PT の任務（v0.6.3）は脅威の PT を「PT」で、どちらも切り上げ＝2 行目と同じ距離）、帰投地点は青・100 m 刻み・ラベルは矢印の上（常に。画面内なら隠す）
    const guns = mission.mainWeapon === 'guns';
    this.targetMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.targetMarker, labelPrefix: mission.ptBoats ? PT_MARKER_LABEL : guns ? BARGE_MARKER_LABEL : '敵', stepM: TARGET_MARKER_DISTANCE_STEP_M, labelAbove: false, roundUp: guns || mission.ptBoats !== null, topMargin: TARGET_MARKER_TOP_MARGIN });
    this.homeMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.homeMarker, labelPrefix: '帰投', stepM: HOME_MARKER_DISTANCE_STEP_M, labelAbove: true, roundUp: true, topMargin: HOME_MARKER_TOP_MARGIN, color: HOME_COLOR_TEXT });
    // 岸のある任務（大発）: 砂色の「岸 N m」（浅瀬の縁が画面外の間。出発点から南へ 1,900 m。v0.4.2 の実機で、どこへ行けばよいか分からなかった）
    if (mission.coast && mission.barges) this.coastMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.coastMarker, labelPrefix: COAST_MARKER_LABEL, stepM: HOME_MARKER_DISTANCE_STEP_M, labelAbove: true, roundUp: true, topMargin: TARGET_MARKER_TOP_MARGIN, color: COAST_MARKER_TEXT_COLOR });
    if (mission.convoy) this.convoyMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.homeMarker, labelPrefix: CONVOY_MARKER_LABEL, stepM: CONVOY_MARKER_STEP_M, labelAbove: true, roundUp: true, topMargin: CONVOY_MARKER_TOP_MARGIN, color: HOME_COLOR_TEXT });
    if (telemetry.gunboat.enabled) this.gunboatMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.homeMarker, labelPrefix: telemetry.gunboat.labelJa, stepM: CONVOY_MARKER_STEP_M, labelAbove: false, roundUp: true, topMargin: CONVOY_MARKER_TOP_MARGIN, color: ESCORT_TEXT_COLOR, tint: ESCORT_TINT, hideMargin: 0 });
    if (telemetry.seaplaneEnabled || telemetry.dawn.strikeEnabled || telemetry.patrol.enabled) this.planeMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.targetMarker, labelPrefix: '敵機', stepM: PLANE_DISTANCE_STEP_M, labelAbove: false, roundUp: true, topMargin: PLANE_MARKER_TOP_MARGIN, color: HUD_COLOR_WARN });
    if (!telemetry.landing.enabled) return;
    this.runnerMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.targetMarker, labelPrefix: LANDING_RUNNER_MARKER_LABEL, stepM: LANDING_DIST_STEP_M, labelAbove: false, roundUp: true, topMargin: TARGET_MARKER_TOP_MARGIN, color: HUD_COLOR_WARN, hideMargin: TARGET_MARKER_MARGIN });
    this.shipMarker = new EdgeMarker(scene, { textureKey: TEXTURE_KEYS.homeMarker, labelPrefix: LANDING_SHIP_MARKER_LABEL, stepM: LANDING_DIST_STEP_M, labelAbove: false, roundUp: true, topMargin: CONVOY_MARKER_TOP_MARGIN, color: ESCORT_TEXT_COLOR, tint: ESCORT_TINT, hideMargin: 0 });
  }

  /** 毎フレーム（距離の刻みが変わったときだけ EdgeMarker が setText する） */
  refresh(telemetry: BoatTelemetry): void {
    this.targetMarker?.refresh(telemetry.enemyDx, telemetry.enemyDy, telemetry.enemySighted, telemetry);
    this.homeMarker?.refresh(telemetry.homeDx, telemetry.homeDy, !telemetry.atHome, telemetry, telemetry.homeEdgeM);
    const pm = this.planeMarker;
    const pdx = telemetry.planeDx;
    const patrol = telemetry.patrol.enabled;
    pm?.refresh(pdx, telemetry.planeDy, !Number.isNaN(pdx), telemetry, patrol && !Number.isNaN(pdx) ? snappedDistM(pdx, telemetry.planeDy) : undefined);
    if (pm && patrol && pm.isShown) pm.nudge(avoidCorner(pm.shownX, pm.shownY, PLANE_MARKER_RECT, SPEED_HUD_KEEP_LEFT, SPEED_HUD_KEEP_TOP, shift).dx, shift.dy);
    this.coastMarker?.refresh(telemetry.coastDx, telemetry.coastDy, !Number.isNaN(telemetry.coastDy), telemetry);
    this.convoyMarker?.refresh(telemetry.convoy.nearestDx, telemetry.convoy.nearestDy, !Number.isNaN(telemetry.convoy.nearestDx), telemetry, telemetry.convoy.nearestM); // 平方根は convoy-telemetry の 1 回（レビュー neutral:N2）
    if (this.shipMarker) this.refreshLanding(telemetry); // 揚陸の任務だけ（v0.6.9 S6b）
    const gb = telemetry.gunboat;
    const gm = this.gunboatMarker;
    if (!gm) return;
    gm.refresh(gb.dx, gb.dy, !gb.sunk && !gb.resolved, telemetry, gb.distM, gb.inSight); // 平方根は隼艇のテレメトリの 1 回
    const cm = this.convoyMarker;
    if (cm && cm.isShown && gm.isShown) gm.nudge(separateMarker(cm.shownX, cm.shownY, gm.shownX, gm.shownY, CONVOY_MARKER_RECT, GUNBOAT_MARKER_SEP_PX, shift).dx, shift.dy);
  }

  /**
   * 揚陸の任務の 2 本（v0.6.9 S6b）: 「雷撃」→ 角を避ける → 「PT」から離す、「輸送」→ 角を避ける → 「雷撃」から離す → 「帰投」から離す（距離の平方根は「輸送」は landing-telemetry の 1 回、
   * 「雷撃」は出ている間だけ edge-marker の hypot 1 回）
   */
  private refreshLanding(t: BoatTelemetry): void {
    const l = t.landing;
    const rm = this.runnerMarker!;
    const sm = this.shipMarker!;
    rm.refresh(l.reportDx, l.reportDy, landingRunnerMarkerShown(l), t, undefined, l.reportSighted); // 視程の外（絵が無い）なら画面の内でも ▼ の立てない所は縁から指す
    if (rm.isShown) {
      rm.nudge(avoidCorner(rm.shownX, rm.shownY, RUNNER_MARKER_RECT, SPEED_HUD_KEEP_LEFT, SPEED_HUD_KEEP_TOP, shift).dx, shift.dy);
      const tm = this.targetMarker;
      if (tm && tm.isShown) rm.nudge(separateLandingMarker(tm.shownX, tm.shownY, rm.shownX, rm.shownY, RUNNER_MARKER_RECT, SPEED_HUD_KEEP_LEFT, SPEED_HUD_KEEP_TOP, shift).dx, shift.dy);
    }
    sm.refresh(l.shipDx, l.shipDy, landingShipMarkerShown(l), t, l.shipDistM);
    if (!sm.isShown) return;
    sm.nudge(avoidCorner(sm.shownX, sm.shownY, SHIP_MARKER_RECT, SPEED_HUD_KEEP_LEFT, SPEED_HUD_KEEP_TOP, shift).dx, shift.dy);
    if (rm.isShown) sm.nudge(separateLandingMarker(rm.shownX, rm.shownY, sm.shownX, sm.shownY, SHIP_MARKER_RECT, SPEED_HUD_KEEP_LEFT, SPEED_HUD_KEEP_TOP, shift).dx, shift.dy);
    const hm = this.homeMarker;
    if (hm && hm.isShown) sm.nudge(separateLandingMarker(hm.shownX, hm.shownY, sm.shownX, sm.shownY, SHIP_MARKER_RECT, SPEED_HUD_KEEP_LEFT, SPEED_HUD_KEEP_TOP, shift).dx, shift.dy);
  }

  destroy(): void {
    this.targetMarker?.destroy();
    this.homeMarker?.destroy();
    this.planeMarker?.destroy();
    this.coastMarker?.destroy();
    this.convoyMarker?.destroy();
    this.gunboatMarker?.destroy();
    this.runnerMarker?.destroy();
    this.shipMarker?.destroy();
    this.targetMarker = undefined;
    this.homeMarker = undefined;
    this.planeMarker = undefined;
    this.coastMarker = undefined;
    this.convoyMarker = undefined;
    this.gunboatMarker = undefined;
    this.runnerMarker = undefined;
    this.shipMarker = undefined;
  }
}
