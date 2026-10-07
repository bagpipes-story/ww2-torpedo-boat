// 任務の「世界」（v0.2.2 で mission-scene から分割）: 自艇・駆逐艦・魚雷・反撃・煙幕・被害・燃料（v0.3.0）を持ち、固定ステップで進める。
// カメラ・テレメトリ・終了判定・Result は MissionScene が持つ。世界で起きたことは WorldEvents で Scene に伝える（引数はプリミティブ）。
// §7: 毎ステップ確保しない。発射・命中・終了のときだけ確保する。
import type Phaser from 'phaser';
import { DEBUG_DAWN_S, DEBUG_FUEL_ALLOTMENT_GAL, FIXED_STEP_S, MAX_STEPS_PER_FRAME } from '../config/game-config';
import {
  effectiveFuelAllotmentGal,
  getBoatDamageParams,
  getBoatFuelCurve,
  getBoatRecord,
  getBoatSmokeParams,
  getBoatTorpedoCount,
  getEnemyRecord,
  getEvasionMultiplier,
  getPrototypeMission,
  getTorpedoRecord,
  getVisibilityParams,
  type GameData,
} from '../config/game-data';
import { SMALL_HIT_DAMAGE_RATIO, SMOKE_POOL_SIZE } from '../config/ui-config';
import {
  boatParamsFromData,
  clampToBounds,
  nextSpeedBand,
  stepBoat,
  type BoatInput,
  type BoatParams,
  type SeaBounds,
  type SpeedStep,
} from '../core/boat-motion';
import { FixedStepper } from '../core/fixed-stepper';
import { createFuelState, stepFuel, type FuelCurve, type FuelState } from '../core/fuel';
import { insideRing, type ReturnPoint } from '../core/mission-flow';
import { applyShellHit, createDamageState, gunneryParamsFromData, stepDamage, type DamageParams, type DamageState, type GunneryParams, type HitOutcome } from '../core/gunnery';
import type { ShotRecord } from '../core/hit-rate';
import type { InputState } from '../core/input-state';
import { SeededRng } from '../core/rng';
import { shipAiParamsFromData } from '../core/ship-ai';
import { createSmokeState, losBlocked, startSmoke, updateSmoke, type SmokeParams, type SmokeState } from '../core/smoke';
import { torpedoParamsFromData, torpedoReliabilityFromData, type TorpedoParams } from '../core/torpedo';
import { enemyDetectRangeM, playerVisRangeM, speedFactorForBand, type VisibilityParams } from '../core/visibility';
import { Destroyer } from '../entities/destroyer';
import { PlayerBoat } from '../entities/player-boat';
import type { MissionEndReason } from '../core/mission-flow';
import { EnemyFire } from './enemy-fire';
import { SmokeScreen } from './smoke-screen';
import { TorpedoLauncher } from './torpedo-launcher';
import { TorpedoPool, type TorpedoEvents } from './torpedo-pool';

/** 燃料切れの漂流: 舵は効かず、目標速度 0 で惰性のまま止まる（params.speedMaxMps は機関損傷が書くので触らない） */
const DRIFT_INPUT: BoatInput = { headingDeg: NaN, speed01: 0 };

/** 世界で起きたことの通知。演出（爆発・揺れ・スロー）と終了は Scene が決める */
export interface WorldEvents {
  /** 魚雷が命中（不発含む）。不発でなければ hits は増えている */
  onTorpedoHit(x: number, y: number, dud: boolean): void;
  /** 駆逐艦の沈没演出が終わった（任務は続く。走っていた魚雷は外れとして確定済み） */
  onDestroyerSunk(): void;
  /** 砲弾が命中。small は演出を弱くする目安、destroyed なら続けて onBoatSinking が来る */
  onShellHit(x: number, y: number, small: boolean, destroyed: boolean): void;
  /** 自艇が沈み始めた（体当たり・砲撃）。位置は爆発の演出用 */
  onBoatSinking(x: number, y: number): void;
  /** 自艇の沈没演出が終わった */
  onBoatSunk(reason: MissionEndReason): void;
}

