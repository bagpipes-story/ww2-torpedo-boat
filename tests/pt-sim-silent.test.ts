// 米PT の掃射の航過と追撃の模擬（v0.6.3 実機 2 回目、spec r2 §H.2）の静音の行（行の分け方は tests/pt-sim-kit の SIM_FILES）: 何もしない静音（★。35〜62% 沈む・発見 65〜92%）とその撃ち返し
// （0.65 倍 + 2 以下）、静音で走り赤い線で全速の転舵（★。10〜30%）とその撃ち返し（★ turn_shoot。0〜6%・撃退の夜 35〜65%・1 夜 10〜28 発・撃った夜はほぼ当たる）。
import { describe, expect } from 'vitest';
import { SIM_FILES, itSimBands } from './pt-sim-kit';

describe('米PT の掃射の航過と追撃の模擬（v0.6.3 実機 2 回目、spec r2 §H.2: 静音）', () => {
  // 較正の表は 1 回だけ回す（4 行、N 200 で 11 秒ほど）
  itSimBands('較正（N 200・seed 1〜200）: 何もしない静音は 35〜62% 沈み、静音で全速の転舵は 10〜30%、撃ち返すと半分以下（静音のままは 0.65 倍）。何もしない静音も撃てる航過だけ（撃たずに終わる航過 0）。不変', SIM_FILES.silent, (run) => {
    const c = run.cell('silent');
    expect(c.passes - (c.firedPasses - c.bursts)).toBeCloseTo(0, 9);
    expect(c.minPassS).toBeGreaterThan(run.setup.pt.openFireS);
  });
});
