// scratch: 単発 20 本の 重心・零交差・>400 Hz の割合・RMS・長さの表と、近い組の距離
import { SFX_KEYS, SFX_SAMPLE_RATE as SR, SFX_TABLE } from '/home/user/ww2-torpedo-boat/src/config/sfx-config';
import { renderSfx } from '/home/user/ww2-torpedo-boat/src/assets/sfx-bank';
import { rmsOf, zeroCrossings, peakOf } from '/home/user/ww2-torpedo-boat/src/assets/sfx-dsp';
import { centroidHz, spectrum } from '/home/user/ww2-torpedo-boat/scripts/sfx-files';
function shareAbove(x: Float32Array, hz: number): number { const size = 1024; let hi = 0, all = 0; for (let f = 0; f < x.length; f += size) { const m = spectrum(x, f, Math.min(size, x.length - f), size); for (let i = 1; i < m.length; i++) { const p = m[i]! * m[i]!; all += p; if ((i * SR) / size >= hz) hi += p; } } return hi / all; }
function len20(x: Float32Array): number { const p = peakOf(x) * 0.1; for (let i = x.length - 1; i >= 0; i--) if (Math.abs(x[i]!) >= p) return i / SR; return 0; }
const rows: { k: string; cen: number; zc: number; hi: number; rms: number; l20: number; head: number; pk: number }[] = [];
for (const k of SFX_KEYS) {
  if (SFX_TABLE[k].loop) continue;
  const x = renderSfx(k);
  rows.push({ k, cen: centroidHz(x, 0, x.length, SR), zc: (zeroCrossings(x) * SR) / x.length / 2, hi: shareAbove(x, 400), rms: rmsOf(x), l20: len20(x), head: centroidHz(x, 0, Math.min(x.length, Math.round(0.05 * SR)), SR), pk: (() => { let a = 0; for (let i = 0; i < x.length; i++) if (Math.abs(x[i]!) > Math.abs(x[a]!)) a = i; return a / SR; })() });
}
console.log('key           centroid  head50ms  zc/2(Hz)  >400Hz  RMS     -20dB(s)  頂(s)');
for (const r of rows) console.log(`${r.k.padEnd(13)} ${r.cen.toFixed(0).padStart(8)}  ${r.head.toFixed(0).padStart(8)}  ${r.zc.toFixed(0).padStart(8)}  ${(r.hi * 100).toFixed(0).padStart(5)}%  ${r.rms.toFixed(3)}   ${r.l20.toFixed(2)}     ${r.pk.toFixed(3)}`);
// 距離: log 重心・log 零交差・-20dB の長さ・頭の重心 の差の和（目安）
const d = (a: typeof rows[0], b: typeof rows[0]): number => Math.abs(Math.log2(a.cen / b.cen)) + Math.abs(Math.log2(a.zc / b.zc)) + Math.abs(Math.log2(a.head / b.head)) + Math.abs(Math.log2((a.l20 + 0.05) / (b.l20 + 0.05))) + Math.abs(Math.log2((a.pk + 0.02) / (b.pk + 0.02)));
const pairs: [string, string, number][] = [];
for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) pairs.push([rows[i]!.k, rows[j]!.k, d(rows[i]!, rows[j]!)]);
pairs.sort((a, b) => a[2] - b[2]);
console.log('一番近い 10 組（距離＝log2 の差の和: 重心・零交差・頭の重心・-20dB の長さ・頂の位置）'); for (const p of pairs.slice(0, 10)) console.log(`  ${p[0]} ~ ${p[1]}: ${p[2].toFixed(2)}`);
