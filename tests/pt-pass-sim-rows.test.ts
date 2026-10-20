// 米PT の掃射の航過の模擬（v0.6.3、spec §F.4）の残りの 7 行（★ の 6 行と模擬の組み立ては tests/pt-pass-sim.test.ts。1 ファイル 20 秒を超えないよう分けた）:
// 全速は遠くから見つかる・全速で転舵・ジグザグ・静音で転舵・PT へ向かう（罠にしない）・夜明けまで止まる。どの遊び方も帰投 65% 以上・漂流 1% 以下（turn_full だけ 8%）と不変（§F.4 の 7）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { PT_CALIBRATION, ptCalibrationMisses, ptCalibrationRun } from '../src/systems/pt-pass-sim-setup';

const N = 200;
const SEED_BASE = 1;

describe('米PT の掃射の航過の模擬（v0.6.3、spec §F.4 の ★ 以外）', () => {
  // 較正の表は 1 回だけ回す（7 行、N 200 で 12 秒ほど。turn_cruise の帯が読む巡航の HP は ★ の側）
  const run = ptCalibrationRun(gameData, 'jp_05', N, SEED_BASE);
  const rows = PT_CALIBRATION.filter((r) => !r.star);

  it('較正（N 200・seed 1〜200）: 全速は 1,500 m より遠くで見つかる、全速の転舵と PT へ向かうは沈まない、夜明けまで止まれば見つからずに夜明け後に帰る、帰投 65% 以上・漂流の帯・不変', () => {
    expect(rows.map((r) => r.policy)).toEqual(['full', 'zigzag', 'react_full', 'turn_silent', 'turn_full', 'meet', 'stop_dawn']);
    expect(rows.flatMap((r) => ptCalibrationMisses(r, run.cell(r.policy), run.setup, NaN).map((m) => `${r.policy}: ${m}`))).toEqual([]);
    for (const r of rows) expect(run.cell(r.policy).timeoutPct, r.policy).toBe(0);
    const still = run.cell('stop_dawn');
    expect([still.shots, still.passes, still.maxPassing]).toEqual([0, 0, 0]); // 見つからなければ撃たれない
  }, 60_000);
});
