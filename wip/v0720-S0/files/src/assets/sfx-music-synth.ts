// v0.7.2 S0（アートと音③：BGM と命中スローの音。spec-v0720 §2・§3.3）: 曲の楽器。画面の枠組みにも再生の API にも依らない純粋な計算（tests/sfx-music-synth が node で回す）。
// - 波形表（2,048 点・線形補間）: 波形 6 種 × オクターブ 6 本。表ごとに 10 kHz より上の倍音を入れない（22,050 Hz で折り返さない）。大きさは RMS でそろえる（低い音も高い音も同じ
//   大きさ）。表と雑音（32,768 標本）は MusicTables が持つ（確保は constructor だけ。埋めるのは stepTables で、予算の内で 1 倍音ずつ）。
// - 楽器（spec §3.3。iPhone の本体は約 300〜400 Hz より下がほとんど出ない）: パッド（鋸の表・立ち上がり 1.5 秒）・鈴（FM 3.5:1・正弦の表）・はじく音（明るい短い鋸。低音はこれ）・
//   金管風（立ち上がりの後に倍音を明るく・0.15 秒からビブラート）・弱音器の金管風・小太鼓・トム・リム（雑音の帯＋胴。胴は 180 Hz 以上）・ブラシ・うねり（雑音の帯 400〜1,600 Hz）・震え・ぱちぱち。
// - IP1〜IP2 の教え（長く鳴る低い正弦は本体で「ポンっ」）: 200 Hz より下の基音は 0.4 秒より長く鳴らさない（鳴らすなら 2〜6 倍音が 70% 以上。tests/sfx-music-synth が音符で確かめる）。
// - 音符 1 つを書く口 stepTone・stepFm・stepNoise: 共有の Float32Array に足す（輪の長さ n。はみ出す尾は頭へ＝2 区間に分けて書く・% なし）。包絡は掛け算の漸化式（標本ごとの exp なし）。
//   [i0, i1) だけを書き、続きの状態は st に残す（分けて書いても一度に書いても同じ標本）。毎フレームの口なので確保しない（名前が step* ＝tests/sfx-rules の検査が効く）。
import { MUSIC_COST, MUSIC_SAMPLE_RATE, SFX_SEED_MUSIC_NOISE } from '../config/sfx-music-config';
import { SeededRng } from '../core/rng';

const SR = MUSIC_SAMPLE_RATE, TAU = Math.PI * 2, LN10 = Math.log(10);
/** 表の点の数（2 の冪）。表の行は線形補間のための後ろの 2 点（[0]・[1] の写し）つき */
export const MUSIC_TAB = 2048;
const TAB = MUSIC_TAB, MASK = TAB - 1, ROW = TAB + 2;
/** オクターブの表: o 番は基音 110 × 2^o〜110 × 2^(o+1) Hz（下は 0 番に、上は 5 番にまとめる）。倍音は 10 kHz まで */
const OCT_BASE_HZ = 110, OCTS = 6, TOP_HZ = 10000;
/** 「減衰 D 秒」（D 秒で 1/10）の 2.5 倍＝−50 dB で書くのをやめる・雑音の表の長さ・ビブラートと揺れの書き直しは 32 標本ごと */
const TAIL = 2.5, NOISE_N = 1 << 15, MOD_BLOCK = 31;

