// v0.8.1 S2（spec-v0810 §6 の S2「tests/anchor-world」、lead の L30〜L35）: 止まった艦と暗い岸を背にの小さな世界（Phaser なし）。tests/anchor-world・backdrop-world・kpi-world が使う。
// 艦は entities/destroyer の step と同じ式の素の艦（絵・反撃なし。当たりの円はあり。式は AnchorKitShip に写した＝tests/anchor-world が entities/destroyer の文と突き合わせる）。
// 1 固定ステップは systems/mission-world の stepFn の順: 時計（stepTimeS += 実秒）→ 夜明けのラッチ（立った 1 回だけ浮いている艦を退く向きへ＝destroyer-group の withdraw）→
// 敵の側の段＝本物の systems/destroyer-step（艦の段の見つける距離は本物の systems/shore-backdrop・止まった艦の段は本物の systems/destroyer-anchor）。
// 隊の付け方は world-enemies・destroyer-group と同じ（並びは駆逐艦 → 輸送船 → ハードの駆潜艇＝v0.8.1 S2b の L41・岸の線は landLinesOf・計画は隊の艦の全部＝L43。tests/anchor-world が source を突き合わせる）。
// 反撃（EnemyFire）・魚雷のプール・体当たり・一斉発射は偽物（何もしない）。雷跡は tests が置く素の魚雷（active・位置・針路だけ）を AI が読む。
// destroyer-step は型で destroyer-group（Phaser の entities/destroyer を引く）を参照するので、型検査（tsconfig.node）に入れないよう文字列を組んだ動的 import で読む（torpedo-free-kit の作法）。
import { gameData } from '../src/config/game-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import { clampToBounds, clampYToBounds, type BoatState, type SeaBounds } from '../src/core/boat-motion';
import { allShipsOut, allShipsSettled, beyondBounds, retireHeadingDeg } from '../src/core/dawn-withdraw';
import { RADAR_KIND_SHIP, RADAR_KIND_SMALL } from '../src/core/radar';
import { SeededRng } from '../src/core/rng';
import { LOOKOUT_SEED_OFFSET, createShipAiState, startRetire, steerShip, turnRateFor, updateShipAi, type ShipAiParams, type ShipAiState } from '../src/core/ship-ai';
import { landLinesOf } from '../src/core/strait-geometry';
import { createCircles, fillHullCircles, type Circle } from '../src/core/torpedo-solver';
import { directSortie } from '../src/core/sortie';
import { DestroyerAnchor } from '../src/systems/destroyer-anchor';
import { ShoreBackdrop } from '../src/systems/shore-backdrop';
import { buildWorldSetup, type DestroyerSpec, type WorldSetup } from '../src/systems/world-setup';

type StepSide = (w: unknown, g: unknown, dt: number, feelDt: number, boat: BoatState) => void;
const { stepDestroyerSide } = (await import(/* @vite-ignore */ ['..', 'src', 'systems', 'destroyer-step'].join('/'))) as { stepDestroyerSide: StepSide };

/** 雷跡の素の魚雷（core/ship-ai が読む欄だけ） */
export interface KitTorpedo {
  active: boolean;
  x: number;
  y: number;
  headingDeg: number;
}

/** entities/destroyer の論理の写し（絵・反撃なし）。式は Destroyer.step と同じ（止まっている間は見張りだけ）。lastDetectM は step に渡った見つける距離 */
export class AnchorKitShip {
  readonly state: BoatState;
  readonly ai: ShipAiState;
  readonly circles: Circle[];
  hitsTaken = 0;
  sinking = false;
  sunk = false;
  sinkStartS = NaN;
  withdrawn = false;
  offMap = false;
  transitShip = false;
  anchored = false;
  lastDetectM = NaN;

  constructor(start: { x: number; y: number; headingDeg: number }, readonly spec: DestroyerSpec, readonly aiParams: ShipAiParams, readonly bounds: SeaBounds, readonly lookoutRng: SeededRng) {
    this.state = { x: start.x, y: start.y, headingDeg: start.headingDeg, speedMps: aiParams.cruiseSpeedMps };
    this.ai = createShipAiState(start.headingDeg, aiParams.cruiseSpeedMps);
    this.circles = createCircles(spec.hullCircles);
    this.refreshHull();
  }

  get out(): boolean {
    return this.sinking || this.withdrawn || this.offMap;
  }

