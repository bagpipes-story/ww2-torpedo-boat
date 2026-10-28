// 戦いながらの斉射（v0.6.9 S4a。core/pt-torpedo。spec-v069 R12）: 自艇と戦っている PT（警戒・突撃・追撃・離脱）が、揚陸中の輸送船から launch_range_m の内で艇首が
// launch_heading_tol_deg 以内なら、狙いの誤差 × engaged_error_factor で 1 回だけ撃ち、段階を変えない（PT の欄も隊の owner・held も書かない・onLeave も無い）。
// 航過・去る・海域の外・沈んだ・撃退は撃たない。engaged_error_factor 0 で無し。夜明けの後・揚陸の決着（揚陸完了・沈没）の後は撃たない。見失いの reacquire_s は掛けない。
// 接触の瞬間に慌てた斉射の条件も満たせば慌てた斉射（去る）。乱数は同じ +26 の順（狙い 1 → 1 本ごとに不発 → 蛇行 → [偏差]）。
import { describe, expect, it } from 'vitest';
import { hitLanding, tickLanding, LD_DONE } from '../src/core/landing';
import { PT_ALERT, PT_BREAK, PT_CHASE, PT_FATE_CREW, PT_FATE_HULL, PT_LEAVE, PT_OUT, PT_PASS, PT_PATROL, PT_RUN_IN, PT_SUNK } from '../src/core/pt-boats';
import { OUT_ENGAGED, PT_SALVO_CALM, PT_SALVO_ENGAGED, PT_SALVO_HURRIED, ptTorpedoOutcome } from '../src/core/pt-torpedo';
import type { PtTorpedoParams } from '../src/core/pt-torpedo-data';
import { SeededRng } from '../src/core/rng';
import { fillSalvoHeadings } from '../src/core/salvo';
import { bearingDeg } from '../src/core/ship-ai';
import { FEEL_DT, LP, TP, bench, CountingRng, place, stepTorp, type Bench } from './landing-kit';

const ENGAGED = [PT_ALERT, PT_RUN_IN, PT_CHASE, PT_BREAK] as const;
const brgToShip = (b: Bench, i: number): number => bearingDeg(b.q.boats[i]!.x, b.q.boats[i]!.y, b.ld.x, b.ld.y);
/** PT と隊の、雷撃が書いてはいけない欄（PT の全部・owner・held・待ち・航過の数え） */
const ptState = (b: Bench): string => JSON.stringify([b.q.boats.map((x) => ({ ...x })), b.q.owner, Array.from(b.q.held), b.q.gapLeftS, b.q.passes, b.q.lastPassBoat, b.q.detected]);

