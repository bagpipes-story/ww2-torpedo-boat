// v0.8.0 S2（spec-v0800 §6 の S2・brief L9〜L11）: 列の通過とレーダーの小さな世界（Phaser なし）。tests/transit-world・radar-world・radar-neutral が使う。
// 艦は entities/destroyer の step・goAway・reappear と同じ式の素の艦（絵なし。式は下の KitShip に写した＝tests/transit-world が entities/destroyer の文と突き合わせる）。
// 1 固定ステップは systems/mission-world の stepFn の順: 時計（stepTimeS += 実秒）→ 夜明けのラッチ（立った 1 回だけ浮いている艦を退く向きへ＝destroyer-group の withdraw）→
// 艦を動かす（systems/destroyer-step の艦の段）→ 列の段階（systems/destroyer-transit。同じ段の直後）→ レーダー（systems/world-radar。敵の側の段の最後）。
// 自艇は動かない（発見の距離 0＝見つからない・撃たれない）。命中スローは slow の間だけ feelDt ＝ 実秒 × hit_slowmo_factor、dt ＝ feelDt × time_scale（mission-world と同じ）。
import { gameData } from '../src/config/game-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import { clampToBounds, clampYToBounds, type BoatState, type SeaBounds } from '../src/core/boat-motion';
import { beyondBounds, retireHeadingDeg } from '../src/core/dawn-withdraw';
import { SeededRng } from '../src/core/rng';
import { createShipAiState, startRetire, steerShip, turnRateFor, updateShipAi, type ShipAiParams, type ShipAiState } from '../src/core/ship-ai';
import { directSortie } from '../src/core/sortie';
import { DestroyerTransit, type TransitShip } from '../src/systems/destroyer-transit';
import { WorldRadar } from '../src/systems/world-radar';
import { buildWorldSetup, type WorldSetup } from '../src/systems/world-setup';

/** entities/destroyer の論理の写し（絵・当たりの円なし）。式は Destroyer.step・goAway・reappear と同じ */
export class KitShip implements TransitShip {
  readonly state: BoatState;
  readonly ai: ShipAiState;
  sinking = false;
  sunk = false;
  withdrawn = false;
  offMap = false;
  transitShip = false;

  constructor(start: { x: number; y: number; headingDeg: number }, readonly p: ShipAiParams, readonly marginM: number) {
    this.state = { x: start.x, y: start.y, headingDeg: start.headingDeg, speedMps: p.cruiseSpeedMps };
    this.ai = createShipAiState(start.headingDeg, p.cruiseSpeedMps);
  }

  get out(): boolean {
    return this.sinking || this.withdrawn || this.offMap;
  }

  step(dt: number, realDt: number, player: BoatState, bounds: SeaBounds, rng: SeededRng, detectM = 0, holdS = 0): boolean {
    if (this.out) return false;
    updateShipAi(this.ai, this.state, player, detectM, holdS, [], this.p, bounds, realDt, rng);
    steerShip(this.state, this.ai.desiredHeadingDeg, this.ai.desiredSpeedMps, turnRateFor(this.ai.mode, this.p), this.p.accelMps2, dt);
    if (!this.ai.retiring) clampToBounds(this.state, bounds, this.marginM);
    else if (this.transitShip) clampYToBounds(this.state, bounds, this.marginM); // Destroyer.step と同じ（v0.8.0 実機 1 回目）
    else if (beyondBounds(this.state.x, this.state.y, bounds, this.marginM)) {
      this.withdrawn = true;
      return true;
    }
    return false;
  }

  goAway(gone: boolean): void {
    if (gone) this.withdrawn = true;
    else this.offMap = true;
    const ai = this.ai;
    ai.playerDetected = false;
    ai.detectHoldLeftS = 0;
    ai.wakeSpotted = false;
    ai.wakeSeenForS = -1;
  }

  reappear(x: number, y: number, headingDeg: number, speedMps: number): void {
    const s = this.state;
    s.x = x;
    s.y = y;
    s.headingDeg = headingDeg;
    s.speedMps = speedMps;
    this.offMap = false;
  }
}

