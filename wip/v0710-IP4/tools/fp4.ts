import { renderSfx } from '/home/user/ww2-torpedo-boat/src/assets/sfx-bank';
import { SFX_VARIANT_GROUPS, renderSfxVariant } from '/home/user/ww2-torpedo-boat/src/assets/sfx-variants';
import { SFX_KEYS, SFX_TABLE, SFX_SAMPLE_RATE } from '/home/user/ww2-torpedo-boat/src/config/sfx-config';
function fp(x: Float32Array): number { let h = 0x811c9dc5; for (let i = 0; i < x.length; i++) { const v = Math.round(x[i]! * 32767) & 0xffff; h = Math.imul(h ^ (v & 0xff), 0x01000193) >>> 0; h = Math.imul(h ^ (v >>> 8), 0x01000193) >>> 0; } return h; }
const g = SFX_VARIANT_GROUPS[2]!;
const F = g.variants.find((v) => v.id === 'F')!;
const a = renderSfx('torp_launch'), b = renderSfxVariant(F);
console.log('default', g.defaultId, 'len', a.length, b.length, 'fp game', fp(a), 'fp lab F', fp(b), 'bit-identical', Buffer.from(a.buffer).equals(Buffer.from(b.buffer)));
for (const gg of SFX_VARIANT_GROUPS) console.log(gg.key, gg.defaultId, gg.variants.map((v) => `${v.id}:${fp(renderSfxVariant(v))}`).join(' '));
console.log('total', SFX_KEYS.reduce((s, k) => s + Math.round(SFX_TABLE[k].seconds * SFX_SAMPLE_RATE), 0));
