// v0.7.2 IP2（実機 2 回目）: 伴奏の計画（theme.arrange）から伴奏を作る（composeArrange。動機の計画の旋律の後に同じ乱数で）。どれも和音の表と旋律から決める（音の並びは書かない）。
// - 動く低音（弓の 8 分の刻み・2 声）: 拍ごとに高さを決め、1 拍を 8 分 2 つで刻む。和音の頭は低音の音（分数の和音は / の音）を前の低音に近いオクターブで、3 拍目は次の低音との間の
//   和音の音（無ければ同じ音・次が順次の時は 5 半音の内の和音の音で、今と次の両方に近い物）、最後の拍は次の低音へ順次で入る音階の音（経過音。無ければ同じ音）。半小節の和音は 2 拍目が経過音。
// - 和音のパッド: 和音が変わるごと（半小節・1 拍の和音も）に和音の音を全部、前の和音の近くに 1 声ずつ。
// - 対旋律（弦・2 声）: 決めた小節だけ（a′・b・a″）。半小節ごとに 1 音（旋律がそこで 2 分音符以上を始める時は 4 分 2 つ＝旋律が止まる所で動く）。音は和音の音から点で選ぶ:
//   旋律の 3 度以上下・3 度と 6 度を好む・旋律と反対に動く（反行）を好む・順次を好む（大きい跳躍はしない）・音域のまん中に寄る・5 度と 8 度の並行は使わない・低音と同じ音を避ける。
//   同じ音が続く時はのばす（長い音）。
// - 小太鼓・ティンパニ風の打ち・シンバル: 小節ごとの型の番号（−1 は先頭の 2 つの型から種で）。句の終わりの連打・b のだんだん強く・a″ の頭のシンバルは型と番号の表で。
// - 強弱の弧: 小節ごとの強さ dyn を全部の強さに掛ける（旋律は sfx-music-compose が掛ける）。
// 作る時だけ動く（確保してよい）。
import type { SeededRng } from '../core/rng';
import type { MusicNote } from './sfx-music-synth';
import { barScale, chordBass, chordPcs, nearestOf, note, pcOf, pick, type MusicArrange, type MusicTheme } from './sfx-music-theory';

const NOISE_SPAN = 1 << 15;
/** 対旋律の点: 旋律との音程（半音 mod 12）の重み・動き（反行・斜行・並行）・歩幅（同じ音は 0.3・6 半音より大きい跳躍は −1）・音域のまん中へ寄る */
const CONS: Readonly<Record<number, number>> = { 3: 1, 4: 1, 8: 1, 9: 1, 7: 0.45, 0: 0.2, 5: 0.15 };
const W_CONS = 2, W_MOTION = 1.5, W_STEP = 1, W_MID = 0.6, MIN_BELOW = 3;
/** 和音の区切り（16 分の位置・長さ・記号） */
interface Seg { readonly at: number; readonly len: number; readonly sym: string }

function segmentsOf(th: MusicTheme): Seg[] {
  const barN = th.beats * 4, out: Seg[] = [];
  th.chords.forEach((c, b) => {
    const parts = c.split(' '), len = barN / parts.length;
    parts.forEach((sym, k) => {
      const last = out[out.length - 1];
      if (last && last.sym === sym && last.at + last.len === b * barN + k * len && k > 0) out[out.length - 1] = { ...last, len: last.len + len };
      else out.push({ at: b * barN + k * len, len, sym });
    });
  });
  return out;
}
const segAt = (segs: readonly Seg[], at: number): Seg => segs.find((s) => at >= s.at && at < s.at + s.len) ?? segs[segs.length - 1]!;

