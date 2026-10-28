// 停泊して揚陸する輸送船を守る模擬（core/landing-sim）の n 夜の集計（v0.6.9 S3。spec-v069 §8 の TABLE=1〜3・I1〜I6・R2・R4。pt-sim-cell・convoy-sim-cell と同じ分け方）。
// Phaser 非依存。集計は表に 1 回（毎ステップではない）なので配列を作ってよい。% は 0〜100、中央値・p10・p90 は小さい順の floor(q × n) 番目（convoy-sim-cell と同じ）。
// R2 の期待値: 1 夜ごとに、揚陸に効く斉射（landing-trial の relevant）の種類と PT から、斉射の当たりうる本数（影のプール）の分布（種類 × PT。表の全部の夜を合わせた分布）を畳み込んで
// 「沈むまでの本数に届かない」確率を出し、夜で平均する（生き残る期待値）。達成の期待値はそれに「帰投した夜」（R14 A5 から模擬の帰投はいつも決着の後）を掛けて平均する（輸送船の運と自艇の運を別々とみなす）。
import { LD_DONE, LD_SUNK } from './landing';
import { OUT_GOAL_GONE, OUT_LEFT, OUT_RETIRED, OUT_SUNK, PT_SALVO_CALM, PT_SALVO_ENGAGED, PT_SALVO_HURRIED, runLandingTrial, type LandingSimSetup, type LandingTrial } from './landing-sim';
import type { LandingPolicy } from './landing-sim-policy';

/** 種類ごとの斉射の数え（TABLE=2） */
export interface SalvoKindStats {
  salvos: number; fired: number;
  /** 輸送船が浮いている間に決着した本数・その命中（不発を除く）・不発の命中（1 本の命中率はこの分母。S2 の申し送り） */
  arrived: number; arrivedHits: number; arrivedDuds: number;
  /** 影（いつも浮いている船体）: 当たりうる命中（不発を除く）・不発の命中、当たりうる本数が 1 以上・2 以上の斉射 */
  potHits: number; potDuds: number; pot1: number; pot2: number;
  /** 発射の距離 m（小さい順） */
  ranges: number[];
}

/** 斉射の数え（種類ごと（気づかれていない・慌てた・戦いながら（R12））・種類 × PT。byPt[種類][PT]）と、期待値の材料: dist[種類][PT][k] = 当たりうる本数が k 本の斉射の数（k = 0..n）。斉射の無い組は種類の合計で代える */
export interface SalvoStats {
  n: number;
  calm: SalvoKindStats;
  hurried: SalvoKindStats;
  engaged: SalvoKindStats;
  byPt: SalvoKindStats[][];
  dist: number[][][];
}

function kindStats(): SalvoKindStats {
  return { salvos: 0, fired: 0, arrived: 0, arrivedHits: 0, arrivedDuds: 0, potHits: 0, potDuds: 0, pot1: 0, pot2: 0, ranges: [] };
}

/** 夜々の斉射を数える（count は PT の数、n は salvo_count） */
export function salvoStats(trials: readonly LandingTrial[], count: number, n: number): SalvoStats {
  const st: SalvoStats = { n, calm: kindStats(), hurried: kindStats(), engaged: kindStats(), byPt: [], dist: [] };
  for (let k = 0; k <= PT_SALVO_ENGAGED; k++) {
    st.byPt.push(Array.from({ length: count }, kindStats));
    st.dist.push(Array.from({ length: count }, () => new Array<number>(n + 1).fill(0)));
  }
  for (const t of trials) {
    for (let i = 0; i < count; i++) {
      const kind = t.kind[i]!;
      if (kind === 0) continue;
      const pot = t.potHits[i]!;
      for (const s of [kind === PT_SALVO_CALM ? st.calm : kind === PT_SALVO_HURRIED ? st.hurried : st.engaged, st.byPt[kind]![i]!]) {
        s.salvos++;
        s.fired += n;
        s.arrived += t.arrived[i]!;
        s.arrivedHits += t.arrivedHits[i]!;
        s.arrivedDuds += t.arrivedDuds[i]!;
        s.potHits += pot;
        s.potDuds += t.potDuds[i]!;
        if (pot >= 1) s.pot1++;
        if (pot >= 2) s.pot2++;
        s.ranges.push(t.launchM[i]!);
      }
      st.dist[kind]![i]![Math.min(n, pot)]!++;
    }
  }
  for (const s of [st.calm, st.hurried, st.engaged, ...st.byPt.flat()]) s.ranges.sort((a, b) => a - b);
  return st;
}

