// 夜の哨戒機の模擬の表の 1 行（v0.6.7。jp_02「孤島の哨戒」。spec-v067 §F.3）: 1 つの台本を seed0〜seed0 + n − 1 の n 夜回してまとめる。Phaser 非依存。
// 中央値と 10 パーセンタイルは並べた値の floor(n/2)・floor(n × 0.1) 番目（試作 scratchpad v067/proto/patrol-sim-v2 と同じ取り方＝表が試作と比べられる）。
import { runPatrolTrial, type PatrolSimSetup, type PatrolTrial } from './patrol-air-sim';
import type { PatrolPolicy } from './patrol-air-sim-policy';

export interface PatrolCell {
  n: number;
  /** % : 沈没（内訳は夜の出撃・夜明けの空襲・火災。火災はその前の被弾の側にも数える）・夜明け前の帰投・回避（夜明け前に帰投し目の発見 0）・目の発見のあった夜・漂流 */
  sunkPct: number;
  sunkNightPct: number;
  sunkDawnPct: number;
  sunkFirePct: number;
  homeBeforeDawnPct: number;
  evadePct: number;
  findNightPct: number;
  driftPct: number;
  /** 帰投した夜の帰投の実秒の中央値（帰投が無ければ NaN）・燃料の残りの 10 パーセンタイル % */
  medHomeS: number;
  fuelP10Pct: number;
  /** 1 夜あたり: 捜索・航跡で来た捜索・隠れた・発見（レーダー込み）・目の発見・夜の爆弾・夜明けの爆弾・速力帯が停止だった実秒 */
  passes: number;
  passesWake: number;
  hides: number;
  finds: number;
  findsVisual: number;
  nightBombs: number;
  dawnBombs: number;
  stoppedS: number;
  /** 夜の爆弾 1 発あたりの命中（爆弾が無ければ NaN） */
  hitsPerBomb: number;
  /** 全夜の不変の材料（spec C.6）: 目の発見の予告の最短（無ければ Infinity）・攻撃できる機の最大（夜の出撃・夜明け）・両方が同時に攻撃したステップ・空中の爆弾の最大・
   * +23 の回数が 2 × 投下 + 命中の抽選と合わない夜・来た波 ≠ 発見の夜・再出撃が false の回数・1 夜のレーダーの発見の最大 */
  minWarnS: number;
  maxAttackNight: number;
  maxAttackDawn: number;
  overlapSteps: number;
  maxBombsAir: number;
  drawMismatch: number;
  waveMismatch: number;
  restartFalse: number;
  radarFindsMax: number;
  /** 帰投した夜の帰投の実秒（小さい順。時間の代価の測定） */
  homeTimes: number[];
}

const pick = (sorted: readonly number[], q: number): number => (sorted.length === 0 ? NaN : sorted[Math.floor(sorted.length * q)]!);

export function runPatrolCell(s: PatrolSimSetup, pol: PatrolPolicy, n: number, seed0: number): PatrolCell {
  const rs: PatrolTrial[] = [];
  for (let i = 0; i < n; i++) rs.push(runPatrolTrial(s, pol, seed0 + i));
  const pct = (f: (r: PatrolTrial) => boolean): number => (rs.filter(f).length / n) * 100;
  const mean = (f: (r: PatrolTrial) => number): number => rs.reduce((a, r) => a + f(r), 0) / n;
  const max = (f: (r: PatrolTrial) => number): number => rs.reduce((a, r) => Math.max(a, f(r)), 0);
  const count = (f: (r: PatrolTrial) => boolean): number => rs.filter(f).length;
  const bombs = rs.reduce((a, r) => a + r.nightBombs, 0);
  const homeTimes = rs.filter((r) => r.home).map((r) => r.timeS).sort((a, b) => a - b);
  const fuel = rs.map((r) => r.fuelLeft).sort((a, b) => a - b);
  return {
    n,
    sunkPct: pct((r) => r.sunk),
    sunkNightPct: pct((r) => r.sunkBy === 'night' || r.sunkBy === 'fire_night'),
    sunkDawnPct: pct((r) => r.sunkBy === 'dawn' || r.sunkBy === 'fire_dawn'),
    sunkFirePct: pct((r) => r.sunkBy === 'fire_night' || r.sunkBy === 'fire_dawn'),
    homeBeforeDawnPct: pct((r) => r.homeBeforeDawn),
    evadePct: pct((r) => r.homeBeforeDawn && r.findsVisual === 0),
    findNightPct: pct((r) => r.findsVisual > 0),
    driftPct: pct((r) => r.drift),
    medHomeS: pick(homeTimes, 0.5),
    fuelP10Pct: pick(fuel, 0.1) * 100,
    passes: mean((r) => r.passes),
    passesWake: mean((r) => r.passesWake),
    hides: mean((r) => r.hides),
    finds: mean((r) => r.finds),
    findsVisual: mean((r) => r.findsVisual),
    nightBombs: mean((r) => r.nightBombs),
    dawnBombs: mean((r) => r.dawnBombs),
    stoppedS: mean((r) => r.stoppedS),
    hitsPerBomb: bombs > 0 ? rs.reduce((a, r) => a + r.nightHits, 0) / bombs : NaN,
    minWarnS: rs.reduce((a, r) => Math.min(a, r.minWarnS), Infinity),
    maxAttackNight: max((r) => r.maxAttackNight),
    maxAttackDawn: max((r) => r.maxAttackDawn),
    overlapSteps: rs.reduce((a, r) => a + r.attackOverlapSteps, 0),
    maxBombsAir: max((r) => r.maxBombsAir),
    drawMismatch: count((r) => r.draws !== r.expectedDraws),
    waveMismatch: count((r) => r.waves !== r.finds),
    restartFalse: rs.reduce((a, r) => a + r.restartFalse, 0),
    radarFindsMax: max((r) => r.finds - r.findsVisual),
    homeTimes,
  };
}
