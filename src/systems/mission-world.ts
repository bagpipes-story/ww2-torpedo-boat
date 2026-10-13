// 任務の「世界」（v0.2.2 で mission-scene から分割）: 自艇・駆逐艦・魚雷・反撃・煙幕・被害・燃料（v0.3.0）・味方機（v0.3.3）・出撃（Sortie。v0.4.0）を持ち、固定ステップで進める。
// data からの数値の組み立ては world-setup.ts、Scene への通知は world-events.ts、入力の消費は world-input.ts（v0.3.3 で切り出し）。
// カメラ・テレメトリ・終了判定・Result は MissionScene が持つ。§7: 毎ステップ確保しない。発射・命中・終了のときだけ確保する。
import type Phaser from 'phaser';
import { DEBUG_DAWN_S, DEBUG_FRIENDLY_FORCE, DEBUG_FUEL_ALLOTMENT_GAL, DEBUG_SEAPLANE, DEBUG_SEAPLANE_OFF, DEBUG_STORM_OFF, DEBUG_STORM_START_Y, FIXED_STEP_S, MAX_STEPS_PER_FRAME } from '../config/game-config';
import type { GameData } from '../config/game-data';
import { SMALL_HIT_DAMAGE_RATIO, SMOKE_POOL_SIZE } from '../config/ui-config';
import { clampToBounds, nextSpeedBand, setPerformance, stepBoat, type BoatParams, type SeaBounds, type SpeedStep } from '../core/boat-motion';
import { FixedStepper } from '../core/fixed-stepper';
import { crewAccelFactor, crewExtinguishFactor, crewLost, crewTurnFactor } from '../core/crew';
import { createFuelState, stepFuel, type FuelCurve, type FuelState } from '../core/fuel';
import { stepDamage, type DamageParams, type DamageState, type HitSpec } from '../core/gunnery';
import type { ShotRecord } from '../core/hit-rate';
import type { InputState } from '../core/input-state';
import { insideRing, type MissionEndReason, type ReturnPoint } from '../core/mission-flow';
import { SeededRng } from '../core/rng';
import { SHALLOW_NONE, shallowIndexAt, updateShallowStatus, type GroundingParams, type ShallowRect, type ShallowStatus } from '../core/shallows';
import { createSmokeState, losBlocked, updateSmoke, type SmokeParams, type SmokeState } from '../core/smoke';
import { startDamageState, type Sortie } from '../core/sortie';
import type { TorpedoParams } from '../core/torpedo';
import { enemyDetectRangeM, speedFactorForBand, type VisibilityParams } from '../core/visibility';
import { Destroyer } from '../entities/destroyer';
import { PlayerBoat } from '../entities/player-boat';
import { BoatDamage } from './boat-damage';
import { EnemyFire } from './enemy-fire';
import { EnemySeaplane } from './enemy-seaplane';
import { FriendlyFire } from './friendly-fire';
import { SmokeScreen } from './smoke-screen';
import { StormFront } from './storm-front';
import { TorpedoLauncher } from './torpedo-launcher';
import { TorpedoPool, type TorpedoEvents } from './torpedo-pool';
import { DRIFT_INPUT, type WorldEvents } from './world-events';
import { consumeFireInput, consumeIdentifyInput, consumeSmokeInput, discardFireInput } from './world-input';
import { buildWorldSetup, type WorldSetup } from './world-setup';

export type { WorldEvents } from './world-events';

