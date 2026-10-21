// T-14 の 13mm を撃つ遊び方の模擬（v0.6.3 実機 1 回目、spec r1 §G.4・G.5）の残りの 4 行（★ の 3 行と fight は tests/pt-gun-sim.test.ts。1 ファイル 20 秒を超えないよう分けた）:
// 巡航のまま撃つ・巡航で全速の転舵 + 撃つ・2 秒遅れの転舵 + 撃つ・静音のまままっすぐ撃つ。対の帯が読む撃たない行（cruise・react_full・late_turn・silent）もここで同じ seed で回す。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { PT_GUN_CALIBRATION, PT_GUN_SUNK_NIGHT_MAX, ptGunCalibrationMisses } from '../src/systems/pt-gun-calibration';
import { PT_HELD_MIN_M, ptCalibrationRun } from '../src/systems/pt-pass-sim-setup';

const N = 200;
const SEED_BASE = 1;

describe('T-14 の 13mm を撃つ遊び方の模擬（v0.6.3 実機 1 回目、spec r1 §G.4 の ★ 以外）', () => {
  // 較正の表は 1 回だけ回す（撃つ 4 行 + 対の 4 行、N 200 で 7 秒ほど）
  const run = ptCalibrationRun(gameData, 'jp_05', N, SEED_BASE);
  const rows = PT_GUN_CALIBRATION.filter((r) => !r.star && r.policy !== 'fight');

  it('較正（N 200・seed 1〜200）: 巡航のまま撃っても何もしないより沈みにくく痛くない・全速の転舵に撃ち返しを足しても痛くならない・2 秒遅れでも撃てば悪くならない・静音のまま撃つと何もしないより 8 点以上沈みにくい・不変', () => {
    expect(rows.map((r) => r.policy)).toEqual(['shoot_cruise', 'react_shoot', 'late_shoot', 'silent_shoot']);
    expect(rows.flatMap((r) => ptGunCalibrationMisses(r, run.cell, run.setup).map((m) => `${r.policy}: ${m}`))).toEqual([]);
    for (const r of rows) {
      const c = run.cell(r.policy);
      expect([c.maxPassing, c.gunBeyond, c.timeoutPct, c.flashFirstPct], r.policy).toEqual([1, 0, 0, 0]); // 見つかってから撃つので閃光が最初の発見にはならない
      expect(c.heldMinM, r.policy).toBeGreaterThanOrEqual(PT_HELD_MIN_M);
      expect(c.ptSunkPct, r.policy).toBeLessThanOrEqual(PT_GUN_SUNK_NIGHT_MAX);
    }
  }, 60_000);
});
