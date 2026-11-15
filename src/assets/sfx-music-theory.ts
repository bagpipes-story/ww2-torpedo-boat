// v0.7.2 IP2（実機 2 回目）: 作曲器の型と音楽の基礎（assets/sfx-music-compose から分けた。旋律の作り手 sfx-music-plan・伴奏の作り手 sfx-music-arrange・点 sfx-music-score が
// 同じ物を使う＝import の輪を作らない）。中身は S0〜IP1 の作曲器のまま（和音の記号は IP2 で半小節・1 拍ごとの和音・分数の和音〔C/E〕・sus4 を読めるようにした。1 小節 1 和音の曲は同じ答え）。
// 旋律の音の並びは書かない（tests/sfx-music-compose）。どれも作る時だけ動く（確保してよい）。
import { MUSIC_SAMPLE_RATE, type MusicBpm, type MusicKey } from '../config/sfx-music-config';
import type { SeededRng } from '../core/rng';
import type { MusicInst, MusicNote } from './sfx-music-synth';

export type MusicMode = 'aeolian' | 'dorian' | 'harmonic' | 'major';
/** リズムの型: [16 分の位置, 長さ（16 分）, 強さ（%）] の並び（型の長さは span 小節） */
export type MusicRhythm = readonly number[];
/** 句の終わり: half＝2 度か 5 度（半終止）・end＝主音（和音に無ければ根音）・rest＝和音の音・closed＝主音か 3 度（IP2 の動機の計画） */
export type MusicCadence = 'half' | 'end' | 'rest' | 'closed';
/**
 * 動機の計画（v0.7.2 IP2。assets/sfx-music-plan）: 小節ごとの役と、役ごとのリズムの候補。音は書かない（役・移す段・句の終わりの種類だけ）。
 * 役: m1・m2＝動機（1・2 小節目。同じ役の 2 回目からは写し）・link＝続き（句の終わりへ歩く）・half／closed／final＝句の終わり（半終止・閉じる・最後）・
 * seq／seq2＝動機の頭を移す（seq の段の候補 seqShift・seq2 はさらに 1 段上）・frag＝動機の頭の半分を 2 回（2 回目は 1 段上）・top1・top2＝動機を topShift 段上げた戻り（山）
 */
export type MusicPlanRole = 'm1' | 'm2' | 'link' | 'half' | 'closed' | 'final' | 'seq' | 'seq2' | 'frag' | 'top1' | 'top2';
export interface MusicPlan {
  readonly roles: readonly MusicPlanRole[];
  readonly heads: readonly MusicRhythm[]; readonly tails: readonly MusicRhythm[]; readonly links: readonly MusicRhythm[];
  readonly halfs: readonly MusicRhythm[]; readonly closes: readonly MusicRhythm[]; readonly finals: readonly MusicRhythm[];
  /** 動機の始まりの音の度数（主音から音階の段: 0 主音・2 3 度・4 5 度）・seq の段の候補・山の段 */
  readonly starts: readonly number[]; readonly seqShift: readonly number[]; readonly topShift: number;
}
export interface MusicMelody {
  readonly inst: MusicInst; readonly low: number; readonly high: number; readonly vel: number;
  /** 型の長さ（小節）・ふつうの型・句の終わりの型（最後の音が長い） */
  readonly span: 1 | 2; readonly rhythms: readonly MusicRhythm[]; readonly ends: readonly MusicRhythm[];
  /** [小節（1 から）, 終わりの種類]・[写す先の小節, 元の小節]（span 小節ずつ同じリズムで変形して写す） */
  readonly cadences: readonly (readonly [number, MusicCadence])[]; readonly motifs: readonly (readonly [number, number])[];
  /** 押さえる長さの割合（金管 0.9）・音ごとの減衰の秒の幅（鈴）・合奏の声の数と声ごとのずれ（cent。v0.7.2 IP1。確かめは中央の 1 声で） */
  readonly legato: number; readonly decayS?: readonly [number, number]; readonly voices?: number; readonly cents?: number;
  /** 動機の計画（v0.7.2 IP2。あれば rhythms・ends・motifs の代わりにこれで作る） */
  readonly plan?: MusicPlan;
}
export interface MusicPart {
  /** chord＝和音の音を全部（声部は前の和音の近く）・root＝根音・alt＝根音と 5 度を交互・pedal＝pcs の音を全部・none＝打楽器 */
  readonly inst: MusicInst; readonly pitch: 'chord' | 'root' | 'alt' | 'pedal' | 'none'; readonly low: number; readonly high: number; readonly vel: number;
  /** 型（every 小節ごとに種で選ぶ）・fillEvery 小節ごとの終わりの型（小太鼓の連打） */
  readonly rhythms: readonly MusicRhythm[]; readonly every?: number; readonly fill?: MusicRhythm; readonly fillEvery?: number;
  /** パッドの声の数と声ごとのずれ（cent）・pedal の音名（0〜11）・強さの揺れ（± 割合） */
  readonly voices?: number; readonly cents?: number; readonly pcs?: readonly number[]; readonly human?: number;
}
/**
 * 伴奏の計画（v0.7.2 IP2。assets/sfx-music-arrange。あれば parts の代わり）: 動く低音（弓の 8 分の刻み）・和音のパッド・対旋律（弦）・小太鼓・ティンパニ風の打ち・シンバル。
 * 小節ごとの強さ dyn（強弱の弧）と、小節ごとの小太鼓・打ちの型の番号（drums の型の表の添字。−1 はふつうの型を種で選ぶ）。音域は [下, 上]（MIDI）
 */
