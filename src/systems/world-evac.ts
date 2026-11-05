// 空襲下の退避の世界（v0.6.11 S4。jp_03「運天港・空襲下の退避」。spec-v0611-r2 §3.3・§3.7・§8）: 18 隻の隊（core/evac-squadron）・座席（世界の自艇＝操作中の隊長艇の写し）・
// 空襲の段（core/evac-air。編隊は凍結の AirStrikeFlight を口にして systems/evac-flights の buildEvac が作る）を持ち、世界の 3 か所から呼ばれる（模擬 core/evac-sim と同じ順）:
//   フレームの入力（world-input の consumeFrameInput。沈没の確かめの直後・消火の前）: ［切替］とスティックの latch（evacFrameInput）→ 消火の倍率の乗員を今の座席の HP から
//   段 3（mission-world の stepPlayerBoat の直後）: stepEvacBoats → 帰投（evacSeatHome。決着のラッチのステップは入っている・上げている途中も中＝r2 L15）
//   段 5（座席の火災の後・夜明けの空襲の前）: stepEvacAir（予告・狙い・編隊・着弾の走査・操作していない隊長艇の火災）
// 座席の沈没は BoatDamage.divert（evacSinkLeader。同期に完結＝r2 H5）、座席への入力は world-boat の command（evacSeatCommand。r2 M3）、ラッチの「中」は WorldDawn.homeAtLatch。
// 隊長艇を座席へ入れたら消火の長押し 0・火災の理由の初期化・一斉発射の待ちを捨てる（r2 L7）。命中スローは掛けない（r2 M1: 振り替えの sink は false、撃墜の爆発は mission-world が
// evac の世界だけスローなしの関数を渡す）。乱数は +29 陰・+30 隊（生成の 6 回と pick）・+31 逃げる・+32〜+43 編隊（core のまま）。
// Phaser・DOM を読まない（tests/evac-world が素の値と core/evac-hits の evacCoreFlight で組む）。絵は view（buildEvac が置く）。§7: 確保は constructor だけ。
import type { EvacSetup } from '../config/evac-mission-data';
import type { AirStrikeParams } from '../core/air-strike';
import type { BoatInput, BoatParams, BoatState, SpeedStep } from '../core/boat-motion';
import { crewLost } from '../core/crew';
import { createEvacAirStep, stepEvacAir, type EvacAirStep } from '../core/evac-air';
import { stepEvacBoats } from '../core/evac-boats';
import { EVAC_AI_SEED_OFFSET } from '../core/evac-data';
import { evacImpact, type EvacAirWorld } from '../core/evac-hits';
import { createEvacPlan, evacPlanHooks, type EvacFlightPort, type EvacPlan } from '../core/evac-plan';
import { evacFrameInput, evacLoadSeat, evacSeatCommand, evacSeatHome, evacSinkLeader, type EvacSeat, type EvacSeatHooks } from '../core/evac-seat';
import { createEvacSquadron, type EvacBoat, type EvacSquadron } from '../core/evac-squadron';
import type { DamageState, HitSpec } from '../core/gunnery';
import type { MissionEndReason } from '../core/mission-flow';
import { SeededRng } from '../core/rng';
import type { WorldSetup } from './world-setup';

/** 世界から読み書きする部分（MissionWorld がそのまま満たす。tests は素の値で組む） */
export interface EvacWorldView {
  readonly boat: { readonly state: BoatState; readonly sinking: boolean };
  readonly damage: DamageState;
  readonly params: BoatParams;
  band: SpeedStep;
  atHome: boolean;
  readonly stepTimeS: number;
  readonly input: BoatInput & { switchTap: boolean };
  extinguishHeldS: number;
  crewLostNow: number;
  readonly setup: Pick<WorldSetup, 'crew' | 'crewEffects' | 'damageParams' | 'boatParams' | 'mission' | 'boundsMarginM' | 'durationS'>;
  readonly dawn: { readonly reached: boolean; homeAtLatch: (() => boolean) | null };
  readonly launcher: { clearQueue(): void };
  readonly arms: { readonly flashM: number } | null;
}

/** 座席の沈没の振り替えと火災の理由（systems/boat-damage の BoatDamage がそのまま満たす） */
export interface EvacBoatDamage {
  fireReason: MissionEndReason;
  divert: (() => boolean) | null;
}

/** 編隊の口を作る（世界は凍結の AirStrikeFlight、tests は core/evac-hits の evacCoreFlight）。onImpact は着弾（命中・外れとも）の点 */
export type EvacWorldPortFactory = (i: number, p: AirStrikeParams, rng: SeededRng, onImpact: (x: number, y: number) => void) => EvacFlightPort;

/** 毎フレームの絵と破棄（systems/evac-flights の buildEvac が置く。tests は無し） */
export interface EvacView {
  update(realDt: number): void;
  destroy(): void;
}

const noop = (): void => {};

export class WorldEvac {
  readonly sq: EvacSquadron;
  readonly seat: EvacSeat;
  readonly air: EvacAirStep;
  /** 操作していない隊（seed+30。生成の 6 回と pick） */
  readonly aiRng: SeededRng;
  /** 燃料を数え始める秒（systems/world-boat） */
  readonly fuelFreeUntilS: number;
  /** 対空の枠に近い編隊の順に並べる固定長の配列（systems/aa-slots の evac の枝）と最後に撃墜した編隊 */
  readonly aaOrder: Int32Array;
  readonly aaD2: Float64Array;
  lastDownFlight = -1;
  /** 沈んだ艇の数（座席でない艇も。HUD の出来事は S5） */
  losses = 0;
  view: EvacView | null = null;
  private latchSeen = false;
  private readonly cmd: BoatInput = { headingDeg: NaN, speed01: 0 };

