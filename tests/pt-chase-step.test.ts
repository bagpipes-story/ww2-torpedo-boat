// 米PT の追撃の段階（v0.6.3 実機 2 回目。core/pt-boats の stepPtSection・pt-pass-end の endPass・pt-damage、spec r2 §D.2・§I.1）: 交互・待つ PT のガードと反対の舷・やめる（遅い艇・見失う）・
// 逃げる艇への航過の後は離脱しない・突撃から入る（待つ PT は反対の舷）・夜明けと沈んだ PT の連射・40 夜の連射の不変。関数ごとの検査は tests/pt-chase.test.ts。
import { describe, expect, it } from 'vitest';
import {
  PT_BREAK, PT_CHASE, PT_FATE_CREW, PT_LEAVE, PT_OUT, PT_PASS, PT_PATROL, PT_RUN_IN,
  createPtSection, stepPtSection, type PtBoatState, type PtCheck, type PtSection,
} from '../src/core/pt-boats';
import { chaseEntryOk, createChaseTarget, partnerReady, setChaseTarget, targetCourse } from '../src/core/pt-chase';
import { hitPt } from '../src/core/pt-damage';
import type { PtParams } from '../src/core/pt-data';
import { endPass } from '../src/core/pt-pass-end';
import { SeededRng } from '../src/core/rng';
import { degToRad, ktToMps, wrapDeg180 } from '../src/core/units';
import { DT, P, TS, check, events } from './pt-kit';

const V20 = ktToMps(20);
const NO_CHASE: PtParams = { ...P, chaseOn: false };
const TX = 3000;
const TY = 2000;

/** 最後に見た艇の速度 (vx, vy) の隊（艇は (x, y)） */
function target(vx: number, vy: number, x = TX, y = TY): { q: PtSection; t: ReturnType<typeof createChaseTarget> } {
  const q = createPtSection(P, 24);
  Object.assign(q, { detected: true, holdLeftS: 1e9, lkX: x, lkY: y, lkVx: vx, lkVy: vy, lkHeadingDeg: 0 });
  const t = createChaseTarget();
  setChaseTarget(t, q, x, y);
  return { q, t };
}
const at = (brg: number, d: number, x = TX, y = TY): [number, number] => [x + Math.sin(degToRad(brg)) * d, y - Math.cos(degToRad(brg)) * d];
const boatAt = (b: PtBoatState, [x, y]: [number, number], over: Partial<PtBoatState> = {}): PtBoatState => Object.assign(b, { x, y, ...over });
/** 北へ 20 kt の艇（位置は動かさない。速度は隊が見て最後に見た速度になる） */
const fleeing = (over: Partial<PtCheck> = {}): PtCheck => check({ x: TX, y: TY, headingDeg: 0, speedMps: V20 }, { detectOpenM: 5000, ...over });

