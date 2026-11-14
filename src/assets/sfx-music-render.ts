// v0.7.2 S0（アートと音③：BGM と命中スローの音。spec-v0720 §2・§10 R1〜R3・R6・R7）: 曲を数フレームに分けて 1 本の標本へ描く（MusicBuilder.stepBuild(予算)）。
// 段: 0 で埋める → 音符（楽器の口 stepTone・stepFm・stepNoise。予算の内なら音符の途中でも区切り、状態を残して続きから書く）→（ラジオの C だけ: 頂の下見 → 濾波器のならし
// ＝輪の末尾 0.1 秒を先に通して状態を作る（継ぎ目で状態が続く＝R7）→ 柔らかい歪み・帯 320〜3,200 Hz）→ 数え（和・最大・最小）→ 直流を引いて頂 0.9 に掛ける（打楽器の層 L1・L2 は
// 頂を 3 次で丸める＝glue。任務の出口の頂の余りのため）。どの段も予算の単位（config の MUSIC_COST）で数え、1 回の stepBuild は予算を超えない。JIT の初回（書き方ごとに初めの
// 60 万標本）は 1 回に 2 万標本まで（MUSIC_BUILD_WARM）。分け方に依らず標本はビット同一（同じ順の同じ計算。状態は Float64）。
// 輪: 尾は頭へ回して描く（楽器の口）＝末尾の次が頭に続く。作業用の配列は呼ぶ側の 1 本（一番長い鍵の長さ＝R2）を使い回し、出来た標本は result()（次に作る前に写す）。
// 毎フレームの口は stepBuild（と中の step*。確保しない＝tests/sfx-rules）。作る時だけの口（constructor・renderMusic・composeMusicKey）は確保してよい。
import { MUSIC_BUILD_WARM, MUSIC_COST, MUSIC_PEAK, MUSIC_SAMPLE_RATE, MUSIC_WORK_SAMPLES, type MusicKey } from '../config/sfx-music-config';
import { composeMusic, type MusicScore } from './sfx-music-compose';
import { MUSIC_INSTRUMENTS, MusicTables, musicNoteSamples, musicUnitsPerSample, stepFm, stepNoise, stepTone } from './sfx-music-synth';
import { MUSIC_THEMES, musicRng } from './sfx-music-themes';

const SR = MUSIC_SAMPLE_RATE;
const TAU = Math.PI * 2;
/** ラジオ（C）: 帯 320〜3,200 Hz（2 次の高域通過 → 低域通過）・柔らかい歪み（下見の頂を drive にそろえて u − u³/3）・ならしの秒 */
const RADIO = { lowHz: 320, highHz: 3200, q: Math.SQRT1_2, drive: 0.9, warmS: 0.1 } as const;
/** 打楽器の層の丸め（glue）: 頂 0.9 にそろえた v を v × (1.5 − (0.5 / 0.81) v²) に＝頂 0.9 は 0.9 のまま・小さい音は ×1.5（＋3.5 dB）＝頂と RMS の比を 3.5 dB 縮める */
const GLUE_C1 = 1.5, GLUE_C3 = 0.5;
const S_CLEAR = 0, S_NOTES = 1, S_PRE = 2, S_WARM = 3, S_FX = 4, S_SCAN = 5, S_SCALE = 6, S_DONE = 7;
/**
 * 書き方ごとの JIT の初回の残り（標本。config の MUSIC_BUILD_WARM）: 0〜3 波形表（重ね・ビブラート／揺れの有無）・4 FM・5〜6 雑音（胴の有無）・7〜13 段（0 で埋めるのは native なので数えない）。
 * このページで一度温まれば次の曲では効かない（標本は同じ。分け方だけ）
 */
const WARM_LEFT = new Float64Array(14).fill(MUSIC_BUILD_WARM.samples);
WARM_LEFT[7 + S_CLEAR] = 0;

/** 2 次の濾波器（RBJ の高域通過・低域通過）の係数を co[o..o+4] に（b0 b1 b2 a1 a2） */
function biquad(co: Float64Array, o: number, hz: number, high: boolean): void {
  const w = (TAU * hz) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * RADIO.q), a0 = 1 + al;
  const b1 = high ? -(1 + c) : 1 - c, b0 = high ? (1 + c) / 2 : (1 - c) / 2;
  co[o] = b0 / a0; co[o + 1] = b1 / a0; co[o + 2] = b0 / a0; co[o + 3] = (-2 * c) / a0; co[o + 4] = (1 - al) / a0;
}

