// Mission: 海・自艇・駆逐艦・魚雷・カメラ追従（v0.2.0: 視界と発見、雷跡回避、体当たり。v0.2.1: 探照灯・星弾・砲撃・艇 HP）。HUD と操作は HudScene に分離。
// 運動は src/core を固定ステップで積分する（CLAUDE.md §7）。発射・命中・終了はイベント時だけ確保する。
import Phaser from 'phaser';
import {
  CAMERA_FOLLOW_LERP,
  DEBUG_ENABLED,
  FIXED_STEP_S,
  MAX_STEPS_PER_FRAME,
  PROTOTYPE_MISSION_ID,
  REGISTRY_KEY_DATA,
  REGISTRY_KEY_INPUT,
  REGISTRY_KEY_TELEMETRY,
  RENDER_SCALE,
  SCENE_KEYS,
} from '../config/game-config';
import {
  getBoatDamageParams,
  getBoatRecord,
  getBoatTorpedoCount,
  getEnemyRecord,
  getEvasionMultiplier,
  getGameData,
  getPrototypeMission,
  getTorpedoRecord,
  getVisibilityParams,
} from '../config/game-data';
import {
  BOAT_HIT_SHAKE_INTENSITY,
  CAMERA_LOOK_AHEAD_M,
  HIT_SHAKE_INTENSITY,
  HIT_SHAKE_MS,
  MISSION_END_DELAY_MS,
  RUDDER_BAR_FULL_DEG,
  SMALL_HIT_DAMAGE_RATIO,
} from '../config/ui-config';
import {
  boatParamsFromData,
  clampToBounds,
  speedBandFor,
  stepBoat,
  turnCommand,
  type BoatParams,
  type BoatTelemetry,
  type SeaBounds,
} from '../core/boat-motion';
import { FixedStepper } from '../core/fixed-stepper';
import { applyShellHit, createDamageState, gunneryParamsFromData, stepDamage, type DamageParams, type DamageState, type GunneryParams, type HitOutcome } from '../core/gunnery';
import { countHits, summarizeShots, type ShotRecord } from '../core/hit-rate';
import { resetInput, type InputState } from '../core/input-state';
import { SeededRng } from '../core/rng';
import { shipAiParamsFromData } from '../core/ship-ai';
import { torpedoParamsFromData, torpedoReliabilityFromData, type TorpedoParams } from '../core/torpedo';
import { degToRad } from '../core/units';
import { enemyDetectRangeM, playerVisRangeM, speedFactorFor, type VisibilityParams } from '../core/visibility';
import { Destroyer } from '../entities/destroyer';
import { PlayerBoat } from '../entities/player-boat';
import { drawSea } from '../entities/sea';
import { EnemyFire } from '../systems/enemy-fire';
import { DebugRanges, LeadMarker, playExplosion } from '../systems/mission-effects';
import { TorpedoLauncher } from '../systems/torpedo-launcher';
import { TorpedoPool, type TorpedoEvents } from '../systems/torpedo-pool';
import type { MissionEndReason, MissionResult } from './result-scene';

export class MissionScene extends Phaser.Scene {
  private boat!: PlayerBoat;
  private destroyer!: Destroyer;
  private torpedoes!: TorpedoPool;
  private params!: BoatParams;
  private bounds!: SeaBounds;
  /** 境界から押し戻す余白（m）。表示上の船体半分で、船首が境界線をはみ出さない */
  private boundsMarginM = 0;
  /** 体当たり・着弾判定に使う自艇の半長・半幅 m（hit_scale 込み） */
  private boatHalfLengthM = 0;
  private boatHalfBeamM = 0;
  /** 反撃（docs/02 §6.5・§6.6）: 探照灯・星弾・砲撃と、艇の被害 */
  private enemyFire!: EnemyFire;
  private gunneryParams!: GunneryParams;
  private damage!: DamageState;
  private damageParams!: DamageParams;
  private readonly hitOutcome: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
  /** 無傷時の最大速力（機関損傷で params.speedMaxMps を下げる） */
  private speedMaxBaseMps = 0;
  /** 砲撃のばらつきと被害の抽選に使う乱数（seed+1 の系列） */
  private gunRng!: SeededRng;
  private inputState!: InputState;
  private telemetry!: BoatTelemetry;
  private timeScale = 1;
  private launcher!: TorpedoLauncher;
  private torpedoParams!: TorpedoParams;
  /** 外れ確定の半径二乗: 目標中心からこれより離れて遠ざかれば通過したとみなす */
  private passRadius2 = 0;
  /** 視界（docs/02 §6.5）: 敵の基準発見距離、自艇の視程の二乗、このステップの発見距離 */
  private vis!: VisibilityParams;
  private baseDetectM = 0;
  private visRange2 = 0;
  private detectRangeM = 0;
  /** デバッグ時（?debug）だけの見越し点マーカーと距離の円 */
  private leadMarker?: LeadMarker;
  private debugRanges?: DebugRanges;
  private seed = 0;
  private readonly shots: ShotRecord[] = [];
  private hits = 0;
  private timeLeftS = 0;
  private elapsedS = 0;
  private slowMoLeftS = 0;
  private slowMoFactor = 1;
  private slowMoSeconds = 0;
  private ended = false;
  private endTimer?: Phaser.Time.TimerEvent;
  private readonly stepper = new FixedStepper(FIXED_STEP_S, MAX_STEPS_PER_FRAME);

