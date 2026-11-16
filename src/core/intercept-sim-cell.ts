// 迎撃の模擬（v0.8.0 S3。us_04。spec-v0800 §4.11）の 1 夜の記録（InterceptTrial）と遊び方ごとの集計（InterceptCell）。帯（B1〜B6・ハード・燃料）は
// systems/intercept-calibration が集計の列を読む。記録の「見つかった」「衝突の相手」は模擬が世界の側から書く（台本は読まない）。集計は夜の終わりの後だけ（確保してよい）。
import type { MissionEndReason } from './mission-flow';
import type { InterceptPolicy } from './intercept-sim-policy';

/** 衝突・体当たりの相手（rammedBy） */
export const RAM_NONE = 0;
export const RAM_COVER = 1;
export const RAM_COLUMN = 2;

export interface InterceptTrial {
  policy: InterceptPolicy;
  seed: number;
  hard: boolean;
  /** 終わり方（世界の終わりの理由。'cut' は夜明け ＋ afterDawnS の打ち切りで輪の外＝夜明けの空襲は模擬しない） */
  reason: MissionEndReason | 'cut';
  endS: number;
  /** 沈めた護衛・列の艦（沈み始めた。退いた艦は数えない） */
  sunkCover: number;
  sunkColumn: number;
  /** 自艇が沈み始めた理由（rammed・destroyed。沈まなければ null）と衝突・体当たりの相手 */
  ownSunk: MissionEndReason | null;
  rammedBy: number;
  /** 終わりの燃料（割当の %）・HP・被弾 */
  fuelPct: number;
  hpLeft: number;
  shellHits: number;
  /** 撃った本数（狙う艦の無い魚雷を除く）・不発でない命中・正しく狙った 1 本（|見越しのずれ| ≤ aimed・蛇行なし・KPI の的・B6 の距離の内）とその命中 */
  fired: number;
  hits: number;
  aimed: number;
  aimedHits: number;
  /** 夜明けに輪の外（世界の caughtOutside）・艦に見つかった・レーダーの最初の接触と目で最初に見えた秒（NaN は無し） */
  dawnOut: boolean;
  detected: boolean;
  firstContactS: number;
  firstSightS: number;
  /** 最初に自艇を見つけた艦（RAM_COVER 護衛・RAM_COLUMN 列・RAM_NONE 見つからない。同じステップなら護衛）と、護衛が最初に目の内に入った秒（lead の L38。NaN は無し） */
  firstDetector: number;
  coverSightS: number;
}

export function createInterceptTrial(policy: InterceptPolicy, seed: number, hard: boolean): InterceptTrial {
  return {
    policy, seed, hard, reason: 'cut', endS: 0, sunkCover: 0, sunkColumn: 0, ownSunk: null, rammedBy: RAM_NONE, fuelPct: 0, hpLeft: 0, shellHits: 0,
    fired: 0, hits: 0, aimed: 0, aimedHits: 0, dawnOut: false, detected: false, firstContactS: NaN, firstSightS: NaN, firstDetector: RAM_NONE, coverSightS: NaN,
  };
}

/** 帰投（世界の帰投と「敵艦隊なし」） */
export const trialReturned = (t: InterceptTrial): boolean => t.reason === 'returned' || t.reason === 'cleared';

export interface InterceptCell {
  n: number;
  /** % の列: 1 隻以上撃沈・列の艦を 1 隻以上撃沈（護衛を除く。S3c の lead の L45 の B2a）・自艇の沈没・衝突／体当たり（護衛・列）・砲火の沈没・帰投・達成（撃沈の隻数 ＋ 帰投）・座礁・漂流・打ち切り・夜明けに外・見つかった */
  sinkPct: number; sinkColumnPct: number; ownSunkPct: number; rammedPct: number; rammedCoverPct: number; rammedColumnPct: number; gunSunkPct: number;
  homePct: number; achievedPct: number; groundedPct: number; adriftPct: number; cutPct: number; dawnOutPct: number; detectedPct: number;
  /** 平均: 撃沈の隻数・撃った本数・被弾。命中率（命中 ÷ 撃った本数 %）・正しく狙った 1 本の本数と命中率 % */
  sinkMean: number; firedMean: number; shellHitsMean: number; hitPct: number; aimed: number; aimedPct: number;
  /** 帰投した夜の燃料 %（p10・中央・p90）・終わりの秒の中央・最初の接触と最初に見えた秒の中央 */
  fuelP10: number; fuelMed: number; fuelP90: number; endMed: number; contactMed: number; sightMed: number;
  /** 自艇が沈んだ夜のうち護衛が最初に見つけた %（L38）・護衛が最初に目に入った秒の中央・沈めた艦のうち護衛の %（L45） */
  coverFirstPct: number; coverSightMed: number; coverSinkShare: number;
}

