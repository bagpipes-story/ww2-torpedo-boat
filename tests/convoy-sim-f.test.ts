// 味方の大発を守る模擬の帯（v0.6.4。spec §F.4。行の分け方は tests/convoy-sim-kit の SIM_FILES）: 囮（lead: 先行して見つかったら輪へ巡航＝到達 0 で帰投 700 点だけ）・見捨てる（dash_home: 帰り道の哨戒線で沈む）・付くだけ（follow: 撃たず転舵せず＝罠）。短い夜。
// 組み立て・上書き・再現は tests/convoy-sim.test.ts。
import { describe, expect } from 'vitest';
import { SIM_FILES, itSimBands } from './convoy-sim-kit';

describe('味方の大発を守る模擬の帯（spec §F.4: 囮・見捨てる・付くだけ）', () => {
  // 較正の表は 1 回だけ回す（3 行（短い夜）、N 200 で 13〜14 秒ほど）
  itSimBands('較正（N 200・seed 1〜200）: 囮（lead）は 0.2 隻以下しか届かず 22% 以上沈む（漂流は 3% まで。輪に入った瞬間に終わる）、見捨てる（dash_home）は 0 隻で 35〜50% 沈む、付くだけ（follow）は 40% 以上沈む。不変', SIM_FILES.f, (run) => {
    // 囮は先に見つかる（中央値 90 秒より早く）、見捨てる艇は出発直後に見つかる（40 秒より早く）、付くだけの艇でも最初の標的は大発が多い（70% 超）
    expect(run.cell('lead').detectMedS).toBeLessThan(90);
    expect(run.cell('dash_home').detectMedS).toBeLessThan(40);
    expect(run.cell('follow').firstBargePct).toBeGreaterThan(70);
  });
});