export type MusicWave = 'warm' | 'dark' | 'bright' | 'brassLo' | 'brassHi' | 'mute';
const WAVES: readonly MusicWave[] = ['warm', 'dark', 'bright', 'brassLo', 'brassHi', 'mute'];
/** 波形 → 倍音 h（その高さ hz）の大きさ。warm・dark はパッド（倍音を 6・3 番から丸める）、bright ははじく音（基音を弱めて 2〜6 倍音を本体のスピーカーへ）、金管は閉じた音 → 開いた音 */
const WAVE_AMP: Readonly<Record<MusicWave, (h: number, hz: number) => number>> = {
  warm: (h) => 1 / h / (1 + (h / 6) ** 2),
  dark: (h) => 1 / h / (1 + (h / 3) ** 2),
  bright: (h) => (h === 1 ? 0.45 : 1 / h),
  brassLo: (h) => (h <= 4 ? 1 / (h * h) : 0),
  brassHi: (h, hz) => (hz < 1800 ? 1 : (1800 / hz) ** 2) / Math.sqrt(h),
  mute: (h, hz) => (h === 1 ? 0.2 : 1 / Math.sqrt(h)) * (0.15 + Math.exp(-(((hz - 1700) / 700) ** 2))),
};
const harmonicsOf = (o: number): number => Math.max(1, Math.floor(TOP_HZ / (OCT_BASE_HZ * 2 ** (o + 1))));
const refHz = (o: number): number => OCT_BASE_HZ * 2 ** (o + 0.5);
const octaveOf = (hz: number): number => Math.min(OCTS - 1, Math.max(0, Math.floor(Math.log2(hz / OCT_BASE_HZ))));

/** 波形の 2〜6 倍音のエネルギーの割合（基音 hz の表で。IP1〜IP2 の教えの確かめ） */
export function musicHarmonic26Share(wave: MusicWave, hz: number): number {
  const o = octaveOf(hz);
  let all = 0, mid = 0;
  for (let h = 1; h <= harmonicsOf(o); h++) { const a = WAVE_AMP[wave](h, h * refHz(o)); all += a * a; if (h >= 2 && h <= 6) mid += a * a; }
  return mid / all;
}

export type MusicInst = 'pad' | 'padDark' | 'bell' | 'pluck' | 'brass' | 'mute' | 'snare' | 'tom' | 'rim' | 'brush' | 'swell' | 'shaker' | 'crackle';
/**
 * 音符（作曲器 assets/sfx-music-compose が作る）: 楽器・始めの標本（0〜輪の長さ − 1）・押さえている長さ（標本。この後は離した後の減衰）・音高（MIDI。小数は cent のずれ。
 * 打楽器は使わない）・強さ（線形）・減衰の秒の上書き（0 は楽器の値。鈴の 0.9〜1.8 秒）・雑音の表の読み始め（打楽器ごとに違う所から）
 */
export interface MusicNote { readonly inst: MusicInst; readonly start: number; readonly len: number; readonly pitch: number; readonly vel: number; readonly decayS: number; readonly noise: number }
/**
 * 楽器の 1 行: 種類・音量・立ち上がり・減衰（D 秒で 1/10。0 は保つ）・離した後の減衰・波形表。金管は立ち上がりの後 brightS 秒で wave2 へ bright の割合まで重ねる（倍音が明るくなる）・
 * ビブラート（Hz・± 割合・vibDelayS 秒から vibRampS 秒で深くする）。FM は変調の比・深さ（rad）・深さの減衰。雑音は 1 極の高域通過 → 低域通過の帯と胴（正弦 bodyHz → bodyToHz を
 * 30 ms で・減衰 bodyDecayS）。うねりは立ち上がり＝長さ × attackFrac・減衰の秒＝長さ × decayFrac
 */
