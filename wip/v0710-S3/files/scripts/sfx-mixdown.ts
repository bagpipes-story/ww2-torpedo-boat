// 音の probe の記録を波形に直す（v0.7.1 S2。spec-v0710 §9.3。scripts/sfx-mix.ts の PROBE=<json> が使う。ゲームは import しない＝開発の道具）。
// scripts/headless/sfx-probe.mjs の記録（鳴らすと決まった単発: 時刻・鍵・音量・パン・rate・声・奪ったか）を、assets/sfx-bank の標本でそのまま足し合わせる
// ＝エンジンの「声 → 単発の束」の出口＝リミッタの前。偽の時計では AnalyserNode が意味を持たないための代わり。
// - rate は直線の補間（WebKit の再生と同じ考え）。奪われた声は、奪った音の時刻で切る（エンジンは前の音源を止める）。
// - 左右: パンのある端末は等電力（左 cos・右 sin。中央は各 0.707）。パンの無い端末（古い iOS）は中央＝モノの和がそのまま両方に出る（一番大きい場合）→ 頂と 1.0 超えはモノの和で数える。
// - 爆発が機銃・水柱に埋もれないか: 爆発の系統（blast_s・blast_l・torp_hit）が鳴り始めてから 0.3 秒の、爆発の束の RMS と、ほかの音（砲・機銃・水柱）の束の RMS の差（dB）。
// - リミッタの模型（limiterGain）: エンジンの DynamicsCompressor（config の閾値・knee・比・立ち上がり・戻り）を、頂の追従（立ち上がり／戻りの 1 極）＋静的な曲線で真似た目安
//   （本物は先読みと戻りの自動調整がある＝数は目安。自動の補正の音量は入れない＝全体に同じ倍率）。閾値 −10 dB・比 12 は 0.32 より上をほぼ頭打ちにするので、リミッタの後では
//   大きい音どうしの頂の差が消える＝爆発が「飛び出して聞こえるか」は、爆発の頭 0.3 秒の出力の RMS と、その直前 1 秒の出力の RMS の差（blastPops）で見る。
// S3（ループ）: probe の記録のループの行（10 Hz で「ノードへ書く」時の 5 本の音量と engine・drone の rate）を、ループの標本でそのまま鳴らした束（loopStem。束の音量 1）。
//   つなぎの 2 つの案を同じ模型で比べる（routeStats）: 「リミッタを通す」＝単発＋ループをリミッタへ（計画の元の形）／「リミッタの後」＝ループは master へ直に（S3 の決め）。
//   出口の数は master の音量と、DynamicsCompressor の自動の補正の音量（模型の曲線の 0 dB の出力の逆数の 0.6 乗＝WebAudio の決め）を掛け、リミッタの先読み（6 ms＝
//   Chromium・WebKit の DynamicsCompressor の既定の遅れ。頭の鋭い音がリミッタの立ち上がりをすり抜けない）を入れる。S2 の数（limiterStats・blastPops）は先読みなしのまま。
import { SFX_LIMITER, SFX_LOOP_TIME_CONSTANT_S, SFX_MASTER_GAIN, SFX_SAMPLE_RATE, SFX_TABLE, type SfxKey } from '../src/config/sfx-config';
import { renderSfx } from '../src/assets/sfx-bank';

const SR = SFX_SAMPLE_RATE;
/** probe の記録の 1 行（scripts/headless/sfx-probe.mjs の install の並び） */
export type ProbeRow = [t: number, key: SfxKey, dx: number, dy: number, rate: number, mul: number, voice: number, drop: number, gain: number, pan: number, band: number, stole: number, flat: number];
/** ループの記録の 1 行（sfx-probe の install）: [時刻, 音量 engine・sea・fire・rain・drone, engine の rate, drone の rate, 書いた数] */
export type LoopRow = [t: number, g0: number, g1: number, g2: number, g3: number, g4: number, rEngine: number, rDrone: number, writes: number];
export interface ProbeCase { name: string; q: string; secs: number; mode: string; t0: number; t1: number; steals: number; maxVoices: number; demand: number; log: ProbeRow[]; loops?: LoopRow[] }

export interface Mixdown {
  /** モノの和（パンなし）・左・右・爆発の束・ほかの束（どれも長さは同じ。時刻 0 は記録の t0） */
  mono: Float32Array; left: Float32Array; right: Float32Array; blast: Float32Array; rest: Float32Array;
  /** 爆発の系統が鳴り始めた標本の位置 */
  blastAt: number[];
  played: number;
}

