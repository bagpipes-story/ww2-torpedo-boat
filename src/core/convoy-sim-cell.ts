// 味方の大発を守る模擬（core/convoy-sim）の n 夜の集計（v0.6.4。spec §F.3 の表の列。pt-sim-cell と同じ分け方: convoy-sim が 300 行を超えないため）。
// Phaser 非依存。集計は 1 セルに 1 回（毎ステップではない）なので配列を作ってよい。% は 0〜100、中央値・p10 は小さい順の floor(q × n) 番目（pt-sim-cell と同じ）。
// v0.6.6: 達成（帰投してノルマ以上）と 3 隻とも上陸して帰投の %（同じ物差しの比べ）、隼艇のある表は隼艇の列（GunboatCell。無い表は鍵ごと無い）。
import { runConvoyTrial, type ConvoySimSetup, type ConvoyTrial } from './convoy-sim';
import type { GunboatTrial } from './convoy-sim-gunboat';
import type { ConvoyPolicy } from './convoy-sim-policy';

export interface ConvoyCell {
  policy: ConvoyPolicy; trials: number;
  /** 到達（3 隻中の平均）・3 隻／2 隻以上／0 隻の夜 %・沈んだ大発の平均・大発への命中の平均 */
  arrivedMean: number; arrived3Pct: number; arrived2Pct: number; arrived0Pct: number; bargesSunkMean: number; bargeHits: number;
  /** 自艇: 沈没・帰投・漂流・打ち切り・夜明け後の帰投 %、失った HP・被弾の平均、帰投した夜の燃料の中央値・p10 % */
  sunkPct: number; homePct: number; adriftPct: number; timeoutPct: number; afterDawnPct: number; hpMean: number; playerHits: number; fuelMed: number; fuelP10: number;
  /** 見つかった夜 %・見つかった秒の中央値・最初の標的が大発だった割合 %（見つかった夜のうち）、1 夜の大発への航過・自艇への航過・自艇への連射・標的の切り替え、大発への連射の合計（不変で 0） */
  detectedPct: number; detectMedS: number; firstBargePct: number; passesBarge: number; passesPlayer: number; bursts: number; burstsBarge: number; switches: number;
  /** 25mm: 1 夜の発射・命中、撃退した夜 %・撃沈した夜 %、1 夜の制圧、機関損傷の夜 % */
  gunShots: number; gunHits: number; retiredMean: number; retiredPct: number; ptSunkPct: number; suppressions: number; engineHitPct: number;
  /** 不変: 予告から初弾の最短秒、同時に航過中の最大、射程・視程（標的から）の外からの発射の合計、自艇の視程の外からの発射の合計、1 回の攻撃の最大命中（大発・自艇）、健全な大発が 1 回の航過で沈んだ数、決着の秒の中央値、夜明け後の決着 % */
  minWarnS: number; maxPassing: number; beyond: number; beyondPlayerSight: number; worstBarge: number; worstPlayer: number; singlePassKills: number; resolvedMedS: number; resolvedAfterDawnPct: number;
  /** 達成（帰投して上陸がノルマ以上。jp_01 はノーマル 2・ハード 3）・3 隻とも（大発の全隻）上陸して帰投の夜 %（v0.6.6） */
  achievedPct: number; homeAllPct: number;
  /** 隼艇（v0.6.6。setup.gunboat のある表だけ） */
  gunboat?: GunboatCell;
}

/** 隼艇の列（spec-v066 §F.6）: 沈没 %・失った HP・受けた命中の平均、25mm の 1 夜の発射・命中・撃退・撃沈・制圧、1 夜の隼艇への航過・連射・最初の標的が隼艇 %（見つかった夜のうち）、
 * 不変（1 回の攻撃の最大命中・決着の後の発射と被弾・視程か射程の外・自艇の視程の外での発射の合計）、決着の前に自艇から 480 m の外にいた秒の割合 %（W7） */
export interface GunboatCell {
  sunkPct: number; hpLostMean: number; hitsTaken: number;
  shots: number; hits: number; retiredMean: number; ptSunkMean: number; suppressions: number;
  passes: number; bursts: number; firstTargetPct: number;
  worstPassHits: number; postFire: number; postHits: number; beyond: number; beyondPlayer: number; offPct: number;
}

