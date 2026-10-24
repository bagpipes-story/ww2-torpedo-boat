// 味方の大発を守る模擬の帯（v0.6.4。spec §F.4。行の分け方は tests/convoy-sim-kit の SIM_FILES）: 遠くから撃って転舵（far_full: 燃料を使う）と付いて転舵だけ（follow_dodge: 撃たない）。
// 組み立て・上書き・再現は tests/convoy-sim.test.ts。
import { describe, expect } from 'vitest';
import { SIM_FILES, itSimBands } from './convoy-sim-kit';

describe('味方の大発を守る模擬の帯（spec §F.4: 遠くから撃って転舵・転舵だけ）', () => {
  // 較正の表は 1 回だけ回す（2 行、N 200 で 15〜16 秒ほど）
  itSimBands('較正（N 200・seed 1〜200）: 遠くから撃って転舵（far_full）は 1.92〜2.25 隻・自艇の沈没 6〜16%・夜明け後の帰投 30〜46%（夜明け 180 秒）。付いて転舵だけ（follow_dodge）は 1.55〜1.95 隻・7〜20% 沈む。不変', SIM_FILES.d, (run) => {
    // 転舵だけの艇は 25mm を撃たない。遠くから撃って転舵は帰投した夜の燃料の p10 が 29〜37%（N 200 × 4 組）＝転舵だけ（follow_dodge 40〜44%）より燃料を使う。
    // HUD どおり（shield_full）の 35〜41% とは重なる（前の地図では far_full が 20〜22% で分かれた。レビュー D1: 前の「30% を切る」は前の地図の値で、seed 1〜200 でも 29.35 と際どかった）
    expect(run.cell('follow_dodge').gunShots).toBe(0);
    expect(run.cell('far_full').fuelP10).toBeLessThan(run.cell('follow_dodge').fuelP10);
  });
});
