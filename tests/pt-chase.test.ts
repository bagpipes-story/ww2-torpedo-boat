// 米PT の追撃の部品（v0.6.3 実機 2 回目。core/pt-chase・pt-fire、spec r2 §D.2・§I.1）: 入り（速さの閾・艇尾の角・距離）・位置取りの点と速さ・追撃をやめる・
// 連射を固める・艇首の円錐へは遅く撃ち艇尾へは撃たない・連射の終わり（艇首の円錐の秒・窓・撃ち切り）・数えと去り方。段階の歩み（交互・待つ PT・離脱しない・夜明け）は
// tests/pt-chase-step、制圧（13mm）は tests/pt-damage。数値は jp_05 の getPtParams（data のまま）。方位は北 0・時計回り、x は東・y は南。
import { describe, expect, it } from 'vitest';
import { PT_BREAK, PT_CHASE, PT_FATE_CREW, PT_FATE_NONE, PT_LEAVE, PT_OUT, PT_PASS, createPtSection, type PtBoatState, type PtCheck, type PtSection } from '../src/core/pt-boats';
import { CHASE_OUT, PT_CHASE_LOOKAHEAD_M, burstEnded, chaseEntryOk, chaseHeading, chaseKeep, commitBurst, createChaseTarget, endBurst, setChaseTarget, type ChaseTarget } from '../src/core/pt-chase';
import type { PtParams } from '../src/core/pt-data';
import { stepPass } from '../src/core/pt-fire';
import { SeededRng } from '../src/core/rng';
import { bearingDeg } from '../src/core/ship-ai';
import { degToRad, ktToMps } from '../src/core/units';
import { DT, P, check, events } from './pt-kit';

const V20 = ktToMps(20);
const NO_CHASE: PtParams = { ...P, chaseOn: false };
/** 艇（目標）は (3000, 2000) を北へ 20 kt */
const TX = 3000;
const TY = 2000;

/** 最後に見た艇の速度 (vx, vy) の隊と、その目標（推した位置 (x, y)） */
function target(vx: number, vy: number, x = TX, y = TY): { q: PtSection; t: ChaseTarget } {
  const q = createPtSection(P, 24);
  Object.assign(q, { detected: true, holdLeftS: 1e9, lkX: x, lkY: y, lkVx: vx, lkVy: vy, lkHeadingDeg: 0 });
  const t = createChaseTarget();
  setChaseTarget(t, q, x, y);
  return { q, t };
}
/** 目標から方位 brg deg・距離 d m の点 */
const at = (brg: number, d: number, x = TX, y = TY): [number, number] => [x + Math.sin(degToRad(brg)) * d, y - Math.cos(degToRad(brg)) * d];
const boatAt = (b: PtBoatState, [x, y]: [number, number], over: Partial<PtBoatState> = {}): PtBoatState => Object.assign(b, { x, y, ...over });
/** 北へ 20 kt の艇（位置は動かさない。速度は隊が見て最後に見た速度になる） */
const fleeing = (over: Partial<PtCheck> = {}): PtCheck => check({ x: TX, y: TY, headingDeg: 0, speedMps: V20 }, { detectOpenM: 5000, ...over });

