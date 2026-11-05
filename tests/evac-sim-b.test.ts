// 空襲下の退避（jp_03）の模擬の帯（v0.6.11 S7。spec-v0611-r2 §12.4。行の分け方と標本は tests/evac-sim-kit）: ノーマルの seq の系（隠す人）の 5 行。
// seq（主）50〜70%・残存の中央値 6〜9・漂流 ≤ 2%、seq_slow 30〜60% かつ ≤ seq・中央値 5〜8・漂流 ≤ 2%、seq_cover seq ± 15 点、follow_ring seq − 10〜＋ 20 点・漂流 ≤ 2%、
// seq_shoot seq − 25〜＋ 5 点。全部の表（N 400 × 2 組）は scripts/headless/g2.sh の EVAC=1。決定性・引く回数は tests/evac-sim-a。
import { describe, expect } from 'vitest';
import { EVAC_SIM_FILES, itEvacBands } from './evac-sim-kit';

describe('空襲下の退避の模擬の帯（ノーマル・seq の系）', () => {
  itEvacBands('N 50 × 2 組（seed 1〜50・1001〜1050）: seq・seq_slow・seq_cover・follow_ring・seq_shoot の帯 10 本がすべて ✓。2 回目の編隊が来て（U7）、撃てば落ちる', EVAC_SIM_FILES.b, false, 10, (run) => {
    // 監視（帯ではない）: 編隊は平均 1.3 回より多く来る（もう一度来る編隊。S3b の表で 1.53〜1.54）、seq_shoot は 1 回に平均 0.5 機より多く落とす（表で 0.9）
    expect(run.cells.get('seq')!.passesPerFlight).toBeGreaterThan(1.3);
    expect(run.cells.get('seq_shoot')!.downs).toBeGreaterThan(0.5);
  });
});
