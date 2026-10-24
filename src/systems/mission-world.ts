// 任務の「世界」（v0.2.2 で mission-scene から分割）: 自艇・敵（駆逐艦か大発の隊。v0.4.2。米PT の隊 v0.6.3）・魚雷・艇の砲・反撃・煙幕・被害・燃料（v0.3.0）・危険（味方機・暴風・水上機）・出撃（v0.4.0）を持ち、固定ステップで進める。
// 数値は world-setup.ts、Scene への通知は world-events.ts、入力の消費は world-input.ts、危険の生成は world-hazards.ts、敵の側の生成は world-enemies.ts（v0.6.3）、敵の側の読み口は enemy-side.ts、大発と艇の砲は barge-hunt.ts、米PT は pt-squadron.ts、駆逐艦側の固定ステップは destroyer-step.ts（v0.4.4）、僚艇は escort-boat.ts（v0.4.4）。
// カメラ・テレメトリ・終了判定・Result は MissionScene が持つ。§7: 毎ステップ確保しない。発射・命中・終了のときだけ確保する。
import type Phaser from 'phaser';
import { FIXED_STEP_S, MAX_STEPS_PER_FRAME, boatTextureKey } from '../config/game-config';
import { debugSetupOptions } from '../config/debug-setup';
import type { GameData } from '../config/game-data';
import { SMALL_HIT_DAMAGE_RATIO, SMOKE_POOL_SIZE, SPLASH_POOL_SIZE, SPLASH_SCALE_HIT, SPLASH_SCALE_MISS } from '../config/ui-config';
import { clampToBounds, nextSpeedBand, setPerformance, stepBoat, type BoatParams, type SpeedStep } from '../core/boat-motion';
import { FixedStepper } from '../core/fixed-stepper';
import { crewAccelFactor, crewExtinguishFactor, crewLost, crewTurnFactor } from '../core/crew';
import { createFuelState, stepFuel, type FuelCurve, type FuelState } from '../core/fuel';
import { stepDamage, type DamageParams, type DamageState, type HitSpec } from '../core/gunnery';
import type { ShotRecord } from '../core/hit-rate';
import type { InputState } from '../core/input-state';
import { insideRing, type MissionEndReason, type ReturnPoint } from '../core/mission-flow';
import { SeededRng } from '../core/rng';
import { SHALLOW_NONE, shallowIndexAt, updateShallowStatus, type ShallowStatus } from '../core/shallows';
import { createSmokeState, losBlocked, updateSmoke, type SmokeParams, type SmokeState } from '../core/smoke';
import { startDamageState, type Sortie } from '../core/sortie';
import { enemyDetectRangeM, speedFactorForBand, type VisibilityParams } from '../core/visibility';
import { PlayerBoat } from '../entities/player-boat';
import type { BargeHunt } from './barge-hunt';
import { BoatDamage } from './boat-damage';
import { Convoy } from './convoy';
import type { DestroyerGroup } from './destroyer-group';
import { stepDestroyerSide } from './destroyer-step';
import type { EscortBoat } from './escort-boat';
import type { EnemySide } from './enemy-side';
import type { EnemySeaplane } from './enemy-seaplane';
import type { FriendlyFire } from './friendly-fire';
import type { PtSquadron } from './pt-squadron';
import { SmokeScreen } from './smoke-screen';
import { SplashPool } from './splash-pool';
import type { StormFront } from './storm-front';
import { TorpedoLauncher } from './torpedo-launcher';
import { TorpedoPool, type TorpedoEvents } from './torpedo-pool';
import { torpedoEventsFor } from './torpedo-hits';
import { WorldDawn } from './world-dawn';
import { buildEnemies } from './world-enemies';
import { buildHazards } from './world-hazards';
import { DRIFT_INPUT, type WorldEvents } from './world-events';
import { consumeFrameInput } from './world-input';
import { buildWorldSetup, type WorldSetup } from './world-setup';
export type { WorldEvents } from './world-events';

