// 空襲下の退避の模擬（v0.6.11 S3。core/evac-sim）の 1 回の記録（EvacTrial）と、遊び方 1 つ × N 回の集計（EvacCell。spec-v0611-r2 §12.4 の表の列と監視の列）。
// Phaser 非依存・乱数なし。集計の配列は 1 つの表の行ごとに作る（模擬の外。ゲームは使わない）。
import { G_HIDDEN, SHELTER_CAVE } from './evac-data';
import { EO_DONE, EO_GONE, EO_GONE_EARLY, EO_LOST, EO_LOST_EARLY, EO_NO_TARGET, EO_SETTLED, type EvacPlan } from './evac-plan';
import { evacSurvivors, type EvacSquadron } from './evac-squadron';

export type EvacEnd = '' | 'home' | 'sunk' | 'adrift' | 'timeout';

export interface EvacTrial {
  end: EvacEnd;
  /** 帰投と同じに数える終わり（home）で残存 ≥ survivor_quota（spec §3.10） */
  achieved: boolean;
  /** 残存（座席の艇を含む 18 中。終わりの時）と決着（240 秒）の時 */
  survivors: number;
  survivorsAtSettle: number;
  /** 決着の時に操作中の隊が外だった（入っている・上げている途中は中＝r2 L15）か、その後に外で終わる途中 */
  caughtOutside: boolean;
  timeS: number;
  /** 枠が全部埋まった時計の秒（埋まらなければ NaN。M10） */
  slotsFullS: number;
  /** 決着の時に 3 つの壕に 3 隻ずつ上げ切った（構造の下限。r2 H1 (5)）・上げ終えた艇の数・隠れた隊の艇の数 */
  cavesFull: boolean;
  upAtSettle: number;
  hiddenAtSettle: number;
  /** 編隊の終わり方（来た＝始めた、途中で見失った、始める前に見失った、目標なし、全滅（前・途中）、決着、済み）と、枠 ≥ 1 の狙いの段 */
  announced: number;
  came: number;
  lostMid: number;
  lostEarly: number;
  noTarget: number;
  gone: number;
  settledFl: number;
  done: number;
  tierA: number;
  tierB: number;
  /** 切替（押して移った）・押した回数・隊長艇の交代・全滅の後の自動の切替 */
  switches: number;
  taps: number;
  promotions: number;
  autoSwitches: number;
  /** 沈んだ艇の、その時の隊の段（A＝止まっている・B＝走っている） */
  sunkA: number;
  sunkB: number;
  evacReleases: number;
  impacts: number;
  boatHits: number;
  seatHits: number;
  dawnBombs: number;
  dawnHits: number;
  /** 対空: 港の空襲の撃墜・全部の撃墜・発数。消火した回数 */
  downs: number;
  downsAll: number;
  rounds: number;
  extinguished: number;
  /** 引いた回数（+29・+30・+31・+32〜+43 の合計）と期待（+29 は予告ごとに陰の数、+30 は 6 隊 ＋ pick の境ごとに 6 隊 × 2、+31 は投下ごとに 1） */
  draws29: number;
  draws30: number;
  draws31: number;
  drawsFlights: number;
  exp29: number;
  exp30: number;
  exp31: number;
  /** 終わりの時の操作中の隊の浮いている隻数 */
  afloatControl: number;
}

export function createEvacTrial(): EvacTrial {
  return {
    end: '', achieved: false, survivors: 0, survivorsAtSettle: NaN, caughtOutside: false, timeS: 0, slotsFullS: NaN, cavesFull: false, upAtSettle: 0, hiddenAtSettle: 0,
    announced: 0, came: 0, lostMid: 0, lostEarly: 0, noTarget: 0, gone: 0, settledFl: 0, done: 0, tierA: 0, tierB: 0, switches: 0, taps: 0, promotions: 0, autoSwitches: 0,
    sunkA: 0, sunkB: 0, evacReleases: 0, impacts: 0, boatHits: 0, seatHits: 0, dawnBombs: 0, dawnHits: 0, downs: 0, downsAll: 0, rounds: 0, extinguished: 0,
    draws29: 0, draws30: 0, draws31: 0, drawsFlights: 0, exp29: 0, exp30: 0, exp31: 0, afloatControl: 0,
  };
}

/** 決着のステップ（stepEvacAir の evSettle）: 残存・上げ終えた艇・隠れた隊の艇・3 つの壕に 3 隻ずつ */
export function evacTrialSettle(o: EvacTrial, sq: EvacSquadron, _t: number): void {
  o.survivorsAtSettle = evacSurvivors(sq);
  let full = true;
  for (let s = 0; s < sq.p.shelters.length; s++) {
    if (sq.p.shelters[s]!.kind !== SHELTER_CAVE) continue;
    let up = 0;
    for (let b = 0; b < sq.boats.length; b++) {
      const boat = sq.boats[b]!;
      if (boat.up && !boat.sunk && sq.groups[boat.group]!.shelter === s) up++;
    }
    o.upAtSettle += up;
    if (up < sq.p.shelters[s]!.slots) full = false;
  }
  o.cavesFull = full;
  for (let gi = 0; gi < sq.groups.length; gi++) {
    const g = sq.groups[gi]!;
    if (g.phase !== G_HIDDEN) continue;
    for (let k = 0; k < g.boats.length; k++) if (!g.boats[k]!.sunk) o.hiddenAtSettle++;
  }
}

