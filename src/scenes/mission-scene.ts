// Mission: カメラ（追従・先読み・見張りズーム）、演出（爆発・揺れ）、帰投の呼びかけ、終了判定と Result への遷移。テレメトリと Result の組み立ては systems/mission-telemetry.ts（v0.4.0 で切り出し）。
// 運動・魚雷・反撃・煙幕・被害・燃料は systems/mission-world.ts。終了理由の判定は core/mission-flow.ts（v0.3.0: 撃沈・撃ち尽くしでは終わらず、帰投地点の輪に入って終わる）、
// その材料と終わり際の魚雷待ち（v0.6.2 実機 1 回目）は systems/mission-end.ts。
import Phaser from 'phaser';
import {
  DEBUG_HISTORICAL,
  CAMERA_FOLLOW_LERP,
  DEBUG_ENABLED,
  DEBUG_HARD,
  PROTOTYPE_MISSION_ID,
  REGISTRY_KEY_DATA,
  REGISTRY_KEY_INPUT,
  REGISTRY_KEY_TELEMETRY,
  RENDER_SCALE,
  SCENE_KEYS,
  sortieSeed,
} from '../config/game-config';
import { getAimAssistLevels, getGameData } from '../config/game-data';
import { recordsHitKpi } from '../config/campaign-data';
import {
  BOAT_HIT_SHAKE_INTENSITY,
  CAMERA_LOOK_AHEAD_M,
  HIT_SHAKE_INTENSITY,
  HIT_SHAKE_MS,
  MISSION_END_DELAY_MS,
  STORM_SLAM_SHAKE_INTENSITY,
  STORM_SLAM_SHAKE_MS,
  ZOOM_LERP,
} from '../config/ui-config';
import type { BoatTelemetry } from '../core/boat-motion';
import { resetInput, type InputState } from '../core/input-state';
import { AIM_ASSIST_LEAD_MARKER_TIME, AIM_ASSIST_NONE, aimAssistLevelFor } from '../core/progress';
import { updateReturnCalls, type MissionEndReason } from '../core/mission-flow';
import { directSortie, isSortie, type Sortie } from '../core/sortie';
import { clamp, degToRad } from '../core/units';
import { ReturnPointView } from '../entities/return-point';
import { ShallowsView } from '../entities/shallows';
import { drawSea } from '../entities/sea';
import { DebugRanges, LeadMarker, playExplosion } from '../systems/mission-effects';
import { recordKpi } from '../systems/kpi-storage';
import { leadMarkerEnabled, recordClear, recordSortie, sortiesDone } from '../systems/progress-storage';
import { buildMissionResult, createTelemetry, refreshTelemetry } from '../systems/mission-telemetry';
import { MissionEnd } from '../systems/mission-end';
import { MissionWorld, type WorldEvents } from '../systems/mission-world';

export class MissionScene extends Phaser.Scene {
  private world!: MissionWorld;
  /** この出撃（Briefing か ?debug 直行の Boot・Result が渡す。v0.4.0） */
  private sortie!: Sortie;
  /** 出撃時の火災（港内空襲の至近弾）が消えた実秒（Result の「出撃前」の行）。燃えている間 -1、火災なしで出撃なら NaN */
  private startFireS = NaN;
  private inputState!: InputState;
  private telemetry!: BoatTelemetry;
  private returnView?: ReturnPointView;
  private shallowsView?: ShallowsView;
  /** カメラの論理ズーム（RENDER_SCALE を掛ける前）。見張り中は zoomMin へ、離すと zoomDefault へ寄せる */
  private zoomDefault = 1;
  private zoomMin = 1;
  private zoomMax = 1;
  /** ピンチで決めたズーム（見張りを離すとここへ戻る） */
  private zoomUser = 1;
  private zoom = 1;
  private timeScale = 1;
  /** デバッグ時（?debug）だけの見越し点マーカーと距離の円 */
  private leadMarker?: LeadMarker;
  private debugRanges?: DebugRanges;
  /** 夜明けまでの実秒（= duration_s − 固定ステップで進んだ実秒） */
  private timeLeftS = 0;
  private elapsedS = 0;
  /** 「帰投せよ」のビット（ラッチ）と、輪の中／燃料切れで止まっている間の待ち実秒 */
  private callFlags = 0;
  private waitS = 0;
  /** 輪の縁までの距離 m（Result 用。毎フレーム更新） */
  private ringEdgeM = 0;
  private ended = false;
  /** 終了判定と終わり際の魚雷待ち（systems/mission-end。出撃ごとに create で作る） */
  private end!: MissionEnd;