export class MissionWorld {
  readonly boat: PlayerBoat;
  readonly destroyers: DestroyerGroup | null; // 駆逐艦の隊とその反撃（us_02・us_01。v0.4.5 から複数隻）。大発の任務では null。敵の有無を問わない読み口は enemy
  readonly hunt: BargeHunt | null; // 大発の隊と艇の砲（docs/02 §6.4、v0.4.2）。任務に barges が無ければ null
  readonly pts: PtSquadron | null; // 敵の米PT の隊（docs/02 §6.4、v0.6.3）。任務に pt_boats が無ければ null
  readonly convoy: Convoy | null; // 味方の大発の輸送隊（docs/02 §6.4、v0.6.4。jp_01）。任務に convoy が無ければ null。米PT の標的スロットの的
  readonly escort: EscortBoat | null; // 僚艇（docs/02 §6.4、v0.4.4。要人脱出）。任務に escort が無ければ null
  readonly enemy: EnemySide;
  readonly torpedoes: TorpedoPool;
  readonly launcher: TorpedoLauncher;
  readonly splashes: SplashPool; // 水柱（砲弾・掃射・爆弾・波。v0.4.2 で EnemyFire から出した）
  /** 味方機（友軍誤射）・暴風の帯・敵の水上機（docs/02 §6.8）。任務の block が無いか ?debug で切れば null */
  readonly friendly: FriendlyFire | null;
  readonly storm: StormFront | null;
  readonly seaplane: EnemySeaplane | null;
  readonly dawn: WorldDawn; // 夜明けのラッチと夜明けの空襲（v0.6.1。world-dawn.ts）。夜明けは任務の終わりではない
  flareLit = false; // 艇が水上機の照明弾の光の中（駆逐艦が遠くから見つけ、射程内なら撃つ）
  readonly params: BoatParams;
  readonly returnPoint: ReturnPoint;
  readonly fuelCurve: FuelCurve;
  readonly fuel: FuelState;
  readonly fuelAllotmentGal: number;
  atHome = false;
  grounded = false;
  /** 浅瀬の HUD 状態（毎フレーム更新。Scene のテレメトリと味方機の開始条件が読む） */
  readonly shallowStatus: ShallowStatus = { state: SHALLOW_NONE, aheadM: 0 };
  stepTimeS = 0; // 固定ステップで実際に進んだ実秒（夜明けの時計。低フレームレートで捨てた時間は数えない＝移動・燃料と揃う）
  fuelAtFirstLaunchGal = NaN;
  readonly vis: VisibilityParams;
  readonly damage: DamageState;
  readonly damageParams: DamageParams;
  readonly smoke: SmokeState | null;
  readonly smokeParams: SmokeParams | null;
  readonly shots: ShotRecord[] = [];
  readonly seed: number;
  hits = 0;
  band: SpeedStep = 'stop';
  readonly detect = { count: 0, prev: false }; // 駆逐艦（v0.6.3 から米PT の隊も）に見つかった回数と前ステップの発見状態（destroyer-step・pt-squadron が数える。Result の「回避」。v0.4.4）
  detectRangeM = 0; // 敵が自艇を見つける距離（大発の任務では煙幕を掛けない値。煙幕は大発ごと）
  hiddenBySmoke = false;
  visRange2: number; // 自艇の視程の二乗（敵の表示判定。暴風の雨で毎ステップ更新）
  slowMoLeftS = 0;

  readonly setup: WorldSetup; // data から組み立てた数値（world-setup.ts）。固定ステップはここから読み、Scene は crew / storm を読む
  private readonly events: WorldEvents;
  private readonly smokeScreen: SmokeScreen | null;
  readonly gunRng: SeededRng; // 砲撃のばらつき（seed+1。world-enemies が作る。ヘッドレスの再生が状態を読む）
  private readonly boatDamage: BoatDamage; // 命中の適用と沈没の開始（砲弾・機銃・掃射・爆弾はすべてここを通る。v0.4.1 で切り出し）
  /** 旋回率・加速の基準（暴風 × 乗員の倍率を掛けて毎ステップ書く） */
  private readonly turnBaseDegS: number;
  private readonly accelBaseMps2: number;
  crewLostNow = 0; // 失った乗員（HP から。毎ステップ更新し、生成時は出撃時の HP から決める）
  extinguishHeldS = 0; // 消火ボタンを押し続けている実秒（world-input だけが書く）
  private readonly stepper = new FixedStepper(FIXED_STEP_S, MAX_STEPS_PER_FRAME);

  readonly torpedoEvents: TorpedoEvents; // 魚雷の命中・外れの記録と撃沈の開始（torpedo-hits.ts。v0.4.2 で切り出し。destroyer-step が読む）

