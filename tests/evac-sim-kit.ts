// 空襲下の退避の模擬の帯の検査の共通（v0.6.11 S7。spec-v0611-r2 §12.4。tests/convoy-sim-kit の作法）: jp_03 の表（scripts/evac-sim の TABLE=2 と同じ runEvacTrial・evacCellOf・
// evacBandChecks）を 2 組の頭だけ（N 50 × 2 組＝seed 1〜50・1001〜1050、遊び方 1 つ 100 回）回し、帯を外れた項目を見る（回帰の検出）。帯の数は動かさない・広げない（systems/evac-calibration）。
// 帯を決める全部の表（N 400 × 2 組＝800 回）は scripts/headless/g2.sh の EVAC=1 が md5（S3b の点 G1 の表）と出力の「帯: すべて ✓」で見る（node で 1 本 6 分ほど × ノーマル・ハード）。
// ここで外れたら値を動かす前に g2.sh の EVAC=1（か scripts/evac-sim の TABLE=2）を回す（N 50 × 2 組の外れは標本の揺れのことがある）。
// npm test に全部を入れない理由（S7 の測り）: vitest の中の模擬は 1 回 約 140 ms（esbuild で束ねた node は 40〜60 ms。vite の変換の import の包みで約 3 倍）で、
// 800 回 × 遊び方 15 は 1 コアで 28 分（今の npm test は 4 コアで 5 分ほど）。N 200 × 2 組でも 3 ファイルで 14 分ぶん（1 ファイル 5.6 分）かかった。
// N 50 × 2 組にした理由: 2 組の頭 N 40・50・60・75・100 × 2 組と N 400 の 1 組（1〜400・1001〜1400）はノーマル 19・ハード 5 の帯がすべて ✓。N 25 × 2 組は seq と比べる
// seq_cover・follow_ring が、1 組だけの N 100・200・300（seed 1〜）は帯の縁の seq_shoot（seq ＋ 5 点まで。800 回で 0.5 点の余裕）や bot の残存の中央値（≥ 10 の縁）が標本の揺れで ✗ に振れる。
// ファイルは 3 つ（b＝seq の系の 5 行、c＝隠さない遊び方と天井の 5 行 ＋ 比べる seq、d＝ハードの 4 行 ＋ 比べるノーマルの seq）。1 ファイル 1〜1.5 分（4 コアの VM）。
import { expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { runEvacTrial, type EvacSimSetup, type EvacTrial } from '../src/core/evac-sim';
import { evacCellOf, type EvacCell } from '../src/core/evac-sim-cell';
import type { EvacPolicy } from '../src/core/evac-sim-policy';
import { evacBandChecks, type EvacBandCheck } from '../src/systems/evac-calibration';
import { evacSimSetup } from '../src/systems/evac-sim-setup';

/** 1 組の回と組の最初の seed（scripts/evac-sim の TABLE=2 の 2 組＝seed 1〜400・1001〜1400 の頭） */
export const EVAC_SIM_N = 50;
export const EVAC_SIM_BLOCKS: readonly number[] = [1, 1001];
/** 1 つの it の時間切れ（CI のランナーは VM より遅いことがある） */
export const EVAC_SIM_TIMEOUT_MS = 300_000;

/** ファイルごとの遊び方（帯は seq と比べる行があるので c・d にも seq を入れる） */
export const EVAC_SIM_FILES = {
  b: ['seq', 'seq_slow', 'seq_cover', 'follow_ring', 'seq_shoot'],
  c: ['seq', 'own_only', 'dodge_only', 'fight', 'stay', 'bot'],
  d: ['seq', 'seq_slow', 'stay', 'bot'],
} as const satisfies Record<string, readonly EvacPolicy[]>;

export interface EvacSimRun {
  cells: Map<EvacPolicy, EvacCell>;
  checks: EvacBandCheck[];
  /** ハードの「≤ ノーマルの seq − 15 点」に使う同じ seed のノーマルの seq（ノーマルの run は NaN） */
  normalSeqPct: number;
}

function trialsOf(s: EvacSimSetup, pol: EvacPolicy): EvacTrial[] {
  const out: EvacTrial[] = [];
  for (const first of EVAC_SIM_BLOCKS) for (let i = 0; i < EVAC_SIM_N; i++) out.push(runEvacTrial(s, pol, first + i));
  return out;
}

/** 遊び方ごとのセルと帯（scripts/evac-sim の TABLE=2 と同じ式。組を合わせた回で） */
export function evacSimRun(policies: readonly EvacPolicy[], hard: boolean): EvacSimRun {
  const s = evacSimSetup(gameData, hard);
  const cells = new Map<EvacPolicy, EvacCell>();
  for (const p of policies) cells.set(p, evacCellOf(trialsOf(s, p)));
  const normalSeqPct = hard ? evacCellOf(trialsOf(evacSimSetup(gameData, false), 'seq')).achievedPct : NaN;
  return { cells, checks: evacBandChecks(cells, hard, normalSeqPct), normalSeqPct };
}

/** ファイルの帯の検査（1 つの it）: ✗ が無い・帯の数が checks 本（行が抜けて黙って通らない）・引く回数の ✗ 0。extra で行ごとの見どころ */
export function itEvacBands(title: string, policies: readonly EvacPolicy[], hard: boolean, checks: number, extra?: (run: EvacSimRun) => void): void {
  it(title, () => {
    const run = evacSimRun(policies, hard);
    expect(run.checks.filter((c) => !c.ok).map((c) => c.text)).toEqual([]);
    expect(run.checks.length).toBe(checks);
    for (const [p, c] of run.cells) expect([c.n, c.drawBad], p).toEqual([EVAC_SIM_N * EVAC_SIM_BLOCKS.length, 0]);
    extra?.(run);
  }, EVAC_SIM_TIMEOUT_MS);
}
