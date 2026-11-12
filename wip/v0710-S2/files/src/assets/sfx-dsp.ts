// v0.7.1 S0（アートと音②：合成の効果音。spec-v0710 §2・§4）: 音の合成の部品。画面の枠組みにも再生の API にも依らない純粋な計算（tests/sfx-synth が node で回す）。
// 起動時に 1 回だけ assets/sfx-bank が使う（毎フレームは使わない＝ここでは配列を自由に作ってよい）。乱数は音だけの SeededRng（種は config/sfx-config の SFX_SEED_*）を
// 呼ぶ側が作って渡す。標本は SFX_SAMPLE_RATE（22,050 Hz）・モノ・Float32Array。
// 言葉の約束: 「減衰 D 秒」＝D 秒で 1/10（−20 dB）に落ちる指数の減衰（spec §4 の表の秒をこの意味で読む。表の長さは減衰の 1.5〜2.4 倍＝終わりは −30〜−48 dB で、
// 残りは端の 2 ms の fade が消す）。「掃引 a → b」は指数（音程が等しい速さで動く）。
import { SFX_EDGE_FADE_S, SFX_PEAK, SFX_SAMPLE_RATE } from '../config/sfx-config';
import type { SeededRng } from '../core/rng';

const TAU = Math.PI * 2;
const SR = SFX_SAMPLE_RATE;
/** 「減衰 D 秒」の D で落ちる割合（1/10） */
const DECAY_RATIO_LN = Math.log(10);

/** 秒 → 標本の数 */
export function sfxSamples(seconds: number): number {
  return Math.round(seconds * SR);
}

/** 白色雑音（−1〜1 の一様。rng は音だけの種で作った物） */
export function whiteNoise(rng: SeededRng, n: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rng.next() * 2 - 1;
  return out;
}

/** 1 極の係数（遮断 hz）: y += a × (x − y) */
function onePoleA(hz: number): number {
  return 1 - Math.exp((-TAU * Math.max(1, hz)) / SR);
}

/** 1 極の低域通過（遮断 hzFrom。hzTo を渡すと glideS 秒で指数に掃引してその後は hzTo のまま）。poles 回重ねる（1 回 −6 dB/oct） */
export function lowPass(x: Float32Array, hzFrom: number, hzTo = hzFrom, glideS = 0, poles = 1): Float32Array {
  let cur = x;
  const glideN = Math.max(1, sfxSamples(glideS));
  const ratio = hzTo / hzFrom;
  for (let p = 0; p < poles; p++) {
    const out = new Float32Array(cur.length);
    let y = 0;
    let a = onePoleA(hzFrom);
    for (let i = 0; i < cur.length; i++) {
      if (hzTo !== hzFrom && (i & 15) === 0) a = onePoleA(hzFrom * Math.pow(ratio, Math.min(1, i / glideN)));
      y += a * (cur[i]! - y);
      out[i] = y;
    }
    cur = out;
  }
  return cur;
}

/** 1 極の高域通過（遮断 hz）＝元 − 低域 */
export function highPass(x: Float32Array, hz: number): Float32Array {
  const low = lowPass(x, hz);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i]! - low[i]!;
  return out;
}

/**
 * 双 2 次の帯域通過（中心で 0 dB。帯 lowHz〜highHz＝中心は幾何平均・Q は 中心 ÷ 幅）。toLowHz・toHighHz を渡すと glideS 秒で帯を指数に掃引する
 * （係数は 16 標本ごとに作り直す）
 */
