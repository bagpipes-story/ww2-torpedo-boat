// 夜の哨戒機の門番（v0.6.7。core/patrol-air。spec-v067 §C.1・§C.6・§G.1）: レーダーの捜索・航跡の漏れる数え・定時・見え方と発見の距離（F1 の予告）・付近の捜索と去る・
// 方角の回り・OFF（F4）・秒読み・600 m 未満では発見しない（F4）。F2・F6・F7・§7 と jp_02 の data との一致は tests/patrol-air-rules。
// 値は tests/patrol-air-kit の固定の fixture（data を読まない）。
import { describe, expect, it } from 'vitest';
import type { AircraftPose } from '../src/core/friendly';
import {
  PA_EV_FIND,
  PA_EV_HUNT,
  PA_EV_LEAVE,
  PA_EV_OFF,
  PA_EV_PASS,
  PA_HUNT,
  PA_LEAVE,
  PA_OFF,
  PA_ORBIT,
  PA_PASS,
  PA_SORTIE,
  createPatrolAir,
  patrolCountdownS,
  patrolLockInS,
  patrolNextBearingDeg,
  patrolNextPassS,
  patrolOrbitLeftS,
  patrolPose,
  patrolVisible,
  patrolWakeLeftS,
  stepPatrolAir,
} from '../src/core/patrol-air';
import { radToDeg, wrapDeg180 } from '../src/core/units';
import { DT, P, P_EYE, V, hunting, run, runUntil, steps } from './patrol-air-kit';

// 接近の始まり P.wakeDetectM 4,200 m（v0.6.7 実機 1 回目に 6,000 m から。予告 14.58 → 8.75 秒）
const PASS_TO_LOCK_S = (P.wakeDetectM - 1500) / V; // 8.75
const PASS_TO_NEAR_S = (P.wakeDetectM - 900) / V; // 10.69

describe('最初の捜索はレーダー（止まっていても見つかる）', () => {
  it('first_pass_s 3 秒に北東 56° の 4,200 m から来て、止まったままでも 1,500 m で発見（予告 8.75 秒・目の発見には数えない）', () => {
    const s = createPatrolAir();
    expect(run(s, P, steps(3) - 1, 'stop')).toBe(0);
    expect([s.phase, s.k]).toEqual([PA_HUNT, 0]);
    const tPass = runUntil(s, P, PA_EV_PASS, 'stop', 1);
    expect(tPass).toBeCloseTo(3, 1);
    expect([s.phase, s.radar, s.viaWake, s.bearingDeg, s.r, s.k]).toEqual([PA_PASS, true, false, 56, 4200, 1]);
    const tFind = runUntil(s, P, PA_EV_FIND, 'stop', 30);
    expect(tFind - tPass).toBeGreaterThanOrEqual(PASS_TO_LOCK_S - DT);
    expect(tFind - tPass).toBeLessThan(PASS_TO_LOCK_S + DT);
    expect(s.findR).toBeLessThanOrEqual(1500);
    expect(s.findR).toBeGreaterThan(1500 - V * DT);
    expect([s.phase, s.findPhase, s.findBearingDeg, s.finds, s.findsVisual, s.minVisualWarnS, s.firstVisualFindT]).toEqual([PA_SORTIE, PA_PASS, 56, 1, 0, Infinity, Number.NaN]);
  });
  it('出撃中は出撃の終わり（sortieDone）まで待ち、終われば哨戒へ（定時も航跡の数えも 0 から）', () => {
    const s = createPatrolAir();
    runUntil(s, P, PA_EV_FIND, 'stop', 30);
    expect(run(s, P, steps(30), 'full', false, false)).toBe(0);
    expect(s.phase).toBe(PA_SORTIE);
    expect(stepPatrolAir(s, P, 'full', false, true, DT)).toBe(PA_EV_HUNT);
    expect([s.phase, s.huntT, s.wakeAcc]).toEqual([PA_HUNT, 0, 0]);
  });
});