interface InstDef {
  readonly kind: 'tone' | 'fm' | 'noise'; readonly gain: number; readonly attackS: number; readonly decayS: number; readonly releaseS: number; readonly wave?: MusicWave;
  readonly wave2?: MusicWave; readonly brightS?: number; readonly bright?: number; readonly vibHz?: number; readonly vibDepth?: number; readonly vibDelayS?: number; readonly vibRampS?: number;
  readonly ratio?: number; readonly index?: number; readonly indexDecayS?: number;
  readonly hpHz?: number; readonly lpHz?: number; readonly noiseGain?: number; readonly bodyHz?: number; readonly bodyToHz?: number; readonly bodyDecayS?: number; readonly bodyGain?: number;
  readonly attackFrac?: number; readonly decayFrac?: number;
}
/** 楽器の表（音色の数＝聞かせ方の定数。強さの比は作曲器の層の vel と掛ける） */
export const MUSIC_INSTRUMENTS: Readonly<Record<MusicInst, InstDef>> = {
  pad: { kind: 'tone', gain: 0.5, attackS: 1.5, decayS: 0, releaseS: 0.9, wave: 'warm' },
  padDark: { kind: 'tone', gain: 0.5, attackS: 2.0, decayS: 0, releaseS: 1.2, wave: 'dark' },
  bell: { kind: 'fm', gain: 0.8, attackS: 0.002, decayS: 1.3, releaseS: 0, ratio: 3.5, index: 2.2, indexDecayS: 0.35 },
  pluck: { kind: 'tone', gain: 0.8, attackS: 0.003, decayS: 0.3, releaseS: 0.05, wave: 'bright' },
  brass: { kind: 'tone', gain: 0.7, attackS: 0.04, decayS: 3, releaseS: 0.12, wave: 'brassLo', wave2: 'brassHi', brightS: 0.08, bright: 0.85, vibHz: 5, vibDepth: 0.004, vibDelayS: 0.15, vibRampS: 0.25 },
  mute: { kind: 'tone', gain: 0.7, attackS: 0.03, decayS: 2.5, releaseS: 0.1, wave: 'brassLo', wave2: 'mute', brightS: 0.06, bright: 0.9, vibHz: 5.5, vibDepth: 0.006, vibDelayS: 0.15, vibRampS: 0.3 },
  snare: { kind: 'noise', gain: 0.8, attackS: 0.001, decayS: 0.12, releaseS: 0.05, hpHz: 1200, lpHz: 7000, noiseGain: 1, bodyHz: 200, bodyToHz: 185, bodyDecayS: 0.05, bodyGain: 0.5 },
  tom: { kind: 'noise', gain: 0.8, attackS: 0.002, decayS: 0.15, releaseS: 0.05, hpHz: 300, lpHz: 2000, noiseGain: 0.35, bodyHz: 260, bodyToHz: 205, bodyDecayS: 0.2, bodyGain: 1 },
  rim: { kind: 'noise', gain: 0.6, attackS: 0.0005, decayS: 0.02, releaseS: 0.02, hpHz: 2500, lpHz: 8000, noiseGain: 1, bodyHz: 600, bodyToHz: 560, bodyDecayS: 0.03, bodyGain: 0.5 },
  brush: { kind: 'noise', gain: 0.5, attackS: 0.012, decayS: 0.1, releaseS: 0.05, hpHz: 2000, lpHz: 7000, noiseGain: 1 },
  swell: { kind: 'noise', gain: 0.4, attackS: 0, decayS: 0, releaseS: 1, hpHz: 400, lpHz: 1600, noiseGain: 1, attackFrac: 0.45, decayFrac: 0.5 },
  shaker: { kind: 'noise', gain: 0.4, attackS: 0.004, decayS: 0.05, releaseS: 0.03, hpHz: 2000, lpHz: 4000, noiseGain: 1 },
  crackle: { kind: 'noise', gain: 0.3, attackS: 0, decayS: 0.003, releaseS: 0.002, hpHz: 1500, lpHz: 8000, noiseGain: 1 },
};

