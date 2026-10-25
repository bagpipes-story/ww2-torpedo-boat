// 夜の哨戒機の模擬（v0.6.7。jp_02「孤島の哨戒」。core/patrol-air-sim*・systems/patrol-air-sim-setup。spec-v067 §F.1・§F.2・§G.1）: 組み立てがゲームと同じ値か・data の上書きが
// 起動時の検査を通るか・台本の名前・再現性・+23 の回数（F6）・再出撃が遅れない（F12）・模擬の揺らぎのつまみ（HOLD・CREW）。回帰の帯は tests/patrol-air-sim-a〜e。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { runPatrolTrial } from '../src/core/patrol-air-sim';
import { runPatrolCell } from '../src/core/patrol-air-sim-cell';
import { PATROL_SIM_POLICIES, PATROL_SWEEP_REACT_S, parsePatrolPolicy } from '../src/core/patrol-air-sim-policy';
import { PATROL_CALIBRATION } from '../src/systems/patrol-air-calibration';
import { PATROL_HOLD_S, PATROL_REACT_JITTER_S, patrolSimSetup } from '../src/systems/patrol-air-sim-setup';
import { buildWorldSetup } from '../src/systems/world-setup';
import { SIM } from './patrol-air-sim-kit';

describe('組み立て（systems/patrol-air-sim-setup）', () => {
  it('ゲームと同じ値（buildWorldSetup(jp_02) の門番・夜の出撃・夜明けの空襲・艇・被害・乗員・燃料・出発点・輪・海域・夜の長さ）と揺らぎの既定', () => {
    const w = buildWorldSetup(gameData, 'jp_02');
    expect([SIM.gate, SIM.sortie, SIM.dawn]).toEqual([w.patrolAir!.gate, w.patrolAir!.sortie, w.airStrike]);
    expect([SIM.boat, SIM.damage, SIM.crew, SIM.crewEffects, SIM.fuelCurve, SIM.fuelStartGal]).toEqual([w.boatParams, w.damageParams, w.crew, w.crewEffects, w.fuelCurve, w.fuelStartGal]);
    expect([SIM.start, SIM.bounds, SIM.boundsMarginM, SIM.durationS, SIM.timeScale]).toEqual([w.playerStart, w.mission.bounds, w.boundsMarginM, w.durationS, w.timeScale]);
    expect(SIM.ring).toEqual({ x: w.mission.returnPoint.x, y: w.mission.returnPoint.y, radiusM: w.mission.returnPoint.radiusM });
    expect([SIM.sortie.planes, SIM.sortie.bombsPerPlane, SIM.dawn.planes, SIM.dawn.bombsPerPlane, SIM.durationS, SIM.fuelStartGal]).toEqual([2, 2, 4, 2, 220, 32]);
    // T-14（全速 31・巡航 20・静音の上限 14 kt）: 速さの指令は kt の比（試作と同じ 20/31・13.6/31）
    expect([SIM.cruise01, SIM.quiet01]).toEqual([20 / 31, 13.6 / 31]);
    expect([SIM.reactJitterS, SIM.holdS, SIM.stopJitterS, SIM.crewOn]).toEqual([PATROL_REACT_JITTER_S, PATROL_HOLD_S, null, true]);
    expect([PATROL_REACT_JITTER_S, PATROL_HOLD_S]).toEqual([[0.35, 0.9], [0.6, 1.4]]);
  });
  it('data の上書きは記録を写して起動時の検査を通す（1 機の爆弾と CEP は夜明けの空襲にも効く）。壊れた値は今の検査の例外', () => {
    const k = patrolSimSetup(gameData, { bombs: 3, cepM: 24, sweepGapS: 16, orbitS: 12, marginS: 3.5, radarPasses: 2 });
    expect([k.sortie.bombsPerPlane, k.dawn.bombsPerPlane, k.gate.sweepGapS, k.gate.orbitS, k.gate.hudStopMarginS, k.gate.radarPasses]).toEqual([3, 3, 16, 12, 3.5, 2]);
    expect(k.sortie.scatterM).toBeCloseTo(24 * Math.SQRT2, 9);
    expect(k.dawn.scatterM).toBeCloseTo(24 * Math.SQRT2, 9);
    expect(patrolSimSetup(gameData, { bombs: 1 }).dawn.bombsPerPlane).toBe(1);
    expect(gameData.enemies.enemies.find((e) => e.id === 'us_patrol_bomber')).toMatchObject({ strike: { bomb: { count: 2, accuracy_cep_m: 32 } } }); // 元の data は変えない
    expect(() => patrolSimSetup(gameData, { marginS: 2.66 })).toThrow(/F2/); // 航跡の限り 1.17 + 1.5
    expect(() => patrolSimSetup(gameData, { bombs: 4 })).toThrow(/C9/); // 1 回の出撃 2 × 4 = 8 > 7
    expect(() => patrolSimSetup(gameData, { radarPasses: 1.5 })).toThrow(/radar_passes/);
    expect(() => patrolSimSetup(gameData, { holdS: [1.4, 0.6] })).toThrow(/HOLD/);
    expect(() => patrolSimSetup(gameData, {}, 'jp_05')).toThrow(/patrol_air/);
    expect(patrolSimSetup(gameData, { holdS: [0.9, 0.9], reactJitterS: [0.35, 1.2], stopJitterS: [0.3, 1.8], crewOn: false })).toMatchObject({ holdS: [0.9, 0.9], reactJitterS: [0.35, 1.2], stopJitterS: [0.3, 1.8], crewOn: false });
  });
});

