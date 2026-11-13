// IP2 の数（scratchpad）: 試聴の案（弾倉の始め・終わり・魚雷の発射 × A〜D）ごとに 180〜700 Hz の割合・400 Hz より上・1 kHz より上・平坦さ（Wiener entropy・エネルギーの重み）・
// 平均スペクトルの頂／平均（dB。200 Hz〜5 kHz）・−20 dB までの長さ・頂の位置・RMS・打の数、同じ音の案どうしの距離（tests の 6 つの数）。OUT=<dir> で WAV と声紋の帯を書く
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SFX_KEYS, SFX_SAMPLE_RATE as SR, SFX_TABLE, type SfxKey } from '/home/user/ww2-torpedo-boat/src/config/sfx-config';
import { renderSfx } from '/home/user/ww2-torpedo-boat/src/assets/sfx-bank';
import { SFX_VARIANT_GROUPS, renderSfxVariant } from '/home/user/ww2-torpedo-boat/src/assets/sfx-variants';
import { peakOf, rmsOf, zeroCrossings } from '/home/user/ww2-torpedo-boat/src/assets/sfx-dsp';
import { STRIP_H, STRIP_W, centroidHz, drawStrip, pngBytes, spectrum, wavBytes } from '/home/user/ww2-torpedo-boat/scripts/sfx-files';
const at = (s: number): number => Math.round(s * SR);
const SIZE = 1024;
function frames(v: Float32Array): Float64Array[] { const o: Float64Array[] = []; for (let f = 0; f < v.length; f += SIZE / 2) o.push(spectrum(v, f, Math.min(SIZE, v.length - f), SIZE)); return o; }
function share(v: Float32Array, lo: number, hi: number): number { let s = 0, a = 0; for (const m of frames(v)) for (let i = 1; i < m.length; i++) { const p = m[i]! ** 2, f = (i * SR) / SIZE; a += p; if (f >= lo && f < hi) s += p; } return a > 0 ? s / a : 0; }
/** 平坦さ: 枠ごとの幾何平均 / 算術平均（200 Hz〜6 kHz の帯）をエネルギーで重み付け平均（1＝白色雑音・0 に近い＝高さのある音） */
function flatness(v: Float32Array): number { let num = 0, den = 0; for (const m of frames(v)) { let lg = 0, ar = 0, k = 0, e = 0; for (let i = 1; i < m.length; i++) { const f = (i * SR) / SIZE; if (f < 200 || f > 6000) continue; const p = m[i]! ** 2 + 1e-20; lg += Math.log(p); ar += p; k++; e += p; } if (k === 0 || ar <= 0) continue; num += e * (Math.exp(lg / k) / (ar / k)); den += e; } return den > 0 ? num / den : 0; }
/** 平均スペクトル（エネルギー）の局所の頂の強さ: 各 bin ÷ 前後 ±150 Hz の中央値の最大（dB。200 Hz〜6 kHz）＝高さ（音程）の目立ち */
function peakiness(v: Float32Array): number { const fr = frames(v); const avg = new Float64Array(SIZE / 2); for (const m of fr) for (let i = 0; i < m.length; i++) avg[i] = avg[i]! + m[i]! ** 2; const w = Math.round((150 * SIZE) / SR); let best = 0; for (let i = w; i < avg.length - w; i++) { const f = (i * SR) / SIZE; if (f < 200 || f > 6000) continue; const nb: number[] = []; for (let j = -w; j <= w; j++) if (j) nb.push(avg[i + j]!); nb.sort((a, b) => a - b); const r = avg[i]! / (nb[nb.length >> 1]! + 1e-20); if (r > best) best = r; } return 10 * Math.log10(best); }
function peakAt(v: Float32Array): number { let a = 0; for (let i = 0; i < v.length; i++) if (Math.abs(v[i]!) > Math.abs(v[a]!)) a = i; return a / SR; }
function len20(v: Float32Array): number { const p = peakOf(v) * 0.1; for (let i = v.length - 1; i >= 0; i--) if (Math.abs(v[i]!) >= p) return i / SR; return 0; }
function bursts(v: Float32Array): number[] { const w = at(0.02); const r: number[] = []; for (let a = 0; a + w <= v.length; a += w) r.push(rmsOf(v, a, a + w)); const top = Math.max(...r); const o: number[] = []; for (let i = 0; i < r.length; i++) if (r[i]! > top * 0.4 && (i === 0 || r[i]! > r[i - 1]!) && (i === r.length - 1 || r[i]! >= r[i + 1]!)) o.push(i * 20); return o; }
type F = { k: string; cen: number; zc: number; head: number; l20: number; pk: number; rms: number };
const feat = (k: string, v: Float32Array): F => ({ k, cen: centroidHz(v, 0, v.length, SR), zc: zeroCrossings(v) / v.length, head: centroidHz(v, 0, Math.min(v.length, at(0.05)), SR), l20: len20(v) + 0.05, pk: peakAt(v) + 0.02, rms: rmsOf(v) });
const l = (a: number, b: number): number => Math.abs(Math.log2(a / b));
const dist = (a: F, b: F): number => l(a.cen, b.cen) + l(a.zc, b.zc) + l(a.head, b.head) + l(a.l20, b.l20) + l(a.pk, b.pk) + l(a.rms, b.rms);
const pct = (x: number): string => `${(x * 100).toFixed(0)}%`;
const out = process.env.OUT;
if (out) mkdirSync(out, { recursive: true });
const strips: Float32Array[] = [];
for (const g of SFX_VARIANT_GROUPS) {
  const fs: F[] = [];
  for (const v of g.variants) {
    const t0 = performance.now(); const x = renderSfxVariant(v); const ms = performance.now() - t0;
    fs.push(feat(v.id, x));
    strips.push(x);
    if (out) writeFileSync(join(out, `${g.key}-${v.id}.wav`), wavBytes(x, SR));
    console.log(`${g.key.padEnd(11)} ${v.id}${v.id === g.defaultId ? '*' : ' '} ${v.seconds}s synth ${ms.toFixed(1)}ms | 180-700 ${pct(share(x, 180, 700))} >400 ${pct(share(x, 400, 1e9))} >1k ${pct(share(x, 1000, 1e9))} | flat ${flatness(x).toFixed(3)} peaky ${peakiness(x).toFixed(1)}dB | -20dB ${(len20(x) * 1000).toFixed(0)}ms peakAt ${(peakAt(x) * 1000).toFixed(1)}ms RMS ${rmsOf(x).toFixed(3)} cen ${(centroidHz(x, 0, x.length, SR) / 1000).toFixed(2)}k bursts ${bursts(x).join(',')}`);
  }
  const ds: string[] = [];
  for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) ds.push(`${fs[i]!.k}${fs[j]!.k} ${dist(fs[i]!, fs[j]!).toFixed(2)}`);
  console.log(`  pairwise: ${ds.join('  ')}`);
}
// 単発の全部（既定）の距離で一番近い組
const shots = SFX_KEYS.filter((k) => !SFX_TABLE[k].loop);
const f = shots.map((k) => feat(k, renderSfx(k as SfxKey)));
const all: [number, string][] = [];
for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) all.push([dist(f[i]!, f[j]!), `${f[i]!.k}~${f[j]!.k}`]);
all.sort((a, b) => a[0] - b[0]);
console.log(`shots ${shots.length} worst: ${all.slice(0, 3).map(([d, p]) => `${p} ${d.toFixed(2)}`).join(', ')}`);
for (const k of ['reload', 'reload_end', 'torp_launch']) console.log(`  nearest ${k}: ${all.filter(([, p]) => p.split('~').includes(k)).slice(0, 3).map(([d, p]) => `${p} ${d.toFixed(2)}`).join(', ')}`);
const total = SFX_KEYS.reduce((a, k) => a + Math.round(SFX_TABLE[k].seconds * SR), 0);
console.log(`total samples ${total}`);
if (out) { const rgb = new Uint8Array(STRIP_W * STRIP_H * strips.length * 3); strips.forEach((s, i) => drawStrip(rgb, i * STRIP_H, s)); writeFileSync(join(out, 'variants-strip.png'), pngBytes(rgb, STRIP_W, STRIP_H * strips.length)); }
