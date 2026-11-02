// 米PT の雷撃を凍結の隊（core/pt-boats の stepPtSection）と回す（v0.6.9 S2。spec-v069 §4.1・§4.2・§3.7・§8 の I1〜I5・R2）: 世界と同じ順（隊 → 雷撃）で、
// 隠れる夜（自艇は見つからない）に PT はみな線を来て 900 m で 1 回だけ撃つ（時刻は線の幾何どおり・報告の 1,800 m から 43 秒以上）、撃った PT は凍結の去るの枝で北へ出る（PT_OUT）、
// 止まった自艇に 1,300 m の内で気づいた瞬間に慌てて撃つ（艇首はまだ哨戒の向き）、夜明けの後は撃たない（凍結のラッチが去らせ、去った PT は飛ばす）。
import { describe, expect, it } from 'vitest';
import { PT_ALERT, PT_LEAVE, PT_OUT, PT_PATROL } from '../src/core/pt-boats';
import type { PtParams } from '../src/core/pt-data';
import { OUT_CALM, OUT_DAWN, PT_SALVO_CALM, PT_SALVO_HURRIED, ptTorpedoOutcome } from '../src/core/pt-torpedo';
import type { PtTorpedoParams } from '../src/core/pt-torpedo-data';
import { SeededRng } from '../src/core/rng';
import { bearingDeg } from '../src/core/ship-ai';
import { wrapDeg180 } from '../src/core/units';
import { bench, checkAt, CountingRng, events, FEEL_DT, setupOf, stepNight, TS, type Bench } from './landing-kit';

