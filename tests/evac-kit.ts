// 空襲下の退避（v0.6.11 S1。spec-v0611-r2 §13 の S1）の tests の共通: jp_03 の本物の setup（buildWorldSetup）から隊・座席を組み、操作中の隊長艇を
// 世界と同じ順（座席の入力 evacSeatCommand → stepBoat・縁 → stepEvacBoats → 帯）で動かす。1 編隊が 1 つの隊から沈める隻数（r2 H1 (1)）の小さな台も
// ここ（本物の stepAirStrike・restartAirSortie・pointNearBoat・applyShellHit・stepDamage。S2 の evac-plan / evac-hits の前の、隊 1 つ × 編隊 1 つ）。
import { gameData } from '../src/config/game-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import { AS_EV_IMPACT, AS_EV_RELEASE, airStrikeActive, createAirStrike, stepAirStrike, type AirStrikeCheck } from '../src/core/air-strike';
import { airSortieComplete, createSortieBase, restartAirSortie } from '../src/core/air-sortie';
import { clampToBounds, nextSpeedBand, stepBoat, type BoatInput } from '../src/core/boat-motion';
import { stepEvacBoats } from '../src/core/evac-boats';
import { EVAC_AI_SEED_OFFSET, EVAC_DODGE_SEED_OFFSET, EVAC_FLIGHT_SEED_OFFSET, G_GONE, G_HAULING, G_UNDERWAY } from '../src/core/evac-data';
import { evacCruise01, evacOnRelease } from '../src/core/evac-follow';
import type { EvacParams } from '../src/core/evac-params';
import { evacHitRecord, evacLoadSeat, evacSeatCommand, evacStepFires, type EvacSeat, type EvacSeatHooks } from '../src/core/evac-seat';
import { createEvacSquadron, evacExposed, evacLeader, evacTrailReset, type EvacSquadron, type EvacSquadronConfig } from '../src/core/evac-squadron';
import { pointNearBoat, type HitOutcome } from '../src/core/gunnery';
import { SeededRng } from '../src/core/rng';
import { directSortie } from '../src/core/sortie';
import { buildWorldSetup, type WorldSetup } from '../src/systems/world-setup';

export const DT = FIXED_STEP_S;

/** jp_03 の setup（seed 1。evac の値は seed・史実モードで変わらない＝tests/setup-jp03） */
export function evacSetup(hard = false): WorldSetup {
  return buildWorldSetup(gameData, 'jp_03', { sortie: directSortie('jp_03', 1, 'none', hard, false), hard });
}

export const SETUP = evacSetup();
export const P = SETUP.evac!.params;
export const DTG = DT * SETUP.timeScale;

export function evacConfig(s: WorldSetup = SETUP, over: Partial<EvacParams> = {}): EvacSquadronConfig {
  return { p: { ...s.evac!.params, ...over }, boat: s.boatParams, damage: s.damageParams, crew: s.crew, crewEffects: s.crewEffects, bounds: s.mission.bounds, boundsMarginM: s.boundsMarginM, durationS: s.durationS };
}

/** 新しい座席（世界の自艇の代わり。値は操作中の隊長艇から入れる） */
export function makeSeat(sq: EvacSquadron): EvacSeat {
  const seat: EvacSeat = { state: { x: 0, y: 0, headingDeg: 0, speedMps: 0 }, damage: { hp: 0, engineDamaged: false, fireLeftS: 0 }, params: { ...sq.cfg.boat }, band: 'stop' };
  evacLoadSeat(sq, seat);
  return seat;
}

export interface EvacRig {
  sq: EvacSquadron;
  seat: EvacSeat;
  ai: SeededRng;
  t: number;
}

export function makeRig(seed = 1, over: Partial<EvacParams> = {}): EvacRig {
  const ai = new SeededRng(seed + EVAC_AI_SEED_OFFSET);
  const sq = createEvacSquadron(evacConfig(SETUP, over), ai);
  return { sq, seat: makeSeat(sq), ai, t: 0 };
}

const cmd: BoatInput = { headingDeg: NaN, speed01: 0 };

/** 世界の 1 固定ステップの隊の分（時計 → 座席の運動 → stepEvacBoats → 帯。空襲・火災は入れない） */
export function stepRig(r: EvacRig, input: BoatInput): void {
  r.t += DT;
  const { sq, seat } = r;
  evacSeatCommand(sq, input, cmd);
  stepBoat(seat.state, cmd, seat.params, DTG);
  clampToBounds(seat.state, sq.cfg.bounds, sq.cfg.boundsMarginM);
  stepEvacBoats(sq, seat, input, r.ai, r.t, DTG, DT);
  seat.band = nextSpeedBand(seat.band, seat.state.speedMps, seat.params);
}

export function stepRigFor(r: EvacRig, input: BoatInput, seconds: number, each?: () => void): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    stepRig(r, input);
    each?.();
  }
}

export const input = (headingDeg: number, speed01: number): BoatInput => ({ headingDeg, speed01 });
export const NEUTRAL: BoatInput = { headingDeg: NaN, speed01: 0 };

/** 2 点の距離 */
export const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- 1 編隊が 1 つの隊から沈める隻数（r2 H1 (1)。tests/evac-loss-table・evac-follow の回避の効き） ----------

export type LossLayout = 'moored' | 'hauling' | 'running';

