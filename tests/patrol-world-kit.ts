// jp_02 の世界側の夜の哨戒機を Phaser なしで回す材料（v0.6.7 S5。tests/patrol-lines・patrol-telemetry・patrol-line-bits が使う。テストではない＝vitest は *.test.ts だけ拾う）。
// systems/patrol-air-step の PatrolAirStep（本物）に、AirStrikeFlight の段だけを core で組んだ偽物（絵を省く。stepAirStrike・seed+23・中断の条件は同じ）を渡し、
// 夜明けは本物の WorldDawn（空襲は core の状態を動かす口）。世界の順は mission-world と同じ: 時計 → 夜明けのラッチ → 自艇 → 速力帯 → 夜の哨戒 → 夜明けの空襲（最後）。
// テレメトリは本物の initPatrolTelemetry・refreshPatrolTelemetry・refreshDawnTelemetry（水上機の無い任務なので planeDx/Dy は毎フレーム NaN から）。被弾は数えるだけ（沈まない）。
import { gameData } from '../src/config/game-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import { AS_EV_IMPACT, airStrikeActive, createAirStrike, startAirStrike, stepAirStrike, type AirStrikeCheck, type AirStrikeParams } from '../src/core/air-strike';
import { nextSpeedBand, stepBoat, type BoatInput, type BoatState, type BoatTelemetry, type SpeedStep } from '../src/core/boat-motion';
import type { AircraftPose } from '../src/core/friendly';
import { PATROL_AIR_SEED_OFFSET } from '../src/core/patrol-air-state';
import { SeededRng } from '../src/core/rng';
import { ktToMps, radToDeg } from '../src/core/units';
import { initDawnTelemetry, refreshDawnTelemetry } from '../src/systems/dawn-telemetry';
import { PatrolAirStep, type PatrolFlight, type SortieWorldView } from '../src/systems/patrol-air-step';
import { initPatrolTelemetry, refreshPatrolTelemetry } from '../src/systems/patrol-telemetry';
import { WorldDawn, type DawnStrike } from '../src/systems/world-dawn';
import { buildWorldSetup, type WorldSetup } from '../src/systems/world-setup';
import { tele } from './pt-ui-kit';

export const S02 = buildWorldSetup(gameData, 'jp_02');
export const DT = FIXED_STEP_S;
const fakeScene = { cameras: { main: { setBackgroundColor: () => undefined } } } as never;

class CountingRng extends SeededRng {
  draws = 0;
  override next(): number {
    this.draws++;
    return super.next();
  }
}

/** AirStrikeFlight の段だけ（絵なし）: 中断は沈没・輪の中・座礁（systems/air-strike-flight:103 と同じ）、自艇への命中を数える */
export interface LiveFlight extends PatrolFlight { rng: CountingRng; hits: number }
export function liveFlight(p: AirStrikeParams, seed: number): LiveFlight {
  const state = createAirStrike(p);
  const c: AirStrikeCheck = { player: { x: 0, y: 0, headingDeg: 0, speedMps: 0 }, playerSinking: false, escort: null, escortAfloat: false, cancel: false };
  const f: LiveFlight = {
    state,
    rng: new CountingRng((seed + PATROL_AIR_SEED_OFFSET) >>> 0),
    hits: 0,
    step(feelDt: number, w: SortieWorldView): void {
      c.player = w.boat.state;
      c.playerSinking = w.boat.sinking;
      c.cancel = w.boat.sinking || w.atHome || w.grounded;
      const ev = stepAirStrike(state, p, c, f.rng, feelDt);
      if (ev & AS_EV_IMPACT && state.bombs[state.lastImpact]!.hitPlayer) f.hits++;
    },
  };
  return f;
}

/** 夜明けの空襲の口（本物の core の状態を固定ステップで動かす。絵なし） */
function liveDawnStrike(p: AirStrikeParams, seed: number): DawnStrike {
  const state = createAirStrike(p);
  const rng = new SeededRng((seed + 19) >>> 0);
  const c: AirStrikeCheck = { player: { x: 0, y: 0, headingDeg: 0, speedMps: 0 }, playerSinking: false, escort: null, escortAfloat: false, cancel: false };
  return {
    state, p,
    get active() { return airStrikeActive(state); },
    start: (player: BoatState) => startAirStrike(state, p, player),
    step: (feelDt, w) => {
      c.player = w.boat.state;
      c.cancel = w.boat.sinking || w.atHome || w.grounded;
      stepAirStrike(state, p, c, rng, feelDt);
    },
    updateVisuals: () => undefined,
    destroy: () => undefined,
  };
}