describe('戦いながらの斉射（R12）: 撃つ段階・距離・艇首', () => {
  it.each(ENGAGED)('段階 %i で 900 m の内・艇首が輸送船へ: 3 本を撃ち、段階・timerS・owner・held・追撃の状態はそのまま（onLeave なし）', (ph) => {
    const b = bench();
    place(b, 0, 850, 30, 6, ph);
    const pt = b.q.boats[0]!;
    pt.timerS = 3.25;
    pt.lockDeg = 123;
    pt.side = -1;
    pt.passes = 2;
    pt.bursts = 1;
    b.q.owner = 1;
    b.q.held[0] = 1;
    const before = ptState(b);
    stepTorp(b, new SeededRng(4), { nowS: 47.5 });
    expect(b.sink.salvos).toEqual([{ i: 0, kind: PT_SALVO_ENGAGED, m: expect.closeTo(850, 6), n: 3 }]);
    expect(ptState(b)).toBe(before);
    expect(b.left).toEqual([]);
    expect([b.st.left[0], b.st.kind[0], b.st.launchS[0], b.st.salvos, b.st.fired, b.st.hurriedFired, b.st.engagedFired, b.st.lastKind, b.st.prevPhase[0]]).toEqual([0, PT_SALVO_ENGAGED, 47.5, 1, 3, 0, 3, PT_SALVO_ENGAGED, ph]);
    expect(ptTorpedoOutcome(b.st, b.q, 0)).toBe(OUT_ENGAGED);
  });
  it('距離の境目（899.99 m は撃つ・901 m は撃たない）と艇首の境目（30° は撃つ・30.5° は撃たない。左右とも）', () => {
    for (const ph of ENGAGED) {
      for (const [d, off, fire] of [[899.99, 0, true], [901, 0, false], [800, 30, true], [800, -30, true], [800, 30.5, false], [800, -30.5, false], [500, 180, false]] as const) {
        const b = bench();
        place(b, 0, d, 45, off, ph);
        const rng = new CountingRng(1);
        stepTorp(b, rng);
        expect([b.sink.shots.length, rng.draws > 0], `段階 ${ph} ${d} m ${off}°`).toEqual([fire ? 3 : 0, fire]);
      }
    }
  });
  it('航過・去る・海域の外・沈んだは撃たない。撃退された（fate）PT も撃たない', () => {
    for (const ph of [PT_PASS, PT_LEAVE, PT_OUT, PT_SUNK]) {
      const b = bench();
      place(b, 0, 600, 0, 0, ph);
      const rng = new CountingRng(2);
      stepTorp(b, rng);
      expect([b.sink.shots.length, rng.draws], `段階 ${ph}`).toEqual([0, 0]);
    }
    for (const fate of [PT_FATE_CREW, PT_FATE_HULL]) {
      const b = bench();
      place(b, 0, 600, 0, 0, PT_RUN_IN);
      b.q.boats[0]!.fate = fate;
      stepTorp(b, new SeededRng(2));
      expect(b.sink.shots.length, `fate ${fate}`).toBe(0);
    }
  });
  it('狙い: 中央の 1 本は輸送船の中心への方位 + 誤差（±aim_error_deg × engaged_error_factor。1 斉射に 1 回）', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const b = bench();
      place(b, 0, 700, 300, 4, PT_CHASE);
      const brg = brgToShip(b, 0);
      stepTorp(b, new SeededRng(seed));
      const a = TP.aimDeg * TP.engagedFactor;
      const err = new SeededRng(seed).nextRange(-a, a);
      expect(b.sink.shots[1]!.h).toBeCloseTo(brg + err, 9);
      expect(Math.abs(b.sink.shots[1]!.h - brg)).toBeLessThanOrEqual(a);
    }
    const wide = bench();
    place(wide, 0, 700, 300, 4, PT_CHASE);
    stepTorp(wide, new SeededRng(3), { tp: { ...TP, engagedFactor: 1.5 } });
    expect(wide.sink.shots[1]!.h).toBeCloseTo(brgToShip(wide, 0) + new SeededRng(3).nextRange(-TP.aimDeg * 1.5, TP.aimDeg * 1.5), 9);
  });
  it('同じステップに 2 隻とも撃つ（どちらも戦い続ける）', () => {
    const b = bench();
    place(b, 0, 800, 0, 0, PT_RUN_IN);
    place(b, 1, 880, 90, -12, PT_BREAK);
    stepTorp(b, new SeededRng(5));
    expect(b.sink.salvos.map((s) => [s.i, s.kind])).toEqual([[0, PT_SALVO_ENGAGED], [1, PT_SALVO_ENGAGED]]);
    expect([b.q.boats[0]!.phase, b.q.boats[1]!.phase, b.left]).toEqual([PT_RUN_IN, PT_BREAK, []]);
  });
});

describe('1 隻 1 回・切る・夜明け・決着', () => {
  it('1 隻 1 回: 撃った PT はそのまま戦い続けても、哨戒に戻っても、もう撃たない（乱数も引かない）', () => {
    const b = bench();
    place(b, 0, 800, 0, 0, PT_RUN_IN);
    const rng = new CountingRng(6);
    stepTorp(b, rng);
    const draws = rng.draws;
    for (let k = 0; k < 1000; k++) stepTorp(b, rng);
    place(b, 0, 600, 0, 0, PT_PATROL, PT_PATROL);
    for (let k = 0; k < 1000; k++) stepTorp(b, rng);
    expect([b.sink.shots.length, b.st.salvos, rng.draws]).toEqual([3, 1, draws]);
  });
  it('engaged_error_factor 0 なら戦いながらの斉射は無い（どの段階でも 0 回引く。気づかれていない・慌てた斉射はそのまま）', () => {
    const off: PtTorpedoParams = { ...TP, engagedFactor: 0 };
    for (const ph of ENGAGED) {
      const b = bench();
      place(b, 0, 600, 0, 0, ph);
      const rng = new CountingRng(7);
      for (let k = 0; k < 600; k++) stepTorp(b, rng, { tp: off });
      expect([b.sink.shots.length, rng.draws, b.q.boats[0]!.phase], `段階 ${ph}`).toEqual([0, 0, ph]);
    }
    const c = bench();
    place(c, 0, 850, 0, 0, PT_PATROL);
    place(c, 1, 1200, 90, 0, PT_ALERT, PT_PATROL);
    stepTorp(c, new SeededRng(7), { tp: off });
    expect(c.sink.salvos.map((s) => s.kind)).toEqual([PT_SALVO_CALM, PT_SALVO_HURRIED]);
  });
  it('夜明けの後は撃たない', () => {
    for (const ph of ENGAGED) {
      const b = bench();
      place(b, 0, 600, 0, 0, ph);
      const rng = new CountingRng(8);
      stepTorp(b, rng, { dawn: true });
      expect([b.sink.shots.length, rng.draws], `段階 ${ph}`).toEqual([0, 0]);
    }
  });
  it('揚陸の決着の後は撃たない: 揚陸完了（まだ浮いている。哨戒の PT の気づかれていない斉射は撃つ）・沈没', () => {
    const done = bench();
    tickLanding(done.ld, LP, LP.unloadS);
    expect([done.ld.phase, done.ld.afloat]).toEqual([LD_DONE, true]);
    place(done, 0, 600, 0, 0, PT_RUN_IN);
    place(done, 1, 850, 90, 0, PT_PATROL);
    stepTorp(done, new SeededRng(9));
    expect(done.sink.salvos.map((s) => [s.i, s.kind])).toEqual([[1, PT_SALVO_CALM]]);
    expect(done.q.boats[0]!.phase).toBe(PT_RUN_IN);
    const sunk = bench();
    for (let k = 0; k < LP.hitsToSink; k++) hitLanding(sunk.ld, LP, 30);
    for (const ph of ENGAGED) {
      place(sunk, 0, 600, 0, 0, ph);
      const rng = new CountingRng(9);
      stepTorp(sunk, rng);
      expect([sunk.sink.shots.length, rng.draws, sunk.q.boats[0]!.phase, sunk.st.goalGone[0]], `段階 ${ph}`).toEqual([0, 0, ph, 0]);
    }
  });
});

