// Result: 命中数・距離帯別の命中・駆逐艦の状態・帰投・燃料・出撃前の空襲・夜明け（v0.6.1）を表示する（docs/02 §4）。終了理由の型は core/mission-flow、見出しの文は ui/result-heading.ts（v0.6.1 で切り出し）、夜明けの行は ui/dawn-lines.ts。
// 「もう一度」は同じ任務の Briefing へ新しい seed で（?debug 直行では Mission へ）、「任務一覧」は Title へ（v0.4.0）。
import Phaser from 'phaser';
import { DEBUG_DIRECT_MISSION, DEBUG_RAID_OVERRIDE, DEPTH, GAME_HEIGHT, GAME_WIDTH, HUD_MARGIN, REGISTRY_KEY_DATA, REGISTRY_KEY_PENDING_SORTIE, RENDER_SCALE, SCENE_KEYS, sortieSeed } from '../config/game-config';
import { getGameData, getScoringParams } from '../config/game-data';
import { MENU_PRIMARY_W, MENU_PRIMARY_X, RESULT_BUTTON_H, RESULT_BUTTON_PX, RESULT_BUTTON_Y, RESULT_CAMPAIGN_KPI_JA, RESULT_HISTORICAL_KPI_JA, RESULT_LIST_JA, RESULT_LIST_X, RESULT_RETRY_JA, RESULT_RETRY_SUB_JA } from '../config/menu-config';
import { computeScore } from '../core/scoring';
import type { DawnResult } from '../core/dawn-air';
import {
  HUD_COLOR_KPI,
  HUD_COLOR_STRONG,
  HUD_FONT_HEADING_PX,
  HUD_FONT_SPEED_PX,
  HUD_FONT_STATUS_PX,
  HUD_FONT_STEP_PX,
  RESULT_INPUT_DELAY_MS,
  RESULT_LINE_GAP,
  RESULT_SECTION_GAP,
  RESULT_SEED_Y,
  RESULT_TOP_Y,
  HOME_MARKER_DISTANCE_STEP_M,
  hudTextStyle,
} from '../config/ui-config';
import { FF_IDLE, FF_OUT_GAVE_UP, FF_OUT_IDENTIFIED } from '../core/friendly';
import type { BandSummary, ShotRecord } from '../core/hit-rate';
import type { MissionEndReason } from '../core/mission-flow';
import type { KpiResultLines } from '../systems/kpi-storage';
import { bargeResultLines, escortResultLine, seaplaneResultLine } from '../ui/hud-lines';
import { resultDawnSuffixS, resultEvadePartJa, resultHeadingJa, resultShipsJa } from '../ui/result-heading';
import { dawnResultLine } from '../ui/dawn-lines';
import { directSortie, isSortie, type BriefingInit, type Sortie } from '../core/sortie';
import { MenuButton, addBuildLabel } from '../ui/menu-ui';

export type { MissionEndReason } from '../core/mission-flow';

/** 輸送船の enemies.json の id（scoring.json の kill.points_by_enemy のキー。v0.4.7） */
const TRANSPORT_ENEMY_ID = 'ijn_transport';