describe('哨戒: 航跡の漏れる数え（+秒／−秒）と定時の捜索', () => {
  it('2.9 秒の航跡と 0.1 秒の静音の繰り返しでも数えは 3 秒に届いて捜索が来る（航跡で来た）', () => {
    const s = hunting();
    let t = Number.NaN;
    for (let i = 0; i < steps(12) && Number.isNaN(t); i++) {
      const band = i % steps(3) < steps(2.9) ? 'full' : 'silent';
      if (stepPatrolAir(s, P, band, false, false, DT) & PA_EV_PASS) t = s.t;
    }
    expect(t).toBeGreaterThan(3);
    expect(t).toBeLessThan(3.4);
    expect([s.viaWake, s.radar, s.passesWake]).toEqual([true, false, 1]);
  });
  it('2.5 秒の航跡と 2.5 秒の静音の繰り返しでは数えが届かず、定時の 12 秒に来る（航跡で来たとは数えない）', () => {
    const s = hunting();
    let t = Number.NaN;
    let maxAcc = 0;
    for (let i = 0; i < steps(20) && Number.isNaN(t); i++) {
      if (stepPatrolAir(s, P, i % steps(5) < steps(2.5) ? 'cruise' : 'silent', false, false, DT) & PA_EV_PASS) t = s.t;
      else maxAcc = Math.max(maxAcc, s.wakeAcc);
    }
    expect(maxAcc).toBeLessThan(2.6);
    expect(t).toBeCloseTo(12, 1);
    expect([s.viaWake, s.passesWake]).toEqual([false, 0]);
  });
  it('航跡が無ければ定時（哨戒が sweep_gap_s 12 秒続いたら）。数えの残り秒と次の捜索の秒が読める', () => {
    const s = hunting();
    run(s, P, steps(4), 'stop');
    expect(patrolNextPassS(s, P)).toBeCloseTo(8, 6);
    expect(patrolWakeLeftS(s, P)).toBeNaN();
    run(s, P, steps(1), 'full');
    expect(patrolWakeLeftS(s, P)).toBeCloseTo(2, 6);
    expect(runUntil(s, P, PA_EV_PASS, 'stop', 20)).toBeCloseTo(12, 1);
    expect([s.viaWake, s.radar, patrolNextPassS(s, P), patrolWakeLeftS(s, P)]).toEqual([false, false, Number.NaN, Number.NaN]);
  });
  it('最初の捜索（レーダーの前）は first_pass_s の時刻だけで来て、航跡で来たとは数えない（次の捜索の秒は first_pass_s まで）', () => {
    const s = createPatrolAir();
    const p = { ...P, firstPassS: 8 };
    run(s, p, steps(1), 'full');
    expect(patrolNextPassS(s, p)).toBeCloseTo(7, 6);
    expect(patrolWakeLeftS(s, p)).toBeNaN();
    expect(runUntil(s, p, PA_EV_PASS, 'full', 20)).toBeCloseTo(8, 1);
    expect([s.radar, s.viaWake, s.passesWake]).toEqual([true, false, 0]);
  });
});

describe('見え方と発見の距離（目の捜索）', () => {
  it.each([
    ['full', 1500, PASS_TO_LOCK_S],
    ['cruise', 1500, PASS_TO_LOCK_S],
    ['silent', 900, PASS_TO_NEAR_S],
  ] as const)('帯 %s: %i m で発見（予告 %f 秒 ≥ 8＝F1 の hud_stop_margin_s 3 + 5）', (band, at, warn) => {
    const s = hunting();
    const tPass = runUntil(s, P, PA_EV_PASS, band);
    const tFind = runUntil(s, P, PA_EV_FIND, band);
    expect(s.findR).toBeLessThanOrEqual(at);
    expect(s.findR).toBeGreaterThan(at - V * DT);
    expect(tFind - tPass).toBeCloseTo(warn, 1);
    expect(tFind - tPass).toBeGreaterThanOrEqual(8);
    expect(s.minVisualWarnS).toBeCloseTo(warn, 1);
    expect([s.findsVisual, s.finds, s.firstVisualFindT]).toEqual([1, 1, tFind]);
    expect(s.findPhase).toBe(band === 'silent' ? PA_ORBIT : PA_PASS);
  });
  it('停止は見えない: 付近の捜索 8 秒（時計回りに 157.2°）→ 去る 2.5 秒 → 哨戒。隠れた 1 回', () => {
    const s = hunting();
    runUntil(s, P, PA_EV_PASS, 'stop');
    const b0 = s.bearingDeg;
    let all = 0;
    let tOrbit = Number.NaN;
    let tLeave = Number.NaN;
    let bLeave = Number.NaN;
    run(s, P, steps(30), 'stop', false, false, (ev) => {
      all |= ev;
      if (s.phase === PA_ORBIT && Number.isNaN(tOrbit)) tOrbit = s.t;
      if (ev & PA_EV_LEAVE) [tLeave, bLeave] = [s.t, s.bearingDeg];
    });
    expect(all & PA_EV_FIND).toBe(0);
    expect(all & (PA_EV_LEAVE | PA_EV_HUNT)).toBe(PA_EV_LEAVE | PA_EV_HUNT);
    expect(wrapDeg180(bLeave - b0)).toBeCloseTo(radToDeg(V / 900) * 8, 0);
    expect(radToDeg(V / 900) * 8).toBeCloseTo(157.2, 1);
    expect(tLeave - tOrbit).toBeCloseTo(8, 1);
    expect([s.phase, s.hides, s.finds]).toEqual([PA_HUNT, 1, 0]);
  });
  it('去るは leave_s 2.5 秒で外へ（距離が増え、絵は薄くなる）。付近の捜索の残り秒が読める', () => {
    const s = hunting();
    runUntil(s, P, PA_EV_PASS, 'stop');
    run(s, P, steps(PASS_TO_NEAR_S + 2), 'stop');
    expect(s.phase).toBe(PA_ORBIT);
    expect(patrolOrbitLeftS(s, P)).toBeCloseTo(6, 1);
    runUntil(s, P, PA_EV_LEAVE, 'stop');
    const pose: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };
    expect(patrolPose(s, P, 0, pose).alpha).toBe(1);
    run(s, P, steps(1.25), 'stop');
    expect(s.phase).toBe(PA_LEAVE);
    expect(s.r).toBeCloseTo(900 + 1.25 * V, -1);
    expect(patrolPose(s, P, 0, pose).alpha).toBeCloseTo(0.5, 1);
    expect(pose.headingDeg).toBeCloseTo(s.bearingDeg, 6);
    const leaveAt = s.t - s.phaseT;
    expect(runUntil(s, P, PA_EV_HUNT, 'stop', 3) - leaveAt).toBeCloseTo(2.5, 1);
    expect(patrolPose(s, P, 0, pose).alpha).toBe(0);
  });
  it('F4: 旋回の半径（600 m）より近くでは発見しない（視程が 600 m 未満の壊れた値でも、見えている静音の艇を見つけない）', () => {
    const p = { ...P, nearM: 500, orbitDegPerS: radToDeg(V / 500) };
    const s = hunting();
    runUntil(s, p, PA_EV_PASS, 'silent');
    let all = 0;
    run(s, p, steps(40), 'silent', false, false, (ev) => (all |= ev));
    expect(all & PA_EV_FIND).toBe(0);
    expect(patrolVisible({ ...s, phase: PA_ORBIT, r: 500 }, p, 'silent')).toBe(true);
    expect(s.finds).toBe(0);
  });
});