/** 種類 kind・i 隻目の PT の斉射の当たりうる本数の確率（i −1 か、その組に斉射が無ければ種類の合計。種類にも無ければ 0 本が確率 1） */
export function salvoProbs(st: SalvoStats, kind: number, i: number): number[] {
  const all = new Array<number>(st.n + 1).fill(0);
  for (const row of st.dist[kind]!) for (let k = 0; k <= st.n; k++) all[k]! += row[k]!;
  const own = i >= 0 ? st.dist[kind]![i]! : all;
  const use = own.some((x) => x > 0) ? own : all;
  const sum = use.reduce((a, x) => a + x, 0);
  return sum > 0 ? use.map((x) => x / sum) : use.map((_, k) => (k === 0 ? 1 : 0));
}

/** 斉射の列（[種類, PT]。PT −1 は種類の合計）を独立に畳み込んで、当たりうる本数が hitsToSink に届かない確率 */
export function surviveOf(salvos: readonly (readonly [number, number])[], st: SalvoStats, hitsToSink: number): number {
  let pr = new Array<number>(hitsToSink).fill(0);
  pr[0] = 1;
  for (const [kind, i] of salvos) {
    const ps = salvoProbs(st, kind, i);
    const next = new Array<number>(hitsToSink).fill(0);
    for (let a = 0; a < hitsToSink; a++) for (let k = 0; k < ps.length && a + k < hitsToSink; k++) next[a + k]! += pr[a]! * ps[k]!;
    pr = next;
  }
  return pr.reduce((a, x) => a + x, 0);
}

/**
 * 1 夜の揚陸に効く斉射（relevant）の、当たりうる本数が hitsToSink に届かない確率（種類 × PT の分布）。輸送船が沈んで撃たずに去った PT（OUT_GOAL_GONE）は、浮いていれば
 * 気づかれていない斉射を撃ったとみなして足す（沈んだ夜だけ斉射が減ると、期待値が沈んだ夜を軽く見る。ハードの 3 隻目）
 */
export function surviveP(t: LandingTrial, st: SalvoStats, hitsToSink: number): number {
  const salvos: [number, number][] = [];
  for (let i = 0; i < t.kind.length; i++) {
    if (t.relevant[i] === 1) salvos.push([t.kind[i]!, i]);
    else if (t.outcome[i] === OUT_GOAL_GONE) salvos.push([PT_SALVO_CALM, i]);
  }
  return surviveOf(salvos, st, hitsToSink);
}

/** 小さい順の floor(q × n) 番目（空なら NaN） */
export function quantile(a: readonly number[], q: number): number {
  if (a.length === 0) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
}

/** 時刻の列（TABLE=3）: 起きた夜 %・中央値・p10・p90 の秒 */
export interface TimeCol { pct: number; p10: number; med: number; p90: number }
function timeCol(xs: readonly number[], n: number): TimeCol {
  const v = xs.filter((x) => !Number.isNaN(x));
  return { pct: (100 * v.length) / n, p10: quantile(v, 0.1), med: quantile(v, 0.5), p90: quantile(v, 0.9) };
}