/** 動く低音の拍ごとの高さ（MIDI） */
function bassLine(th: MusicTheme, segs: readonly Seg[], lo: number, hi: number): number[] {
  const out: number[] = [];
  let prev = nearestOf((lo + hi) / 2, [chordBass(segs[0]!.sym)], lo, hi);
  segs.forEach((s, k) => {
    const ch = chordPcs(s.sym), sc = barScale(th, ch), beats = s.len / 4, next = segs[(k + 1) % segs.length]!;
    const cb = nearestOf(prev, [chordBass(s.sym)], lo, hi), nb = nearestOf(cb, [chordBass(next.sym)], lo, hi);
    const between = (a: number, b: number, pcs: readonly number[]): number[] => {
      const r: number[] = [];
      for (let q = Math.min(a, b) + 1; q < Math.max(a, b); q++) if (pcs.includes(pcOf(q))) r.push(q);
      return r;
    };
    const approach = (x: number): number => between(x, nb, sc).filter((q) => Math.abs(nb - q) <= 2).sort((p, q) => Math.abs(nb - p) - Math.abs(nb - q))[0] ?? x;
    let mid = cb;
    const inner = between(cb, nb, ch);
    if (inner.length > 0) mid = inner.sort((p, q) => Math.abs(p - (cb + nb) / 2) - Math.abs(q - (cb + nb) / 2))[0]!;
    else if (Math.abs(nb - cb) <= 2) mid = [...between(cb - 6, cb, ch), ...between(cb, cb + 6, ch)].filter((q) => q >= lo && q <= hi).sort((p, q) => Math.abs(p - cb) + Math.abs(p - nb) - Math.abs(q - cb) - Math.abs(q - nb))[0] ?? cb;
    const line = beats >= 4 ? [cb, cb, mid, approach(mid)] : beats >= 2 ? [cb, approach(cb), ...Array<number>(beats - 2).fill(cb)] : [cb];
    out.push(...line);
    prev = line[line.length - 1]!;
  });
  return out;
}