describe('追撃に入る（chaseEntryOk）・位置取り（chaseHeading）・やめる（chaseKeep）', () => {
  it(`入る: 目標が ${P.chaseMinMps / ktToMps(1)} kt 以上・PT が艇尾から ${Math.round(Math.acos(Math.sqrt(P.chaseCosAft2)) * 180 / Math.PI)}° 以内・commit_max_m（${Math.sqrt(P.commitMax2)} m）の内。CH_OFF では入らない`, () => {
    const { t } = target(0, -V20);
    const ok = (brg: number, d: number, p: PtParams = P): boolean => chaseEntryOk(p, ...at(brg, d), t);
    expect([ok(180 - 74, 600), ok(180 - 76, 600), ok(180 + 74, 600), ok(180 + 76, 600), ok(180, 600)]).toEqual([true, false, true, false, true]);
    expect([ok(180, 899), ok(180, 901), ok(90, 300), ok(0, 300)]).toEqual([true, false, false, false]);
    expect(ok(180, 600, NO_CHASE)).toBe(false);
    const slow = target(0, -ktToMps(9.9)).t;
    const ten = target(0, -P.chaseMinMps).t;
    expect([chaseEntryOk(P, ...at(180, 600), slow), chaseEntryOk(P, ...at(180, 600), ten)]).toEqual([false, true]);
  });

  it(`位置取りの点: 目標の針路から side × ${P.chaseRelDeg}° の方角 ${P.chaseStationM} m（station_lead_s 先）を、針路の先 ${PT_CHASE_LOOKAHEAD_M} m へずらして向く。海域の縁の余白の内に収める`, () => {
    const { q, t } = target(0, -V20);
    const lead = P.stationLeadS * P.timeScale;
    const b = boatAt(q.boats[0]!, at(180, 600));
    for (const side of [1, -1]) {
      const [sx, sy0] = at(side * P.chaseRelDeg, P.chaseStationM);
      const sy = sy0 - V20 * lead;
      expect(chaseHeading(P, b, t, side, P.chaseStationM, P.chaseRelDeg)).toBeCloseTo(bearingDeg(b.x, b.y, sx, sy - PT_CHASE_LOOKAHEAD_M), 9);
    }
    // 待つ側は held_rel_deg・held_station_m
    const [hx, hy] = at(-P.chaseHeldRelDeg, P.chaseHeldM);
    expect(chaseHeading(P, b, t, -1, P.chaseHeldM, P.chaseHeldRelDeg)).toBeCloseTo(bearingDeg(b.x, b.y, hx, hy - V20 * lead - PT_CHASE_LOOKAHEAD_M), 9);
    // 東の縁の近くの目標: 点は縁から edge_margin_m の内へ
    const e = target(0, -V20, P.bounds.width - 100, TY);
    const eb = boatAt(e.q.boats[0]!, at(180, 600, P.bounds.width - 100, TY));
    const ey = TY - Math.cos(degToRad(P.chaseRelDeg)) * P.chaseStationM - V20 * lead;
    expect(chaseHeading(P, eb, e.t, 1, P.chaseStationM, P.chaseRelDeg)).toBeCloseTo(bearingDeg(eb.x, eb.y, P.bounds.width - P.edgeMarginM, ey - PT_CHASE_LOOKAHEAD_M), 9);
  });

  it(`速さ: 点が前（PT が後ろ）なら最大 ${P.chaseMps / ktToMps(1)} kt まで、並べば目標の速さ、前へ出すぎれば目標の速さ − overtake（station_close_m で比例）。0 未満にならない`, () => {
    const { q, t } = target(0, -V20);
    const lead = P.stationLeadS * P.timeScale;
    const [sx, sy0] = at(P.chaseRelDeg, P.chaseStationM);
    const sy = sy0 - V20 * lead;
    const b = q.boats[0]!;
    const sp = (dy: number): number => {
      boatAt(b, [sx, sy + dy]);
      chaseHeading(P, b, t, 1, P.chaseStationM, P.chaseRelDeg);
      return CHASE_OUT.sp;
    };
    expect(sp(600)).toBeCloseTo(P.chaseMps, 9); // 遠い後ろ: 39 kt
    expect(sp(P.stationCloseM / 2)).toBeCloseTo(V20 + (P.chaseMps - V20) / 2, 9);
    expect(sp(0)).toBeCloseTo(V20, 9);
    expect(sp(-300)).toBeCloseTo(V20 - P.overtakeMps, 9); // 前へ出すぎ: 14 kt
    const slow = target(0, -ktToMps(3)).t;
    boatAt(b, [sx, sy - 300]);
    chaseHeading(P, b, slow, 1, P.chaseStationM, P.chaseRelDeg);
    expect(CHASE_OUT.sp).toBe(0);
  });

  it(`やめる（突撃へ戻す）: 目標が ${P.chaseMinMps / ktToMps(1)} kt 未満のまま slow_exit_s（${P.chaseSlowExitS} 秒）・PT が目標の艇首から ${Math.round(Math.acos(Math.sqrt(P.chaseCosExit2)) * 180 / Math.PI)}° 以内へ出た`, () => {
    const { q, t } = target(0, -V20);
    const slow = target(0, -ktToMps(8)).t;
    const b = boatAt(q.boats[0]!, at(180, 300), { slowS: 0 });
    const keeps: boolean[] = [];
    for (let k = 0; k < 4; k++) keeps.push(chaseKeep(P, b, slow, P.chaseSlowExitS / 4));
    expect(keeps).toEqual([true, true, true, false]);
    expect(chaseKeep(P, b, t, DT)).toBe(true); // 速くなれば数え直す
    expect(b.slowS).toBe(0);
    const keepAt = (brg: number): boolean => chaseKeep(P, boatAt(b, at(brg, 200)), t, DT);
    expect([keepAt(44), keepAt(-44), keepAt(46), keepAt(90), keepAt(135), keepAt(180)]).toEqual([false, false, true, true, true, true]);
  });
});

