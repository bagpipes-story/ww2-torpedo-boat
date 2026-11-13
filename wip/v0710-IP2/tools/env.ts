import { SFX_SAMPLE_RATE as SR, type SfxKey } from '/home/user/ww2-torpedo-boat/src/config/sfx-config';
import { renderSfx } from '/home/user/ww2-torpedo-boat/src/assets/sfx-bank';
import { SFX_VARIANT_GROUPS, renderSfxVariant } from '/home/user/ww2-torpedo-boat/src/assets/sfx-variants';
import { peakOf, rmsOf, zeroCrossings } from '/home/user/ww2-torpedo-boat/src/assets/sfx-dsp';
import { centroidHz } from '/home/user/ww2-torpedo-boat/scripts/sfx-files';
const at = (s: number): number => Math.round(s * SR);
const W = Number(process.env.W ?? 0.01);
function show(name: string, v: Float32Array): void {
  const r: string[] = []; for (let a = 0; a + at(W) <= v.length && r.length < Number(process.env.N ?? 40); a += at(W)) r.push((20 * Math.log10(rmsOf(v, a, a + at(W)) + 1e-9)).toFixed(0));
  let pa = 0; for (let i = 0; i < v.length; i++) if (Math.abs(v[i]!) > Math.abs(v[pa]!)) pa = i;
  console.log(`${name}: peakAt ${(pa / SR * 1000).toFixed(1)}ms cen ${(centroidHz(v, 0, v.length, SR)).toFixed(0)} head ${(centroidHz(v, 0, at(0.05), SR)).toFixed(0)} zc ${(zeroCrossings(v) / v.length * SR).toFixed(0)} rms ${rmsOf(v).toFixed(3)}\n  ${W * 1000}ms RMS dB: ${r.join(' ')}`);
}
for (const k of (process.env.KEYS ?? '').split(',').filter(Boolean)) show(k, renderSfx(k as SfxKey));
for (const g of SFX_VARIANT_GROUPS) if (!process.env.G || process.env.G.split(',').includes(g.key)) for (const v of g.variants) show(`${g.key}-${v.id}`, renderSfxVariant(v));
