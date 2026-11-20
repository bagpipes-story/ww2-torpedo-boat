// 迎撃の模擬（v0.8.0 S3。us_04「ブラケット海峡の夜」。spec-v0800 §4.11、lead の L18）の世界の側の写し（Phaser 非依存・乱数は渡された系列だけ）:
// 艦（entities/destroyer の論理: step・goAway・reappear・体当たり・被雷・沈み始め）・列の通過（systems/destroyer-transit の DestroyerTransit）・
// レーダーの掃引（systems/world-radar の WorldRadar.step）。魚雷のプールと発射管制の写しは core/intercept-sim-torpedoes。どれも同じ core（ship-ai・ship-transit・
// radar・dawn-withdraw・torpedo-solver）を同じ順で呼ぶ。core から systems は import しない作法なので写し、tests/intercept-sim-a が本物（tests/transit-world-kit の
// DestroyerTransit・WorldRadar）とステップごとに突き合わせる。沈没の演出（2 秒の tween）は呼ぶ側が時計で数える。確保は作る時だけ。B6 の 1 本（columnShot）もここ。
import { clampToBounds, clampYToBounds, type BoatState, type SeaBounds } from './boat-motion';
import { beyondBounds } from './dawn-withdraw';
import { RADAR_KIND_SHIP, radarSweepDue, stepRadar, type RadarGeometry, type RadarState, type RadarTargets } from './radar';
import type { RadarParams } from './radar-data';
import type { SeededRng } from './rng';
import { createShipAiState, startRetire, steerShip, turnRateFor, updateShipAi, type ShipAiParams, type ShipAiState } from './ship-ai';
import { createShipTransit, stepShipTransit, transitAppearLeg, transitPending, type ShipTransitState, type TransitPlan } from './ship-transit';
import { createTorpedoState, isArmed, launchTorpedo, markMissIfPassed, stepTorpedo, type TorpedoParams, type TorpedoState } from './torpedo';
import type { TorpedoTarget } from './torpedo-targets';
import { boatTouchesHull, createCircles, fillHullCircles, interceptHeadingDeg, pointHitsHull, velocityFromHeading, type Circle } from './torpedo-solver';

/** 艦の寸法と耐久（systems/destroyer-setup の DestroyerSpec が形で満たす） */
export interface SimShipSpec {
  readonly lengthM: number;
  readonly beamM: number;
  readonly hullCircles: number;
  readonly hitsToSink: number;
  readonly hitScale: number;
  readonly boundsMarginM: number;
}

/** 艦 1 隻（entities/destroyer の論理。絵なし） */
export class SimShip implements TorpedoTarget {
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

  constructor(start: { x: number; y: number; headingDeg: number }, readonly spec: SimShipSpec, readonly p: ShipAiParams) {
    this.state = { x: start.x, y: start.y, headingDeg: start.headingDeg, speedMps: p.cruiseSpeedMps };
    this.ai = createShipAiState(start.headingDeg, p.cruiseSpeedMps);
    this.circles = createCircles(spec.hullCircles);
    this.refreshHull();
  }

  get out(): boolean {
    return this.sinking || this.withdrawn || this.offMap;
  }

  /** Destroyer.step と同じ式。戻りはこのステップで退き終えたか */
  step(dt: number, realDt: number, player: BoatState, detectM: number, holdS: number, torps: readonly TorpedoState[], bounds: SeaBounds, lookout: SeededRng): boolean {
    if (this.out) return false;
    updateShipAi(this.ai, this.state, player, detectM, holdS, torps, this.p, bounds, realDt, lookout);
    steerShip(this.state, this.ai.desiredHeadingDeg, this.ai.desiredSpeedMps, turnRateFor(this.ai.mode, this.p), this.p.accelMps2, dt);
    if (!this.ai.retiring) clampToBounds(this.state, bounds, this.spec.boundsMarginM);
    else if (this.transitShip) clampYToBounds(this.state, bounds, this.spec.boundsMarginM); // Destroyer.step と同じ（v0.8.0 実機 1 回目）
    else if (beyondBounds(this.state.x, this.state.y, bounds, this.spec.boundsMarginM)) {
      this.withdrawn = true;
      return true;
    }
    this.refreshHull();
    return false;
  }

  private refreshHull(): void {
    fillHullCircles(this.circles, this.state.x, this.state.y, this.state.headingDeg, this.spec.lengthM * this.spec.hitScale, this.spec.beamM * this.spec.hitScale);
  }

  touchesBoat(boat: BoatState, halfLengthM: number): boolean {
    return !this.out && boatTouchesHull(boat.x, boat.y, boat.headingDeg, halfLengthM, this.circles);
  }

  takeHit(): boolean {
    this.hitsTaken++;
    return this.hitsTaken >= this.spec.hitsToSink;
  }

  /** Destroyer.playSinking の論理（演出の終わり＝sunk は呼ぶ側が sinkS の後に立てる） */
  startSinking(nowS: number): void {
    if (this.sinking) return;
    this.sinking = true;
    this.sinkStartS = nowS;
    this.state.speedMps = 0;
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
    this.refreshHull();
  }
}

/** 列の通過（systems/destroyer-transit の DestroyerTransit と同じ式。all は護衛 → 列、first は列の 1 隻目の添字） */
export class SimTransit {
  readonly state: ShipTransitState;
  readonly column: readonly SimShip[];

  constructor(private readonly all: readonly SimShip[], private readonly first: number, readonly plan: TransitPlan & { readonly speedMps: number }) {
    this.state = createShipTransit(plan);
    this.column = all.slice(first, first + plan.ships);
    for (const s of this.column) {
      s.transitShip = true;
      s.goAway(false);
    }
  }

