// 空襲下の退避（v0.6.11。jp_03。spec-v0611-r2 §8 の段 5）の 1 固定ステップの空襲（世界の evac.stepAir も模擬もこれを呼ぶ＝順が 1 つ）:
// 撃墜の後の順番を飛ばす（skipDownedRuns。r2 H6）→ 陰を見つける閃光（flash_reveal の時だけ）→ 決着のラッチ（dawnReached と同じ式）→ 予告（陰の発見 → 狙い）→
// 始まる編隊の restartAirSortie（始めたステップに回数と撃墜の落とし直し＝core/evac-repass）→ 偽の view を書いて（済みになったステップはもう一度来るか。passes_max）
// 動く編隊を番号順に step（投下ごとに seed+31 を 1 回・着弾は core/evac-hits の走査。隊長艇の沈没は
// evacSinkLeader がその場で交代・付け替え・座席の振り替えまで）→ 操作していない隊長艇の火災 → 「狙われている」（r2 M13）→ 座席の被害を記録へ。
// 止まった編隊の絵を隠す 1 回は世界のフレームの絵（evacDrawPass。r2 M2）。Phaser 非依存・確保しない（作るのは createEvacAirStep・createEvacAirCore だけ）。
import type { AirStrikeParams } from './air-strike';
import { skipDownedRuns } from './air-down';
import type { BoatState } from './boat-motion';
import { dawnReached } from './dawn-air';
import { EVAC_DODGE_SEED_OFFSET, G_FOUND, G_HIDDEN, SHELTER_COVER } from './evac-data';
import { evacOnRelease } from './evac-follow';
import { evacCoreFlight, evacImpact, type EvacAir, type EvacAirWorld } from './evac-hits';
import type { EvacRaidParams } from './evac-params';
import { EF_ANNOUNCED, EF_FLYING, createEvacPlan, evacFlightLive, evacPlanClock, evacPlanHooks, evacRefreshView, type EvacPlan } from './evac-plan';
import { createEvacRepass, evacRepassOnComplete, evacRepassStarted, type EvacRepass } from './evac-repass';
import { evacSettle, evacStepFires, evacStoreSeatDamage, type EvacSeat, type EvacSeatHooks } from './evac-seat';
import type { EvacSquadron } from './evac-squadron';
import { SeededRng } from './rng';

/** 爆撃から逃げる乱数（seed+31。投下ごとに 1 回）と、もう一度来る編隊（core/evac-repass）を持つ空襲の段 */
export interface EvacAirStep extends EvacAir {
  readonly dodge: SeededRng;
  readonly repass: EvacRepass;
}

/** 世界の作り方の材料（起動時。plan は世界が凍結の AirStrikeFlight を口にして作り、hooks は evacPlanHooks で包んだもの） */
export function createEvacAirStep(air: EvacAir, seed: number): EvacAirStep {
  return { ...air, dodge: new SeededRng((seed + EVAC_DODGE_SEED_OFFSET) >>> 0), repass: createEvacRepass(air.plan) };
}

/** 模擬・tests: 段取り・core の編隊の口・包んだ hooks・空襲の段を 1 か所で組む（世界は systems の側で同じ順に組む） */
export function createEvacAirCore(sq: EvacSquadron, seat: EvacSeat, raid: EvacRaidParams, sorties: readonly AirStrikeParams[], seed: number, world: EvacAirWorld, inner: EvacSeatHooks): EvacAirStep {
  const ref: { air: EvacAirStep | null } = { air: null };
  const plan: EvacPlan = createEvacPlan(sq, raid, sorties, seed, (i, p, rng) => evacCoreFlight(p, rng, (x, y) => void evacImpact(ref.air!, i, x, y)));
  ref.air = createEvacAirStep({ plan, sq, seat, hooks: evacPlanHooks(plan, inner), world }, seed);
  return ref.air;
}

/**
 * 「狙われている」（r2 M13。世界・模擬・HUD・［切替］で 1 つの定義）を sq.targeted に書く: 予告から始まるまで（EF_ANNOUNCED。試し直しの間も）、
 * 始まった後は state.started && airStrikeActive && !cancelled。中断（見失い・全滅・決着）・済みの後は偽
 */