  private readonly stepFn = (realDt: number): void => {
    const c = this.setup;
    const factor = this.slowMoLeftS > 0 ? c.slowMoFactor : 1;
    const feelDt = realDt * factor;
    const dt = feelDt * c.timeScale;
    this.stepTimeS += realDt;
    this.dawn.latch(this); // 夜明けのラッチ（v0.6.1）は時計を進めた直後・自艇を動かす前（atHome は夜明けの瞬間の位置）
    const boat = this.boat.state;
    const g = this.destroyers;
    // 最寄りの浮いている駆逐艦（雨の線・煙幕の線の相手。1 隻ならその艦。v0.4.5）
    const dn = g ? g.nearestAfloat(boat.x, boat.y) : null;
    // 暴風（v0.3.4）: 帯を進め、速すぎれば波の叩きつけ（HP 0 で沈没）。判定は艇を動かす前の位置。雨の線は駆逐艦とだけ（大発の任務は線なし）
    if (this.storm?.step(feelDt, boat, dn ? dn.state : boat, dn !== null, this.damage, this.boat.sinking)) this.sinkBoat('storm');
    // 旋回率・加速 = 基準 × 暴風の帯の中 × 乗員の減り（v0.3.5。書く場所はここだけ）
    this.crewLostNow = crewLost(c.crew, this.damageParams.maxHp, this.damage.hp);
    setPerformance(this.params, this.turnBaseDegS, this.accelBaseMps2, (this.storm ? this.storm.turnFactor : 1) * crewTurnFactor(c.crewEffects, this.crewLostNow), crewAccelFactor(c.crewEffects, this.crewLostNow));
    if (!this.boat.sinking) {
      if (this.grounded) {
        boat.speedMps = 0;
      } else {
        // 燃料切れなら漂流（舵も速度指令も効かない）。燃料は運動と同じ game dt で積分する
        stepBoat(boat, this.fuel.empty ? DRIFT_INPUT : this.input, this.params, dt);
        clampToBounds(boat, c.mission.bounds, c.boundsMarginM);
        // 浅瀬: 安全速力を超えて中に入ると座礁（docs/02 §6.8）。安全速力以下なら通れる
        if (boat.speedMps > c.grounding.safeSpeedMps && shallowIndexAt(c.mission.shallows, boat.x, boat.y) >= 0) {
          this.grounded = true;
          boat.speedMps = 0;
          this.events.onGrounded(boat.x, boat.y);
        }
      }
      stepFuel(this.fuel, this.fuelCurve, boat.speedMps, dt);
      this.atHome = insideRing(this.returnPoint, boat.x, boat.y);
    }
    this.escort?.step(dt, boat, !this.boat.sinking); // 僚艇（v0.4.4）は自艇を動かした後・駆逐艦の前（同じステップの位置を駆逐艦が狙う）
    this.convoy?.step(dt); // 輸送隊（v0.6.4）も自艇の後・米PT の前（同じステップの大発の位置を米PT が狙う。模擬 core/convoy-sim と同じ順）
    if (this.smoke && this.smokeParams) {
      updateSmoke(this.smoke, this.smokeParams, boat, c.boundsMarginM, feelDt);
      if (g) this.hiddenBySmoke = dn !== null && losBlocked(this.smoke, this.smokeParams, dn.state.x, dn.state.y, boat.x, boat.y);
    }
    this.band = nextSpeedBand(this.band, boat.speedMps, this.params);
    this.seaplane?.step(feelDt, this); // 水上機（v0.4.1）は帯の後・発見距離の前（同じステップの帯で航跡を判定し、照明弾の上書きが同じステップの発見に効く）
    this.flareLit = this.seaplane ? this.seaplane.flareLit : false;
    this.detectRangeM = enemyDetectRangeM(c.baseDetectM, speedFactorForBand(this.band, this.vis.speedFactor), this.vis, g !== null && this.hiddenBySmoke, this.storm ? this.storm.detectFactor : 1);
    if (this.flareLit && this.detectRangeM < c.seaplane!.flareRevealM) this.detectRangeM = c.seaplane!.flareRevealM;
    this.visRange2 = this.storm ? c.visRange2 * this.storm.visFactor2 : c.visRange2;
    if (g) stepDestroyerSide(this, g, dt, feelDt, boat);
    else if (this.hunt) {
      // 大発の任務（v0.4.2）: 艇の砲 → 大発（発見・逃走・13mm）。3 行目の「煙幕に隠れている」は浮いている大発すべてから隠れているとき
      this.hunt.step(dt, feelDt, this, this.input.gunHeld);
      this.hiddenBySmoke = this.hunt.flotilla.allBlocked;
    }
    this.pts?.step(dt, feelDt, this, this.input.gunHeld); // 米PT の隊（v0.6.3。艇の 13mm が先）は自艇・速力帯・発見距離の後、火災の前（模擬 core/pt-pass-sim と同じ順）。米PT の無い任務は何もしない
    if (!this.boat.sinking && stepDamage(this.damage, this.damageParams, feelDt)) this.sinkBoat(this.boatDamage.fireReason);
    this.friendly?.step(feelDt, this); // 味方機は敵の処理の後（v0.3.2 までの順序と乱数の系列を変えない）
    this.dawn.step(feelDt, this); // 夜明けの空襲は最後（夜明け前は何もしない＝夜の順序と乱数は v0.6.0 のまま）
  };

