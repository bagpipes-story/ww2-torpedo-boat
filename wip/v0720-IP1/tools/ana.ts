// IP1 の耳の代わりの数（scratchpad の道具。repo の src を import して今の木の曲を全部作る）。
// 使い方: npx esbuild <this> --bundle --platform=node --format=esm --outfile=<x>.mjs && node <x>.mjs [WAV 出力先]
// - タイトルの候補: RMS・400 Hz 上・2.5 kHz 上の割合（高い倍音）・3〜6 kHz の割合・平坦さ（300〜6,000 Hz の幾何平均 / 算術平均の中央値）・谷（20 ms の RMS の 10% 点 − 全体）・重心・発音の密度
// - 任務の段: 静か・緊張・戦闘の重ねの出口の RMS・頂・2〜5 kHz の帯の出口の dBFS と割合・発音の密度（毎秒）・谷
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { MUSIC_GAIN, MUSIC_KEYS, MUSIC_LAYER_KEYS, MUSIC_MASTER_GAIN, MUSIC_MOOD_WEIGHTS, MUSIC_SAMPLE_RATE, MUSIC_TITLE_KEYS, MUSIC_WORK_SAMPLES, type MusicKey } from '@repo/src/config/sfx-music-config';
import { renderMusic } from '@repo/src/assets/sfx-music-render';
import { MusicTables } from '@repo/src/assets/sfx-music-synth';
import { spectrum, wavBytes } from '@repo/scripts/sfx-files';

const SR = MUSIC_SAMPLE_RATE;
const db = (v: number): number => 10 * Math.log10(Math.max(v, 1e-30));
const rms = (x: Float32Array): number => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i]! * x[i]!; return Math.sqrt(s / x.length); };
const peak = (x: Float32Array): number => { let p = 0; for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]!)); return p; };

/** 帯のエネルギーの割合（1,024 の FFT を重ねずに）: [lo, hi) Hz の和 / 全部 */
function bandShare(x: Float32Array, lo: number, hi: number): number {
  const size = 1024;
  let b = 0, all = 0;
  for (let from = 0; from + size <= x.length; from += size) {
    const mag = spectrum(x, from, size, size);
    for (let i = 1; i < mag.length; i++) { const p = mag[i]! ** 2, f = (i * SR) / size; all += p; if (f >= lo && f < hi) b += p; }
  }
  return b / all;
}
/** 平坦さ（2,048 の窓ごとに 300〜6,000 Hz の power の幾何平均 / 算術平均。音のある窓だけの中央値） */
function flatness(x: Float32Array): number {
  const size = 2048, out: number[] = [], r = rms(x);
  for (let from = 0; from + size <= x.length; from += size) {
    let s = 0; for (let i = from; i < from + size; i++) s += x[i]! ** 2;
    if (Math.sqrt(s / size) < r * 0.1) continue;
    const mag = spectrum(x, from, size, size);
    let lg = 0, ar = 0, n = 0;
    for (let i = 1; i < mag.length; i++) { const f = (i * SR) / size; if (f < 300 || f >= 6000) continue; const p = mag[i]! ** 2 + 1e-20; lg += Math.log(p); ar += p; n++; }
    out.push(Math.exp(lg / n) / (ar / n));
  }
  out.sort((a, b) => a - b);
  return out[Math.floor(out.length / 2)]!;
}
/** 谷: 20 ms の RMS の 10% 点 − 全体の RMS（dB。乾いて切れる音ほど深い） */
function valley(x: Float32Array): number {
  const w = Math.round(0.02 * SR), lv: number[] = [];
  for (let from = 0; from + w <= x.length; from += w) { let s = 0; for (let i = from; i < from + w; i++) s += x[i]! ** 2; lv.push(db(s / w)); }
  lv.sort((a, b) => a - b);
  return lv[Math.floor(lv.length * 0.1)]! - db(rms(x) ** 2);
}
/**
 * 発音の密度（毎秒）: 1,024 の FFT・512 ずつ進める（23 ms）・RMS を 0.1 にそろえてから・log(1 + 100|X|) の正の差の和（150 Hz〜8 kHz）。
 * 山 = 前後 3 窓で最大 かつ 前後 0.5 秒の平均 × 1.5 ＋ 全体の 99% 点 × 0.05 より大きい。山どうしは 3 窓（70 ms）以上離す
 */
