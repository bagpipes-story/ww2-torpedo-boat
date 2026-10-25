// 夜の哨戒機の門番（v0.6.7。core/patrol-air。spec-v067 §C.6・§G.1）の規則: F2（秒読み 0 の 1.5 秒後に止め始めても見つからない。0〜31 kt を 1 kt 刻み、fixture と jp_02 の data）・
// F6（乱数 0 回）・F7（発見を決める物は読み出しの値）・§7（平方根・atan2・確保なし）と、fixture と jp_02 の世界の門番の値の一致。段の動きは tests/patrol-air.test.ts。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { gameData } from '../src/config/game-data';
import type { AircraftPose } from '../src/core/friendly';
import {
  PA_EV_FIND,
  PA_ORBIT,
  PA_PASS,
  createPatrolAir,
  patrolCountdownS,
  patrolFindPose,
  patrolNextPassS,
  patrolOrbitLeftS,
  patrolPose,
  patrolVisible,
  patrolWakeLeftS,
  stepPatrolAir,
  type PatrolState,
} from '../src/core/patrol-air';
import { SeededRng } from '../src/core/rng';
import { buildWorldSetup } from '../src/systems/world-setup';
import { DT, P, P_EYE, T14, TS, V, hunting, run, steps, stopAfterCountdown } from './patrol-air-kit';

describe('F2: 秒読みが 0 になってから 1.5 秒遅れて止め始めても見つからない（0〜31 kt を 1 kt 刻み）', () => {
  it.each([0, 1.5])('fixture（T-14）: 遅れ %f 秒', (lag) => {
    for (let kt = 0; kt <= 31; kt++) {
      const r = stopAfterCountdown(P_EYE, T14, TS, kt, lag);
      expect(r.found, `${kt} kt`).toBe(false);
      expect(r.zeroAfterS).toBeCloseTo(11.58, 1);
    }
  });
  it('限りの外は見つかる（全速で 2.0 秒遅れ＝航跡が 1,500 m の線までに消えない。限りは 3.0 − 1.17 = 1.83 秒）', () => {
    expect(stopAfterCountdown(P_EYE, T14, TS, 31, 2.0).found).toBe(true);
    expect(stopAfterCountdown(P_EYE, T14, TS, 31, 1.7).found).toBe(false);
  });
  it('jp_02 の data（世界の門番の値と T-14 の運動）でも同じ（遅れ 0 と 1.5 秒・0〜31 kt）', () => {
    const w = buildWorldSetup(gameData, 'jp_02');
    const g = { ...w.patrolAir!.gate, radarPasses: 0 };
    for (const lag of [0, 1.5]) for (let kt = 0; kt <= 31; kt++) expect(stopAfterCountdown(g, w.boatParams, w.timeScale, kt, lag).found, `${kt} kt・${lag} 秒`).toBe(false);
  });
});

describe('F6・F7・§7: 乱数 0 回・決める物は読める・確保なし', () => {
  it('F6: 作る・進める・読み出しのどれも SeededRng.prototype.next と Math.random を 0 回', () => {
    const spy = vi.spyOn(SeededRng.prototype, 'next');
    const mr = vi.spyOn(Math, 'random');
    const s = createPatrolAir();
    const pose: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };
    const bands = ['stop', 'silent', 'cruise', 'full'] as const;
    for (let i = 0; i < steps(400); i++) {
      const ev = stepPatrolAir(s, P, bands[Math.floor(i / 97) % 4]!, false, i % 400 === 0, DT);
      if (ev & PA_EV_FIND) patrolFindPose(s, -10, pose);
      patrolPose(s, P, 10, pose);
      patrolCountdownS(s, P);
      patrolOrbitLeftS(s, P);
      patrolNextPassS(s, P);
      patrolWakeLeftS(s, P);
    }
    expect(s.k).toBeGreaterThan(5);
    expect(s.finds).toBeGreaterThan(1);
    expect(spy).not.toHaveBeenCalled();
    expect(mr).not.toHaveBeenCalled();
    spy.mockRestore();
    mr.mockRestore();
  });
  it('F7: 発見は「見えている（帯・レーダー・距離）かつ 600〜1,500 m」だけで決まる（どの段・帯・距離でも、次のステップの発見を読み出しの値から当てられる）', () => {
    const bands = ['stop', 'silent', 'cruise', 'full'] as const;
    let checked = 0;
    for (const band of bands) {
      for (const k of [0, 1]) {
        const s = hunting(k);
        for (let i = 0; i < steps(40); i++) {
          const before = { ...s };
          const ev = stepPatrolAir(s, P, band, false, false, DT);
          if (before.phase !== PA_PASS && before.phase !== PA_ORBIT) continue;
          const moved = { ...before, r: before.phase === PA_PASS ? Math.max(P.nearM, before.r - V * DT) : before.r };
          const want = moved.r <= P.lockM && moved.r >= P.runRadiusM && patrolVisible(moved, P, band) && !(before.phase === PA_ORBIT && before.phaseT + DT >= P.orbitS);
          expect((ev & PA_EV_FIND) !== 0, `${band} k${k} r ${before.r.toFixed(0)}`).toBe(want);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
  it('§7 ソース: 乱数・Math.random・平方根・atan2・hypot・Phaser を使わず、毎ステップと読み出しの関数は new・配列・クロージャ・展開・object を書かない', () => {
    const src = readFileSync(join(__dirname, '..', 'src', 'core', 'patrol-air.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(src).not.toMatch(/SeededRng|\brng\b|Math\.random|sqrt|atan2|hypot|phaser/i);
    for (const name of ['patrolWake', 'patrolVisible', 'startPass', 'toHunt', 'stepPatrolAir', 'patrolLockInS', 'patrolCountdownS', 'patrolOrbitLeftS', 'patrolNextPassS', 'patrolNextBearingDeg', 'patrolWakeLeftS', 'poseAt', 'patrolPose', 'patrolFindPose']) {
      const m = new RegExp(`function ${name}\\b[\\s\\S]*?\\n}`).exec(src);
      expect(m, name).not.toBeNull();
      const body = m![0].slice(m![0].indexOf('{'));
      expect(body, name).not.toMatch(/\bnew\b|\[|=>|\.\.\.|\{\s*\w+\s*:/);
    }
    const st = readFileSync(join(__dirname, '..', 'src', 'core', 'patrol-air-state.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(st).not.toMatch(/SeededRng|\brng\b|Math\.random|phaser|^import/im);
  });
  it('§7: 10,000 ステップ回しても状態の鍵の数は同じ（足さない）', () => {
    const s: PatrolState = createPatrolAir();
    const keys = Object.keys(s).join(',');
    run(s, P, 10000, 'full', false, true);
    expect(Object.keys(s).join(',')).toBe(keys);
    expect(s.k).toBeGreaterThan(3);
  });
});

describe('fixture と jp_02 の data', () => {
  it('jp_02 の世界の門番の値は fixture と同じ（data を変えたらこの fixture も見直す）', () => {
    const g = buildWorldSetup(gameData, 'jp_02').patrolAir!.gate;
    expect(g).toEqual({ ...P, flightMps: g.flightMps, orbitDegPerS: g.orbitDegPerS });
    expect(g.flightMps).toBeCloseTo(V, 9);
    expect(g.orbitDegPerS).toBeCloseTo(P.orbitDegPerS, 9);
  });
});
