// v0.8.2 S2（spec-v0820 §8 の S2「column-world」、lead の L19〜L21・L26）: 片道の列（us_05）の小さな世界（Phaser なし）。tests/column-world・magazine-world・radar-us05・kpi-us05 が使う。
// 隊は本物の systems/destroyer-group（絵は鎖の偽物＝tests/picket-world の作法・文字列を組んだ動的 import）、固定ステップは systems/mission-world の stepFn の順:
// 時計（stepTimeS += 実秒）→ 夜明けのラッチ（立った 1 回だけ隊の withdraw＝systems/world-dawn）→ 敵の側の段＝本物の systems/destroyer-step（艦の段 → 列の段階 → 列の見張り → … → 反撃）
// → レーダー（本物の systems/world-radar。radar を渡した時だけ）。魚雷のプール・一斉発射・体当たりの沈没・被弾は偽物（何もしない。命中の手は既定の何もしない手のまま）。
// 自艇は tests が置く（boatAt）。艦が自艇を見つける距離は世界の detectRangeM（tests が書く。既定 0＝見つからない）。命中スローは slow の間だけ feelDt ＝ 実秒 × hit_slowmo_factor。
import { gameData } from '../src/config/game-data';
import type { ColumnKit } from '../src/config/column-mission-data';
import { shipArtKey } from '../src/config/ship-art-config';
import { FIXED_STEP_S } from '../src/config/step-config';
import type { BoatState } from '../src/core/boat-motion';
import { retireHeadingDeg } from '../src/core/dawn-withdraw';
import type { GunneryParams } from '../src/core/gunnery';
import { SeededRng } from '../src/core/rng';
import type { ShipAiParams, ShipAiState } from '../src/core/ship-ai';
import type { ShipTransitState } from '../src/core/ship-transit';
import { directSortie } from '../src/core/sortie';
import type { Circle } from '../src/core/torpedo-solver';
import { WorldRadar } from '../src/systems/world-radar';
import { buildWorldSetup, type DestroyerSpec, type SetupOptions, type WorldSetup } from '../src/systems/world-setup';
import { chain } from './torpedo-free-kit';

/** 本物の Destroyer の読む部分（aiParams は private＝tests だけが読む） */
export interface ColShip {
  readonly spec: DestroyerSpec;
  readonly state: BoatState;
  readonly ai: ShipAiState;
  readonly circles: Circle[];
  readonly out: boolean;
  sinking: boolean;
  sunk: boolean;
  withdrawn: boolean;
  offMap: boolean;
  transitShip: boolean;
  hitsTaken: number;
  sinkStartS: number;
  takeHit(): boolean;
  playSinking(nowS: number, onDone: () => void): void;
}
export const aiParamsOf = (d: ColShip): ShipAiParams => (d as unknown as { aiParams: ShipAiParams }).aiParams;

/** 本物の DestroyerGroup の読む部分 */
export interface ColGroup {
  readonly ships: ColShip[];
  readonly fires: { setHitHandler(h: (gunIndex: number, x: number, y: number) => void): void }[];
  readonly destroyerCount: number;
  readonly total: number;
  readonly passRadius2: number;
  readonly objectiveSinks: number;
  readonly transportIndex: number;
  readonly picketIndex: number;
  readonly transit: { readonly state: ShipTransitState; readonly pending: number; readonly allOut: boolean } | null;
  readonly roles: { readonly st: { readonly away: Uint8Array; readonly leaves: Uint16Array; left: number; rejoined: number }; readonly leftAtS: Float64Array; readonly rejoinedAtS: Float64Array; readonly plan: { readonly mask: number; readonly rejoinS: number } } | null;
  readonly kits: { readonly guns: readonly GunneryParams[]; readonly kpi: Uint8Array; readonly radarKind: Uint8Array; readonly artKeys: readonly string[]; readonly classes: readonly string[] | null };
  magazine: { roll(i: number, hitsTaken: number, nowS: number): boolean; readonly rules: readonly ({ readonly onHits: readonly number[]; readonly chance: readonly number[] } | null)[]; readonly log: { readonly detonatedAtS: Float64Array; readonly onHit: Uint8Array; readonly draws: Uint32Array; readonly chanceSum: Float64Array }; readonly detonations: number; readonly draws: number; readonly chanceSum: number } | null;
  readonly allOut: boolean;
  readonly allSettled: boolean;
  readonly sunkCount: number;
  gunneryAt(i: number): GunneryParams;
  kpiAt(i: number): boolean;
  radarKindAt(i: number): number;
  nearestAfloatIndex(x: number, y: number): number;
  withdraw(headingDeg: number): void;
}
type GroupCtor = new (...a: unknown[]) => ColGroup;
export const { DestroyerGroup } = (await import(/* @vite-ignore */ ['..', 'src', 'systems', 'destroyer-group'].join('/'))) as { DestroyerGroup: GroupCtor };
type StepSide = (w: unknown, g: unknown, dt: number, feelDt: number, boat: BoatState) => void;
const { stepDestroyerSide } = (await import(/* @vite-ignore */ ['..', 'src', 'systems', 'destroyer-step'].join('/'))) as { stepDestroyerSide: StepSide };

/** 絵の偽物の場面（作った Image の鍵を keys に残す。文字・沈む tween も鎖） */
export const sceneOf = (keys: string[] = []): unknown => ({ add: { image: (_x: number, _y: number, key: string) => (keys.push(key), chain), text: () => chain, graphics: () => chain }, tweens: { add: () => chain } });

