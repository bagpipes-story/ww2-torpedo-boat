// 空襲下の退避の模擬（v0.6.11 S3。jp_03「運天港・空襲下の退避」。spec-v0611-r2 §8・§12）。Phaser 非依存。ゲームは使わない（tests/evac-sim-*・scripts/evac-sim.ts）。
// 1 回: 第1隊を操る座席から台本（core/evac-sim-policy の人の行）で 6 つの隊を隠し、240 秒の決着の後は帰投・沈没・漂流・打ち切りまで。世界と同じ順（spec §8。S4 の世界はこれに合わせる）:
// フレームの入力（台本 → evacFrameInput の［切替］と latch・消火の長押し）→ 固定ステップ: 時計 → 夜明けのラッチ（決着のラッチと同じ式。中かどうかはラッチの点の evacSeatHome(…, true)）→
// 乗員の倍率 → 座席の運動（evacSeatCommand・燃料は fuel_free_until_s から）→ stepEvacBoats → 帰投（evacSeatHome）→ 帯 → 対空（core/evac-sim-aa。seed+24）→
// 座席の火災（沈めば evacSinkLeader）→ stepEvacAir（予告・狙い・編隊・着弾・操作していない隊長艇の火災）→ §2 の 4 機（seed+19。座席だけを狙う）。
// 命中スローは無い（決着の前の jp_03 に命中スローは無い＝r2 M1。決着の後の §2 の 4 機の撃墜の爆発もスローなし＝S4 の evac の世界の onSunk）。
// 乱数: 陰 +29・隊 +30・逃げる +31・編隊 +32〜+43・対空 +24・§2 の 4 機 +19（世界と同じ）。台本の人の揺らぎは別の系列（core/evac-sim-policy）。引いた回数を数える（tests の +29〜+43）。
// 確保は 1 回の始めだけ（runEvacTrial の頭）。
import { AA_SEED_OFFSET, type AntiAircraftParams } from './aa-fire';
import { AIR_STRIKE_SEED_OFFSET, AS_EV_IMPACT, AS_EV_RELEASE, createAirStrike, startAirStrike, stepAirStrike, type AirStrikeCheck, type AirStrikeParams } from './air-strike';
import { clampToBounds, nextSpeedBand, setPerformance, stepBoat, type BoatInput, type BoatParams, type SeaBounds } from './boat-motion';
import { crewAccelFactor, crewExtinguishFactor, crewLost, crewTurnFactor, type CrewEffects, type CrewParams } from './crew';
import { dawnReached } from './dawn-air';
import { createEvacAirCore, stepEvacAir } from './evac-air';
import { stepEvacBoats } from './evac-boats';
import { EVAC_AI_SEED_OFFSET, EVAC_TIME_EPS_S, G_UNDERWAY } from './evac-data';
import type { EvacAirWorld } from './evac-hits';
import type { EvacParams, EvacRaidParams } from './evac-params';
import type { EvacMirror, EvacMirrorFlags } from './evac-replay';
import { evacHitSeat, evacSeatCommand, evacSeatHome, evacSinkLeader, evacFrameInput, evacLoadSeat, type EvacSeat, type EvacSeatHooks } from './evac-seat';
import { createEvacSimAa, evacAaInRange, fillEvacAaSlots, stepEvacSimAa } from './evac-sim-aa';
import { createEvacTrial, evacTrialSettle, finishEvacTrial, type EvacTrial } from './evac-sim-cell';
import { createEvacDriver, evacDriverFrame, evacDriverSeatLoaded, type EvacFrameOut, type EvacPolicy } from './evac-sim-policy';
import { createEvacSquadron, evacAfloat, evacSurvivors, type EvacBoat, type EvacSquadron } from './evac-squadron';
import type { EvacPlan } from './evac-plan';
import { createFuelState, stepFuel, type FuelCurve } from './fuel';
import type { GunBatteryParams } from './gun-battery';
import { createDamageState, stepDamage, type DamageParams, type HitOutcome } from './gunnery';
import { SeededRng } from './rng';

