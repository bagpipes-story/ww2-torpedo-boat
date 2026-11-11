import { seaTilePixels, SEA_TILE_TEX_PX, seaField, seaShadeInto } from '../../../../../../../../../home/user/ww2-torpedo-boat/src/assets/sea-shape';
import { ART_SEED_SEA, SEA_LIGHT_ART } from '../../../../../../../../../home/user/ww2-torpedo-boat/src/config/sea-art-config';
const S = SEA_TILE_TEX_PX; const px = seaTilePixels(ART_SEED_SEA);
let maxD = 0, maxW = 0, minA = 1e9, maxA = 0, sumA = 0;
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const i = (y * S + x) * 4, a = px[i + 3]!; minA = Math.min(minA, a); maxA = Math.max(maxA, a); sumA += a;
  const j = (y * S + ((x + 1) % S)) * 4; const k = (((y + 1) % S) * S + x) * 4;
  const pa = (q: number) => px[q + 3]! * px[q]! / 255; // 白の量
  const d = Math.max(Math.abs(pa(i) - pa(j)), Math.abs(pa(i) - pa(k)));
  if (x === S - 1 || y === S - 1) maxW = Math.max(maxW, d); else maxD = Math.max(maxD, d);
}
console.log({ maxD, maxW, minA, maxA, meanA: sumA / S / S });
// composite luminance for lights
const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
for (const [name, bg] of [['dark', 0x0b1020], ['half', 0x0b1020], ['full', 0x0b1020], ['day', 0x3b5670]] as const) {
  const L = SEA_LIGHT_ART[name]; const vals: number[] = []; let mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < S * S; i++) {
    const a = px[i * 4 + 3]! / 255 * L.crestAlpha, g = px[i * 4]! / 255;
    const ch = (sh: number) => ((bg >> sh) & 255) * (1 - a) + ((L.crest >> sh) & 255) * g * a;
    const r = ch(16), gg = ch(8), b = ch(0); mr += r; mg += gg; mb += b; vals.push(lum(r, gg, b));
  }
  vals.sort((p, q) => p - q);
  console.log(name, 'p50', vals[S * S / 2]!.toFixed(1), 'p95', vals[Math.floor(S * S * 0.95)]!.toFixed(1), 'p99.9', vals[Math.floor(S * S * 0.999)]!.toFixed(1), 'max', vals[S * S - 1]!.toFixed(1), 'mean rgb', (mr / S / S).toFixed(0), (mg / S / S).toFixed(0), (mb / S / S).toFixed(0), 'bg lum', lum((bg >> 16) & 255, (bg >> 8) & 255, bg & 255).toFixed(1));
}
console.log('grid lum', lum(0x26, 0x37, 0x5c));
const f = seaField(ART_SEED_SEA); const o = new Float32Array(3), o2 = new Float32Array(3);
let md = 0; for (let k = 0; k < 200; k++) { const x = k * 13.7, y = k * 7.3; seaShadeInto(o, f, x, y); seaShadeInto(o2, f, x + 1024, y - 2048); md = Math.max(md, Math.abs(o[0]! - o2[0]!), Math.abs(o[1]! - o2[1]!)); }
console.log('period diff', md);