describe('接触の瞬間・見失いの待ち', () => {
  it('哨戒 → 警戒のステップは慌てた斉射が先（去る）。慌てた斉射なし（hurried_max_m 0）なら戦いながら撃って警戒のまま', () => {
    const b = bench();
    place(b, 0, 850, 0, 0, PT_ALERT, PT_PATROL);
    stepTorp(b, new SeededRng(3));
    expect([b.sink.salvos.map((s) => s.kind), b.q.boats[0]!.phase]).toEqual([[PT_SALVO_HURRIED], PT_LEAVE]);
    const c = bench();
    place(c, 0, 850, 0, 0, PT_ALERT, PT_PATROL);
    stepTorp(c, new SeededRng(3), { tp: { ...TP, hurriedM: 0, hurried2: 0 } });
    expect([c.sink.salvos.map((s) => s.kind), c.q.boats[0]!.phase, c.left]).toEqual([[PT_SALVO_ENGAGED], PT_ALERT, []]);
  });
  it('見失いの待ち（reacquire_s）は掛けない: 哨戒に戻った PT が待ちの間にまた戦えば 900 m の内で撃つ（慌てた・気づかれていない斉射は待つ）', () => {
    const b = bench();
    place(b, 0, 1100, 0, 0, PT_PATROL, PT_RUN_IN);
    const rng = new SeededRng(4);
    stepTorp(b, rng);
    expect(b.st.holdS[0]).toBeGreaterThan(TP.reacquireS - 2 * FEEL_DT);
    place(b, 0, 850, 0, 0, PT_ALERT, PT_PATROL); // 待ちの間に接触: 慌てた斉射は待つが、戦いながらの斉射は撃つ
    stepTorp(b, rng);
    expect([b.sink.salvos.map((s) => s.kind), b.q.boats[0]!.phase]).toEqual([[PT_SALVO_ENGAGED], PT_ALERT]);
  });
});

describe('乱数（seed+26。D18・I5）', () => {
  it('撃てない戦う PT（遠い・外を向く）だけのステップは引かない（10,000 ステップ）', () => {
    const b = bench();
    place(b, 0, 950, 0, 0, PT_RUN_IN);
    place(b, 1, 500, 90, 45, PT_CHASE);
    const rng = new CountingRng(8);
    for (let k = 0; k < 10000; k++) stepTorp(b, rng, { nowS: k * FEEL_DT });
    expect([rng.draws, b.sink.shots.length]).toEqual([0, 0]);
  });
  it('斉射は 1 + 2n + 蛇行の本数を、狙い → 1 本ごとに不発 → 蛇行 → [偏差]（気づかれていない・慌てた斉射と同じ順）', () => {
    const tp: PtTorpedoParams = { ...TP, reliability: { dud: 0.5, erratic: 0.5 } };
    let erraticSeen = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const b = bench(undefined, tp);
      place(b, 0, 820, 135, 7, PT_RUN_IN);
      const brg = brgToShip(b, 0);
      const rng = new CountingRng(seed);
      stepTorp(b, rng, { tp });
      const twin = new SeededRng(seed);
      const hs: number[] = [0, 0, 0];
      const a = tp.aimDeg * tp.engagedFactor;
      fillSalvoHeadings(brg + twin.nextRange(-a, a), tp.n, tp.spacingDeg * (tp.n - 1), hs);
      let erratic = 0;
      for (let k = 0; k < tp.n; k++) {
        const s = b.sink.shots[k]!;
        const dud = twin.chance(0.5);
        const er = twin.chance(0.5);
        const bias = er ? twin.nextRange(-tp.jitterDeg, tp.jitterDeg) : 0;
        if (er) erratic++;
        expect([s.dud, s.erratic, s.bias, s.h]).toEqual([dud, er, bias, hs[k]]);
      }
      expect(rng.draws).toBe(1 + 2 * tp.n + erratic);
      erraticSeen += erratic;
    }
    expect(erraticSeen).toBeGreaterThan(0);
  });
});