export interface MusicArrange {
  readonly dyn: readonly number[];
  readonly bass: { readonly inst: MusicInst; readonly range: readonly [number, number]; readonly vel: number; readonly voices: number; readonly cents: number; readonly human: number; readonly accents: MusicRhythm };
  readonly pad: { readonly inst: MusicInst; readonly range: readonly [number, number]; readonly vel: number };
  readonly counter: { readonly inst: MusicInst; readonly range: readonly [number, number]; readonly vel: number; readonly voices: number; readonly cents: number; readonly bars: readonly number[] };
  readonly snare: { readonly vel: number; readonly human: number; readonly cells: readonly MusicRhythm[]; readonly plan: readonly number[] };
  readonly boom: { readonly vel: number; readonly human: number; readonly cells: readonly MusicRhythm[]; readonly plan: readonly number[] };
  readonly crash: { readonly vel: number; readonly bars: readonly number[] };
}
export interface MusicTheme {
  readonly key: MusicKey; readonly bpm: MusicBpm; readonly beats: 2 | 4; readonly bars: number;
  /** 主音（0〜11。C＝0）・旋法・小節ごとの和音（'Dm'・'Bb'・'E7'。IP2: 'Gm A7'＝半小節ずつ・'Dm Dm Asus4 A'＝1 拍ずつ・'C/E'＝低音が E） */
  readonly tonic: number; readonly mode: MusicMode; readonly chords: readonly string[];
  readonly melody: MusicMelody | null; readonly parts: readonly MusicPart[];
  /** 部屋の響き [響きの割合, 残響の秒]（v0.7.2 IP1。C のラジオの代わり）・打楽器の層の頂を丸める（assets/sfx-music-render）・伴奏の計画（IP2） */
  readonly room?: readonly [number, number]; readonly glue?: boolean; readonly arrange?: MusicArrange;
}
/** 楽譜: 書く順の音符（旋律が先）・旋律・輪の長さ（標本） */
export interface MusicScore { readonly theme: MusicTheme; readonly notes: readonly MusicNote[]; readonly melody: readonly MusicNote[]; readonly n: number }

