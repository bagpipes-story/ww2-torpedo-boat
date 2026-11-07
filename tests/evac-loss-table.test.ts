// v0.6.11 S1（spec-v0611-r2 §12.4・§13 の S1・r2 H1 (1)）: 1 編隊が 1 つの隊（3 隻）から沈める隻数の表を、本物の core（stepAirStrike・restartAirSortie・
// pointNearBoat・applyShellHit・stepDamage と隊の core）で出す。停泊（縦列 moored_gap_m）・上げている（隊長艇の左右 slot_abeam_m・止まる・上げは進めない）・
// 走る（航跡の縦列・操作していない隊のランダム回避。回避なし／data の dodge.success）× 2/3/4 機 × 去る（隊長艇が沈めば core の cancel）／追う（次の隊長艇へ付け替え＝r2 H2）。
// 固定するのは向きだけ（「追う ≥ 去る」「止まった ≥ 走る（回避あり）」）。数は表に出し、S3 の最初の表と並べる（帯はそれを見てから。前回 L8 の作法）。
import { describe, expect, it } from 'vitest';
import { P, lossMean, type LossLayout } from './evac-kit';

const N = 200;
const PLANES = [2, 3, 4] as const;
const ROWS: { label: string; layout: LossLayout; dodge: number }[] = [
  { label: '停泊（縦列 12 m）', layout: 'moored', dodge: 0 },
  { label: '上げている（止まって ±25 m）', layout: 'hauling', dodge: 0 },
  { label: '走る・回避なし（航跡 40 m）', layout: 'running', dodge: 0 },
  { label: `走る・回避 ${P.dodgeSuccess}（data）`, layout: 'running', dodge: P.dodgeSuccess },
];

describe('1 編隊あたりに沈む隻数（r2 H1 (1)。N 200・seed 1〜200）', () => {
  it('追う ≥ 去る、止まった（停泊・上げている）≥ 走る（回避あり）', () => {
    const t: Record<string, { leave: number; chase: number }[]> = {};
    const lines: string[] = ['| 隊の形 | 2 機（4 発） | 3 機（6 発） | 4 機（8 発） |', '|---|---|---|---|'];
    for (const row of ROWS) {
      t[row.label] = PLANES.map((n) => ({ leave: lossMean(row.layout, n, false, row.dodge, N).sunk, chase: lossMean(row.layout, n, true, row.dodge, N).sunk }));
      lines.push(`| ${row.label} | ${t[row.label]!.map((c) => `${c.leave.toFixed(2)} / ${c.chase.toFixed(2)}`).join(' | ')} |`);
    }
    console.log(`[evac 損害の表] 去る / 追う（1 編隊が 1 つの隊から沈める隻数の平均）\n${lines.join('\n')}`);
    for (const row of ROWS) for (const c of t[row.label]!) expect(c.chase).toBeGreaterThanOrEqual(c.leave);
    const dodge = t[ROWS[3]!.label]!;
    for (const stopped of [t[ROWS[0]!.label]!, t[ROWS[1]!.label]!]) {
      PLANES.forEach((_n, i) => {
        expect(stopped[i]!.leave).toBeGreaterThanOrEqual(dodge[i]!.leave);
        expect(stopped[i]!.chase).toBeGreaterThanOrEqual(dodge[i]!.chase);
      });
    }
  }, 120_000);
});
