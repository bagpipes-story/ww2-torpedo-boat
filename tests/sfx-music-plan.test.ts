// v0.7.2 IP2（実機 2 回目。ユーザー「Dをさらに名曲となるようにリメイクしてください」）: 動機の計画の作曲器（assets/sfx-music-plan）と伴奏の計画（assets/sfx-music-arrange）を固定する。
// - 計画（どの種でも）: 同じ種は同じ音符・5〜6 小節目は 1〜2 小節目そのまま・9〜10 小節目と 13 小節目は動機の頭のリズム・14 小節目は尾のリズム・11 小節目は頭の半分のリズムを 2 回・
//   13〜14 小節目は動機を上へ移した形（向きが 75% 以上同じ・高さが上）・句の終わり（4・12 小節目は 2 度か 5 度・8 小節目は主音か 3 度・16 小節目は主音の付点 2 分）。
// - 選んだ種（SFX_SEED_MUSIC_D）: 9〜11 小節目は上がる移し・山は 13〜14 小節目に 1 回・a は mp → a′ mf → b はだんだん強く → a″ ff → 16 小節目で落ち着く。
// - 伴奏: 動く低音（和音の頭は和音の低音・経過音がある・基音 200 Hz 以上）・対旋律（5〜16 小節だけ・旋律の 3 度以上下・反行か斜行が多い・5 度と 8 度の並行なし・跳躍は 5 度まで）・
//   小太鼓の連打（4・8 小節目は後半・11 小節目は 4 拍目・12 小節目は 1 小節のだんだん強く）・12 小節目の打ちの連打・13 小節目の頭のシンバル・パッドは和音が変わるごと。
import { describe, expect, it } from 'vitest';
import { MUSIC_SEED_SEARCH_D, type MusicKey } from '../src/config/sfx-music-config';
import { chordAt, chordBass, chordPcs, chordSymAt, composeMusic, pcOf, sixteenthOf, type MusicScore } from '../src/assets/sfx-music-compose';
import { MUSIC_THEMES, musicRng } from '../src/assets/sfx-music-themes';
import { midiHz, type MusicNote } from '../src/assets/sfx-music-synth';
import { SeededRng } from '../src/core/rng';

const TH = MUSIC_THEMES.title_d, PLAN = TH.melody!.plan!, A = TH.arrange!, SIX = sixteenthOf(TH.bpm), BAR = 16;
const D = composeMusic(TH, musicRng('title_d' as MusicKey));
/** 区間の頭から 40 個の種（どの種でも計画どおりかを見る） */
const SAMPLE = Array.from({ length: 40 }, (_, i) => composeMusic(TH, new SeededRng(MUSIC_SEED_SEARCH_D.from + i * 7)));
const at16 = (x: MusicNote): number => x.start / SIX;
const barOf = (x: MusicNote): number => Math.floor(at16(x) / BAR);
const inBar = (sc: MusicScore, b: number): MusicNote[] => sc.melody.filter((x) => barOf(x) === b);
const rhythm = (ns: readonly MusicNote[], b: number): string => ns.map((x) => `${at16(x) - b * BAR}:${x.len}`).join(',');
const sign = (x: number): number => Math.sign(x);
const shape = (ns: readonly MusicNote[]): number[] => ns.slice(1).map((x, i) => sign(Math.round(x.pitch) - Math.round(ns[i]!.pitch)));
const mean = (ns: readonly MusicNote[]): number => ns.reduce((a, x) => a + x.pitch, 0) / ns.length;
const deg = (p: number): number => (pcOf(p) - TH.tonic + 12) % 12;
const longest = (ns: readonly MusicNote[]): MusicNote => ns.reduce((a, x) => (x.len > a.len ? x : a), ns[0]!);