  constructor(
    ev: EvacSetup,
    private readonly w: EvacWorldView,
    seed: number,
    makePort: EvacWorldPortFactory,
    /** 座席への命中（世界の hitBoat。終わりの理由は air_strike） */
    hit: (spec: HitSpec, rng: SeededRng, x: number, y: number) => void,
    /** 水柱（世界の SplashPool） */
    splash: (x: number, y: number, hit: boolean) => void,
    damage: EvacBoatDamage,
  ) {
    const c = w.setup;
    this.fuelFreeUntilS = ev.fuelFreeUntilS;
    this.aiRng = new SeededRng((seed + EVAC_AI_SEED_OFFSET) >>> 0);
    // 無傷の値の写し（世界は setup.boatParams を自艇の値として書き換えるので、隊の基準は生成の時の写し）
    const cfg = { p: ev.params, boat: { ...c.boatParams }, damage: c.damageParams, crew: c.crew, crewEffects: c.crewEffects, bounds: c.mission.bounds, boundsMarginM: c.boundsMarginM, durationS: c.durationS };
    const sq = (this.sq = createEvacSquadron(cfg, this.aiRng));
    const seat: EvacSeat = {
      state: w.boat.state,
      damage: w.damage,
      params: w.params,
      get band(): SpeedStep {
        return w.band;
      },
      set band(v: SpeedStep) {
        w.band = v;
      },
    };
    this.seat = seat;
    evacLoadSeat(sq, seat);
    const inner: EvacSeatHooks = {
      onSeatLoaded: () => {
        w.extinguishHeldS = 0;
        damage.fireReason = 'destroyed';
        w.launcher.clearQueue();
      },
      onLeaderChanged: noop,
      onGroupGone: noop,
      onBoatSunk: () => {
        this.losses++;
      },
    };
    const ref: { air: EvacAirStep | null } = { air: null };
    const plan = createEvacPlan(sq, ev.raid, ev.sorties, seed, (i, p, rng) => makePort(i, p, rng, (x, y) => void evacImpact(ref.air!, i, x, y)));
    const world: EvacAirWorld = { hitSeat: (spec, rng, x, y) => hit(spec, rng, x, y), hitRecord: (_b, x, y) => splash(x, y, true), splash: (x, y) => splash(x, y, true) };
    this.air = ref.air = createEvacAirStep({ plan, sq, seat, hooks: evacPlanHooks(plan, inner), world }, seed);
    this.aaOrder = new Int32Array(plan.flights.length);
    this.aaD2 = new Float64Array(plan.flights.length);
    damage.divert = () => evacSinkLeader(sq, seat, sq.control, w.stepTimeS, this.air.hooks);
    w.dawn.homeAtLatch = () => evacSeatHome(sq, seat, true);
  }

  get plan(): EvacPlan {
    return this.air.plan;
  }

  /** 決着（240 秒）の後（systems/mission-end の evacHold） */
  get settled(): boolean {
    return this.sq.settled;
  }

  /** 機銃を撃てる隻数（操作中の隊の浮いていて上げていない艇。systems/arms-step の隊の砲。模擬と同じ数え方） */
  get gunN(): number {
    const g = this.sq.groups[this.sq.control]!;
    let n = 0;
    for (let k = 0; k < g.boats.length; k++) if (!g.boats[k]!.sunk && !g.boats[k]!.up) n++;
    return n;
  }

  /** k 発目の曳光弾の出どころ（撃てる艇へ順に。隊長艇は座席の位置。r2 L18。絵だけ） */
  shooter(k: number): BoatState {
    const g = this.sq.groups[this.sq.control]!;
    const n = this.gunN;
    let i = n > 0 ? k % n : 0;
    for (let s = 0; s < g.boats.length; s++) {
      const b: EvacBoat = g.boats[s]!;
      if (b.sunk || b.up) continue;
      if (i-- === 0) return s === g.leader ? this.seat.state : b.state;
    }
    return this.seat.state;
  }

  /** フレームの入力（world-input。沈んでいない時だけ）: ［切替］（消費して false）と latch → 消火の倍率の乗員は今の座席の HP から（模擬と同じ） */
  frameInput(): void {
    const w = this.w;
    const tap = w.input.switchTap;
    w.input.switchTap = false;
    evacFrameInput(this.sq, this.seat, w.input, tap, this.air.hooks);
    w.crewLostNow = crewLost(w.setup.crew, w.setup.damageParams.maxHp, w.damage.hp);
  }

  /** 座席への入力（world-boat の stepBoat。latch が SW_FREE ならスティック） */
  command(input: BoatInput): BoatInput {
    return evacSeatCommand(this.sq, input, this.cmd);
  }

  /** 段 3（stepPlayerBoat の直後。dt は game の秒、realDt は体感の実秒）: 隊の動き → 帰投の書き換え（決着のラッチのステップは入っている・上げている途中も中） */
  stepBoats(dt: number, realDt: number): void {
    const w = this.w;
    const latchStep = w.dawn.reached && !this.latchSeen;
    this.latchSeen = w.dawn.reached;
    if (w.boat.sinking) return;
    stepEvacBoats(this.sq, this.seat, w.input, this.aiRng, w.stepTimeS, dt, realDt);
    w.atHome = evacSeatHome(this.sq, this.seat, latchStep);
  }

  /** 段 5（座席の火災の後・夜明けの空襲の前）。閃光の距離は兵装の閃光（flash_reveal の時だけ陰を見つける） */
  stepAir(feelDt: number): void {
    stepEvacAir(this.air, this.w.stepTimeS, feelDt, feelDt, this.w.arms ? this.w.arms.flashM : 0);
  }

  updateVisuals(realDt: number): void {
    this.view?.update(realDt);
  }

  destroy(): void {
    this.view?.destroy();
  }
}