export function bandPass(x: Float32Array, lowHz: number, highHz: number, toLowHz = lowHz, toHighHz = highHz, glideS = 0): Float32Array {
  const out = new Float32Array(x.length);
  const glideN = Math.max(1, sfxSamples(glideS));
  const sweep = toLowHz !== lowHz || toHighHz !== highHz;
  let b0 = 0, a1 = 0, a2 = 0;
  const coef = (lo: number, hi: number): void => {
    const fc = Math.min(Math.sqrt(lo * hi), SR * 0.45);
    const q = fc / Math.max(1, hi - lo);
    const w = (TAU * fc) / SR;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    b0 = alpha / a0;
    a1 = (-2 * Math.cos(w)) / a0;
    a2 = (1 - alpha) / a0;
  };
  coef(lowHz, highHz);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    if (sweep && (i & 15) === 0) {
      const u = Math.min(1, i / glideN);
      coef(lowHz * Math.pow(toLowHz / lowHz, u), highHz * Math.pow(toHighHz / highHz, u));
    }
    const v = x[i]!;
    const y = b0 * (v - x2) - a1 * y1 - a2 * y2; // b1 = 0・b2 = −b0
    x2 = x1; x1 = v; y2 = y1; y1 = y;
    out[i] = y;
  }
  return out;
}

/** 包絡: startS から立ち上がり attackS 秒（直線）→ 減衰 decayS 秒（D 秒で 1/10 の指数）。startS の前は 0 */
export function envelope(n: number, attackS: number, decayS: number, startS = 0): Float32Array {
  const out = new Float32Array(n);
  const s0 = sfxSamples(startS);
  const an = sfxSamples(attackS);
  const k = DECAY_RATIO_LN / Math.max(1, decayS * SR);
  for (let i = Math.max(0, s0); i < n; i++) {
    const j = i - s0;
    out[i] = j < an ? j / an : Math.exp(-k * (j - an));
  }
  return out;
}

/** 立ち上がっていく包絡（0 → 1 を riseS 秒で。pow > 1 で後半に寄せる）。bomb_fall など */
export function ramp(n: number, riseS: number, pow = 1): Float32Array {
  const out = new Float32Array(n);
  const rn = Math.max(1, sfxSamples(riseS));
  for (let i = 0; i < n; i++) out[i] = Math.pow(Math.min(1, i / rn), pow);
  return out;
}

/** 正弦（hzFrom から hzTo へ glideS 秒で指数に掃引し、その後は hzTo。位相は 0 から積む＝頭は 0） */
export function sine(n: number, hzFrom: number, hzTo = hzFrom, glideS = 0): Float32Array {
  const out = new Float32Array(n);
  const glideN = Math.max(1, sfxSamples(glideS));
  const ratio = hzTo / hzFrom;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    out[i] = Math.sin(ph);
    const hz = hzTo === hzFrom ? hzFrom : hzFrom * Math.pow(ratio, Math.min(1, i / glideN));
    ph += (TAU * hz) / SR;
  }
  return out;
}

/** FM（搬送 carrierHz・変調は搬送 × ratio・変調の深さ index が indexDecayS 秒で 1/10 に＝打った後に澄んでいく金属・鐘の音） */
export function fm(n: number, carrierHz: number, ratio: number, index: number, indexDecayS: number): Float32Array {
  const out = new Float32Array(n);
  const k = DECAY_RATIO_LN / Math.max(1, indexDecayS * SR);
  const wc = (TAU * carrierHz) / SR;
  const wm = wc * ratio;
  for (let i = 0; i < n; i++) out[i] = Math.sin(wc * i + index * Math.exp(-k * i) * Math.sin(wm * i));
  return out;
}

/** 標本ごとの掛け算（包絡を掛ける）。a を書き換えて返す */
export function mul(a: Float32Array, b: Float32Array): Float32Array {
  for (let i = 0; i < a.length; i++) a[i] = a[i]! * (b[i] ?? 0);
  return a;
}

/** dst に src × gain を offsetS 秒ずらして足す（はみ出す分は捨てる）。dst を返す */
export function mixInto(dst: Float32Array, src: Float32Array, gain = 1, offsetS = 0): Float32Array {
  const o = sfxSamples(offsetS);
  const n = Math.min(src.length, dst.length - o);
  for (let i = Math.max(0, -o); i < n; i++) dst[i + o] = dst[i + o]! + src[i]! * gain;
  return dst;
}