/** 出発点から線の終わりへ哨戒の速さで進み、(ax, ay) から r m に初めて入る体感秒（線の幾何。入らなければ NaN） */
function crossS(p: PtParams, i: number, ax: number, ay: number, r: number): number {
  const sx = p.startX[i]!;
  const sy = p.startY[i]!;
  const vx = p.legs[4 * i + 2]! - sx;
  const vy = p.legs[4 * i + 3]! - sy;
  const fx = sx - ax;
  const fy = sy - ay;
  const a = vx * vx + vy * vy;
  const b = 2 * (vx * fx + vy * fy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return NaN;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? (t * Math.sqrt(a)) / (p.patrolMps * TS) : NaN;
}

interface Night { b: Bench; p: PtParams; tp: PtTorpedoParams; rng: CountingRng; lookS: number[]; outS: number[] }

/** 隠れる夜（自艇は見つからない）を endS まで。dawnS の後は夜明け */
function hideNight(seed: number, hard: boolean, endS: number, dawnS = Infinity, onLeave: (i: number, t: number) => void = () => {}): Night {
  const s = setupOf(seed, hard);
  const p = s.ptBoats!;
  const tp = s.landing!.torpedo;
  const b = bench(p, tp, s.landing!.params, false);
  const rng = new CountingRng(seed + 26);
  const ptRng = new SeededRng(seed + 18);
  const c = checkAt(2000, 2800);
  const lookS = new Array<number>(p.count).fill(NaN);
  const outS = new Array<number>(p.count).fill(NaN);
  let t = 0;
  const ev = events({ onLeave: (i) => onLeave(i, t) });
  for (let k = 1; t < endS; k++) {
    t = k * FEEL_DT;
    c.timeS = t;
    c.dawn = t >= dawnS;
    stepNight(b, p, tp, c, ptRng, rng, ev);
    for (let i = 0; i < p.count; i++) {
      const q = b.q.boats[i]!;
      if (Number.isNaN(lookS[i]!) && (q.x - b.ld.x) ** 2 + (q.y - b.ld.y) ** 2 <= s.landing!.params.lookout2) lookS[i] = t;
      if (Number.isNaN(outS[i]!) && q.phase === PT_OUT) outS[i] = t;
    }
  }
  return { b, p, tp, rng, lookS, outS };
}

describe('隠れる夜: PT はみな 900 m で 1 回だけ撃つ（凍結の隊のまま。spec §3.7）', () => {
  it.each([
    [1, false], [2, false], [3, false], [4, false], [5, false], [6, false], [7, false], [8, false], [1, true], [2, true], [3, true], [4, true],
  ])('seed %i ハード %s: 気づかれていない斉射の時刻は線の幾何どおり・報告の距離から 43 秒以上・去って海域の外へ', (seed, hard) => {
    const n = hideNight(seed, hard, 140);
    const { b, p, tp } = n;
    expect(b.st.salvos).toBe(p.count); // I4: 1 隻 1 回
    for (let i = 0; i < p.count; i++) {
      const want = crossS(p, i, b.ld.x, b.ld.y, tp.launchM);
      expect(b.st.kind[i], `PT ${i}`).toBe(PT_SALVO_CALM);
      expect(b.st.launchS[i]! - want, `PT ${i} ${want}`).toBeGreaterThanOrEqual(-1e-9);
      expect(b.st.launchS[i]! - want).toBeLessThan(2 * FEEL_DT);
      expect(b.st.launchM[i]).toBeLessThanOrEqual(tp.launchM);
      expect(b.st.launchM[i]).toBeGreaterThan(tp.launchM - 2);
      expect(b.st.launchS[i]! - n.lookS[i]!).toBeGreaterThan(43); // I1: 報告（1,800 m）から 900 m まで ≥ (1,800 − 900) / 20.58 = 43.7 秒
      expect(n.outS[i]! - b.st.launchS[i]!).toBeGreaterThan(0); // 撃った PT は凍結の去るの枝で北へ（PT_OUT）
      expect(ptTorpedoOutcome(b.st, b.q, i)).toBe(OUT_CALM);
    }
    // §3.7 の窓（今夜の揺らぎの両端込み。1 ステップの余裕）
    const win = [[49.99, 81.54], [58.32, 82.75], [78.46, 109.72]];
    for (let i = 0; i < p.count; i++) {
      expect(b.st.launchS[i]).toBeGreaterThanOrEqual(win[i]![0]! - 0.01);
      expect(b.st.launchS[i]).toBeLessThanOrEqual(win[i]![1]! + 2 * FEEL_DT);
    }
    // I5: 引いた回数 = 斉射ごとに 1 + 2n + 蛇行の本数
    const erratic = b.sink.shots.filter((s) => s.erratic).length;
    expect(n.rng.draws).toBe(p.count * (1 + 2 * tp.n) + erratic);
    expect(b.sink.shots.length).toBe(p.count * tp.n);
  });
  it('撃って去った PT は北（leave_heading_deg 0）へ走り、owner にも待ちにもならない', () => {
    const n = hideNight(3, false, 140);
    for (const q of n.b.q.boats) expect(q.phase).toBe(PT_OUT);
    expect(n.b.q.owner).toBe(-1);
    expect(Array.from(n.b.q.held)).toEqual([0, 0]);
    for (let i = 0; i < n.p.count; i++) expect(n.outS[i]! - n.b.st.launchS[i]!).toBeLessThan(60);
  });
});

interface Contact { b: Bench; tp: PtTorpedoParams; contactAt: number; want: boolean[]; seen: number[]; legDeg: number }

/** 北の線（PT 0）の上で泊地から distM の点の東 100 m に止まった自艇（気づく距離 150 m）。隊が気づいたステップまで回す */
function contactNight(seed: number, distM: number): Contact {
  const s = setupOf(seed);
  const p = s.ptBoats!;
  const tp = s.landing!.torpedo;
  const b = bench(p, tp, s.landing!.params, false);
  const [x0, y0, x1, y1] = [p.legs[0]!, p.legs[1]!, p.legs[2]!, p.legs[3]!];
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 60; k++) {
    const m = (lo + hi) / 2;
    if (Math.hypot(x0 + (x1 - x0) * m - b.ld.x, y0 + (y1 - y0) * m - b.ld.y) > distM) lo = m;
    else hi = m;
  }
  const len = Math.hypot(x1 - x0, y1 - y0);
  const c = checkAt(x0 + (x1 - x0) * lo - ((y1 - y0) / len) * 100, y0 + (y1 - y0) * lo + ((x1 - x0) / len) * 100, { targetValid: true, detectOpenM: 150 });
  let contactAt = NaN;
  let t = 0;
  const ev = events({ onContact: (g) => { if (g && Number.isNaN(contactAt)) contactAt = t; } });
  const ptRng = new SeededRng(seed + 18);
  const rng = new SeededRng(seed + 26);
  const want: boolean[] = [];
  const seen: number[] = [];
  for (let k = 1; Number.isNaN(contactAt) && t < 100; k++) {
    t = k * FEEL_DT;
    c.timeS = t;
    const before = Array.from(b.st.prevPhase);
    stepNight(b, p, tp, c, ptRng, rng, ev);
    if (Number.isNaN(contactAt)) continue;
    for (let i = 0; i < p.count; i++) {
      const q = b.q.boats[i]!;
      const d = Math.hypot(q.x - b.ld.x, q.y - b.ld.y);
      const bow = Math.abs(wrapDeg180(q.headingDeg - bearingDeg(q.x, q.y, b.ld.x, b.ld.y)));
      want.push(before[i] === PT_PATROL && d <= tp.hurriedM && bow <= tp.tolDeg);
      seen.push(b.q.seen[i]!);
    }
  }
  return { b, tp, contactAt, want, seen, legDeg: bearingDeg(x0, y0, x1, y1) };
}