export interface LandingCell {
  policy: LandingPolicy; trials: number;
  /** 達成（揚陸完了して帰投）・揚陸完了（その後の沈没も）・揚陸の前に沈んだ・終わりにまだ揚陸中 */
  objPct: number; landPct: number; tSunkPct: number; unresPct: number;
  /** 自艇: 沈没・漂流・帰投・夜明けの前の帰投・打ち切り %、失った HP の平均・見つかった夜 %・見つかった秒の中央値・1 夜の捉えられた回数・見失わせた回数・25mm の発射 */
  ownSunkPct: number; adriftPct: number; homePct: number; homeBeforeDawnPct: number; timeoutPct: number; hpMean: number; detectedPct: number; detectMedS: number; contacts: number; lostContacts: number; gunShots: number;
  /** 1 夜の斉射（気づかれていない・慌てた・戦いながら（R12））、雷撃の結末: 航過を撃ち尽くして去った・25mm で撃退か撃沈・輸送船が沈んで去った PT */
  salvos: number; calm: number; hurried: number; engaged: number; leftByPass: number; gunOff: number; goalGone: number;
  /** R4: 決着の前に「燃料少」が立った・決着の前に輪に入った夜 % */
  fuelCallPct: number; ringEarlyPct: number;
  /** R2: 揚陸に効く斉射の組（無し・気づかれていないだけ・慌てただけ・戦いながらだけ・2 種類以上の夜 %）と 1 夜の数、生き残る（揚陸の前に沈まない）の期待値と実測、達成の期待値 */
  mix0Pct: number; mixCPct: number; mixHPct: number; mixEPct: number; mixMultiPct: number; relCalm: number; relHurried: number; relEngaged: number;
  expSurvivePct: number; survivePct: number; expObjPct: number;
  /** 不変: I1 初めての接近の報告から気づかれていない斉射の最短秒・I2 見失いから斉射の最短秒・I3 夜明けの後の斉射・I4 1 隻の斉射の最大・I5 引いた回数が合わない夜・I6 夜明けに未決着の夜 */
  i1MinS: number; i2MinS: number; afterDawn: number; maxSalvosPerPt: number; drawMiss: number; unresolvedAtDawn: number;
  /** TABLE=3: 最初の報告・最初の近い報告・最初に見つかった・気づかれていない斉射・慌てた斉射・戦いながらの斉射・決着の秒 */
  tReport: TimeCol; tNear: TimeCol; tDetect: TimeCol; tCalm: TimeCol; tHurried: TimeCol; tEngaged: TimeCol; tResolved: TimeCol;
}

/** seed は seedBase 〜 seedBase + n − 1（同じ seed なら同じ結果） */
export function runLandingTrials(s: LandingSimSetup, policy: LandingPolicy, n: number, seedBase: number): LandingTrial[] {
  const rs: LandingTrial[] = [];
  for (let i = 0; i < n; i++) rs.push(runLandingTrial(s, policy, seedBase + i));
  return rs;
}

