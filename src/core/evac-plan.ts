// 空襲下の退避（v0.6.11。jp_03。spec-v0611-r2 §3.7）の空襲の段取り: 波 × 枠の編隊（凍結の AirStrikeState 1 つずつ。済みの後に収まればもう一度＝core/evac-repass）・予告（陰の発見 → 狙い）・
// 狙い（枠 0＝操作中の隊、ほかの枠は走っている隊（段 B）を先・その枠の現れる点に近い順・1 隊 1 編隊まで。乱数なし）・始まる時の見失い・始める（restartAirSortie。
// 方位は枠の方位 ＋ bearing_fix_deg）・偽の view（中心＝狙った隊の隊長艇の記録・全滅・隠れた／決着／済み＝atHome）・隊を追う付け替え（r2 H2）・
// 動く編隊（r2 M2）。1 ステップの順・「狙われている」（r2 M13）・陰を見つける閃光・フレームの絵は core/evac-air、着弾の走査は core/evac-hits。
// Phaser 非依存・乱数は陰の発見（seed+29）だけをここで引く。確保は createEvacPlan だけ（起動時に 1 回。毎ステップは中身の書き換え）。
// 編隊は構造の型（EvacFlightPort。世界は凍結の systems/air-strike-flight の AirStrikeFlight がそのまま満たし、模擬・tests は core/evac-hits の evacCoreFlight）。
import { airStrikeActive, type AirStrikeParams, type AirStrikeState } from './air-strike';
import { airSortieComplete, createSortieBase, restartAirSortie, type SortieBase } from './air-sortie';
import type { BoatState } from './boat-motion';
import { dawnReached } from './dawn-air';
import { EVAC_SEED_OFFSET, G_GONE, G_HIDDEN, G_UNDERWAY, evacFlightSeedOffset } from './evac-data';
import type { EvacRaidParams } from './evac-params';
import type { EvacSeatHooks } from './evac-seat';
import { evacRevealCovers } from './evac-shelter';
import { evacLeader, type EvacSquadron } from './evac-squadron';
import { SeededRng } from './rng';
import { degToRad } from './units';

/** 編隊の段: 予告の前・予告した（狙いあり・announce_lead_s を待つ）・飛んでいる（restartAirSortie の後）・来ない（狙いなし・始める時に見失った・全滅） */
export const EF_IDLE = 0;
export const EF_ANNOUNCED = 1;
export const EF_FLYING = 2;
export const EF_OFF = 3;
/** 編隊の今の回の終わり方（Result・HUD。回ごとに最初に決まった 1 つ。済みの後に予告し直すと未定に戻る＝閉じた回は core/evac-repass の closed）: 未定・目標なし・始める前に見失った・始める前に全滅・途中で見失った（cancel）・隊の全滅・決着・済み */
export const EO_NONE = 0;
export const EO_NO_TARGET = 1;
export const EO_LOST_EARLY = 2;
export const EO_GONE_EARLY = 3;
export const EO_LOST = 4;
export const EO_GONE = 5;
export const EO_SETTLED = 6;
export const EO_DONE = 7;

/** 凍結の AirStrikeFlight が読む世界の口（systems/air-strike-flight の AirStrikeWorldView と同じ形。編隊ごとに 1 つ・中身だけ書き換える） */
export interface EvacFlightView {
  readonly boat: { state: BoatState; sinking: boolean };
  atHome: boolean;
  readonly grounded: boolean;
  readonly escort: null;
}

/** 編隊の口（凍結の AirStrikeFlight の state と step。着弾は作る時に渡した包みが core/evac-hits の evacImpact へ） */
export interface EvacFlightPort {
  readonly state: AirStrikeState;
  step(feelDt: number, w: EvacFlightView): void;
}

/** 編隊を作る口（i＝波 × 同時の編隊 ＋ 枠、p＝機数の 1 編隊の値、rng＝その編隊の系列 seed+32+波×3+枠） */
export type EvacPortFactory = (i: number, p: AirStrikeParams, rng: SeededRng) => EvacFlightPort;