  private readonly worldEvents: WorldEvents = {
    onTorpedoHit: (x, y, dud) => {
      playExplosion(this, x, y, dud);
      if (!dud) this.shakeCamera();
    },
    // 撃沈では終わらない（帰投が目標。制空権下で敵艦隊がいなくなれば cleared）。終了判定は update の MissionEnd（systems/mission-end）
    onDestroyerSunk: () => {},
    onTargetDestroyed: (x, y) => {
      playExplosion(this, x, y, false);
      this.shakeCamera();
    },
    onShellHit: (x, y, small, destroyed) => {
      playExplosion(this, x, y, small);
      // 弱い揺れ。撃沈なら onBoatSinking の強い揺れだけにする（Phaser は揺れている間の新しい揺れを無視するため）
      if (!destroyed) {
        const z = this.cameras.main.zoom;
        this.cameras.main.shake(HIT_SHAKE_MS, BOAT_HIT_SHAKE_INTENSITY / (z * z));
      }
    },
    onBoatSinking: (x, y) => {
      playExplosion(this, x, y, false);
      this.shakeCamera();
    },
    // 沈没の演出が終わった: 走っている魚雷の決着（最大 torpedo_end_settle_s。沈み始めてから数える）を待ってから終える（v0.6.2 実機 1 回目）
    onBoatSunk: (reason) => {
      const r = this.end.boatSunk(this.world, reason);
      if (r) this.endMission(r);
    },
    onSlam: () => {
      // 波の叩きつけ: 水しぶきは世界が出す。ここは弱い揺れだけ（進行中の揺れは上書きしない）
      const z = this.cameras.main.zoom;
      this.cameras.main.shake(STORM_SLAM_SHAKE_MS, STORM_SLAM_SHAKE_INTENSITY / (z * z));
    },
    onGrounded: (x, y) => {
      // 座礁: 小さな衝撃の輪と弱い揺れ。終了は MissionEnd（adriftDelayS 後、走っている魚雷を最大 torpedo_end_settle_s 待って）
      playExplosion(this, x, y, true);
      const z = this.cameras.main.zoom;
      this.cameras.main.shake(HIT_SHAKE_MS, BOAT_HIT_SHAKE_INTENSITY / (z * z));
    },
  };

  constructor() {
    super(SCENE_KEYS.mission);
  }

  init(data: unknown): void {
    // 呼ぶ側は必ず Sortie を渡す（Phaser は data を省くと前回の data を使い回す）。無ければ us_02・空襲なし
    this.sortie = isSortie(data) ? data : directSortie(PROTOTYPE_MISSION_ID, sortieSeed(), 'none', DEBUG_HARD, DEBUG_HISTORICAL);
  }

