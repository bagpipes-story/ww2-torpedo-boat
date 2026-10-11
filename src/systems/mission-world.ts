// 任務の「世界」（v0.2.2 で mission-scene から分割）: 自艇・駆逐艦・魚雷・反撃・煙幕・被害・燃料（v0.3.0）・味方機（v0.3.3）を持ち、固定ステップで進める。
// data からの数値の組み立ては world-setup.ts、Scene への通知は world-events.ts、入力の消費は world-input.ts（v0.3.3 で切り出し）。
// カメラ・テレメトリ・終了判定・Result は MissionScene が持つ。§7: 毎ステップ確保しない。発射・命中・終了のときだけ確保する。
import type Phaser from 'phaser';
import { DEBUG_DAWN_S, DEBUG_FRIENDLY_FORCE, DEBUG_FUEL_ALLOTMENT_GAL, FIXED_STEP_S, MAX_STEPS_PER_FRAME } from '../config/game-config';
import type { GameData } from '../config/game-data';
import { SMALL_HIT_DAMAGE_RATIO, SMOKE_POOL_SIZE } from '../config/ui-config';
import { clampToBounds, nextSpeedBand, stepBoat, type BoatParams, type SeaBounds, type SpeedStep } from '../core/boat-motion';
import { FixedStepper } from '../core/fixed-stepper';
import { createFuelState, stepFuel, type FuelCurve, type FuelState } from '../core/fuel';
import { applyShellHit, createDamageState, stepDamage, type DamageParams, type DamageState, type HitOutcome, type HitSpec } from '../core/gunnery';
import type { ShotRecord } from '../core/hit-rate';
import type { InputState } from '../core/input-state';
import { insideRing, type MissionEndReason, type ReturnPoint } from '../core/mission-flow';
import { SeededRng } from '../core/rng';
import { SHALLOW_NONE, shallowIndexAt, updateShallowStatus, type GroundingParams, type ShallowRect, type ShallowStatus } from '../core/shallows';
import { createSmokeState, losBlocked, updateSmoke, type SmokeParams, type SmokeState } from '../core/smoke';
import type { TorpedoParams } from '../core/torpedo';
import { enemyDetectRangeM, speedFactorForBand, type VisibilityParams } from '../core/visibility';
import { Destroyer } from '../entities/destroyer';
import { PlayerBoat } from '../entities/player-boat';
import { EnemyFire } from './enemy-fire';
import { FriendlyFire } from './friendly-fire';
import { SmokeScreen } from './smoke-screen';
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
  readonly params: BoatParams;
  readonly bounds: SeaBounds;
  /** 夜明けまでの実時間秒（任務の制限時間。?debug&dawn= で上書き可） */
  readonly durationS: number;
  readonly missionType: string;
  /** 帰投地点の輪と燃料（docs/02 §6.7） */
  readonly returnPoint: ReturnPoint;
  readonly fuelCurve: FuelCurve;
  readonly fuel: FuelState;
  readonly fuelAllotmentGal: number;
  /** 自艇が帰投地点の輪の中にいる（固定ステップで距離の二乗で判定） */
  atHome = false;
  /** 浅瀬（docs/02 §6.8）と座礁の判定。座礁すると速力 0 で動けない */
  readonly shallows: ShallowRect[];
  readonly grounding: GroundingParams;
  grounded = false;
  /** 浅瀬の HUD 状態（毎フレーム更新。Scene のテレメトリと味方機の開始条件が読む） */
  readonly shallowStatus: ShallowStatus = { state: SHALLOW_NONE, aheadM: 0 };
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
  readonly seed: number;
  hits = 0;
  /** 現在の速力帯（ヒステリシス付き）。HUD の表示と発見距離の係数を同じ帯で決める */
  band: SpeedStep = 'stop';
  /** 敵がこのステップで自艇を見つける距離 m */
  detectRangeM = 0;
  /** 艦と艇を結ぶ線分が煙に遮られている（発見距離 × smoke_factor、探照灯・星弾は照らせない） */
  hiddenBySmoke = false;
  readonly visRange2: number;
  /** 命中スローの残り実秒。0 より大きい間は dt に slowMoFactor を掛ける */
  slowMoLeftS = 0;

  /** data から組み立てた数値（world-setup.ts）。固定ステップはここから読む */
  private readonly setup: WorldSetup;
  private readonly events: WorldEvents;
  private readonly smokeScreen: SmokeScreen | null;
  private readonly gunRng: SeededRng;
  private readonly hitOutcome: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
  /** 無傷時の最大速力（機関損傷で params.speedMaxMps を下げる） */
  private readonly speedMaxBaseMps: number;
  /** 消火ボタンを押し続けている実秒（火災中だけ数える。extinguish_hold_s 以上で消火） */
  private extinguishHeldS = 0;
  /** 火災で沈んだときの終了理由＝火災を起こした原因（砲撃か味方機の掃射か） */
  private fireReason: MissionEndReason = 'destroyed';
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
    if (!this.boat.sinking) {
      if (this.grounded) {
        boat.speedMps = 0;
      } else {
        // 燃料切れなら漂流（舵も速度指令も効かない）。燃料は運動と同じ game dt で積分するので、距離あたりの消費はステップ幅・スローに依らない
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
    // 煙幕: 展開中は艇尾に煙を置き、艦→艇の視線が遮られていれば隠れている（docs/02 §6.5）
    if (this.smoke && this.smokeParams) {
      updateSmoke(this.smoke, this.smokeParams, boat, c.boundsMarginM, feelDt);
      this.hiddenBySmoke = !d.sinking && losBlocked(this.smoke, this.smokeParams, d.state.x, d.state.y, boat.x, boat.y);
    }
    // 敵がこのステップで自艇を見つける距離 = 基準 × 速力帯の係数 × 月明 × 煙幕
    this.band = nextSpeedBand(this.band, boat.speedMps, this.params);
    this.detectRangeM = enemyDetectRangeM(c.baseDetectM, speedFactorForBand(this.band, this.vis.speedFactor), this.vis, this.hiddenBySmoke);
    d.step(dt, feelDt, boat, this.detectRangeM, this.vis.detectHoldS, this.torpedoes.states);
    this.torpedoes.step(dt, feelDt, d.sinking ? null : d.circles, d.state.x, d.state.y, c.passRadius2, this.torpedoEvents);
    if (!this.boat.sinking && d.touchesBoat(boat, c.boatHalfLengthM)) this.sinkBoat('rammed');
    // 反撃: 発見中なら探照灯・星弾（煙に遮られていれば照らせない）、照らされていれば砲撃。どちらかが沈没中なら撃たない（飛んでいる弾は着弾まで進む）
    const alive = !d.sinking && !this.boat.sinking;
    this.enemyFire.step(dt, feelDt, d.state, boat, d.ai.playerDetected && !d.sinking, alive, c.boatHalfLengthM, c.boatHalfBeamM, this.hiddenBySmoke);
    if (!this.boat.sinking && stepDamage(this.damage, this.damageParams, feelDt)) this.sinkBoat(this.fireReason);
    // 味方機は敵の処理の後（v0.3.2 までの順序を変えない）
    this.friendly?.step(feelDt, this);
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
    // data からの数値はすべて world-setup で組み立てる（?debug の上書き込み）。ここではそれを持ち、エンティティを作るだけ
    const s = buildWorldSetup(data, missionId, DEBUG_FUEL_ALLOTMENT_GAL, DEBUG_DAWN_S);
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
    this.fuel = createFuelState(s.fuelAllotmentGal);
    this.speedMaxBaseMps = this.params.speedMaxMps;
    this.damageParams = s.damageParams;
    this.damage = createDamageState(this.damageParams);
    this.vis = s.vis;
    this.visRange2 = s.visRange2;
    this.detectRangeM = s.detectRangeAtStartM;
    this.torpedoParams = s.torpedoParams;

    // スティック中立=停止なので、出発時は停止している（docs/02 §5、v0.2.1）
    this.boat = new PlayerBoat(scene, mission.playerStart, 0);
    this.destroyer = new Destroyer(scene, mission.enemyStart, s.destroyerSpec, s.shipAi, this.bounds);
    this.torpedoes = new TorpedoPool(scene, this.torpedoParams, s.torpedoCapacity, this.bounds);
    // 砲撃のばらつきは別系列（seed+1）で、発射順に影響されない
    this.gunRng = new SeededRng((seed + 1) >>> 0);
    this.enemyFire = new EnemyFire(scene, s.gunneryParams, this.gunRng, mission.enemyStart.headingDeg);
    this.enemyFire.setHitHandler((gunIndex, x, y) => this.applyHit(s.gunneryParams.guns[gunIndex]!, this.gunRng, x, y, 'destroyed'));
    this.launcher = new TorpedoLauncher(this.torpedoes, new SeededRng(seed), s.torpedoReliability, s.torpedoJitterDeg, s.launchOffsetM, s.salvoIntervalS);
    this.smokeParams = s.smokeParams;
    this.smoke = this.smokeParams ? createSmokeState(SMOKE_POOL_SIZE) : null;
    this.smokeScreen = this.smokeParams ? new SmokeScreen(scene, this.smokeParams) : null;
    // 味方機の掃射の抽選も別系列（seed+2）。掃射の被害は砲弾と同じ経路（applyHit）
    const fp = s.friendly;
    const friendlyRng = new SeededRng((seed + 2) >>> 0);
    const splash = (x: number, y: number, hit: boolean): void => this.enemyFire.splash(x, y, hit);
    this.friendly = fp ? new FriendlyFire(scene, fp, DEBUG_FRIENDLY_FORCE, splash, (x, y) => this.applyHit(fp.hit, friendlyRng, x, y, 'friendly_fire')) : null;
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
      this.extinguishHeldS = consumeSmokeInput(this.input, this.smoke, this.smokeParams, this.damage, this.extinguishHeldS, realDt);
      this.launcher.update(realDt, this.boat.state, this.destroyer.state);
      if (Number.isNaN(this.fuelAtFirstLaunchGal) && this.torpedoes.remaining < this.torpedoes.capacity) this.fuelAtFirstLaunchGal = this.fuel.gal;
    }
    this.stepper.advance(realDt, this.stepFn);
    if (this.slowMoLeftS > 0) this.slowMoLeftS -= realDt;
    this.refreshShallowStatus();
    this.boat.syncSprite();
    this.destroyer.syncSprite();
    this.torpedoes.updateVisuals(realDt);
    this.enemyFire.updateVisuals(realDt, this.destroyer.state);
    if (this.smokeScreen && this.smoke && this.smokeParams) this.smokeScreen.updateVisuals(this.smoke, this.smokeParams);
    this.friendly?.updateVisuals(realDt, this);
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

  /** 砲弾か掃射が命中: HP を減らし、火災・機関損傷を抽選。機関損傷は最大速力を下げる（data: damage.engine_damage_speed_factor）。HP 0 で沈没（理由は命中の種類） */
  private applyHit(spec: HitSpec, rng: SeededRng, x: number, y: number, reason: MissionEndReason): void {
    if (this.boat.sinking) return;
    const o = applyShellHit(this.damage, spec, this.damageParams, rng, this.hitOutcome);
    if (o.engineHit) {
      this.params.speedMaxMps = this.speedMaxBaseMps * this.damageParams.engineSpeedFactor;
      if (this.params.speedCruiseMps > this.params.speedMaxMps) this.params.speedCruiseMps = this.params.speedMaxMps;
    }
    if (o.startedFire) this.fireReason = reason;
    this.events.onShellHit(x, y, spec.damage < this.damageParams.maxHp * SMALL_HIT_DAMAGE_RATIO, o.destroyed);
    if (o.destroyed) this.sinkBoat(reason);
  }

  /** 自艇の沈没（体当たり・砲撃・掃射・火災）。HP 0・火災なしにして演出、完了で onBoatSunk */
  private sinkBoat(reason: MissionEndReason): void {
    if (this.boat.sinking) return;
    // 沈んだ艇の HP は 0、火災も消す（体当たりでも HUD と Result が 100 のままにならないように）
    this.damage.hp = 0;
    this.damage.fireLeftS = 0;
    this.slowMoLeftS = this.setup.slowMoSeconds;
    const s = this.boat.state;
    this.events.onBoatSinking(s.x, s.y);
    this.boat.playSinking(() => this.events.onBoatSunk(reason));
  }
}