  step(dt: number, realDt: number, player: BoatState, playerDetectRangeM: number, detectHoldS: number, torpedoes: readonly KitTorpedo[]): boolean {
    this.lastDetectM = playerDetectRangeM;
    if (this.out) return false;
    updateShipAi(this.ai, this.state, player, playerDetectRangeM, detectHoldS, torpedoes as never, this.aiParams, this.bounds, realDt, this.lookoutRng);
    if (this.anchored) return false; // Destroyer.step と同じ（v0.8.1 S2）
    steerShip(this.state, this.ai.desiredHeadingDeg, this.ai.desiredSpeedMps, turnRateFor(this.ai.mode, this.aiParams), this.aiParams.accelMps2, dt);
    if (!this.ai.retiring) clampToBounds(this.state, this.bounds, this.spec.boundsMarginM);
    else if (this.transitShip) clampYToBounds(this.state, this.bounds, this.spec.boundsMarginM);
    else if (beyondBounds(this.state.x, this.state.y, this.bounds, this.spec.boundsMarginM)) {
      this.withdrawn = true;
      return true;
    }
    this.refreshHull();
    return false;
  }

  private refreshHull(): void {
    fillHullCircles(this.circles, this.state.x, this.state.y, this.state.headingDeg, this.spec.lengthM * this.spec.hitScale, this.spec.beamM * this.spec.hitScale);
  }
}

/** 隊の偽物（systems/destroyer-group の destroyer-step・destroyer-anchor・anchor-telemetry・torpedo-free が読む部分） */
export class KitGroup {
  readonly fires: { step(): void; stepPair(): void }[];
  readonly transit = null;
  readonly pendingReturns = 0;
  readonly passRadius2 = 0;
  anchors: DestroyerAnchor | null = null;
  backdrop: ShoreBackdrop | null = null;
  constructor(readonly ships: AnchorKitShip[], readonly destroyerCount: number, readonly transportIndex: number, readonly picketIndex = -1, readonly picketCount = 0) {
    this.fires = ships.map(() => ({ step: () => undefined, stepPair: () => undefined }));
  }
  get allOut(): boolean { return allShipsOut(this.ships); }
  get allSettled(): boolean { return allShipsSettled(this.ships); }
  get anyDetected(): boolean { return this.ships.some((s) => !s.out && s.ai.playerDetected); }
  touchesBoat(): boolean { return false; }
  othersOwnLit(): boolean { return false; }
  nearestAfloatIndex(x: number, y: number): number {
    let best = -1;
    let bestD2 = Infinity;
    this.ships.forEach((s, i) => {
      const d2 = (s.state.x - x) ** 2 + (s.state.y - y) ** 2;
      if (!s.out && d2 < bestD2) [best, bestD2] = [i, d2];
    });
    return best;
  }
  withdraw(headingDeg: number): void {
    for (const s of this.ships) if (!s.out) startRetire(s.ai, headingDeg);
  }
  /** systems/destroyer-group の kpiAt と同じ値（v0.8.2 S2。今の任務は駆逐艦の添字だけ＝systems/column-kits の kits） */
  kpiAt(i: number): boolean { return i >= 0 && i < this.destroyerCount; }
  /** systems/destroyer-group の radarKindAt と同じ式（v0.8.1 S2b。tests/picket-world が文と値を突き合わせる） */
  radarKindAt(i: number): number { return this.picketIndex >= 0 && i >= this.picketIndex ? RADAR_KIND_SMALL : RADAR_KIND_SHIP; }
}

export interface AnchorKitWorld {
  readonly setup: WorldSetup;
  readonly destroyers: KitGroup;
  readonly boat: { readonly state: BoatState; readonly sinking: boolean };
  readonly torpedoes: { readonly states: KitTorpedo[]; step(): void };
  readonly launcher: { clearQueue(): void };
  readonly returnPoint: { readonly torpedoEndSettleS: number };
  readonly vis: { readonly detectHoldS: number };
  readonly detect: { count: number; prev: boolean };
  readonly dawn: { reached: boolean };
  /** 照らされている（backdrop の判定。tests が立てる）・兵装の閃光の距離（tests が書く。無ければ null） */
  readonly enemy: { illuminated: boolean };
  arms: { flashM: number } | null;
  readonly escort: null;
  flareLit: boolean;
  hiddenBySmoke: boolean;
  readonly smoke: null;
  readonly smokeParams: null;
  readonly torpedoEvents: object;
  /** 世界の見つける距離（tests が書く。既定は出発時の値） */
  detectRangeM: number;
  /** 自艇の視程の 2 乗（v0.8.1 S4。systems/anchor-telemetry の目で見えている艦のビット。既定は setup の値） */
  visRange2: number;
  stepTimeS: number;
  /** 夜明けの実秒（既定は setup.durationS） */
  readonly dawnS: number;
  resolveRemainingAsMisses(): void;
  sinkBoat(): void;
}