export class MissionWorld {
  readonly boat: PlayerBoat;
  readonly destroyer: Destroyer;
  readonly torpedoes: TorpedoPool;
  readonly launcher: TorpedoLauncher;
  readonly enemyFire: EnemyFire;
  /** 味方機（友軍誤射。docs/02 §6.8）。任務に friendly_aircraft が無ければ null */
  readonly friendly: FriendlyFire | null;
  /** 暴風の帯（docs/02 §6.8、v0.3.4）。任務に storm が無いか ?debug&nostorm なら null */
  readonly storm: StormFront | null;
  readonly seaplane: EnemySeaplane | null; // 敵の水上機（docs/02 §6.8、v0.4.1）。任務に enemy_aircraft が無いか ?debug&noplane なら null
  flareLit = false; // 艇が水上機の照明弾の光の中（駆逐艦が遠くから見つけ、射程内なら撃つ）
  readonly params: BoatParams;
  readonly bounds: SeaBounds;
  readonly durationS: number;
  readonly missionType: string;
  readonly returnPoint: ReturnPoint;
  readonly fuelCurve: FuelCurve;
  readonly fuel: FuelState;
  readonly fuelAllotmentGal: number;
  atHome = false;
  readonly shallows: ShallowRect[];
  readonly grounding: GroundingParams;
  grounded = false;
  /** 浅瀬の HUD 状態（毎フレーム更新。Scene のテレメトリと味方機の開始条件が読む） */
  readonly shallowStatus: ShallowStatus = { state: SHALLOW_NONE, aheadM: 0 };
  /** 固定ステップで実際に進んだ実秒（夜明けの時計。低フレームレートで捨てた時間は数えない＝移動・燃料と揃う） */
  stepTimeS = 0;
  fuelAtFirstLaunchGal = NaN;
  readonly vis: VisibilityParams;
  readonly torpedoParams: TorpedoParams;
  readonly damage: DamageState;
  readonly damageParams: DamageParams;
  readonly smoke: SmokeState | null;
  readonly smokeParams: SmokeParams | null;
  readonly shots: ShotRecord[] = [];
  readonly seed: number;
  hits = 0;
  band: SpeedStep = 'stop';
  detectRangeM = 0;
  hiddenBySmoke = false;
  /** 自艇の視程の二乗（敵の表示判定。暴風の雨で毎ステップ更新） */
  visRange2: number;
  slowMoLeftS = 0;

  /** data から組み立てた数値（world-setup.ts）。固定ステップはここから読み、Scene は crew / storm を読む */
  readonly setup: WorldSetup;
  private readonly events: WorldEvents;
  private readonly smokeScreen: SmokeScreen | null;
  private readonly gunRng: SeededRng;
  /** 命中の適用と沈没の開始（砲弾・掃射・爆弾はすべてここを通る。v0.4.1 で切り出し） */
  private readonly boatDamage: BoatDamage;
  /** 旋回率・加速の基準（暴風 × 乗員の倍率を掛けて毎ステップ書く） */
  private readonly turnBaseDegS: number;
  private readonly accelBaseMps2: number;
  crewLostNow = 0; // 失った乗員（HP から。毎ステップ更新し、生成時は出撃時の HP から決める）
  private extinguishHeldS = 0;
  private readonly stepper = new FixedStepper(FIXED_STEP_S, MAX_STEPS_PER_FRAME);

  private readonly torpedoEvents: TorpedoEvents = {
    onHit: (x, y, dud, erratic, rangeAtLaunchM) => this.handleTorpedoHit(x, y, dud, erratic, rangeAtLaunchM),
    onMiss: (erratic, rangeAtLaunchM) => {
      this.shots.push({ rangeM: rangeAtLaunchM, hit: false, dud: false, erratic });
    },
  };