export interface MissionResult {
  reason: MissionEndReason;
  /** 任務の種類（scoring.json の達成点） */
  missionType: string;
  shots: ShotRecord[];
  bands: BandSummary[];
  /** 通算の命中率（正しく狙った 1 本。v0.5.0）。Mission の終わりに 1 回だけ記録して作る（魚雷の任務だけ。大発の任務は null） */
  kpi: KpiResultLines | null;
  hits: number;
  duds: number;
  misses: number;
  capacity: number;
  destroyerSunk: boolean;
  /** 駆逐艦の隊（v0.4.5）: 沈み始めた隻数と隻数（駆逐艦のいない任務は 0） */
  shipsSunk: number;
  shipsTotal: number;
  /** 輸送船（v0.4.7）: 任務にいる、沈めた（撃破 400） */
  transportEnabled: boolean;
  transportSunk: boolean;
  /** 帰投地点の輪に入って終わった（生還。夜明けの後の帰投も含む）。漂流・沈没・座礁は false */
  returned: boolean;
  elapsedS: number;
  seed: number;
  /** 艇の残り HP と最大 HP（docs/02 §6.6） */
  hpLeft: number;
  hpMax: number;
  /** 燃料の残り %（ceil）と、初めて発射したときの残り %（未発射なら NaN）。割当を調整するための実機の記録（docs/02 §6.7） */
  fuelLeftPct: number;
  fuelAtFirstLaunchPct: number;
  /** 帰投地点の輪の縁までの距離 m（帰投していれば 0。帰投していないのに 0 なら、輪の中で魚雷の決着を待つ間に沈んだ） */
  ringDistM: number;
  /** 味方機（docs/02 §6.8、v0.3.3）: 任務にいるか、段階・結果・撃たれた回数（core/friendly の FF_*）、識別までの秒とそのときの猶予（押していなければ NaN）。猶予を調整するための実機の記録 */
  friendlyEnabled: boolean;
  friendlyPhase: number;
  friendlyOutcome: number;
  friendlyPasses: number;
  friendlyReactS: number;
  friendlyPeriodS: number;
  /** 乗員（v0.3.4）: 生存と定員（HP から決まる） */
  crewAlive: number;
  crewTotal: number;
  /** v0.3.5: 乗員の減りによる旋回率・加速の倍率と消火の長押し秒（Result の説明用） */
  crewTurnFactor: number;
  crewAccelFactor: number;
  extinguishHoldS: number;
  /** 暴風（v0.3.4）: 任務にあるか、安全速力 kt、帯の中にいた秒、安全速力を超えていた秒、中の平均 kt（NaN なら入らず）、叩きつけの回数と被害 */
  stormEnabled: boolean;
  stormSafeKt: number;
  stormInsideS: number;
  stormOverS: number;
  stormMeanKt: number;
  stormSlams: number;
  stormSlamDamage: number;
  /** 敵の水上機（v0.4.1。core/seaplane の SP_*）: 任務にいるか、段階・結果、接近と見失わせた回数、減速までの秒（NaN なら無し）、照明弾の下にいた秒とその間の砲撃数、落とした爆弾と命中、各爆弾の転舵までの秒（NaN なら転舵なし）。猶予と散布を調整するための実機の記録 */
  seaplaneEnabled: boolean;
  seaplanePhase: number;
  seaplaneOutcome: number;
  seaplaneAttacked: boolean;
  seaplaneSorties: number;
  seaplaneLost: number;
  seaplaneSlowReactS: number;
  seaplaneFlareLitS: number;
  seaplaneShellsUnderFlare: number;
  seaplaneBombs: number;
  seaplaneBombHits: number;
  seaplaneDodgeS: number[];
  /** 任務の目標を達した（駆逐艦の撃沈／大発のノルマ。v0.4.2 で destroyerSunk から分けた） */
  objectiveDone: boolean;
  /** 大発掃討（v0.4.2）の記録。任務に大発がいなければ null */
  hunt: BargeResult | null;
  /** 僚艇（v0.4.4）の記録。任務に僚艇がいなければ null。detections は駆逐艦に見つかった回数（回避の点の根拠。駆逐艦のいない任務は 0） */
  escort: EscortResult | null;
  detections: number;
  /** 出撃（v0.4.0。「もう一度」の任務と再現用） */
  sortie: Sortie;
  /** 「出撃前」の行（空襲の無い任務は空。空なら出さない） */
  raidLine: string;
  dawn: DawnResult; // 夜明け（v0.6.1。systems/dawn-telemetry の dawnResult）: ラッチ・輪の外・夜明け後の秒・空の持ち主・空襲の集計（見出し・帰投点 ×0.9・夜明けの行）
}

/** 大発掃討の記録（v0.4.2）: 隻数・撃破・上陸・ノルマ、射撃の発射と命中、最初に撃った距離 m と速力帯、最初に目で気づかれた距離 m（NaN なら気づかれる前に撃った）、撃破の距離の最小・最大 m、13mm の命中数と被害 HP。実機で数値を合わせる根拠 */
export interface BargeResult {
  enemyId: string;
  total: number;
  sunk: number;
  beached: number;
  quota: number;
  shots: number;
  hits: number;
  firstShotM: number;
  firstShotBand: string;
  firstDetectM: number;
  flashFirst: boolean;
  killMinM: number;
  killMaxM: number;
  mgHits: number;
  mgDamage: number;
  /** 沿岸砲（v0.4.3）: 任務にある、射界の中にいた体感秒、砲撃・命中・被害 HP */
  batteryEnabled: boolean;
  batteryInArcS: number;
  batteryShots: number;
  batteryHits: number;
  batteryDamage: number;
}

