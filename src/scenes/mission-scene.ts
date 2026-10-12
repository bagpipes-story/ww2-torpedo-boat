// Mission: カメラ（追従・先読み・見張りズーム）、演出（爆発・揺れ）、帰投の呼びかけ、終了判定と Result への遷移。テレメトリと Result の組み立ては systems/mission-telemetry.ts（v0.4.0 で切り出し）。
// 運動・魚雷・反撃・煙幕・被害・燃料は systems/mission-world.ts。終了理由の判定は core/mission-flow.ts（v0.3.0: 撃沈・撃ち尽くしでは終わらず、帰投地点の輪に入って終わる）。
import Phaser from 'phaser';
import {
  CAMERA_FOLLOW_LERP,
  DEBUG_ENABLED,
  PROTOTYPE_MISSION_ID,
  REGISTRY_KEY_DATA,
  REGISTRY_KEY_INPUT,
  REGISTRY_KEY_TELEMETRY,
  RENDER_SCALE,
  SCENE_KEYS,
} from '../config/game-config';
import { getGameData } from '../config/game-data';
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
import { decideMissionEnd, updateReturnCalls, type EndCheck, type EndParams, type MissionEndReason } from '../core/mission-flow';
import { clamp, degToRad } from '../core/units';
import { ReturnPointView } from '../entities/return-point';
import { ShallowsView } from '../entities/shallows';
import { drawSea } from '../entities/sea';
import { DebugRanges, LeadMarker, playExplosion } from '../systems/mission-effects';
import { buildMissionResult, createTelemetry, refreshTelemetry } from '../systems/mission-telemetry';
import { MissionWorld, type WorldEvents } from '../systems/mission-world';

export class MissionScene extends Phaser.Scene {
  private world!: MissionWorld;
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
  /** 終了判定の材料。毎フレーム中身だけ書き換える（§7: 確保しない） */
  private readonly endCheck: EndCheck = {
    boatSinking: false,
    atHome: false,
    torpedoesRunning: false,
    waitS: 0,
    timeLeftS: 0,
    destroyerSinkPlaying: false,
    fuelEmpty: false,
    stopped: true,
    grounded: false,
  };
  private endParams: EndParams = { torpedoSettleMaxS: 0, adriftDelayS: MISSION_END_DELAY_MS / 1000 };

  private readonly worldEvents: WorldEvents = {
    onTorpedoHit: (x, y, dud) => {
      playExplosion(this, x, y, dud);
      if (!dud) this.shakeCamera();
    },
    // 撃沈では終わらない（帰投が目標）。終了判定は update の decideMissionEnd
    onDestroyerSunk: () => {},
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
    onBoatSunk: (reason) => this.endMission(reason),
    onSlam: () => {
      // 波の叩きつけ: 水しぶきは世界が出す。ここは弱い揺れだけ（進行中の揺れは上書きしない）
      const z = this.cameras.main.zoom;
      this.cameras.main.shake(STORM_SLAM_SHAKE_MS, STORM_SLAM_SHAKE_INTENSITY / (z * z));
    },
    onGrounded: (x, y) => {
      // 座礁: 小さな衝撃の輪と弱い揺れ。終了は decideMissionEnd（adriftDelayS 後）
      playExplosion(this, x, y, true);
      const z = this.cameras.main.zoom;
      this.cameras.main.shake(HIT_SHAKE_MS, BOAT_HIT_SHAKE_INTENSITY / (z * z));
    },
  };

  constructor() {
    super(SCENE_KEYS.mission);
  }

  create(): void {
    const data = getGameData(this.registry, REGISTRY_KEY_DATA);
    const world = data.hitRateModel.world;
    this.inputState = this.registry.get(REGISTRY_KEY_INPUT) as InputState;
    resetInput(this.inputState);

    // 乱数: シードは起動時刻。Result に表示するので再現したいときに使える
    const seed = Date.now() >>> 0;
    this.world = new MissionWorld(this, data, PROTOTYPE_MISSION_ID, this.inputState, seed, this.worldEvents);
    const w = this.world;
    drawSea(this, w.bounds); // 世界の表示物より後に作るが、depth（sea=0）で下に描かれる
    this.shallowsView = new ShallowsView(this, w.shallows);
    this.returnView = new ReturnPointView(this, w.returnPoint);

    this.timeScale = world.time_scale;
    this.timeLeftS = w.durationS;
    this.elapsedS = 0;
    this.ended = false;
    this.callFlags = 0;
    this.waitS = 0;
    this.endParams = { torpedoSettleMaxS: w.returnPoint.torpedoSettleMaxS, adriftDelayS: MISSION_END_DELAY_MS / 1000 };

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

    // 見越し点マーカー（docs/02 §6.3: v0.1 はデバッグ切替で常時表示可）と距離の円。URL に ?debug があるときだけ
    if (DEBUG_ENABLED) {
      this.leadMarker = new LeadMarker(this);
      this.debugRanges = new DebugRanges(this);
    }

    this.scene.launch(SCENE_KEYS.hud);

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

    w.updateFrame(realDt);
    this.updateZoom();
    this.updateLookAhead();
    const enemyAlive = w.destroyer.sinking ? null : w.destroyer.state;
    this.leadMarker?.refresh(w.boat.state, enemyAlive, w.torpedoParams.speedMps);
    this.debugRanges?.refresh(enemyAlive, w.detectRangeM, w.boat.state, Math.sqrt(w.visRange2));

    this.elapsedS += realDt;
    // 夜明けの時計は固定ステップで実際に進んだ時間（低フレームレートで捨てた時間は数えない。移動と燃料に揃える）
    this.timeLeftS = Math.max(0, w.durationS - w.stepTimeS);
    this.refreshReturnState(realDt);
    this.refreshTelemetry();

    const c = this.endCheck;
    c.boatSinking = w.boat.sinking;
    c.atHome = w.atHome;
    c.torpedoesRunning = w.torpedoesRunning;
    c.waitS = this.waitS;
    c.timeLeftS = this.timeLeftS;
    c.destroyerSinkPlaying = w.destroyer.sinking && !w.destroyer.sunk;
    c.fuelEmpty = w.fuel.empty;
    c.stopped = w.band === 'stop';
    c.grounded = w.grounded;
    const reason = decideMissionEnd(c, this.endParams);
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
    const expended = w.torpedoes.remaining === 0 && !w.torpedoesRunning;
    const before = this.callFlags;
    this.callFlags = updateReturnCalls(before, w.destroyer.sinking, expended, w.fuel.gal, needGal, this.timeLeftS, needS, rp.callMargin);
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
    // まだ走っている魚雷は外れとして記録し、Result の集計から漏れないようにする（帰投は最大 torpedo_settle_max_s 待った後）
    w.resolveRemainingAsMisses();
    const result = buildMissionResult(reason, w, getGameData(this.registry, REGISTRY_KEY_DATA), this.elapsedS, this.ringEdgeM);
    this.scene.start(SCENE_KEYS.result, result);
  }
}
