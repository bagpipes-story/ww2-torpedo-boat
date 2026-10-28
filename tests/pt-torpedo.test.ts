// 米PT の雷撃の規則（v0.6.9 S2。core/pt-torpedo。spec-v069 §4.2・§9・R2・R8/F11）: 気づかれていない斉射（哨戒・900 m・艇首 30°・1 隻 1 回 → 去る）、
// 慌てた斉射（接触の瞬間に哨戒から警戒になった PT はみな・1,300 m・見つけたかは問わない（R2）・hurried_max_m 0 で無し）、見失いの後の reacquire_s、夜明け、
// 輸送船が沈めば哨戒の PT は去る（OUT_GOAL_GONE。F11）、乱数（斉射の無いステップは 0 回・斉射は 1 + 2n + 蛇行の本数を launcher と同じ順）、owner・held に触らない、結末の符号。
// 戦いながらの斉射（R12）は tests/pt-torpedo-engaged。
import { describe, expect, it } from 'vitest';
import { hitLanding } from '../src/core/landing';
import { PT_ALERT, PT_BREAK, PT_CHASE, PT_FATE_CREW, PT_FATE_HULL, PT_FATE_SUNK, PT_LEAVE, PT_OUT, PT_PASS, PT_PATROL, PT_RUN_IN, PT_SUNK } from '../src/core/pt-boats';
import {
  OUT_CALM, OUT_DAWN, OUT_ENGAGED, OUT_GOAL_GONE, OUT_HURRIED, OUT_LEFT, OUT_NONE, OUT_RETIRED, OUT_SUNK, PT_SALVO_CALM, PT_SALVO_ENGAGED, PT_SALVO_HURRIED, PT_TORPEDO_SEED_OFFSET, ptTorpedoOutcome,
} from '../src/core/pt-torpedo';
import type { PtTorpedoParams } from '../src/core/pt-torpedo-data';
import { SeededRng } from '../src/core/rng';
import { fillSalvoHeadings } from '../src/core/salvo';
import { bearingDeg } from '../src/core/ship-ai';
import { FEEL_DT, LP, TP, bench, CountingRng, place, stepTorp, type Bench } from './landing-kit';

const brgToShip = (b: Bench, i: number): number => bearingDeg(b.q.boats[i]!.x, b.q.boats[i]!.y, b.ld.x, b.ld.y);

describe('雷撃の値（jp_04。data のまま）', () => {
  it('Mk 13・900 m・30°・3 本・8°・±10°・1,300 m・2.5 倍・戦いながら 2 倍（S4 の較正。R13）・10 秒、乱数は seed+26', () => {
    expect([TP.torpedoId, TP.launchM, TP.tolDeg, TP.n, TP.spacingDeg, TP.aimDeg, TP.hurriedM, TP.hurriedFactor, TP.engagedFactor, TP.reacquireS]).toEqual(['us_mk13', 900, 30, 3, 8, 10, 1300, 2.5, 2, 10]);
    expect(PT_TORPEDO_SEED_OFFSET).toBe(26);
  });
});