  constructor(
    scene: Phaser.Scene,
    data: GameData,
    readonly sortie: Sortie,
    readonly input: InputState,
    events: WorldEvents,
  ) {
    this.events = events;
    const seed = (this.seed = sortie.seed);
    // data からの数値はすべて world-setup で組み立てる（?debug の上書き込み）。ここではそれを持ち、エンティティを作るだけ
    const s = buildWorldSetup(data, sortie.missionId, debugSetupOptions(sortie, sortie.hard));
    this.setup = s;
    const mission = s.mission;
    this.params = s.boatParams;
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

    // スティック中立=停止なので、出発時は停止している（docs/02 §5、v0.2.1）
    this.boat = new PlayerBoat(scene, s.playerStart, 0, boatTextureKey(s.mission.playerBoatId));
    this.boatDamage = new BoatDamage(this.boat, this.damage, this.damageParams, this.params, events, SMALL_HIT_DAMAGE_RATIO);
    this.splashes = new SplashPool(scene, SPLASH_POOL_SIZE, SPLASH_SCALE_MISS, SPLASH_SCALE_HIT);
    this.torpedoes = new TorpedoPool(scene, s.torpedoParams, s.torpedoCapacity, mission.bounds);
    const hit = (spec: HitSpec, rng: SeededRng, x: number, y: number, reason: MissionEndReason): void => this.hitBoat(spec, rng, x, y, reason);
    const onSunk = (x: number, y: number): void => { this.slowMoLeftS = s.slowMoSeconds; this.events.onTargetDestroyed(x, y); }; // 撃破（大発・僚艇の沈没）は命中スロー＋Scene の爆発
    this.convoy = s.convoy && s.ptBoats ? new Convoy(scene, s.convoy, s.ptBoats.baseDetectM, s.vis, onSunk) : null; // 味方の大発の輸送隊（v0.6.4。乱数なし）は敵の側の前に（米PT の標的スロットの的。沈没は撃破と同じ演出）
    // 敵の側（駆逐艦の隊 seed+1・見張り seed+17・僚艇・大発の隊・米PT の隊 seed+18）は world-enemies.ts（v0.6.3 で切り出し。生成の順は同じ）
    const en = buildEnemies(scene, s, seed, this.boat.state, this.splashes, events, hit, onSunk, this, this.convoy);
    this.gunRng = en.gunRng;
    this.destroyers = en.destroyers;
    this.escort = en.escort;
    this.hunt = en.hunt;
    this.pts = en.pts;
    this.enemy = en.enemy;
    this.launcher = new TorpedoLauncher(this.torpedoes, new SeededRng(seed), s.torpedoReliability, s.torpedoJitterDeg, s.launchOffsetM, s.salvoIntervalS, s.torpedoParams.speedMps);
    this.torpedoEvents = torpedoEventsFor(this, events);
    this.smokeParams = s.smokeParams;
    this.smoke = this.smokeParams ? createSmokeState(SMOKE_POOL_SIZE) : null;
    this.smokeScreen = this.smokeParams ? new SmokeScreen(scene, this.smokeParams) : null;
    // 味方機（seed+2）・暴風（seed+3）・水上機（seed+5）・夜明けの空襲（seed+19）。被害はすべて hitBoat（僚艇は escortHit）
    const hz = buildHazards(scene, s, seed, this.boat.state, this.splashes, hit, (x, y) => this.events.onSlam(x, y), en.escortHit);
    this.friendly = hz.friendly;
    this.storm = hz.storm;
    this.seaplane = hz.seaplane;
    this.dawn = new WorldDawn(scene, s, hz.strike); // 夜明けのラッチ・海の明るさ・夜明けの空襲（空襲の無い任務は null）
    this.refreshShallowStatus();
  }