/** MIDI → Hz */
export function midiHz(p: number): number {
  return 440 * 2 ** ((p - 69) / 12);
}
/** 1 標本の単位（config/sfx-music-config の MUSIC_COST） */
export function musicUnitsPerSample(inst: MusicInst): number {
  const d = MUSIC_INSTRUMENTS[inst];
  return d.kind === 'fm' ? MUSIC_COST.fm : d.kind === 'noise' ? MUSIC_COST.noise : d.wave2 ? MUSIC_COST.toneMix : MUSIC_COST.tone;
}
function attackN(d: InstDef, nt: MusicNote): number {
  return Math.max(1, Math.round(d.attackFrac ? nt.len * d.attackFrac : d.attackS * SR));
}
/** 減衰の秒（音符の上書き → うねりは長さの割合 → 楽器の値） */
function decayOf(d: InstDef, nt: MusicNote): number {
  return nt.decayS > 0 ? nt.decayS : d.decayFrac ? (nt.len * d.decayFrac) / SR : d.decayS;
}
/** 音符を書く標本の数（押さえている長さ＋離した後の減衰。減衰する楽器は −50 dB まで。鈴は打った後に鳴り切る） */
export function musicNoteSamples(nt: MusicNote): number {
  const d = MUSIC_INSTRUMENTS[nt.inst], dec = decayOf(d, nt), ring = dec > 0 ? attackN(d, nt) + Math.ceil(TAIL * dec * SR) : Infinity;
  return d.kind === 'fm' ? ring : Math.min(ring, nt.len + Math.ceil(TAIL * d.releaseS * SR));
}
/** 鳴っている秒（−20 dB まで。IP1〜IP2 の教えの確かめ） */
export function musicSoundingS(nt: MusicNote): number {
  const d = MUSIC_INSTRUMENTS[nt.inst], dec = decayOf(d, nt), a = attackN(d, nt) / SR;
  return d.kind === 'fm' ? a + dec : Math.min(dec > 0 ? a + dec : Infinity, nt.len / SR + d.releaseS);
}

/** 表の 1 倍音を足す（h × i は整数＝正弦の表をそのまま引く） */
function stepHarmonic(w: Float32Array, s: Float64Array, base: number, h: number, a: number): void {
  for (let i = 0; i < TAB; i++) w[base + i] = w[base + i]! + a * s[(h * i) & MASK]!;
}

/** 波形表・正弦の表・雑音の表（ゲームに 1 つ。作り直さない） */
export class MusicTables {
  readonly sine = new Float64Array(ROW);
  readonly waves = new Float32Array(WAVES.length * OCTS * ROW);
  readonly noise = new Float32Array(NOISE_N);
  private readonly rng = new SeededRng(SFX_SEED_MUSIC_NOISE);
  /** 次の仕事（表の番号。WAVES × OCTS で雑音、その次で済み）と、その中の次の倍音（雑音は次の標本） */
  private job = 0;
  private at = 0;
  private norm = 0;

  constructor() {
    for (let i = 0; i < ROW; i++) this.sine[i] = Math.sin((TAU * (i & MASK)) / TAB);
  }
  get ready(): boolean {
    return this.job > WAVES.length * OCTS;
  }
  /** 波形 wave・基音 hz の表の始まり（waves の添字） */
  waveRow(wave: MusicWave, hz: number): number {
    return (WAVES.indexOf(wave) * OCTS + octaveOf(hz)) * ROW;
  }

  /** 予算 budget 単位の内で表を埋めていく（使った単位を返す）。1 倍音＝2,048 点ずつ・雑音は標本ずつ */
  stepTables(budget: number): number {
    const perHarmonic = TAB * MUSIC_COST.tablePoint, jobs = WAVES.length * OCTS;
    let left = budget;
    while (this.job < jobs && left >= perHarmonic) {
      const amp = WAVE_AMP[WAVES[(this.job / OCTS) | 0]!], o = this.job % OCTS, top = harmonicsOf(o), base = this.job * ROW, ref = refHz(o);
      if (this.at === 0) {
        let s = 0;
        for (let h = 1; h <= top; h++) s += amp(h, h * ref) ** 2;
        this.norm = 1 / Math.sqrt(s); // 表の RMS をそろえる（倍音の数に依らない大きさ）
        this.at = 1;
      }
      stepHarmonic(this.waves, this.sine, base, this.at, amp(this.at, this.at * ref) * this.norm);
      left -= perHarmonic;
      this.at++;
      if (this.at > top) {
        this.waves.copyWithin(base + TAB, base, base + 2);
        this.job++;
        this.at = 0;
      }
    }
    if (this.job === jobs) {
      const k = Math.min(NOISE_N - this.at, Math.floor(left / MUSIC_COST.tone)), z = this.noise, rng = this.rng;
      for (let i = this.at; i < this.at + k; i++) z[i] = rng.next() * 2 - 1;
      this.at += k;
      left -= k * MUSIC_COST.tone;
      if (this.at >= NOISE_N) { this.job++; this.at = 0; }
    }
    return budget - left;
  }
}