const cache = new Map<SfxKey, Float32Array>();
function samples(key: SfxKey): Float32Array {
  let x = cache.get(key);
  if (!x) { x = renderSfx(key); cache.set(key, x); }
  return x;
}

/** 記録を波形に（tailS は最後の音が鳴り終わるまでの余り） */
export function mixdown(c: ProbeCase, tailS = 3): Mixdown {
  const n = Math.ceil((c.t1 - c.t0 + tailS) * SR);
  const m: Mixdown = { mono: new Float32Array(n), left: new Float32Array(n), right: new Float32Array(n), blast: new Float32Array(n), rest: new Float32Array(n), blastAt: [], played: 0 };
  const plays = c.log.filter((r) => r[6] >= 0).map((r) => ({ r, stopAt: Infinity }));
  // 奪われた声: 同じ声の前の音を、奪った音の時刻で切る
  const onVoice = new Map<number, { r: ProbeRow; stopAt: number }>();
  for (const p of plays) {
    if (p.r[11] === 1) { const prev = onVoice.get(p.r[6]); if (prev) prev.stopAt = p.r[0]; }
    onVoice.set(p.r[6], p);
  }
  for (const p of plays) {
    const [t, key, , , rate, , , , gain, pan] = p.r;
    const x = samples(key);
    const at = Math.round((t - c.t0) * SR);
    const len = Math.min(Math.floor((x.length - 1) / rate), n - at, p.stopAt === Infinity ? Infinity : Math.round((p.stopAt - t) * SR));
    const a = ((pan + 1) / 2) * (Math.PI / 2);
    const gl = Math.cos(a) * gain, gr = Math.sin(a) * gain;
    const isBlast = SFX_TABLE[key].family === 'blast' && key !== 'sink';
    const stem = isBlast ? m.blast : m.rest;
    if (isBlast) m.blastAt.push(at);
    for (let i = 0; i < len; i++) {
      const pos = i * rate;
      const j = Math.floor(pos);
      const v = x[j]! + (x[j + 1]! - x[j]!) * (pos - j);
      m.mono[at + i] = m.mono[at + i]! + v * gain;
      m.left[at + i] = m.left[at + i]! + v * gl;
      m.right[at + i] = m.right[at + i]! + v * gr;
      stem[at + i] = stem[at + i]! + v * gain;
    }
    m.played++;
  }
  return m;
}

export interface MixStats { peak: number; peakStereo: number; overShare: number; rms: number; worstSecOver: number }

/** 区間 [from, to) の数: モノの和の頂・左右の頂・|モノの和| > 1 の標本の割合・RMS・一番ひどい 1 秒の 1.0 超えの割合 */
export function mixStats(m: Mixdown, from = 0, to = m.mono.length): MixStats {
  let peak = 0, peakStereo = 0, over = 0, sum = 0, worst = 0, secOver = 0;
  for (let i = from; i < to; i++) {
    const a = Math.abs(m.mono[i]!);
    if (a > peak) peak = a;
    const s = Math.max(Math.abs(m.left[i]!), Math.abs(m.right[i]!));
    if (s > peakStereo) peakStereo = s;
    if (a > 1) { over++; secOver++; }
    sum += a * a;
    if ((i - from + 1) % SR === 0 || i === to - 1) { if (secOver / SR > worst) worst = secOver / SR; secOver = 0; }
  }
  const len = Math.max(1, to - from);
  return { peak, peakStereo, overShare: over / len, rms: Math.sqrt(sum / len), worstSecOver: worst };
}

/** 一番混む窓（windowS 秒。鳴らした数が最大。1 秒刻み）の始まりの標本 */
export function busiestWindow(c: ProbeCase, windowS: number): { from: number; count: number } {
  const total = Math.max(1, Math.ceil(c.t1 - c.t0));
  const perSec = new Uint32Array(total + 1);
  for (const r of c.log) if (r[6] >= 0) perSec[Math.min(total, Math.floor(r[0] - c.t0))]!++;
  let best = 0, bestAt = 0;
  for (let s = 0; s + windowS <= total || s === 0; s++) {
    let k = 0;
    for (let i = s; i < Math.min(total + 1, s + windowS); i++) k += perSec[i]!;
    if (k > best) { best = k; bestAt = s; }
  }
  return { from: bestAt * SR, count: best };
}