describe('気づかれていない斉射（哨戒の PT。spec §4.2）', () => {
  it('900 m の内で艇首が輸送船へ: 3 本を 8° 間隔で撃ち、去る（PT_LEAVE・timerS 0・onLeave）。2 回目は無い（1 隻 1 回）', () => {
    const b = bench();
    place(b, 0, 850, 0, 0, PT_PATROL);
    const rng = new CountingRng(5);
    stepTorp(b, rng, { nowS: 61.5 });
    expect(b.sink.shots.length).toBe(3);
    expect(b.sink.salvos).toEqual([{ i: 0, kind: PT_SALVO_CALM, m: expect.closeTo(850, 6), n: 3 }]);
    const h = b.sink.shots.map((s) => s.h);
    expect(h[1]! - h[0]!).toBeCloseTo(8, 9);
    expect(h[2]! - h[1]!).toBeCloseTo(8, 9);
    for (const s of b.sink.shots) expect([s.i, s.x, s.y]).toEqual([0, b.q.boats[0]!.x, b.q.boats[0]!.y]);
    expect([b.q.boats[0]!.phase, b.q.boats[0]!.timerS, b.left]).toEqual([PT_LEAVE, 0, [0]]);
    expect([b.st.left[0], b.st.kind[0], b.st.launchS[0], b.st.salvoLeft[0], b.st.salvos, b.st.fired, b.st.hurriedFired, b.st.seq, b.st.lastBoat, b.st.lastKind]).toEqual([0, PT_SALVO_CALM, 61.5, 3, 1, 3, 0, 1, 0, PT_SALVO_CALM]);
    expect(b.st.launchM[0]).toBeCloseTo(850, 6);
    // もう一度哨戒に戻しても撃たない（斉射は残っていない）
    const draws = rng.draws;
    place(b, 0, 600, 0, 0, PT_PATROL);
    for (let k = 0; k < 1000; k++) stepTorp(b, rng);
    expect([b.sink.shots.length, rng.draws]).toEqual([3, draws]);
  });
  it('距離の境目（899.99 m は撃つ・901 m は撃たない）と艇首の境目（30° は撃つ・30.5° は撃たない。左右とも）', () => {
    for (const [d, off, fire] of [[899.99, 0, true], [901, 0, false], [800, 30, true], [800, -30, true], [800, 30.5, false], [800, -30.5, false], [800, 180, false]] as const) {
      const b = bench();
      place(b, 0, d, 45, off, PT_PATROL);
      stepTorp(b, new SeededRng(1));
      expect(b.sink.shots.length, `${d} m ${off}°`).toBe(fire ? 3 : 0);
    }
  });
  it('哨戒の PT だけ: 警戒（続き）・突撃・航過・離脱・追撃・去るは 900 m の内でも気づかれていない斉射を撃たない（戦いながらの斉射を切れば何も撃たない。R12 は tests/pt-torpedo-engaged）', () => {
    const off: PtTorpedoParams = { ...TP, engagedFactor: 0 };
    for (const ph of [PT_ALERT, PT_RUN_IN, PT_PASS, PT_BREAK, PT_CHASE, PT_LEAVE]) {
      const b = bench();
      place(b, 0, 500, 0, 0, ph);
      const rng = new CountingRng(2);
      stepTorp(b, rng, { tp: off });
      expect([b.sink.shots.length, rng.draws], `段階 ${ph}`).toEqual([0, 0]);
      const c = bench();
      place(c, 0, 500, 0, 0, ph);
      stepTorp(c, new SeededRng(2));
      expect(c.sink.salvos.map((x) => x.kind), `段階 ${ph}（data のまま）`).toEqual(ph === PT_PASS || ph === PT_LEAVE ? [] : [PT_SALVO_ENGAGED]);
    }
  });
  it('狙い: 中央の 1 本は輸送船の中心への方位 + 誤差（±aim_error_deg。1 斉射に 1 回）', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const b = bench();
      place(b, 0, 880, 300, 4, PT_PATROL);
      const brg = brgToShip(b, 0);
      stepTorp(b, new SeededRng(seed));
      const err = new SeededRng(seed).nextRange(-TP.aimDeg, TP.aimDeg);
      expect(b.sink.shots[1]!.h).toBeCloseTo(brg + err, 9);
      expect(Math.abs(b.sink.shots[1]!.h - brg)).toBeLessThanOrEqual(TP.aimDeg);
    }
  });
});

