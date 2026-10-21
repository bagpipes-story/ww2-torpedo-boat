// T-14 の 13mm を撃つ遊び方の模擬（v0.6.3 実機 1 回目。core/pt-pass-sim・systems/pt-gun-calibration、spec r1 §G.1・G.4・G.5）: ゲームと同じ値と core で、撃つ遊び方の帯を N 200・固定 seed で検査する。
// ここは ★ の 3 行（転舵しながら撃つ・止まって撃ち合う・暗さに隠れて撃つ）と静音で舷側を向ける fight（対の行が要らない。2 つのファイルの重さをそろえる）、対の帯が読む撃たない行
// （dodge_silent・dark_stop）。残りの 4 行は tests/pt-gun-sim-rows.test.ts（撃たない表は tests/pt-pass-sim*.test.ts。どのファイルも 20 秒を超えないよう分けた。対の行は同じ seed でそのファイルの中で回す）。
// 帯を外したら、まず模擬が spec r1 §C・§D どおりかを確かめ、次に data の値だけを spec r1 §G.6 の順で直す（source に理由。T-14 の HP と PT の砲は触らない）。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { runPtTrial } from '../src/core/pt-pass-sim';
import { PT_GUN_POLICIES } from '../src/core/pt-sim-policy';
import { PT_GUN_CALIBRATION, PT_GUN_SUNK_NIGHT_MAX, ptGunCalibrationMisses } from '../src/systems/pt-gun-calibration';
import { PT_HELD_MIN_M, ptCalibrationRun, ptSimSetup } from '../src/systems/pt-pass-sim-setup';

const N = 200;
const SEED_BASE = 1;

describe('T-14 の 13mm を撃つ遊び方の模擬（v0.6.3 実機 1 回目、spec r1 §G）', () => {
  it('同じ seed なら同じ夜（seed+20 の 13mm も）。撃つと PT に当たり、撃たない遊び方は砲の有無で変わらない。砲の無い任務では撃つ遊び方は使えない', () => {
    const s = ptSimSetup(gameData, 'jp_05');
    const a = runPtTrial(s, 'stop_shoot', 3);
    expect(runPtTrial(s, 'stop_shoot', 3)).toEqual(a);
    expect(a.gunShots).toBeGreaterThan(0);
    expect(a.gunHits).toBeGreaterThan(0);
    expect(runPtTrial({ ...s, gun: null }, 'turn_silent', 5)).toEqual(runPtTrial(s, 'turn_silent', 5));
    expect(() => runPtTrial({ ...s, gun: null }, 'turn_shoot', 1)).toThrow(/砲/);
  });

  // 較正の表は 1 回だけ回す（撃つ 4 行 + 対の 2 行、N 200 で 8 秒ほど）
  const run = ptCalibrationRun(gameData, 'jp_05', N, SEED_BASE);
  const rows = PT_GUN_CALIBRATION.filter((r) => r.star || r.policy === 'fight');

  it('較正 ★（spec r1 §G.4、N 200・seed 1〜200）: 転舵しながら撃つと HUD どおりの転舵より痛くなく 1 夜 5〜14 発当たる・止まって撃ち合うのは罠・暗さに隠れて撃っても発見はほとんど増えない（と fight）', () => {
    expect(PT_GUN_CALIBRATION.map((r) => r.policy)).toEqual([...PT_GUN_POLICIES]);
    expect(PT_GUN_CALIBRATION.filter((r) => r.star).map((r) => r.policy)).toEqual(['turn_shoot', 'stop_shoot', 'dark_shoot']);
    expect(rows.map((r) => r.policy)).toEqual(['turn_shoot', 'stop_shoot', 'fight', 'dark_shoot']);
    expect(rows.flatMap((r) => ptGunCalibrationMisses(r, run.cell, run.setup).map((m) => `${r.policy}: ${m}`))).toEqual([]);
  }, 60_000);

  it('不変（spec r1 §G.5・F1〜F11）は数でも: 予告から初弾は open_fire_s 以上・航過は同時に 1 隻・PT は視程と有効射程の外から撃たない・13mm も視程と射程の外へ撃たない・HP だけで沈む PT は無い・待つ PT は 350 m より内へ来ない・撃沈の夜は 16% 以下', () => {
    const p = run.setup.pt;
    for (const r of rows) {
      const c = run.cell(r.policy);
      expect(c.gunShots, r.policy).toBeGreaterThan(0);
      expect(c.minWarnS, r.policy).toBeGreaterThanOrEqual(p.openFireS - 1e-9);
      expect([c.maxPassing, c.beyondEff, c.beyondSight, c.gunBeyond, c.hpSinkPt, c.timeoutPct], r.policy).toEqual([1, 0, 0, 0, 0, 0]);
      expect(c.worstPassHits * p.hit.damage, r.policy).toBeLessThan(run.setup.damage.maxHp);
      expect(c.heldMinM, r.policy).toBeGreaterThanOrEqual(PT_HELD_MIN_M);
      expect(c.ptSunkPct, r.policy).toBeLessThanOrEqual(PT_GUN_SUNK_NIGHT_MAX);
      // 見つかってから撃つ遊び方は閃光が最初の発見にならない（閃光で先に見つかるのは暗さに隠れて撃つ dark_shoot だけ）
      if (r.policy !== 'dark_shoot') expect(c.flashFirstPct, r.policy).toBe(0);
    }
    expect(p.retreatHp).toBeLessThan(p.hullHp); // HP だけでは沈まない（沈むのは引火だけ）
  });
});
