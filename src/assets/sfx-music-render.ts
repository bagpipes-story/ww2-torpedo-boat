// v0.7.2 S0（アートと音③：BGM と命中スローの音。spec-v0720 §2・§10 R1〜R3・R6・R7）: 曲を数フレームに分けて 1 本の標本へ描く（MusicBuilder.stepBuild(予算)）。
// 段: 0 で埋める → 音符（楽器の口 stepTone・stepFm・stepNoise。予算の内なら音符の途中でも区切り、状態を残して続きから書く）→（部屋の響きのある曲だけ: 響きのならし＝輪の末尾を
// 先に通して櫛と全域通過の状態を作る（継ぎ目で響きが続く＝R7）→ 響きを足す）→ 数え（和・最大・最小）→ 直流を引いて頂 0.9 に掛ける（打楽器の層 L1・L2 は頂を 3 次で丸める＝glue。
// 任務の出口の頂の余りのため）。どの段も予算の単位（config の MUSIC_COST）で数え、1 回の stepBuild は予算を超えない。JIT の初回（書き方ごとに初めの 60 万標本）は 1 回に 2 万標本まで
// （MUSIC_BUILD_WARM）。分け方に依らず標本はビット同一（同じ順の同じ計算。状態は Float64）。
// v0.7.2 IP1: C のラジオ（帯・歪み・ぱちぱち・揺れ）を消し、同じ「ならしてから通す」形で部屋の響き（room。D・E）を足した（乾いた音はファミコンらしさの元＝ユーザー「B はファミコンの RPG みたい」）。
// 輪: 尾は頭へ回して描く（楽器の口）＝末尾の次が頭に続く。作業用の配列は呼ぶ側の 1 本（一番長い鍵の長さ＝R2）を使い回し、出来た標本は result()（次に作る前に写す）。
// 毎フレームの口は stepBuild（と中の step*。確保しない＝tests/sfx-rules）。作る時だけの口（constructor・renderMusic・composeMusicKey）は確保してよい。
import { MUSIC_BUILD_WARM, MUSIC_COST, MUSIC_PEAK, MUSIC_SAMPLE_RATE, MUSIC_WORK_SAMPLES, type MusicKey } from '../config/sfx-music-config';
import { composeMusic, type MusicScore } from './sfx-music-compose';
import { MUSIC_INSTRUMENTS, MusicTables, musicNoteSamples, musicUnitsPerSample, stepFm, stepNoise, stepTone } from './sfx-music-synth';
import { MUSIC_THEMES, musicRng } from './sfx-music-themes';

const SR = MUSIC_SAMPLE_RATE;
/**
 * 部屋の響き（曲の room＝[響きの割合, 残響の秒 T60]）: 帰りに 1 極の低域通過のある櫛 4 本（25〜34 ms。帰りの量は T60 から）の和 → 全域通過 2 段（0.5）。
 * 響きの大きさは櫛の定常の利得で割ってそろえる（割合 ≒ 響き ÷ 元の RMS）。ならしは輪の末尾 warmT60 × T60 秒（その前の響きは −45 dB 以下＝継ぎ目で続く）
 */
const ROOM = { combs: [557, 613, 677, 739], allpass: [173, 67], damp: 0.35, apG: 0.5, warmT60: 1.5 } as const;
const NC = ROOM.combs.length, NA = ROOM.allpass.length;
/** 打楽器の層の丸め（glue）: 頂 0.9 にそろえた v を v × (1.5 − (0.5 / 0.81) v²) に＝頂 0.9 は 0.9 のまま・小さい音は ×1.5（＋3.5 dB）＝頂と RMS の比を 3.5 dB 縮める */
const GLUE_C1 = 1.5, GLUE_C3 = 0.5;
const S_CLEAR = 0, S_NOTES = 1, S_WARM = 2, S_FX = 3, S_SCAN = 4, S_SCALE = 5, S_DONE = 6;
/**
 * 書き方ごとの JIT の初回の残り（標本。config の MUSIC_BUILD_WARM）: 0〜2 波形表（重ね・ビブラートの有無・トレモロ）・3 FM・4〜5 雑音（胴の有無）・6〜11 段（0 で埋めるのは native なので数えない）。
 * このページで一度温まれば次の曲では効かない（標本は同じ。分け方だけ）
 */