  private readonly stepFn = (realDt: number): void => {
    const c = this.setup;
    const factor = this.slowMoLeftS > 0 ? c.slowMoFactor : 1;
    const feelDt = realDt * factor;
    const dt = feelDt * c.timeScale;
    this.stepTimeS += realDt;
    const boat = this.boat.state;
    // 暴風（v0.3.4）: 帯を進め、速すぎれば波の叩きつけ（HP 0 で沈没）。判定は艇を動かす前の位置。旋回率の倍率は次の行で乗員と合成
    if (this.storm?.step(feelDt, boat, this.destroyer.state, !this.destroyer.sinking, this.damage, this.boat.sinking)) this.sinkBoat('storm');
    // 旋回率・加速 = 基準 × 暴風の帯の中 × 乗員の減り（v0.3.5。書く場所はここだけ）
    this.crewLostNow = crewLost(c.crew, this.damageParams.maxHp, this.damage.hp);
    setPerformance(this.params, this.turnBaseDegS, this.accelBaseMps2, (this.storm ? this.storm.turnFactor : 1) * crewTurnFactor(c.crewEffects, this.crewLostNow), crewAccelFactor(c.crewEffects, this.crewLostNow));
    if (!this.boat.sinking) {
      if (this.grounded) {
        boat.speedMps = 0;
      } else {
        // 燃料切れなら漂流（舵も速度指令も効かない）。燃料は運動と同じ game dt で積分する
        stepBoat(boat, this.fuel.empty ? DRIFT_INPUT : this.input, this.params, dt);
        clampToBounds(boat, this.bounds, c.boundsMarginM);
        // 浅瀬: 安全速力を超えて中に入ると座礁（docs/02 §6.8）。安全速力以下なら通れる
        if (boat.speedMps > this.grounding.safeSpeedMps && shallowIndexAt(this.shallows, boat.x, boat.y) >= 0) {
          this.grounded = true;
          boat.speedMps = 0;
          this.events.onGrounded(boat.x, boat.y);
        }
      }
      stepFuel(this.fuel, this.fuelCurve, boat.speedMps, dt);
      this.atHome = insideRing(this.returnPoint, boat.x, boat.y);
    }
    const d = this.destroyer;
    if (this.smoke && this.smokeParams) {
      updateSmoke(this.smoke, this.smokeParams, boat, c.boundsMarginM, feelDt);
      this.hiddenBySmoke = !d.sinking && losBlocked(this.smoke, this.smokeParams, d.state.x, d.state.y, boat.x, boat.y);
    }
    this.band = nextSpeedBand(this.band, boat.speedMps, this.params);
    this.seaplane?.step(feelDt, this); // 水上機（v0.4.1）は帯の後・発見距離の前（同じステップの帯で航跡を判定し、照明弾の上書きが同じステップの発見に効く）
    this.flareLit = this.seaplane ? this.seaplane.flareLit : false;
    this.detectRangeM = enemyDetectRangeM(c.baseDetectM, speedFactorForBand(this.band, this.vis.speedFactor), this.vis, this.hiddenBySmoke, this.storm ? this.storm.detectFactor : 1);
    if (this.flareLit && this.detectRangeM < c.seaplane!.flareRevealM) this.detectRangeM = c.seaplane!.flareRevealM;
    this.visRange2 = this.storm ? c.visRange2 * this.storm.visFactor2 : c.visRange2;
    d.step(dt, feelDt, boat, this.detectRangeM, this.vis.detectHoldS, this.torpedoes.states);
    this.torpedoes.step(dt, feelDt, d.sinking ? null : d.circles, d.state.x, d.state.y, c.passRadius2, this.torpedoEvents);
    if (!this.boat.sinking && d.touchesBoat(boat, c.boatHalfLengthM)) this.sinkBoat('rammed');
    // 反撃: 発見中なら探照灯・星弾（煙に遮られていれば照らせない）、照らされていれば砲撃。どちらかが沈没中なら撃たない（飛んでいる弾は着弾まで進む）
    const alive = !d.sinking && !this.boat.sinking;
    this.enemyFire.step(dt, feelDt, d.state, boat, d.ai.playerDetected && !d.sinking, alive, c.boatHalfLengthM, c.boatHalfBeamM, this.hiddenBySmoke, this.flareLit);
    if (!this.boat.sinking && stepDamage(this.damage, this.damageParams, feelDt)) this.sinkBoat(this.boatDamage.fireReason);
    this.friendly?.step(feelDt, this); // 味方機は敵の処理の後（v0.3.2 までの順序と乱数の系列を変えない）
  };

