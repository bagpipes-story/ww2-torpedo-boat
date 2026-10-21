// 米PT の掃射の航過の模擬（v0.6.3、spec §F.4・r1 §G.3）の残りの 8 行（★ の 6 行と模擬の組み立ては tests/pt-pass-sim.test.ts、13mm は tests/pt-gun-sim.test.ts。1 ファイル 20 秒を超えないよう分けた）:
// 全速は遠くから見つかる・巡航で全速の転舵（航過 4.5 回以上・赤い線は前と反対の舷から 0.65 以上＝挟み撃ち。レビュー F2）・全速で転舵・ジグザグ・静音で転舵・PT へ向かう（罠にしない）・夜明けまで止まる・
// 縁へ逃げる（v0.6.3 レビュー: 抜け道にならない）。どの遊び方も帰投 65% 以上（v0.6.3 実機 1 回目から縁へ逃げる edge_flee は床なし＝分かっている罠）・漂流 1% 以下（turn_full だけ 8%・edge_flee 10%）と不変（§F.4 の 7・r1 §G.5）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { PT_CALIBRATION, ptCalibrationMisses, ptCalibrationRun } from '../src/systems/pt-pass-sim-setup';
import { PT_SIM_R1 } from './pt-sim-r1';

const N = 200;
const SEED_BASE = 1;

describe('米PT の掃射の航過の模擬（v0.6.3、spec §F.4 の ★ 以外）', () => {
  // 較正の表は 1 回だけ回す（8 行、N 200 で 7 秒ほど。turn_cruise の帯が読む巡航の HP は ★ の側）
  // v0.6.3 実機 2 回目: 実機 1 回目の帯は実機 1 回目の値と航過の終わりで回す（tests/pt-sim-r1。f27b266 の表に戻る関門）
  const run = ptCalibrationRun(gameData, 'jp_05', N, SEED_BASE, PT_SIM_R1);
  const rows = PT_CALIBRATION.filter((r) => !r.star);

  it('較正（N 200・seed 1〜200）: 全速は 1,500 m より遠くで見つかる、全速の転舵は沈まず航過 4.5 回以上で左右から代わる代わる、PT へ向かうは 15% 以下、夜明けまで止まれば見つからずに夜明け後に帰る、帰投 65% 以上（縁へ逃げるは床なし）・漂流の帯・不変', () => {
    expect(rows.map((r) => r.policy)).toEqual(['full', 'zigzag', 'react_full', 'turn_silent', 'turn_full', 'meet', 'stop_dawn', 'edge_flee']);
    expect(rows.flatMap((r) => ptCalibrationMisses(r, run.cell(r.policy), run.setup, NaN).map((m) => `${r.policy}: ${m}`))).toEqual([]);
    for (const r of rows) expect(run.cell(r.policy).timeoutPct, r.policy).toBe(0);
    const still = run.cell('stop_dawn');
    expect([still.shots, still.passes, still.maxPassing]).toEqual([0, 0, 0]); // 見つからなければ撃たれない
    // 縁へ逃げる（v0.6.3 レビュー）: 縁で航過が撃たずに終わる抜け道は無い（数えた航過のほとんどで撃ち、1 夜 4 発以上当たる。前は 0.56 発）
    const edge = run.cell('edge_flee');
    expect(edge.firedPasses).toBeGreaterThanOrEqual(0.9 * edge.passes);
    expect(edge.hits).toBeGreaterThan(4);
    expect(edge.hpMean).toBeGreaterThan(run.cell('react_full').hpMean); // 転舵でかわすより痛い
  }, 60_000);
});
