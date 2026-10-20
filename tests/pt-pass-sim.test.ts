// 米PT の掃射の航過の模擬（v0.6.3。core/pt-pass-sim・systems/pt-pass-sim-setup、spec §F・§G.1）: ゲームと同じ値と core で、遊び方ごとの帯（spec §F.4）を N 200・固定 seed で検査する。
// ここは ★ の 6 行（最小の組）、残りの 7 行は tests/pt-pass-sim-rows.test.ts（1 ファイル 20 秒を超えないよう分けた。ファイルどうしは並んで回る）。
// 帯を外したら、まず模擬が spec §C どおりかを確かめ、次に data の値だけを guns.damage → rounds_per_pass → pass_offset_m → max_passes → base_detect_m → open_fire_s の順で直す（source に理由）。
import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { PT_SHELL_POOL_SIZE } from '../src/config/pt-config';
import { getPtParams } from '../src/config/pt-mission-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import { PT_POLICIES, ptNightParams, runPtCell, runPtTrial, type PtCell } from '../src/core/pt-pass-sim';
import { directSortie } from '../src/core/sortie';
import { PT_CALIBRATION, ptCalibrationMisses, ptCalibrationRun, ptSimSetup } from '../src/systems/pt-pass-sim-setup';
import { buildWorldSetup } from '../src/systems/world-setup';

const N = 200;
const SEED_BASE = 1;
const TS = gameData.hitRateModel.world.time_scale;

