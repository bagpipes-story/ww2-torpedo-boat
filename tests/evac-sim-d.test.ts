// 空襲下の退避（jp_03）の模擬の帯（v0.6.11 S7。spec-v0611-r2 §12.4。行の分け方と標本は tests/evac-sim-kit）: ハード（同時 3 編隊）の 4 行と、比べる同じ seed のノーマルの seq。
// ハード seq 20〜45% かつ ≤ ノーマルの seq − 15 点、seq_slow ≤ seq、stay ≤ 3%、bot ≥ 60%。
import { describe, expect } from 'vitest';
import { EVAC_SIM_FILES, itEvacBands } from './evac-sim-kit';

describe('空襲下の退避の模擬の帯（ハード）', () => {
  itEvacBands('N 50 × 2 組（seed 1〜50・1001〜1050）: ハードの seq・seq_slow・stay・bot の帯 5 本がすべて ✓（ノーマルの seq と比べる 1 本を含む）', EVAC_SIM_FILES.d, true, 5, (run) => {
    expect(Number.isFinite(run.normalSeqPct)).toBe(true);
  });
});