function quantile(xs: number[], q: number): number {
  const a = xs.filter((x) => Number.isFinite(x)).sort((x, y) => x - y);
  return a.length === 0 ? NaN : a[Math.min(a.length - 1, Math.floor(q * a.length))]!;
}

/** 遊び方 1 つの夜の集計。objectiveSinks は達成の隻数 */
export function interceptCellOf(ts: readonly InterceptTrial[], objectiveSinks: number): InterceptCell {
  const n = ts.length;
  const pct = (f: (t: InterceptTrial) => boolean): number => (n > 0 ? (100 * ts.filter(f).length) / n : NaN);
  const mean = (f: (t: InterceptTrial) => number): number => (n > 0 ? ts.reduce((s, t) => s + f(t), 0) / n : NaN);
  const fired = ts.reduce((s, t) => s + t.fired, 0);
  const aimed = ts.reduce((s, t) => s + t.aimed, 0);
  const home = ts.filter(trialReturned);
  const sunk = ts.filter((t) => t.ownSunk !== null);
  const sunkShips = ts.reduce((s, t) => s + t.sunkCover + t.sunkColumn, 0);
  return {
    n,
    sinkPct: pct((t) => t.sunkCover + t.sunkColumn >= 1),
    sinkColumnPct: pct((t) => t.sunkColumn >= 1),
    ownSunkPct: pct((t) => t.ownSunk !== null),
    rammedPct: pct((t) => t.rammedBy !== RAM_NONE),
    rammedCoverPct: pct((t) => t.rammedBy === RAM_COVER),
    rammedColumnPct: pct((t) => t.rammedBy === RAM_COLUMN),
    gunSunkPct: pct((t) => t.ownSunk === 'destroyed'),
    homePct: pct(trialReturned),
    achievedPct: pct((t) => trialReturned(t) && t.sunkCover + t.sunkColumn >= objectiveSinks),
    groundedPct: pct((t) => t.reason === 'grounded'),
    adriftPct: pct((t) => t.reason === 'adrift'),
    cutPct: pct((t) => t.reason === 'cut'),
    dawnOutPct: pct((t) => t.dawnOut),
    detectedPct: pct((t) => t.detected),
    sinkMean: mean((t) => t.sunkCover + t.sunkColumn),
    firedMean: mean((t) => t.fired),
    shellHitsMean: mean((t) => t.shellHits),
    hitPct: fired > 0 ? (100 * ts.reduce((s, t) => s + t.hits, 0)) / fired : NaN,
    aimed,
    aimedPct: aimed > 0 ? (100 * ts.reduce((s, t) => s + t.aimedHits, 0)) / aimed : NaN,
    fuelP10: quantile(home.map((t) => t.fuelPct), 0.1),
    fuelMed: quantile(home.map((t) => t.fuelPct), 0.5),
    fuelP90: quantile(home.map((t) => t.fuelPct), 0.9),
    endMed: quantile(ts.map((t) => t.endS), 0.5),
    contactMed: quantile(ts.map((t) => t.firstContactS), 0.5),
    sightMed: quantile(ts.map((t) => t.firstSightS), 0.5),
    coverFirstPct: sunk.length > 0 ? (100 * sunk.filter((t) => t.firstDetector === RAM_COVER).length) / sunk.length : NaN,
    coverSightMed: quantile(ts.map((t) => t.coverSightS), 0.5),
    coverSinkShare: sunkShips > 0 ? (100 * ts.reduce((s, t) => s + t.sunkCover, 0)) / sunkShips : NaN,
  };
}
