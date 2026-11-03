// 卯月の砲・手柄・照らされた PT の反応（v0.6.10 S2。core/ally-destroyer。spec-v0610 R-U4・R-U5・R-U7・R-U8・リードの決定 LD5・LD8）: seed+28 は 1 発 2 回と生きた PT への命中 1 回だけ
// （draws28 = 2 × 弾 + 生きた PT への命中）、生きていない PT への着弾は外れ（hitPt を呼ばない・引かない）、12 cm の 1 命中は u で決まる（u < 0.10 撃沈・その上の死傷・ほかは HP 60 で撃退）、
// 25 mm は米PT の値のまま、手柄は隼艇の形（命中・出来事は hitPt の前後の差＝noteGunboatGun と同じ、結末が変わった PT だけ FATE_BY_ALLY。gunboatFates の by で数える）、
// 照らされて light_react_s の後に 1 回だけ反応（射点の哨戒は LE_LIT_SALVO で撃っても去らない・ほかの生きた段階は何もしない・航過は待って owner を去らせない。v0.6.10 実機 1 回目に撃たずに去る LE_LIT_AWAY を無くした）。
import { describe, expect, it } from 'vitest';
import { LE_LIT_SALVO } from '../src/core/landing';
import { PT_BREAK, PT_FATE_CREW, PT_FATE_HULL, PT_FATE_NONE, PT_FATE_SUNK, PT_LEAVE, PT_PASS, PT_PATROL, PT_SUNK } from '../src/core/pt-boats';
import { hitPt, PT_GUN_EV_SUNK } from '../src/core/pt-damage';
import { OUT_NONE, PT_SALVO_HURRIED, ptTorpedoOutcome } from '../src/core/pt-torpedo';
import { bearingDeg } from '../src/core/ship-ai';
import { createGunboatCredit, FATE_BY_ALLY, FATE_BY_PLAYER, gunboatFates, noteGunboatGun, type GunboatCredit } from '../src/systems/gunboat-credit';
import { A, allyBench, atAlly, EXACT, FixedRng, QUIET, stepAlly, stepUntil, type AllyBench } from './ally-kit';
import { FEEL_DT, P, TP } from './landing-kit';

/** 卯月の東寄り（方位 95°）に止まった PT を気づいた PT として置く（点灯の遅れの後すぐ光の中） */
function sitting(b: AllyBench, distM: number, phase: number, owner = false): void {
  atAlly(b, 0, distM, 95, 0, 0, phase);
  b.a.spotted[0] = 1;
  if (owner) b.q.owner = 0;
}
const trues = (b: AllyBench): [number, boolean][] => b.fx.impacts.filter(([, h]) => h);

