// tests/torpedo-free の共通（v0.6.8 S2。レビュー perf-size-1 でテストの本体が 351 行になったので組み立てを分けた。中身は分ける前のまま）: 本物の TorpedoPool（絵は鎖の偽物）・TorpedoLauncher・ArmsStep で、任務の艇と魚雷の値の小さな世界を組む。
// TorpedoPool は DOM を読む config（game-config）を引くので、型検査（tsconfig.node。DOM の型なし）に入れないよう文字列を組んだ動的 import で読む（実行時の config は window が無ければ既定値）。
import { gameData, getBoatTorpedoCount } from '../src/config/game-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import type { BoatState, SeaBounds } from '../src/core/boat-motion';
import { createInputState } from '../src/core/input-state';
import { SeededRng } from '../src/core/rng';
import type { TorpedoParams, TorpedoState } from '../src/core/torpedo';
import type { TorpedoEvents, TorpedoTarget } from '../src/core/torpedo-targets';
import { fillHullCircles, createCircles } from '../src/core/torpedo-solver';
import { ArmsStep } from '../src/systems/arms-step';
import { consumeTorpedoFire, stepFreeTorpedoes, stepLauncher, type FreeTorpedoPool, type FreeTorpedoWorld, type TorpedoAimGroup } from '../src/systems/torpedo-free';
import { TorpedoLauncher, type LauncherPool } from '../src/systems/torpedo-launcher';
import { buildWorldSetup, type WorldSetup } from '../src/systems/world-setup';

/** systems/torpedo-pool の TorpedoPool の使う部分 */
export interface PoolLike extends FreeTorpedoPool, LauncherPool {
  readonly states: TorpedoState[];
  readonly activeCount: number;
  readonly unresolvedCount: number;
  step(dt: number, realDt: number, targets: readonly TorpedoTarget[], passRadius2: number, events: TorpedoEvents, nowS?: number, settleS?: number): void;
}
export const { TorpedoPool } = (await import(/* @vite-ignore */ ['..', 'src', 'systems', 'torpedo-pool'].join('/'))) as { TorpedoPool: new (scene: never, params: TorpedoParams, capacity: number, bounds: SeaBounds) => PoolLike };

/** 絵の偽物（どの呼び出しも自分を返す。visible は偽） */
export const chain: unknown = new Proxy({}, { get: (_t, k) => (k === 'visible' ? false : () => chain) });
export const scene = { add: { image: () => chain } } as never;
export const DT = FIXED_STEP_S;

export class CountingRng extends SeededRng {
  draws = 0;
  override next(): number {
    this.draws++;
    return super.next();
  }
}

export interface Spies extends TorpedoEvents {
  hit: number;
  late: number;
  miss: number;
}
export function spies(): Spies {
  const e: Spies = { hit: 0, late: 0, miss: 0, onHit: () => void e.hit++, onLateHit: () => void e.late++, onMiss: () => void e.miss++ };
  return e;
}

/** 狙う艦の 1 隻（TorpedoTarget と TorpedoAimGroup の艦を満たす）。浮いている／沈み始めた（終わり際の当たりの窓が開いている）を切り替える */
export interface FakeShip extends TorpedoTarget {
  state: BoatState;
  out: boolean;
  sinking: boolean;
  sunk: boolean;
  sinkStartS: number;
}
export function fakeShip(x: number, y: number): FakeShip {
  const circles = createCircles(3);
  fillHullCircles(circles, x, y, 90, 100, 12); // 東西に長い船体（北へ走る魚雷が横切る）
  return { circles, state: { x, y, headingDeg: 90, speedMps: 0 }, out: false, sinking: false, sunk: false, sinkStartS: NaN };
}
export function fakeGroup(ships: FakeShip[]): TorpedoAimGroup & { ships: FakeShip[] } {
  return {
    ships,
    destroyerCount: ships.length,
    get allOut() {
      return ships.every((s) => s.out);
    },
    nearestAfloatIndex(x: number, y: number): number {
      let best = -1;
      let bestD2 = Infinity;
      ships.forEach((s, i) => {
        const d2 = (s.state.x - x) ** 2 + (s.state.y - y) ** 2;
        if (!s.out && d2 < bestD2) [best, bestD2] = [i, d2];
      });
      return best;
    },
  };
}

export interface Kit {
  s: WorldSetup;
  w: FreeTorpedoWorld & { atHome: boolean; destroyers: TorpedoAimGroup | null; torpedoEvents: TorpedoEvents; torpedoes: PoolLike };
  rng: CountingRng;
  arms: ArmsStep;
  ev: Spies;
}
/** 任務の艇と魚雷（setup の値）で、自艇は海域の 3/4 の南で北向き（長く走る） */
export function kit(id: string, g: TorpedoAimGroup | null = null, seed = 11): Kit {
  const s = buildWorldSetup(gameData, id);
  const pool = new TorpedoPool(scene, s.torpedoParams, getBoatTorpedoCount(gameData, s.mission.playerBoatId), s.mission.bounds);
  const rng = new CountingRng(seed);
  const launcher = new TorpedoLauncher(pool, rng, s.torpedoReliability, s.torpedoJitterDeg, s.launchOffsetM, s.salvoIntervalS, s.torpedoParams.speedMps);
  const arms = new ArmsStep(id === 'us_03' ? 'barge' : id === 'jp_01' || id === 'jp_05' ? 'pt' : 'noship');
  const ev = spies();
  const boat: BoatState = { x: s.mission.bounds.width / 2, y: s.mission.bounds.height * 0.75, headingDeg: 0, speedMps: 0 };
  const w = { input: createInputState(), launcher, torpedoes: pool, boat: { state: boat }, destroyers: g, atHome: false, dawn: { reached: false }, arms, torpedoEvents: ev as TorpedoEvents };
  return { s, w, rng, arms, ev };
}
/** 1 フレーム（入力 → 発射管制）と、駆逐艦のいない任務の固定ステップ 1 回（world-enemy-step の stepFreeTorpedoes） */
export function frame(k: Kit): TorpedoState[] {
  consumeTorpedoFire(k.w);
  const before = k.w.torpedoes.remaining;
  stepLauncher(k.w, DT);
  const fired = k.w.torpedoes.states.slice(k.w.torpedoes.capacity - before, k.w.torpedoes.capacity - k.w.torpedoes.remaining);
  stepFreeTorpedoes(k.w, DT * k.s.timeScale, DT);
  return fired;
}
export const salvo = (k: Kit, count = 0): void => {
  k.w.input.fireSalvoSpreadDeg = 4;
  k.w.input.fireSalvoCount = count;
};
