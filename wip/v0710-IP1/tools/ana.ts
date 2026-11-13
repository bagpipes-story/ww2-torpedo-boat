// IP1 の数（scratchpad）: reload・torp_launch の 長さ・RMS・区間の重心・400 Hz 上の割合・−20 dB・打の数・聞き分けの距離
import { SFX_KEYS, SFX_SAMPLE_RATE as SR, SFX_TABLE, type SfxKey } from '/home/user/ww2-torpedo-boat/src/config/sfx-config';
import { renderSfx } from '/home/user/ww2-torpedo-boat/src/assets/sfx-bank';
import { peakOf, rmsOf, zeroCrossings } from '/home/user/ww2-torpedo-boat/src/assets/sfx-dsp';
import { centroidHz, spectrum } from '/home/user/ww2-torpedo-boat/scripts/sfx-files';
const at = (s: number): number => Math.round(s * SR);
function shareAbove(v: Float32Array, hz: number): number { const size = 1024; let hi = 0, all = 0; for (let f = 0; f < v.length; f += size) { const m = spectrum(v, f, Math.min(size, v.length - f), size); for (let i = 1; i < m.length; i++) { const p = m[i]! * m[i]!; all += p; if ((i * SR) / size >= hz) hi += p; } } return all > 0 ? hi / all : 0; }
function peakAt(v: Float32Array): number { let a = 0; for (let i = 0; i < v.length; i++) if (Math.abs(v[i]!) > Math.abs(v[a]!)) a = i; return a / SR; }
function len20(v: Float32Array): number { const p = peakOf(v) * 0.1; for (let i = v.length - 1; i >= 0; i--) if (Math.abs(v[i]!) >= p) return i / SR; return 0; }
function bursts(v: Float32Array): number[] { const w = at(0.02); const r: number[] = []; for (let a = 0; a + w <= v.length; a += w) r.push(rmsOf(v, a, a + w)); const top = Math.max(...r); const o: number[] = []; for (let i = 0; i < r.length; i++) if (r[i]! > top * 0.4 && (i === 0 || r[i]! > r[i - 1]!) && (i === r.length - 1 || r[i]! >= r[i + 1]!)) o.push(i * 20); return o; }
const db = (x: number): string => (20 * Math.log10(x)).toFixed(1);
const memo = new Map<SfxKey, Float32Array>();
const x = (k: SfxKey): Float32Array => { if (!memo.has(k)) memo.set(k, renderSfx(k)); return memo.get(k)!; };
for (const k of ['reload', 'torp_launch'] as SfxKey[]) {
  const v = x(k); const n3 = Math.round(v.length / 3);
  const cen = [0, 1, 2].map((t) => (centroidHz(v, t * n3, Math.min(v.length, (t + 1) * n3), SR) / 1000).toFixed(2)).join('/');
  const r3 = [0, 1, 2].map((t) => db(rmsOf(v, t * n3, Math.min(v.length, (t + 1) * n3)))).join('/');
  console.log(`${k}: ${SFX_TABLE[k].seconds}s RMS ${rmsOf(v).toFixed(4)} (${db(rmsOf(v))} dB) thirds RMS ${r3} dB centroid ${cen} kHz all ${(centroidHz(v, 0, v.length, SR) / 1000).toFixed(2)} | >400 ${(shareAbove(v, 400) * 100).toFixed(0)}% >1k ${(shareAbove(v, 1000) * 100).toFixed(0)}% | -20dB ${(len20(v) * 1000).toFixed(0)} ms | peakAt ${(peakAt(v) * 1000).toFixed(1)} ms | bursts ${bursts(v).join(',')} ms`);
}
const tl = x('torp_launch');
const w = (a: number, b: number): string => db(rmsOf(tl, at(a), at(b)));
console.log(`torp 50ms windows: ${[...Array(20).keys()].map((i) => w(i * 0.05, i * 0.05 + 0.05)).join(' ')}`);
const shots = SFX_KEYS.filter((k) => !SFX_TABLE[k].loop);
const f = shots.map((k) => { const v = x(k); return { k, cen: centroidHz(v, 0, v.length, SR), zc: zeroCrossings(v) / v.length, head: centroidHz(v, 0, Math.min(v.length, at(0.05)), SR), l20: len20(v) + 0.05, pk: peakAt(v) + 0.02, rms: rmsOf(v) }; });
const l = (a: number, b: number): number => Math.abs(Math.log2(a / b));
const ds: [number, string][] = [];
for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) { const a = f[i]!, b = f[j]!; ds.push([l(a.cen, b.cen) + l(a.zc, b.zc) + l(a.head, b.head) + l(a.l20, b.l20) + l(a.pk, b.pk) + l(a.rms, b.rms), `${a.k}~${b.k}`]); }
ds.sort((a, b) => a[0] - b[0]);
console.log('worst overall:', ds.slice(0, 3).map(([d, p]) => `${p} ${d.toFixed(2)}`).join(', '));
for (const k of ['reload', 'torp_launch']) console.log(`worst ${k}:`, ds.filter(([, p]) => p.split('~').includes(k)).slice(0, 4).map(([d, p]) => `${p} ${d.toFixed(2)}`).join(', '));
console.log(`torp vs gun_near/blast_s/splash_l:`, ds.filter(([, p]) => p.includes('torp_launch') && /gun_near|blast_s|splash_l/.test(p)).map(([d, p]) => `${p} ${d.toFixed(2)}`).join(', '));
console.log(`test: torp splash rms(.37-.47) ${w(0.37, 0.47)} vs (.27-.37) ${w(0.27, 0.37)}`);