const WARM_LEFT = new Float64Array(12).fill(MUSIC_BUILD_WARM.samples);
WARM_LEFT[6 + S_CLEAR] = 0;

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
  /** 部屋の響き（room の曲だけ作る）: 櫛と全域通過の遅れの列（1 本に並べる）・各列の始め・長さ・今の位置・櫛の帰りの量と低域通過の状態 */
  private readonly rb: Float64Array;
  private readonly rOff = new Int32Array(NC + NA);
  private readonly rLen = new Int32Array(NC + NA);
  private readonly rPos = new Int32Array(NC + NA);
  private readonly rFb = new Float64Array(NC);
  private readonly rLp = new Float64Array(NC);
  private readonly warmN: number;
  private readonly wet: number;
  private readonly glue: boolean;
  private sum = 0;
  private hi = -Infinity;
  private lo = Infinity;
  private mean = 0;
  private scale = 1;

  constructor(private readonly tables: MusicTables, private readonly work: Float32Array, readonly score: MusicScore) {
    this.n = score.n;
    if (work.length < this.n) throw new Error(`作業用の配列 ${work.length} が曲 '${score.theme.key}' の ${this.n} より短い`);
    this.glue = score.theme.glue === true;
    const room = score.theme.room;
    let at = 0, e2 = 0;
    for (let k = 0; k < NC + NA; k++) {
      const d = k < NC ? ROOM.combs[k]! : ROOM.allpass[k - NC]!;
      this.rOff[k] = at; this.rLen[k] = d; at += d;
      if (k < NC && room) { this.rFb[k] = 10 ** ((-3 * d) / (room[1] * SR)); e2 += this.rFb[k]! ** 2; }
    }
    this.rb = new Float64Array(room ? at : 0);
    this.warmN = room ? Math.min(this.n, Math.round(ROOM.warmT60 * room[1] * SR)) : 0;
    this.wet = room ? room[0] * Math.sqrt((1 - e2 / NC) / NC) : 0;
    let u = 3 * this.n * MUSIC_COST.pass;
    for (const x of score.notes) u += MUSIC_COST.note + musicNoteSamples(x) * musicUnitsPerSample(x.inst);
    if (room) u += (this.warmN + this.n) * MUSIC_COST.room - this.n * MUSIC_COST.pass;
    this.totalUnits = u;
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
      const notes = this.stage === S_NOTES, room = this.stage === S_WARM || this.stage === S_FX, setup = notes && this.sub === 0 ? MUSIC_COST.note : 0;
      const unit = notes ? musicUnitsPerSample(this.score.notes[this.at]!.inst) : room ? MUSIC_COST.room : MUSIC_COST.pass;
      const total = notes ? this.noteN : this.stage === S_WARM ? this.warmN : this.n;
      const v = this.stepVariant(), w = WARM_LEFT[v]! > 0 ? (notes || room ? 1 : MUSIC_BUILD_WARM.passShare) : 0;
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
    if (this.stage !== S_NOTES) return 6 + this.stage;
    const d = MUSIC_INSTRUMENTS[this.score.notes[this.at]!.inst];
    return d.kind === 'fm' ? 3 : d.kind === 'noise' ? (d.bodyGain ? 5 : 4) : d.tremDepth ? 2 : d.wave2 || d.vibHz ? 1 : 0;
  }

  /** 今の段の [a, b) の標本 */
  private stepStage(a: number, b: number): void {
    const x = this.work, n = this.n;
    if (this.stage === S_CLEAR) x.fill(0, a, b);
    else if (this.stage === S_NOTES) {
      const nt = this.score.notes[this.at]!, kind = MUSIC_INSTRUMENTS[nt.inst].kind;
      if (kind === 'tone') stepTone(x, n, nt, a, b, this.st, this.tables);
      else if (kind === 'fm') stepFm(x, n, nt, a, b, this.st, this.tables);
      else stepNoise(x, n, nt, a, b, this.st, this.tables);
    } else if (this.stage === S_SCALE && this.glue) {
      const m = this.mean, g = this.scale, c3 = GLUE_C3 / (MUSIC_PEAK * MUSIC_PEAK);
      for (let i = a; i < b; i++) { const v = (x[i]! - m) * g; x[i] = v * (GLUE_C1 - c3 * v * v); }
    } else if (this.stage === S_SCALE) {
      const m = this.mean, g = this.scale;
      for (let i = a; i < b; i++) x[i] = (x[i]! - m) * g;
    } else this.stepFx(a, b);
  }

  /**
   * ならし（輪の末尾を響きに通して状態だけ作る）・響き（元 ＋ 割合 × 全域通過（櫛の和）。書いて数える）・数え（和・最大・最小）。
   * 櫛: 出 = 列[位置]・低域 = 出 × (1 − damp) ＋ 低域 × damp・列[位置] = 入 ＋ 低域 × 帰り。全域通過: 出 = 列[位置] − 入・列[位置] = 入 ＋ 列[位置] × 0.5。
   * ならしと響きは同じ命令の列（ならしは割合 0 で元の値をそのまま書き戻し、数えた和・最大・最小は段の終わりで捨てる）＝ならしで温まった JIT をそのまま使う（分かれ道があると響きの最初の 1 回が遅い）
   */
  private stepFx(a: number, b: number): void {
    const x = this.work, warm = this.stage === S_WARM, from = warm ? this.n - this.warmN : 0, rb = this.rb, off = this.rOff, len = this.rLen, pos = this.rPos, fb = this.rFb, lp = this.rLp;
    const dmp = ROOM.damp, dm1 = 1 - dmp, ag = ROOM.apG, wet = warm ? 0 : this.wet;
    let sum = this.sum, hi = this.hi, lo = this.lo;
    if (this.stage === S_SCAN) {
      for (let i = a; i < b; i++) { const v = x[i]!; sum += v; if (v > hi) hi = v; if (v < lo) lo = v; }
    } else {
      for (let i = a; i < b; i++) {
        const u = x[from + i]!;
        let y = 0;
        for (let c = 0; c < NC; c++) {
          const p = off[c]! + pos[c]!, o = rb[p]!;
          lp[c] = o * dm1 + lp[c]! * dmp;
          rb[p] = u + lp[c]! * fb[c]!;
          const q = pos[c]! + 1;
          pos[c] = q >= len[c]! ? 0 : q;
          y += o;
        }
        for (let c = NC; c < NC + NA; c++) {
          const p = off[c]! + pos[c]!, o = rb[p]!;
          rb[p] = y + o * ag;
          y = o - y;
          const q = pos[c]! + 1;
          pos[c] = q >= len[c]! ? 0 : q;
        }
        const v = u + y * wet;
        x[from + i] = v; sum += v;
        if (v > hi) hi = v;
        if (v < lo) lo = v;
      }
    }
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
    else if (this.stage === S_NOTES) this.stage = this.warmN > 0 ? S_WARM : S_SCAN;
    else if (this.stage === S_WARM) {
      this.sum = 0; this.hi = -Infinity; this.lo = Infinity;
      this.stage = S_FX;
    }
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