/** 爆発が埋もれないか: 爆発の頭 headS 秒の（爆発の束 − ほかの束）の RMS の差 dB を、爆発ごとに。戻りは昇順 */
export function blastMargins(m: Mixdown, headS = 0.3): number[] {
  const len = Math.round(headS * SR);
  const out: number[] = [];
  for (const at of m.blastAt) {
    let b = 0, r = 0;
    for (let i = at; i < Math.min(m.mono.length, at + len); i++) { b += m.blast[i]! * m.blast[i]!; r += m.rest[i]! * m.rest[i]!; }
    out.push(10 * Math.log10((b + 1e-12) / (r + 1e-12)));
  }
  return out.sort((x, y) => x - y);
}

/** リミッタの静的な曲線（入力 dB → 出力 dB。閾値＋knee） */
function limiterCurveDb(x: number): number {
  const { thresholdDb: T, kneeDb: K, ratio: R } = SFX_LIMITER;
  const over = x - T;
  return over <= 0 ? x : over < K ? x + ((1 / R - 1) * over * over) / (2 * K) : T + K + ((1 / R - 1) * K) / 2 + (over - K) / R;
}
/** 自動の補正の音量（WebAudio の決め: 曲線の 0 dB の出力の逆数の 0.6 乗。模型の曲線で約 1.56 倍） */
export const LIMITER_MAKEUP = Math.pow(10, (-limiterCurveDb(0) * 0.6) / 20);

/** リミッタの模型: 標本ごとの倍率（1 以下）。左右の大きい方の頂を追い、閾値＋knee の曲線で下げる。add はリミッタに一緒に入る束（S3 の比べ: ループを通す案。左右に同じだけ足す） */
export function limiterGain(m: Mixdown, add?: Float32Array, addGain = 1): Float32Array {
  const { attackS, releaseS } = SFX_LIMITER;
  const up = 1 - Math.exp(-1 / (attackS * SR));
  const down = 1 - Math.exp(-1 / (releaseS * SR));
  const out = new Float32Array(m.mono.length);
  let env = 0;
  for (let i = 0; i < out.length; i++) {
    const e = add ? add[i]! * addGain : 0;
    const a = Math.max(Math.abs(m.left[i]! + e), Math.abs(m.right[i]! + e));
    env += (a > env ? up : down) * (a - env);
    const x = 20 * Math.log10(env + 1e-9);
    out[i] = Math.pow(10, (limiterCurveDb(x) - x) / 20);
  }
  return out;
}

/** リミッタの効き: 区間 [from, to) の、鳴っている標本（|左右| > 0.01）のうち 3 dB より多く下げられた割合と、下げた量の最大 dB */
export function limiterStats(m: Mixdown, g: Float32Array, from = 0, to = g.length): { over3Share: number; maxDb: number } {
  let on = 0, over3 = 0, min = 1;
  for (let i = from; i < to; i++) {
    if (Math.max(Math.abs(m.left[i]!), Math.abs(m.right[i]!)) <= 0.01) continue;
    on++;
    if (g[i]! < 0.708) over3++;
    if (g[i]! < min) min = g[i]!;
  }
  return { over3Share: on > 0 ? over3 / on : 0, maxDb: -20 * Math.log10(min) };
}

/** 爆発が飛び出して聞こえるか: 爆発ごとに（頭 headS 秒の出力の RMS）−（その直前 beforeS 秒の出力の RMS）dB。出力＝左右 × リミッタの模型。戻りは昇順 */
export function blastPops(m: Mixdown, g: Float32Array, headS = 0.3, beforeS = 1): number[] {
  const power = (a: number, b: number): number => {
    let s = 0;
    for (let i = Math.max(0, a); i < Math.min(g.length, b); i++) s += (m.left[i]! * m.left[i]! + m.right[i]! * m.right[i]!) * g[i]! * g[i]!;
    return s / Math.max(1, b - a);
  };
  const h = Math.round(headS * SR), p = Math.round(beforeS * SR);
  return m.blastAt.map((at) => 10 * Math.log10((power(at, at + h) + 1e-9) / (power(at - p, at) + 1e-9))).sort((x, y) => x - y);
}

const loopCache = new Map<string, Float32Array>();
const LOOP_KEYS: readonly SfxKey[] = ['engine', 'sea', 'fire', 'rain', 'drone'];