export class MissionWorld {
  readonly boat: PlayerBoat;
  readonly destroyer: Destroyer;
  readonly torpedoes: TorpedoPool;
  readonly launcher: TorpedoLauncher;
  readonly enemyFire: EnemyFire;
  readonly params: BoatParams;
  readonly bounds: SeaBounds;
  /** 夜明けまでの実時間秒（任務の制限時間。?debug&dawn= で上書き可） */
  readonly durationS: number;
  /** 任務の種類（スコアの達成点に使う） */
  readonly missionType: string;
  /** 帰投地点の輪と燃料（docs/02 §6.7） */
  readonly returnPoint: ReturnPoint;
  readonly fuelCurve: FuelCurve;
  readonly fuel: FuelState;
  readonly fuelAllotmentGal: number;
  /** 自艇が帰投地点の輪の中にいる（固定ステップで距離の二乗で判定） */
  atHome = false;
  /** 固定ステップで実際に進んだ実秒（夜明けの時計。低フレームレートで捨てた時間は数えない＝移動・燃料と揃う） */
  stepTimeS = 0;
  /** 初めて魚雷を撃ったときの燃料 gal（未発射なら NaN。Result に出す） */
  fuelAtFirstLaunchGal = NaN;
  readonly vis: VisibilityParams;
  readonly torpedoParams: TorpedoParams;
  readonly damage: DamageState;
  readonly damageParams: DamageParams;
  /** 煙幕発生器が無い艇なら null（docs/02 §5） */
  readonly smoke: SmokeState | null;
  readonly smokeParams: SmokeParams | null;
  readonly shots: ShotRecord[] = [];
  /** 乱数のシード。Result に表示する */
  readonly seed: number;
  hits = 0;
  /** 現在の速力帯（ヒステリシス付き）。HUD の表示と発見距離の係数を同じ帯で決める */
  band: SpeedStep = 'stop';
  /** 敵がこのステップで自艇を見つける距離 m */
  detectRangeM = 0;
  /** 艦と艇を結ぶ線分が煙に遮られている（発見距離 × smoke_factor、探照灯・星弾は照らせない） */
  hiddenBySmoke = false;
  /** 自艇の視程の二乗（敵の表示判定。Scene が使う） */
  readonly visRange2: number;
  /** 命中スローの残り実秒。0 より大きい間は dt に slowMoFactor を掛ける */
  slowMoLeftS = 0;

  private readonly events: WorldEvents;
  private readonly smokeScreen: SmokeScreen | null;
  private readonly gunneryParams: GunneryParams;
  private readonly gunRng: SeededRng;
  private readonly hitOutcome: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
  private readonly timeScale: number;
  private readonly slowMoFactor: number;
  private readonly slowMoSeconds: number;
  private readonly baseDetectM: number;
  /** 境界から押し戻す余白（m）。表示上の船体半分で、船首が境界線をはみ出さない。煙も同じ距離だけ後ろに置く */
  private readonly boundsMarginM: number;
  /** 体当たり・着弾判定に使う自艇の半長・半幅 m（hit_scale 込み） */
  private readonly boatHalfLengthM: number;
  private readonly boatHalfBeamM: number;
  /** 外れ確定の半径二乗: 目標中心からこれより離れて遠ざかれば通過したとみなす */
  private readonly passRadius2: number;
  /** 無傷時の最大速力（機関損傷で params.speedMaxMps を下げる） */
  private readonly speedMaxBaseMps: number;
  /** 煙幕ボタンを押し続けている実秒（火災中だけ数える。extinguish_hold_s 以上で消火） */
  private smokeHoldS = 0;
  /** この押下で消火した（離しても煙幕は展開しない） */
  private extinguishedThisPress = false;
  private readonly stepper = new FixedStepper(FIXED_STEP_S, MAX_STEPS_PER_FRAME);

  private readonly torpedoEvents: TorpedoEvents = {
    onHit: (x, y, dud, erratic, rangeAtLaunchM) => this.handleTorpedoHit(x, y, dud, erratic, rangeAtLaunchM),
    onMiss: (erratic, rangeAtLaunchM) => {
      this.shots.push({ rangeM: rangeAtLaunchM, hit: false, dud: false, erratic });
    },
  };