describe('慌てた斉射（R2: 接触の瞬間に哨戒から警戒になった PT はみな）', () => {
  it('哨戒 → 警戒のステップに 1,300 m の内・艇首が輸送船へ: 見つけたか（q.seen）を問わず撃って去る。狙いは ±aim × 2.5', () => {
    for (const seen of [0, 1]) {
      const b = bench();
      place(b, 0, 1250, 20, -3, PT_ALERT, PT_PATROL);
      b.q.seen[0] = seen;
      const brg = brgToShip(b, 0);
      stepTorp(b, new SeededRng(9));
      const err = new SeededRng(9).nextRange(-TP.aimDeg * TP.hurriedFactor, TP.aimDeg * TP.hurriedFactor);
      expect(b.sink.salvos, `seen ${seen}`).toEqual([{ i: 0, kind: PT_SALVO_HURRIED, m: expect.closeTo(1250, 6), n: 3 }]);
      expect(b.sink.shots[1]!.h).toBeCloseTo(brg + err, 9);
      expect([b.q.boats[0]!.phase, b.st.kind[0], b.st.hurriedFired, b.left]).toEqual([PT_LEAVE, PT_SALVO_HURRIED, 3, [0]]);
    }
  });
  it('同じステップに 2 隻・3 隻とも慌てて撃つ（見つけた PT だけでなく）。1,300 m の外・艇首が外れた PT は撃たずに警戒のまま', () => {
    const b = bench();
    place(b, 0, 1200, 0, 0, PT_ALERT, PT_PATROL);
    place(b, 1, 1290, 90, 10, PT_ALERT, PT_PATROL);
    b.q.seen[0] = 1;
    stepTorp(b, new SeededRng(3));
    expect(b.sink.salvos.map((s) => [s.i, s.kind])).toEqual([[0, PT_SALVO_HURRIED], [1, PT_SALVO_HURRIED]]);
    const c = bench();
    place(c, 0, 1310, 0, 0, PT_ALERT, PT_PATROL);
    place(c, 1, 1100, 90, 35, PT_ALERT, PT_PATROL);
    stepTorp(c, new SeededRng(3));
    expect([c.sink.shots.length, c.q.boats[0]!.phase, c.q.boats[1]!.phase]).toEqual([0, PT_ALERT, PT_ALERT]);
  });
  it('接触の瞬間だけ: 前のステップも警戒なら 1,300 m の内でも撃たない。hurried_max_m 0（kill switch）なら慌てた斉射は無い', () => {
    const b = bench();
    place(b, 0, 1000, 0, 0, PT_ALERT, PT_ALERT);
    stepTorp(b, new SeededRng(3));
    expect(b.sink.shots.length).toBe(0);
    const off: PtTorpedoParams = { ...TP, hurriedM: 0, hurried2: 0 };
    const c = bench();
    place(c, 0, 950, 0, 0, PT_ALERT, PT_PATROL);
    const rng = new CountingRng(3);
    stepTorp(c, rng, { tp: off });
    expect([c.sink.shots.length, rng.draws, c.q.boats[0]!.phase]).toEqual([0, 0, PT_ALERT]);
  });
});

describe('見失いの後（reacquire_s。D8）', () => {
  it.each([PT_ALERT, PT_RUN_IN, PT_CHASE, PT_BREAK])('段階 %i → 哨戒: 10 秒は撃たず（気づかれていない斉射も慌てた斉射も）、10 秒の後に撃つ', (from) => {
    const b = bench();
    place(b, 0, 700, 180, 0, PT_PATROL, from);
    const rng = new CountingRng(4);
    let t = 0;
    while (b.sink.shots.length === 0 && t < 20) {
      t += FEEL_DT;
      stepTorp(b, rng);
    }
    expect(t).toBeGreaterThanOrEqual(TP.reacquireS);
    expect(t).toBeLessThan(TP.reacquireS + 3 * FEEL_DT);
    // 待つ間に接触しても慌てて撃たない
    const c = bench();
    place(c, 0, 1200, 180, 0, PT_PATROL, from);
    stepTorp(c, rng);
    for (let k = 0; k < 120; k++) stepTorp(c, rng);
    place(c, 0, 1200, 180, 0, PT_ALERT, PT_PATROL);
    stepTorp(c, rng);
    expect(c.sink.shots.length).toBe(0);
  });
  it('reacquire_s 0 なら戻ったステップに撃てる', () => {
    const b = bench();
    place(b, 0, 700, 180, 0, PT_PATROL, PT_ALERT);
    stepTorp(b, new SeededRng(4), { tp: { ...TP, reacquireS: 0 } });
    expect(b.sink.shots.length).toBe(3);
  });
});