export interface EvacFlight {
  readonly index: number;
  readonly wave: number;
  readonly slot: number;
  readonly p: AirStrikeParams;
  /** 散布 2 回（凍結の core）と、隊長艇に当たった時の火災・機関（巻き添えも同じ系列） */
  readonly rng: SeededRng;
  readonly base: SortieBase;
  readonly view: EvacFlightView;
  readonly port: EvacFlightPort;
  /** EF_* と EO_* */
  phase: number;
  outcome: number;
  /** 狙った隊（−1） */
  target: number;
  /** 済み（airSortieComplete が真になったステップの次から atHome を真のまま＝凍結の core の 2 波目は cancelled で出ない。B1） */
  complete: boolean;
  /** 世界の絵: 前のフレームに描いた（止まった後に 1 回だけ updateVisuals を呼んで隠す。r2 M2） */
  drawn: boolean;
  /** 始める時計の秒（波の announce_s ＋ announce_lead_s。もう一度来る回は予告し直した秒 ＋ announce_lead_s＝core/evac-repass）・飛んだ回数・撃墜した機のビット（次の回に戻さない） */
  startS: number;
  passes: number;
  downed: number;
}

export interface EvacPlan {
  readonly sq: EvacSquadron;
  readonly raid: EvacRaidParams;
  readonly flights: readonly EvacFlight[];
  /** 陰の発見（seed+29。予告ごとに陰の順に 1 回ずつ） */
  readonly reveal: SeededRng;
  /** 次に予告する波 */
  nextWave: number;
  /** 今のステップの時計（着弾の包みが沈んだ秒に使う） */
  nowS: number;
  /** 狙いの数え（1 波の中・隊ごと。固定長） */
  readonly assigned: Int32Array;
  /** このステップの出来事（HUD。core/evac-air が毎ステップの頭で消す）: 予告した波（−1）・見つかった隊のビット・始めた／見失った編隊のビット・決着 */
  evWave: number;
  evFound: number;
  evStart: number;
  evLost: number;
  evSettle: boolean;
  /** telemetry: 来た（始めた）編隊・空中に爆弾があり始め直せなかった回数（0 のはず）・枠 ≥ 1 の狙いの段（A 止まった／B 走る）・投下・着弾・艇への命中 */
  came: number;
  restartDelayed: number;
  tierA: number;
  tierB: number;
  releases: number;
  impacts: number;
  boatHits: number;
}

/** 起動時に 1 回: 波 × 同時の編隊ぶんの編隊（機数の値は sorties から。同じ機数で共有）・偽の view・乱数・SortieBase を確保し、makePort で口を作る */
export function createEvacPlan(sq: EvacSquadron, raid: EvacRaidParams, sorties: readonly AirStrikeParams[], seed: number, makePort: EvacPortFactory): EvacPlan {
  const flights: EvacFlight[] = [];
  for (let w = 0; w < raid.waves.length; w++) {
    const planes = raid.waves[w]!.planes;
    const p = sorties.find((s) => s.planes === planes);
    if (!p) throw new Error(`空襲下の退避: ${planes} 機の編隊の値が無い（config/evac-mission-data の sorties）`);
    for (let s = 0; s < raid.flights; s++) {
      const i = flights.length;
      const rng = new SeededRng((seed + evacFlightSeedOffset(w, s)) >>> 0);
      const view: EvacFlightView = { boat: { state: { x: 0, y: 0, headingDeg: 0, speedMps: 0 }, sinking: false }, atHome: false, grounded: false, escort: null };
      const startS = raid.waves[w]!.announceS + raid.announceLeadS;
      flights.push({ index: i, wave: w, slot: s, p, rng, base: createSortieBase(), view, port: makePort(i, p, rng), phase: EF_IDLE, outcome: EO_NONE, target: -1, complete: false, drawn: false, startS, passes: 0, downed: 0 });
    }
  }
  return {
    sq, raid, flights, reveal: new SeededRng((seed + EVAC_SEED_OFFSET) >>> 0), nextWave: 0, nowS: 0, assigned: new Int32Array(sq.groups.length),
    evWave: -1, evFound: 0, evStart: 0, evLost: 0, evSettle: false, came: 0, restartDelayed: 0, tierA: 0, tierB: 0, releases: 0, impacts: 0, boatHits: 0,
  };
}

/** 動く編隊（毎ステップ step を呼ぶ）: 始まっていて、機が来ているか爆弾が空中（中断の後も空中の爆弾は着弾まで落ちる。r2 M2） */
export function evacFlightLive(fl: EvacFlight): boolean {
  const st = fl.port.state;
  return fl.phase === EF_FLYING && st.started && airStrikeActive(st);
}

/** 狙いの候補（隠れていない・全滅していない隊） */
export function candidate(sq: EvacSquadron, gi: number): boolean {
  const g = sq.groups[gi]!;
  return g.leader >= 0 && g.phase !== G_HIDDEN && g.phase !== G_GONE;
}

