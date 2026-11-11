import { seaTilePixels } from '../../../../../../../../../home/user/ww2-torpedo-boat/src/assets/sea-shape';
import { SEA_TEX, ART_SEED_SEA } from '../../../../../../../../../home/user/ww2-torpedo-boat/src/config/sea-art-config';
for (let i = 0; i < 4; i++) { const t0 = performance.now(); seaTilePixels(ART_SEED_SEA, SEA_TEX); console.log('full', (performance.now() - t0).toFixed(0)); }
const t2 = { ...SEA_TEX, ripple: { ...SEA_TEX.ripple, count: 0 } };
{ const t0 = performance.now(); seaTilePixels(ART_SEED_SEA, t2); console.log('no ripple', (performance.now() - t0).toFixed(0)); }
const t3 = { ...t2, chop: { ...SEA_TEX.chop, count: 0 } };
{ const t0 = performance.now(); seaTilePixels(ART_SEED_SEA, t3); console.log('no chop/ripple', (performance.now() - t0).toFixed(0)); }
const t4 = { ...t3, swell: { ...SEA_TEX.swell, count: 0 } };
{ const t0 = performance.now(); try { seaTilePixels(ART_SEED_SEA, t4); } catch {} console.log('none', (performance.now() - t0).toFixed(0)); }