export interface KitWorld {
  readonly setup: WorldSetup;
  readonly ships: KitShip[];
  readonly transit: DestroyerTransit;
  readonly radar: WorldRadar | null;
  readonly boat: { readonly state: BoatState };
  readonly destroyers: { readonly ships: readonly KitShip[] };
  readonly dawn: { reached: boolean };
  stepTimeS: number;
  /** 夜明けの実秒（既定は setup.durationS） */
  readonly dawnS: number;
  readonly rng: SeededRng;
  /** 艦が自艇を見つける距離 m（既定 0＝見つからない。setup の出発時の値を渡せば発見・体当たりの AI も回る）と見失うまでの秒 */
  readonly detectM: number;
}

/**
 * us_04 の小さな世界。seed を渡せば今夜の揺らぎ込み（出撃の seed）、省けば揺らぎなし。radar は false で作らない。detect は自艇を見つける距離を出発時の値に。
 * mission（v0.8.2 S0）は列のある任務（既定 us_04。us_05 の片道の列＝列だけの隊は護衛 0 隻・艦はみな列の AI の形＝S0 の世界と同じ）
 */
export function kitWorld(o: { hard?: boolean; seed?: number; dawnS?: number; radar?: boolean; detect?: boolean; mission?: string } = {}): KitWorld {
  const hard = o.hard ?? false;
  const id = o.mission ?? 'us_04';
  const setup = buildWorldSetup(gameData, id, o.seed === undefined ? { hard } : { sortie: directSortie(id, o.seed, 'none', hard, false), hard });
  const ds = setup.destroyer!;
  const tr = setup.transit!;
  const ships: KitShip[] = ds.starts.map((st) => new KitShip(st, ds.shipAi, ds.spec.boundsMarginM));
  for (let i = 0; i < tr.ships; i++) ships.push(new KitShip({ x: tr.inbound.appearX, y: tr.inbound.laneY, headingDeg: tr.inbound.headingDeg }, tr.shipAi, ds.spec.boundsMarginM));
  const transit = new DestroyerTransit(ships, ds.starts.length, tr);
  const radar = o.radar === false ? null : new WorldRadar(setup.radar!, setup.mission.bounds, setup.shores, ships.length, null, tr.outbound !== null && tr.outbound.edge === 'east' ? tr.vilaLabelJa : ''); // 東の揚陸の地の名は systems/radar-view の buildRadar と同じ（v0.8.0 S4）
  const ps = setup.playerStart;
  return {
    setup, ships, transit, radar, boat: { state: { x: ps.x, y: ps.y, headingDeg: ps.headingDeg, speedMps: 0 } }, destroyers: { ships },
    dawn: { reached: false }, stepTimeS: 0, dawnS: o.dawnS ?? setup.durationS, rng: new SeededRng(1), detectM: o.detect ? setup.detectRangeAtStartM : 0,
  };
}

/** 1 固定ステップ（slow は命中スローの間）。戻りは列の艦が海域を出たステップか（destroyer-step の left） */
export function kitStep(w: KitWorld, slow = false): boolean {
  const s = w.setup;
  const realDt = FIXED_STEP_S;
  const feelDt = realDt * (slow ? s.slowMoFactor : 1);
  const dt = feelDt * s.timeScale;
  w.stepTimeS += realDt;
  if (!w.dawn.reached && w.stepTimeS >= w.dawnS) {
    w.dawn.reached = true;
    const h = retireHeadingDeg(s.dawnAir.retireEdge!, s.night.mirrored);
    for (const d of w.ships) if (!d.out) startRetire(d.ai, h);
  }
  for (const d of w.ships) d.step(dt, feelDt, w.boat.state, s.mission.bounds, w.rng, w.detectM, s.vis.detectHoldS);
  const left = w.transit.step(w, feelDt);
  w.radar?.step(w);
  return left;
}

/** 列の艦の段階の文字列（例 "120"） */
export function phases(w: KitWorld): string {
  return Array.from(w.transit.state.phase.slice(0, w.transit.state.ships)).join('');
}
