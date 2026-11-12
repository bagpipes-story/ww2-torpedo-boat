// 音の probe の記録を波形に直す（v0.7.1 S2。spec-v0710 §9.3。scripts/sfx-mix.ts の PROBE=<json> が使う。ゲームは import しない＝開発の道具）。
// scripts/headless/sfx-probe.mjs の記録（鳴らすと決まった単発: 時刻・鍵・音量・パン・rate・声・奪ったか）を、assets/sfx-bank の標本でそのまま足し合わせる
// ＝エンジンの「声 → 単発の束」の出口＝リミッタの前。偽の時計では AnalyserNode が意味を持たないための代わり。
// - rate は直線の補間（WebKit の再生と同じ考え）。奪われた声は、奪った音の時刻で切る（エンジンは前の音源を止める）。
// - 左右: パンのある端末は等電力（左 cos・右 sin。中央は各 0.707）。パンの無い端末（古い iOS）は中央＝モノの和がそのまま両方に出る（一番大きい場合）→ 頂と 1.0 超えはモノの和で数える。
// - 爆発が機銃・水柱に埋もれないか: 爆発の系統（blast_s・blast_l・torp_hit）が鳴り始めてから 0.3 秒の、爆発の束の RMS と、ほかの音（砲・機銃・水柱）の束の RMS の差（dB）。
// - リミッタの模型（limiterGain）: エンジンの DynamicsCompressor（config の閾値・knee・比・立ち上がり・戻り）を、頂の追従（立ち上がり／戻りの 1 極）＋静的な曲線で真似た目安
//   （本物は先読みと戻りの自動調整がある＝数は目安。自動の補正の音量は入れない＝全体に同じ倍率）。閾値 −10 dB・比 12 は 0.32 より上をほぼ頭打ちにするので、リミッタの後では
//   大きい音どうしの頂の差が消える＝爆発が「飛び出して聞こえるか」は、爆発の頭 0.3 秒の出力の RMS と、その直前 1 秒の出力の RMS の差（blastPops）で見る。
import { SFX_LIMITER, SFX_SAMPLE_RATE, SFX_TABLE, type SfxKey } from '../src/config/sfx-config';
import { renderSfx } from '../src/assets/sfx-bank';

const SR = SFX_SAMPLE_RATE;
/** probe の記録の 1 行（scripts/headless/sfx-probe.mjs の install の並び） */
export type ProbeRow = [t: number, key: SfxKey, dx: number, dy: number, rate: number, mul: number, voice: number, drop: number, gain: number, pan: number, band: number, stole: number, flat: number];
export interface ProbeCase { name: string; q: string; secs: number; mode: string; t0: number; t1: number; steals: number; maxVoices: number; demand: number; log: ProbeRow[] }

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

/** リミッタの模型: 標本ごとの倍率（1 以下）。左右の大きい方の頂を追い、閾値＋knee の曲線で下げる */
export function limiterGain(m: Mixdown): Float32Array {
  const { thresholdDb: T, kneeDb: K, ratio: R, attackS, releaseS } = SFX_LIMITER;
  const up = 1 - Math.exp(-1 / (attackS * SR));
  const down = 1 - Math.exp(-1 / (releaseS * SR));
  const out = new Float32Array(m.mono.length);
  let env = 0;
  for (let i = 0; i < out.length; i++) {
    const a = Math.max(Math.abs(m.left[i]!), Math.abs(m.right[i]!));
    env += (a > env ? up : down) * (a - env);
    const x = 20 * Math.log10(env + 1e-9);
    const over = x - T;
    const y = over <= 0 ? x : over < K ? x + ((1 / R - 1) * over * over) / (2 * K) : T + K + ((1 / R - 1) * K) / 2 + (over - K) / R;
    out[i] = Math.pow(10, (y - x) / 20);
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