export interface Kit {
  pa: PatrolAirStep;
  flight: LiveFlight;
  dawn: WorldDawn;
  /** 世界（PatrolWorldView・DawnWorldView・テレメトリの世界を 1 つで満たす） */
  w: { stepTimeS: number; atHome: boolean; grounded: boolean; band: SpeedStep; boat: { state: BoatState; sinking: boolean }; escort: null; setup: WorldSetup; dawn: WorldDawn; patrol: PatrolAirStep; enemy: { shipsWithdrawn: number; transportWithdrawn: boolean; bargesHidden: number; bargesRunning: number; allOut: boolean; shipDown: boolean; withdraw(h: number): void } };
  input: BoatInput;
  t: BoatTelemetry;
  /** 1 固定ステップ（世界の順）とテレメトリの書き直し */
  step(): void;
  /** pred が真になるまで（maxS 秒で諦めて false） */
  runUntil(pred: (k: Kit) => boolean, maxS?: number): boolean;
}

/** jp_02 の世界（durationS で夜明けの秒を上書きできる。?debug&dawn と同じ） */
export function makeKit(seed = 11, durationS = S02.durationS): Kit {
  const setup: WorldSetup = { ...S02, durationS };
  const flight = liveFlight(S02.patrolAir!.sortie, seed);
  const pa = new PatrolAirStep(S02.patrolAir!, flight);
  const dawn = new WorldDawn(fakeScene, setup, liveDawnStrike(S02.airStrike!, seed));
  const boat: BoatState = { x: S02.playerStart.x, y: S02.playerStart.y, headingDeg: S02.playerStart.headingDeg, speedMps: 0 };
  const enemy = { shipsWithdrawn: 0, transportWithdrawn: false, bargesHidden: 0, bargesRunning: 0, allOut: false, shipDown: false, withdraw: () => undefined };
  const w: Kit['w'] = { stepTimeS: 0, atHome: false, grounded: false, band: 'stop', boat: { state: boat, sinking: false }, escort: null, setup, dawn, patrol: pa, enemy };
  const input: BoatInput = { headingDeg: boat.headingDeg, speed01: 0 };
  const t = tele({ enabled: false }, { patrol: initPatrolTelemetry(w), dawn: initDawnTelemetry(w), targetStep: 'stop' });
  const bp = { ...S02.boatParams };
  const scratch: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };
  const k: Kit = {
    pa, flight, dawn, w, input, t,
    step(): void {
      w.stepTimeS += DT;
      dawn.latch(w);
      stepBoat(boat, input, bp, DT * S02.timeScale);
      const rp = S02.mission.returnPoint;
      w.atHome = (boat.x - rp.x) ** 2 + (boat.y - rp.y) ** 2 <= rp.radiusM ** 2;
      w.band = nextSpeedBand(w.band, boat.speedMps, bp);
      pa.step(DT, w);
      dawn.step(DT, w);
      t.targetStep = w.band;
      t.planeDx = NaN; // 水上機の無い任務（seaplane-telemetry が毎フレーム NaN を書く）
      t.planeDy = NaN;
      refreshPatrolTelemetry(t, w, scratch);
      refreshDawnTelemetry(t, w, scratch);
    },
    runUntil(pred, maxS = 400): boolean {
      for (let i = 0; i < maxS / DT; i++) {
        if (pred(k)) return true;
        k.step();
      }
      return pred(k);
    },
  };
  return k;
}

/** 輪の中心への針路（北 0・時計回り） */
export function homeHeading(k: Kit): number {
  const rp = S02.mission.returnPoint;
  const b = k.w.boat.state;
  return radToDeg(Math.atan2(rp.x - b.x, -(rp.y - b.y)));
}

/** HUD どおりの台本の 1 ステップ（hud: 全速で輪へ・目の捜索は秒読み 0 で止まり付近の捜索が終わるまで止まる／run: 全速で止まらない／quiet: 13.6 kt）。出撃中は全速 */
export function drive(k: Kit, policy: 'hud' | 'run' | 'quiet' | 'stop' = 'hud'): void {
  const p = k.t.patrol;
  const sortie = p.phase === 4;
  let speed = policy === 'quiet' ? ktToMps(S02.patrolAir!.gate.quietKt - 0.4) / S02.boatParams.speedMaxMps : policy === 'stop' ? 0 : 1;
  if (sortie) speed = 1;
  if ((policy === 'hud' || policy === 'quiet') && !sortie && ((p.phase === 1 && !p.radar && p.countdownS === 0) || p.phase === 2)) speed = 0;
  k.input.headingDeg = homeHeading(k);
  k.input.speed01 = speed;
}

/** 台本で pred まで回す */
export function driveUntil(k: Kit, pred: (k: Kit) => boolean, policy: 'hud' | 'run' | 'quiet' | 'stop' = 'hud', maxS = 400): boolean {
  for (let i = 0; i < maxS / DT; i++) {
    if (pred(k)) return true;
    drive(k, policy);
    k.step();
  }
  return pred(k);
}