  private readonly torpedoEvents: TorpedoEvents = {
    onHit: (x, y, dud, erratic, rangeAtLaunchM) => this.handleHit(x, y, dud, erratic, rangeAtLaunchM),
    onMiss: (erratic, rangeAtLaunchM) => {
      this.shots.push({ rangeM: rangeAtLaunchM, hit: false, dud: false, erratic });
    },
  };

  private readonly stepFn = (realDt: number): void => {
    const factor = this.slowMoLeftS > 0 ? this.slowMoFactor : 1;
    const dt = realDt * this.timeScale * factor;
    const boat = this.boat.state;
    if (!this.boat.sinking) {
      stepBoat(boat, this.inputState, this.params, dt);
      clampToBounds(boat, this.bounds, this.boundsMarginM);
    }
    // 敵がこのステップで自艇を見つける距離 = 基準 × 速力係数 × 月明 ×（煙幕は v0.2.2）
    this.detectRangeM = enemyDetectRangeM(this.baseDetectM, speedFactorFor(boat.speedMps, this.params, this.vis.speedFactor), this.vis, false);
    const d = this.destroyer;
    d.step(dt, realDt * factor, boat, this.detectRangeM, this.vis.detectHoldS, this.torpedoes.states);
    this.torpedoes.step(dt, realDt * factor, d.sinking ? null : d.circles, d.state.x, d.state.y, this.passRadius2, this.torpedoEvents);
    if (!this.boat.sinking && d.touchesBoat(boat, this.boatHalfLengthM)) this.handleRammed();
    // 反撃: 発見中なら探照灯・星弾、照らされていれば砲撃。どちらかが沈没中なら撃たない（飛んでいる弾は着弾まで進む）
    const alive = !d.sinking && !this.boat.sinking;
    this.enemyFire.step(dt, realDt * factor, d.state, boat, d.ai.playerDetected && !d.sinking, alive, this.boatHalfLengthM, this.boatHalfBeamM);
    if (!this.boat.sinking && stepDamage(this.damage, this.damageParams, realDt * factor)) this.handleDestroyed();
  };

  constructor() {
    super(SCENE_KEYS.mission);
  }

