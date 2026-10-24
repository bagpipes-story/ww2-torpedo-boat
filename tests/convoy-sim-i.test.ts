// 味方の大発を守る模擬の帯（v0.6.4。spec §F.4。行の分け方は tests/convoy-sim-kit の SIM_FILES）: 隠れる（none ★: 出発点で止まり、決着の後に巡航で帰投）。
// 隠れると 0.7〜1.1 隻しか届かず（守らなければ約 2 隻沈む）、夜明けの後に空襲の中を帰る（夜明け後の帰投 82〜93%・沈没 5〜15%。v0.6.4 実機 2 回目の夜明け 180 秒。実機 1 回目の 200 秒では決着が早く夜明けの前に帰り道へ出て 30〜43% 沈んだ）。
// v0.6.4 実機 1 回目に tests/convoy-sim-a から分けた（a は HUD どおりと対の相手）。組み立て・上書き・再現は tests/convoy-sim.test.ts。
import { describe, expect, it } from 'vitest';
import { SIM_FILES, expectSimInvariantCounts, itSimBands } from './convoy-sim-kit';

describe('味方の大発を守る模擬の帯（spec §F.4: 隠れる）', () => {
  // 較正の表は 1 回だけ回す（1 行、N 200 で 7〜8 秒ほど）
  const run = itSimBands('較正（N 200・seed 1〜200）: 隠れる（none ★）と 0.7〜1.1 隻しか届かず、夜明けの後に空襲の中を帰る（夜明け後の帰投 82〜93%・沈没 5〜15%。夜明け 180 秒）。不変', SIM_FILES.i);

  it('不変は数でも（spec §F.4。tests/convoy-sim-a と同じ）。隠れると自艇の視程の外からの掃射（遠くの大発へ）を見て、最初の標的はほとんど大発', () => {
    expectSimInvariantCounts(run, SIM_FILES.i);
    expect(run.cell('none').beyondPlayerSight).toBeGreaterThan(1000); // 見捨てた艇が見る遠くの掃射（1 夜 約 30 発）
    expect(run.cell('none').firstBargePct).toBeGreaterThan(80); // 85〜90%
  });
});