function onsets(x0: Float32Array): number {
  const g = 0.1 / Math.max(1e-9, rms(x0)), x = x0.map((v) => v * g), size = 1024, hop = 512, fl: number[] = [];
  let prev: Float64Array | null = null;
  for (let from = 0; from + size <= x.length; from += hop) {
    const mag = spectrum(x, from, size, size), lg = new Float64Array(mag.length);
    for (let i = 0; i < mag.length; i++) lg[i] = Math.log(1 + 100 * mag[i]!);
    let f = 0;
    if (prev) for (let i = 1; i < mag.length; i++) { const hz = (i * SR) / size; if (hz < 150 || hz > 8000) continue; const d = lg[i]! - prev[i]!; if (d > 0) f += d; }
    fl.push(f); prev = lg;
  }
  const sorted = [...fl].sort((a, b) => a - b), p99 = sorted[Math.floor(sorted.length * 0.99)]!, half = Math.round((0.5 * SR) / hop);
  let n = 0, last = -99;
  for (let t = 1; t < fl.length - 1; t++) {
    let mx = true; for (let k = -3; k <= 3; k++) if (k !== 0 && (fl[t + k] ?? -1) > fl[t]!) mx = false;
    if (!mx) continue;
    let s = 0, c = 0; for (let k = -half; k <= half; k++) { const v = fl[t + k]; if (v !== undefined) { s += v; c++; } }
    if (fl[t]! > (s / c) * 1.5 + p99 * 0.05 && t - last >= 3) { n++; last = t; }
  }
  return n / (x.length / SR);
}
function centroid(x: Float32Array): number {
  const size = 1024; let num = 0, den = 0;
  for (let from = 0; from + size <= x.length; from += size) { const mag = spectrum(x, from, size, size); for (let i = 1; i < mag.length; i++) { const p = mag[i]! ** 2; num += p * (i * SR) / size; den += p; } }
  return num / den;
}

const tables = new MusicTables(), work = new Float32Array(MUSIC_WORK_SAMPLES);
const xs = {} as Record<MusicKey, Float32Array>;
for (const k of MUSIC_KEYS) xs[k] = renderMusic(k, Infinity, tables, work);
const out = process.argv[2] ?? '';
if (out) mkdirSync(out, { recursive: true });
const f1 = (v: number): string => v.toFixed(1), pc = (v: number): string => `${(v * 100).toFixed(1)}%`;
console.log('タイトルの候補（標本そのもの・頂 0.9）');
for (const k of MUSIC_TITLE_KEYS) {
  const x = xs[k];
  console.log(`${k.padEnd(9)} ${f1(x.length / SR)} 秒  RMS ${f1(db(rms(x) ** 2))}  >400 ${pc(bandShare(x, 400, 1e9))}  >2.5k ${pc(bandShare(x, 2500, 1e9))}  3〜6k ${pc(bandShare(x, 3000, 6000))}  平坦さ ${flatness(x).toFixed(4)}  谷 ${f1(valley(x))} dB  重心 ${centroid(x).toFixed(0)} Hz  発音 ${f1(onsets(x))}/秒`);
  if (out) writeFileSync(join(out, `${k}.wav`), wavBytes(x, SR));
}
const n = xs.mission_l0.length;
const mix = (m: number): Float32Array => {
  const y = new Float32Array(n), w = MUSIC_MOOD_WEIGHTS[m]!;
  MUSIC_LAYER_KEYS.forEach((k, li) => { const x = xs[k], g = w[li]! * MUSIC_GAIN[k] * MUSIC_MASTER_GAIN; if (g) for (let i = 0; i < n; i++) y[i] = y[i]! + x[i % x.length]! * g; });
  return y;
};
console.log('任務の段（出口＝層の音量 × 重さ × master 0.8）');
const res: Record<string, number>[] = [];
for (const m of [0, 1, 2]) {
  const y = mix(m), r = db(rms(y) ** 2), s25 = bandShare(y, 2000, 5000), o = onsets(y);
  res.push({ r, s25, o, b25: r + db(s25) });
  console.log(`${['静か', '緊張', '戦闘'][m]}  出口 RMS ${f1(r)} dBFS  頂 ${peak(y).toFixed(3)}  2〜5 kHz の帯 ${f1(r + db(s25))} dBFS（割合 ${pc(s25)}）  >400 ${pc(bandShare(y, 400, 1e9))}  <200 ${pc(bandShare(y, 0, 200))}  発音 ${f1(o)}/秒  谷 ${f1(valley(y))} dB  重心 ${centroid(y).toFixed(0)} Hz`);
  if (out) writeFileSync(join(out, `mix-${m}.wav`), wavBytes(y.map((v) => v / peak(y) * 0.9), SR));
}
console.log(`戦闘 ÷ 緊張: 発音 ×${(res[2]!.o! / res[1]!.o!).toFixed(2)}・2〜5 kHz の帯 ${f1(res[2]!.b25! - res[1]!.b25!)} dB・RMS ${f1(res[2]!.r! - res[1]!.r!)} dB`);
for (const k of MUSIC_LAYER_KEYS) console.log(`${k} 単独: 発音 ${f1(onsets(xs[k]))}/秒  2〜5 kHz ${pc(bandShare(xs[k], 2000, 5000))}  谷 ${f1(valley(xs[k]))} dB`);
