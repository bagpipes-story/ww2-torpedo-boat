// 米PT の掃射の航過の模擬（core/pt-pass-sim）の n 夜の集計（v0.6.3。spec §F.3 の表の列、v0.6.3 実機 1 回目 spec r1 §G.2 の 13mm と挟み撃ちの列。pt-pass-sim から分けた。300 行を超えないため）。
// Phaser 非依存。集計は 1 セルに 1 回（毎ステップではない）なので配列を作ってよい。
import { runPtTrial, type PtSimSetup, type PtTrial } from './pt-pass-sim';
import type { PtPolicy } from './pt-sim-policy';

/** n 夜の集計（spec §F.3 の表の列）。% は 0〜100、中央値・p90 は小さい順の floor(q × n) 番目（試作と同じ）。帰投の秒・燃料は帰投した夜だけ */
export interface PtCell {
  policy: PtPolicy; trials: number;
  detectedPct: number; firstDetectMedM: number; passes: number; firedPasses: number; cleanPasses: number; shots: number; hits: number; hpMean: number; hpP90: number;
  /** 帰投は夜明けの前と後に分けても出す（どちらも全体に対する %） */
  sunkPct: number; homePct: number; homeBeforeDawnPct: number; afterDawnPct: number; homeMedS: number; fuelMedPct: number; fuelP10Pct: number; adriftPct: number; timeoutPct: number; lostContacts: number;
  /** 不変（spec §F.4 の 7）: 予告から初弾の最短秒・同時に航過中の最大・射程の外と視程の外からの発射の数・1 回の航過の最大命中・予告から航過の終わりの最短秒 */
  minWarnS: number; maxPassing: number; beyondEff: number; beyondSight: number; worstPassHits: number; minPassS: number;
  /**
   * 13mm（v0.6.3 実機 1 回目。spec r1 §G.2）: 1 夜の発射・PT への命中の平均、撃った夜のうち 1 発以上当てた夜 %（撃った夜が無ければ NaN）、1 隻以上撃退した夜 %・撃沈した夜 %、
   * 最初に見つかったのが閃光の夜 %、視程か射程の外へ撃ったステップの数（0 が不変）
   */
  gunShots: number; gunHits: number; hitNightPct: number; retiredPct: number; ptSunkPct: number; flashFirstPct: number; gunBeyond: number;
  /** 挟み撃ち: 赤い線が前と反対の舷から来た割合（0〜1。比べた組が無ければ 0）・赤い線の間の平均の体感秒、待つ PT（hold_off_m の外で待ち始めた）の最接近 m の最小（不変は 350 m 以上） */
  alt: number; commitGapS: number; heldMinM: number;
}

/** seed は seedBase 〜 seedBase + n − 1（同じ seed なら同じ結果） */
export function runPtCell(s: PtSimSetup, policy: PtPolicy, n: number, seedBase: number): PtCell {
  const trials: PtTrial[] = [];
  for (let i = 0; i < n; i++) trials.push(runPtTrial(s, policy, seedBase + i));
  const mean = (f: (r: PtTrial) => number): number => trials.reduce((a, r) => a + f(r), 0) / n;
  const pct = (f: (r: PtTrial) => boolean): number => mean((r) => (f(r) ? 100 : 0));
  const sum = (f: (r: PtTrial) => number): number => trials.reduce((a, r) => a + f(r), 0);
  const home = trials.filter((r) => r.end === 'home');
  const det = trials.filter((r) => r.detected);
  const fired = trials.filter((r) => r.gunShots > 0);
  const pairs = sum((r) => r.flankPairs);
  return {
    policy, trials: n,
    detectedPct: pct((r) => r.detected), firstDetectMedM: quantile(det.map((r) => r.firstDetectM), 0.5),
    passes: mean((r) => r.passes), firedPasses: mean((r) => r.firedPasses), cleanPasses: mean((r) => r.cleanPasses), shots: mean((r) => r.shots), hits: mean((r) => r.hits),
    hpMean: mean((r) => r.hpLost), hpP90: quantile(trials.map((r) => r.hpLost), 0.9),
    sunkPct: pct((r) => r.end === 'sunk'), homePct: pct((r) => r.end === 'home'), homeBeforeDawnPct: pct((r) => r.end === 'home' && !r.afterDawn), afterDawnPct: pct((r) => r.afterDawn),
    homeMedS: quantile(home.map((r) => r.timeS), 0.5), fuelMedPct: quantile(home.map((r) => r.fuelPct), 0.5), fuelP10Pct: quantile(home.map((r) => r.fuelPct), 0.1),
    adriftPct: pct((r) => r.end === 'adrift'), timeoutPct: pct((r) => r.end === 'timeout'), lostContacts: mean((r) => r.lostContacts),
    minWarnS: trials.reduce((a, r) => Math.min(a, r.minWarnS), Infinity), maxPassing: trials.reduce((a, r) => Math.max(a, r.maxPassing), 0),
    beyondEff: sum((r) => r.beyondEff), beyondSight: sum((r) => r.beyondSight), worstPassHits: trials.reduce((a, r) => Math.max(a, r.worstPassHits), 0),
    minPassS: trials.reduce((a, r) => Math.min(a, r.minPassS), Infinity),
    gunShots: mean((r) => r.gunShots), gunHits: mean((r) => r.gunHits),
    hitNightPct: fired.length === 0 ? NaN : (fired.filter((r) => r.gunHits > 0).length / fired.length) * 100,
    retiredPct: pct((r) => r.ptRetired > 0), ptSunkPct: pct((r) => r.ptSunk > 0), flashFirstPct: pct((r) => r.flashFirst),
    gunBeyond: sum((r) => r.gunBeyond),
    alt: pairs === 0 ? 0 : sum((r) => r.flankAlt) / pairs, commitGapS: pairs === 0 ? NaN : sum((r) => r.commitGapSumS) / pairs,
    heldMinM: trials.reduce((a, r) => Math.min(a, r.heldMinM), Infinity),
  };
}

/** 小さい順の floor(q × n) 番目（空なら NaN） */
function quantile(a: number[], q: number): number {
  if (a.length === 0) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
}