/** seed は seedBase 〜 seedBase + n − 1（同じ seed なら同じ結果） */
export function runConvoyCell(s: ConvoySimSetup, policy: ConvoyPolicy, n: number, seedBase: number): ConvoyCell {
  const rs: ConvoyTrial[] = [];
  for (let i = 0; i < n; i++) rs.push(runConvoyTrial(s, policy, seedBase + i));
  const mean = (fn: (r: ConvoyTrial) => number): number => rs.reduce((a, r) => a + fn(r), 0) / n;
  const pct = (fn: (r: ConvoyTrial) => boolean): number => mean((r) => (fn(r) ? 100 : 0));
  const sum = (fn: (r: ConvoyTrial) => number): number => rs.reduce((a, r) => a + fn(r), 0);
  const max = (fn: (r: ConvoyTrial) => number): number => rs.reduce((a, r) => Math.max(a, fn(r)), 0);
  const home = rs.filter((r) => r.end === 'home').map((r) => r.fuelPct);
  const det = rs.filter((r) => r.detected);
  return {
    policy, trials: n,
    arrivedMean: mean((r) => r.arrived), arrived3Pct: pct((r) => r.arrived >= 3), arrived2Pct: pct((r) => r.arrived >= 2), arrived0Pct: pct((r) => r.arrived === 0), bargesSunkMean: mean((r) => r.bargesSunk), bargeHits: mean((r) => r.bargeHits),
    sunkPct: pct((r) => r.end === 'sunk'), homePct: pct((r) => r.end === 'home'), adriftPct: pct((r) => r.end === 'adrift'), timeoutPct: pct((r) => r.end === 'timeout'), afterDawnPct: pct((r) => r.afterDawn),
    hpMean: mean((r) => r.hpLost), playerHits: mean((r) => r.playerHits), fuelMed: quantile(home, 0.5), fuelP10: quantile(home, 0.1),
    detectedPct: pct((r) => r.detected), detectMedS: quantile(det.map((r) => r.detectS), 0.5), firstBargePct: det.length === 0 ? NaN : (100 * det.filter((r) => r.firstTargetBarge).length) / det.length,
    passesBarge: mean((r) => r.passesBarge), passesPlayer: mean((r) => r.passesPlayer), bursts: mean((r) => r.burstsPlayer), burstsBarge: sum((r) => r.burstsBarge), switches: mean((r) => r.switches),
    gunShots: mean((r) => r.gunShots), gunHits: mean((r) => r.gunHits), retiredMean: mean((r) => r.ptRetired), retiredPct: pct((r) => r.ptRetired > 0), ptSunkPct: pct((r) => r.ptSunk > 0), suppressions: mean((r) => r.suppressions), engineHitPct: pct((r) => r.engineHit),
    minWarnS: rs.reduce((a, r) => Math.min(a, r.minWarnS), Infinity), maxPassing: max((r) => r.maxPassing), beyond: sum((r) => r.beyondSight + r.beyondEff), beyondPlayerSight: sum((r) => r.beyondPlayerSight),
    worstBarge: max((r) => r.worstBargePassHits), worstPlayer: max((r) => r.worstPlayerPassHits), singlePassKills: sum((r) => r.singlePassKills),
    resolvedMedS: quantile(rs.filter((r) => !Number.isNaN(r.resolvedS)).map((r) => r.resolvedS), 0.5), resolvedAfterDawnPct: pct((r) => r.resolvedAfterDawn),
    achievedPct: pct((r) => r.end === 'home' && r.arrived >= s.convoy.quota), homeAllPct: pct((r) => r.end === 'home' && r.arrived >= s.convoy.count),
    ...(s.gunboat ? { gunboat: gunboatCell(rs, n) } : {}),
  };
}

function gunboatCell(rs: ConvoyTrial[], n: number): GunboatCell {
  const g = rs.map((r) => r.gunboat!);
  const mean = (fn: (r: GunboatTrial) => number): number => g.reduce((a, r) => a + fn(r), 0) / n;
  const sum = (fn: (r: GunboatTrial) => number): number => g.reduce((a, r) => a + fn(r), 0);
  const det = rs.filter((r) => r.detected);
  return {
    sunkPct: mean((r) => (r.sunk ? 100 : 0)), hpLostMean: mean((r) => r.hpLost), hitsTaken: mean((r) => r.hitsTaken),
    shots: mean((r) => r.shots), hits: mean((r) => r.hits), retiredMean: mean((r) => r.retired), ptSunkMean: mean((r) => r.ptSunk), suppressions: mean((r) => r.suppressions),
    passes: mean((r) => r.passes), bursts: mean((r) => r.bursts), firstTargetPct: det.length === 0 ? NaN : (100 * det.filter((r) => r.gunboat!.firstTarget).length) / det.length,
    worstPassHits: g.reduce((a, r) => Math.max(a, r.worstPassHits), 0), postFire: sum((r) => r.postFire), postHits: sum((r) => r.postHits), beyond: sum((r) => r.beyond), beyondPlayer: sum((r) => r.beyondPlayer),
    offPct: sum((r) => r.watchS) > 0 ? (100 * sum((r) => r.offS)) / sum((r) => r.watchS) : NaN,
  };
}

/** 小さい順の floor(q × n) 番目（空なら NaN） */
function quantile(a: number[], q: number): number {
  if (a.length === 0) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
}
