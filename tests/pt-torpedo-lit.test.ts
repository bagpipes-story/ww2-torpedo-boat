// 卯月に照らされた米PT の反応（v0.6.10 S2。core/pt-torpedo の ptLitReact。spec-v0610 R-U5・R-U7・リードの決定 LD5・レビュー M1）: 航過は待つ（owner でも。何も書かない）、
// 射点（哨戒・斉射が残る・揚陸中で浮いている・夜明けの前・見失いの待ちの外・慌てる距離 1,300 m・艇首 30°）なら litSalvo を立ててから慌てた斉射（種類は慌てた斉射のまま → 入れ先が
// LE_LIT_SALVO）を撃つ。撃っても去らない（v0.6.10 実機 1 回目。段階・timerS は書かない）。ほかの生きた段階（射点の外・待ち・夜明け・揚陸の後・沈んだ後・斉射なし・警戒〜離脱）は何もしない
// （LIT_NONE。v0.6.10 S2〜S8 は撃たずに去った＝LIT_AWAY・OUT_LIT_AWAY）。乱数（斉射は 1 + 2n + 蛇行の本数・ほかは 0）、PT の欄・隊の欄は書かない、結末（OUT_LIT_HURRIED）。
// 卯月の無い夜（stepPtTorpedoes・link・結末）の模擬の 1 夜の記録（S0b からある 40 の鍵）の md5（ノーマル seed 1〜8・ハード 1〜4 × 15 の遊び方。3 種類の斉射・撃退・撃沈・夜明け・沈没で去るを含む）は
// v0.6.10 実機 2 回目の値（揚陸 140 → 110 秒で実機 1 回目の bb07e79d…・61e64756… から変わった。その前は撃っても去らないので S1（1d5a680）の値から変わった）。S3a で模擬に卯月を入れたので卯月を切って（allyOff）回す。
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { hitLanding, LE_HURRIED, LE_LIT_SALVO, tickLanding } from '../src/core/landing';
import { runLandingTrial } from '../src/core/landing-sim';
import { LANDING_POLICIES } from '../src/core/landing-sim-policy';
import { LandingTorpedoLink, LandingTorpedoPool } from '../src/core/landing-torpedoes';
import { PT_ALERT, PT_BREAK, PT_CHASE, PT_LEAVE, PT_OUT, PT_PASS, PT_PATROL, PT_RUN_IN, PT_SUNK } from '../src/core/pt-boats';
import {
  LIT_NONE, LIT_SALVO, LIT_WAIT, OUT_CALM, OUT_DAWN, OUT_ENGAGED, OUT_GOAL_GONE, OUT_HURRIED, OUT_LEFT, OUT_LIT_HURRIED, OUT_NONE, OUT_RETIRED, OUT_SUNK, PT_SALVO_HURRIED,
  ptLitReact, ptTorpedoOutcome, type PtTorpedoSink,
} from '../src/core/pt-torpedo';
import type { PtTorpedoParams } from '../src/core/pt-torpedo-data';
import { SeededRng } from '../src/core/rng';
import { bearingDeg } from '../src/core/ship-ai';
import { landingSimSetup } from '../src/systems/landing-sim-setup';
import { LP, P, TP, bench, CountingRng, place, stepTorp, type Bench } from './landing-kit';

/** 照らされた PT の反応を 1 回（nowS 50・夜明けの前は既定） */
function react(b: Bench, rng: SeededRng, o: { tp?: PtTorpedoParams; dawn?: boolean; sink?: PtTorpedoSink } = {}): number {
  return ptLitReact(b.st, o.tp ?? TP, b.q, b.ld, 0, rng, 50, o.dawn ?? false, o.sink ?? b.sink);
}
/** PT 0 の欄（ptLitReact は書かない。v0.6.10 実機 1 回目までは phase と timerS を書いた） */
const restOf = (b: Bench): string => JSON.stringify(b.q.boats[0]!);
/** 隊の欄（owner・held・航過・連射）。ptLitReact は触らない */
const sectionOf = (b: Bench): string => JSON.stringify([b.q.owner, Array.from(b.q.held), b.q.passes, b.q.gapLeftS, b.q.lastPassBoat, b.q.lastBurstBoat, b.q.detected]);
/** 雷撃の状態の配列の写し（型付き配列は中身の配列に） */
const stOf = (b: Bench): string => JSON.stringify(b.st, (_k, v: unknown) => (ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v));

describe('値', () => {
  it('LIT_* は 0・1・2、結末の OUT_LIT_HURRIED 9 は前の 9 つと重ならない（10 の OUT_LIT_AWAY は v0.6.10 実機 1 回目に無くした）', () => {
    expect([LIT_WAIT, LIT_SALVO, LIT_NONE]).toEqual([0, 1, 2]);
    expect(OUT_LIT_HURRIED).toBe(9);
    expect(new Set([OUT_NONE, OUT_CALM, OUT_HURRIED, OUT_RETIRED, OUT_SUNK, OUT_DAWN, OUT_LEFT, OUT_GOAL_GONE, OUT_ENGAGED, OUT_LIT_HURRIED]).size).toBe(10);
  });
});

