// IP4: 既定 F（renderSfx('torp_launch')）の形の数（tests/sfx-synth-cues の書き直し用）と、単発 21 本の一番近い組
import { SFX_KEYS, SFX_SAMPLE_RATE as SR, SFX_TABLE, type SfxKey } from '/home/user/ww2-torpedo-boat/src/config/sfx-config';
import { renderSfx } from '/home/user/ww2-torpedo-boat/src/assets/sfx-bank';
import { peakOf, rmsOf, zeroCrossings } from '/home/user/ww2-torpedo-boat/src/assets/sfx-dsp';
import { centroidHz, spectrum } from '/home/user/ww2-torpedo-boat/scripts/sfx-files';
const at = (s: number): number => Math.round(s * SR);
function shareAbove(v: Float32Array, hz: number): number { const size = 1024; let hi = 0, all = 0; for (let f = 0; f < v.length; f += size) { const m = spectrum(v, f, Math.min(size, v.length - f), size); for (let i = 1; i < m.length; i++) { const p = m[i]! * m[i]!; all += p; if ((i * SR) / size >= hz) hi += p; } } return all > 0 ? hi / all : 0; }
function peakinessDb(v: Float32Array): number { const size = 1024; const avg = new Float64Array(size / 2); for (let f = 0; f < v.length; f += size / 2) { const m = spectrum(v, f, Math.min(size, v.length - f), size); for (let i = 0; i < m.length; i++) avg[i] = avg[i]! + m[i]! * m[i]!; } const w = Math.round((150 * size) / SR); let best = 0; for (let i = w; i < avg.length - w; i++) { const hz = (i * SR) / size; if (hz < 200 || hz > 6000) continue; const nb: number[] = []; for (let j = -w; j <= w; j++) if (j !== 0) nb.push(avg[i + j]!); nb.sort((a, b) => a - b); best = Math.max(best, avg[i]! / (nb[nb.length >> 1]! + 1e-20)); } return 10 * Math.log10(best); }
function peakAt(v: Float32Array): number { let a = 0; for (let i = 0; i < v.length; i++) if (Math.abs(v[i]!) > Math.abs(v[a]!)) a = i; return a / SR; }
function len20(v: Float32Array): number { const p = peakOf(v) * 0.1; for (let i = v.length - 1; i >= 0; i--) if (Math.abs(v[i]!) >= p) return i / SR; return 0; }
const tl = renderSfx('torp_launch');
console.log(`len ${tl.length} peakAt ${(peakAt(tl) * 1000).toFixed(1)}ms len20 ${(len20(tl) * 1000).toFixed(0)}ms RMS ${rmsOf(tl).toFixed(3)} cen ${centroidHz(tl, 0, tl.length, SR).toFixed(0)}`);
console.log(`>400 ${(shareAbove(tl, 400) * 100).toFixed(1)}% 180-700 ${((shareAbove(tl, 180) - shareAbove(tl, 700)) * 100).toFixed(1)}% >1k ${(shareAbove(tl, 1000) * 100).toFixed(1)}% peaky ${peakinessDb(tl).toFixed(2)}dB`);
const rows: string[] = [];
for (let t = 0; t + 0.05 <= 1.4 + 1e-9; t += 0.05) rows.push(`${t.toFixed(2)}:${(20 * Math.log10(rmsOf(tl, at(t), at(t + 0.05)) + 1e-9)).toFixed(1)}`);
console.log('RMS dB per 50ms', rows.join(' '));
const r10: string[] = [];
for (let t = 0; t + 0.01 <= 0.32; t += 0.01) r10.push(`${(t * 1000).toFixed(0)}:${(20 * Math.log10(rmsOf(tl, at(t), at(t + 0.01)) + 1e-9)).toFixed(1)}`);
console.log('RMS dB per 10ms', r10.join(' '));
const cen = (a: number, b: number): string => centroidHz(tl, at(a), at(b), SR).toFixed(0);
console.log(`centroid head 0-0.03 ${cen(0, 0.03)}  0-0.05 ${cen(0, 0.05)}  slide 0.08-0.22 ${cen(0.08, 0.22)}  splash 0.24-0.34 ${cen(0.24, 0.34)}  0.24-0.6 ${cen(0.24, 0.6)}  bubbles 0.5-1.2 ${cen(0.5, 1.2)}`);
const rm = (a: number, b: number): string => rmsOf(tl, at(a), at(b)).toFixed(4);
console.log(`RMS 0-0.03 ${rm(0, 0.03)} 0.03-0.1 ${rm(0.03, 0.1)} 0.14-0.24 ${rm(0.14, 0.24)} 0.24-0.34 ${rm(0.24, 0.34)} 0.34-0.6 ${rm(0.34, 0.6)} 0.6-1.0 ${rm(0.6, 1.0)} 1.0-1.4 ${rm(1.0, 1.4)}`);
console.log(`>400 head 0-0.05 ${(shareAbove(tl.subarray(0, at(0.05)), 400) * 100).toFixed(1)}%  >400 splash 0.24-0.6 ${(shareAbove(tl.subarray(at(0.24), at(0.6)), 400) * 100).toFixed(1)}%  >1k head ${(shareAbove(tl.subarray(0, at(0.05)), 1000) * 100).toFixed(1)}%`);
console.log(`peak in 0-0.03 ${peakOf(tl.subarray(0, at(0.03))).toFixed(3)} peak in 0.24-0.5 ${peakOf(tl.subarray(at(0.24), at(0.5))).toFixed(3)}`);
const shots = SFX_KEYS.filter((k) => !SFX_TABLE[k].loop);
type F = { k: string; cen: number; zc: number; head: number; l20: number; pk: number; rms: number };
const feat = (k: string, v: Float32Array): F => ({ k, cen: centroidHz(v, 0, v.length, SR), zc: zeroCrossings(v) / v.length, head: centroidHz(v, 0, Math.min(v.length, at(0.05)), SR), l20: len20(v) + 0.05, pk: peakAt(v) + 0.02, rms: rmsOf(v) });
const l = (a: number, b: number): number => Math.abs(Math.log2(a / b));
const dist = (a: F, b: F): number => l(a.cen, b.cen) + l(a.zc, b.zc) + l(a.head, b.head) + l(a.l20, b.l20) + l(a.pk, b.pk) + l(a.rms, b.rms);
const f = shots.map((k) => feat(k, renderSfx(k as SfxKey)));
const all: [number, string][] = [];
for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) all.push([dist(f[i]!, f[j]!), `${f[i]!.k}~${f[j]!.k}`]);
all.sort((a, b) => a[0] - b[0]);
console.log(`shots ${shots.length} worst: ${all.slice(0, 3).map(([d, p]) => `${p} ${d.toFixed(2)}`).join(', ')}`);
console.log(`  nearest torp_launch: ${all.filter(([, p]) => p.split('~').includes('torp_launch')).slice(0, 3).map(([d, p]) => `${p} ${d.toFixed(2)}`).join(', ')}`);