export type { EvacTrial } from './evac-sim-cell';

export interface EvacSimSetup {
  params: EvacParams;
  raid: EvacRaidParams;
  sorties: readonly AirStrikeParams[];
  fuelFreeUntilS: number;
  /** 240 秒の後の §2 の 4 機（座席だけを狙う） */
  dawn: AirStrikeParams;
  boat: BoatParams;
  damage: DamageParams;
  crew: CrewParams;
  crewEffects: CrewEffects;
  fuelCurve: FuelCurve;
  fuelStartGal: number;
  bounds: SeaBounds;
  boundsMarginM: number;
  durationS: number;
  timeScale: number;
  stepS: number;
  /** 隊の砲（n = 1・2・3 隻。core/evac-sim-aa の evacGunVariants）と対空。艇に砲が無ければ null */
  guns: readonly GunBatteryParams[] | null;
  aa: AntiAircraftParams;
  /** 燃料 0 で止まってから漂流で終わる実秒（mission-scene の MISSION_END_DELAY_MS） */
  adriftDelayS: number;
  /** 決着の後の打ち切りの実秒 */
  afterS: number;
}

/** ステップの終わりに呼ぶ計測の口（scripts の PERF=1・tests。t は時計。結果を変えない） */
export type EvacSimProbe = (t: number, sq: EvacSquadron, seat: EvacSeat, plan: EvacPlan) => void;

const DRIFT: BoatInput = { headingDeg: NaN, speed01: 0 };
const TIME_EPS_S = EVAC_TIME_EPS_S;

/** next() を数える（作った後の乱数に被せる。1 回の始めにだけ確保） */
function counted(rng: SeededRng): { n: number } {
  const c = { n: 0 };
  const next = rng.next.bind(rng);
  rng.next = () => {
    c.n++;
    return next();
  };
  return c;
}