describe('夜明け・輸送船の沈没（F11）', () => {
  it('夜明けの後は撃たない。凍結のラッチが去らせた PT は leftAtDawn（結末 OUT_DAWN）', () => {
    const b = bench();
    place(b, 0, 600, 0, 0, PT_PATROL);
    const rng = new CountingRng(4);
    stepTorp(b, rng, { dawn: true });
    expect([b.sink.shots.length, rng.draws]).toEqual([0, 0]);
    b.q.boats[0]!.phase = PT_LEAVE; // 凍結のラッチ（哨戒 → 去る）
    stepTorp(b, rng, { dawn: true });
    expect([b.st.leftAtDawn[0], ptTorpedoOutcome(b.st, b.q, 0)]).toEqual([1, OUT_DAWN]);
  });
  it('輸送船が沈み始めたら哨戒で斉射の残る PT は撃たずに去る（goalGone・onLeave・OUT_GOAL_GONE）。警戒の PT は自艇と戦い続ける', () => {
    const b = bench();
    place(b, 0, 700, 0, 0, PT_PATROL);
    place(b, 1, 1100, 90, 0, PT_ALERT, PT_ALERT);
    for (let k = 0; k < LP.hitsToSink; k++) hitLanding(b.ld, LP, 30);
    expect(b.ld.afloat).toBe(false);
    const rng = new CountingRng(4);
    stepTorp(b, rng);
    expect([b.sink.shots.length, rng.draws, b.q.boats[0]!.phase, b.q.boats[0]!.timerS, b.st.goalGone[0], b.left]).toEqual([0, 0, PT_LEAVE, 0, 1, [0]]);
    expect([b.q.boats[1]!.phase, b.st.goalGone[1]]).toEqual([PT_ALERT, 0]);
    expect([ptTorpedoOutcome(b.st, b.q, 0), ptTorpedoOutcome(b.st, b.q, 1)]).toEqual([OUT_GOAL_GONE, OUT_NONE]);
    // 見失って哨戒に戻れば、その PT も去る
    b.q.boats[1]!.phase = PT_PATROL;
    stepTorp(b, rng);
    expect([b.q.boats[1]!.phase, ptTorpedoOutcome(b.st, b.q, 1)]).toEqual([PT_LEAVE, OUT_GOAL_GONE]);
  });
});