  private readonly stepFn = (realDt: number): void => {
    const factor = this.slowMoLeftS > 0 ? this.slowMoFactor : 1;
    const feelDt = realDt * factor;
    const dt = feelDt * this.timeScale;
    this.stepTimeS += realDt;
    const boat = this.boat.state;
    if (!this.boat.sinking) {
      // 燃料切れなら漂流（舵も速度指令も効かない）。燃料は運動と同じ game dt で積分するので、距離あたりの消費はステップ幅・スローに依らない
      stepBoat(boat, this.fuel.empty ? DRIFT_INPUT : this.input, this.params, dt);
      clampToBounds(boat, this.bounds, this.boundsMarginM);
      stepFuel(this.fuel, this.fuelCurve, boat.speedMps, dt);
      this.atHome = insideRing(this.returnPoint, boat.x, boat.y);
    }
    const d = this.destroyer;
    // 煙幕: 展開中は艇尾に煙を置き、艦→艇の視線が遮られていれば隠れている（docs/02 §6.5）
    if (this.smoke && this.smokeParams) {
      updateSmoke(this.smoke, this.smokeParams, boat, this.boundsMarginM, feelDt);
      this.hiddenBySmoke = !d.sinking && losBlocked(this.smoke, this.smokeParams, d.state.x, d.state.y, boat.x, boat.y);
    }
    // 敵がこのステップで自艇を見つける距離 = 基準 × 速力帯の係数 × 月明 × 煙幕
    this.band = nextSpeedBand(this.band, boat.speedMps, this.params);
    this.detectRangeM = enemyDetectRangeM(this.baseDetectM, speedFactorForBand(this.band, this.vis.speedFactor), this.vis, this.hiddenBySmoke);
    d.step(dt, feelDt, boat, this.detectRangeM, this.vis.detectHoldS, this.torpedoes.states);
    this.torpedoes.step(dt, feelDt, d.sinking ? null : d.circles, d.state.x, d.state.y, this.passRadius2, this.torpedoEvents);
    if (!this.boat.sinking && d.touchesBoat(boat, this.boatHalfLengthM)) this.sinkBoat('rammed');
    // 反撃: 発見中なら探照灯・星弾（煙に遮られていれば照らせない）、照らされていれば砲撃。どちらかが沈没中なら撃たない（飛んでいる弾は着弾まで進む）
    const alive = !d.sinking && !this.boat.sinking;
    this.enemyFire.step(dt, feelDt, d.state, boat, d.ai.playerDetected && !d.sinking, alive, this.boatHalfLengthM, this.boatHalfBeamM, this.hiddenBySmoke);
    if (!this.boat.sinking && stepDamage(this.damage, this.damageParams, feelDt)) this.sinkBoat('destroyed');
  };