/** 僚艇の記録（v0.4.4）: 残り HP と最大、被弾数と被害 HP、自艇から最も離れた距離 m、沈んだか（沈んだ実秒） */
export interface EscortResult {
  hpLeft: number;
  hpMax: number;
  hits: number;
  damage: number;
  maxDistM: number;
  sunk: boolean;
  sunkAtS: number;
}

export class ResultScene extends Phaser.Scene {
  private result?: MissionResult;
  private buttons: MenuButton[] = [];
  /** 二重遷移の防止（同じフレームで 2 度 scene.start すると 2 つ起動する） */
  private leaving = false;

  constructor() {
    super(SCENE_KEYS.result);
  }

  init(data: MissionResult): void {
    this.result = data;
  }

  create(): void {
    this.cameras.main.setZoom(RENDER_SCALE).centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    const r = this.result;
    if (!r || !isSortie(r.sortie)) {
      this.scene.start(SCENE_KEYS.title);
      return;
    }
    this.leaving = false;
    this.buttons = [];
    addBuildLabel(this);
    const cx = GAME_WIDTH / 2;
    let y = RESULT_TOP_Y;
    // 行は画面の幅（左右に HUD_MARGIN）に収まらなければ作るときに 1 回だけ縮める（v0.6.1 レビュー: 夜明けの後の見出し・夜明けの行がはみ出した。毎フレームの処理は無い）
    const maxW = GAME_WIDTH - 2 * HUD_MARGIN;
    const line = (text: string, size: number, color?: string): void => {
      const tx = this.add.text(cx, y, text, hudTextStyle(size, color)).setOrigin(0.5, 0).setDepth(DEPTH.hud);
      if (tx.width > maxW) tx.setScale(maxW / tx.width);
      y += size + RESULT_LINE_GAP;
    };
    line(resultHeadingJa(r.reason, resultDawnSuffixS(r.returned, r.dawn), r.sortie.hard, r.sortie.historical), HUD_FONT_SPEED_PX, HUD_COLOR_STRONG);
    const h = r.hunt;
    if (h) {
      // 大発掃討（v0.4.2）: 撃破・上陸と、射撃・距離の記録（実機で数値を合わせる根拠）
      line(`大発 撃破 ${h.sunk} / ${h.total}（ノルマ ${h.quota} ・ 上陸 ${h.beached}）`, HUD_FONT_STEP_PX, HUD_COLOR_STRONG);
      y += RESULT_SECTION_GAP;
      for (const l of bargeResultLines(h)) line(l, HUD_FONT_HEADING_PX);
    } else {
      const fired = r.shots.length;
      const unfired = r.capacity - fired;
      line(`命中 ${r.hits} / 発射 ${fired}（不発 ${r.duds}、外れ ${r.misses}${unfired > 0 ? `、未発射 ${unfired}` : ''}）`, HUD_FONT_STEP_PX, HUD_COLOR_STRONG);
      y += RESULT_SECTION_GAP;
      const bandsFired = r.bands.filter((b) => b.shots > 0);
      if (bandsFired.length === 0) line('発射なし', HUD_FONT_HEADING_PX);
      // 通算（v0.5.0）: 撃った帯の行の右に、その帯の通算の命中率と目標帯（命中率チューニングの根拠。CLAUDE.md §9）。凡例は下に 1 行
      const kpi = r.kpi;
      r.bands.forEach((b, i) => {
        if (b.shots > 0) line(`${b.band}: ${b.hits} / ${b.shots}${b.duds > 0 ? `（不発 ${b.duds}）` : ''}${kpi ? `   ${kpi.byBand[i]}` : ''}`, HUD_FONT_HEADING_PX);
      });
      if (kpi) line(kpi.legend, HUD_FONT_STATUS_PX, HUD_COLOR_KPI);
      else if (r.sortie.historical) line(RESULT_HISTORICAL_KPI_JA, HUD_FONT_STATUS_PX, HUD_COLOR_KPI);
      else line(RESULT_CAMPAIGN_KPI_JA, HUD_FONT_STATUS_PX, HUD_COLOR_KPI);
    }
    y += RESULT_SECTION_GAP;
    // スコア（docs/02 §6.9、data/scoring.json）。得点していない項目も 0 で出す（何が評価されるかを見せる）
    const scoringParams = getScoringParams(getGameData(this.registry, REGISTRY_KEY_DATA));
    const score = computeScore(
      // 撃破: 大発（砲）か輸送船（魚雷。v0.4.7）
      { returned: r.returned, objectiveDone: r.objectiveDone, missionType: r.missionType, bands: r.bands, kills: h ? h.sunk : r.transportSunk ? 1 : 0, killEnemyId: h ? h.enemyId : r.transportEnabled ? TRANSPORT_ENEMY_ID : '', fuelLeftPct: r.fuelLeftPct, crewAlive: r.crewAlive, crewTotal: r.crewTotal, detections: r.detections, afterDawn: r.returned && r.dawn.caughtOutside },
      scoringParams,
    );
    line(`スコア ${score.total}`, HUD_FONT_SPEED_PX, HUD_COLOR_STRONG);
    // 回避（v0.4.4）は type に点がある任務（要人脱出）だけ出す。夜明けに輪の外だった帰投（v0.6.1）は「帰投 630（夜明け後 ×0.9）」、夜明けだけが理由で回避が 0 なら「回避 0（夜明け後）」
    const evadePart = resultEvadePartJa(scoringParams.evadeByType[r.missionType], score.evade, r);
    const transportPart = r.transportEnabled ? ` ・ 輸送船 ${score.kills}` : '';
    line(`帰投 ${score.survival}${r.returned && r.dawn.caughtOutside ? `（夜明け後 ×${scoringParams.afterDawnFactor}）` : ''} ・ ${h ? `達成 ${score.objective} ・ 撃破 ${score.kills}` : `${r.escort ? '達成' : '撃沈'} ${score.objective} ・ 命中 ${score.hits}${transportPart}${evadePart}`} ・ 燃料 ${score.fuel} ・ 乗員 ${score.crew}`, HUD_FONT_HEADING_PX);
    y += RESULT_SECTION_GAP;
    const firstLaunch = Number.isNaN(r.fuelAtFirstLaunchPct) ? '' : `（初発射時 ${r.fuelAtFirstLaunchPct}%）`;
    const ships = resultShipsJa(r); // 夜明けに退いた艦（v0.6.2）は「退いた」。1 隻の任務は駆逐艦の撃沈数で（輸送船が沈まなくても「撃沈」）
    const head = h ? `大発: ${r.objectiveDone ? 'ノルマ達成' : 'ノルマ未達'}` : r.escort ? `要人: ${r.objectiveDone ? '送り届けた' : r.escort.sunk ? '失った' : '届かず'}` : ships;
    line(`${head}   帰投: ${r.returned ? 'あり' : 'なし'}   艇 HP ${Math.ceil(r.hpLeft)} / ${r.hpMax}   乗員 ${r.crewAlive}/${r.crewTotal}   燃料 ${r.fuelLeftPct}%${firstLaunch}   ${Math.round(r.elapsedS)} 秒`, HUD_FONT_HEADING_PX);
    for (const l of [r.raidLine, dawnResultLine(r.dawn, r.returned)]) if (l) line(l, HUD_FONT_HEADING_PX); // 「出撃前」と夜明け（v0.6.1）の行。無ければ出さない
    if (r.escort) line(escortResultLine(r.escort, r.detections, r.destroyerSunk), HUD_FONT_HEADING_PX);
    if (r.friendlyEnabled) {
      // 味方機: 来たか、識別までの秒（猶予の調整の根拠）、撃たれた回数
      const n = r.friendlyPasses;
      const react = `識別 ${r.friendlyReactS.toFixed(1)} 秒（猶予 ${r.friendlyPeriodS} 秒）`;
      let text: string;
      if (r.friendlyPhase === FF_IDLE) text = '味方機: 来ず';
      else if (r.friendlyOutcome === FF_OUT_IDENTIFIED) text = n > 0 ? `味方機: 誤射 ${n} 回 → ${react}` : `味方機: ${react}`;
      else if (r.friendlyOutcome === FF_OUT_GAVE_UP) text = `味方機: 誤射 ${n} 回（識別なし）`;
      else text = `味方機: 識別の途中で終了（誤射 ${n} 回）`;
      line(text, HUD_FONT_HEADING_PX);
    }
    if (r.seaplaneEnabled) line(seaplaneResultLine(r), HUD_FONT_HEADING_PX);
    if (r.crewAlive < r.crewTotal && r.hpLeft > 0) {
      // 乗員が減ったときの影響（v0.3.5）: 旋回・加速の倍率、消火に要する長押し、帰投点（半数以下なら × crew_half_factor）。沈んだ艇には出さない（最後の HP 0 の人数は操作には効いていない）
      const turnPct = Math.round((1 - r.crewTurnFactor) * 100);
      const accelPct = Math.round((1 - r.crewAccelFactor) * 100);
      const perf = turnPct === accelPct ? `旋回・加速 −${turnPct}%` : `旋回 −${turnPct}% ・ 加速 −${accelPct}%`;
      const half = score.crewHalf ? ` ・ 帰投点 ×${scoringParams.crewHalfFactor}（半数以下）` : '';
      line(`乗員 ${r.crewTotal - r.crewAlive} 名死傷: ${perf} ・ 消火 ${r.extinguishHoldS.toFixed(1)} 秒${half}`, HUD_FONT_HEADING_PX);
    }
    if (r.stormEnabled) {
      // 暴風: 帯の中にいた秒と安全速力を超えていた秒（叩きつけの重さを調整する根拠）
      if (r.stormInsideS <= 0) line('暴風: 帯に入らず', HUD_FONT_HEADING_PX);
      else {
        const dmg = r.stormSlams > 0 ? `（HP −${Math.round(r.stormSlamDamage)}）` : '';
        line(`暴風: 帯の中 ${r.stormInsideS.toFixed(1)} 秒（${r.stormSafeKt} kt 超 ${r.stormOverS.toFixed(1)} 秒）・ 平均 ${Math.round(r.stormMeanKt)} kt ・ 叩きつけ ${r.stormSlams} 回${dmg}`, HUD_FONT_HEADING_PX);
      }
    }
    if (!r.returned) {
      // 輪の縁までの距離を切り上げ（輪の外で「あと 0 m」と出さない）。輪の中で沈んだ（魚雷の決着待ちの間に体当たり・砲撃）ときだけ別の文
      if (r.ringDistM > 0) line(`帰投地点まで あと ${Math.max(1, Math.ceil(r.ringDistM / HOME_MARKER_DISTANCE_STEP_M)) * HOME_MARKER_DISTANCE_STEP_M} m`, HUD_FONT_HEADING_PX);
      else line('帰投地点の輪の中で沈没（魚雷の決着待ち）', HUD_FONT_HEADING_PX);
    }
    this.add
      .text(cx, GAME_HEIGHT - RESULT_SEED_Y, `seed ${r.seed}`, hudTextStyle(HUD_FONT_HEADING_PX))
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.hud);