  get pending(): number {
    return transitPending(this.state);
  }

  get allOut(): boolean {
    if (transitPending(this.state) > 0) return false;
    for (let i = 0; i < this.all.length; i++) if (!this.all[i]!.out) return false;
    return true;
  }

  get allSettled(): boolean {
    if (transitPending(this.state) > 0) return false;
    for (let i = 0; i < this.all.length; i++) {
      const s = this.all[i]!;
      if (!s.sunk && !s.withdrawn && !s.offMap) return false;
    }
    return true;
  }

  /** 戻りは艦が海域を出た（着いたか去った）ステップか */
  step(nowS: number, dawn: boolean, feelDt: number): boolean {
    const st = this.state;
    const p = this.plan;
    stepShipTransit(st, p, feelDt, nowS, dawn, this.column);
    const placed = st.entered | st.returned;
    const left = st.arrived | st.gone;
    if (placed === 0 && left === 0 && !st.coverLeaves) return false;
    for (let i = 0; i < st.ships; i++) {
      const bit = 1 << i;
      const s = this.column[i]!;
      if ((placed & bit) !== 0) {
        const leg = transitAppearLeg(p, st.phase[i]!)!;
        s.reappear(leg.appearX, leg.laneY, leg.headingDeg, p.speedMps);
        startRetire(s.ai, leg.headingDeg);
      } else if ((left & bit) !== 0) {
        s.goAway((st.gone & bit) !== 0);
      }
    }
    if (st.coverLeaves) {
      for (let i = 0; i < this.first; i++) {
        const c = this.all[i]!;
        if (!c.out) startRetire(c.ai, p.outbound!.headingDeg); // 護衛が退くのは往復の列だけ（v0.8.2 の片道の列は outbound null・coverLeaves は立たない）
      }
    }
    return left !== 0;
  }
}

/** WorldRadar.step と同じ: 掃引の時だけ隊の艦の位置と「out でない」を渡す */
export function stepSimRadar(r: RadarState, p: RadarParams, geo: RadarGeometry, tg: RadarTargets, nowS: number, boat: BoatState, ships: readonly SimShip[]): void {
  if (!radarSweepDue(r, nowS)) return;
  let n = 0;
  for (let i = 0; i < ships.length && n < tg.x.length; i++) {
    const d = ships[i]!;
    tg.x[n] = d.state.x;
    tg.y[n] = d.state.y;
    tg.kind[n] = RADAR_KIND_SHIP;
    tg.afloat[n] = d.out ? 0 : 1;
    n++;
  }
  tg.n = n;
  stepRadar(r, p, geo, nowS, boat.x, boat.y, tg);
}

/**
 * B6（lead の L20・CLAUDE.md §2 の KPI）の 1 本: 列の艦（列の AI＝最大速力だけ列の速さ・退く動き・列の速さ）へ、止まった艇から正しい見越し角
 * （ゲームの見越し点マーカーと同じ core/torpedo-solver）＋ aimErrDeg の 1 本。艦は東（90°）へ、艇は艦から見て bearingDeg（0 左正横・90 艦首・180 右正横）の rangeM。
 * core/hit-rate-sim の simulateShot と同じ形（端の無い海・艇は見つからない・同じ順）で、艦だけが列の艦（S2 の現れ方: 列の速さで退く動き）。解けなければ null
 */
export function columnShot(spec: SimShipSpec, ai: ShipAiParams, speedMps: number, tp: TorpedoParams, passRadius2: number, timeScale: number, stepS: number, rangeM: number, bearingDeg: number, aimErrDeg: number, lookout: SeededRng): boolean | null {
  const c = COLUMN_SHOT_SEA / 2;
  const ship = new SimShip({ x: c, y: c, headingDeg: 90 }, spec, ai);
  ship.transitShip = true;
  ship.reappear(c, c, 90, speedMps);
  startRetire(ship.ai, 90);
  const b = (bearingDeg * Math.PI) / 180;
  const bx = c + Math.sin(b) * rangeM;
  const by = c - Math.cos(b) * rangeM;
  const vel = { x: 0, y: 0 };
  velocityFromHeading(90, speedMps, vel);
  const aim = interceptHeadingDeg(bx, by, tp.speedMps, c, c, vel.x, vel.y);
  if (aim === null) return null;
  const torp = createTorpedoState();
  launchTorpedo(torp, bx, by, aim + aimErrDeg, false, false, 0, rangeM, 0);
  const torps = [torp];
  const far: BoatState = { x: 0, y: 0, headingDeg: 0, speedMps: 0 };
  const bounds = { width: COLUMN_SHOT_SEA, height: COLUMN_SHOT_SEA };
  const dt = stepS * timeScale;
  const maxSteps = Math.ceil((tp.rangeM / tp.speedMps + COLUMN_SHOT_EXTRA_S) / dt);
  for (let i = 0; i < maxSteps; i++) {
    ship.step(dt, stepS, far, 0, 0, torps, bounds, lookout);
    if (stepTorpedo(torp, tp, dt, stepS)) return false;
    if (isArmed(torp, tp) && pointHitsHull(torp.x, torp.y, ship.circles)) return true;
    if (markMissIfPassed(torp, tp, ship.state.x, ship.state.y, passRadius2)) return false;
  }
  return false;
}

/** 端の向き直しが働かない広さ（core/hit-rate-sim と同じ）と、射程の後の余裕の秒 */
const COLUMN_SHOT_SEA = 1e7;
const COLUMN_SHOT_EXTRA_S = 60;
