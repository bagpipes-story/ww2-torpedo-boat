import { SFX_VARIANT_GROUPS, renderSfxVariant } from '/home/user/ww2-torpedo-boat/src/assets/sfx-variants';
function fp(x: Float32Array): number { let h = 0x811c9dc5; for (let i = 0; i < x.length; i++) { const v = Math.round(x[i]! * 32767) & 0xffff; h = Math.imul(h ^ (v & 0xff), 0x01000193) >>> 0; h = Math.imul(h ^ (v >>> 8), 0x01000193) >>> 0; } return h; }
for (const g of SFX_VARIANT_GROUPS) console.log(g.key, g.variants.map((v) => `${v.id}:${fp(renderSfxVariant(v))}`).join(' '));