describe('止まった自艇に気づいた瞬間（R2: 哨戒の PT はみな）', () => {
  it.each([1, 2, 3, 4, 5, 6])('seed %i: 北の PT が 1,300 m の内で気づく → そのステップに 1,300 m の内で艇首の向く哨戒の PT はみな慌てて撃つ・他は警戒', (seed) => {
    const { b, tp, contactAt, want, legDeg } = contactNight(seed, 1150);
    expect(contactAt).toBeGreaterThan(20);
    expect(b.st.kind[0]).toBe(PT_SALVO_HURRIED);
    expect(b.st.launchS[0]).toBe(contactAt);
    expect(b.st.launchM[0]).toBeGreaterThan(tp.launchM);
    expect(b.st.launchM[0]).toBeLessThanOrEqual(tp.hurriedM);
    // 艇首はまだ哨戒の線の向き（凍結の哨戒の枝が hd を決めてから警戒にする）
    expect(Math.abs(wrapDeg180(b.q.boats[0]!.headingDeg - legDeg))).toBeLessThan(1e-6);
    for (let i = 0; i < want.length; i++) {
      expect(b.st.kind[i] === PT_SALVO_HURRIED, `PT ${i}`).toBe(want[i]);
      if (!want[i]) expect([b.q.boats[i]!.phase, b.st.left[i]]).toEqual([PT_ALERT, 1]);
    }
  });
  it('自艇を見ていない PT（seen 0）も慌てて撃つ: 泊地から 1,000 m で気づく夜は seed 1〜12 のどれも 2 隻とも慌てた斉射', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { b, seen } = contactNight(seed, 1000);
      expect([seen, Array.from(b.st.kind)], `seed ${seed}`).toEqual([[1, 0], [PT_SALVO_HURRIED, PT_SALVO_HURRIED]]);
    }
  });
});

describe('夜明け（I3）', () => {
  it('30 秒に夜明け: 凍結のラッチが哨戒の PT を去らせ（leftAtDawn・OUT_DAWN）、その後は撃たない・乱数を引かない', () => {
    const n = hideNight(2, false, 120, 30);
    expect([n.b.st.salvos, n.rng.draws]).toEqual([0, 0]);
    for (let i = 0; i < n.p.count; i++) expect([n.b.st.leftAtDawn[i], ptTorpedoOutcome(n.b.st, n.b.q, i)]).toEqual([1, OUT_DAWN]);
  });
  it('先に撃って去った PT は凍結の夜明けの輪が飛ばす（onLeave はまだ哨戒の PT だけ）', () => {
    const first = hideNight(5, false, 140);
    const t0 = Math.min(first.b.st.launchS[0]!, first.b.st.launchS[1]!);
    const early = first.b.st.launchS[0] === t0 ? 0 : 1;
    const leaves: Array<[number, number]> = [];
    const n = hideNight(5, false, t0 + 2, t0 + 1, (i, t) => leaves.push([i, t]));
    expect(n.b.st.kind[early]).toBe(PT_SALVO_CALM);
    expect(n.b.st.kind[1 - early]).toBe(0);
    expect(leaves.map(([i]) => i)).toEqual([1 - early]); // 凍結の夜明けのラッチの onLeave（撃って去った PT は飛ばす）
    expect(n.b.st.leftAtDawn[early]).toBe(0);
    expect(n.b.st.leftAtDawn[1 - early]).toBe(1);
    expect(n.b.q.boats[1 - early]!.phase).toBeGreaterThanOrEqual(PT_LEAVE);
    expect(n.b.q.boats[1 - early]!.phase).not.toBe(PT_PATROL);
  });
});