  constructor(
    scene: Phaser.Scene,
    data: GameData,
    readonly sortie: Sortie,
    private readonly input: InputState,
    events: WorldEvents,
  ) {
    this.events = events;
    const seed = (this.seed = sortie.seed);
    // data からの数値はすべて world-setup で組み立てる（?debug の上書き込み）。ここではそれを持ち、エンティティを作るだけ
    const s = buildWorldSetup(data, sortie.missionId, DEBUG_FUEL_ALLOTMENT_GAL, DEBUG_DAWN_S, DEBUG_STORM_OFF, sortie, DEBUG_SEAPLANE_OFF);
    this.setup = s;
    const mission = s.mission;
    this.params = s.boatParams;
    this.bounds = mission.bounds;
    this.missionType = mission.type;
    this.shallows = mission.shallows;
    this.grounding = s.grounding;
    this.durationS = s.durationS;
    this.returnPoint = mission.returnPoint;
    this.fuelCurve = s.fuelCurve;
    this.fuelAllotmentGal = s.fuelAllotmentGal;
    this.fuel = createFuelState(s.fuelStartGal);
    this.turnBaseDegS = this.params.turnRateDegS;
    this.accelBaseMps2 = this.params.accelMps2;
    this.damageParams = s.damageParams;
    this.damage = startDamageState(this.damageParams, s.start);
    this.crewLostNow = crewLost(s.crew, this.damageParams.maxHp, this.damage.hp);
    this.vis = s.vis;
    this.visRange2 = s.visRange2;
    this.detectRangeM = s.detectRangeAtStartM;
    this.torpedoParams = s.torpedoParams;

    // スティック中立=停止なので、出発時は停止している（docs/02 §5、v0.2.1）
    this.boat = new PlayerBoat(scene, mission.playerStart, 0);
    this.boatDamage = new BoatDamage(this.boat, this.damage, this.damageParams, this.params, events, SMALL_HIT_DAMAGE_RATIO);
    this.destroyer = new Destroyer(scene, mission.enemyStart, s.destroyerSpec, s.shipAi, this.bounds);
    this.torpedoes = new TorpedoPool(scene, this.torpedoParams, s.torpedoCapacity, this.bounds);
    // 砲撃のばらつきは別系列（seed+1）で、発射順に影響されない
    this.gunRng = new SeededRng((seed + 1) >>> 0);
    this.enemyFire = new EnemyFire(scene, s.gunneryParams, this.gunRng, mission.enemyStart.headingDeg);
    this.enemyFire.setHitHandler((gunIndex, x, y) => this.hitBoat(s.gunneryParams.guns[gunIndex]!, this.gunRng, x, y, 'destroyed'));
    this.launcher = new TorpedoLauncher(this.torpedoes, new SeededRng(seed), s.torpedoReliability, s.torpedoJitterDeg, s.launchOffsetM, s.salvoIntervalS);
    this.smokeParams = s.smokeParams;
    this.smoke = this.smokeParams ? createSmokeState(SMOKE_POOL_SIZE) : null;
    this.smokeScreen = this.smokeParams ? new SmokeScreen(scene, this.smokeParams) : null;
    // 味方機の掃射の抽選も別系列（seed+2）。掃射の被害は砲弾と同じ経路（boatDamage.applyHit）
    const fp = s.friendly;
    const friendlyRng = new SeededRng((seed + 2) >>> 0);
    const splash = (x: number, y: number, hit: boolean): void => this.enemyFire.splash(x, y, hit);
    this.friendly = fp ? new FriendlyFire(scene, fp, DEBUG_FRIENDLY_FORCE, splash, (x, y) => this.hitBoat(fp.hit, friendlyRng, x, y, 'friendly_fire')) : null;
    this.storm = s.storm ? new StormFront(scene, s.storm, seed, DEBUG_STORM_START_Y, this.boat.state, splash, (x, y) => this.events.onSlam(x, y)) : null;
    const sp = s.seaplane;
    const planeRng = new SeededRng((seed + 5) >>> 0); // 水上機の散布は別系列（seed+5）。爆弾の被害は砲弾と同じ経路（hitBoat）
    this.seaplane = sp ? new EnemySeaplane(scene, sp, DEBUG_SEAPLANE, planeRng, this.boat.state, splash, (x, y) => this.hitBoat(sp.bombHit, planeRng, x, y, 'bombed')) : null;
    this.refreshShallowStatus();
  }

