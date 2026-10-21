// 米PT の掃射の航過と追撃の模擬（v0.6.3。core/pt-pass-sim・systems/pt-pass-sim-setup・pt-gun-calibration、spec §F・r2 §H）: ゲームと同じ値と core で、遊び方ごとの帯（spec r2 §H.2）を
// N 200・固定 seed で検査する。ここは模擬の組み立て・上書き・再現・行の分け方と、何もしない巡航・HUD の巡航の転舵とその撃ち返し・止まって撃ち合う（対の撃たない行と同じファイル）。
// 残りは tests/pt-pass-sim-rows・pt-gun-sim・pt-gun-sim-rows・pt-sim-silent・pt-sim-edge・pt-sim-late・pt-sim-dark（行の分け方は tests/pt-sim-kit の SIM_FILES。1 ファイル 10 行・
// 手元の vitest で 14 秒ほどまで）と、連射への反応の表 tests/pt-sim-react。
// 帯を外したら、まず模擬が spec r2 §D・§H.1 どおりかを確かめ、次に data の値だけを spec r2 §H.2 の順で直す（source に理由）。
import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { PT_GUN_SHELL_POOL_SIZE, PT_SHELL_POOL_SIZE } from '../src/config/pt-config';
import { getPtParams } from '../src/config/pt-mission-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import { ptNightParams, runPtTrial } from '../src/core/pt-pass-sim';
import { runPtCell } from '../src/core/pt-sim-cell';
import { PT_GUN_POLICIES, PT_POLICIES } from '../src/core/pt-sim-policy';
import { directSortie } from '../src/core/sortie';
import { PT_GUN_CALIBRATION } from '../src/systems/pt-gun-calibration';
import { PT_CALIBRATION, PT_HELD_MIN_M, ptSimSetup } from '../src/systems/pt-pass-sim-setup';
import { buildWorldSetup } from '../src/systems/world-setup';
import { SIM_FILES, itSimBands, simPartners } from './pt-sim-kit';
import { PT_SIM_R1 } from './pt-sim-r1';

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
    expect([s.fuelGal, s.durationS, s.timeScale, s.stepS, s.boundsMarginM, s.halfLengthM, s.halfBeamM]).toEqual([32, 170, TS, FIXED_STEP_S, w.boundsMarginM, w.boatHalfLengthM, w.boatHalfBeamM]);
    expect([s.shellPoolSize, s.nightEnemyRolls, s.nightBatteries, s.night]).toEqual([PT_SHELL_POOL_SIZE, 1, 0, w.mission.night]);
    // T-14 の 13mm（v0.6.3 実機 1 回目）: 世界と同じ砲（弾倉つき）と弾の数
    expect(s.gun).toEqual(w.guns);
    expect([s.gun?.label, s.gun?.magazine, s.gunShellPoolSize]).toEqual(['13mm機銃', { rounds: 30, reloadS: 3.2 }, PT_GUN_SHELL_POOL_SIZE]);
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
    // hold_off は tactics.station_m 600 の内（hold_off_m < station_m < 2 × hold_off_m − 有効射程 450。v0.6.3 実機 2 回目）
    const s = ptSimSetup(gameData, 'jp_05', { damage: 3, rounds: 9, offsetM: 150, passes: 1, openFireS: 3, commitTcpaS: 4, runInKt: 37, passGapS: 5, wingmanDelayS: 2, detectM: 1800, commitHeadingTolDeg: 20, holdOffM: 560, fuelGal: 22, dawnS: 150 });
    const p = s.pt;
    expect([p.hit.damage, p.gun.damage, p.roundsPerPass, p.offsetM, p.maxPasses, p.openFireS, p.commitTcpaS, p.passGapS, p.wingmanDelayS, p.baseDetectM]).toEqual([3, 3, 9, 150, 1, 3, 4, 5, 2, 1800]);
    expect([p.commitHeadingTolDeg, p.holdOff2, p.holdOuter2]).toEqual([20, 560 ** 2, 670 ** 2]);
    expect(p.runInMps).toBeCloseTo(ptSimSetup(gameData, 'jp_05').pt.runInMps * (37 / 35), 9);
    expect([s.fuelGal, s.durationS]).toEqual([22, 150]);
    expect(() => ptSimSetup(gameData, 'jp_05', { rounds: 13 })).toThrow(/1 回の航過では砲だけで沈まない/); // 13 × 4 = 52 ≥ HP 50
    expect(() => ptSimSetup(gameData, 'jp_05', { openFireS: 1.5 })).toThrow(/open_fire_s/);
    expect(() => ptSimSetup(gameData, 'jp_05', { runInKt: 30 })).toThrow(/振り切れない/);
    expect(() => ptSimSetup(gameData, 'jp_05', { holdOffM: 350 })).toThrow(/hold_off_m/);
    expect(() => ptSimSetup(gameData, 'jp_05', { holdOffM: 600 })).toThrow(/tactics\.station_m/); // 待つ PT の位置取りが hold_off の内になる
    // v0.6.3 実機 1 回目の上書き（BREAKS・BREAKM・STATION・RETHP・CAS・PFIRE と自艇の 13mm の GDISP・GRPM・GCONE・MAG・RELOAD）
    const t = ptSimSetup(gameData, 'jp_05', { breakMaxS: 6, breakOffM: 700, stationM: 560, retreatHp: 50, casualty: 0.04, fireChance: 0.004, gunDisp: 56, gunRpm: 400, gunCone: 20, magRounds: 20, reloadS: 4 });
    expect([t.pt.breakMaxS, t.pt.breakOff2, t.pt.stationM, t.pt.retreatHp, t.pt.casualtyChance, t.pt.fireChance]).toEqual([6, 700 ** 2, 560, 50, 0.04, 0.004]);
    const tg = t.gun!;
    expect([tg.groups[0]!.dispersionM, tg.groups[0]!.roundsPerMin, tg.deadConeDeg, tg.magazine]).toEqual([56, 400, 20, { rounds: 20, reloadS: 4 }]);
    expect(() => ptSimSetup(gameData, 'jp_05', { retreatHp: 100 })).toThrow(/retreat_hp/); // HP だけで沈む
    expect(() => ptSimSetup(gameData, 'jp_05', { stationM: 650 })).toThrow(/tactics\.station_m/);
    expect(() => ptSimSetup(gameData, 'jp_05', { magRounds: 0 })).toThrow(/magazine/);
    expect(() => ptSimSetup(gameData, 'jp_05', { magRounds: 50 })).not.toThrow(); // 1 弾倉 × 2 = 100 ≥ PT の HP でもよい（HP だけでは沈まない。レビュー F8）
    const base = getPtParams(gameData, getPrototypeMission(gameData, 'jp_05'), TS)!;
    expect([base.hit.damage, base.roundsPerPass, base.offsetM, base.baseDetectM, base.breakMaxS, base.breakOff2, base.stationM]).toEqual([4, 10, 120, 2000, 5, 650 ** 2, 600]);
    expect(ptSimSetup(gameData, 'jp_05').gun!.groups[0]!.dispersionM).toBe(56); // data は変えない
    // v0.6.3 実機 2 回目の上書き（PEFF・PENG・GR_OFF・CH_OFF）: 有効射程は検査を通る（追撃の commit_m 350 < 有効射程・hold_off の外）、GR_OFF だけが航過は危ない間だけを切る
    const r = ptSimSetup(gameData, 'jp_05', { effectiveM: 420, engineDamage: 0.05, passEndOff: true });
    expect([r.pt.gun.effectiveM, r.pt.hit.engineDamageChance, r.pt.passEndsWhenSafe, base.passEndsWhenSafe, base.gun.effectiveM, base.hit.engineDamageChance]).toEqual([420, 0.05, false, true, 450, 0.15]);
    expect(() => ptSimSetup(gameData, 'jp_05', { effectiveM: 350 })).toThrow(/commit_m < guns\.effective_night_m/);
    // CH_OFF だけが追撃を切る（data からはいつも入る）
    expect([ptSimSetup(gameData, 'jp_05', { chaseOff: true }).pt.chaseOn, ptSimSetup(gameData, 'jp_05', { chaseOff: true }).pt.passEndsWhenSafe, base.chaseOn]).toEqual([false, true, true]);
    // CH_<鍵>（追撃の鍵）と BREACT（連射への反応の表）: chase の検査を通る・知らない鍵は止まる
    const ch = ptSimSetup(gameData, 'jp_05', { chase: { burst_rounds: 5, suppress_hits: 4 }, burstReact: 'away' });
    expect([ch.pt.burstRounds, ch.pt.chaseSuppressHits, base.burstRounds, base.chaseSuppressHits, ch.burstReact, ptSimSetup(gameData, 'jp_05').burstReact]).toEqual([5, 4, 6, 3, 'away', undefined]);
    expect(() => ptSimSetup(gameData, 'jp_05', { chase: { commit_m: 450 } })).toThrow(/commit_m < guns\.effective_night_m/);
    expect(() => ptSimSetup(gameData, 'jp_05', { chase: { burst_rounds: 13 } })).toThrow(/chase\.burst_rounds × damage/); // 13 × 4 = 52 ≥ HP 50
    expect(() => ptSimSetup(gameData, 'jp_05', { chase: { bogus_m: 1 } as never })).toThrow(/chase の鍵ではない/);
    // 実機 1 回目の値と航過の終わり・追撃を切る上書き（tests/pt-sim-r1。spec r2 §I.3-5 の関門の材料）
    expect(ptSimSetup(gameData, 'jp_05', PT_SIM_R1).pt).toEqual({ ...base, gun: { ...base.gun, effectiveM: 400, engineDamageChance: 0.02 }, hit: { ...base.hit, engineDamageChance: 0.02 }, holdOff2: 500 ** 2, holdOuter2: 600 ** 2, stationM: 550, passGapS: 2.5, passEndsWhenSafe: false, chaseOn: false });
  });

  it('同じ seed なら同じ夜・同じ集計、違う seed なら違う', () => {
    const s = ptSimSetup(gameData, 'jp_05');
    expect(runPtTrial(s, 'cruise', 7)).toEqual(runPtTrial(s, 'cruise', 7));
    const a = runPtCell(s, 'late_turn', 20, 1);
    expect(runPtCell(s, 'late_turn', 20, 1)).toEqual(a);
    expect(runPtCell(s, 'late_turn', 20, 2)).not.toEqual(a);
    expect(a.shots).toBeGreaterThan(0);
    // 撃たない遊び方は 13mm を作らない（世界でも押さなければ seed+20 を引かない）: 13mm の数はみな 0
    const r = runPtTrial(s, 'dodge_silent', 7);
    expect([r.gunShots, r.gunHits, r.ptRetired, r.ptSunk, r.flashFirst, r.gunBeyond]).toEqual([0, 0, 0, 0, false, 0]);
  });

  it('37 の遊び方（撃たない 21・撃つ 16）は表の順に帯の行があり、8 つのファイルで 1 回ずつ回す。撃つ行の対の相手は同じファイル（回し直さない）。★ は spec r2 §H.2 の 16 行', () => {
    expect(PT_CALIBRATION.map((r) => r.policy)).toEqual([...PT_POLICIES]);
    expect(PT_GUN_CALIBRATION.map((r) => r.policy)).toEqual([...PT_GUN_POLICIES]);
    const files = Object.values(SIM_FILES);
    expect(files.flat().sort()).toEqual([...PT_POLICIES, ...PT_GUN_POLICIES].sort());
    for (const f of files) {
      expect(f.length).toBeLessThanOrEqual(10);
      for (const pol of f) for (const other of simPartners(pol)) expect(f, `${pol} の相手 ${other}`).toContain(other);
    }
    expect(PT_CALIBRATION.filter((r) => r.star).map((r) => r.policy)).toEqual(['cruise', 'silent', 'turn_cruise', 'dodge_silent', 'late_turn', 'dark_stop', 'hold_cruise', 'hold_full', 'mid_full', 'flee_full']);
    expect(PT_GUN_CALIBRATION.filter((r) => r.star).map((r) => r.policy)).toEqual(['turn_shoot', 'stop_shoot', 'dark_shoot', 'tc_shoot', 'hold_shoot', 'slow_shoot']);
  });

  // 較正の表は 1 回だけ回す（5 行、N 200 で 12 秒ほど）
  const rows = SIM_FILES.pass;
  const run = itSimBands(
    '較正（spec r2 §H.2、N 200・seed 1〜200）: 何もしない巡航は 32〜58% 沈む、HUD の巡航の転舵だけでも 18〜42%、撃ち返すと同じ転舵の半分以下（巡航のままは 0.65 倍）、止まって撃ち合うのは罠（転舵して撃つより 15 点以上）だが何もしないより安全。不変も',
    rows,
  );

  it('不変（spec §F.4・r1 §G.5・r2 §E）は数でも: 予告から初弾は open_fire_s 以上・撃つのは同時に 1 隻・有効射程と視程の外から撃たない・1 回の航過は 10 発・1 回の連射は 6 発まで・1 隻の連射は 6 回まで・連射の線は open_fire_s 以上・交互・打ち切りなし・待つ PT は 350 m より内へ来ない', () => {
    const p = run.setup.pt;
    for (const pol of rows) {
      const c = run.cell(pol);
      expect([c.shots > 0, c.bursts > 0], pol).toEqual([true, pol !== 'stop_shoot']); // 止まった艇は追わない（航過だけ）
      expect(c.minWarnS, pol).toBeGreaterThanOrEqual(p.openFireS - 1e-9);
      expect(c.minBurstS, pol).toBeGreaterThanOrEqual(p.openFireS);
      expect([c.maxPassing, c.beyondEff, c.beyondSight, c.timeoutPct, c.selfRepeats, c.gunBeyond], pol).toEqual([1, 0, 0, 0, 0, 0]);
      expect(c.worstPassHits * p.hit.damage, pol).toBeLessThan(run.setup.damage.maxHp);
      expect([c.worstBurstHits <= p.burstRounds, c.maxBoatBursts <= p.maxBursts], pol).toEqual([true, true]);
      expect(c.heldMinM, pol).toBeGreaterThanOrEqual(PT_HELD_MIN_M);
      expect(c.heldMinM, pol).toBeLessThan(p.stationM); // 待つ PT は位置取りをする（その夜があった）
    }
    expect([p.roundsPerPass * p.hit.damage, p.burstRounds * p.hit.damage].every((hp) => hp < run.setup.damage.maxHp)).toBe(true);
  });

  it('撃てる航過だけ（何もしない巡航は撃たずに終わる航過 0・赤い線から open_fire_s より前に終わる航過 0。静音は tests/pt-sim-silent）、どの遊び方も 2 ステップ以内に終わる航過は無い。追撃は来る（連射・機関損傷）', () => {
    // 撃った攻撃（firedPasses）は航過と連射の和。航過は撃ったか open_fire_s 経ったものだけ数える
    const c = run.cell('cruise');
    expect(c.passes - (c.firedPasses - c.bursts)).toBeCloseTo(0, 9);
    expect(c.minPassS).toBeGreaterThan(run.setup.pt.openFireS);
    expect(c.bursts).toBeGreaterThan(2); // 航過の後も追って撃つ（1 夜 2 回より多く）
    expect(c.enginePct).toBeGreaterThan(40); // 機関を撃ち抜かれる夜が多い（engine_damage_chance 0.15）
    for (const pol of rows) expect(run.cell(pol).minPassS, pol).toBeGreaterThan(2 * run.setup.stepS);
  });
});