export function landingCell(s: LandingSimSetup, policy: LandingPolicy, rs: readonly LandingTrial[], st: SalvoStats): LandingCell {
  const n = rs.length;
  const mean = (fn: (r: LandingTrial) => number): number => rs.reduce((a, r) => a + fn(r), 0) / n;
  const pct = (fn: (r: LandingTrial) => boolean): number => mean((r) => (fn(r) ? 100 : 0));
  const per = (fn: (r: LandingTrial, i: number) => boolean): number => mean((r) => Array.from(r.kind, (_, i) => (fn(r, i) ? 1 : 0)).reduce<number>((a, x) => a + x, 0));
  const rel = (r: LandingTrial, kind: number): number => Array.from(r.kind).filter((k, i) => k === kind && r.relevant[i] === 1).length;
  const hits = s.landing.hitsToSink;
  const launches = (kind: number): number[] => rs.flatMap((r) => Array.from(r.kind).flatMap((k, i) => (k === kind ? [r.launchS[i]!] : [])));
  const kinds = (r: LandingTrial): number => [PT_SALVO_CALM, PT_SALVO_HURRIED, PT_SALVO_ENGAGED].filter((k) => rel(r, k) > 0).length;
  const only = (r: LandingTrial, kind: number): boolean => kinds(r) === 1 && rel(r, kind) > 0;
  return {
    policy, trials: n,
    objPct: pct((r) => r.end === 'home' && r.phase === LD_DONE), landPct: pct((r) => r.phase === LD_DONE), tSunkPct: pct((r) => r.phase === LD_SUNK), unresPct: pct((r) => r.phase !== LD_DONE && r.phase !== LD_SUNK),
    ownSunkPct: pct((r) => r.end === 'sunk'), adriftPct: pct((r) => r.end === 'adrift'), homePct: pct((r) => r.end === 'home'), homeBeforeDawnPct: pct((r) => r.end === 'home' && !r.dawn), timeoutPct: pct((r) => r.end === 'timeout'),
    hpMean: mean((r) => r.hpLost), detectedPct: pct((r) => !Number.isNaN(r.detectS)), detectMedS: quantile(rs.filter((r) => !Number.isNaN(r.detectS)).map((r) => r.detectS), 0.5),
    contacts: mean((r) => r.contacts), lostContacts: mean((r) => r.lostContacts), gunShots: mean((r) => r.gunShots),
    salvos: per((r, i) => r.kind[i]! > 0), calm: per((r, i) => r.kind[i] === PT_SALVO_CALM), hurried: per((r, i) => r.kind[i] === PT_SALVO_HURRIED), engaged: per((r, i) => r.kind[i] === PT_SALVO_ENGAGED),
    leftByPass: per((r, i) => r.outcome[i] === OUT_LEFT), gunOff: per((r, i) => r.outcome[i] === OUT_RETIRED || r.outcome[i] === OUT_SUNK), goalGone: per((r, i) => r.outcome[i] === OUT_GOAL_GONE),
    fuelCallPct: pct((r) => !Number.isNaN(r.fuelCallS)), ringEarlyPct: pct((r) => r.ringEarly),
    mix0Pct: pct((r) => kinds(r) === 0), mixCPct: pct((r) => only(r, PT_SALVO_CALM)), mixHPct: pct((r) => only(r, PT_SALVO_HURRIED)), mixEPct: pct((r) => only(r, PT_SALVO_ENGAGED)),
    mixMultiPct: pct((r) => kinds(r) >= 2), relCalm: mean((r) => rel(r, PT_SALVO_CALM)), relHurried: mean((r) => rel(r, PT_SALVO_HURRIED)), relEngaged: mean((r) => rel(r, PT_SALVO_ENGAGED)),
    expSurvivePct: 100 * mean((r) => surviveP(r, st, hits)), survivePct: pct((r) => r.phase !== LD_SUNK), expObjPct: 100 * mean((r) => (r.end === 'home' ? surviveP(r, st, hits) : 0)),
    i1MinS: rs.reduce((a, r) => Math.min(a, r.i1LeadS), Infinity), i2MinS: rs.reduce((a, r) => Math.min(a, r.i2LeadS), Infinity), afterDawn: rs.reduce((a, r) => a + r.afterDawnSalvos, 0),
    maxSalvosPerPt: rs.reduce((a, r) => Math.max(a, r.maxSalvosPerPt), 0), drawMiss: rs.filter((r) => r.draws26 !== r.drawsWant).length, unresolvedAtDawn: rs.filter((r) => r.unresolvedAtDawn).length,
    tReport: timeCol(rs.map((r) => r.reportS), n), tNear: timeCol(rs.map((r) => r.nearReportS), n), tDetect: timeCol(rs.map((r) => r.detectS), n),
    tCalm: timeCol(launches(PT_SALVO_CALM), n), tHurried: timeCol(launches(PT_SALVO_HURRIED), n), tEngaged: timeCol(launches(PT_SALVO_ENGAGED), n), tResolved: timeCol(rs.map((r) => r.resolvedS), n),
  };
}
