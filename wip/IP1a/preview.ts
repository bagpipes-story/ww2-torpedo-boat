// オフラインの海の面の見本: タイルを画面の倍率（1.25 px/m）で、夜・月・昼の色と格子を重ねて PNG に。PARAMS=json で SEA_TEX を上書き
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { seaTilePixels, SEA_TILE_TEX_PX } from '../../../../../../../../../home/user/ww2-torpedo-boat/src/assets/sea-shape';
import { SEA_TEX, ART_SEED_SEA, SEA_LIGHT_ART, SEA_ART_PX_PER_M } from '../../../../../../../../../home/user/ww2-torpedo-boat/src/config/sea-art-config';

function crc32(b: Uint8Array): number { let c = ~0; for (let i = 0; i < b.length; i++) { c ^= b[i]!; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; }
function png(w: number, h: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const t = { ...SEA_TEX, ...(process.env.PARAMS ? JSON.parse(process.env.PARAMS) : {}) };
const light = { ...SEA_LIGHT_ART, ...(process.env.LIGHT ? JSON.parse(process.env.LIGHT) : {}) };
const t0 = Date.now();
const S = Number(process.env.SIZE ?? SEA_TILE_TEX_PX);
const px = seaTilePixels(ART_SEED_SEA, t, S);
console.log('tile ms', Date.now() - t0);
const grid = Number(process.env.GRID ?? 0x1a2540);
const gridA = Number(process.env.GRIDA ?? 1);
const W = 1700, H = 785, SC = Number(process.env.SC ?? 1.25); // canvas px / m
const out = (name: string, bg: number, tint: number, alpha: number) => {
  const rgb = new Uint8Array(W * H * 3);
  const ch = (c: number, s: number) => (c >> s) & 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const mx = x / SC, my = y / SC; // m
    const u = mx * S / 1024, v = my * S / 1024;
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    let g = 0, a = 0;
    for (const [dx, dy, wt] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]] as const) {
      const i = ((((y0 + dy) % S) * S) + ((x0 + dx) % S)) * 4;
      a += (px[i + 3]! / 255) * wt; g += (px[i]! / 255) * (px[i + 3]! / 255) * wt; // premultiplied
    }
    const A = a * alpha;
    const o = (y * W + x) * 3;
    for (let k = 0; k < 3; k++) {
      const sh = 16 - 8 * k;
      let c = ch(bg, sh) * (1 - A) + ch(tint, sh) * g * alpha;
      const onGrid = (mx % 100) < 2 / 1 || (my % 100) < 2;
      if (onGrid) c = c * (1 - gridA) + ch(grid, sh) * gridA;
      rgb[o + k] = Math.max(0, Math.min(255, Math.round(c)));
    }
  }
  writeFileSync(`${process.env.OUT ?? '.'}/${name}.png`, png(W, H, rgb));
};
out('dark', 0x0b1020, light.dark.crest, light.dark.crestAlpha);
out('half', 0x0b1020, light.half.crest, light.half.crestAlpha);
out('day', 0x3b5670, light.day.crest, light.day.crestAlpha);
out('boost', 0x0b1020, 0xffffff, Number(process.env.BOOST ?? 0.5));
// 生のタイル（黒の上に α）
const raw = new Uint8Array(S * S * 3);
for (let i = 0; i < S * S; i++) { const a = px[i * 4 + 3]! / 255, g = px[i * 4]!; raw[i * 3] = raw[i * 3 + 1] = raw[i * 3 + 2] = Math.round(g * a * 0.5 + 64 * (1 - a) * 0); }
writeFileSync(`${process.env.OUT ?? '.'}/raw.png`, png(S, S, raw));