describe('砲（seed+28。R-U4）', () => {
  it('600 m の航過の PT（owner。撃退されても生きたまま）を 30 秒: 撃った弾ごとに 2 回・生きた PT への命中ごとに 1 回（draws28 = 2 × 弾 + 命中）、手柄の命中は hitPt の数', () => {
    const b = allyBench();
    sitting(b, 600, PT_PASS, true);
    const cr2 = createGunboatCredit(P.count);
    for (let k = 0; k < 1800; k++) {
      const [h0, s0, e0] = [b.q.gunHits, b.q.suppressions, b.q.gunEventSeq];
      stepAlly(b);
      noteGunboatGun(cr2, b.q, h0, s0, e0);
    }
    expect(b.a.shells).toBeGreaterThan(5);
    expect(b.a.liveHits).toBeGreaterThan(0);
    expect(b.rng28.draws).toBe(2 * b.a.shells + b.a.liveHits);
    expect([b.a.credit.hits, b.a.credit.suppressions, b.a.credit.eventSeq]).toEqual([cr2.hits, cr2.suppressions, cr2.eventSeq]);
    expect([b.a.credit.hits, b.q.gunHits]).toEqual([b.a.liveHits, b.a.liveHits]);
    expect(b.fx.fires.length).toBe(b.a.shells);
    for (const [, x, y] of b.fx.fires) expect([x, y]).toEqual([A.x, A.y]);
    expect(trues(b).length).toBe(b.a.liveHits);
    const cr: GunboatCredit = b.a.credit; // 隼艇の手柄と同じ形
    expect(cr.fateBy.length).toBe(P.count);
  });
  it('生きていない PT への着弾は外れ（hitPt を呼ばない・引かない）。去った PT を追う弾は追う弾に数える', () => {
    const b = allyBench({ p: EXACT });
    sitting(b, 600, PT_PASS);
    expect(stepUntil(b, () => b.a.shells > 0)).toBeGreaterThan(0);
    const boat = b.q.boats[0]!;
    boat.phase = PT_LEAVE;
    const [hits0, hp0] = [b.q.gunHits, boat.hp];
    stepAlly(b, 180);
    expect(b.fx.impacts.length).toBeGreaterThan(0);
    expect([trues(b), b.q.gunHits, boat.hp, boat.fate, b.a.liveHits, b.rng28.draws]).toEqual([[], hits0, hp0, PT_FATE_NONE, 0, 2 * b.a.shells]);
    expect(b.a.chaseShells).toBeGreaterThan(0);
    // 同じ場面で去らなければ、ばらつき 0 の弾は当たる（外れは生きていないから）
    const c = allyBench({ p: EXACT });
    sitting(c, 600, PT_PASS, true);
    stepUntil(c, () => c.fx.impacts.length > 0);
    expect(c.fx.impacts[0]![1]).toBe(true);
  });
  it.each([[0.05, PT_FATE_SUNK, PT_SUNK, 100 - 40], [0.11, PT_FATE_CREW, PT_LEAVE, 60], [0.5, PT_FATE_HULL, PT_LEAVE, 60]] as const)('12 cm の 1 命中は u = %f で結末 %i（u < 0.10 撃沈・< 0.13 死傷・ほかは HP 60 ≤ 60 で撃退）。手柄は FATE_BY_ALLY', (u, fate, phase, hp) => {
    const b = allyBench({ p: EXACT, rng28: new FixedRng(u) });
    sitting(b, 1300, PT_PASS); // 25 mm の有効射程 1,200 m の外: 12 cm だけ
    expect(stepUntil(b, () => b.a.liveHits === 1)).toBeGreaterThan(0);
    const boat = b.q.boats[0]!;
    expect([boat.fate, boat.phase, boat.hp, trues(b)]).toEqual([fate, phase, hp, [[0, true]]]);
    for (const [gi] of b.fx.fires) expect(gi).toBe(A.sinkGunIndex);
    expect([b.a.credit.fateBy[0], b.a.credit.hits, b.a.credit.eventSeq, b.q.gunEventSeq, b.a.sunk, b.a.retired]).toEqual([FATE_BY_ALLY, 1, 1, 1, fate === PT_FATE_SUNK ? 1 : 0, fate === PT_FATE_SUNK ? 0 : 1]);
    if (fate === PT_FATE_SUNK) expect(b.q.gunEvent).toBe(PT_GUN_EV_SUNK);
    expect(b.rng28.draws).toBe(2 * b.a.shells + 1);
    expect(gunboatFates(b.q, b.a.credit, FATE_BY_ALLY)).toEqual({ retired: b.a.retired, sunk: b.a.sunk });
    expect(gunboatFates(b.q, b.a.credit)).toEqual({ retired: 0, sunk: 0 }); // 既定は隼艇（前の呼び方のまま）
  });
  it('25 mm の命中は米PT の値のまま（u 0.05 は fire 0.003 + 死傷 0.03 の上＝結末なし・HP 96、手柄の fateBy は書かない）、その後の 12 cm（写し 0.10）で撃沈', () => {
    const b = allyBench({ p: EXACT, rng28: new FixedRng(0.05) });
    sitting(b, 600, PT_PASS, true);
    stepUntil(b, () => b.a.liveHits === 1);
    const boat = b.q.boats[0]!;
    expect([trues(b), boat.fate, boat.hp, b.a.credit.fateBy[0], b.a.credit.hits]).toEqual([[[1, true]], PT_FATE_NONE, 96, 0, 1]);
    stepUntil(b, () => boat.fate !== PT_FATE_NONE);
    expect([trues(b).at(-1), boat.fate, b.a.credit.fateBy[0], b.a.sunk]).toEqual([[0, true], PT_FATE_SUNK, FATE_BY_ALLY, 1]);
  });
  it('自艇が撃退した航過の PT（fateBy 自艇）を卯月の 12 cm が沈めれば FATE_BY_ALLY に（結末が変わった砲）。撃退の数は増えない', () => {
    const b = allyBench({ p: EXACT, rng28: new FixedRng(0.05) });
    sitting(b, 1300, PT_PASS, true);
    expect(hitPt(b.q, P, 0, 4, 0.02, b.ev)).toBe(PT_FATE_CREW); // 自艇の 25mm の死傷（航過は抜けるまで続く）
    b.a.credit.fateBy[0] = FATE_BY_PLAYER;
    expect(b.q.boats[0]!.phase).toBe(PT_PASS);
    stepUntil(b, () => b.a.liveHits === 1);
    expect([b.q.boats[0]!.fate, b.a.credit.fateBy[0], b.a.sunk, b.a.retired]).toEqual([PT_FATE_SUNK, FATE_BY_ALLY, 1, 0]);
  });
  it('演出が無く（模擬の null）ても同じに回る', () => {
    const b = allyBench({ fx: false });
    sitting(b, 600, PT_PASS, true);
    stepAlly(b, 600);
    expect([b.a.shells > 0, b.fx.fires.length, b.rng28.draws]).toEqual([true, 0, 2 * b.a.shells + b.a.liveHits]);
  });
});