    // ボタンは任務中から押しっぱなしの指（スティック）の離しでは反応しない（ボタンの上で新しく押した指だけ。少し待ってから受け付ける）
    const listSpec = { x: RESULT_LIST_X, y: RESULT_BUTTON_Y, w: MENU_PRIMARY_W, h: RESULT_BUTTON_H, title: RESULT_LIST_JA, titlePx: RESULT_BUTTON_PX, align: 'center' as const };
    const retrySpec = { x: MENU_PRIMARY_X, y: RESULT_BUTTON_Y, w: MENU_PRIMARY_W, h: RESULT_BUTTON_H, title: RESULT_RETRY_JA, titlePx: RESULT_BUTTON_PX, sub: RESULT_RETRY_SUB_JA, align: 'center' as const };
    this.buttons.push(new MenuButton(this, listSpec, () => this.leave(null), RESULT_INPUT_DELAY_MS));
    this.buttons.push(new MenuButton(this, retrySpec, () => this.leave(r.sortie.missionId), RESULT_INPUT_DELAY_MS));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const b of this.buttons) b.destroy();
      this.buttons = [];
    });
  }

  /** missionId が null なら任務一覧（Title）へ。あれば同じ任務を新しい seed で: 通しは Briefing、?debug 直行は Mission */
  private leave(missionId: string | null): void {
    if (this.leaving) return;
    this.leaving = true;
    const r = this.result!;
    if (missionId === null) {
      this.scene.start(SCENE_KEYS.title);
      return;
    }
    if (DEBUG_DIRECT_MISSION) {
      this.scene.start(SCENE_KEYS.mission, directSortie(missionId, sortieSeed(), DEBUG_RAID_OVERRIDE, r.sortie.hard, r.sortie.historical));
      return;
    }
    const init: BriefingInit = { missionId, seed: sortieSeed(), hard: r.sortie.hard, historical: r.sortie.historical };
    this.registry.set(REGISTRY_KEY_PENDING_SORTIE, init);
    this.scene.start(SCENE_KEYS.briefing, init);
  }
}