describe('動機の計画の旋律（v0.7.2 IP2）', () => {
  it('計画の表: 16 小節の役（a・a′・b・a″）・山は 2 段（3 度）上・音は書かない（役・リズム・度数・段だけ）', () => {
    expect(PLAN.roles).toEqual(['m1', 'm2', 'link', 'half', 'm1', 'm2', 'link', 'closed', 'seq', 'seq2', 'frag', 'half', 'top1', 'top2', 'link', 'final']);
    expect(PLAN.topShift).toBe(2);
    expect(TH.melody!.cadences).toEqual([[4, 'half'], [8, 'closed'], [12, 'half'], [16, 'end']]);
    expect(Object.keys(PLAN).sort()).toEqual(['closes', 'finals', 'halfs', 'heads', 'links', 'roles', 'seqShift', 'starts', 'tails', 'topShift']);
  });
  it('同じ種は同じ音符（2 回作って同じ・違う種は違う旋律）', () => {
    expect(composeMusic(TH, musicRng('title_d')).notes).toEqual(D.notes);
    expect(SAMPLE[1]!.melody.map((x) => x.pitch)).not.toEqual(SAMPLE[2]!.melody.map((x) => x.pitch));
  });
  it.each(SAMPLE.map((sc, i) => [i, sc] as const))('種 %i: 写し（5〜6 小節目＝1〜2 小節目）・リズムの写し（9・10・13＝頭・14＝尾・11＝頭の半分を 2 回）・a″ は動機の形で上', (_, sc) => {
    for (const k of [0, 1]) {
      const a = inBar(sc, k), b = inBar(sc, k + 4);
      expect(b.map((x) => [x.start - 4 * BAR * SIX, x.len, x.pitch])).toEqual(a.map((x) => [x.start, x.len, x.pitch]));
    }
    const head = rhythm(inBar(sc, 0), 0), tail = rhythm(inBar(sc, 1), 1);
    for (const b of [8, 9, 12]) expect(rhythm(inBar(sc, b), b), `${b + 1} 小節`).toBe(head);
    expect(rhythm(inBar(sc, 13), 13)).toBe(tail);
    const f = inBar(sc, 10), h = f.length / 2, fh = rhythm(f.slice(0, h), 10), sh = f.slice(h).map((x) => `${at16(x) - 10 * BAR - 8}:${x.len}`).join(',');
    expect(fh).toBe(sh);
    expect(inBar(sc, 0).map((x) => `${at16(x) % 8}:${x.len}`).join(',')).toContain(f.slice(0, h).map((x) => `${at16(x) % 8}:${x.len}`).join(','));
    const m = [...inBar(sc, 0), ...inBar(sc, 1)], t = [...inBar(sc, 12), ...inBar(sc, 13)], same = shape(t).filter((x, i) => x === shape(m)[i]).length / shape(m).length;
    expect(same).toBeGreaterThanOrEqual(0.75);
    expect(mean(t) - mean(m)).toBeGreaterThanOrEqual(2);
  });
  it.each(SAMPLE.map((sc, i) => [i, sc] as const))('種 %i: 句の終わり（小節の一番長い音）は 4・12 小節目が 2 度か 5 度・8 小節目が主音か 3 度・16 小節目は主音（1 拍目の付点 2 分）。どれも和音の音', (_, sc) => {
    const c = [3, 7, 11, 15].map((b) => longest(inBar(sc, b)));
    expect([2, 7]).toContain(deg(c[0]!.pitch));
    expect([0, 3]).toContain(deg(c[1]!.pitch));
    expect([2, 7]).toContain(deg(c[2]!.pitch));
    expect(deg(c[3]!.pitch)).toBe(0);
    expect([at16(c[3]!) % BAR, Math.round(c[3]!.len / SIX / TH.melody!.legato)]).toEqual([0, 12]);
    for (const x of c) expect(chordAt(TH, at16(x))).toContain(pcOf(x.pitch));
  });
  it('選んだ種: b は上がる移し（9 → 10 小節目は上・11 小節目は 10 小節目より下がらない）・山（一番高い音）は 13〜14 小節目に 1 回・a″ の最後は導音か 2 度から主音へ順次', () => {
    const b9 = mean(inBar(D, 8)), b10 = mean(inBar(D, 9)), b11 = mean(inBar(D, 10));
    expect(b10).toBeGreaterThan(b9);
    expect(b11).toBeGreaterThanOrEqual(b10 - 0.5);
    const top = Math.max(...D.melody.map((x) => x.pitch)), tops = D.melody.filter((x) => x.pitch === top);
    expect(tops.length).toBe(1);
    expect([12, 13]).toContain(barOf(tops[0]!));
    const fin = longest(inBar(D, 15)), i = D.melody.indexOf(fin);
    expect(Math.abs(fin.pitch - D.melody[i - 1]!.pitch)).toBeLessThanOrEqual(2);
    expect(Math.abs(D.melody[0]!.pitch - D.melody[D.melody.length - 1]!.pitch)).toBeLessThanOrEqual(2); // 輪の最後から頭へ順次
  });
  it('強弱の弧（選んだ種の旋律の強さ）: a（mp）< a′（mf）< a″（ff）・b はだんだん強く・16 小節目は a″ より弱く落ち着く', () => {
    const horn = D.notes.filter((x) => x.inst === TH.melody!.inst); // 強弱は合奏の音符に掛かる（楽譜の旋律は型の強さのまま）
    const v = (b0: number, b1: number): number => { const s = horn.filter((x) => barOf(x) >= b0 && barOf(x) < b1); return s.reduce((a, x) => a + x.vel, 0) / s.length; };
    expect(v(0, 4)).toBeLessThan(v(4, 8));
    expect(v(4, 8)).toBeLessThan(v(12, 15));
    expect(A.dyn[8]!).toBeLessThan(A.dyn[11]!);
    for (let b = 8; b < 11; b++) expect(A.dyn[b + 1]!).toBeGreaterThan(A.dyn[b]!);
    expect(A.dyn[15]!).toBeLessThan(A.dyn[12]!);
    expect(Math.max(...A.dyn)).toBe(A.dyn[12]);
    expect(Math.min(...A.dyn)).toBe(A.dyn[0]);
  });
});