describe('連射（commitBurst・pt-fire の stepPass・burstEnded・endBurst）', () => {
  /** PT0 が連射中（予告から timerS 秒・北向き (3000, 2400)）。艇は (bx, by) に止まっている */
  function bursting(timerS: number, bx: number, by: number, over: Partial<PtBoatState> = {}): { q: PtSection; b: PtBoatState; c: PtCheck } {
    const q = createPtSection(P, 24);
    Object.assign(q, { owner: 0, detected: true, holdLeftS: 1e9, commitAtS: 10 - timerS, lkX: bx, lkY: by });
    const b = Object.assign(q.boats[0]!, { x: 3000, y: 2400, headingDeg: 0, lockDeg: 0, speedMps: V20, phase: PT_PASS, burst: true, timerS, roundsLeft: P.burstRounds, firedThisPass: 0, coneS: 0, ...over });
    q.boats[1]!.phase = PT_OUT;
    return { q, b, c: check({ x: bx, y: by, headingDeg: 0, speedMps: 0 }, { detectOpenM: 5000, timeS: 10 }) };
  }
  /** 撃つ部分だけを n ステップ（PT は動かさない。timerS は pt-boats と同じく先に進める）。発射の時刻（体感秒）を返す */
  function fireFor(s: { q: PtSection; b: PtBoatState; c: PtCheck }, n: number, log: string[] = []): number[] {
    const shots: number[] = [];
    const ev = events({ onFire: () => void shots.push(s.c.timeS), onPassEnd: () => void log.push('end'), onLeave: () => void log.push('leave') });
    const rng = new SeededRng(1);
    for (let k = 0; k < n && s.b.phase === PT_PASS; k++) {
      s.c.timeS += DT;
      s.b.timerS += DT;
      stepPass(s.q, P, s.c, s.b, 0, 0, 0, rng, DT, ev);
    }
    return shots;
  }
  const INTERVAL = 60 / (P.gun.roundsPerMinPerGun * P.gun.count);

  it(`固める: 撃つ権利（q.owner）を取り、赤い線は PT → 艇、弾は ${P.burstRounds} 発、onCommit を呼ぶ。艇のどちらの舷かを残す`, () => {
    const { q } = target(0, -V20);
    const b = boatAt(q.boats[0]!, at(-135, 170), { phase: PT_CHASE });
    const c = fleeing();
    const log: number[][] = [];
    commitBurst(q, c, P, b, 0, 12, events({ onCommit: (i, lockDeg, dodge) => void log.push([i, lockDeg, dodge]) }));
    expect([b.phase, b.burst, b.timerS, b.roundsLeft, b.firedThisPass, b.coneS, q.owner, q.passHits, q.commitAtS, q.ownerFlank]).toEqual([PT_PASS, true, 0, P.burstRounds, 0, 0, 0, 0, c.timeS, -1]);
    expect(b.lockDeg).toBeCloseTo(bearingDeg(b.x, b.y, TX, TY), 9);
    expect(log).toEqual([[0, b.lockDeg, q.dodge]]);
  });

  it(`撃つ: 艇首の円錐の中へは間隔 ÷ bow_rof_factor（${INTERVAL / P.burstBowRofFactor} 秒）、真横へはふつう（${INTERVAL} 秒）、艇尾の円錐へは撃たない。航過は艇首の円錐へも撃たない。予告から open_fire_s の前は撃たない`, () => {
    const bow = fireFor(bursting(P.openFireS, 3000, 2200), 60);
    const beam = fireFor(bursting(P.openFireS, 3200, 2400), 60);
    const stern = fireFor(bursting(P.openFireS, 3000, 2600), 60);
    const pass = fireFor(bursting(P.openFireS, 3000, 2200, { burst: false, roundsLeft: P.roundsPerPass }), 60);
    const early = fireFor(bursting(0, 3200, 2400), Math.floor(P.openFireS / DT) - 2);
    expect([bow.length, beam.length, stern.length, pass.length, early.length]).toEqual([2, 4, 0, 0, 0]);
    expect(bow[1]! - bow[0]!).toBeGreaterThanOrEqual(INTERVAL / P.burstBowRofFactor - DT - 1e-9);
    expect(bow[1]! - bow[0]!).toBeLessThanOrEqual(INTERVAL / P.burstBowRofFactor + DT + 1e-9);
    for (let k = 1; k < beam.length; k++) expect(Math.abs(beam[k]! - beam[k - 1]! - INTERVAL)).toBeLessThanOrEqual(DT + 1e-9);
  });

  it(`艇が艇首の円錐に cone_quit_s（${P.burstConeQuitS} 秒）いると連射をやめる（数えるのは open_fire_s の後だけ）。撃った連射だけ回数に数える`, () => {
    const log: string[] = [];
    const s = bursting(P.openFireS, 3000, 2200);
    const shots = fireFor(s, 60 * 4, log);
    expect(log).toEqual(['end']);
    expect(s.c.timeS - 10).toBeGreaterThanOrEqual(P.burstConeQuitS - 1e-9);
    expect(s.c.timeS - 10).toBeLessThanOrEqual(P.burstConeQuitS + 2 * DT);
    expect(shots.length).toBe(Math.ceil(P.burstConeQuitS / (INTERVAL / P.burstBowRofFactor)));
    expect([s.b.phase, s.b.burst, s.b.bursts, s.q.bursts, s.q.firedBursts, s.q.passes, s.q.owner]).toEqual([PT_CHASE, false, 1, 1, 1, 0, -1]);
    // 艇尾の円錐（撃てない）は数えない: 窓の終わり（open_fire_s + burst_max_s）まで続く
    const t = bursting(P.openFireS, 3000, 2600);
    fireFor(t, 60 * 4);
    expect(t.c.timeS - 10).toBeGreaterThanOrEqual(P.burstMaxS - 1e-9);
    expect([t.b.phase, t.b.bursts, t.q.firedBursts]).toEqual([PT_CHASE, 0, 0]); // 撃たなかった連射は数えない（その PT はまた撃てる）
  });

  it('終わり（burstEnded）: open_fire_s の前は見ない。後は 窓の終わり・撃ち切った・艇首の円錐の秒・break_off_m より遠い・海域の縁。黙った（制圧・撃退）連射は撃ち切っても窓の終わりまで', () => {
    const b = createPtSection(P, 24).boats[0]!;
    Object.assign(b, { x: 3000, y: 2000, phase: PT_PASS, burst: true, roundsLeft: 0, coneS: 9, fate: PT_FATE_NONE, suppressed: false });
    const near = 200 ** 2;
    const far = P.breakOff2 + 1;
    b.timerS = P.openFireS - 0.01;
    expect(burstEnded(P, b, far)).toBe(false);
    Object.assign(b, { timerS: P.openFireS, roundsLeft: 3, coneS: 0 });
    expect([burstEnded(P, b, near), burstEnded(P, b, far)]).toEqual([false, true]);
    expect(burstEnded(P, Object.assign(b, { coneS: P.burstConeQuitS }), near)).toBe(true);
    expect(burstEnded(P, Object.assign(b, { coneS: 0, roundsLeft: 0 }), near)).toBe(true);
    expect(burstEnded(P, Object.assign(b, { suppressed: true }), near)).toBe(false);
    expect(burstEnded(P, Object.assign(b, { suppressed: false, fate: PT_FATE_CREW }), near)).toBe(false);
    expect(burstEnded(P, Object.assign(b, { timerS: P.openFireS + P.burstMaxS }), near)).toBe(true);
    expect(burstEnded(P, Object.assign(b, { timerS: P.openFireS, fate: PT_FATE_NONE, roundsLeft: 3, x: P.boundsMarginM / 2 }), near)).toBe(true);
  });

  it(`endBurst: 次まで gap_s（同じ PT は gap_s + self_gap_s）。${P.maxBursts} 回目で去る・撃退なら去る・制圧なら艇から離れる向きへ離脱・ほかは追撃のまま（onPassEnd の間は burst が立っている）`, () => {
    const end = (over: Partial<PtBoatState>): { q: PtSection; b: PtBoatState; log: (string | boolean)[] } => {
      const q = createPtSection(P, 24);
      const b = Object.assign(q.boats[0]!, { x: 2880, y: 2120, phase: PT_PASS, burst: true, firedThisPass: 4, ...over });
      Object.assign(q, { owner: 0, passHits: 1 });
      const log: (string | boolean)[] = [];
      endBurst(q, P, b, 0, TX, TY, events({ onPassEnd: (_i, fired, hits) => void log.push('end', fired, String(hits), b.burst), onLeave: () => void log.push('leave') }));
      return { q, b, log };
    };
    const a = end({});
    expect([a.b.phase, a.b.burst, a.b.bursts, a.b.timerS, a.q.owner, a.q.bursts, a.q.firedBursts, a.q.burstHits, a.q.firedPasses, a.q.passes, a.q.lastPassBurst, a.q.seqPending]).toEqual([PT_CHASE, false, 1, 0, -1, 1, 1, 1, 1, 0, true, true]);
    expect([a.q.gapLeftS, a.q.selfGapLeftS, a.q.lastBurstBoat, a.log]).toEqual([P.chaseGapS, P.chaseGapS + P.chaseSelfGapS, 0, ['end', true, '1', true]]);
    const last = end({ bursts: P.maxBursts - 1 });
    expect([last.b.phase, last.b.bursts, last.log]).toEqual([PT_LEAVE, P.maxBursts, ['end', true, '1', true, 'leave']]);
    const crew = end({ fate: PT_FATE_CREW });
    expect([crew.b.phase, crew.log.at(-1)]).toEqual([PT_LEAVE, 'leave']);
    const sup = end({ suppressed: true });
    expect(sup.b.phase).toBe(PT_BREAK);
    expect(sup.b.lockDeg).toBeCloseTo(bearingDeg(TX, TY, 2880, 2120), 9); // 艇から離れる向き
    const unfired = end({ firedThisPass: 0 });
    expect([unfired.b.phase, unfired.b.bursts, unfired.q.bursts, unfired.q.firedPasses, unfired.q.lastPassFired, unfired.log]).toEqual([PT_CHASE, 0, 0, 0, false, ['end', false, '1', true]]);
  });
});