/** 波形表の音符（パッド・はじく音・金管）。wowDepth・wowCycles は曲全体の揺れ（輪の中に整数回＝継ぎ目で続く。ラジオの C だけ） */
export function stepTone(dst: Float32Array, n: number, nt: MusicNote, i0: number, i1: number, st: Float64Array, tb: MusicTables, wowDepth: number, wowCycles: number): void {
  const d = MUSIC_INSTRUMENTS[nt.inst], w = tb.waves, s = tb.sine, hz = midiHz(nt.pitch);
  const inc = (hz * TAB) / SR, r1 = tb.waveRow(d.wave!, hz), r2 = d.wave2 ? tb.waveRow(d.wave2, hz) : -1;
  const an = attackN(d, nt), invA = 1 / an, len = nt.len, g = nt.vel * d.gain, dec = decayOf(d, nt);
  const rD = dec > 0 ? Math.exp(-LN10 / (dec * SR)) : 1, rR = Math.exp(-LN10 / (d.releaseS * SR));
  const bn = Math.max(1, Math.round((d.brightS ?? 0) * SR)), bright = d.bright ?? 0;
  const vibInc = (((d.vibHz ?? 0) * TAB) / SR) * (MOD_BLOCK + 1), vibD = d.vibDepth ?? 0;
  const vib0 = Math.round((d.vibDelayS ?? 0) * SR), vibRamp = Math.max(1, Math.round((d.vibRampS ?? 0) * SR)), wowK = (wowCycles * TAB) / n;
  let ph = st[0]!, e = st[1]!, cur = st[2]!, lfo = st[3]!;
  if (i0 === 0) { ph = 0; e = 0; cur = inc; lfo = 0; }
  const split = n - nt.start;
  for (let seg = 0; seg < 2; seg++) {
    const a = seg === 0 ? i0 : Math.max(i0, split), b = seg === 0 ? Math.min(i1, split) : i1, off = seg === 0 ? nt.start : nt.start - n;
    for (let i = a; i < b; i++) {
      if ((i & MOD_BLOCK) === 0 && (vibD > 0 || wowDepth > 0)) {
        const depth = i <= vib0 ? 0 : i >= vib0 + vibRamp ? vibD : (vibD * (i - vib0)) / vibRamp;
        cur = inc * (1 + depth * s[lfo | 0]! + wowDepth * s[(((nt.start + i) * wowK) % TAB) | 0]!);
        if ((lfo += vibInc) >= TAB) lfo -= TAB;
      }
      e = i < an ? i * invA : i < len ? (i === an ? 1 : e * rD) : e * rR;
      const j = ph | 0, f = ph - j;
      let v = w[r1 + j]! + (w[r1 + j + 1]! - w[r1 + j]!) * f;
      if (r2 >= 0) v += (w[r2 + j]! + (w[r2 + j + 1]! - w[r2 + j]!) * f - v) * (i >= bn ? bright : (bright * i) / bn);
      dst[i + off] = dst[i + off]! + v * e * g;
      if ((ph += cur) >= TAB) ph -= TAB;
    }
  }
  st[0] = ph; st[1] = e; st[2] = cur; st[3] = lfo;
}

