// v0.7.2 S0（アートと音③：BGM と命中スローの音。spec-v0720 §3.1・§3.2）: 作曲器（耳なしで作る）。和音の進行（1 小節 1 和音の表）・旋法・リズムの型（候補ごとの表）と、
// 種つきの旋律の歩き（composeMelody）から音符の表を作る。旋律の音の並びは source に書かない（tests/sfx-music-compose が固定）。乱数は呼ぶ側が音だけの種で作った SeededRng。
// 旋律の決まり（spec §3.2）: 強拍は和音の音・順次 70%／跳躍 30%（跳躍の後は逆向きの順次。跳躍は次の音が順次で戻れる時だけ選ぶ＝1 つ先を見る）・音域の内・句の中ほどの
// 終わり（half）は 2 度か 5 度・最後（end）は主音（その音の和音に主音が無い時＝A の最後の A の和音は、その和音の根音）・5〜6 小節目は 1〜2 小節目の動機の変形（同じリズムで音階の上を移す）。
// 決まり文句（§3.1。melodyCheck が数える。種は決まりを全部通る最初の数＝scripts/sfx-music.ts）: 主和音の分散を 4 音続けない（歩きも避ける）・5–1–3–5 で始めない・
// 句の頭で同じ音を 3 回打って 4 度以上跳ばない（同じ音は 2 回まで）・同じ 4 小節を 3 回以上そのまま繰り返さない。どれも作る時だけ動く（確保してよい）。
import { MUSIC_LENGTHS, MUSIC_SAMPLE_RATE, type MusicBpm, type MusicKey } from '../config/sfx-music-config';
import type { SeededRng } from '../core/rng';
import { musicNoteSamples, type MusicInst, type MusicNote } from './sfx-music-synth';

export type MusicMode = 'aeolian' | 'dorian' | 'harmonic' | 'major';
/** リズムの型: [16 分の位置, 長さ（16 分）, 強さ（%）] の並び（型の長さは span 小節） */
export type MusicRhythm = readonly number[];
/** 句の終わり: half＝2 度か 5 度（半終止）・end＝主音（和音に無ければ根音）・rest＝和音の音 */
export type MusicCadence = 'half' | 'end' | 'rest';
export interface MusicMelody {
  readonly inst: MusicInst; readonly low: number; readonly high: number; readonly vel: number;
  /** 型の長さ（小節）・ふつうの型・句の終わりの型（最後の音が長い） */
  readonly span: 1 | 2; readonly rhythms: readonly MusicRhythm[]; readonly ends: readonly MusicRhythm[];
  /** [小節（1 から）, 終わりの種類]・[写す先の小節, 元の小節]（span 小節ずつ同じリズムで変形して写す） */
  readonly cadences: readonly (readonly [number, MusicCadence])[]; readonly motifs: readonly (readonly [number, number])[];
  /** 押さえる長さの割合（金管 0.9）・音ごとの減衰の秒の幅（鈴）・合奏の声の数と声ごとのずれ（cent。v0.7.2 IP1。確かめは中央の 1 声で） */
  readonly legato: number; readonly decayS?: readonly [number, number]; readonly voices?: number; readonly cents?: number;
}
export interface MusicPart {
  /** chord＝和音の音を全部（声部は前の和音の近く）・root＝根音・alt＝根音と 5 度を交互・pedal＝pcs の音を全部・none＝打楽器 */
  readonly inst: MusicInst; readonly pitch: 'chord' | 'root' | 'alt' | 'pedal' | 'none'; readonly low: number; readonly high: number; readonly vel: number;
  /** 型（every 小節ごとに種で選ぶ）・fillEvery 小節ごとの終わりの型（小太鼓の連打） */
  readonly rhythms: readonly MusicRhythm[]; readonly every?: number; readonly fill?: MusicRhythm; readonly fillEvery?: number;
  /** パッドの声の数と声ごとのずれ（cent）・pedal の音名（0〜11）・強さの揺れ（± 割合）・ぱちぱちの毎秒の数（型の代わりに種で散らす） */
  readonly voices?: number; readonly cents?: number; readonly pcs?: readonly number[]; readonly human?: number; readonly rate?: number;
}
export interface MusicTheme {
  readonly key: MusicKey; readonly bpm: MusicBpm; readonly beats: 2 | 4; readonly bars: number;
  /** 主音（0〜11。C＝0）・旋法・1 小節 1 和音（'Dm'・'Bb'・'E7' など） */
  readonly tonic: number; readonly mode: MusicMode; readonly chords: readonly string[];
  readonly melody: MusicMelody | null; readonly parts: readonly MusicPart[];
  /** 部屋の響き [響きの割合, 残響の秒]（v0.7.2 IP1。C のラジオの代わり）・打楽器の層の頂を丸める（assets/sfx-music-render） */
  readonly room?: readonly [number, number]; readonly glue?: boolean;
}
/** 楽譜: 書く順の音符（旋律が先）・旋律・輪の長さ（標本） */
export interface MusicScore { readonly theme: MusicTheme; readonly notes: readonly MusicNote[]; readonly melody: readonly MusicNote[]; readonly n: number }