describe('航過は待つ・去った PT は何もしない（LIT_WAIT）', () => {
  it.each([[PT_PASS, true], [PT_PASS, false], [PT_LEAVE, false], [PT_OUT, false], [PT_SUNK, false]] as const)('段階 %i（owner %s）: 何も書かない・引かない・入れ先も onLeave も呼ばない', (ph, owner) => {
    const b = bench();
    place(b, 0, 1000, 90, 0, ph);
    if (owner) b.q.owner = 0;
    const boat0 = JSON.stringify(b.q.boats[0]);
    const sec0 = sectionOf(b);
    const st0 = stOf(b);
    const rng = new CountingRng(3);
    expect(react(b, rng)).toBe(LIT_WAIT);
    expect([JSON.stringify(b.q.boats[0]), sectionOf(b), stOf(b), rng.draws, b.sink.shots.length, b.sink.salvos.length, b.left]).toEqual([boat0, sec0, st0, 0, 0, 0, []]);
  });
});

describe('射点なら照らされた斉射（LIT_SALVO）', () => {
  it('哨戒・1,200 m・艇首が輸送船へ: litSalvo を立ててから慌てた斉射（入れ先は印を見て LE_LIT_SALVO）。去らない（哨戒のまま・onLeave なし）。狙い ±aim × hurried_error_factor、乱数 1 + 2n + 蛇行', () => {
    let erraticSeen = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const b = bench();
      place(b, 0, 1200, 90, 0, PT_PATROL);
      const brg = bearingDeg(b.q.boats[0]!.x, b.q.boats[0]!.y, b.ld.x, b.ld.y);
      const link = new LandingTorpedoLink(b.ld, LP, b.st, new LandingTorpedoPool(TP.torpedo, 6, P.bounds));
      const seen: number[][] = [];
      let erratic = 0;
      const heads: number[] = [];
      const spy: PtTorpedoSink = {
        fire: (i, x, y, h, dud, er, bias, m) => {
          if (er) erratic++;
          heads.push(h);
          link.fire(i, x, y, h, dud, er, bias, m);
        },
        onSalvo: (i, kind, m, n) => {
          seen.push([kind, b.st.litSalvo[i]!, n]);
          link.onSalvo(i, kind, m, n);
        },
      };
      const sec0 = sectionOf(b);
      const rest0 = restOf(b);
      const rng = new CountingRng(seed);
      expect(react(b, rng, { sink: spy })).toBe(LIT_SALVO);
      expect(seen).toEqual([[PT_SALVO_HURRIED, 1, TP.n]]);
      expect([b.ld.eventKind, b.ld.eventBoat, b.ld.eventCount]).toEqual([LE_LIT_SALVO, 0, TP.n]);
      expect([b.st.kind[0], b.st.litSalvo[0], b.st.left[0], b.st.hurriedFired, b.st.launchS[0], b.st.prevPhase[0]]).toEqual([PT_SALVO_HURRIED, 1, 0, TP.n, 50, PT_PATROL]);
      expect([b.q.boats[0]!.phase, b.left, restOf(b), sectionOf(b)]).toEqual([PT_PATROL, [], rest0, sec0]);
      expect(rng.draws).toBe(1 + 2 * TP.n + erratic);
      const err = new SeededRng(seed).nextRange(-TP.aimDeg * TP.hurriedFactor, TP.aimDeg * TP.hurriedFactor);
      expect(heads[1]!).toBeCloseTo(brg + err, 9);
      expect(ptTorpedoOutcome(b.st, b.q, 0)).toBe(OUT_LIT_HURRIED);
      erraticSeen += erratic;
    }
    expect(erraticSeen).toBeGreaterThan(0);
  });
  it('印の無い慌てた斉射（接触の瞬間。stepPtTorpedoes）は LE_HURRIED・OUT_HURRIED のまま', () => {
    const b = bench();
    place(b, 0, 1200, 90, 0, PT_ALERT, PT_PATROL);
    const link = new LandingTorpedoLink(b.ld, LP, b.st, new LandingTorpedoPool(TP.torpedo, 6, P.bounds));
    stepTorpLink(b, link);
    expect([b.st.kind[0], b.st.litSalvo[0], b.ld.eventKind, ptTorpedoOutcome(b.st, b.q, 0)]).toEqual([PT_SALVO_HURRIED, 0, LE_HURRIED, OUT_HURRIED]);
  });
  it('境目: 1,299.9 m は撃つ・1,301 m は何もしない、艇首 ±30° は撃つ・30.5° は何もしない、hurried_max_m 0 なら何もしない（慌てた斉射と同じ距離と艇首の検査）', () => {
    const off: PtTorpedoParams = { ...TP, hurriedM: 0, hurried2: 0 };
    for (const [d, deg, tp, want] of [[1299.9, 0, TP, LIT_SALVO], [1301, 0, TP, LIT_NONE], [800, 30, TP, LIT_SALVO], [800, -30, TP, LIT_SALVO], [800, 30.5, TP, LIT_NONE], [800, -30.5, TP, LIT_NONE], [800, 0, off, LIT_NONE]] as const) {
      const b = bench();
      place(b, 0, d, 45, deg, PT_PATROL);
      expect(react(b, new SeededRng(1), { tp }), `${d} m ${deg}°`).toBe(want);
    }
  });
});