/**
 * 枠 slot の狙い: 候補のうち、pass 0 は今の波でまだ狙われていない隊、pass 1 は狙われているが flights_per_group_max 未満の隊（操作中の隊を除く。r2 M7-5）。
 * 走っている隊（段 B）を先、尽きたら止まっている隊（段 A）。同じ段はその枠の現れる点（港の中心から from ＋ offset[枠] の方位・spawn_m）に近い順（2 乗。同じなら隊番号の小さい順）
 */
export function pickTarget(plan: EvacPlan, slot: number, pass: number): number {
  const { sq, raid } = plan;
  const b = degToRad(raid.fromBearingDeg + raid.flightOffsetsDeg[slot]!);
  const sx = raid.centerX + Math.sin(b) * raid.spawnM;
  const sy = raid.centerY - Math.cos(b) * raid.spawnM;
  let best = -1;
  let bestTier = 2;
  let bestD2 = Infinity;
  for (let gi = 0; gi < sq.groups.length; gi++) {
    if (!candidate(sq, gi)) continue;
    const a = plan.assigned[gi]!;
    if (pass === 0 ? a !== 0 : a === 0 || a >= raid.flightsPerGroupMax || gi === sq.control) continue;
    const g = sq.groups[gi]!;
    const lead = evacLeader(g)!.state;
    const tier = g.phase === G_UNDERWAY ? 0 : 1;
    const dx = lead.x - sx;
    const dy = lead.y - sy;
    const d2 = dx * dx + dy * dy;
    if (tier < bestTier || (tier === bestTier && d2 < bestD2)) {
      best = gi;
      bestTier = tier;
      bestD2 = d2;
    }
  }
  return best;
}

/** 予告（この順で同じステップに。M4）: (1) 陰の発見 2 回（seed+29）→ (2) 狙い（枠 0＝操作中の隊が隠れていなければ・ほかは pickTarget）→ (3) HUD の出来事 */
export function evacAnnounce(plan: EvacPlan, w: number): void {
  const { sq, raid } = plan;
  plan.evFound |= evacRevealCovers(sq, plan.reveal, raid.coverRevealChance);
  plan.assigned.fill(0);
  for (let s = 0; s < raid.flights; s++) {
    const fl = plan.flights[w * raid.flights + s]!;
    let gi = s === 0 && candidate(sq, sq.control) ? sq.control : pickTarget(plan, s, 0);
    if (gi < 0 && raid.flightsPerGroupMax > 1) gi = pickTarget(plan, s, 1);
    if (gi < 0) {
      fl.phase = EF_OFF;
      fl.outcome = EO_NO_TARGET;
      continue;
    }
    plan.assigned[gi] = plan.assigned[gi]! + 1;
    fl.target = gi;
    fl.phase = EF_ANNOUNCED;
    fl.view.boat.state = evacLeader(sq.groups[gi]!)!.state;
    if (s > 0) {
      if (sq.groups[gi]!.phase === G_UNDERWAY) plan.tierB++;
      else plan.tierA++;
    }
  }
  plan.evWave = w;
}

/** 始める（予告から announce_lead_s）: 狙った隊が全滅・隠れていた（・決着の後）なら始めない。空中に爆弾があれば次のステップで試し直す（今の不変では起きない） */
export function evacTryStart(plan: EvacPlan, fl: EvacFlight): void {
  const { sq, raid } = plan;
  const g = sq.groups[fl.target]!;
  const lead = evacLeader(g);
  if (!lead || g.phase === G_GONE || g.phase === G_HIDDEN || sq.settled) {
    fl.phase = EF_OFF;
    fl.outcome = !lead || g.phase === G_GONE ? EO_GONE_EARLY : sq.settled ? EO_SETTLED : EO_LOST_EARLY;
    if (fl.outcome === EO_LOST_EARLY) plan.evLost |= 1 << fl.index;
    return;
  }
  fl.view.boat.state = lead.state;
  const bearing = raid.fromBearingDeg + raid.flightOffsetsDeg[fl.slot]! + raid.bearingFixDeg[fl.p.planes - 1]!;
  if (!restartAirSortie(fl.port.state, fl.p, lead.state, bearing, raid.spawnM, fl.base)) {
    plan.restartDelayed++;
    return;
  }
  fl.phase = EF_FLYING;
  plan.came++;
  plan.evStart |= 1 << fl.index;
}