/** 終わりの集計（編隊の終わり方・段・期待の引く回数・達成） */
export function finishEvacTrial(o: EvacTrial, sq: EvacSquadron, plan: EvacPlan, quota: number, durationS: number, pickS: number): void {
  for (let i = 0; i < plan.flights.length; i++) {
    const oc = plan.flights[i]!.outcome;
    if (plan.flights[i]!.wave < plan.nextWave) o.announced++;
    if (oc === EO_LOST) o.lostMid++;
    else if (oc === EO_LOST_EARLY) o.lostEarly++;
    else if (oc === EO_NO_TARGET) o.noTarget++;
    else if (oc === EO_GONE || oc === EO_GONE_EARLY) o.gone++;
    else if (oc === EO_SETTLED) o.settledFl++;
    else if (oc === EO_DONE) o.done++;
  }
  o.came = plan.came;
  o.tierA = plan.tierA;
  o.tierB = plan.tierB;
  o.impacts = plan.impacts;
  o.boatHits = plan.boatHits;
  o.switches = sq.switches;
  o.promotions = sq.promotions;
  o.autoSwitches = sq.autoSwitches;
  let covers = 0;
  for (let s = 0; s < sq.p.shelters.length; s++) if (sq.p.shelters[s]!.kind !== SHELTER_CAVE) covers++;
  o.exp29 = covers * plan.nextWave;
  // pick の境（k × pick_s < 決着の秒）のうち終わりまでに来たもの（18 隻が決着の前に沈めば途中で終わる）
  o.exp30 = sq.groups.length * (1 + 2 * Math.min(Math.ceil(durationS / pickS) - 1, Math.floor(o.timeS / pickS + 1e-9)));
  o.exp31 = plan.releases;
  o.achieved = o.end === 'home' && o.survivors >= quota;
}

/** 遊び方 1 つ × N 回の集計（% は 0〜100） */
export interface EvacCell {
  n: number;
  achievedPct: number;
  homePct: number;
  sunkPct: number;
  adriftPct: number;
  timeoutPct: number;
  caughtPct: number;
  medSurv: number;
  meanSurv: number;
  p10Surv: number;
  p90Surv: number;
  medSurvSettle: number;
  /** 18 隻残った回の % */
  all18Pct: number;
  /** 枠が埋まった回の % と、その秒の中央値 */
  fillPct: number;
  medFillS: number;
  cavesFullPct: number;
  /** 1 回の平均: 来た編隊・途中で見失った・始める前に見失った・目標なし・切替・押した回数・交代・沈没（段 A／B）・撃墜・発・決着の後の §2 の命中 */
  came: number;
  lostMid: number;
  lostEarly: number;
  noTarget: number;
  switches: number;
  taps: number;
  promotions: number;
  sunkA: number;
  sunkB: number;
  downs: number;
  rounds: number;
  dawnHits: number;
  /** 枠 ≥ 1 の狙いのうち段 A（止まっている隊）の % */
  tierAPct: number;
  /** 来た 1 編隊あたりに決着までに沈んだ隻数 */
  lossPerFlight: number;
  /** 引く回数が期待と違った回（+29・+30・+31）・編隊の系列が 2 × 投下 より少ない回（0 のはず） */
  drawBad: number;
}

function quantile(a: number[], q: number): number {
  if (a.length === 0) return NaN;
  const b = a.slice().sort((x, y) => x - y);
  return b[Math.min(b.length - 1, Math.floor(q * b.length))]!;
}

export function evacCellOf(ts: readonly EvacTrial[]): EvacCell {
  const n = ts.length;
  const pct = (f: (t: EvacTrial) => boolean): number => (100 * ts.filter(f).length) / n;
  const mean = (f: (t: EvacTrial) => number): number => ts.reduce((a, t) => a + f(t), 0) / n;
  const surv = ts.map((t) => t.survivors);
  const fills = ts.filter((t) => !Number.isNaN(t.slotsFullS)).map((t) => t.slotsFullS);
  const came = ts.reduce((a, t) => a + t.came, 0);
  const lost = ts.reduce((a, t) => a + (18 - (Number.isNaN(t.survivorsAtSettle) ? t.survivors : t.survivorsAtSettle)), 0);
  const tA = ts.reduce((a, t) => a + t.tierA, 0);
  const tB = ts.reduce((a, t) => a + t.tierB, 0);
  return {
    n,
    achievedPct: pct((t) => t.achieved),
    homePct: pct((t) => t.end === 'home'),
    sunkPct: pct((t) => t.end === 'sunk'),
    adriftPct: pct((t) => t.end === 'adrift'),
    timeoutPct: pct((t) => t.end === 'timeout'),
    caughtPct: pct((t) => t.caughtOutside),
    medSurv: quantile(surv, 0.5),
    meanSurv: mean((t) => t.survivors),
    p10Surv: quantile(surv, 0.1),
    p90Surv: quantile(surv, 0.9),
    medSurvSettle: quantile(ts.map((t) => t.survivorsAtSettle), 0.5),
    all18Pct: pct((t) => t.survivors === 18),
    fillPct: (100 * fills.length) / n,
    medFillS: quantile(fills, 0.5),
    cavesFullPct: pct((t) => t.cavesFull),
    came: came / n,
    lostMid: mean((t) => t.lostMid),
    lostEarly: mean((t) => t.lostEarly),
    noTarget: mean((t) => t.noTarget),
    switches: mean((t) => t.switches),
    taps: mean((t) => t.taps),
    promotions: mean((t) => t.promotions),
    sunkA: mean((t) => t.sunkA),
    sunkB: mean((t) => t.sunkB),
    downs: mean((t) => t.downs),
    rounds: mean((t) => t.rounds),
    dawnHits: mean((t) => t.dawnHits),
    tierAPct: tA + tB > 0 ? (100 * tA) / (tA + tB) : NaN,
    lossPerFlight: came > 0 ? lost / came : NaN,
    drawBad: ts.filter((t) => t.draws29 !== t.exp29 || t.draws30 !== t.exp30 || t.draws31 !== t.exp31 || t.drawsFlights < 2 * t.exp31).length,
  };
}