describe('ほかの生きた段階は何もしない（LIT_NONE。v0.6.10 実機 1 回目。前は撃たずに去った）', () => {
  const cases: readonly [string, (b: Bench) => void, number, boolean][] = [
    ['見失いの後の待ち', (b) => { b.st.holdS[0] = 3; }, PT_PATROL, false],
    ['夜明けの後', () => {}, PT_PATROL, true],
    ['揚陸の後', (b) => { tickLanding(b.ld, LP, LP.unloadS); }, PT_PATROL, false],
    ['輸送船が沈んだ後', (b) => { hitLanding(b.ld, LP, 10); hitLanding(b.ld, LP, 11); }, PT_PATROL, false],
    ['斉射が残っていない', (b) => { b.st.left[0] = 0; }, PT_PATROL, false],
    ['警戒', () => {}, PT_ALERT, false],
    ['突撃', () => {}, PT_RUN_IN, false],
    ['追撃', () => {}, PT_CHASE, false],
    ['離脱', () => {}, PT_BREAK, false],
  ];
  it.each(cases)('%s: 去らない（PT の欄・雷撃の状態・隊の欄に触らない）・onLeave なし・引かない・撃たない・結末は付かない', (_name, set, ph, dawn) => {
    const b = bench();
    place(b, 0, 1000, 90, 0, ph);
    set(b);
    const rest0 = restOf(b);
    const sec0 = sectionOf(b);
    const st0 = stOf(b);
    const rng = new CountingRng(9);
    expect(react(b, rng, { dawn })).toBe(LIT_NONE);
    expect([b.q.boats[0]!.phase, b.left, rng.draws, b.sink.shots.length, b.sink.salvos.length]).toEqual([ph, [], 0, 0, 0]);
    expect([restOf(b), sectionOf(b), stOf(b)]).toEqual([rest0, sec0, st0]);
    expect(ptTorpedoOutcome(b.st, b.q, 0)).not.toBe(OUT_LIT_HURRIED);
  });
});

describe('卯月の無い夜の 1 夜の記録（LD5・G6。v0.6.10 実機 1 回目に値が変わった: 撃っても去らない）', () => {
  /** 模擬の 1 夜の記録の S0b からある鍵（S3 で足す卯月の鍵は見ない） */
  const KEYS = [
    'end', 'timeS', 'dawn', 'phase', 'pct', 'hits', 'duds', 'sunkAfterDone', 'resolvedS', 'fuelCallS', 'ringEarly', 'hpLost', 'playerHits', 'fuelPct', 'detectS', 'contacts', 'lostContacts',
    'gunShots', 'gunHits', 'ptRetired', 'ptSunk', 'reportS', 'nearReportS', 'outcome', 'kind', 'launchS', 'launchM', 'arrived', 'arrivedHits', 'arrivedDuds', 'potHits', 'potDuds', 'relevant',
    'i1LeadS', 'i2LeadS', 'afterDawnSalvos', 'maxSalvosPerPt', 'draws26', 'drawsWant', 'unresolvedAtDawn',
  ] as const;
  const snap = (r: object): string => JSON.stringify(r, (_k, v: unknown) => (ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v));
  it.each([[false, 8, '397066316d8a0f92a4da8fa84753bdb5'], [true, 4, '41a42277ac6f3928903345080cd667eb']] as const)('ハード %s: seed 1〜%i × 15 の遊び方の 1 夜の記録の md5 は v0.6.10 実機 2 回目の値（揚陸 110 秒）', (hard, seeds, want) => {
    const s = landingSimSetup(gameData, 'jp_04', { hard, allyOff: true });
    expect('allyDestroyer' in s).toBe(false);
    const h = createHash('md5');
    const kinds = new Set<number>();
    for (let seed = 1; seed <= seeds; seed++) {
      for (const pol of LANDING_POLICIES) {
        const r = runLandingTrial(s, pol, seed) as unknown as Record<string, unknown>;
        for (const k of KEYS) expect(k in r, k).toBe(true);
        const o: Record<string, unknown> = {};
        for (const k of KEYS) o[k] = r[k];
        h.update(snap(o));
        for (const k of r['kind'] as Uint8Array) kinds.add(k);
      }
    }
    expect([...kinds].sort()).toEqual([0, 1, 2, 3]); // 気づかれていない・慌てた・戦いながらの斉射がみな入っている
    expect(h.digest('hex')).toBe(want);
  });
});

/** 1 ステップの雷撃を本物の link へ */
function stepTorpLink(b: Bench, link: LandingTorpedoLink): void {
  stepTorp(b, new SeededRng(4), { nowS: 20 });
  for (const s of b.sink.shots) link.fire(s.i, s.x, s.y, s.h, s.dud, s.erratic, s.bias, s.m);
  for (const v of b.sink.salvos) link.onSalvo(v.i, v.kind, v.m, v.n);
}
