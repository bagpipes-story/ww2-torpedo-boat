// jp_01 のハードの対の帯を組を合わせた夜で判定する算術（v0.6.6。systems/convoy-hard-calibration の pooledMean・convoyHardPairChecks）: 模擬は回さず、表の値だけの偽の組で見る。
// 本物の表は scripts/convoy-sim の HARD=1 TABLE=2（N 400 × 2 組。行の帯と不変は組ごと、対の帯は合わせた 800 夜）。
import { describe, expect, it } from 'vitest';
import type { ConvoySimSetup } from '../src/core/convoy-sim';
import type { ConvoyCell } from '../src/core/convoy-sim-cell';
import { CONVOY_HARD_CALIBRATION, convoyHardPairChecks, convoyHardPairMisses, pooledMean, type ConvoyHardRun } from '../src/systems/convoy-hard-calibration';

/** 偽の組: この行と相手（隼艇なし・ノーマル）の自艇の沈没 % だけ（ほかの列は読まない） */
function fakeRun(n: number, hard: number, off: number, normal: number): ConvoyHardRun {
  const cell = (sunkPct: number): ConvoyCell => ({ sunkPct, achievedPct: 0 }) as unknown as ConvoyCell;
  return { n, setup: {} as ConvoySimSetup, cell: () => cell(hard), partner: (k) => cell(k === 'off' ? off : normal) };
}
const FOLLOW_FULL = CONVOY_HARD_CALIBRATION.find((r) => r.policy === 'follow_full')!;

describe('組を合わせた値（pooledMean）', () => {
  it('同じ N の組は単純な平均で、合わせた夜の % と同じ（400 夜で 31 夜・19 夜 → 800 夜で 50 夜）', () => {
    expect(pooledMean([(31 / 400) * 100, (19 / 400) * 100], [400, 400])).toBeCloseTo((50 / 800) * 100, 12);
    expect(pooledMean([7.8, 4.8], [400, 400])).toBeCloseTo(6.3, 12);
  });
  it('夜の数が違う組は夜で重みづけ（300 夜の 10% と 100 夜の 40% → 400 夜の 17.5%）。1 組はその値のまま', () => {
    expect(pooledMean([10, 40], [300, 100])).toBeCloseTo(17.5, 12);
    expect(pooledMean([4.8], [400])).toBe(4.8);
  });
  it('値と夜の数の個数が合わない・空は投げる', () => {
    expect(() => pooledMean([1, 2], [400])).toThrow();
    expect(() => pooledMean([], [])).toThrow();
  });
});

describe('対の帯は合わせた値の差で判定（convoyHardPairChecks）', () => {
  // S3 の測定（follow_full の自艇の沈没 %）: ハード 7.75/4.75、ノーマル 7.25/9.25、隼艇なし 17/17（隼艇なしは偽の値）
  const runs = [fakeRun(400, 7.75, 17, 7.25), fakeRun(400, 4.75, 17, 9.25)];
  it('2 組を合わせると ハード 6.25 対 ノーマル 8.25（差 −2 ≥ −3）・隼艇なし 17（差 −10.75 ≤ −4）で ✓。組ごとの値も返す', () => {
    const checks = convoyHardPairChecks(FOLLOW_FULL, runs);
    expect(checks.map((c) => [c.partnerName, c.mine, c.other, c.ok])).toEqual([
      ['隼艇なし', [7.75, 4.75], [17, 17], true],
      ['ノーマル', [7.75, 4.75], [7.25, 9.25], true],
    ]);
    expect(checks.map((c) => [c.minePooled, c.otherPooled, c.diff])).toEqual([[6.25, 17, -10.75], [6.25, 8.25, -2]]);
    expect(convoyHardPairMisses(FOLLOW_FULL, runs)).toEqual([]);
  });
  it('2 組目だけなら ノーマルとの差 −4.5 で ✗（1 組の揺れ。これが合わせて判定する理由）', () => {
    const misses = convoyHardPairMisses(FOLLOW_FULL, [runs[1]!]);
    expect(misses).toHaveLength(1);
    expect(misses[0]).toContain('ノーマル 9.3 との差 -4.5');
  });
});
