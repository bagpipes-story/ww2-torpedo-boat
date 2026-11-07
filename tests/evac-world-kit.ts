// 空襲下の退避の世界（v0.6.11 S4。jp_03）の tests の共通: Phaser なしの素の値で、世界の部品（systems/world-evac・boat-damage の divert・world-boat・arms-step の隊の砲と
// evac の枠・world-dawn の homeAtLatch・mission-end の evacHold）を systems/mission-world の stepFn と同じ順に組んだ小さな世界。編隊の口は core/evac-hits の evacCoreFlight
// （凍結の AirStrikeFlight.step と同じ式で絵なし）、240 秒の後の §2 の 4 機は同じ式の DawnStrike。入力の消費は systems/world-input の順（［切替］と latch → 消火）。
// 模擬（core/evac-sim）の mirror（core/evac-replay）でこの世界を歩かせて比べる（ヘッドレスの scripts/headless/world-vs-sim EVAC=1 の node 版）。
import { getLoadout } from '../src/config/loadout-data';
import { getPrototypeMission, gameData } from '../src/config/game-data';
import { AIR_STRIKE_SEED_OFFSET, AS_EV_IMPACT, airStrikeActive, createAirStrike, startAirStrike, stepAirStrike, type AirStrikeCheck, type AirStrikeParams } from '../src/core/air-strike';
import { nextSpeedBand, setPerformance, type BoatState, type SpeedStep } from '../src/core/boat-motion';
import { crewAccelFactor, crewExtinguishFactor, crewLost, crewTurnFactor } from '../src/core/crew';
import { evacCoreFlight } from '../src/core/evac-hits';
import { evacGunVariants } from '../src/core/evac-sim-aa';
import { createFuelState } from '../src/core/fuel';
import { createDamageState, stepDamage, type HitSpec } from '../src/core/gunnery';
import { createInputState } from '../src/core/input-state';
import type { MissionEndReason } from '../src/core/mission-flow';
import { SeededRng } from '../src/core/rng';
import { ArmsStep, type ArmsWorld } from '../src/systems/arms-step';
import { BoatDamage } from '../src/systems/boat-damage';
import type { WorldEvents } from '../src/systems/world-events';
import { stepPlayerBoat } from '../src/systems/world-boat';
import { WorldDawn, type DawnStrike, type DawnWorldView } from '../src/systems/world-dawn';
import { WorldEvac } from '../src/systems/world-evac';
import type { WorldSetup } from '../src/systems/world-setup';
import { DT, evacSetup } from './evac-kit';

/** 沈没の演出だけの自艇（entities/player-boat の playSinking と同じく沈没中・速さ 0。終わりの onDone は呼ばない） */
function fakeBoat(start: { x: number; y: number; headingDeg: number }): FakeBoat {
  const b = {
    state: { x: start.x, y: start.y, headingDeg: start.headingDeg, speedMps: 0 } as BoatState,
    sinking: false,
    playSinking(): void {
      b.sinking = true;
      b.state.speedMps = 0;
    },
  };
  return b;
}

/** entities/player-boat の PlayerBoat の BoatDamage が使う面（Phaser の絵を読まない） */
export interface FakeBoat {
  readonly state: BoatState;
  sinking: boolean;
  playSinking(onDone: () => void): void;
}

/** 240 秒の後の §2 の 4 機（systems/air-strike-flight の AirStrikeFlight.step と同じ式で絵なし。命中は世界の hitBoat） */
function coreDawnStrike(p: AirStrikeParams, rng: SeededRng, hit: (spec: HitSpec, rng: SeededRng, x: number, y: number) => void): DawnStrike & { rng: SeededRng } {
  const state = createAirStrike(p);
  const c: AirStrikeCheck = { player: { x: 0, y: 0, headingDeg: 0, speedMps: 0 }, playerSinking: false, escort: null, escortAfloat: false, cancel: false };
  return {
    state,
    p,
    rng,
    get active() {
      return airStrikeActive(state);
    },
    start: (player) => {
      c.player = player;
      startAirStrike(state, p, player);
    },
    step: (feelDt, w) => {
      c.player = w.boat.state;
      c.playerSinking = w.boat.sinking;
      c.cancel = w.boat.sinking || w.atHome || w.grounded;
      if (stepAirStrike(state, p, c, rng, feelDt) & AS_EV_IMPACT) {
        const b = state.bombs[state.lastImpact]!;
        if (b.hitPlayer) hit(p.bombHit, rng, b.aimX, b.aimY);
      }
    },
    updateVisuals: () => {},
    destroy: () => {},
  };
}

export interface MiniWorld extends ArmsWorld, DawnWorldView {
  boat: FakeBoat;
  fuel: ReturnType<typeof createFuelState>;
  launcher: { clearQueue(): void };
  setup: WorldSetup;
  input: ReturnType<typeof createInputState>;
  damage: ReturnType<typeof createDamageState>;
  params: WorldSetup['boatParams'];
  band: SpeedStep;
  atHome: boolean;
  grounded: boolean;
  stepTimeS: number;
  extinguishHeldS: number;
  crewLostNow: number;
  slowMoLeftS: number;
  dawn: WorldDawn & { strike: DawnStrike & { rng: SeededRng } };
  arms: ArmsStep;
  evac: WorldEvac;
  bd: BoatDamage;
  clears: number;
  /** 1 フレーム（固定ステップ 1 つ。mission-world の updateFrame と同じ順） */
  frame(): void;
}

