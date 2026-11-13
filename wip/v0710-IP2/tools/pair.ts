import { SFX_SAMPLE_RATE as SR, type SfxKey } from '/home/user/ww2-torpedo-boat/src/config/sfx-config';
import { renderSfx } from '/home/user/ww2-torpedo-boat/src/assets/sfx-bank';
import { peakOf, rmsOf, zeroCrossings } from '/home/user/ww2-torpedo-boat/src/assets/sfx-dsp';
import { centroidHz } from '/home/user/ww2-torpedo-boat/scripts/sfx-files';
const at = (s: number): number => Math.round(s * SR);
function peakAt(v: Float32Array): number { let a = 0; for (let i = 0; i < v.length; i++) if (Math.abs(v[i]!) > Math.abs(v[a]!)) a = i; return a / SR; }
function len20(v: Float32Array): number { const p = peakOf(v) * 0.1; for (let i = v.length - 1; i >= 0; i--) if (Math.abs(v[i]!) >= p) return i / SR; return 0; }
const f = (v: Float32Array) => ({ cen: centroidHz(v, 0, v.length, SR), zc: zeroCrossings(v) / v.length, head: centroidHz(v, 0, Math.min(v.length, at(0.05)), SR), l20: len20(v) + 0.05, pk: peakAt(v) + 0.02, rms: rmsOf(v) });
const [a, b] = (process.env.P ?? 'splash_l,torp_launch').split(',');
const A = f(renderSfx(a as SfxKey)), B = f(renderSfx(b as SfxKey));
let s = 0; for (const k of Object.keys(A) as (keyof typeof A)[]) { const d = Math.abs(Math.log2(A[k] / B[k])); s += d; console.log(`${k}: ${A[k].toFixed(4)} vs ${B[k].toFixed(4)} → ${d.toFixed(2)}`); } console.log('sum', s.toFixed(2));