describe('米PT の掃射の航過の模擬（v0.6.3、spec §F）', () => {
  it('模擬はゲームと同じ値（buildWorldSetup・getPtParams）を使い、今夜の揺らぎは出撃の組み立てと同じ（seed ごとに world-setup の米PT と一致）', () => {
    const s = ptSimSetup(gameData, 'jp_05');
    const w = buildWorldSetup(gameData, 'jp_05');
    expect(s.pt).toEqual(getPtParams(gameData, getPrototypeMission(gameData, 'jp_05'), TS));
    expect(s.pt).toEqual(w.ptBoats);
    expect(s.boat).toEqual(w.boatParams);
    expect(s.damage).toEqual(w.damageParams);
    expect(s.fuel).toEqual(w.fuelCurve);
    expect([s.crew, s.crewEffects, s.vis, s.visRange2, s.ring, s.start]).toEqual([w.crew, w.crewEffects, w.vis, w.visRange2, w.mission.returnPoint, w.playerStart]);
    expect([s.fuelGal, s.durationS, s.timeScale, s.stepS, s.boundsMarginM, s.halfLengthM, s.halfBeamM]).toEqual([23, 170, TS, FIXED_STEP_S, w.boundsMarginM, w.boatHalfLengthM, w.boatHalfBeamM]);
    expect([s.shellPoolSize, s.nightEnemyRolls, s.nightBatteries, s.night]).toEqual([PT_SHELL_POOL_SIZE, 1, 0, w.mission.night]);
    let mirrored = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const game = buildWorldSetup(gameData, 'jp_05', { sortie: directSortie('jp_05', seed, 'none', false, false) }).ptBoats;
      const sim = ptNightParams(s, seed);
      expect(sim, `seed ${seed}`).toEqual(game);
      if (sim.startHeadingDeg[0]! > 180) mirrored++;
    }
    expect(mirrored).toBeGreaterThan(5); // 東西反転の夜も含む
    expect(mirrored).toBeLessThan(35);
    expect(() => ptSimSetup(gameData, 'us_02')).toThrow(/pt_boats/);
  });

  it('上書き（scripts の DMG・ROUNDS・OFFSET…）は data の写しに当てて getPtParams の検査を通る。data は変えない', () => {
    const s = ptSimSetup(gameData, 'jp_05', { damage: 3, rounds: 9, offsetM: 150, passes: 1, openFireS: 3, commitTcpaS: 4, runInKt: 37, passGapS: 5, wingmanDelayS: 2, detectM: 1800, commitHeadingTolDeg: 20, holdOffM: 550, fuelGal: 22, dawnS: 150 });
    const p = s.pt;
    expect([p.hit.damage, p.gun.damage, p.roundsPerPass, p.offsetM, p.maxPasses, p.openFireS, p.commitTcpaS, p.passGapS, p.wingmanDelayS, p.baseDetectM]).toEqual([3, 3, 9, 150, 1, 3, 4, 5, 2, 1800]);
    expect([p.commitHeadingTolDeg, p.holdOff2, p.holdOuter2]).toEqual([20, 550 ** 2, 700 ** 2]);
    expect(p.runInMps).toBeCloseTo(ptSimSetup(gameData, 'jp_05').pt.runInMps * (37 / 35), 9);
    expect([s.fuelGal, s.durationS]).toEqual([22, 150]);
    expect(() => ptSimSetup(gameData, 'jp_05', { rounds: 13 })).toThrow(/1 回の航過では砲だけで沈まない/); // 13 × 4 = 52 ≥ HP 50
    expect(() => ptSimSetup(gameData, 'jp_05', { openFireS: 1.5 })).toThrow(/open_fire_s/);
    expect(() => ptSimSetup(gameData, 'jp_05', { runInKt: 30 })).toThrow(/振り切れない/);
    expect(() => ptSimSetup(gameData, 'jp_05', { holdOffM: 350 })).toThrow(/hold_off_m/);
    const base = getPtParams(gameData, getPrototypeMission(gameData, 'jp_05'), TS)!;
    expect([base.hit.damage, base.roundsPerPass, base.offsetM, base.baseDetectM]).toEqual([4, 10, 155, 2000]);
  });

  it('同じ seed なら同じ夜・同じ集計、違う seed なら違う', () => {
    const s = ptSimSetup(gameData, 'jp_05');
    expect(runPtTrial(s, 'cruise', 7)).toEqual(runPtTrial(s, 'cruise', 7));
    const a = runPtCell(s, 'late_turn', 20, 1);
    expect(runPtCell(s, 'late_turn', 20, 1)).toEqual(a);
    expect(runPtCell(s, 'late_turn', 20, 2)).not.toEqual(a);
    expect(a.shots).toBeGreaterThan(0);
  });

  // 較正の表は 1 回だけ回す（★ の 6 行、N 200 で 10 秒ほど）
  const run = ptCalibrationRun(gameData, 'jp_05', N, SEED_BASE);
  const rows = PT_CALIBRATION.filter((r) => r.star);

  it('較正 ★（spec §F.4、N 200・seed 1〜200）: 何もしないと痛い（巡航・静音）・転舵で助かる・遅い反応でも効く・暗さが効く。不変（予告から初弾・同時に 1 隻・射程と視程・1 回の航過）も', () => {
    expect(PT_CALIBRATION.map((r) => r.policy)).toEqual([...PT_POLICIES]);
    expect(rows.map((r) => r.policy)).toEqual(['cruise', 'silent', 'turn_cruise', 'dodge_silent', 'late_turn', 'dark_stop']);
    expect(rows.flatMap((r) => ptCalibrationMisses(r, run.cell(r.policy), run.setup, run.cell('cruise').hpMean).map((m) => `${r.policy}: ${m}`))).toEqual([]);
  }, 60_000);

  it('不変（spec §F.4 の 7、C.8）は数でも: 予告から初弾は open_fire_s 以上・航過は同時に 1 隻・有効射程と視程の外から撃たない・1 回の航過の砲の被害は 弾数 × 被害（40）以下・打ち切りなし', () => {
    const p = run.setup.pt;
    for (const r of rows) {
      const c: PtCell = run.cell(r.policy);
      expect(c.shots, r.policy).toBeGreaterThan(0);
      expect(c.minWarnS, r.policy).toBeGreaterThanOrEqual(p.openFireS - 1e-9);
      expect([c.maxPassing, c.beyondEff, c.beyondSight, c.timeoutPct], r.policy).toEqual([1, 0, 0, 0]);
      expect(c.worstPassHits * p.hit.damage, r.policy).toBeLessThanOrEqual(p.roundsPerPass * p.hit.damage);
    }
    expect(p.roundsPerPass * p.hit.damage).toBeLessThan(run.setup.damage.maxHp);
  });

  it('v0.6.3 の直し: 撃てる航過だけ（何もしない巡航・静音は撃たずに終わる航過 0・赤い線から 5 秒より前に終わる航過 0）、どの遊び方も 2 ステップ以内に終わる航過は無い', () => {
    for (const pol of ['cruise', 'silent'] as const) {
      const c = run.cell(pol);
      expect(c.passes - c.firedPasses, pol).toBe(0);
      expect(c.minPassS, pol).toBeGreaterThan(5);
    }
    for (const r of rows) expect(run.cell(r.policy).minPassS, r.policy).toBeGreaterThan(2 * run.setup.stepS);
  });
});
