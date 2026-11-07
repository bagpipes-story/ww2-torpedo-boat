// 空襲下の退避（v0.6.11。jp_03。spec-v0611-r2 §3.7 の着弾）: 編隊の爆弾の着弾ごとに、隠れていない全艇（中心＝狙った隊長艇を含む）を走査する。
// 凍結の core の命中（hitPlayer＝中心に当たったか）は KPI だけに使い、当たり・巻き添えはここが決める（r2 H2: 中心が替わっても、空中の爆弾は落ちた点で当たる）。
// 当たった艇は隊番号・艇番号の順に、その場で読む（r2 H5: 前の艇で交代すれば次の艇は新しい座席・沈んだ記録は飛ばす）: 座席（操作中の隊長艇）は世界の hitBoat（模擬は evacHitSeat）、
// 操作していない隊長艇は記録に applyShellHit、僚艇は HP だけ。乱数はその編隊の系列（seed+32+波×3+枠）。上げた艇・隠れた隊・決着の後は当たらない（水柱だけ）。
// 編隊の口の core 版（evacCoreFlight。凍結の AirStrikeFlight.step と同じ式で、絵が無い）もここ（模擬・tests）。Phaser 非依存・確保しない（作るのは起動時だけ）。
import { AS_EV_IMPACT, createAirStrike, stepAirStrike, type AirStrikeCheck, type AirStrikeParams } from './air-strike';
import type { EvacFlightPort, EvacFlightView, EvacPlan } from './evac-plan';
import { evacHitRecord, type EvacSeat, type EvacSeatHooks } from './evac-seat';
import { evacExposed, type EvacBoat, type EvacSquadron } from './evac-squadron';
import { pointNearBoat, type HitOutcome, type HitSpec } from './gunnery';
import type { SeededRng } from './rng';

/** 世界に固有の着弾の口（世界は hitBoat・絵・水柱、模擬は evacHitSeat と数え） */
export interface EvacAirWorld {
  /** 座席（操作中の隊長艇）への命中: 世界は hitBoat(spec, rng, x, y, 'air_strike')（boat-damage の applyHit → divert で evacSinkLeader）、模擬は evacHitSeat */
  hitSeat(spec: HitSpec, rng: SeededRng, x: number, y: number): void;
  /** 座席でない艇への命中（絵だけ。被害は evacHitRecord が済ませた後）。沈んだら sunk */
  hitRecord(b: EvacBoat, x: number, y: number, sunk: boolean): void;
  /** 何にも当たらない着弾（水柱） */
  splash(x: number, y: number): void;
}

/** 空襲の段の材料（起動時に 1 つ。hooks は core/evac-plan の evacPlanHooks で包んだもの＝世界の座席の divert にも同じものを渡す） */
export interface EvacAir {
  readonly plan: EvacPlan;
  readonly sq: EvacSquadron;
  readonly seat: EvacSeat;
  readonly hooks: EvacSeatHooks;
  readonly world: EvacAirWorld;
}

const out: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };

/**
 * 編隊 i の爆弾の着弾（x, y）。凍結の AirStrikeFlight の onPlayerHit と splash の両方からここへ（どちらでも同じ走査）。
 * 浮いていて上げておらず隊が隠れていない艇（evacExposed）に pointNearBoat（2 乗の距離。半長・半幅＋爆風はその編隊の値）。当たった艇の数を返す
 */
export function evacImpact(a: EvacAir, i: number, x: number, y: number): number {
  const { plan, sq } = a;
  const fl = plan.flights[i]!;
  const p = fl.p;
  plan.impacts++;
  if (sq.settled) {
    a.world.splash(x, y);
    return 0;
  }
  let hits = 0;
  for (let k = 0; k < sq.boats.length; k++) {
    const b = sq.boats[k]!;
    if (!evacExposed(sq, b) || !pointNearBoat(x, y, b.state, p.playerHalfLengthM, p.playerHitRadiusM)) continue;
    hits++;
    if (b.group === sq.control && b.slot === sq.groups[b.group]!.leader) a.world.hitSeat(p.bombHit, fl.rng, x, y);
    else a.world.hitRecord(b, x, y, evacHitRecord(sq, a.seat, b, p.bombHit, fl.rng, plan.nowS, a.hooks, out));
  }
  plan.boatHits += hits;
  if (hits === 0) a.world.splash(x, y);
  return hits;
}

/**
 * 編隊の口の core 版（凍結の systems/air-strike-flight の AirStrikeFlight.step と同じ式: 中心・沈没・中断（沈没 ‖ atHome ‖ 座礁）を view から写し、
 * stepAirStrike → 着弾なら着弾の点を onImpact へ（中心に当たっても外れても同じ）。絵は無い）。起動時に作る
 */
export function evacCoreFlight(p: AirStrikeParams, rng: SeededRng, onImpact: (x: number, y: number) => void): EvacFlightPort {
  const state = createAirStrike(p);
  const c: AirStrikeCheck = { player: { x: 0, y: 0, headingDeg: 0, speedMps: 0 }, playerSinking: false, escort: null, escortAfloat: false, cancel: false };
  return {
    state,
    step(feelDt: number, w: EvacFlightView): void {
      c.player = w.boat.state;
      c.playerSinking = w.boat.sinking;
      c.escort = null;
      c.escortAfloat = false;
      c.cancel = w.boat.sinking || w.atHome || w.grounded;
      if (stepAirStrike(state, p, c, rng, feelDt) & AS_EV_IMPACT) {
        const b = state.bombs[state.lastImpact]!;
        onImpact(b.aimX, b.aimY);
      }
    },
  };
}