describe('照らされた PT の反応（R-U5・R-U7）', () => {
  /** 輸送船から約 1,180 m・艇首を輸送船へ向けて止まった PT（卯月から方位 103°・545 m）を気づいた PT に（砲は撃たない） */
  function inPosition(phase: number, owner = false): AllyBench {
    const b = allyBench({ p: QUIET });
    const pt = b.q.boats[0]!;
    pt.x = 4150;
    pt.y = 2500;
    pt.headingDeg = bearingDeg(pt.x, pt.y, b.ld.x, b.ld.y);
    pt.speedMps = 0;
    pt.phase = phase;
    b.st.prevPhase[0] = phase;
    b.a.spotted[0] = 1;
    if (owner) b.q.owner = 0;
    return b;
  }
  it('射点の哨戒: 照らされて 1.0 秒で照らされた斉射（LE_LIT_SALVO・3 本・seed+26 から 1 + 2n + 蛇行）→ 去らずに哨戒のまま（v0.6.10 実機 1 回目）。反応は 1 回', () => {
    const b = inPosition(PT_PATROL);
    const k = stepUntil(b, () => b.a.reacted[0] === 1);
    expect(k).toBeGreaterThan(Math.round((A.gunnery.searchlight.onDelayS + A.lightReactS) / FEEL_DT) - 2);
    expect(b.a.litS).toBeGreaterThanOrEqual(A.lightReactS);
    expect(b.a.litS).toBeLessThan(A.lightReactS + 1.5 * FEEL_DT);
    expect([b.a.litSalvos, b.st.kind[0], b.st.litSalvo[0], b.st.left[0], b.ld.eventKind, b.ld.eventCount, b.q.boats[0]!.phase, b.left]).toEqual([1, PT_SALVO_HURRIED, 1, 0, LE_LIT_SALVO, TP.n, PT_PATROL, []]);
    expect(b.pool.states.filter((s) => s.active).length).toBe(TP.n);
    expect([1 + 2 * TP.n, 2 + 2 * TP.n]).toContain(b.rng26.draws);
    stepAlly(b);
    expect([b.a.target, b.a.chasing]).toEqual([0, false]); // 去らないので追い撃ちでなく生きた PT を照らし続ける
    stepAlly(b, 300);
    expect([b.a.litSalvos, b.st.salvos]).toEqual([1, 1]);
  });
  it('戦っている PT（離脱）は照らされても何もしない（去らない・引かない・出来事なし・結末は付かない）。光と砲はその PT に', () => {
    const b = inPosition(PT_BREAK);
    stepUntil(b, () => b.a.reacted[0] === 1);
    expect([b.a.litSalvos, b.ld.eventKind, b.q.boats[0]!.phase, b.left, b.rng26.draws, ptTorpedoOutcome(b.st, b.q, 0)]).toEqual([0, 0, PT_BREAK, [], 0, OUT_NONE]);
    expect(b.a.target).toBe(0);
  });
  it('夜明けの後の射点の哨戒は撃たない（去らない・引かない）', () => {
    const b = inPosition(PT_PATROL);
    for (let k = 0; k < 600 && b.a.reacted[0] === 0; k++) stepAlly(b, 1, true);
    expect([b.a.reacted[0], b.a.litSalvos, b.rng26.draws, b.ld.eventKind, b.q.boats[0]!.phase]).toEqual([1, 0, 0, 0, PT_PATROL]);
  });
  it('航過（owner）は照らされても待つ（去らせない・引かない）。航過を抜けて離脱になった次のステップに反応済み（何もしない）', () => {
    const b = inPosition(PT_PASS, true);
    stepAlly(b, 300);
    expect([b.a.reacted[0], b.q.boats[0]!.phase, b.q.owner, b.rng26.draws, b.a.litSalvos, b.left]).toEqual([0, PT_PASS, 0, 0, 0, []]);
    expect(b.a.litS).toBeGreaterThan(A.lightReactS);
    b.q.owner = -1;
    b.q.boats[0]!.phase = PT_BREAK;
    stepAlly(b);
    expect([b.a.reacted[0], b.q.boats[0]!.phase, b.ld.eventKind]).toEqual([1, PT_BREAK, 0]);
  });
  it('照らされていない間（点灯の遅れ）は照らされた秒が進まない・扇の外で気づいていない PT は照らさない', () => {
    const b = inPosition(PT_PATROL);
    stepAlly(b, Math.floor(A.gunnery.searchlight.onDelayS / FEEL_DT) - 2);
    expect([b.a.litS, b.a.reacted[0]]).toEqual([0, 0]);
    const c = inPosition(PT_PATROL);
    c.a.spotted[0] = 0;
    stepAlly(c, 600);
    expect([c.a.target, c.a.reacted[0], c.a.candSteps]).toEqual([-1, 0, 0]); // 止まった PT（遅い）は 545 m で遅い見張り 350 m の外
  });
});
