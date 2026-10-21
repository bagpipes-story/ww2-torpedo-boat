// 米PT の航過は危ない間だけ（v0.6.3 実機 2 回目。core/pt-fire の stepPass、spec r2 §D.2-9・§I.1）: 撃ち切った航過は次のステップで終わる（撃退で黙った PT は線のまま抜ける）、
// open_fire_s の後に有効射程の外へ離れていく航過は終わる（前は終わらない・近づいてくるなら終わらない）。どちらも回数に数える航過。模擬の上書き GR_OFF（passEndsWhenSafe false）は前の終わり方。
import { describe, expect, it } from 'vitest';
import { PT_BREAK, PT_FATE_CREW, PT_OUT, PT_PASS, createPtSection, stepPtSection, type PtSection } from '../src/core/pt-boats';
import type { PtParams } from '../src/core/pt-data';
import { SeededRng } from '../src/core/rng';
import { DT, P, TS, check, events } from './pt-kit';

/** PT0 が東へ航過中（予告から timerS 秒・残り弾・撃った数）、PT1 は海域の外。艇は (bx, by) で針路 boatDeg・速さ boatMps（game m/s） */
function passing(timerS: number, roundsLeft: number, fired: number, bx: number, by: number, boatDeg: number, boatMps: number): { q: PtSection; boat: { x: number; y: number; headingDeg: number; speedMps: number } } {
  const q = createPtSection(P, 24);
  Object.assign(q, { owner: 0, detected: true, holdLeftS: 1e9, commitAtS: 10 - timerS });
  Object.assign(q.boats[0]!, { x: 3000, y: 2000, headingDeg: 90, lockDeg: 90, passMps: P.passMinMps, speedMps: P.passMinMps, phase: PT_PASS, timerS, roundsLeft, firedThisPass: fired });
  q.boats[1]!.phase = PT_OUT;
  return { q, boat: { x: bx, y: by, headingDeg: boatDeg, speedMps: boatMps } };
}

/** 1 ステップ回して、航過の終わり（onPassEnd）の数を返す */
function step(q: PtSection, boat: { x: number; y: number; headingDeg: number; speedMps: number }, p: PtParams = P): number {
  let ends = 0;
  stepPtSection(q, p, check(boat, { detectOpenM: 5000 }), new SeededRng(1), DT, DT * TS, events({ onPassEnd: () => void ends++ }));
  return ends;
}

const OFF: PtParams = { ...P, passEndsWhenSafe: false };
const FAR = P.gun.effectiveM + 20; // 有効射程の外（艇は PT の 30 m 東・FAR m 南。艇首尾の円錐の外・固めた線の前＝後ろへ抜けたの判定は掛からない）

describe('航過は危ない間だけ（core/pt-fire）', () => {
  it('data では有効（passEndsWhenSafe）。模擬の上書き GR_OFF だけが切る', () => {
    expect(P.passEndsWhenSafe).toBe(true);
  });

  it('(1) 撃ち切った航過（弾 0・撃った・結末なし）は次のステップで終わる: owner −1・撃った航過に数え・離脱へ。GR_OFF なら終わらない', () => {
    const a = passing(3, 0, P.roundsPerPass, 3050, 2150, 270, 0);
    expect(step(a.q, a.boat)).toBe(1);
    expect([a.q.owner, a.q.passes, a.q.firedPasses, a.q.cleanPasses, a.q.boats[0]!.passes, a.q.boats[0]!.phase, a.q.passSeq, a.q.gapLeftS]).toEqual([-1, 1, 1, 1, 1, PT_BREAK, 1, P.passGapS]); // 飛んでいる弾は無いので HUD の結果はすぐ
    const b = passing(3, 0, P.roundsPerPass, 3050, 2150, 270, 0);
    expect(step(b.q, b.boat, OFF)).toBe(0);
    expect([b.q.owner, b.q.boats[0]!.phase]).toEqual([0, PT_PASS]);
    // 弾が残っていれば撃ち切りではない（次の 1 発の間隔の間は続く）。最後の 1 発を撃ったステップで終わる（線は撃ち切ったら消える）
    const c = passing(3, 1, P.roundsPerPass - 1, 3050, 2150, 270, 0);
    c.q.boats[0]!.cooldownS = 1;
    expect(step(c.q, c.boat)).toBe(0);
    const last = passing(3, 1, P.roundsPerPass - 1, 3050, 2150, 270, 0);
    expect(step(last.q, last.boat)).toBe(1);
    expect([last.q.shots, last.q.firedPasses, last.q.owner]).toEqual([1, 1, -1]);
  });

  it('(2) 撃退で黙った航過（弾 0・撃った・結末あり）は終わらず、赤い線のまま抜ける（撃ち切りではない）', () => {
    const a = passing(3, 0, 4, 3050, 2150, 270, 0);
    a.q.boats[0]!.fate = PT_FATE_CREW;
    expect(step(a.q, a.boat)).toBe(0);
    expect([a.q.owner, a.q.boats[0]!.phase]).toEqual([0, PT_PASS]);
  });

  it('(3) 有効射程の外へ離れていく航過: open_fire_s の前は終わらず、後は終わる（撃たずに終わっても open_fire_s 経った航過は数える）。GR_OFF なら終わらない', () => {
    const away = 10; // 艇は南へ 10 m/s で離れていく（PT は東へ）
    const before = passing(P.openFireS - 0.5, P.roundsPerPass, 0, 3030, 2000 + FAR, 180, away);
    expect(step(before.q, before.boat)).toBe(0);
    const after = passing(P.openFireS + 0.1, P.roundsPerPass, 0, 3030, 2000 + FAR, 180, away);
    expect(step(after.q, after.boat)).toBe(1);
    expect([after.q.owner, after.q.passes, after.q.firedPasses, after.q.boats[0]!.passes]).toEqual([-1, 1, 0, 1]);
    const off = passing(P.openFireS + 0.1, P.roundsPerPass, 0, 3030, 2000 + FAR, 180, away);
    expect(step(off.q, off.boat, OFF)).toBe(0);
    // 有効射程の内なら離れていても終わらない（撃てる）
    const inside = passing(P.openFireS + 0.1, P.roundsPerPass, 0, 3030, 2000 + P.gun.effectiveM - 20, 180, away);
    expect(step(inside.q, inside.boat)).toBe(0);
  });

  it('(4) 有効射程の外でも近づいてくるなら終わらない（open_fire_s の後も。離れていくかは艇の速度 − PT の速度で見る）', () => {
    const toward = passing(P.openFireS + 0.1, P.roundsPerPass, 0, 3030, 2000 + FAR, 0, 10);
    expect(step(toward.q, toward.boat)).toBe(0);
    expect([toward.q.owner, toward.q.boats[0]!.phase]).toEqual([0, PT_PASS]);
    // 止まった艇の少し先（真横の点の前）を東へ走る PT は近づいている＝終わらない
    const ahead = passing(P.openFireS + 0.1, P.roundsPerPass, 0, 3030, 2000 + FAR, 0, 0);
    expect(step(ahead.q, ahead.boat)).toBe(0);
  });
});