/** 予告と始める（時計。dawnReached と同じ形＝境のステップが世界と模擬で同じ）。決着の後は予告しない */
export function evacPlanClock(plan: EvacPlan, stepTimeS: number): void {
  const { sq, raid } = plan;
  if (!sq.settled && plan.nextWave < raid.waves.length && dawnReached(raid.waves[plan.nextWave]!.announceS, stepTimeS)) evacAnnounce(plan, plan.nextWave++);
  for (let i = 0; i < plan.flights.length; i++) {
    const fl = plan.flights[i]!;
    if (fl.phase === EF_ANNOUNCED && dawnReached(fl.startS, stepTimeS)) evacTryStart(plan, fl);
  }
}

/**
 * 飛んでいる編隊の偽の view を書く（step の直前）: 全滅＝sinking、隠れた ‖ 決着 ‖ 済み＝atHome（凍結の core の cancel で去る）。
 * 中断になる最初のステップに終わり方を決める（見失わせた＝evLost のビット）。済みは airSortieComplete が真になったステップの次から
 */
export function evacRefreshView(plan: EvacPlan, fl: EvacFlight): void {
  const g = plan.sq.groups[fl.target]!;
  const v = fl.view;
  const st = fl.port.state;
  if (!fl.complete && airSortieComplete(st)) {
    fl.complete = true;
    if (fl.outcome === EO_NONE) fl.outcome = EO_DONE;
  }
  v.boat.sinking = g.phase === G_GONE;
  const hidden = g.phase === G_HIDDEN;
  v.atHome = hidden || plan.sq.settled || fl.complete;
  if (fl.outcome !== EO_NONE || st.cancelled || !evacFlightLive(fl)) return;
  if (v.boat.sinking) fl.outcome = EO_GONE;
  else if (hidden) {
    fl.outcome = EO_LOST;
    plan.evLost |= 1 << fl.index;
  } else if (plan.sq.settled) fl.outcome = EO_SETTLED;
}

/**
 * 隊を追う付け替え（r2 H2。core/evac-seat の evacSinkLeader の hooks.onLeaderChanged から同期に）: 隊 gi を狙う編隊の中心を新しい隊長艇の記録へ、
 * 飛んでいる編隊は state.prevHeadingDeg を新しい中心の針路に（凍結の core の旋回率が跳ばない。公開の状態を外から書く＝core/air-sortie・air-down の前例）
 */
export function evacPlanRetarget(plan: EvacPlan, gi: number): void {
  const g = plan.sq.groups[gi]!;
  const lead = evacLeader(g);
  for (let i = 0; i < plan.flights.length; i++) {
    const fl = plan.flights[i]!;
    if (fl.target !== gi || (fl.phase !== EF_ANNOUNCED && fl.phase !== EF_FLYING)) continue;
    if (lead) {
      fl.view.boat.state = lead.state;
      if (fl.phase === EF_FLYING) fl.port.state.prevHeadingDeg = lead.state.headingDeg;
    }
    fl.view.boat.sinking = g.phase === G_GONE;
    // 隠れ場所の中の交代で隠れた（r2 M12 (a)）・全滅: 次の step で凍結の core が cancel（終わり方は evacRefreshView）
    fl.view.atHome = fl.view.atHome || g.phase === G_HIDDEN;
  }
}

/** 隊の全滅（hooks.onGroupGone から）: その隊を狙う編隊の view を全滅に（次の step で去る。空中の爆弾は落ちる） */
export function evacPlanGroupGone(plan: EvacPlan, gi: number): void {
  for (let i = 0; i < plan.flights.length; i++) {
    const fl = plan.flights[i]!;
    if (fl.target === gi && fl.phase === EF_FLYING) fl.view.boat.sinking = true;
  }
}

/** 座席の hooks に段取りの付け替えを足す（起動時に 1 回作る。世界も模擬も同じ包みを evacSinkLeader・evacHitRecord・evacStepFires に渡す） */
export function evacPlanHooks(plan: EvacPlan, inner: EvacSeatHooks): EvacSeatHooks {
  return {
    onSeatLoaded: (gi, kind) => inner.onSeatLoaded(gi, kind),
    onLeaderChanged: (gi) => {
      evacPlanRetarget(plan, gi);
      inner.onLeaderChanged(gi);
    },
    onGroupGone: (gi) => {
      evacPlanGroupGone(plan, gi);
      inner.onGroupGone(gi);
    },
    onBoatSunk: (b) => inner.onBoatSunk(b),
  };
}
