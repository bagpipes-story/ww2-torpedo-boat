// 味方の大発を守る模擬の帯（v0.6.4。spec §F.4。行の分け方は tests/convoy-sim-kit の SIM_FILES）: 遠くから撃って転舵（far_full: 時間と燃料を使い夜明け後の帰投が増える）と付いて転舵だけ（follow_dodge: 撃たない）。
// 組み立て・上書き・再現は tests/convoy-sim.test.ts。
import { describe, expect } from 'vitest';
import { SIM_FILES, itSimBands } from './convoy-sim-kit';

describe('味方の大発を守る模擬の帯（spec §F.4: 遠くから撃って転舵・転舵だけ）', () => {
  // 較正の表は 1 回だけ回す（2 行、N 200 で 13 秒ほど）
  itSimBands('較正（N 200・seed 1〜200）: 遠くから撃って転舵（far_full）は 2.5 隻以上・自艇の沈没 8〜22% だが夜明け後の帰投 20% 以上（時間と燃料を使う）。付いて転舵だけ（follow_dodge）は 1.7 隻以上・28〜46% 沈む。不変', SIM_FILES.d, (run) => {
    // 転舵だけの艇は 25mm を撃たない。遠くから撃って転舵は帰投した夜の燃料の p10 が 30% を切る（時間と燃料を使う）
    expect(run.cell('follow_dodge').gunShots).toBe(0);
    expect(run.cell('far_full').fuelP10).toBeLessThan(30);
  });
});