  /** 毎フレーム: 入力を消費し、固定ステップを回し、見た目を同期する */
  updateFrame(realDt: number): void {
    // 識別は沈没中でも消費する（フラグを残さない）。ステップの前なので、猶予が尽きるフレームの押下も間に合う
    consumeIdentifyInput(this.input, this.friendly);
    if (!this.boat.sinking) {
      // 駆逐艦が沈み始めた後と帰投地点の輪の中では新しい発射はしない（フラグは消す。輪の中で撃った魚雷が「帰投したので外れ」と記録されないように）。煙幕は漂流中でも使える
      if (this.destroyer.sinking || this.atHome) discardFireInput(this.input);
      else consumeFireInput(this.input, this.launcher, this.boat.state, this.torpedoes.remaining);
      this.extinguishHeldS = consumeSmokeInput(this.input, this.smoke, this.smokeParams, this.damage, this.extinguishHeldS, realDt, this.extinguishHoldScale);
      this.launcher.update(realDt, this.boat.state, this.destroyer.state);
      if (Number.isNaN(this.fuelAtFirstLaunchGal) && this.torpedoes.remaining < this.torpedoes.capacity) this.fuelAtFirstLaunchGal = this.fuel.gal;
    }
    this.stepper.advance(realDt, this.stepFn);
    if (this.slowMoLeftS > 0) this.slowMoLeftS -= realDt;
    this.refreshShallowStatus();
    this.storm?.updateVisuals(realDt, this.boat.state);
    this.boat.syncSprite(this.storm ? this.storm.rollDeg : 0);
    this.destroyer.syncSprite();
    this.torpedoes.updateVisuals(realDt);
    this.enemyFire.updateVisuals(realDt, this.destroyer.state);
    if (this.smokeScreen && this.smoke && this.smokeParams) this.smokeScreen.updateVisuals(this.smoke, this.smokeParams);
    this.friendly?.updateVisuals(realDt, this);
    this.seaplane?.updateVisuals(this.boat.state);
  }

  /** 水上機が来ている（味方機の開始条件が読む） */
  get seaplaneActive(): boolean {
    return this.seaplane ? this.seaplane.active : false;
  }

  /** 消火の長押し秒に掛ける倍率（定員/生存。v0.3.5） */
  get extinguishHoldScale(): number {
    return crewExtinguishFactor(this.setup.crewEffects, this.setup.crew.total - this.crewLostNow, this.setup.crew.total);
  }

  /** 走っている魚雷か発射待ちがある（帰投の輪の中で決着を待つ判定に使う） */
  get torpedoesRunning(): boolean {
    return this.torpedoes.unresolvedCount > 0 || this.launcher.queued > 0;
  }

  /** 走っている魚雷を外れとして確定する（終了時。Result の集計から漏れないようにする） */
  resolveRemainingAsMisses(): void {
    this.torpedoes.resolveRemainingAsMisses(this.torpedoEvents);
  }

  destroy(): void {
    this.storm?.destroy();
    this.seaplane?.destroy();
    this.friendly?.destroy();
    this.torpedoes.destroy();
    this.enemyFire.destroy();
    this.smokeScreen?.destroy();
    this.destroyer.destroy();
    this.boat.destroy();
  }

  /** 浅瀬の警告（接近中は縁までの距離）。平方根は使わない */
  private refreshShallowStatus(): void {
    const b = this.boat.state;
    updateShallowStatus(this.shallowStatus, this.shallows, b.x, b.y, b.headingDeg, b.speedMps, this.grounding, this.setup.timeScale, this.grounded);
  }

  private handleTorpedoHit(x: number, y: number, dud: boolean, erratic: boolean, rangeAtLaunchM: number): void {
    this.shots.push({ rangeM: rangeAtLaunchM, hit: true, dud, erratic });
    if (!dud) {
      this.hits++;
      this.slowMoLeftS = this.setup.slowMoSeconds;
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

  /** 砲弾・掃射・爆弾の命中（中身は boat-damage）。沈み始めたら命中スローを掛ける */
  private hitBoat(spec: HitSpec, rng: SeededRng, x: number, y: number, reason: MissionEndReason): void {
    if (this.boatDamage.applyHit(spec, rng, x, y, reason)) this.slowMoLeftS = this.setup.slowMoSeconds;
  }

  /** 自艇の沈没（体当たり・火災・荒波。中身は boat-damage）。始まったら命中スローを掛ける */
  private sinkBoat(reason: MissionEndReason): void {
    if (this.boatDamage.sink(reason)) this.slowMoLeftS = this.setup.slowMoSeconds;
  }
}