describe('乱数（seed+26。D18・I5）', () => {
  it('斉射の無いステップは引かない（10,000 ステップ: 遠い哨戒・近いが外を向く・警戒・去る・海域の外）', () => {
    const b = bench();
    place(b, 0, 3000, 0, 0, PT_PATROL);
    place(b, 1, 600, 90, 120, PT_PATROL);
    const rng = new CountingRng(8);
    for (let k = 0; k < 10000; k++) stepTorp(b, rng, { nowS: k * FEEL_DT });
    expect([rng.draws, b.sink.shots.length]).toEqual([0, 0]);
  });
  it('斉射は 1 + 2n + 蛇行の本数を、狙い → 1 本ごとに不発 → 蛇行 → [偏差]（systems/torpedo-launcher と同じ順）', () => {
    const tp: PtTorpedoParams = { ...TP, reliability: { dud: 0.5, erratic: 0.5 } };
    let erraticSeen = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const b = bench(undefined, tp);
      place(b, 0, 820, 135, 7, PT_PATROL);
      const brg = brgToShip(b, 0);
      const rng = new CountingRng(seed);
      stepTorp(b, rng, { tp });
      const twin = new SeededRng(seed);
      const hs: number[] = [0, 0, 0];
      fillSalvoHeadings(brg + twin.nextRange(-tp.aimDeg, tp.aimDeg), tp.n, tp.spacingDeg * (tp.n - 1), hs);
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

describe('外から書くのは段階と timerS だけ（owner・held・追撃の状態に触らない）', () => {
  it('斉射・沈没で去らせても q.owner・q.held・passes・bursts は変わらない', () => {
    const b = bench();
    place(b, 0, 800, 0, 0, PT_PATROL);
    place(b, 1, 1200, 90, 0, PT_ALERT, PT_PATROL);
    b.q.held[0] = 1; // 突撃から見失って戻った PT（pt-boats:75 は held を消さない。F9）
    const before = JSON.stringify([b.q.owner, Array.from(b.q.held), b.q.boats.map((x) => [x.passes, x.bursts, x.burst, x.lockDeg, x.side, x.fate])]);
    stepTorp(b, new SeededRng(2));
    expect(b.sink.salvos.length).toBe(2);
    expect(JSON.stringify([b.q.owner, Array.from(b.q.held), b.q.boats.map((x) => [x.passes, x.bursts, x.burst, x.lockDeg, x.side, x.fate])])).toBe(before);
  });
});

describe('PT ごとの結末（ptTorpedoOutcome。Result の雷撃の行）', () => {
  it('気づかれていない・慌てた・25mm で撃退（死傷・穴）・撃沈・夜明け・輸送船が沈んで去った・引きつけて去らせた・撃たせず・戦いながら（R12）', () => {
    const b = bench();
    const set = (i: number, phase: number, fate: number): void => {
      b.q.boats[i]!.phase = phase;
      b.q.boats[i]!.fate = fate;
    };
    set(0, PT_LEAVE, 0);
    expect(ptTorpedoOutcome(b.st, b.q, 0)).toBe(OUT_LEFT);
    set(0, PT_LEAVE, PT_FATE_CREW);
    expect(ptTorpedoOutcome(b.st, b.q, 0)).toBe(OUT_RETIRED);
    set(0, PT_OUT, PT_FATE_HULL);
    expect(ptTorpedoOutcome(b.st, b.q, 0)).toBe(OUT_RETIRED);
    set(0, PT_SUNK, PT_FATE_SUNK);
    expect(ptTorpedoOutcome(b.st, b.q, 0)).toBe(OUT_SUNK);
    set(0, PT_PATROL, 0);
    expect(ptTorpedoOutcome(b.st, b.q, 0)).toBe(OUT_NONE);
    set(0, PT_ALERT, 0);
    expect(ptTorpedoOutcome(b.st, b.q, 0)).toBe(OUT_NONE);
    b.st.kind[0] = PT_SALVO_CALM;
    expect(ptTorpedoOutcome(b.st, b.q, 0)).toBe(OUT_CALM);
    b.st.kind[0] = PT_SALVO_HURRIED;
    expect(ptTorpedoOutcome(b.st, b.q, 0)).toBe(OUT_HURRIED);
    // 戦いながら（R12）: 撃った後に 25mm で撃退・撃沈されても斉射が先（Result の「戦いながら」）
    b.st.kind[0] = PT_SALVO_ENGAGED;
    for (const [phase, fate] of [[PT_RUN_IN, 0], [PT_LEAVE, PT_FATE_CREW], [PT_SUNK, PT_FATE_SUNK]] as const) {
      set(0, phase, fate);
      expect(ptTorpedoOutcome(b.st, b.q, 0)).toBe(OUT_ENGAGED);
    }
    expect([OUT_NONE, OUT_CALM, OUT_HURRIED, OUT_RETIRED, OUT_SUNK, OUT_DAWN, OUT_LEFT, OUT_GOAL_GONE, OUT_ENGAGED]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect([PT_SALVO_CALM, PT_SALVO_HURRIED, PT_SALVO_ENGAGED]).toEqual([1, 2, 3]);
  });
});
