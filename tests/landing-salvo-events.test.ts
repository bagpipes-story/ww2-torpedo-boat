// v0.6.9 S6a-fix（spec-v069 R14 A3）: 米PT の斉射の出来事（core/landing-torpedoes の LandingTorpedoLink）。同じステップ（同じ nowS）の同じ種類の斉射は 1 つの出来事
// （「米PT 2 隻が慌てて発射！ 輸送船へ 6 本」＝隻数・本数の和）、外れ・不発の出来事はプールにほかの決着していない魚雷が無いときだけ（ほかの斉射が走っている間に「それた！ 輸送船は無事」と言わない）。
// R2 の慌てた斉射は隊が捉えたステップに哨戒の PT がみな撃つ（監査 A3: lure_late の夜は 2 隻が同じステップ）。知らせの前の印はプールと同じ（命中・通り過ぎは resolved）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createLanding, LE_CALM, LE_DUD, LE_ENGAGED, LE_HURRIED, LE_MISS, type LandingState } from '../src/core/landing';
import { LandingTorpedoLink, LandingTorpedoPool } from '../src/core/landing-torpedoes';
import { PT_ALERT, PT_PATROL } from '../src/core/pt-boats';
import { PT_SALVO_CALM, PT_SALVO_ENGAGED, PT_SALVO_HURRIED, createPtTorpedoState, stepPtTorpedoes } from '../src/core/pt-torpedo';
import { SeededRng } from '../src/core/rng';
import type { TorpedoState } from '../src/core/torpedo';
import { FEEL_DT, LP, P, TP, bench, place } from './landing-kit';

const MK = TP.torpedo;
const BOUNDS = P.bounds;
const WAKE_M = Number(/export const WAKE_DOT_SPACING_M = (\d+)/.exec(readFileSync(new URL('../src/config/ui-config.ts', import.meta.url), 'utf8'))![1]);

/** プールが知らせの前に書く印（stepLandingTorpedoes: 命中は active false・resolved、通り過ぎは resolved。どちらも決着） */
function settled(s: TorpedoState): TorpedoState {
  s.resolved = true;
  return s;
}