describe('台本（core/patrol-air-sim-policy）', () => {
  it('spec §F.3 の 15 台本を読め、どれも帯の表（PATROL_CALIBRATION）に同じ順である。名前の読み・消すまでの秒・掃きの r', () => {
    expect(PATROL_CALIBRATION.map((r) => r.policy)).toEqual(PATROL_SIM_POLICIES);
    for (const n of PATROL_SIM_POLICIES) expect(parsePatrolPolicy(n).name).toBe(n);
    expect(parsePatrolPolicy('hud~')).toMatchObject({ kind: 'hud', speed: 'full', hides: true, fullWhenAttacked: true, side: 'opp', stopLagS: 0.3, jitter: true, extinguishS: 2.0 });
    expect(parsePatrolPolicy('hud@2.0~')).toMatchObject({ stopLagS: 2.0, jitter: true });
    expect(parsePatrolPolicy('hud/0.35')).toMatchObject({ reactS: 0.35, jitter: false, extinguishS: 1.5 });
    expect(parsePatrolPolicy('hud/0.7').extinguishS).toBe(3.0);
    expect(parsePatrolPolicy('hud').extinguishS).toBe(2.0);
    expect(parsePatrolPolicy('quiet~')).toMatchObject({ speed: 'quiet', hides: true, fullWhenAttacked: true });
    expect(parsePatrolPolicy('quiet_dodge~')).toMatchObject({ speed: 'quiet', hides: false, fullWhenAttacked: true });
    expect(parsePatrolPolicy('quiet_nostop')).toMatchObject({ speed: 'quiet', hides: false, fullWhenAttacked: false, side: 'opp' });
    expect(parsePatrolPolicy('cruise~')).toMatchObject({ speed: 'cruise', fullWhenAttacked: false });
    expect(parsePatrolPolicy('run_ring')).toMatchObject({ side: 'ring', extinguishS: 2.0 });
    for (const n of ['run_straight', 'run_slow', 'hide_wait']) expect(parsePatrolPolicy(n)).toMatchObject({ side: 'none', extinguishS: 3.0 });
    expect(parsePatrolPolicy('hud/0.7', 2).extinguishS).toBe(2); // EXT
    expect(() => parsePatrolPolicy('dance')).toThrow(/hud/);
    expect(() => parsePatrolPolicy('hud', 0)).toThrow(/消すまで/);
    expect(PATROL_SWEEP_REACT_S).toEqual([0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0]);
  });
});

describe('1 夜（core/patrol-air-sim）', () => {
  it('同じ seed なら同じ夜・別の seed なら違う夜。HUD どおり（hud・seed 7）は 4 回の捜索（航跡 3）を 2 回隠れてやり過ごし、レーダーの 4 発をかわして 101.8 秒で帰投（spec §F.3 の時間線）', () => {
    const pol = parsePatrolPolicy('hud~');
    expect(runPatrolTrial(SIM, pol, 3)).toEqual(runPatrolTrial(SIM, pol, 3));
    expect(runPatrolTrial(SIM, pol, 3)).not.toEqual(runPatrolTrial(SIM, pol, 4));
    const r = runPatrolTrial(SIM, parsePatrolPolicy('hud'), 7);
    expect(r).toMatchObject({ home: true, homeBeforeDawn: true, sunk: false, passes: 4, passesWake: 3, hides: 2, finds: 1, findsVisual: 0, waves: 1, nightBombs: 4, nightHits: 0, dawnBombs: 0 });
    expect(r.timeS).toBeCloseTo(101.77, 2);
  });
  it('F6・F12: +23 は 2 × 夜の投下 + 命中の抽選（hud~ seed 1: 4 発・命中 1 → 10 回、run~ seed 1: 11 発・命中 1 → 24 回）。再出撃は遅れない（50 夜 × 4 台本）', () => {
    const a = runPatrolTrial(SIM, parsePatrolPolicy('hud~'), 1);
    expect([a.nightBombs, a.nightHits, a.draws, a.expectedDraws]).toEqual([4, 1, 10, 10]);
    const b = runPatrolTrial(SIM, parsePatrolPolicy('run~'), 1);
    expect([b.nightBombs, b.nightHits, b.finds, b.findsVisual, b.draws, b.expectedDraws]).toEqual([11, 1, 3, 2, 24, 24]);
    for (const n of ['hud~', 'run~', 'quiet~', 'hide_wait']) {
      const c = runPatrolCell(SIM, parsePatrolPolicy(n), 50, 1);
      expect([c.restartFalse, c.drawMismatch, c.waveMismatch], n).toEqual([0, 0, 0]);
    }
  });
  it('つまみ: 乗員の効きを切る（CREW=0）と hud~ は 9.0%（seed 1〜400）、戻す秒を 0.9 秒に決め打ちして乗員を切ると試作 v1 の規則（hud~ 12.0%・run~ 39.5%、seed 1〜200）', () => {
    expect(runPatrolCell(patrolSimSetup(gameData, { crewOn: false }), parsePatrolPolicy('hud~'), 400, 1).sunkPct).toBeCloseTo(9.0, 9);
    const v1 = patrolSimSetup(gameData, { crewOn: false, holdS: [0.9, 0.9] });
    expect(runPatrolCell(v1, parsePatrolPolicy('hud~'), 200, 1).sunkPct).toBeCloseTo(12.0, 9);
    expect(runPatrolCell(v1, parsePatrolPolicy('run~'), 200, 1).sunkPct).toBeCloseTo(39.5, 9);
  }, 30_000);
});