/** FM の鈴（搬送 × 3.5 の変調。正弦の表で引く。深さは打った後に澄む） */
export function stepFm(dst: Float32Array, n: number, nt: MusicNote, i0: number, i1: number, st: Float64Array, tb: MusicTables): void {
  const d = MUSIC_INSTRUMENTS[nt.inst], s = tb.sine, ic = (midiHz(nt.pitch) * TAB) / SR, im = ic * (d.ratio ?? 1);
  const an = attackN(d, nt), invA = 1 / an, g = nt.vel * d.gain, k = TAB / TAU;
  const rA = Math.exp(-LN10 / (decayOf(d, nt) * SR)), rI = Math.exp(-LN10 / ((d.indexDecayS ?? 1) * SR));
  let pc = st[0]!, pm = st[1]!, e = st[2]!, x = st[3]!;
  if (i0 === 0) { pc = 0; pm = 0; e = 0; x = d.index ?? 0; }
  const split = n - nt.start;
  for (let seg = 0; seg < 2; seg++) {
    const a = seg === 0 ? i0 : Math.max(i0, split), b = seg === 0 ? Math.min(i1, split) : i1, off = seg === 0 ? nt.start : nt.start - n;
    for (let i = a; i < b; i++) {
      e = i < an ? i * invA : i === an ? 1 : e * rA;
      const jm = pm | 0, m = s[jm]! + (s[jm + 1]! - s[jm]!) * (pm - jm);
      let p = pc + x * m * k;
      p -= Math.floor(p / TAB) * TAB;
      const jc = p | 0;
      dst[i + off] = dst[i + off]! + (s[jc]! + (s[jc + 1]! - s[jc]!) * (p - jc)) * e * g;
      if ((pc += ic) >= TAB) pc -= TAB;
      if ((pm += im) >= TAB) pm -= TAB;
      x *= rI;
    }
  }
  st[0] = pc; st[1] = pm; st[2] = e; st[3] = x;
}

/** 雑音の打楽器・うねり（雑音の表 → 1 極の高域通過 → 低域通過 ＋ 胴の正弦の掃引） */
export function stepNoise(dst: Float32Array, n: number, nt: MusicNote, i0: number, i1: number, st: Float64Array, tb: MusicTables): void {
  const d = MUSIC_INSTRUMENTS[nt.inst], z = tb.noise, s = tb.sine, g = nt.vel * d.gain, ng = d.noiseGain ?? 1, bg = d.bodyGain ?? 0;
  const aH = 1 - Math.exp((-TAU * (d.hpHz ?? 20)) / SR), aL = 1 - Math.exp((-TAU * (d.lpHz ?? 10000)) / SR);
  const an = attackN(d, nt), invA = 1 / an, len = nt.len, dec = decayOf(d, nt);
  const rD = dec > 0 ? Math.exp(-LN10 / (dec * SR)) : 1, rR = Math.exp(-LN10 / (d.releaseS * SR));
  const bTo = ((d.bodyToHz ?? 0) * TAB) / SR, rG = Math.exp(Math.log((d.bodyToHz ?? 1) / (d.bodyHz ?? 1)) / (0.03 * SR)), rB = Math.exp(-LN10 / ((d.bodyDecayS ?? 1) * SR));
  let lo = st[0]!, y = st[1]!, e = st[2]!, be = st[3]!, bp = st[4]!, bi = st[5]!;
  if (i0 === 0) { lo = 0; y = 0; e = 0; be = 1; bp = 0; bi = ((d.bodyHz ?? 0) * TAB) / SR; }
  const split = n - nt.start, z0 = nt.noise;
  for (let seg = 0; seg < 2; seg++) {
    const a = seg === 0 ? i0 : Math.max(i0, split), b = seg === 0 ? Math.min(i1, split) : i1, off = seg === 0 ? nt.start : nt.start - n;
    for (let i = a; i < b; i++) {
      const x = z[(z0 + i) & (NOISE_N - 1)]!;
      lo += aH * (x - lo);
      y += aL * (x - lo - y);
      e = i < an ? i * invA : i < len ? (i === an ? 1 : e * rD) : e * rR;
      let v = y * e * ng;
      if (bg > 0) {
        const j = bp | 0;
        v += (s[j]! + (s[j + 1]! - s[j]!) * (bp - j)) * be * bg;
        if ((bp += bi) >= TAB) bp -= TAB;
        if (bi > bTo) bi *= rG;
        be *= rB;
      }
      dst[i + off] = dst[i + off]! + v * g;
    }
  }
  st[0] = lo; st[1] = y; st[2] = e; st[3] = be; st[4] = bp; st[5] = bi;
}