describe('R14 A3: 同じステップの斉射は 1 つの出来事・ほかの魚雷が走っている間は外れを言わない', () => {
  /** 2 隻 × 3 本のプールと link（斉射は撃つ前に salvoLeft を書く＝pt-torpedo の salvo() と同じ） */
  function twoSalvos(): { ld: LandingState; link: LandingTorpedoLink; pool: LandingTorpedoPool; st: ReturnType<typeof createPtTorpedoState> } {
    const ld = createLanding(LP);
    const st = createPtTorpedoState(2, 3);
    const pool = new LandingTorpedoPool(MK, 6, BOUNDS, WAKE_M);
    return { ld, link: new LandingTorpedoLink(ld, LP, st, pool), pool, st };
  }
  function salvo(b: ReturnType<typeof twoSalvos>, i: number, kind: number, m: number): void {
    b.st.salvoLeft[i] = 3;
    for (let k = 0; k < 3; k++) b.link.fire(i, 2000 + 500 * i, 2000, 90 + k, false, false, 0, m);
    b.link.onSalvo(i, kind, m, 3);
  }
  it('同じ nowS の同じ種類の 2 斉射は「2 隻・6 本」の 1 つの出来事（最後の PT と距離）。次のステップの斉射・違う種類は足さない', () => {
    const b = twoSalvos();
    b.link.nowS = 52.9;
    salvo(b, 0, PT_SALVO_HURRIED, 1250);
    expect([b.ld.eventKind, b.ld.eventCount, b.ld.eventBoats, b.ld.eventSeq]).toEqual([LE_HURRIED, 3, 1, 1]);
    salvo(b, 1, PT_SALVO_HURRIED, 1180);
    expect([b.ld.eventKind, b.ld.eventBoat, b.ld.eventM, b.ld.eventCount, b.ld.eventBoats, b.ld.eventSeq]).toEqual([LE_HURRIED, 1, 1180, 6, 2, 2]);
    const c = twoSalvos();
    c.link.nowS = 52.9;
    salvo(c, 0, PT_SALVO_HURRIED, 1250);
    c.link.nowS = 52.9 + 1 / 60;
    salvo(c, 1, PT_SALVO_HURRIED, 1180);
    expect([c.ld.eventCount, c.ld.eventBoats]).toEqual([3, 1]);
    const d = twoSalvos();
    salvo(d, 0, PT_SALVO_HURRIED, 1250);
    salvo(d, 1, PT_SALVO_ENGAGED, 850);
    expect([d.ld.eventKind, d.ld.eventCount, d.ld.eventBoats]).toEqual([LE_ENGAGED, 3, 1]);
    // 間に別の出来事が入れば足さない（同じ時計でも）
    const e = twoSalvos();
    salvo(e, 0, PT_SALVO_CALM, 900);
    e.link.onHit(0, 0, 0, settled(e.pool.states[0]!));
    salvo(e, 1, PT_SALVO_CALM, 900);
    expect([e.ld.eventKind, e.ld.eventCount, e.ld.eventBoats]).toEqual([LE_CALM, 3, 1]);
  });
  it('ほかの斉射が走っている間は 1 つの斉射が外れきっても「それた！」を出さない。最後の 1 本の外れで出す（不発の命中があれば不発）', () => {
    const b = twoSalvos();
    salvo(b, 0, PT_SALVO_HURRIED, 1250);
    salvo(b, 1, PT_SALVO_HURRIED, 1180);
    const seq = b.ld.eventSeq;
    for (let k = 0; k < 3; k++) b.link.onMiss(settled(b.pool.states[k]!));
    expect([b.st.salvoLeft[0], b.ld.eventSeq]).toEqual([0, seq]); // 斉射 0 は外れきったが 1 の 3 本が走っている
    b.link.onMiss(settled(b.pool.states[3]!));
    b.link.onMiss(settled(b.pool.states[4]!));
    expect(b.ld.eventSeq).toBe(seq);
    b.link.onMiss(settled(b.pool.states[5]!));
    expect([b.ld.eventKind, b.ld.eventBoat, b.ld.eventSeq]).toEqual([LE_MISS, 1, seq + 1]);
    // 走っているのが同じ斉射の残りでなく別の斉射なら、その斉射の命中は「被雷」のまま（外れの出来事は無い）
    const c = twoSalvos();
    salvo(c, 0, PT_SALVO_CALM, 900);
    salvo(c, 1, PT_SALVO_CALM, 900);
    c.pool.states[0]!.dud = true;
    c.link.onHit(0, 0, 0, settled(c.pool.states[0]!));
    c.link.onMiss(settled(c.pool.states[1]!));
    c.link.onMiss(settled(c.pool.states[2]!));
    expect(c.ld.eventKind).toBe(LE_DUD); // 不発の命中の出来事のまま（斉射の終わりの「不発」は 2 本目の斉射が走るので出さない）
    for (let k = 3; k < 6; k++) c.link.onMiss(settled(c.pool.states[k]!));
    expect([c.ld.eventKind, c.ld.eventBoat]).toEqual([LE_MISS, 1]);
  });
  it('通し: 隊が自艇を捉えたステップに哨戒の 2 隻が慌てて撃つ（R2）→ 出来事は 1 つ「2 隻・6 本」（pt-torpedo の salvo の順のまま）', () => {
    const b = bench();
    const pool = new LandingTorpedoPool(MK, 6, BOUNDS, WAKE_M);
    const link = new LandingTorpedoLink(b.ld, LP, b.st, pool);
    place(b, 0, 1200, 0, 0, PT_ALERT, PT_PATROL);
    place(b, 1, 1250, 90, 0, PT_ALERT, PT_PATROL);
    link.nowS = 50;
    stepPtTorpedoes(b.st, TP, b.q, b.ld, new SeededRng(7), false, 50, FEEL_DT, link, () => {});
    expect(Array.from(b.st.kind)).toEqual([PT_SALVO_HURRIED, PT_SALVO_HURRIED]);
    expect([b.ld.eventKind, b.ld.eventCount, b.ld.eventBoats, b.ld.eventBoat, b.ld.eventSeq]).toEqual([LE_HURRIED, 6, 2, 1, 2]);
  });
});