  /** 毎フレーム: 入力を消費し、固定ステップを回し、見た目を同期する */
  updateFrame(realDt: number): void {
    consumeFrameInput(this, realDt); // 入力の消費（world-input.ts。v0.6.1 で切り出し）
    const g = this.destroyers;
    this.stepper.advance(realDt, this.stepFn);
    if (this.slowMoLeftS > 0) this.slowMoLeftS -= realDt;
    this.refreshShallowStatus();
    this.storm?.updateVisuals(realDt, this.boat.state);
    this.boat.syncSprite(this.storm ? this.storm.rollDeg : 0);
    this.escort?.syncSprite();
    g?.syncSprites();
    this.torpedoes.updateVisuals(realDt);
    g?.updateVisuals(realDt);
    this.hunt?.updateVisuals(realDt, this.visRange2);
    this.pts?.updateVisuals(realDt, this.visRange2);
    this.convoy?.updateVisuals(this.boat.state, this.visRange2, this.pts?.targets ? this.pts.targets.aimedBarge : -1);
    this.splashes.updateVisuals(realDt);
    if (this.smokeScreen && this.smoke && this.smokeParams) this.smokeScreen.updateVisuals(this.smoke, this.smokeParams);
    this.friendly?.updateVisuals(realDt, this);
    this.seaplane?.updateVisuals(this.boat.state);
    this.dawn.updateVisuals(this);
  }

  /** 水上機か夜明けの空襲の機体が来ている（味方機の開始条件が読む） */
  get seaplaneActive(): boolean {
    return (this.seaplane ? this.seaplane.active : false) || this.dawn.strikeActive;
  }

  /** 消火の長押し秒に掛ける倍率（定員/生存。v0.3.5） */
  get extinguishHoldScale(): number {
    return crewExtinguishFactor(this.setup.crewEffects, this.setup.crew.total - this.crewLostNow, this.setup.crew.total);
  }

  /** 走っている魚雷か発射待ちがある（帰投の輪の中で決着を待つ判定に使う） */
  get torpedoesRunning(): boolean {
    return this.torpedoes.unresolvedCount > 0 || this.launcher.queued > 0;
  }

  /** 「撃沈！帰投せよ」の呼びかけの元（生の真偽。Result の達成は mission-telemetry が終了理由から決める）: 輸送隊の任務（v0.6.4）は決着（みな上陸か沈没）、ほかは敵の側の目標 */
  get returnCallDone(): boolean { return this.convoy ? this.convoy.resolved : this.enemy.objectiveDone; }

  /** 撃ち尽くし（砲の任務の「大発なし 帰投せよ」）。輸送隊の任務（v0.6.4）では立てない（大発は狩る相手ではない。決着は returnCallDone） */
  get noTargetsLeft(): boolean { return this.convoy ? false : this.enemy.noTargetsLeft; }

  /** 走っている魚雷を外れとして確定する（終了時。Result の集計から漏れないようにする） */
  resolveRemainingAsMisses(): void {
    this.torpedoes.resolveRemainingAsMisses(this.torpedoEvents);
  }

  destroy(): void {
    this.storm?.destroy();
    this.seaplane?.destroy();
    this.dawn.destroy();
    this.friendly?.destroy();
    this.torpedoes.destroy();
    this.hunt?.destroy();
    this.pts?.destroy();
    this.convoy?.destroy();
    this.escort?.destroy();
    this.splashes.destroy();
    this.smokeScreen?.destroy();
    this.destroyers?.destroy();
    this.boat.destroy();
  }

  /** 浅瀬の警告（接近中は縁までの距離）。平方根は使わない */
  private refreshShallowStatus(): void {
    const b = this.boat.state;
    const c = this.setup;
    updateShallowStatus(this.shallowStatus, c.mission.shallows, b.x, b.y, b.headingDeg, b.speedMps, c.grounding, c.timeScale, this.grounded);
  }

  /** 砲弾・機銃・掃射・爆弾の命中（中身は boat-damage）。沈み始めたら命中スローを掛ける */
  private hitBoat(spec: HitSpec, rng: SeededRng, x: number, y: number, reason: MissionEndReason): void {
    if (this.boatDamage.applyHit(spec, rng, x, y, reason)) this.slowMoLeftS = this.setup.slowMoSeconds;
  }

  /** 自艇の沈没（体当たり・火災・荒波。中身は boat-damage）。始まったら命中スローを掛ける。世界の中（destroyer-step）だけが呼ぶ */
  sinkBoat(reason: MissionEndReason): void {
    if (this.boatDamage.sink(reason)) this.slowMoLeftS = this.setup.slowMoSeconds;
  }
}
