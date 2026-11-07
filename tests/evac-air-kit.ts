// 空襲下の退避（v0.6.11 S2。spec-v0611-r2 §3.7・§8 の段 5・§13 の S2）の tests の共通: jp_03 の本物の setup から隊・座席・空襲の段（core/evac-air の
// createEvacAirCore＝段取り・core の編隊の口・包んだ hooks）を組み、世界の 1 固定ステップの順（座席の入力 → stepBoat・縁 → stepEvacBoats → 帯 → 座席の火災 →
// stepEvacAir）で回す。座席の被弾は systems/boat-damage の applyHit・sink（divert＝evacSinkLeader）と同じ形（evacHitSeat）。テストではない（vitest は *.test.ts だけ拾う）。
import { clampToBounds, nextSpeedBand, stepBoat, type BoatInput } from '../src/core/boat-motion';
import { createEvacAirCore, stepEvacAir, type EvacAirStep } from '../src/core/evac-air';
import { stepEvacBoats } from '../src/core/evac-boats';
import { EVAC_AI_SEED_OFFSET, G_HIDDEN } from '../src/core/evac-data';
import type { EvacAirWorld } from '../src/core/evac-hits';
import type { EvacParams, EvacRaidParams } from '../src/core/evac-params';
import { EVAC_NO_HOOKS, evacHitSeat, evacSeatCommand, evacSinkLeader, type EvacSeat, type EvacSeatHooks } from '../src/core/evac-seat';
import { createEvacSquadron, type EvacBoat, type EvacSquadron } from '../src/core/evac-squadron';
import { stepDamage, type HitOutcome } from '../src/core/gunnery';
import { SeededRng } from '../src/core/rng';
import { DT, DTG, evacConfig, evacSetup, makeSeat } from './evac-kit';

export const HARD = evacSetup(true);
export const NORMAL = evacSetup(false);

/** 着弾の口の記録（世界の hitBoat・絵・水柱の代わり） */
export interface AirLog {
  seatHits: number;
  recordHits: number[];
  splashes: number;
  seatSinking: boolean;
}

export interface AirRig {
  sq: EvacSquadron;
  seat: EvacSeat;
  ai: SeededRng;
  air: EvacAirStep;
  log: AirLog;
  t: number;
}

/** 隊・座席・空襲の段（hard でハードの setup。over は隊の値、raidOver は波と狙いの値の上書き。inner は世界に固有の hooks の代わり） */
export function makeAirRig(seed = 1, hard = false, over: Partial<EvacParams> = {}, inner: EvacSeatHooks = EVAC_NO_HOOKS, raidOver: Partial<EvacRaidParams> = {}): AirRig {
  const s = hard ? HARD : NORMAL;
  const ai = new SeededRng(seed + EVAC_AI_SEED_OFFSET);
  const sq = createEvacSquadron(evacConfig(s, over), ai);
  const seat = makeSeat(sq);
  const log: AirLog = { seatHits: 0, recordHits: [], splashes: 0, seatSinking: false };
  const out: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
  const r = { sq, seat, ai, log, t: 0 } as AirRig;
  const world: EvacAirWorld = {
    hitSeat: (spec, rng) => {
      log.seatHits++;
      if (!log.seatSinking && evacHitSeat(sq, seat, spec, rng, r.t, r.air.hooks, out)) log.seatSinking = true;
    },
    hitRecord: (b: EvacBoat) => void log.recordHits.push(b.index),
    splash: () => void log.splashes++,
  };
  r.air = createEvacAirCore(sq, seat, { ...s.evac!.raid, ...raidOver }, s.evac!.sorties, seed, world, inner);
  return r;
}

const cmd: BoatInput = { headingDeg: NaN, speed01: 0 };

/** 世界の 1 固定ステップ（時計 → 座席の運動 → stepEvacBoats → 帯 → 座席の火災 → stepEvacAir）。命中スローは jp_03 の決着の前に無いので feelDt = 実秒 */
export function stepAirRig(r: AirRig, input: BoatInput): void {
  r.t += DT;
  const { sq, seat } = r;
  if (!r.log.seatSinking) {
    evacSeatCommand(sq, input, cmd);
    stepBoat(seat.state, cmd, seat.params, DTG);
    clampToBounds(seat.state, sq.cfg.bounds, sq.cfg.boundsMarginM);
  }
  stepEvacBoats(sq, seat, input, r.ai, r.t, DTG, DT);
  seat.band = nextSpeedBand(seat.band, seat.state.speedMps, seat.params);
  if (!r.log.seatSinking && stepDamage(seat.damage, sq.cfg.damage, DT) && !evacSinkLeader(sq, seat, sq.control, r.t, r.air.hooks)) r.log.seatSinking = true;
  stepEvacAir(r.air, r.t, DT, DT, 0);
}

/** seconds 秒（each はステップごと。true を返せば止める） */
export function runAir(r: AirRig, input: BoatInput, seconds: number, each?: () => boolean | void): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    stepAirRig(r, input);
    if (each?.()) return;
  }
}

/** 時計が t 秒になるまで */
export function runAirUntil(r: AirRig, input: BoatInput, t: number, each?: () => boolean | void): void {
  runAir(r, input, Math.max(0, t - r.t), each);
}

/** 隊 gi を隠れた形にする（枠と段階だけ。艇はその場） */
export function forceHidden(r: AirRig, gi: number): void {
  r.sq.groups[gi]!.phase = G_HIDDEN;
}

/** 引いた回数を数える（作った後の乱数に被せる） */
export function countDraws(rng: SeededRng): () => number {
  let n = 0;
  const next = rng.next.bind(rng);
  rng.next = () => (n++, next());
  return () => n;
}