const SR = MUSIC_SAMPLE_RATE;
const MODES: Readonly<Record<MusicMode, readonly number[]>> = { aeolian: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], harmonic: [0, 2, 3, 5, 7, 8, 11], major: [0, 2, 4, 5, 7, 9, 11] };
const QUALITY: Readonly<Record<string, readonly number[]>> = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10] };
/**
 * 歩きの重み: 順次（1〜2 半音。上下で 2 つ）は 0.35 ずつ・跳躍（3 度〜5 度。上下で 6 つ）は 0.05 ずつ＝順次 70%・跳躍 30%。同じ音は 0.05（3 回目は 0）。
 * 順次の後は同じ向きを ×1.6（線が続く）・1 つ前の音へ戻るのは ×0.4（行ったり来たりの震えを避ける）
 */
const W_STEP = 0.35, W_LEAP = 0.05, W_SAME = 0.05, MAX_LEAP = 7, W_ON = 1.6, W_BACK = 0.4;
const SHIFTS = [-2, -1, 1, 2], NOISE_SPAN = 1 << 15;
/** 旋律として数える音の数（これより少ない＝任務の鈴は順次・跳躍・音域の幅を数えない） */
export const MELODY_MIN_NOTES = 8;

export const pcOf = (p: number): number => ((Math.round(p) % 12) + 12) % 12;
/** 16 分音符の標本（330,750 ÷ BPM） */
export const sixteenthOf = (bpm: MusicBpm): number => (SR * 60) / (bpm * 4);
/** 和音の音名（0〜11。[根音, 3 度, 5 度, (7 度)]） */
export function chordPcs(sym: string): number[] {
  const m = /^([A-G])([b#]?)(m7|m|7|)$/.exec(sym);
  if (!m) throw new Error(`和音 '${sym}' が読めない`);
  const root = 'C.D.EF.G.A.B'.indexOf(m[1]!) + (m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0);
  return QUALITY[m[3]!]!.map((iv) => (root + iv + 12) % 12);
}
/** 小節の音階: 旋法の音に、和音の音で音階に無い音を半音下（無ければ上）の代わりに入れる（D エオリアの A の和音の C#・E エオリアの B7 の D#） */
export function barScale(th: MusicTheme, chord: readonly number[]): number[] {
  const sc = MODES[th.mode].map((iv) => (th.tonic + iv) % 12);
  for (const c of chord) if (!sc.includes(c)) sc[sc.includes((c + 11) % 12) ? sc.indexOf((c + 11) % 12) : sc.indexOf((c + 1) % 12)] = c;
  return sc;
}
function scaleStep(p: number, k: number, sc: readonly number[]): number {
  let q = Math.round(p);
  while (!sc.includes(pcOf(q))) q++;
  for (let i = 0; i < Math.abs(k); i++) do q += Math.sign(k); while (!sc.includes(pcOf(q)));
  return q;
}
/** pcs のどれかの音で p に一番近い音（音域の内） */
function nearestOf(p: number, pcs: readonly number[], lo: number, hi: number): number {
  let best = lo, bd = Infinity;
  for (let q = lo; q <= hi; q++) if (pcs.includes(pcOf(q)) && Math.abs(q - p) < bd) { bd = Math.abs(q - p); best = q; }
  return best;
}
const clampOct = (p: number, lo: number, hi: number): number => (p > hi ? clampOct(p - 12, lo, hi) : p < lo ? clampOct(p + 12, lo, hi) : p);
const pick = <T>(list: readonly T[], rng: SeededRng): T => list[Math.floor(rng.next() * list.length)]!;
const lowest = (pc: number, lo: number): number => lo + ((pc - (lo % 12) + 12) % 12);
const tonicTriad = (th: MusicTheme): number[] => [th.tonic, (th.tonic + (th.mode === 'major' ? 4 : 3)) % 12, (th.tonic + 7) % 12];
function note(inst: MusicInst, start: number, len: number, pitch: number, vel: number, decayS = 0, noise = 0): MusicNote {
  return { inst, start: Math.round(start), len: Math.max(1, Math.round(len)), pitch, vel, decayS, noise };
}

/** 旋律の 1 音の位置（強拍・和音・音階・句の終わり・写しの元の番号と移す段） */
interface Onset { readonly at: number; readonly dur: number; readonly vel: number; readonly strong: boolean; readonly ch: number[]; readonly sc: number[]; readonly cad?: MusicCadence; readonly src: number; readonly shift: number }
/** 句の終わりの音名（half＝2 度か 5 度のうち和音の音・end＝主音か根音・rest＝和音の音） */
function cadencePcs(th: MusicTheme, o: Onset): number[] {
  const half = [(th.tonic + 2) % 12, (th.tonic + 7) % 12].filter((x) => o.ch.includes(x));
  return o.cad === 'half' ? (half.length > 0 ? half : [(th.tonic + 2) % 12, (th.tonic + 7) % 12]) : o.cad === 'end' ? [o.ch.includes(th.tonic) ? th.tonic : o.ch[0]!] : o.ch;
}
/** 跳躍で q に来た後、次の音 nx が逆向きの順次で戻れるか（次が写し＝fixed の音なら、その音で） */
function canStepBack(th: MusicTheme, q: number, d: number, nx: Onset, fixed: number | null, lo: number, hi: number): boolean {
  for (const r of fixed !== null ? [fixed] : [q - 2, q - 1, q + 1, q + 2]) {
    const ok = Math.abs(r - q) >= 1 && Math.abs(r - q) <= 2 && Math.sign(r - q) === -Math.sign(d) && r >= lo && r <= hi && nx.sc.includes(pcOf(r));
    if (ok && (!nx.strong || nx.ch.includes(pcOf(r))) && (!nx.cad || cadencePcs(th, nx).includes(pcOf(r)))) return true;
  }
  return false;
}
/** 写しの音（元の音を音階の上で shift 段移し、強拍は和音の音へ） */
function copyPitch(o: Onset, src: number, lo: number, hi: number): number {
  const p = clampOct(scaleStep(src, o.shift, o.sc), lo, hi);
  return o.strong && !o.ch.includes(pcOf(p)) ? nearestOf(p, o.ch, lo, hi) : p;
}

/** 旋律（型を span 小節ずつ選ぶ → 音の位置 → 1 つ先を見て候補の重みから音を選ぶ） */
function composeMelody(th: MusicTheme, m: MusicMelody, rng: SeededRng, six: number): MusicNote[] {
  const barN = th.beats * 4, lo = m.low, hi = m.high, mid = (lo + hi) / 2, triad = tonicTriad(th);
  const rh: MusicRhythm[] = [], first: number[] = [], on: Onset[] = [], ps: number[] = [], out: MusicNote[] = [];
  for (let s = 0; s < th.bars / m.span; s++) {
    const bar1 = s * m.span + 1, motif = m.motifs.find((x) => x[0] === bar1), cad = m.cadences.find((x) => x[0] === bar1 + m.span - 1)?.[1];
    const srcSlot = motif ? (motif[1] - 1) / m.span : -1, shift = srcSlot >= 0 ? pick(SHIFTS, rng) : 0;
    const r = srcSlot >= 0 ? rh[srcSlot]! : pick(cad ? m.ends : m.rhythms, rng);
    rh.push(r); first.push(on.length);
    for (let k = 0; k < r.length; k += 3) {
      const at = s * barN * m.span + r[k]!, pos = at % barN, ch = chordPcs(th.chords[Math.floor(at / barN)]!);
      on.push({ at, dur: r[k + 1]!, vel: r[k + 2]! / 100, strong: pos === 0 || (th.beats === 4 && pos === 8), ch, sc: barScale(th, ch), cad: k + 3 >= r.length ? cad : undefined, src: srcSlot >= 0 ? first[srcSlot]! + k / 3 : -1, shift });
    }
  }
  for (let i = 0; i < on.length; i++) {
    const o = on[i]!, nx = on[i + 1], prev = ps[i - 1] ?? -1, iv = i >= 2 && !on[i - 1]!.cad ? prev - ps[i - 2]! : 0;
    let run = 0;
    for (let j = i - 1; j >= 0 && triad.includes(pcOf(ps[j]!)) && (j === i - 1 || ps[j] !== ps[j + 1]); j--) run++;
    let p: number;
    if (o.src >= 0) p = copyPitch(o, ps[o.src]!, lo, hi);
    else if (o.cad) p = nearestOf(prev < 0 ? mid : prev, cadencePcs(th, o), lo, hi);
    else if (prev < 0) p = nearestOf(mid + rng.next() * 6 - 3, o.ch, lo, hi);
    else {
      const fixed = nx && nx.src >= 0 && nx.src < i ? copyPitch(nx, ps[nx.src]!, lo, hi) : null, cand: number[] = [], w: number[] = [];
      let total = 0;
      for (let q = Math.max(lo, prev - MAX_LEAP); q <= Math.min(hi, prev + MAX_LEAP); q++) {
        if (!o.sc.includes(pcOf(q)) || (o.strong && !o.ch.includes(pcOf(q)))) continue;
        const d = q - prev, ad = Math.abs(d);
        let wt = ad === 0 ? (prev === ps[i - 2] ? 0 : W_SAME) : ad <= 2 ? W_STEP : W_LEAP;
        if (Math.abs(iv) >= 3 && !(ad >= 1 && ad <= 2 && Math.sign(d) === -Math.sign(iv))) wt = 0;
        if (ad >= 3 && nx && !canStepBack(th, q, d, nx, fixed, lo, hi)) wt = 0;
        if (run >= 3 && q !== prev && triad.includes(pcOf(q))) wt = 0;
        if (Math.abs(iv) >= 1 && Math.abs(iv) <= 2) wt *= q === ps[i - 2] ? W_BACK : Math.sign(d) === Math.sign(iv) ? W_ON : 1;
        wt *= 1 + (Math.sign(d) * (mid - prev)) / (hi - lo);
        cand.push(q); w.push(wt); total += wt;
      }
      p = total > 0 ? cand[cand.length - 1]! : nearestOf(prev, o.strong ? o.ch : o.sc, lo, hi);
      for (let k = 0, r = rng.next() * total; k < cand.length && total > 0; k++) if ((r -= w[k]!) < 0) { p = cand[k]!; break; }
    }
    ps.push(p);
    out.push(note(m.inst, o.at * six, o.dur * six * m.legato, p, m.vel * o.vel, m.decayS ? m.decayS[0] + (m.decayS[1] - m.decayS[0]) * rng.next() : 0));
  }
  return out;
}

/** 伴奏の層（型の表と和音から。pad は 3 声 ±cent・声部は前の和音の近く。ぱちぱちは毎秒 rate 回を種で散らす） */
function composePart(th: MusicTheme, pt: MusicPart, rng: SeededRng, six: number, n: number, out: MusicNote[]): void {
  const barN = th.beats * 4, every = pt.every ?? 1, voices = pt.voices ?? 1, human = pt.human ?? 0;
  if (pt.rate) {
    for (let t = -Math.log(1 - rng.next()) / pt.rate; t * SR < n; t += -Math.log(1 - rng.next()) / pt.rate) {
      out.push(note(pt.inst, t * SR, six, 0, pt.vel * (0.4 + 0.6 * rng.next()), 0, Math.floor(rng.next() * NOISE_SPAN)));
    }
    return;
  }
  let center = (pt.low + pt.high) / 2, alt = 0;
  for (let b = 0; b < th.bars; b += every) {
    const r = pt.fill && pt.fillEvery && (b + every) % pt.fillEvery === 0 ? pt.fill : pick(pt.rhythms, rng);
    for (let k = 0; k < r.length; k += 3) {
      const at = b * barN + r[k]!, ch = chordPcs(th.chords[Math.floor(at / barN)]!), root = lowest(ch[0]!, pt.low), up = (ch[2]! - ch[0]! + 12) % 12;
      let ps: number[];
      if (pt.pitch === 'none') ps = [0];
      else if (pt.pitch === 'root') ps = [root];
      else if (pt.pitch === 'alt') ps = [alt++ % 2 === 0 ? root : root + up > pt.high ? root + up - 12 : root + up];
      else if (pt.pitch === 'pedal') ps = (pt.pcs ?? []).map((pc) => lowest(pc, pt.low));
      else {
        ps = ch.map((pc) => nearestOf(center, [pc], pt.low, pt.high));
        center = Math.min(pt.high - 4, Math.max(pt.low + 4, ps.reduce((a, x) => a + x, 0) / ps.length));
      }
      const vel = ((pt.vel * r[k + 2]!) / 100) * (1 + human * (rng.next() * 2 - 1)), z = Math.floor(rng.next() * NOISE_SPAN);
      for (const p of ps) for (let v = 0; v < voices; v++) out.push(note(pt.inst, at * six, r[k + 1]! * six, p + ((v - (voices - 1) / 2) * (pt.cents ?? 0)) / 100, vel, 0, z));
    }
  }
}

/** 曲を作る（同じ種は同じ音符）。長さは config の MUSIC_LENGTHS と同じ・どの音符も輪の長さより短く書き終わる */
export function composeMusic(th: MusicTheme, rng: SeededRng): MusicScore {
  const six = sixteenthOf(th.bpm), n = th.bars * th.beats * 4 * six;
  if (!Number.isInteger(six) || n !== MUSIC_LENGTHS[th.key] || th.chords.length !== th.bars) throw new Error(`曲 '${th.key}' の長さ ${n} が表と違う`);
  const melody = th.melody ? composeMelody(th, th.melody, rng, six) : [], voices = th.melody?.voices ?? 1, cents = th.melody?.cents ?? 0, notes: MusicNote[] = [];
  for (const m of melody) for (let v = 0; v < voices; v++) notes.push(voices > 1 ? { ...m, pitch: m.pitch + ((v - (voices - 1) / 2) * cents) / 100 } : m);
  for (const pt of th.parts) composePart(th, pt, rng, six, n, notes);
  for (const x of notes) if (musicNoteSamples(x) > n) throw new Error(`曲 '${th.key}' の ${x.inst} が輪より長い`);
  return { theme: th, notes, melody, n };
}

/** 旋律の確かめ（spec §3.1・§3.2 の決まり。violations が空なら通る）。cadences は句の終わりの音（MIDI） */
export interface MelodyCheck {
  readonly count: number; readonly strongChord: number; readonly stepShare: number; readonly recovered: number;
  readonly low: number; readonly high: number; readonly cadences: readonly number[]; readonly violations: readonly string[];
}
export function melodyCheck(sc: MusicScore): MelodyCheck {
  const th = sc.theme, m = th.melody, v: string[] = [];
  if (!m) return { count: 0, strongChord: 1, stepShare: 1, recovered: 1, low: 0, high: 0, cadences: [], violations: [] };
  const six = sixteenthOf(th.bpm), barN = th.beats * 4, ns = sc.melody, p = ns.map((x) => Math.round(x.pitch)), idx = p.map((_, i) => i);
  const at = ns.map((x) => x.start / six), bar = at.map((a) => Math.floor(a / barN)), ch = bar.map((b) => chordPcs(th.chords[b]!));
  const strong = idx.filter((i) => at[i]! % barN === 0 || (th.beats === 4 && at[i]! % barN === 8));
  if (idx.some((i) => !barScale(th, ch[i]!).includes(pcOf(p[i]!)))) v.push('mode');
  const strongChord = strong.filter((i) => ch[i]!.includes(pcOf(p[i]!))).length / Math.max(1, strong.length);
  if (strongChord < 0.8) v.push('strong');
  const cadIdx = m.cadences.map(([b]) => bar.reduce((last, x, k) => (x < b && x >= b - m.span ? k : last), -1));
  const cadences: number[] = [];
  m.cadences.forEach(([b, kind], k) => {
    const i = cadIdx[k]!, pc = pcOf(p[i]!), c = ch[i]!, half = [(th.tonic + 2) % 12, (th.tonic + 7) % 12];
    cadences.push(p[i]!);
    if (!(kind === 'half' ? half.includes(pc) && (c.includes(pc) || !half.some((x) => c.includes(x))) : kind === 'end' ? pc === (c.includes(th.tonic) ? th.tonic : c[0]) : c.includes(pc))) v.push(`cadence@${b}`);
  });
  const iv = p.slice(1).map((x, i) => x - p[i]!), moves = iv.filter((x) => x !== 0);
  const stepShare = moves.filter((x) => Math.abs(x) <= 2).length / Math.max(1, moves.length);
  const leaps = idx.filter((i) => i + 1 < iv.length && Math.abs(iv[i]!) >= 3 && !cadIdx.includes(i + 1));
  const recovered = leaps.filter((i) => Math.abs(iv[i + 1]!) >= 1 && Math.abs(iv[i + 1]!) <= 2 && Math.sign(iv[i + 1]!) !== Math.sign(iv[i]!)).length / Math.max(1, leaps.length);
  const low = Math.min(...p), high = Math.max(...p);
  if (low < m.low || high > m.high) v.push('range');
  if (p.length >= MELODY_MIN_NOTES && (stepShare < 0.6 || stepShare > 0.85 || leaps.length === 0)) v.push('steps');
  if (p.length >= MELODY_MIN_NOTES && recovered < 0.9) v.push('recover');
  if (p.length >= MELODY_MIN_NOTES && high - low < 7) v.push('span');
  for (const [to, from] of m.motifs) {
    const a = idx.filter((i) => bar[i]! >= from - 1 && bar[i]! < from - 1 + m.span), b = idx.filter((i) => bar[i]! >= to - 1 && bar[i]! < to - 1 + m.span);
    if (a.length !== b.length || a.some((i, k) => at[i]! - (from - 1) * barN !== at[b[k]!]! - (to - 1) * barN) || a.every((i, k) => p[i] === p[b[k]!])) v.push(`motif@${to}`);
  }
  const triad = tonicTriad(th);
  for (let i = 0, run = 0; i < p.length; i++) {
    run = !triad.includes(pcOf(p[i]!)) ? 0 : run > 0 && p[i] !== p[i - 1] ? run + 1 : 1;
    if (run >= 4) { v.push('arpeggio'); break; }
  }
  if (idx.some((i) => i + 4 < p.length && p[i] !== p[i + 1] && p[i] === p[i + 2] && p[i] === p[i + 4] && p[i + 1] === p[i + 3])) v.push('trill');
  for (let b = 0; b < th.bars; b += 4) {
    const h = bar.findIndex((x) => x >= b && x < b + 4), q = h < 0 ? [] : p.slice(h, h + 4).map((x) => (pcOf(x) - th.tonic + 12) % 12);
    if (q.length < 4) continue;
    if (q[0] === 7 && q[1] === 0 && (q[2] === 3 || q[2] === 4) && q[3] === 7) v.push(`fanfare@${b + 1}`);
    if (p[h] === p[h + 1] && p[h] === p[h + 2] && Math.abs(p[h + 3]! - p[h]!) >= 5) v.push(`repeatLeap@${b + 1}`);
  }
  const sigs = new Map<string, number>();
  for (let b = 0; b + 4 <= th.bars; b++) {
    const s = idx.filter((i) => bar[i]! >= b && bar[i]! < b + 4).map((i) => `${at[i]! - b * barN}:${p[i]}:${ns[i]!.len}`).join(',');
    sigs.set(s, (sigs.get(s) ?? 0) + 1);
  }
  if ([...sigs.values()].some((c) => c >= 3)) v.push('repeat4');
  return { count: p.length, strongChord, stepShare, recovered, low, high, cadences, violations: v };
}