/** 任務の小さな世界（既定 us_06）。seed を渡せば今夜の揺らぎ込み（出撃の seed）、省けば揺らぎなし。backdropOff は ?debug&nobackdrop と同じ組み立て */
export function anchorKit(o: { mission?: string; hard?: boolean; seed?: number; dawnS?: number; backdropOff?: boolean } = {}): AnchorKitWorld {
  const id = o.mission ?? 'us_06';
  const hard = o.hard ?? false;
  const base = o.backdropOff ? { backdropOff: true } : {};
  const setup = buildWorldSetup(gameData, id, o.seed === undefined ? { hard, ...base } : { sortie: directSortie(id, o.seed, 'none', hard, false), hard, ...base });
  const ds = setup.destroyer!;
  const bounds = setup.mission.bounds;
  const lookout = new SeededRng(((o.seed ?? 1) + LOOKOUT_SEED_OFFSET) >>> 0);
  const ships = ds.starts.map((st) => new AnchorKitShip(st, ds.spec, ds.shipAi, bounds, lookout));
  const tr = setup.transport;
  if (tr) ships.push(new AnchorKitShip(tr.start, tr.spec, tr.shipAi, bounds, lookout));
  const pk = setup.pickets ?? null; // ハードの駆潜艇（v0.8.1 S2b）は輸送船の後ろ（destroyer-group と同じ並び・同じ見張りの系列）
  const pi = pk ? ships.length : -1;
  if (pk) for (const st of pk.starts) ships.push(new AnchorKitShip(st, pk.spec, pk.shipAi, bounds, lookout));
  const g = new KitGroup(ships, ds.starts.length, tr ? ds.starts.length : -1, pi, pk ? pk.starts.length : 0);
  // world-enemies・destroyer-group と同じ付け方（岸の線は探照灯の切り取りと同じ・計画は隊の艦の全部）
  const land = setup.shores || setup.mission.coast ? landLinesOf(setup.shores ?? null, setup.mission.coast !== null, bounds.width, bounds.height) : null;
  if (land && setup.backdrop) g.backdrop = new ShoreBackdrop(setup.backdrop, land, ships.length, setup.seaplane ? setup.seaplane.flareRevealM : 0);
  if (setup.anchors) g.anchors = new DestroyerAnchor(ships, setup.anchors, ships.length);
  const ps = setup.playerStart;
  return {
    setup, destroyers: g, boat: { state: { x: ps.x, y: ps.y, headingDeg: ps.headingDeg, speedMps: 0 }, sinking: false },
    torpedoes: { states: [], step: () => undefined }, launcher: { clearQueue: () => undefined }, returnPoint: setup.mission.returnPoint, vis: setup.vis,
    detect: { count: 0, prev: false }, dawn: { reached: false }, enemy: { illuminated: false }, arms: null, escort: null, flareLit: false, hiddenBySmoke: false, smoke: null, smokeParams: null,
    torpedoEvents: {}, detectRangeM: setup.detectRangeAtStartM, visRange2: setup.visRange2, stepTimeS: 0, dawnS: o.dawnS ?? setup.durationS, resolveRemainingAsMisses: () => undefined, sinkBoat: () => undefined,
  };
}

/** 1 固定ステップ（slow は命中スローの間）。夜明けのラッチは立った 1 回だけ隊を退かせる（world-dawn。退く先は任務の dawn_withdraw） */
export function anchorStep(w: AnchorKitWorld, slow = false): void {
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
}

/** until 秒（固定ステップの時計）まで回す */
export function runUntil(w: AnchorKitWorld, untilS: number, each?: (w: AnchorKitWorld) => void): void {
  while (w.stepTimeS < untilS - 1e-9) {
    each?.(w);
    anchorStep(w);
  }
}