  create(): void {
    const data = getGameData(this.registry, REGISTRY_KEY_DATA);
    const world = data.hitRateModel.world;
    this.inputState = this.registry.get(REGISTRY_KEY_INPUT) as InputState;
    resetInput(this.inputState);

    // 乱数: seed は出撃ごとに Title・Result（?debug 直行では Boot）が決めたもの。Result に出す（?debug&title&seed=N で再現）
    this.world = new MissionWorld(this, data, this.sortie, this.inputState, this.worldEvents);
    const w = this.world;
    const m = w.setup.mission;
    drawSea(this, m.bounds); // 世界の表示物より後に作るが、depth（sea=0）で下に描かれる
    this.shallowsView = new ShallowsView(this, m.shallows, m.coast, m.bounds);
    this.returnView = new ReturnPointView(this, w.returnPoint);

    this.timeScale = world.time_scale;
    this.timeLeftS = w.setup.durationS;
    this.elapsedS = 0;
    this.ended = false;
    this.callFlags = 0;
    this.waitS = 0;
    this.startFireS = w.setup.start.fireAtStart ? -1 : NaN;
    this.end = new MissionEnd(w.returnPoint, MISSION_END_DELAY_MS / 1000, w.setup.dawnAir.fleetGoneClears);

    // カメラ: 既定ズーム（docs/02 §6.10）× 描画スケール。追従は少し遅らせ、進行方向に先読みする。見張り（右中ボタン）で zoom_min まで引く
    this.zoomDefault = world.camera_zoom_default;
    this.zoomMin = world.camera_zoom_min;
    this.zoomMax = world.camera_zoom_max;
    this.zoomUser = this.zoomDefault;
    this.zoom = this.zoomDefault;
    const cam = this.cameras.main;
    cam.setZoom(this.zoom * RENDER_SCALE);
    cam.startFollow(w.boat.sprite, false, CAMERA_FOLLOW_LERP, CAMERA_FOLLOW_LERP);
    this.updateLookAhead();

    this.telemetry = createTelemetry(w, this.zoom, this.timeLeftS);
    this.registry.set(REGISTRY_KEY_TELEMETRY, this.telemetry);
    this.refreshReturnState(0);
    this.refreshTelemetry();

    // 見越し点マーカー（docs/02 §6.3。v0.5.2 から解放制）: 終えた任務の回数で解放した段階（3 回で輪、6 回で到達秒数も）。史実モードでは出ない。
    // Title で「使わない」にしていれば出さない（実機 1 回目）。?debug では段階に関わらず出す（使わないは効く）。距離の円は ?debug だけ
    const assist = aimAssistLevelFor(getAimAssistLevels(data), sortiesDone(), this.sortie.historical);
    if (leadMarkerEnabled() && (DEBUG_ENABLED || assist.id !== AIM_ASSIST_NONE)) this.leadMarker = new LeadMarker(this, assist.id === AIM_ASSIST_LEAD_MARKER_TIME);
    if (DEBUG_ENABLED) this.debugRanges = new DebugRanges(this);

    this.scene.launch(SCENE_KEYS.hud, this.sortie);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop(SCENE_KEYS.hud);
      this.world.destroy();
      this.returnView?.destroy();
      this.returnView = undefined;
      this.shallowsView?.destroy();
      this.shallowsView = undefined;
      this.leadMarker?.destroy();
      this.leadMarker = undefined;
      this.debugRanges?.destroy();
      this.debugRanges = undefined;
    });
  }

  override update(_time: number, delta: number): void {
    if (this.ended) return;
    const realDt = delta / 1000;
    const w = this.world;

    this.end.holdFire(w); // 終わり際の窓の間は撃たない（入力の消費の前に）
    w.updateFrame(realDt);
    if (this.startFireS < 0 && w.damage.fireLeftS <= 0) this.startFireS = w.stepTimeS; // NaN < 0 は false
    this.updateZoom();
    this.updateLookAhead();
    const enemyAlive = w.enemy.focus(w.boat.state.x, w.boat.state.y);
    // 見越し点は見えている（視程 visRange2 以内＝絵が出ている）艦にだけ（v0.5.2。見えない艦の位置を漏らさない。距離の 2 乗で比べる。§7）
    if (this.leadMarker) {
      const target = w.destroyers && enemyAlive && Phaser.Math.Distance.Squared(w.boat.state.x, w.boat.state.y, enemyAlive.x, enemyAlive.y) <= w.visRange2 ? enemyAlive : null;
      this.leadMarker.refresh(w.boat.state, target, w.setup.torpedoParams.speedMps, this.timeScale);
    }
    this.debugRanges?.refresh(enemyAlive, w.detectRangeM, w.boat.state, Math.sqrt(w.visRange2));

    this.elapsedS += realDt;
    // 夜明けの時計は固定ステップで実際に進んだ時間（低フレームレートで捨てた時間は数えない。移動と燃料に揃える）
    this.timeLeftS = Math.max(0, w.setup.durationS - w.stepTimeS);
    this.refreshReturnState(realDt);
    this.refreshTelemetry();

    const reason = this.end.step(w, this.waitS, this.timeLeftS);
    if (reason) this.endMission(reason);
  }

  /** 帰投地点までの距離、「帰投せよ」のビット（ラッチ）、待ち時間。平方根はここの 1 回だけ */
  private refreshReturnState(realDt: number): void {
    const w = this.world;
    const s = w.boat.state;
    const rp = w.returnPoint;
    const t = this.telemetry;
    t.homeDx = rp.x - s.x;
    t.homeDy = rp.y - s.y;
    t.homeDistM = Math.hypot(t.homeDx, t.homeDy);
    const edge = t.homeDistM - rp.radiusM;
    this.ringEdgeM = edge > 0 ? edge : 0;
    t.homeEdgeM = this.ringEdgeM;
    // 巡航で輪の縁まで直線で帰るのに要る燃料・実秒（迂回と敵は余裕 call_margin で吸収する）
    const needGal = this.ringEdgeM * w.fuelCurve.galPerMCruise;
    const needS = this.ringEdgeM / (w.fuelCurve.cruiseMps * this.timeScale);
    // 撃ち尽くし: 魚雷の任務は残弾 0、砲の任務は狩る大発が残っていない（撃破か上陸。v0.4.2）。撃沈は任務の目標（駆逐艦の撃沈／大発のノルマ）
    const expended = w.setup.mainWeapon === 'torpedo' ? w.torpedoes.remaining === 0 && !w.torpedoesRunning : w.enemy.noTargetsLeft;
    const before = this.callFlags;
    this.callFlags = updateReturnCalls(before, w.enemy.objectiveDone, expended, w.fuel.gal, needGal, this.timeLeftS, needS, rp.callMargin);
    if (before === 0 && this.callFlags !== 0) this.returnView?.pulse();
    // 燃料計の青い目盛り: 全速で輪の縁まで戻るのに要る燃料（全速は巡航の 1.47 倍食うので、巡航基準だと全速で走る人には甘すぎた。v0.3.3 実機）
    t.fuelNeed01 = w.fuelAllotmentGal > 0 ? (this.ringEdgeM * w.fuelCurve.galPerMFull) / w.fuelAllotmentGal : 0;
    // 待ち: 輪の中にいる間、または燃料 0 で止まっている間だけ数える
    if (w.atHome || w.grounded || (w.fuel.empty && w.band === 'stop')) this.waitS += realDt;
    else this.waitS = 0;
  }

  /** 見張り: 押している間 zoomMin へ、離すと既定へ、毎フレーム一定割合ずつ寄せる（setZoom は値が動いている間だけ） */
  private updateZoom(): void {
    // ピンチの要求があれば data の min〜max に収めて保つ。見張りを押している間は zoomMin、離すとピンチで決めた倍率へ
    if (Number.isFinite(this.inputState.zoomRequest)) {
      this.zoomUser = clamp(this.inputState.zoomRequest, this.zoomMin, this.zoomMax);
      this.inputState.zoomRequest = NaN;
    }
    const target = this.inputState.lookout ? this.zoomMin : this.zoomUser;
    const diff = target - this.zoom;
    if (Math.abs(diff) < 1e-4) {
      if (this.zoom !== target) {
        this.zoom = target;
        this.cameras.main.setZoom(this.zoom * RENDER_SCALE);
      }
      return;
    }
    this.zoom += diff * ZOOM_LERP;
    this.cameras.main.setZoom(this.zoom * RENDER_SCALE);
  }

  /** テレメトリを毎フレーム更新（中身は systems/mission-telemetry） */
  private refreshTelemetry(): void {
    refreshTelemetry(this.telemetry, this.world, this.inputState, this.zoom, this.timeLeftS, this.callFlags);
  }

  /** 進行方向に CAMERA_LOOK_AHEAD_M だけ視点をずらす（followOffset は「ターゲットから引く」向き） */
  private updateLookAhead(): void {
    const h = degToRad(this.world.boat.state.headingDeg);
    this.cameras.main.setFollowOffset(-Math.sin(h) * CAMERA_LOOK_AHEAD_M, Math.cos(h) * CAMERA_LOOK_AHEAD_M);
  }

  /** Phaser の shake はズームの 2 乗で弱まるので、見た目の揺れ幅が端末で揃うよう補正する。進行中の弱い揺れがあっても上書きする（force） */
  private shakeCamera(): void {
    const z = this.cameras.main.zoom;
    this.cameras.main.shake(HIT_SHAKE_MS, HIT_SHAKE_INTENSITY / (z * z), true);
  }

  private endMission(reason: MissionEndReason): void {
    if (this.ended) return;
    this.ended = true;
    const w = this.world;
    // まだ走っている魚雷は外れとして記録し、Result の集計から漏れないようにする（帰投は最大 torpedo_settle_max_s、ほかは torpedo_end_settle_s 待った後）
    w.resolveRemainingAsMisses();
    const data = getGameData(this.registry, REGISTRY_KEY_DATA);
    const result = buildMissionResult(reason, w, data, this.elapsedS, this.ringEdgeM, this.startFireS);
    // 通算の命中率（v0.5.0）: 魚雷の任務だけ、ここで 1 回だけ足して保存する（Result の作り直しで二重に数えない）。史実モード（v0.5.2）と
    // 米PT以外のキャンペーン（v0.6.0。hit_rate_model.kpi_measurement.campaigns）は数えない（通算はノーマルの米PTの調整の根拠）
    if (w.destroyers && !this.sortie.historical && recordsHitKpi(data, this.sortie.missionId)) result.kpi = recordKpi(data, result.shots);
    // 終えた任務の回数（v0.5.2。見越し点マーカーの解放）: Result まで行った任務だけ、ここで 1 回だけ +1
    recordSortie();
    // 帰投で終えた任務（v0.6.0。キャンペーンの解放の条件）: 帰投したとき（敵艦隊なし＝cleared も。v0.6.2 実機 1 回目）だけ、任務ごとに 1 回
    if (result.returned) recordClear(this.sortie.missionId);
    this.scene.start(SCENE_KEYS.result, result);
  }
}