/** ループの束（S3。束の音量 1・モノ＝左右に同じだけ出る）: 記録の行の目標へ時定数 0.08 秒で寄る音量と rate（engine・drone）で、ループの標本を回す（直線の補間）。長さは n */
export function loopStem(c: ProbeCase, n: number): Float32Array {
  const out = new Float32Array(n);
  const rows = c.loops ?? [];
  const k = 1 - Math.exp(-1 / (SFX_LOOP_TIME_CONSTANT_S * SR));
  for (let li = 0; li < LOOP_KEYS.length; li++) {
    const key = LOOP_KEYS[li]!;
    let x = loopCache.get(key);
    if (!x) { x = renderSfx(key); loopCache.set(key, x); }
    const len = x.length;
    let g = 0, r = 1, gT = 0, rT = 1, ph = 0, ri = 0;
    for (let i = 0; i < n; i++) {
      const t = c.t0 + i / SR;
      while (ri < rows.length && rows[ri]![0] <= t) { const row = rows[ri++]!; gT = row[1 + li]!; rT = li === 0 ? row[6] : li === 4 ? row[7] : 1; }
      g += (gT - g) * k;
      r += (rT - r) * k;
      const j = Math.floor(ph);
      const a = x[j]!, b = x[j + 1 < len ? j + 1 : 0]!;
      out[i] = out[i]! + (a + (b - a) * (ph - j)) * g;
      ph += r;
      if (ph >= len) ph -= len;
    }
  }
  return out;
}

export interface RouteStats {
  /** ループだけの時（単発が鳴っていない標本）: 出口でのループの RMS・リミッタが下げている量の中央値 dB */
  quietLoopRms: number; quietDb: number;
  /** 単発が鳴っている時にループが下げられる量 dB（中央値・95%）＝砲声のたびにエンジンの音が沈む量 */
  duckDb: number; duck95Db: number;
  /** 出口（master と自動の補正の音量の後）の頂・|出口| > 1 の割合・爆発の飛び出し（頭 0.3 秒 − 直前 1 秒。昇順） */
  outPeak: number; outOver: number; pops: number[];
}

/** リミッタの先読み（秒。出口の数だけに使う） */
const LOOKAHEAD_S = 0.006;

/**
 * つなぎの案の数（区間 [from, to)）: through＝ループの束（× bus）を単発と一緒にリミッタへ通す／偽＝リミッタは単発だけで、ループの束（× bus）は後で足す。
 * 出口＝（リミッタの後 × 自動の補正の音量 ＋ 後で足すループ）× master
 */
export function routeStats(m: Mixdown, loops: Float32Array, bus: number, through: boolean, from = 0, to = m.mono.length): RouteStats {
  const g0 = through ? limiterGain(m, loops, bus) : limiterGain(m);
  const n = m.mono.length;
  const la = Math.round(LOOKAHEAD_S * SR);
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) g[i] = g0[i + la < n ? i + la : n - 1]!;
  const outL = new Float32Array(n), outR = new Float32Array(n);
  const quiet: number[] = [], duck: number[] = [];
  let peak = 0, over = 0, qs = 0, qn = 0;
  for (let i = 0; i < n; i++) {
    const lp = loops[i]! * bus;
    const lg = through ? g[i]! * LIMITER_MAKEUP : 1;
    outL[i] = (m.left[i]! * g[i]! * LIMITER_MAKEUP + lp * lg) * SFX_MASTER_GAIN;
    outR[i] = (m.right[i]! * g[i]! * LIMITER_MAKEUP + lp * lg) * SFX_MASTER_GAIN;
    if (i < from || i >= to) continue;
    const a = Math.max(Math.abs(outL[i]!), Math.abs(outR[i]!));
    if (a > peak) peak = a;
    if (a > 1) over++;
    const shot = Math.max(Math.abs(m.left[i]!), Math.abs(m.right[i]!));
    const red = through ? -20 * Math.log10(g[i]!) : 0;
    if (shot < 0.003) { qs += (lp * lg * SFX_MASTER_GAIN) ** 2; qn++; if (i % 64 === 0) quiet.push(red); } else if (shot > 0.05 && i % 64 === 0) duck.push(red);
  }
  const mid = (a: number[], q: number): number => (a.length ? a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))]! : 0);
  const power = (a: number, b: number): number => { let s2 = 0; for (let i = Math.max(0, a); i < Math.min(n, b); i++) s2 += outL[i]! * outL[i]! + outR[i]! * outR[i]!; return s2 / Math.max(1, b - a); };
  const h = Math.round(0.3 * SR), p = SR;
  const pops = m.blastAt.filter((at) => at >= from && at < to).map((at) => 10 * Math.log10((power(at, at + h) + 1e-9) / (power(at - p, at) + 1e-9))).sort((x, y) => x - y);
  return { quietLoopRms: Math.sqrt(qs / Math.max(1, qn)), quietDb: mid(quiet, 0.5), duckDb: mid(duck, 0.5), duck95Db: mid(duck, 0.95), outPeak: peak, outOver: over / Math.max(1, to - from), pops };
}