  constructor(
    scene: Phaser.Scene,
    data: GameData,
    missionId: string,
    private readonly input: InputState,
    seed: number,
    events: WorldEvents,
  ) {
    this.events = events;
    this.seed = seed;
    const world = data.hitRateModel.world;
    const launch = data.hitRateModel.torpedo_launch;
    const feel = data.hitRateModel.feel;
    const mission = getPrototypeMission(data, missionId);
    const boatRecord = getBoatRecord(data, mission.playerBoatId);
    const enemyRecord = getEnemyRecord(data, mission.enemyId);
    const torpedoRecord = getTorpedoRecord(data, mission.torpedoId);

    this.params = boatParamsFromData(boatRecord);
    this.bounds = mission.bounds;
    this.missionType = mission.type;
    // ?debug&fuel=…&dawn=… のときだけ data の値を上書き（実機で割当と夜明けを比べるため）
    this.durationS = Number.isFinite(DEBUG_DAWN_S) ? DEBUG_DAWN_S : mission.durationS;
    this.returnPoint = mission.returnPoint;
    this.fuelCurve = getBoatFuelCurve(data, mission.playerBoatId);
    const allotment = effectiveFuelAllotmentGal(data, mission, DEBUG_FUEL_ALLOTMENT_GAL);
    if (allotment > this.fuelCurve.capacityGal) throw new Error(`${mission.id}: fuel_allotment_gal が艇の fuel_capacity_gal を超えている`);
    this.fuelAllotmentGal = allotment;
    this.fuel = createFuelState(allotment);
    this.boundsMarginM = (boatRecord.length_m * world.sprite_scale) / 2;
    this.boatHalfLengthM = (boatRecord.length_m * world.hit_scale) / 2;
    this.boatHalfBeamM = (boatRecord.beam_m * world.hit_scale) / 2;
    this.speedMaxBaseMps = this.params.speedMaxMps;
    this.gunneryParams = gunneryParamsFromData(enemyRecord);
    this.damageParams = getBoatDamageParams(data, mission.playerBoatId);
    this.damage = createDamageState(this.damageParams);
    this.timeScale = world.time_scale;
    this.slowMoFactor = feel.hit_slowmo_factor;
    this.slowMoSeconds = feel.hit_slowmo_seconds;

    this.vis = getVisibilityParams(data, mission.moon);
    this.baseDetectM = enemyRecord.detection.base_detect_m;
    const visRange = playerVisRangeM(this.vis);
    this.visRange2 = visRange * visRange;
    // 最初の固定ステップが回る前のフレームでも HUD に正しい発見距離が出るよう、出発時の速力帯（停止）で先に計算する
    this.detectRangeM = enemyDetectRangeM(this.baseDetectM, speedFactorForBand(this.band, this.vis.speedFactor), this.vis, false);

    // スティック中立=停止なので、出発時は停止している（docs/02 §5、v0.2.1）
    this.boat = new PlayerBoat(scene, mission.playerStart, 0);
    this.destroyer = new Destroyer(
      scene,
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
    this.torpedoes = new TorpedoPool(scene, this.torpedoParams, capacity, this.bounds);
    // 砲撃のばらつきは別系列（seed+1）で、発射順に影響されない
    this.gunRng = new SeededRng((seed + 1) >>> 0);
    this.enemyFire = new EnemyFire(scene, this.gunneryParams, this.gunRng, mission.enemyStart.headingDeg);
    this.enemyFire.setHitHandler((gunIndex, x, y) => this.handleShellHit(gunIndex, x, y));
    this.launcher = new TorpedoLauncher(
      this.torpedoes,
      new SeededRng(seed),
      torpedoReliabilityFromData(torpedoRecord),
      torpedoRecord.reliability.jitter_deg,
      boatRecord.beam_m / 2,
      launch.salvo_interval_s,
    );
    this.smokeParams = getBoatSmokeParams(data, mission.playerBoatId);
    this.smoke = this.smokeParams ? createSmokeState(SMOKE_POOL_SIZE) : null;
    this.smokeScreen = this.smokeParams ? new SmokeScreen(scene, this.smokeParams) : null;
  }

  /** 毎フレーム: 入力を消費し、固定ステップを回し、見た目を同期する */
  updateFrame(realDt: number): void {
    if (!this.boat.sinking) {
      // 駆逐艦が沈み始めた後と帰投地点の輪の中では新しい発射はしない（フラグは消す。輪の中で撃った魚雷が「帰投したので外れ」と記録されないように）。煙幕は漂流中でも使える
      if (this.destroyer.sinking || this.atHome) this.discardFireInput();
      else this.consumeFireInput();
      this.consumeSmokeInput(realDt);
      this.launcher.update(realDt, this.boat.state, this.destroyer.state);
      if (Number.isNaN(this.fuelAtFirstLaunchGal) && this.torpedoes.remaining < this.torpedoes.capacity) this.fuelAtFirstLaunchGal = this.fuel.gal;
    }
    this.stepper.advance(realDt, this.stepFn);
    if (this.slowMoLeftS > 0) this.slowMoLeftS -= realDt;
    this.boat.syncSprite();
    this.destroyer.syncSprite();
    this.torpedoes.updateVisuals(realDt);
    this.enemyFire.updateVisuals(realDt, this.destroyer.state);
    if (this.smokeScreen && this.smoke && this.smokeParams) this.smokeScreen.updateVisuals(this.smoke, this.smokeParams);
  }

  /** 走っている魚雷か発射待ちがある（帰投の輪の中で決着を待つ判定に使う） */
  get torpedoesRunning(): boolean {
    return this.torpedoes.unresolvedCount > 0 || this.launcher.queued > 0;
  }

  /** 煙幕の残り実秒（無い艇は 0） */
  get smokeLeftS(): number {
    return this.smoke ? Math.max(0, this.smoke.activeLeftS) : 0;
  }

  get smokeCooldownS(): number {
    return this.smoke ? Math.max(0, this.smoke.cooldownLeftS) : 0;
  }

  /** 走っている魚雷を外れとして確定する（終了時。Result の集計から漏れないようにする） */
  resolveRemainingAsMisses(): void {
    this.torpedoes.resolveRemainingAsMisses(this.torpedoEvents);
  }

  destroy(): void {
    this.torpedoes.destroy();
    this.enemyFire.destroy();
    this.smokeScreen?.destroy();
    this.destroyer.destroy();
    this.boat.destroy();
  }

  /** 発射要求を捨てる（駆逐艦が沈み始めた後・帰投地点の輪の中） */
  private discardFireInput(): void {
    this.input.fireTap = false;
    this.input.fireSalvoSpreadDeg = NaN;
  }

  /** HUD からの発射要求を消費する。タップは 1 本、一斉は残弾すべてを扇状に（間隔は launcher が持つ） */
  private consumeFireInput(): void {
    const input = this.input;
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

  /**
   * 煙幕ボタン（docs/02 §5・§6.6）: 火災中に extinguish_hold_s 以上押し続けると消火。離したとき（smokeTap）、その押下で消火していなければ展開（冷却中は無視）。
   * 押している時間は燃えている間だけ数える（火災が無いときから押し続けていても、後で起きた火災が即座に消えないように。レビューで判明）。
   * 消火したら数え直す。押下の長さで展開を捨てる判定は HUD/キーボードではなくここで行う（0.3 秒以上の押下が何もしない空白を作らない）。
   */
  private consumeSmokeInput(realDt: number): void {
    const input = this.input;
    const p = this.smokeParams;
    if (input.smokeHeld && p && this.damage.fireLeftS > 0) {
      this.smokeHoldS += realDt;
      if (this.smokeHoldS >= p.extinguishHoldS) {
        this.damage.fireLeftS = 0;
        this.smokeHoldS = 0;
        this.extinguishedThisPress = true;
      }
    } else {
      this.smokeHoldS = 0;
    }
    if (input.smokeTap) {
      input.smokeTap = false;
      if (!this.extinguishedThisPress && this.smoke && p) startSmoke(this.smoke, p);
      this.extinguishedThisPress = false;
    }
  }

  private handleTorpedoHit(x: number, y: number, dud: boolean, erratic: boolean, rangeAtLaunchM: number): void {
    this.shots.push({ rangeM: rangeAtLaunchM, hit: true, dud, erratic });
    if (!dud) {
      this.hits++;
      this.slowMoLeftS = this.slowMoSeconds;
      if (this.destroyer.takeHit()) {
        // 沈み始めたら残りの一斉発射は撃たない。演出が終わったら走っている魚雷を外れとして確定する（v0.2 の「撃沈で終了」と同じ記録。艦が無いと通過判定が無く、海域を出るまで決着しないため）
        this.launcher.clearQueue();
        this.destroyer.playSinking(() => {
          this.resolveRemainingAsMisses();
          this.events.onDestroyerSunk();
        });
      }
    }
    this.events.onTorpedoHit(x, y, dud);
  }

  /** 砲弾が命中: HP を減らし、火災・機関損傷を抽選。機関損傷は最大速力を下げる（data: damage.engine_damage_speed_factor）。HP 0 で沈没 */
  private handleShellHit(gunIndex: number, x: number, y: number): void {
    if (this.boat.sinking) return;
    const gun = this.gunneryParams.guns[gunIndex]!;
    const o = applyShellHit(this.damage, gun, this.damageParams, this.gunRng, this.hitOutcome);
    if (o.engineHit) {
      this.params.speedMaxMps = this.speedMaxBaseMps * this.damageParams.engineSpeedFactor;
      if (this.params.speedCruiseMps > this.params.speedMaxMps) this.params.speedCruiseMps = this.params.speedMaxMps;
    }
    this.events.onShellHit(x, y, gun.damage < this.damageParams.maxHp * SMALL_HIT_DAMAGE_RATIO, o.destroyed);
    if (o.destroyed) this.sinkBoat('destroyed');
  }

  /** 自艇の沈没（体当たり・砲撃）。HP 0・火災なしにして演出、完了で onBoatSunk */
  private sinkBoat(reason: MissionEndReason): void {
    if (this.boat.sinking) return;
    // 沈んだ艇の HP は 0、火災も消す（体当たりでも HUD と Result が 100 のままにならないように）
    this.damage.hp = 0;
    this.damage.fireLeftS = 0;
    this.slowMoLeftS = this.slowMoSeconds;
    const s = this.boat.state;
    this.events.onBoatSinking(s.x, s.y);
    this.boat.playSinking(() => this.events.onBoatSunk(reason));
  }
}