/** 伴奏（out に足す）。旋律は 16 分の位置で読む */
export function composeArrange(th: MusicTheme, a: MusicArrange, melody: readonly MusicNote[], rng: SeededRng, six: number, out: MusicNote[]): void {
  const barN = th.beats * 4, segs = segmentsOf(th), dyn = (at: number): number => a.dyn[Math.min(a.dyn.length - 1, Math.floor(at / barN))]!;
  const jitter = (h: number): number => 1 + h * (rng.next() * 2 - 1), noise = (): number => Math.floor(rng.next() * NOISE_SPAN);
  const voices = (inst: MusicNote['inst'], at: number, len: number, p: number, vel: number, v: number, cents: number): void => {
    for (let k = 0; k < v; k++) out.push(note(inst, at * six, len * six, p + ((k - (v - 1) / 2) * cents) / 100, vel));
  };
  // 動く低音（拍ごと → 8 分 2 つの刻み。強さは小節の 8 分ごとの型）
  const bl = bassLine(th, segs, a.bass.range[0], a.bass.range[1]), bs = a.bass;
  bl.forEach((p, beat) => {
    for (let e = 0; e < 2; e++) {
      const at = beat * 4 + e * 2, acc = bs.accents[(at % barN) / 2]! / 100;
      voices(bs.inst, at, 1, p, bs.vel * acc * dyn(at) * jitter(bs.human), bs.voices, bs.cents);
    }
  });
  // 和音のパッド（和音が変わるごとに 1 声ずつ）
  let center = (a.pad.range[0] + a.pad.range[1]) / 2;
  for (const s of segs) {
    const ps = chordPcs(s.sym).map((pc) => nearestOf(center, [pc], a.pad.range[0], a.pad.range[1]));
    center = Math.min(a.pad.range[1] - 4, Math.max(a.pad.range[0] + 4, ps.reduce((x, y) => x + y, 0) / ps.length));
    for (const p of ps) out.push(note(a.pad.inst, s.at * six, s.len * six, p, a.pad.vel * dyn(s.at)));
  }
  // 対旋律（弦）
  const mAt = melody.map((x) => x.start / six), mLen = melody.map((x) => x.len / six);
  /** t の時に鳴っている（か一番近くに鳴り終えた）旋律の音 */
  const sounding = (t: number): number => {
    let p = melody[0]!.pitch;
    for (let i = 0; i < melody.length && mAt[i]! <= t; i++) p = melody[i]!.pitch;
    return Math.round(p);
  };
  const c = a.counter, cn: { at: number; len: number; p: number }[] = [], mid = (c.range[0] + c.range[1]) / 2, span = (c.range[1] - c.range[0]) / 2;
  let prevC = NaN, prevM = NaN;
  for (const bar of c.bars) {
    for (let h = 0; h < barN; h += barN / 2) {
      const t0 = (bar - 1) * barN + h, long = melody.some((_, i) => mAt[i] === t0 && mLen[i]! >= (barN / 2) * 0.75); // 旋律が 2 分音符以上を始める
      for (const t of long ? [t0, t0 + barN / 4] : [t0]) {
        const len = long ? barN / 4 : barN / 2, mp = sounding(t), ch = chordPcs(segAt(segs, t).sym), bass = bl[Math.floor(t / 4)]!;
        let best = NaN, bestS = -Infinity;
        for (let q = c.range[0]; q <= c.range[1]; q++) {
          if (!ch.includes(pcOf(q)) || q > mp - MIN_BELOW) continue;
          const iv = (mp - q) % 12, dc = Number.isNaN(prevC) ? 0 : q - prevC, dm = Number.isNaN(prevM) ? 0 : mp - prevM, prevIv = Number.isNaN(prevC) ? -1 : (prevM - prevC) % 12;
          const similar = Math.sign(dc) !== 0 && Math.sign(dc) === Math.sign(dm);
          if ((similar && (iv === 0 || iv === 7) && prevIv === iv) || Math.abs(dc) > 7) continue; // 5 度・8 度の並行・5 度より大きい跳躍
          const motion = Number.isNaN(prevC) ? 0.6 : dc !== 0 && dm !== 0 ? (similar ? 0.25 : 1) : dc === 0 && dm === 0 ? 0.5 : 0.6;
          const ad = Math.abs(dc), step = ad === 0 ? 0.3 : ad <= 2 ? 1 : ad <= 4 ? 0.6 : ad <= 5 ? 0.3 : ad <= 7 ? 0.1 : -1;
          const sc = W_CONS * (CONS[iv] ?? 0) + W_MOTION * motion + W_STEP * step + W_MID * (1 - Math.abs(q - mid) / span) - (pcOf(q) === pcOf(bass) && Math.abs(q - bass) < 12 ? 0.5 : 0);
          if (sc > bestS) { bestS = sc; best = q; }
        }
        if (Number.isNaN(best)) best = nearestOf(mp - 8, ch, c.range[0], c.range[1]);
        const last = cn[cn.length - 1];
        if (last && last.p === best && last.at + last.len === t) last.len += len; // 同じ音はのばす
        else cn.push({ at: t, len, p: best });
        prevC = best;
        prevM = mp;
      }
    }
  }
  for (const x of cn) voices(c.inst, x.at, x.len, x.p, c.vel * dyn(x.at), c.voices, c.cents);
  // 小太鼓・ティンパニ風の打ち・シンバル（小節ごとの型の番号。−1 は先頭の 2 つの型から種で／打ちは先頭の型）
  for (let bar = 0; bar < th.bars; bar++) {
    const si = a.snare.plan[bar]!, sr = si < 0 ? pick(a.snare.cells.slice(0, 2), rng) : a.snare.cells[si]!, bi = a.boom.plan[bar]!, br = a.boom.cells[Math.max(0, bi)]!;
    for (const [inst, r, p] of [['snare', sr, a.snare], ['boom', br, a.boom]] as const) {
      for (let k = 0; k < r.length; k += 3) {
        const at = bar * barN + r[k]!;
        out.push(note(inst, at * six, r[k + 1]! * six, 0, ((p.vel * r[k + 2]!) / 100) * dyn(at) * jitter(p.human), 0, noise()));
      }
    }
  }
  for (const bar of a.crash.bars) out.push(note('crash', (bar - 1) * barN * six, (barN / 2) * six, 0, a.crash.vel * dyn((bar - 1) * barN), 0, noise()));
}