/** 柔らかい歪み（tanh。drive を上げると倍音が増えて小さいスピーカーでも低い音の芯が聞こえる）。x を書き換えて返す */
export function saturate(x: Float32Array, drive: number): Float32Array {
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i]! * drive);
  return x;
}

export function peakOf(x: Float32Array): number {
  let p = 0;
  for (let i = 0; i < x.length; i++) { const v = Math.abs(x[i]!); if (v > p) p = v; }
  return p;
}

export function rmsOf(x: Float32Array, from = 0, to = x.length): number {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i]! * x[i]!;
  return to > from ? Math.sqrt(s / (to - from)) : 0;
}

export function meanOf(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i]!;
  return x.length > 0 ? s / x.length : 0;
}

/** 零交差の数（符号の変わった回数。音の高さ・明るさの目安＝tests の「遠雷は近い砲より低い」） */
export function zeroCrossings(x: Float32Array, from = 0, to = x.length): number {
  let c = 0;
  for (let i = Math.max(1, from + 1); i < to; i++) if ((x[i]! >= 0) !== (x[i - 1]! >= 0)) c++;
  return c;
}

/** 直流を引く（平均を 0 に）。x を書き換えて返す */
export function removeDc(x: Float32Array): Float32Array {
  const m = meanOf(x);
  for (let i = 0; i < x.length; i++) x[i] = x[i]! - m;
  return x;
}

/** 頂を peak（既定 SFX_PEAK＝0.9）にそろえる。無音はそのまま。x を書き換えて返す */
export function normalizePeak(x: Float32Array, peak = SFX_PEAK): Float32Array {
  const p = peakOf(x);
  if (p <= 0) return x;
  const g = peak / p;
  for (let i = 0; i < x.length; i++) x[i] = x[i]! * g;
  return x;
}

/** 両端を fadeS 秒（既定 2 ms）で 0 へ（最初と最後の標本は 0）。x を書き換えて返す */
export function fadeEdges(x: Float32Array, fadeS = SFX_EDGE_FADE_S): Float32Array {
  const fn = Math.min(sfxSamples(fadeS), x.length >> 1);
  for (let i = 0; i < fn; i++) {
    const g = i / fn;
    x[i] = x[i]! * g;
    x[x.length - 1 - i] = x[x.length - 1 - i]! * g;
  }
  return x;
}

/** 終わりの fadeS 秒を直線で 0 へ（長い尾を表の秒の内で消し切る。torp_hit・sink）。x を書き換えて返す */
export function fadeTail(x: Float32Array, fadeS: number): Float32Array {
  const fn = Math.min(sfxSamples(fadeS), x.length);
  for (let i = 0; i < fn; i++) x[x.length - 1 - i] = x[x.length - 1 - i]! * (i / fn);
  return x;
}

/**
 * ループの継ぎ目の重ね: 長さ n ＋ 重ね（overlapS 秒）の標本から長さ n のループを作る。末尾の重ねの分を頭に等電力（sin・cos）で重ねる＝
 * 終わり（元の n − 1）の次が頭（元の n が消えていく所）につながる。雑音のループ（sea・fire・rain）用。周期の合う音（engine・drone）は整数周期で作って使わない
 */
export function crossfadeLoop(x: Float32Array, n: number, overlapS: number): Float32Array {
  const ov = Math.min(x.length - n, sfxSamples(overlapS));
  const out = x.slice(0, n);
  for (let i = 0; i < ov; i++) {
    const u = ((i + 0.5) / ov) * (Math.PI / 2);
    out[i] = x[i]! * Math.sin(u) + x[n + i]! * Math.cos(u);
  }
  return out;
}

/** 鍵 1 本の作り方: 標本の数 n（表の秒 × SFX_SAMPLE_RATE）を受けて長さ n の標本を返す。直流・端の fade・頂の正規化は assets/sfx-bank がそろえる */
export type SfxRecipe = (n: number) => Float32Array;