/** 1 回（seed は任務の seed）。probe はステップごと（計測だけ。結果は変えない）。mirror は世界との突き合わせ（core/evac-replay。S4。結果は変えない） */
export function runEvacTrial(s: EvacSimSetup, policy: EvacPolicy, seed: number, probe: EvacSimProbe | null = null, mirror: EvacMirror | null = null): EvacTrial {
  const realDt = s.stepS;
  const dt = realDt * s.timeScale;
  const aiRng = new SeededRng((seed + EVAC_AI_SEED_OFFSET) >>> 0);
  const c30 = counted(aiRng);
  const sq = createEvacSquadron({ p: s.params, boat: s.boat, damage: s.damage, crew: s.crew, crewEffects: s.crewEffects, bounds: s.bounds, boundsMarginM: s.boundsMarginM, durationS: s.durationS }, aiRng);
  const seat: EvacSeat = { state: { x: 0, y: 0, headingDeg: 0, speedMps: 0 }, damage: createDamageState(s.damage), params: { ...s.boat }, band: 'stop' };
  evacLoadSeat(sq, seat);
  const out = createEvacTrial();
  const hit: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
  const m = { t: 0, sinking: false, extHeldS: 0 };
  const drv = createEvacDriver(policy, seed, sq, seat);
  const inner: EvacSeatHooks = {
    onSeatLoaded: (gi, kind) => {
      m.extHeldS = 0;
      evacDriverSeatLoaded(drv, gi, kind, m.t);
    },
    onLeaderChanged: () => {},
    onGroupGone: () => {},
    onBoatSunk: (b: EvacBoat) => {
      if (sq.groups[b.group]!.phase === G_UNDERWAY) out.sunkB++;
      else out.sunkA++;
    },
  };
  const world: EvacAirWorld = {
    hitSeat: (spec, rng) => {
      out.seatHits++;
      if (!m.sinking && evacHitSeat(sq, seat, spec, rng, m.t, air.hooks, hit)) m.sinking = true;
    },
    hitRecord: () => {},
    splash: () => {},
  };
  const air = createEvacAirCore(sq, seat, s.raid, s.sorties, seed, world, inner);
  const plan = air.plan;
  const c29 = counted(plan.reveal);
  const c31 = counted(air.dodge);
  const cFl = plan.flights.map((fl) => counted(fl.rng));
  const dawn = createAirStrike(s.dawn);
  const dawnRng = new SeededRng((seed + AIR_STRIKE_SEED_OFFSET) >>> 0);
  const cD: AirStrikeCheck = { player: seat.state, playerSinking: false, escort: null, escortAfloat: false, cancel: false };
  const aa = s.guns ? createEvacSimAa(s.guns, s.aa, plan.flights.length, new SeededRng((seed + AA_SEED_OFFSET) >>> 0)) : null;
  const fuel = createFuelState(s.fuelStartGal);
  const fo: EvacFrameOut = { headingDeg: NaN, speed01: 0, switchTap: false, extHeld: false, gunHeld: false };
  const stick: BoatInput = { headingDeg: NaN, speed01: 0 };
  const cmd: BoatInput = { headingDeg: NaN, speed01: 0 };
  let latched = false;
  let latchStep = false;
  let atHome = false;
  let adriftS = 0;
  const base = s.boat;
  const mf: EvacMirrorFlags = { t: 0, atHome: false, latched: false, sinking: false, caughtOutside: false, extHeldS: 0 };
  mirror?.begin({ sq, seat, plan, repass: air.repass, dawn, aa, fuel, aiRng, dodge: air.dodge, dawnRng, flags: mf });
  for (let k = 0; ; k++) {
    const t0 = m.t;
    // ---- フレームの入力（固定ステップの前。座席が沈み始めたら入力なし） ----
    evacDriverFrame(drv, { sq, seat, plan, dawn, dawnLatched: latched, aa, t: t0 }, fo);
    mirror?.frame(k, fo);
    stick.headingDeg = fo.headingDeg;
    stick.speed01 = fo.speed01;
    if (!m.sinking) {
      if (evacFrameInput(sq, seat, stick, fo.switchTap, air.hooks)) out.taps++;
      if (fo.extHeld && seat.damage.fireLeftS > 0) {
        m.extHeldS += realDt;
        const alive = s.crew.total - crewLost(s.crew, s.damage.maxHp, seat.damage.hp);
        if (m.extHeldS >= s.damage.extinguishHoldS * crewExtinguishFactor(s.crewEffects, alive, s.crew.total)) {
          seat.damage.fireLeftS = 0;
          m.extHeldS = 0;
          out.extinguished++;
        }
      } else m.extHeldS = 0;
    }
    // ---- 固定ステップ（spec §8） ----
    m.t += realDt;
    const t = m.t;
    latchStep = false;
    if (!latched && !m.sinking && dawnReached(s.durationS, t)) {
      latched = true;
      latchStep = true;
      out.caughtOutside = !evacSeatHome(sq, seat, true);
      startAirStrike(dawn, s.dawn, seat.state);
    }
    const lost = crewLost(s.crew, s.damage.maxHp, seat.damage.hp);
    setPerformance(seat.params, base.turnRateDegS, base.accelMps2, crewTurnFactor(s.crewEffects, lost), crewAccelFactor(s.crewEffects, lost));
    if (!m.sinking) {
      evacSeatCommand(sq, stick, cmd);
      stepBoat(seat.state, fuel.empty ? DRIFT : cmd, seat.params, dt);
      clampToBounds(seat.state, s.bounds, s.boundsMarginM);
      if (t >= s.fuelFreeUntilS - TIME_EPS_S) stepFuel(fuel, s.fuelCurve, seat.state.speedMps, dt);
      stepEvacBoats(sq, seat, stick, aiRng, t, dt, realDt);
      atHome = evacSeatHome(sq, seat, latchStep);
    }
    seat.band = nextSpeedBand(seat.band, seat.state.speedMps, seat.params);
    let flashM = 0;
    if (aa) {
      fillEvacAaSlots(aa, plan, latched ? dawn : null, s.dawn, seat.state);
      drv.inRange = evacAaInRange(aa, seat.state);
      const g = sq.groups[sq.control]!;
      let n = 0;
      for (let k = 0; k < g.boats.length; k++) if (!g.boats[k]!.sunk && !g.boats[k]!.up) n++;
      stepEvacSimAa(aa, plan, latched ? dawn : null, s.dawn, seat.state, seat.band, n, fo.gunHeld, !m.sinking && !atHome, t, realDt);
      if (t <= aa.flashUntilS) flashM = s.guns![0]!.flashRevealM;
    }
    if (!m.sinking && stepDamage(seat.damage, s.damage, realDt) && !evacSinkLeader(sq, seat, sq.control, t, air.hooks)) m.sinking = true;
    const relBefore = plan.releases;
    stepEvacAir(air, t, realDt, realDt, flashM);
    out.evacReleases += plan.releases - relBefore;
    if (plan.evSettle) evacTrialSettle(out, sq, t);
    if (latched) {
      cD.playerSinking = m.sinking;
      cD.cancel = m.sinking || atHome;
      const ev = stepAirStrike(dawn, s.dawn, cD, dawnRng, realDt);
      if (ev & AS_EV_RELEASE) drv.dawnReleases++;
      if (ev & AS_EV_IMPACT) {
        out.dawnBombs++;
        if (dawn.bombs[dawn.lastImpact]!.hitPlayer && !m.sinking) {
          out.dawnHits++;
          if (evacHitSeat(sq, seat, s.dawn.bombHit, dawnRng, t, air.hooks, hit)) m.sinking = true;
        }
      }
      if (!atHome && !m.sinking) out.caughtOutside = true;
    }
    probe?.(t, sq, seat, plan);
    if (mirror) {
      mf.t = t;
      mf.atHome = atHome;
      mf.latched = latched;
      mf.sinking = m.sinking;
      mf.caughtOutside = out.caughtOutside;
      mf.extHeldS = m.extHeldS;
      mirror.after(k);
    }
    // ---- 終わり（フレームの終わり。決着の前は終えない＝evacHold） ----
    if (m.sinking) out.end = 'sunk';
    else if (latched && atHome) out.end = 'home';
    else if (fuel.empty && seat.band === 'stop' && (adriftS += realDt) >= s.adriftDelayS - TIME_EPS_S) out.end = 'adrift';
    else if (t >= s.durationS + s.afterS - TIME_EPS_S) out.end = 'timeout';
    if (!(fuel.empty && seat.band === 'stop')) adriftS = 0;
    if (out.end !== '') break;
    if (Number.isNaN(out.slotsFullS)) {
      let used = 0;
      let all = 0;
      for (let k = 0; k < sq.shelterUsed.length; k++) {
        used += sq.shelterUsed[k]!;
        all += s.params.shelters[k]!.slots;
      }
      if (used >= all) out.slotsFullS = t;
    }
  }
  out.timeS = m.t;
  out.survivors = evacSurvivors(sq);
  out.afloatControl = evacAfloat(sq.groups[sq.control]!);
  out.draws29 = c29.n;
  out.draws30 = c30.n;
  out.draws31 = c31.n;
  for (let i = 0; i < cFl.length; i++) out.drawsFlights += cFl[i]!.n;
  out.downs = aa ? aa.downsEvac : 0;
  out.downsAll = aa ? aa.downs : 0;
  out.rounds = aa ? aa.rounds : 0;
  finishEvacTrial(out, sq, plan, air.repass, s.raid.survivorQuota, s.durationS, s.params.pickS);
  return out;
}

