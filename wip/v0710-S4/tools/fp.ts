import { renderSfx } from '/home/user/ww2-torpedo-boat/src/assets/sfx-bank';
function fingerprint16(x: Float32Array): number { let h = 0x811c9dc5; for (let i = 0; i < x.length; i++) { const v = Math.round(x[i]! * 32767) & 0xffff; h = Math.imul(h ^ (v & 0xff), 0x01000193) >>> 0; h = Math.imul(h ^ (v >>> 8), 0x01000193) >>> 0; } return h; }
for (const k of ['torp_launch', 'hull_hit', 'alarm', 'light_on', 'flare_pop', 'bomb_fall', 'reload', 'smoke', 'bell', 'engine_cough'] as const) console.log(`  ${k}: ${fingerprint16(renderSfx(k))},`);