/** jp_03 の小さな世界（seed・ハード。aaChance を渡せば 1 発の撃墜の確率を上書き＝?debug&aa と同じ） */
export function miniWorld(seed: number, hard = false, aaChance = NaN): MiniWorld {
  const s = evacSetup(hard);
  const ev = s.evac!;
  const lo = getLoadout(gameData, getPrototypeMission(gameData, 'jp_03', hard));
  const events: WorldEvents = { onTorpedoHit: () => {}, onDestroyerSunk: () => {}, onTargetDestroyed: () => {}, onShellHit: () => {}, onBoatSinking: () => {}, onBoatSunk: () => {}, onGrounded: () => {}, onSlam: () => {} };
  const params = s.boatParams;
  const turnBase = params.turnRateDegS;
  const accelBase = params.accelMps2;
  const boat = fakeBoat(s.playerStart);
  const damage = createDamageState(s.damageParams);
  const w = {
    boat, setup: s, input: createInputState(), damage, params, band: 'stop' as SpeedStep, atHome: false, grounded: false, stepTimeS: 0, extinguishHeldS: 0, crewLostNow: 0, slowMoLeftS: 0, clears: 0,
    fuel: createFuelState(s.fuelStartGal), fuelCurve: s.fuelCurve, returnPoint: s.mission.returnPoint, engine: null, detectRangeM: 0, visRange2: s.visRange2,
    hunt: null, pts: null, destroyers: null, patrol: null, seaplane: null, escort: null, smoke: null, smokeParams: null, enemy: { withdraw: () => {} },
    launcher: { clearQueue: () => void w.clears++ },
    events,
  } as unknown as MiniWorld;
  const bd = new BoatDamage(boat, damage, s.damageParams, params, events, 0.2);
  w.bd = bd;
  const hit = (spec: HitSpec, rng: SeededRng, x: number, y: number, reason: MissionEndReason): void => {
    if (bd.applyHit(spec, rng, x, y, reason)) w.slowMoLeftS = s.slowMoSeconds;
  };
  const strike = coreDawnStrike(s.airStrike!, new SeededRng((seed + AIR_STRIKE_SEED_OFFSET) >>> 0), (spec, rng, x, y) => hit(spec, rng, x, y, 'air_strike'));
  w.dawn = new WorldDawn({ cameras: { main: { setBackgroundColor: () => undefined } } } as never, s, strike) as WorldDawn & { strike: DawnStrike & { rng: SeededRng } };
  const aa = Number.isFinite(aaChance) ? { ...lo.aa, hitChancePerRound: aaChance } : lo.aa;
  w.arms = new ArmsStep('noship', { gun: lo.gun, aa, seed, world: w, evacGuns: lo.gun ? evacGunVariants(lo.gun, ev.params.groupSize) : null });
  w.evac = new WorldEvac(ev, w, seed, (_i, p, rng, onImpact) => evacCoreFlight(p, rng, onImpact), (spec, rng, x, y) => hit(spec, rng, x, y, 'air_strike'), () => {}, bd);
  const stepFn = (realDt: number): void => {
    const feelDt = realDt * (w.slowMoLeftS > 0 ? s.slowMoFactor : 1);
    const dt = feelDt * s.timeScale;
    w.stepTimeS += realDt;
    w.dawn.latch(w);
    w.crewLostNow = crewLost(s.crew, s.damageParams.maxHp, w.damage.hp);
    setPerformance(w.params, turnBase, accelBase, crewTurnFactor(s.crewEffects, w.crewLostNow), crewAccelFactor(s.crewEffects, w.crewLostNow));
    stepPlayerBoat(w as never, dt);
    w.evac.stepBoats(dt, feelDt);
    w.band = nextSpeedBand(w.band, w.boat.state.speedMps, w.params);
    w.arms.stepShips(w, null, dt, feelDt);
    w.arms.applyFlash(w);
    w.arms.stepAir(w, dt, feelDt);
    if (!w.boat.sinking && stepDamage(w.damage, s.damageParams, feelDt)) bd.sink(bd.fireReason);
    w.evac.stepAir(feelDt);
    w.dawn.step(feelDt, w);
  };
  w.frame = () => {
    if (!w.boat.sinking) {
      w.evac.frameInput();
      // systems/world-input の consumeSmokeInput の消火の規則（燃えている間だけ数え、消したら 0）
      if (w.input.extinguishHeld && w.damage.fireLeftS > 0) {
        const next = w.extinguishHeldS + DT;
        if (next < s.damageParams.extinguishHoldS * crewExtinguishFactor(s.crewEffects, s.crew.total - w.crewLostNow, s.crew.total)) w.extinguishHeldS = next;
        else {
          w.damage.fireLeftS = 0;
          w.extinguishHeldS = 0;
        }
      } else w.extinguishHeldS = 0;
    }
    stepFn(DT);
    if (w.slowMoLeftS > 0) w.slowMoLeftS -= DT;
  };
  return w;
}