describe('方角の回り・OFF・秒読み', () => {
  it('捜索ごとに 90° 回る: 56 → 146 → 236 → 326 → 56（定時も航跡も通し番号）', () => {
    const s = createPatrolAir();
    const seen: number[] = [];
    const next: number[] = [patrolNextBearingDeg(s, P_EYE)];
    run(s, P_EYE, steps(170), 'stop', false, false, (ev) => {
      if (ev & PA_EV_PASS) seen.push(s.bearingDeg);
      if (ev & PA_EV_HUNT) next.push(patrolNextBearingDeg(s, P_EYE));
    });
    expect(next.slice(0, 4)).toEqual([56, 146, 236, 326]);
    expect(seen.slice(0, 5)).toEqual([56, 146, 236, 326, 56]);
    expect(s.finds).toBe(0);
  });
  it.each([
    ['哨戒', PA_HUNT, 1],
    ['接近', PA_PASS, 5],
    ['付近の捜索', PA_ORBIT, 17],
    ['出撃中', PA_SORTIE, -1],
  ] as const)('F4: %s で off（夜明け・沈没・輪・座礁）なら OFF。以後は off が消えても何もしない（発見も捜索も無い）', (_n, phase, atS) => {
    const s = createPatrolAir();
    if (atS < 0) runUntil(s, P, PA_EV_FIND, 'stop');
    else run(s, P_EYE, steps(atS), 'stop');
    expect(s.phase).toBe(phase);
    expect(stepPatrolAir(s, P_EYE, 'full', true, false, DT)).toBe(PA_EV_OFF);
    const frozen = { ...s };
    expect(run(s, P_EYE, steps(60), 'full', false, true)).toBe(0);
    expect(s).toEqual(frozen);
    expect(s.phase).toBe(PA_OFF);
  });
  it('秒読み「あと N 秒で止まれ」は 4,200 m で 6、5.75 秒で 0（1,500 m の線の hud_stop_margin_s 3 秒前）。接近の間だけ', () => {
    const s = hunting();
    expect(patrolCountdownS(s, P)).toBeNaN();
    runUntil(s, P, PA_EV_PASS, 'stop');
    expect([patrolCountdownS(s, P), patrolLockInS(s, P)]).toEqual([6, PASS_TO_LOCK_S]);
    let zeroAt = Number.NaN;
    let last = 6;
    run(s, P, steps(14), 'stop', false, false, () => {
      const c = patrolCountdownS(s, P);
      if (!Number.isNaN(c)) {
        expect(c).toBeLessThanOrEqual(last);
        last = c;
      }
      if (c === 0 && Number.isNaN(zeroAt)) zeroAt = s.t - s.passStartT;
    });
    expect(zeroAt).toBeCloseTo(PASS_TO_LOCK_S - 3, 1);
    expect(PASS_TO_LOCK_S - 3).toBeCloseTo(5.75, 2);
    expect(Object.is(patrolCountdownS({ ...s, phase: PA_PASS, r: 1000 }, P), 0)).toBe(true);
  });
});