const SR = MUSIC_SAMPLE_RATE;
export const MODES: Readonly<Record<MusicMode, readonly number[]>> = { aeolian: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], harmonic: [0, 2, 3, 5, 7, 8, 11], major: [0, 2, 4, 5, 7, 9, 11] };
const QUALITY: Readonly<Record<string, readonly number[]>> = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10], sus4: [0, 5, 7] };
const NAME_PC = (letter: string, acc: string | undefined): number => 'C.D.EF.G.A.B'.indexOf(letter) + (acc === 'b' ? -1 : acc === '#' ? 1 : 0);
const CHORD_RE = /^([A-G])([b#]?)(m7|m|7|sus4|)(?:\/([A-G])([b#]?))?$/;

export const pcOf = (p: number): number => ((Math.round(p) % 12) + 12) % 12;
/** 16 分音符の標本（330,750 ÷ BPM） */
export const sixteenthOf = (bpm: MusicBpm): number => (SR * 60) / (bpm * 4);
function parse(sym: string): RegExpExecArray {
  const m = CHORD_RE.exec(sym);
  if (!m) throw new Error(`和音 '${sym}' が読めない`);
  return m;
}
/** 和音の音名（0〜11。[根音, 3 度, 5 度, (7 度)]。sus4 は [根音, 4 度, 5 度]・分数の低音は含めない） */
export function chordPcs(sym: string): number[] {
  const m = parse(sym), root = NAME_PC(m[1]!, m[2]);
  return QUALITY[m[3]!]!.map((iv) => (root + iv + 12) % 12);
}
/** 和音の低音の音名（'C/E' は E・ほかは根音） */
export function chordBass(sym: string): number {
  const m = parse(sym);
  return (NAME_PC(m[4] ?? m[1]!, m[4] ? m[5] : m[2]) + 12) % 12;
}
/** 16 分の位置 at の和音の記号（小節の記号を空白で等分に分ける） */
export function chordSymAt(th: MusicTheme, at: number): string {
  const barN = th.beats * 4, b = Math.floor(at / barN), parts = th.chords[b]!.split(' ');
  return parts[Math.min(parts.length - 1, Math.floor(((at - b * barN) * parts.length) / barN))]!;
}
export const chordAt = (th: MusicTheme, at: number): number[] => chordPcs(chordSymAt(th, at));
/** 小節の音階: 旋法の音に、和音の音で音階に無い音を半音下（無ければ上）の代わりに入れる（D エオリアの A の和音の C#・E エオリアの B7 の D#） */
export function barScale(th: MusicTheme, chord: readonly number[]): number[] {
  const sc = MODES[th.mode].map((iv) => (th.tonic + iv) % 12);
  for (const c of chord) if (!sc.includes(c)) sc[sc.includes((c + 11) % 12) ? sc.indexOf((c + 11) % 12) : sc.indexOf((c + 1) % 12)] = c;
  return sc;
}
/** 音階の上で k 段移す（音階に無い音は上の音階の音から数える） */
export function scaleStep(p: number, k: number, sc: readonly number[]): number {
  let q = Math.round(p);
  while (!sc.includes(pcOf(q))) q++;
  for (let i = 0; i < Math.abs(k); i++) do q += Math.sign(k); while (!sc.includes(pcOf(q)));
  return q;
}
/** pcs のどれかの音で p に一番近い音（音域の内） */
export function nearestOf(p: number, pcs: readonly number[], lo: number, hi: number): number {
  let best = lo, bd = Infinity;
  for (let q = lo; q <= hi; q++) if (pcs.includes(pcOf(q)) && Math.abs(q - p) < bd) { bd = Math.abs(q - p); best = q; }
  return best;
}
export const clampOct = (p: number, lo: number, hi: number): number => (p > hi ? clampOct(p - 12, lo, hi) : p < lo ? clampOct(p + 12, lo, hi) : p);
export const pick = <T>(list: readonly T[], rng: SeededRng): T => list[Math.floor(rng.next() * list.length)]!;
export const lowest = (pc: number, lo: number): number => lo + ((pc - (lo % 12) + 12) % 12);
export const tonicTriad = (th: MusicTheme): number[] => [th.tonic, (th.tonic + (th.mode === 'major' ? 4 : 3)) % 12, (th.tonic + 7) % 12];
/**
 * 避ける音（v0.7.2 IP2）: 長調の和音（A・A7・E7・B♭・F・C）の上で、和音の音の半音上（A の上の B♭・E の上の F・C# の上の D）か根音の増 4 度上（B♭ の上の E）。
 * 長い音（4 分音符以上）や跳躍で入る音にすると濁る（短い経過音・刺しゅう音はよい＝呼ぶ側が決める）。短調の和音は無し（Dm の上の B♭ の刺しゅう音などはよく使う）
 */
export function isAvoid(q: number, ch: readonly number[]): boolean {
  const pc = pcOf(q);
  if (ch.includes(pc) || (ch[1]! - ch[0]! + 12) % 12 !== 4) return false;
  return ch.some((c) => (pc - c + 12) % 12 === 1) || (pc - ch[0]! + 12) % 12 === 6;
}
export function note(inst: MusicInst, start: number, len: number, pitch: number, vel: number, decayS = 0, noise = 0): MusicNote {
  return { inst, start: Math.round(start), len: Math.max(1, Math.round(len)), pitch, vel, decayS, noise };
}
