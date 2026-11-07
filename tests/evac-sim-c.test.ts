// 空襲下の退避（jp_03）の模擬の帯（v0.6.11 S7。spec-v0611-r2 §12.4。行の分け方と標本は tests/evac-sim-kit）: ノーマルの隠さない遊び方と天井の 5 行（比べる seq も回す）。
// own_only ≤ 25%・残存の中央値 3〜6、dodge_only ≤ seq − 15 点、fight ≤ 15%、stay ≤ 10%・中央値 ≤ 4、bot ≥ 90%・中央値 ≥ 10・18 隻残る ≤ 10%（と seq の 3 本）。
import { describe, expect } from 'vitest';
import { EVAC_SIM_FILES, itEvacBands } from './evac-sim-kit';

describe('空襲下の退避の模擬の帯（ノーマル・隠さない遊び方と天井）', () => {
  itEvacBands('N 50 × 2 組（seed 1〜50・1001〜1050）: seq と own_only・dodge_only・fight・stay・bot の帯 12 本がすべて ✓。隠さない遊び方は隠す遊び方より沈む', EVAC_SIM_FILES.c, false, 12, (run) => {
    // 監視（帯ではない）: 来た 1 編隊（1 回）あたりに沈む隻数は、何もしない stay の方が隠す seq より多い（S3b の表で 1.47 と 1.16）
    expect(run.cells.get('stay')!.lossPerFlight).toBeGreaterThan(run.cells.get('seq')!.lossPerFlight);
  });
});