export function evacPlanTargeted(plan: EvacPlan): void {
  const t = plan.sq.targeted;
  t.fill(0);
  for (let i = 0; i < plan.flights.length; i++) {
    const fl = plan.flights[i]!;
    if (fl.target < 0) continue;
    if (fl.phase === EF_ANNOUNCED || (evacFlightLive(fl) && !fl.port.state.cancelled)) t[fl.target] = 1;
  }
}

/** 陰を見つける閃光（evac.flash_reveal が true の時だけ。既定は false＝r2 M5）: 撃った点から m 内の陰に隠れている隊を G_FOUND に。見つかった隊のビット */
export function evacFlashReveal(sq: EvacSquadron, x: number, y: number, m: number): number {
  let found = 0;
  for (let gi = 0; gi < sq.groups.length; gi++) {
    const g = sq.groups[gi]!;
    const sh = sq.p.shelters[g.shelter];
    if (g.phase !== G_HIDDEN || !sh || sh.kind !== SHELTER_COVER) continue;
    const dx = sh.x - x;
    const dy = sh.y - y;
    if (dx * dx + dy * dy > m * m) continue;
    g.phase = G_FOUND;
    g.foundCover = g.shelter;
    g.foundLeftS = sq.p.foundReactS;
    found |= 1 << gi;
  }
  return found;
}

/** フレームの絵（世界）: 動く編隊を描き、止まったフレームにもう 1 回だけ描く（機・線・爆弾の Image を隠す。r2 M2）。draw は起動時に作った関数 */
export function evacDrawPass(plan: EvacPlan, draw: (i: number, center: BoatState) => void): void {
  for (let i = 0; i < plan.flights.length; i++) {
    const fl = plan.flights[i]!;
    const live = evacFlightLive(fl);
    if (live || fl.drawn) draw(i, fl.view.boat.state);
    fl.drawn = live;
  }
}

/**
 * 1 固定ステップ（spec §8 の段 5。敵の側と座席の火災の後、夜明けの空襲の前）。stepTimeS は世界の時計（実秒）、feelDt は体感の実秒（編隊）、realDt は実秒（火災）、
 * flashM は座席の機銃の閃光の距離（撃っていなければ 0。flash_reveal が true の時だけ陰を見つける）
 */
export function stepEvacAir(a: EvacAirStep, stepTimeS: number, feelDt: number, realDt: number, flashM: number): void {
  const { plan, sq, seat } = a;
  plan.nowS = stepTimeS;
  plan.evWave = -1;
  plan.evFound = 0;
  plan.evStart = 0;
  plan.evLost = 0;
  plan.evSettle = false;
  a.repass.ev = 0;
  const fls = plan.flights;
  // 撃墜の後の順番（撃墜が無ければ何もしない。凍結の core の「順番の機が旋回に着くまで待つ」で止まらない。r2 H6）
  for (let i = 0; i < fls.length; i++) if (fls[i]!.phase === EF_FLYING) skipDownedRuns(fls[i]!.port.state, fls[i]!.p);
  if (sq.p.flashReveal && flashM > 0 && !sq.settled) plan.evFound |= evacFlashReveal(sq, seat.state.x, seat.state.y, flashM);
  if (!sq.settled && dawnReached(sq.cfg.durationS, stepTimeS)) {
    evacSettle(sq);
    plan.evSettle = true;
  }
  evacPlanClock(plan, stepTimeS);
  if (plan.evStart !== 0) evacRepassStarted(plan);
  for (let i = 0; i < fls.length; i++) {
    const fl = fls[i]!;
    if (fl.phase !== EF_FLYING) continue;
    const was = fl.complete;
    evacRefreshView(plan, fl);
    if (!was && fl.complete) evacRepassOnComplete(plan, a.repass, fl);
    if (!evacFlightLive(fl)) continue;
    const st = fl.port.state;
    const dropped = st.bombsDropped;
    fl.port.step(feelDt, fl.view);
    // 投下（凍結の core は 1 編隊で同時に 1 発）ごとに seed+31 を必ず 1 回（中心が座席・隠れた隊でも）
    for (let k = dropped; k < st.bombsDropped; k++) {
      plan.releases++;
      evacOnRelease(sq, a.dodge, fl.target);
    }
  }
  evacStepFires(sq, seat, realDt, stepTimeS, a.hooks);
  evacPlanTargeted(plan);
  evacStoreSeatDamage(sq, seat);
}