export interface LossTrial {
  sunk: number;
  bombs: number;
  /** core の KPI（その時の中心＝隊長艇に当たった数） */
  centerHits: number;
}

const out: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };

/**
 * 隊 1 つ（浮標・西の第5隊の停泊地 (500, 550)・東向き）を 1 編隊（planes 機）が狙う 1 回。layout: 停泊（縦列 12 m・止まる）、上げている（隊長艇の左右 25 m に僚艇・止まる・
 * 上げは進めない）、走る（航跡の縦列 40 m・巡航から操作していない隊のランダム回避。dodge は ai.dodge.success の上書き）。chase: 隊長艇が沈めば次の隊長艇を追う（r2 H2）、
 * でなければ去る（core の cancel）。隊が全滅すれば去る。乱数: 隊 seed+30・逃げる +31・編隊 +32（散布と隊長艇の火災・機関）
 */
export function lossTrial(layout: LossLayout, planes: number, chase: boolean, dodge: number, seed: number, s: WorldSetup = SETUP): LossTrial {
  const ev = s.evac!;
  const sp = ev.sorties.find((x) => x.planes === planes)!;
  const groups = [ev.params.groups[0]!, ev.params.groups[4]!];
  const ai = new SeededRng(seed + EVAC_AI_SEED_OFFSET);
  const sq = createEvacSquadron(evacConfig(s, { groups, startGroup: 0, dodgeSuccess: dodge }), ai);
  const seat = makeSeat(sq);
  const g = sq.groups[1]!;
  const [b0, b1, b2] = g.boats as [typeof g.boats[0], typeof g.boats[0], typeof g.boats[0]];
  if (layout === 'hauling') {
    g.phase = G_HAULING;
    b1.state.x = b0.state.x;
    b1.state.y = b0.state.y + P.slotAbeamM;
    b2.state.x = b0.state.x;
    b2.state.y = b0.state.y - P.slotAbeamM;
  } else if (layout === 'running') {
    g.phase = G_UNDERWAY;
    g.aiHeadingDeg = b0.state.headingDeg;
    g.aiSpeed01 = evacCruise01(b0.params);
    for (let k = 0; k < 3; k++) {
      const b = g.boats[k]!;
      b.state.x = b0.state.x - k * P.followGapM;
      b.state.speedMps = s.boatParams.speedCruiseMps;
    }
    evacTrailReset(g, P.trailStepM);
  }
  const fl = new SeededRng(seed + EVAC_FLIGHT_SEED_OFFSET);
  const dodgeRng = new SeededRng(seed + EVAC_DODGE_SEED_OFFSET);
  const st = createAirStrike(sp);
  const check: AirStrikeCheck = { player: b0.state, playerSinking: false, escort: null, escortAfloat: false, cancel: false };
  const hooks: EvacSeatHooks = {
    onSeatLoaded: () => {},
    onLeaderChanged: () => {
      const lead = evacLeader(g)!;
      if (!chase) check.cancel = true;
      check.player = lead.state;
      st.prevHeadingDeg = lead.state.headingDeg;
    },
    onGroupGone: () => {
      check.cancel = true;
    },
    onBoatSunk: () => {},
  };
  restartAirSortie(st, sp, b0.state, ev.raid.fromBearingDeg + ev.raid.bearingFixDeg[planes - 1]!, ev.raid.spawnM, createSortieBase());
  const r: LossTrial = { sunk: 0, bombs: 0, centerHits: 0 };
  let t = 0;
  for (let i = 0; i < 90 / DT; i++) {
    t += DT;
    if (layout === 'running') stepEvacBoats(sq, seat, NEUTRAL, ai, t, DTG, DT);
    check.cancel ||= g.phase === G_GONE;
    const e = stepAirStrike(st, sp, check, fl, DT);
    if (e & AS_EV_RELEASE) {
      r.bombs++;
      evacOnRelease(sq, dodgeRng, 1);
    }
    if (e & AS_EV_IMPACT) {
      const b = st.bombs[st.lastImpact]!;
      if (b.hitPlayer) r.centerHits++;
      for (let k = 0; k < g.boats.length; k++) {
        const boat = g.boats[k]!;
        if (evacExposed(sq, boat) && pointNearBoat(b.aimX, b.aimY, boat.state, sp.playerHalfLengthM, sp.playerHitRadiusM)) evacHitRecord(sq, seat, boat, sp.bombHit, fl, t, hooks, out);
      }
    }
    evacStepFires(sq, seat, DT, t, hooks);
    if (airSortieComplete(st) || (st.started && st.cancelled && !airStrikeActive(st))) break;
  }
  for (let k = 0; k < g.boats.length; k++) if (g.boats[k]!.sunk) r.sunk++;
  return r;
}

/** n 回の平均（seed 1〜n） */
export function lossMean(layout: LossLayout, planes: number, chase: boolean, dodge: number, n: number): { sunk: number; centerHitRate: number } {
  let sunk = 0;
  let bombs = 0;
  let hits = 0;
  for (let seed = 1; seed <= n; seed++) {
    const r = lossTrial(layout, planes, chase, dodge, seed);
    sunk += r.sunk;
    bombs += r.bombs;
    hits += r.centerHits;
  }
  return { sunk: sunk / n, centerHitRate: bombs > 0 ? hits / bombs : 0 };
}