describe('伴奏の計画（v0.7.2 IP2）', () => {
  const bass = D.notes.filter((x) => x.inst === A.bass.inst && x.pitch < Math.round(x.pitch)); // 2 声の下の声（−cent）
  const ctr = D.notes.filter((x) => x.inst === A.counter.inst && x.pitch < Math.round(x.pitch));
  it('動く低音: 8 分の刻み（1 拍に 2 つ）・和音の頭は和音の低音（分数の和音は / の音）・経過音（和音の外の音）がある・基音 200 Hz 以上・半分以上の小節で高さが動く', () => {
    expect(bass.length).toBe(TH.bars * 8);
    const beats = bass.filter((_, i) => i % 2 === 0);
    let outside = 0, heads = 0;
    beats.forEach((x, k) => {
      const t = k * 4, sym = chordSymAt(TH, t), prevSym = k > 0 ? chordSymAt(TH, t - 4) : '';
      if (sym !== prevSym || t % BAR === 0 && chordSymAt(TH, t - 1) !== sym) { heads++; expect(pcOf(x.pitch), `${t}`).toBe(chordBass(sym)); }
      if (!chordPcs(sym).includes(pcOf(x.pitch))) outside++;
      expect(midiHz(x.pitch)).toBeGreaterThanOrEqual(200);
    });
    expect(heads).toBeGreaterThanOrEqual(TH.bars);
    expect(outside / beats.length).toBeGreaterThanOrEqual(0.05);
    const moving = Array.from({ length: TH.bars }, (_, b) => new Set(beats.slice(b * 4, b * 4 + 4).map((x) => Math.round(x.pitch))).size > 1).filter(Boolean).length;
    expect(moving).toBeGreaterThanOrEqual(TH.bars / 2);
  });
  it('対旋律（弦）: 決めた小節（5〜16）だけ・旋律の 3 度以上下・反行か斜行が 6 割以上・5 度と 8 度の並行なし・跳躍は 5 度まで・長い音（4 分音符以上）', () => {
    expect(A.counter.bars).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    expect(ctr.length).toBeGreaterThan(10);
    const sounding = (t: number): number => { let p = D.melody[0]!.pitch; for (const x of D.melody) if (at16(x) <= t) p = x.pitch; return Math.round(p); };
    let good = 0, moves = 0;
    ctr.forEach((x, i) => {
      expect(barOf(x)).toBeGreaterThanOrEqual(4);
      expect(x.len / SIX).toBeGreaterThanOrEqual(4);
      const m = sounding(at16(x)), q = Math.round(x.pitch);
      expect(m - q, `${at16(x)}`).toBeGreaterThanOrEqual(3);
      if (i === 0) return;
      const p0 = Math.round(ctr[i - 1]!.pitch), m0 = sounding(at16(ctr[i - 1]!)), dc = q - p0, dm = m - m0;
      expect(Math.abs(dc)).toBeLessThanOrEqual(7);
      if (dc !== 0 && sign(dc) === sign(dm)) expect([(m - q) % 12 === (m0 - p0) % 12 && [0, 7].includes((m - q) % 12)]).toEqual([false]);
      moves++;
      if (dc === 0 || dm === 0 || sign(dc) !== sign(dm)) good++;
    });
    expect(good / moves).toBeGreaterThanOrEqual(0.6);
  });
  it('打楽器: 4・8 小節目は後半の連打・11 小節目は 4 拍目の連打・12 小節目は 1 小節の連打（だんだん強く）・12 小節目の打ちは 13 小節目への 16 分 4 つ・シンバルは 13 小節目の頭の 1 つだけ', () => {
    const sn = D.notes.filter((x) => x.inst === 'snare'), roll = (b: number): MusicNote[] => sn.filter((x) => barOf(x) === b && x.len === Math.round(SIX / 2));
    expect([roll(3).length, roll(7).length, roll(10).length, roll(11).length]).toEqual([16, 16, 8, 32]);
    const r12 = roll(11).map((x) => x.vel);
    expect(r12[r12.length - 1]!).toBeGreaterThan(2 * r12[0]!);
    const boom12 = D.notes.filter((x) => x.inst === 'boom' && barOf(x) === 11 && at16(x) % BAR >= 12);
    expect(boom12.length).toBe(4);
    const crash = D.notes.filter((x) => x.inst === 'crash');
    expect(crash.map((x) => at16(x))).toEqual([12 * BAR]);
  });
  it('パッド: 和音が変わるごとに和音の音を全部（1 声ずつ）・音域の内', () => {
    const pad = D.notes.filter((x) => x.inst === A.pad.inst);
    for (const x of pad) {
      expect(chordAt(TH, at16(x))).toContain(pcOf(x.pitch));
      expect(x.pitch >= A.pad.range[0] && x.pitch <= A.pad.range[1]).toBe(true);
    }
    const starts = new Set(pad.map((x) => at16(x)));
    expect(starts.has(15 * BAR + 8) && starts.has(15 * BAR + 12) && starts.has(6 * BAR + 8)).toBe(true); // Asus4・A・A7 の頭
  });
});