export class CountingRng extends SeededRng {
  draws = 0;
  override next(): number {
    this.draws++;
    return super.next();
  }
}

/** world-enemies と同じ引数で隊を作る（砲 seed+1・見張り seed+17 の系列は呼ぶ側が渡す） */
export function groupOf(s: WorldSetup, gunRng: SeededRng = new SeededRng(2), lookoutRng: SeededRng = new SeededRng(18), keys?: string[]): ColGroup {
  return new DestroyerGroup(sceneOf(keys), s.destroyer!, s.transport, s.transit ?? null, s.mission.bounds, gunRng, lookoutRng, chain, shipArtKey(s.mission.enemyId), s.pickets ?? null);
}

export const setupOf = (id: string, hard = false, seed?: number, o: SetupOptions = {}): WorldSetup =>
  buildWorldSetup(gameData, id, seed === undefined ? { hard, ...o } : { sortie: directSortie(id, seed, 'none', hard, false), hard, ...o });

export interface ColWorld {
  readonly setup: WorldSetup;
  readonly destroyers: ColGroup;
  readonly kits: readonly ColumnKit[];
  readonly boat: { readonly state: BoatState; sinking: boolean };
  readonly torpedoes: { readonly states: never[]; step(): void };
  readonly launcher: { clearQueue(): void };
  readonly returnPoint: { readonly torpedoEndSettleS: number };
  readonly vis: { readonly detectHoldS: number };
  readonly detect: { count: number; prev: boolean };
  readonly dawn: { reached: boolean };
  readonly escort: null;
  readonly smoke: null;
  readonly smokeParams: null;
  readonly torpedoEvents: object;
  readonly radar: WorldRadar | null;
  flareLit: boolean;
  hiddenBySmoke: boolean;
  detectRangeM: number;
  visRange2: number;
  stepTimeS: number;
  readonly dawnS: number;
  readonly gunRng: CountingRng;
  readonly lookoutRng: CountingRng;
  resolveRemainingAsMisses(): void;
  sinkBoat(): void;
}

/** us_05 の小さな世界。seed を渡せば今夜の揺らぎ込み（出撃の seed。乱数の系列は seed+1・seed+17）、省けば揺らぎなし。radar は false で作らない */
export function colWorld(o: { hard?: boolean; seed?: number; dawnS?: number; radar?: boolean; setup?: SetupOptions; mission?: string } = {}): ColWorld {
  const id = o.mission ?? 'us_05';
  const setup = setupOf(id, o.hard ?? false, o.seed, o.setup ?? {});
  const seed = o.seed ?? 1;
  const gunRng = new CountingRng((seed + 1) >>> 0);
  const lookoutRng = new CountingRng((seed + 17) >>> 0);
  const g = groupOf(setup, gunRng, lookoutRng);
  const radar = o.radar === false || !setup.radar ? null : new WorldRadar(setup.radar, setup.mission.bounds, setup.shores, g.total, null, '');
  return {
    setup, destroyers: g, kits: setup.transit?.column ?? [], boat: { state: { x: setup.playerStart.x, y: setup.playerStart.y, headingDeg: setup.playerStart.headingDeg, speedMps: 0 }, sinking: false },
    torpedoes: { states: [], step: () => undefined }, launcher: { clearQueue: () => undefined }, returnPoint: setup.mission.returnPoint, vis: setup.vis, detect: { count: 0, prev: false },
    dawn: { reached: false }, escort: null, smoke: null, smokeParams: null, torpedoEvents: {}, radar, flareLit: false, hiddenBySmoke: false, detectRangeM: 0, visRange2: setup.visRange2,
    stepTimeS: 0, dawnS: o.dawnS ?? setup.durationS, gunRng, lookoutRng, resolveRemainingAsMisses: () => undefined, sinkBoat: () => undefined,
  };
}

/** 1 固定ステップ（slow は命中スローの間）。夜明けのラッチは立った 1 回だけ隊を退かせる（world-dawn。退く先は任務の dawn_withdraw） */
export function colStep(w: ColWorld, slow = false): void {
  const s = w.setup;
  const realDt = FIXED_STEP_S;
  const feelDt = realDt * (slow ? s.slowMoFactor : 1);
  const dt = feelDt * s.timeScale;
  w.stepTimeS += realDt;
  if (!w.dawn.reached && w.stepTimeS >= w.dawnS) {
    w.dawn.reached = true;
    if (s.dawnAir.retireEdge) w.destroyers.withdraw(retireHeadingDeg(s.dawnAir.retireEdge, s.night.mirrored));
  }
  stepDestroyerSide(w, w.destroyers, dt, feelDt, w.boat.state);
  w.radar?.step(w);
}

/** until 秒（固定ステップの時計）まで回す（each は各ステップの前に呼ぶ。slow は真の間だけ命中スロー） */
export function colRun(w: ColWorld, untilS: number, each?: (w: ColWorld) => void, slow?: (w: ColWorld) => boolean): void {
  while (w.stepTimeS < untilS - 1e-9) {
    each?.(w);
    colStep(w, slow ? slow(w) : false);
  }
}

/** 自艇を (x, y) に置く */
export function boatAt(w: ColWorld, x: number, y: number): void {
  w.boat.state.x = x;
  w.boat.state.y = y;
}

/** 列の艦の段階の文字列（例 "1111044"） */
export function colPhases(w: ColWorld): string {
  const st = w.destroyers.transit!.state;
  return Array.from(st.phase.slice(0, st.ships)).join('');
}