export class MusicBuilder {
  readonly n: number;
  /** 自分の仕事の単位の合計（表を除く。progress の分母） */
  readonly totalUnits: number;
  private stage = S_CLEAR;
  /** 今の音符の番号と、今の段の次の標本 */
  private at = 0;
  private sub = 0;
  private noteN = 0;
  private ownUnits = 0;
  private readonly st = new Float64Array(8);
  /** ラジオ: 係数 10（高域・低域）と状態 8（x1 x2 y1 y2 × 2） */
  private readonly co = new Float64Array(10);
  private readonly fx = new Float64Array(8);
  private readonly warmN = Math.round(RADIO.warmS * SR);
  private readonly radio: boolean;
  private readonly glue: boolean;
  private readonly wowD: number;
  private readonly wowC: number;
  private pre = 0;
  private sum = 0;
  private hi = -Infinity;
  private lo = Infinity;
  private mean = 0;
  private scale = 1;

  constructor(private readonly tables: MusicTables, private readonly work: Float32Array, readonly score: MusicScore) {
    this.n = score.n;
    if (work.length < this.n) throw new Error(`作業用の配列 ${work.length} が曲 '${score.theme.key}' の ${this.n} より短い`);
    this.radio = score.theme.radio === true;
    this.glue = score.theme.glue === true;
    this.wowD = score.theme.wow?.[0] ?? 0;
    this.wowC = score.theme.wow?.[1] ?? 0;
    let u = 3 * this.n * MUSIC_COST.pass;
    for (const x of score.notes) u += MUSIC_COST.note + musicNoteSamples(x) * musicUnitsPerSample(x.inst);
    if (this.radio) u += this.n * MUSIC_COST.pass + (this.warmN + this.n) * MUSIC_COST.fx - this.n * MUSIC_COST.pass;
    this.totalUnits = u;
    biquad(this.co, 0, RADIO.lowHz, true);
    biquad(this.co, 5, RADIO.highHz, false);
    this.noteN = score.notes.length > 0 ? musicNoteSamples(score.notes[0]!) : 0;
  }

  get done(): boolean {
    return this.stage === S_DONE;
  }

  /** 進み（0〜1。自分の仕事の単位の割合＝試聴の場の「作っています 40%」） */
  get progress(): number {
    return this.done ? 1 : Math.min(0.99, this.ownUnits / this.totalUnits);
  }

  /** 出来た標本（作業用の配列の中。次に作る前に写す） */
  result(): Float32Array {
    if (!this.done) throw new Error(`曲 '${this.score.theme.key}' はまだ出来ていない`);
    return this.work.subarray(0, this.n);
  }

  /** 1 フレームの仕事: 予算 budget 単位の内で進める（使った単位を返す。表がまだなら先に表）。確保しない */
  stepBuild(budget: number): number {
    let left = budget, cold = MUSIC_BUILD_WARM.perCall;
    if (!this.tables.ready) left -= this.tables.stepTables(left);
    while (this.tables.ready && this.stage !== S_DONE) {
      const notes = this.stage === S_NOTES, setup = notes && this.sub === 0 ? MUSIC_COST.note : 0;
      const unit = notes ? musicUnitsPerSample(this.score.notes[this.at]!.inst) : this.stage === S_WARM || this.stage === S_FX ? MUSIC_COST.fx : MUSIC_COST.pass;
      const total = notes ? this.noteN : this.stage === S_WARM ? this.warmN : this.n;
      const v = this.stepVariant(), w = WARM_LEFT[v]! > 0 ? (notes ? 1 : MUSIC_BUILD_WARM.passShare) : 0;
      const k = Math.min(total - this.sub, Math.floor((left - setup) / unit), w > 0 ? Math.floor(cold / w) : Infinity);
      if (k <= 0) break;
      this.stepStage(this.sub, this.sub + k);
      this.sub += k;
      left -= setup + k * unit;
      this.ownUnits += setup + k * unit;
      if (this.sub >= total) this.stepAdvance();
      if (w > 0) { WARM_LEFT[v] = WARM_LEFT[v]! - k; cold -= k * w; }
    }
    return budget - left;
  }

  /** 今の書き方（WARM_LEFT の添字） */
  private stepVariant(): number {
    if (this.stage !== S_NOTES) return 7 + this.stage;
    const d = MUSIC_INSTRUMENTS[this.score.notes[this.at]!.inst];
    return d.kind === 'fm' ? 4 : d.kind === 'noise' ? (d.bodyGain ? 6 : 5) : (d.wave2 || d.vibHz ? 1 : 0) + (this.wowD > 0 ? 2 : 0);
  }