  create(): void {
    const data = getGameData(this.registry, REGISTRY_KEY_DATA);
    const world = data.hitRateModel.world;
    const launch = data.hitRateModel.torpedo_launch;
    const feel = data.hitRateModel.feel;
    const mission = getPrototypeMission(data, PROTOTYPE_MISSION_ID);
    const boatRecord = getBoatRecord(data, mission.playerBoatId);
    const enemyRecord = getEnemyRecord(data, mission.enemyId);
    const torpedoRecord = getTorpedoRecord(data, mission.torpedoId);

    this.params = boatParamsFromData(boatRecord);
    this.bounds = mission.bounds;
    this.boundsMarginM = (boatRecord.length_m * world.sprite_scale) / 2;
    this.boatHalfLengthM = (boatRecord.length_m * world.hit_scale) / 2;
    this.boatHalfBeamM = (boatRecord.beam_m * world.hit_scale) / 2;
    this.speedMaxBaseMps = this.params.speedMaxMps;
    this.gunneryParams = gunneryParamsFromData(enemyRecord);
    this.damageParams = getBoatDamageParams(data, mission.playerBoatId);
    this.damage = createDamageState(this.damageParams);
    this.timeScale = world.time_scale;
    this.inputState = this.registry.get(REGISTRY_KEY_INPUT) as InputState;
    resetInput(this.inputState);

    this.vis = getVisibilityParams(data, mission.moon);
    this.baseDetectM = enemyRecord.detection.base_detect_m;
    const visRange = playerVisRangeM(this.vis);
    this.visRange2 = visRange * visRange;
    // 最初の固定ステップが回る前のフレームでも HUD に正しい発見距離が出るよう、出発時の速力で先に計算する
    this.detectRangeM = enemyDetectRangeM(this.baseDetectM, speedFactorFor(0, this.params, this.vis.speedFactor), this.vis, false);

    this.slowMoFactor = feel.hit_slowmo_factor;
    this.slowMoSeconds = feel.hit_slowmo_seconds;
    this.timeLeftS = mission.durationS;
    this.elapsedS = 0;
    this.hits = 0;
    this.shots.length = 0;
    this.ended = false;
    this.slowMoLeftS = 0;

    drawSea(this, this.bounds);

    // スティック中立=停止なので、出発時は停止している（docs/02 §5、v0.2.1）
    this.boat = new PlayerBoat(this, mission.playerStart, 0);
    this.destroyer = new Destroyer(
      this,
      mission.enemyStart,
      {
        lengthM: enemyRecord.length_m,
        beamM: enemyRecord.beam_m,
        hullCircles: enemyRecord.hull_circles,
        hitsToSink: mission.enemyHitsToSink ?? enemyRecord.torpedo_hits_to_sink,
        hitScale: world.hit_scale,
        boundsMarginM: (enemyRecord.length_m * world.sprite_scale) / 2,
      },
      shipAiParamsFromData(enemyRecord, getEvasionMultiplier(data)),
      this.bounds,
    );
    const hitLen = enemyRecord.length_m * world.hit_scale;
    const hitBeam = enemyRecord.beam_m * world.hit_scale;
    this.passRadius2 = (hitLen / 2 + hitBeam) * (hitLen / 2 + hitBeam);
    const capacity = getBoatTorpedoCount(data, mission.playerBoatId);
    this.torpedoParams = torpedoParamsFromData(torpedoRecord, launch.arming_distance_m, launch.erratic_period_s);
    this.torpedoes = new TorpedoPool(this, this.torpedoParams, capacity, this.bounds);
    // 乱数: シードは起動時刻。Result に表示するので再現したいときに使える。砲撃のばらつきは別系列（seed+1）で、発射順に影響されない
    this.seed = Date.now() >>> 0;
    this.gunRng = new SeededRng((this.seed + 1) >>> 0);
    this.enemyFire = new EnemyFire(this, this.gunneryParams, this.gunRng, mission.enemyStart.headingDeg);
    this.enemyFire.setHitHandler((gunIndex, x, y) => this.handleShellHit(gunIndex, x, y));
    this.launcher = new TorpedoLauncher(
      this.torpedoes,
      new SeededRng(this.seed),
      torpedoReliabilityFromData(torpedoRecord),
      torpedoRecord.reliability.jitter_deg,
      boatRecord.beam_m / 2,
      launch.salvo_interval_s,
    );

    // カメラ: 既定ズーム（docs/02 §6.10）× 描画スケール。追従は少し遅らせ、進行方向に先読みする
    const cam = this.cameras.main;
    cam.setZoom(world.camera_zoom_default * RENDER_SCALE);
    cam.startFollow(this.boat.sprite, false, CAMERA_FOLLOW_LERP, CAMERA_FOLLOW_LERP);
    this.updateLookAhead();

    this.telemetry = {
      speedMps: this.boat.state.speedMps,
      rudder: 0,
      targetStep: 'stop',
      headingDeg: this.boat.state.headingDeg,
      torpedoesLeft: capacity,
      hits: 0,
      timeLeftS: this.timeLeftS,
      enemyDx: this.destroyer.state.x - this.boat.state.x,
      enemyDy: this.destroyer.state.y - this.boat.state.y,
      enemySighted: false,
      playerDetected: false,
      detectRangeM: this.detectRangeM,
      illuminated: false,
      starLit: false,
      hp: this.damage.hp,
      hpMax: this.damageParams.maxHp,
      onFire: false,
      engineDamaged: false,
    };
    this.registry.set(REGISTRY_KEY_TELEMETRY, this.telemetry);
    this.refreshSighting();

    // 見越し点マーカー（docs/02 §6.3: v0.1 はデバッグ切替で常時表示可）と距離の円。URL に ?debug があるときだけ
    if (DEBUG_ENABLED) {
      this.leadMarker = new LeadMarker(this);
      this.debugRanges = new DebugRanges(this);
    }

    this.scene.launch(SCENE_KEYS.hud);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.stop(SCENE_KEYS.hud);
      this.endTimer?.remove(false);
      this.endTimer = undefined;
      this.torpedoes.destroy();
      this.enemyFire.destroy();
      this.destroyer.destroy();
      this.boat.destroy();
      this.leadMarker?.destroy();
      this.leadMarker = undefined;
      this.debugRanges?.destroy();
      this.debugRanges = undefined;
    });
  }

  override update(_time: number, delta: number): void {
    if (this.ended) return;
    const realDt = delta / 1000;

    if (!this.boat.sinking) {
      this.consumeFireInput();
      this.launcher.update(realDt, this.boat.state, this.destroyer.state);
    }
    this.stepper.advance(realDt, this.stepFn);
    this.boat.syncSprite();
    this.destroyer.syncSprite();
    this.torpedoes.updateVisuals(realDt);
    this.enemyFire.updateVisuals(realDt, this.destroyer.state);
    this.updateLookAhead();
    const enemyAlive = this.destroyer.sinking ? null : this.destroyer.state;
    this.leadMarker?.refresh(this.boat.state, enemyAlive, this.torpedoParams.speedMps);
    this.debugRanges?.refresh(enemyAlive, this.detectRangeM, this.boat.state, playerVisRangeM(this.vis));

    if (this.slowMoLeftS > 0) this.slowMoLeftS -= realDt;
    this.elapsedS += realDt;
    this.timeLeftS -= realDt;

    const t = this.telemetry;
    const s = this.boat.state;
    t.speedMps = s.speedMps;
    t.rudder = turnCommand(this.inputState, s, RUDDER_BAR_FULL_DEG);
    t.headingDeg = s.headingDeg;
    t.targetStep = speedBandFor(s.speedMps, this.params);
    t.torpedoesLeft = this.torpedoes.remaining;
    t.hits = this.hits;
    t.timeLeftS = this.timeLeftS;
    this.refreshSighting();

    // 沈没演出中（どちらの側でも）は演出の完了（'sunk' / 'rammed'）に任せる
    if (this.destroyer.sinking || this.boat.sinking) return;
    if (this.timeLeftS <= 0) {
      this.endMission('timeout');
    } else if (this.torpedoes.remaining === 0 && this.launcher.queued === 0 && this.torpedoes.unresolvedCount === 0 && !this.endTimer) {
      this.endTimer = this.time.delayedCall(MISSION_END_DELAY_MS, () => this.endMission('expended'));
    }
  }

  /** 敵の相対位置と「見えるか・見つかったか」を telemetry へ。敵スプライトは視程内だけ表示（docs/02 §6.5） */
  private refreshSighting(): void {
    const t = this.telemetry;
    const d = this.destroyer;
    if (d.sinking) {
      t.enemyDx = NaN;
      t.enemyDy = NaN;
      t.enemySighted = false;
    } else {
      t.enemyDx = d.state.x - this.boat.state.x;
      t.enemyDy = d.state.y - this.boat.state.y;
      t.enemySighted = t.enemyDx * t.enemyDx + t.enemyDy * t.enemyDy <= this.visRange2;
      d.setSighted(t.enemySighted);
    }
    t.playerDetected = d.ai.playerDetected && !d.sinking;
    t.detectRangeM = this.detectRangeM;
    t.illuminated = this.enemyFire.illuminated && !d.sinking;
    t.starLit = this.enemyFire.state.star.illuminating && !d.sinking;
    t.hp = this.damage.hp;
    t.onFire = this.damage.fireLeftS > 0 && this.damage.hp > 0;
    t.engineDamaged = this.damage.engineDamaged;
  }

  /** 進行方向に CAMERA_LOOK_AHEAD_M だけ視点をずらす（followOffset は「ターゲットから引く」向き） */
  private updateLookAhead(): void {
    const h = degToRad(this.boat.state.headingDeg);
    this.cameras.main.setFollowOffset(-Math.sin(h) * CAMERA_LOOK_AHEAD_M, Math.cos(h) * CAMERA_LOOK_AHEAD_M);
  }

  /** HUD からの発射要求を消費する。タップは 1 本、一斉は残弾すべてを扇状に（間隔は launcher が持つ） */
  private consumeFireInput(): void {
    const input = this.inputState;
    if (input.fireTap) {
      input.fireTap = false;
      this.launcher.queueFan(this.boat.state, 1, 0);
    }
    if (!Number.isNaN(input.fireSalvoSpreadDeg)) {
      const spread = input.fireSalvoSpreadDeg;
      input.fireSalvoSpreadDeg = NaN;
      this.launcher.queueFan(this.boat.state, this.torpedoes.remaining, spread);
    }
  }

  private handleHit(x: number, y: number, dud: boolean, erratic: boolean, rangeAtLaunchM: number): void {
    this.shots.push({ rangeM: rangeAtLaunchM, hit: true, dud, erratic });
    playExplosion(this, x, y, dud);
    if (dud) return;
    this.hits++;
    this.slowMoLeftS = this.slowMoSeconds;
    this.shakeCamera();
    if (this.destroyer.takeHit()) {
      this.destroyer.playSinking(() => this.endMission('sunk'));
    }
  }

  /** 体当たりされた: 自艇の位置で爆発、スロー、沈没演出の後に Result（生還なし） */
  private handleRammed(): void {
    this.sinkBoat('rammed');
  }

  /** 砲弾が命中: HP を減らし、火災・機関損傷を抽選。機関損傷は最大速力を下げる（data: damage.engine_damage_speed_factor）。HP 0 で沈没 */
  private handleShellHit(gunIndex: number, x: number, y: number): void {
    if (this.boat.sinking || this.ended) return;
    const gun = this.gunneryParams.guns[gunIndex]!;
    const o = applyShellHit(this.damage, gun, this.damageParams, this.gunRng, this.hitOutcome);
    playExplosion(this, x, y, gun.damage < this.damageParams.maxHp * SMALL_HIT_DAMAGE_RATIO);
    if (!o.destroyed) {
      // 弱い揺れ。撃沈なら sinkBoat の強い揺れだけにする（Phaser は揺れている間の新しい揺れを無視するため）
      const z = this.cameras.main.zoom;
      this.cameras.main.shake(HIT_SHAKE_MS, BOAT_HIT_SHAKE_INTENSITY / (z * z));
    }
    if (o.engineHit) {
      this.params.speedMaxMps = this.speedMaxBaseMps * this.damageParams.engineSpeedFactor;
      if (this.params.speedCruiseMps > this.params.speedMaxMps) this.params.speedCruiseMps = this.params.speedMaxMps;
    }
    if (o.destroyed) this.handleDestroyed();
  }

  /** 砲撃で HP 0: 爆発、スロー、沈没演出の後に Result（生還なし） */
  private handleDestroyed(): void {
    this.sinkBoat('destroyed');
  }

  /** 自艇の沈没（体当たり・砲撃）。保留中の '撃ち尽くし' 終了は取り消し、演出の完了で Result へ */
  private sinkBoat(reason: MissionEndReason): void {
    if (this.boat.sinking || this.ended) return;
    // 沈んだ艇の HP は 0、火災も消す（体当たりでも HUD と Result が 100 のままにならないように）
    this.damage.hp = 0;
    this.damage.fireLeftS = 0;
    const s = this.boat.state;
    playExplosion(this, s.x, s.y, false);
    this.slowMoLeftS = this.slowMoSeconds;
    this.shakeCamera();
    this.endTimer?.remove(false);
    this.endTimer = undefined;
    this.boat.playSinking(() => this.endMission(reason));
  }

  /** Phaser の shake はズームの 2 乗で弱まるので、見た目の揺れ幅が端末で揃うよう補正する。進行中の弱い揺れがあっても上書きする（force） */
  private shakeCamera(): void {
    const z = this.cameras.main.zoom;
    this.cameras.main.shake(HIT_SHAKE_MS, HIT_SHAKE_INTENSITY / (z * z), true);
  }

  private endMission(reason: MissionEndReason): void {
    if (this.ended) return;
    this.ended = true;
    // まだ走っている魚雷は外れとして記録し、Result の集計から漏れないようにする
    this.torpedoes.resolveRemainingAsMisses(this.torpedoEvents);
    const data = getGameData(this.registry, REGISTRY_KEY_DATA);
    const counts = countHits(this.shots);
    const result: MissionResult = {
      reason,
      shots: this.shots.slice(),
      bands: summarizeShots(this.shots, data.hitRateModel.kpi_by_range),
      hits: counts.hits - counts.duds,
      duds: counts.duds,
      misses: counts.misses,
      capacity: this.torpedoes.capacity,
      destroyerSunk: this.destroyer.sinking,
      survived: !this.boat.sinking,
      elapsedS: this.elapsedS,
      seed: this.seed,
      hpLeft: this.damage.hp,
      hpMax: this.damageParams.maxHp,
    };
    this.scene.start(SCENE_KEYS.result, result);
  }
}