describe('追撃の段階（pt-boats の stepPtSection）', () => {
  /** PT0・PT1 を追撃に置く（艇の左後ろ・右後ろ 170 m） */
  function twoChasers(): PtSection {
    const { q } = target(0, -V20);
    boatAt(q.boats[0]!, at(-135, 170), { phase: PT_CHASE, side: -1, headingDeg: 0, speedMps: V20 });
    boatAt(q.boats[1]!, at(135, 170), { phase: PT_CHASE, side: 1, headingDeg: 0, speedMps: V20 });
    return q;
  }
  const commitsOf = (q: PtSection, c: PtCheck = fleeing()): number[] => {
    const out: number[] = [];
    stepPtSection(q, P, c, new SeededRng(1), DT, DT * TS, events({ onCommit: (i) => void out.push(i) }));
    return out;
  };

  it('交互: 最後に連射した PT は、相方が撃てる距離にいれば gap_s + self_gap_s の間は固めない（相方が固める）。相方がいない・時間が過ぎれば固める', () => {
    const a = twoChasers();
    Object.assign(a, { lastBurstBoat: 0, selfGapLeftS: 1 });
    expect([commitsOf(a), a.boats[0]!.phase, a.boats[1]!.burst]).toEqual([[1], PT_CHASE, true]);
    const b = twoChasers();
    Object.assign(b, { lastBurstBoat: 0, selfGapLeftS: 1 });
    b.boats[1]!.phase = PT_LEAVE;
    expect(commitsOf(b)).toEqual([0]);
    const c = twoChasers();
    Object.assign(c, { lastBurstBoat: 0, selfGapLeftS: DT / 2 }); // このステップで尽きる
    expect(commitsOf(c)).toEqual([0]);
    // partnerReady: 追撃中なら commit_m の内、ほかの段階なら commit_max_m の内。去った・結末ありの PT は数えない
    const q = twoChasers();
    const ready = (): boolean => partnerReady(q, P, 0, TX, TY);
    expect(ready()).toBe(true);
    boatAt(q.boats[1]!, at(135, Math.sqrt(P.chaseCommit2) + 10));
    expect(ready()).toBe(false);
    q.boats[1]!.phase = PT_RUN_IN;
    expect(ready()).toBe(true);
    q.boats[1]!.fate = PT_FATE_CREW;
    expect(ready()).toBe(false);
  });

  it(`待つ追撃の PT（撃つ PT がいるか次まで）: 反対の舷の後ろで待ち、held_guard_m（${Math.sqrt(P.chaseHeldGuard2)} m）より内なら艇から真っすぐ離れる（自分から寄らない）`, () => {
    const q = twoChasers();
    q.boats[1]!.phase = PT_OUT;
    q.gapLeftS = 10;
    const b = boatAt(q.boats[0]!, at(180, 100), { headingDeg: 180, speedMps: P.chaseMps }); // 艇の真後ろ 100 m、もう艇から離れる向き
    const c = fleeing();
    let minD = Infinity;
    for (let k = 0; k < 60; k++) {
      c.timeS += DT;
      stepPtSection(q, P, c, new SeededRng(1), DT, DT * TS, events());
      minD = Math.min(minD, Math.hypot(b.x - TX, b.y - TY));
    }
    expect(minD).toBeGreaterThanOrEqual(100 - 1e-9);
    expect(Math.hypot(b.x - TX, b.y - TY)).toBeGreaterThan(Math.sqrt(P.chaseHeldGuard2));
    expect([b.phase, q.owner]).toEqual([PT_CHASE, -1]);
    // 撃っている PT がいると、待つ PT はその反対の舷（side = −ownerFlank）
    const w = twoChasers();
    Object.assign(w, { owner: 1, ownerFlank: 1 });
    Object.assign(w.boats[1]!, { phase: PT_PASS, burst: true, timerS: 0.5, roundsLeft: P.burstRounds });
    w.boats[0]!.side = 1;
    commitsOf(w);
    expect(w.boats[0]!.side).toBe(-1);
  });

  it('やめる: 目標が遅いまま slow_exit_s で突撃へ（止まった艇には航過）・見失えば哨戒へ', () => {
    const q = twoChasers();
    q.boats[1]!.phase = PT_OUT;
    q.gapLeftS = 100; // 固めさせない
    const c = check({ x: TX, y: TY, headingDeg: 0, speedMps: ktToMps(5) }, { detectOpenM: 5000 });
    const phases: number[] = [];
    for (let k = 0; k < Math.round(P.chaseSlowExitS / DT) + 2; k++) {
      c.timeS += DT;
      stepPtSection(q, P, c, new SeededRng(1), DT, DT * TS, events());
      if (phases.at(-1) !== q.boats[0]!.phase) phases.push(q.boats[0]!.phase);
    }
    expect(phases).toEqual([PT_CHASE, PT_RUN_IN]);
    const lost = twoChasers();
    Object.assign(lost, { holdLeftS: DT / 2 });
    commitsOf(lost, fleeing({ detectOpenM: 0 }));
    expect([lost.detected, lost.boats[0]!.phase, lost.boats[1]!.phase]).toEqual([false, PT_PATROL, PT_PATROL]);
  });

  it('逃げる艇（10 kt 以上）への航過の後は離脱しない（endPass → 追撃。今の舷）。遅い艇・CH_OFF なら離脱、max_passes なら去る', () => {
    const endAfter = (vy: number, p: PtParams = P, passes = 0): PtBoatState => {
      const { q } = target(0, vy);
      const b = boatAt(q.boats[0]!, at(-100, 200), { phase: PT_PASS, passes, timerS: 3, firedThisPass: 2 });
      q.owner = 0;
      endPass(q, p, b, 0, events());
      return b;
    };
    const b = endAfter(-V20);
    expect([b.phase, b.side, b.slowS, b.timerS, b.suppressed, b.chaseHits]).toEqual([PT_CHASE, -1, 0, 0, false, 0]);
    expect([endAfter(-ktToMps(9)).phase, endAfter(-V20, NO_CHASE).phase, endAfter(-V20, P, P.maxPasses - 1).phase]).toEqual([PT_BREAK, PT_BREAK, PT_LEAVE]);
  });

  it('突撃から入る: 逃げる艇の艇尾側の突撃の PT は今の舷で追撃へ。他の PT が撃っている間に待つ PT は撃つ PT の反対の舷で入る。CH_OFF では突撃のまま', () => {
    for (const [p, owner, want] of [[P, false, PT_CHASE], [P, true, PT_CHASE], [NO_CHASE, false, PT_RUN_IN]] as const) {
      const { q } = target(0, -V20);
      boatAt(q.boats[0]!, at(160, 600), { phase: PT_RUN_IN, headingDeg: 0, speedMps: P.runInMps });
      if (owner) {
        Object.assign(q, { owner: 1, ownerFlank: 1 });
        Object.assign(q.boats[1]!, { phase: PT_PASS, x: 3300, y: 1800, headingDeg: 270, lockDeg: 270, timerS: 1, roundsLeft: P.roundsPerPass });
      } else q.boats[1]!.phase = PT_OUT;
      stepPtSection(q, p, fleeing(), new SeededRng(1), DT, DT * TS, events());
      const b = q.boats[0]!;
      expect(b.phase, `${p.chaseOn} ${owner}`).toBe(want);
      if (want === PT_CHASE) expect([b.side, q.held[0]]).toEqual([owner ? -1 : 1, 0]);
    }
  });

  it('夜明け: 連射中の PT も去る（撃った連射は連射として数え、航過の回数には入れない。撃つ前なら数えない）。沈めた連射も連射として閉じ、次まで gap_s', () => {
    for (const fired of [3, 0]) {
      const q = twoChasers();
      Object.assign(q, { owner: 0 });
      Object.assign(q.boats[0]!, { phase: PT_PASS, burst: true, timerS: 3, firedThisPass: fired, roundsLeft: P.burstRounds - fired });
      stepPtSection(q, P, fleeing({ dawn: true }), new SeededRng(1), DT, DT * TS, events());
      const b = q.boats[0]!;
      expect([b.phase, b.burst, q.owner, q.passes, b.passes, q.bursts, b.bursts, q.firedPasses, q.lastPassBoat, q.leftAtDawn]).toEqual([PT_LEAVE, false, -1, 0, 0, fired > 0 ? 1 : 0, fired > 0 ? 1 : 0, fired > 0 ? 1 : 0, fired > 0 ? 0 : -1, true]);
    }
    const s = twoChasers();
    Object.assign(s, { owner: 0 });
    Object.assign(s.boats[0]!, { phase: PT_PASS, burst: true, timerS: 3, firedThisPass: 2, roundsLeft: P.burstRounds - 2 });
    hitPt(s, P, 0, 2, 0, events());
    expect([s.owner, s.gapLeftS, s.passes, s.bursts, s.firedBursts, s.boats[0]!.burst, s.seqPending]).toEqual([-1, P.chaseGapS, 0, 1, 1, false, true]);
  });

  it('逃げる艇を 40 夜追うと連射が来る（追撃の段階を通る）。連射の赤い線は予告から open_fire_s の後だけ撃ち、1 回 burst_rounds 発まで・同時に撃つ PT は 1 隻・1 隻の連射は max_bursts まで', () => {
    let bursts = 0;
    let bad = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const q = createPtSection(P, 24);
      const boat = { x: 3000, y: 3300, headingDeg: 0, speedMps: 0 };
      const c = check(boat, { timeS: 0 });
      const rng = new SeededRng(seed + 18);
      let commitAt = NaN;
      let rounds = 0;
      const ev = events({
        onCommit: (i) => {
          commitAt = c.timeS;
          rounds = 0;
          if (q.boats[i]!.burst) bursts++;
        },
        onFire: (i) => {
          const b = q.boats[i]!;
          if (c.timeS - commitAt < P.openFireS - 1e-9 || ++rounds > (b.burst ? P.burstRounds : P.roundsPerPass)) bad++;
        },
      });
      for (let k = 0; k < 60 * 120; k++) {
        // 北へ 20 kt でまっすぐ（見つかってからも曲がらない）
        boat.speedMps = V20;
        boat.y -= V20 * DT * TS;
        if (boat.y < 300) break;
        c.timeS += DT;
        stepPtSection(q, P, c, rng, DT, DT * TS, ev);
        let n = 0;
        for (const b of q.boats) if (b.phase === PT_PASS) n++;
        if (n > 1 || q.boats.some((b) => b.bursts > P.maxBursts)) bad++;
      }
    }
    expect(bad).toBe(0);
    expect(bursts).toBeGreaterThan(40);
  });
});

describe('入りと位置取りの境目（幾何。wrapDeg180 で ±180° を跨ぐ）', () => {
  it('西へ逃げる目標でも艇尾の角は目標の針路から測る（針路 270°: 艇尾は東）', () => {
    const { t } = target(-V20, 0);
    expect([chaseEntryOk(P, ...at(90 + 74, 500), t), chaseEntryOk(P, ...at(90 - 74, 500), t), chaseEntryOk(P, ...at(90, 500), t), chaseEntryOk(P, ...at(270, 500), t)]).toEqual([true, true, true, false]);
    expect(Math.abs(wrapDeg180(targetCourse(t) - 270))).toBeLessThan(1e-9);
  });
});