  /** 今の段の [a, b) の標本 */
  private stepStage(a: number, b: number): void {
    const x = this.work, n = this.n;
    if (this.stage === S_CLEAR) x.fill(0, a, b);
    else if (this.stage === S_NOTES) {
      const nt = this.score.notes[this.at]!, kind = MUSIC_INSTRUMENTS[nt.inst].kind;
      if (kind === 'tone') stepTone(x, n, nt, a, b, this.st, this.tables, this.wowD, this.wowC);
      else if (kind === 'fm') stepFm(x, n, nt, a, b, this.st, this.tables);
      else stepNoise(x, n, nt, a, b, this.st, this.tables);
    } else if (this.stage === S_PRE) {
      let p = this.pre;
      for (let i = a; i < b; i++) p = Math.max(p, Math.abs(x[i]!));
      this.pre = p;
    } else if (this.stage === S_SCALE && this.glue) {
      const m = this.mean, g = this.scale, c3 = GLUE_C3 / (MUSIC_PEAK * MUSIC_PEAK);
      for (let i = a; i < b; i++) { const v = (x[i]! - m) * g; x[i] = v * (GLUE_C1 - c3 * v * v); }
    } else if (this.stage === S_SCALE) {
      const m = this.mean, g = this.scale;
      for (let i = a; i < b; i++) x[i] = (x[i]! - m) * g;
    } else this.stepFx(a, b);
  }

  /** ならし（輪の末尾を通して状態だけ作る）・ラジオ（柔らかい歪み → 高域通過 → 低域通過。書いて数える）・数え（和・最大・最小）。状態と係数は手元に写して回す */
  private stepFx(a: number, b: number): void {
    const x = this.work, c = this.co, s = this.fx, warm = this.stage === S_WARM, k = RADIO.drive / (this.pre > 0 ? this.pre : 1), from = warm ? this.n - this.warmN : 0;
    const b0 = c[0]!, b1 = c[1]!, b2 = c[2]!, a1 = c[3]!, a2 = c[4]!, d0 = c[5]!, d1 = c[6]!, d2 = c[7]!, e1 = c[8]!, e2 = c[9]!;
    let x1 = s[0]!, x2 = s[1]!, y1 = s[2]!, y2 = s[3]!, z1 = s[4]!, z2 = s[5]!, w1 = s[6]!, w2 = s[7]!, sum = this.sum, hi = this.hi, lo = this.lo;
    if (this.stage === S_SCAN) {
      for (let i = a; i < b; i++) { const v = x[i]!; sum += v; if (v > hi) hi = v; if (v < lo) lo = v; }
    } else {
      for (let i = a; i < b; i++) {
        const u = x[from + i]! * k, w = u - (u * u * u) / 3, h = b0 * w + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2, v = d0 * h + d1 * z1 + d2 * z2 - e1 * w1 - e2 * w2;
        x2 = x1; x1 = w; y2 = y1; y1 = h; z2 = z1; z1 = h; w2 = w1; w1 = v;
        if (warm) continue;
        x[i] = v; sum += v;
        if (v > hi) hi = v;
        if (v < lo) lo = v;
      }
    }
    s[0] = x1; s[1] = x2; s[2] = y1; s[3] = y2; s[4] = z1; s[5] = z2; s[6] = w1; s[7] = w2;
    this.sum = sum; this.hi = hi; this.lo = lo;
  }

  /** 今の段を終えて次へ */
  private stepAdvance(): void {
    this.sub = 0;
    if (this.stage === S_NOTES && ++this.at < this.score.notes.length) {
      this.noteN = musicNoteSamples(this.score.notes[this.at]!);
      return;
    }
    if (this.stage === S_CLEAR) this.stage = S_NOTES;
    else if (this.stage === S_NOTES) this.stage = this.radio ? S_PRE : S_SCAN;
    else if (this.stage === S_PRE || this.stage === S_WARM) this.stage++;
    else if (this.stage === S_FX || this.stage === S_SCAN) {
      this.mean = this.sum / this.n;
      const peak = Math.max(this.hi - this.mean, this.mean - this.lo);
      this.scale = peak > 0 ? MUSIC_PEAK / peak : 1;
      this.stage = S_SCALE;
    } else this.stage = S_DONE;
  }
}

/** 曲の楽譜（作曲は 1 回。同じ鍵は同じ音符） */
export function composeMusicKey(key: MusicKey): MusicScore {
  return composeMusic(MUSIC_THEMES[key], musicRng(key));
}

/** 一度に描く（tests・scripts 用。表と作業用の配列を作り、出来た標本を写して返す）。budget を渡すとその予算で分けて描く */
export function renderMusic(key: MusicKey, budget = Infinity, tables = new MusicTables(), work = new Float32Array(MUSIC_WORK_SAMPLES)): Float32Array {
  const b = new MusicBuilder(tables, work, composeMusicKey(key));
  for (let guard = 0; !b.done; guard++) {
    if (b.stepBuild(budget === Infinity ? 1e15 : budget) === 0 && guard > 4) throw new Error(`曲 '${key}' が予算 ${budget} で進まない`);
  }
  return b.result().slice();
}
