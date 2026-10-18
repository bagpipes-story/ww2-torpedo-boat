// PWA のアイコン（v0.5.1）をプレースホルダーの図形で作る（CLAUDE.md §2: v0.6 までは画像制作をしない。起動時のテクスチャと同じく図形だけ）。
// 夜の海（#0b1020）に白い魚雷艇（上向き）と、艇首から扇に開く 2 本の雷跡（点線）。依存なし（PNG は zlib で自前に書く）。
// 出力: public/icons/ の apple-touch-icon（180）・icon-192・icon-512・icon-maskable-512（図形を中央 80% に縮める）。作り直したら PNG ごと commit する。
// 実行: npx esbuild scripts/make-icons.ts --bundle --platform=node --format=esm --outfile=<scratch>/make-icons.mjs && node <scratch>/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

type Rgb = readonly [number, number, number];
const SEA: Rgb = [0x0b, 0x10, 0x20];
const BOAT: Rgb = [0xe6, 0xee, 0xf7];
const WAKE: Rgb = [0xe8, 0xd4, 0x8a];

/** 0〜1 の正方形の座標。艇（上向きの細長い五角形）と、艇首から左右へ開く雷跡（点線） */
const HULL: readonly (readonly [number, number])[] = [
  [0.5, 0.4],
  [0.575, 0.52],
  [0.575, 0.86],
  [0.425, 0.86],
  [0.425, 0.52],
];
const WAKES: readonly (readonly [number, number, number, number])[] = [
  [0.47, 0.36, 0.33, 0.1],
  [0.53, 0.36, 0.67, 0.1],
];
const WAKE_HALF_WIDTH = 0.018;
/** 点線の 1 周期（線分の長さに対する割合）と、描く部分の割合 */
const DASH_PERIOD = 0.2;
const DASH_ON = 0.6;

function insidePolygon(x: number, y: number, pts: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** 点線の雷跡の上か（線分への距離と、線分に沿った位置で点線を切る） */
function onWake(x: number, y: number): boolean {
  for (const [x1, y1, x2, y2] of WAKES) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    const t = ((x - x1) * dx + (y - y1) * dy) / len2;
    if (t < 0 || t > 1) continue;
    const px = x1 + t * dx - x;
    const py = y1 + t * dy - y;
    if (px * px + py * py > WAKE_HALF_WIDTH * WAKE_HALF_WIDTH) continue;
    if ((t / DASH_PERIOD) % 1 < DASH_ON) return true;
  }
  return false;
}

/** 1 画素の色（4×4 の副標本で縁をなめらかに）。scale は図形を中央へ縮める倍率（maskable は 0.8） */
function pixel(px: number, py: number, size: number, scale: number): Rgb {
  const n = 4;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let sy = 0; sy < n; sy++) {
    for (let sx = 0; sx < n; sx++) {
      const u = ((px + (sx + 0.5) / n) / size - 0.5) / scale + 0.5;
      const v = ((py + (sy + 0.5) / n) / size - 0.5) / scale + 0.5;
      const c = insidePolygon(u, v, HULL) ? BOAT : onWake(u, v) ? WAKE : SEA;
      r += c[0];
      g += c[1];
      b += c[2];
    }
  }
  const k = n * n;
  return [Math.round(r / k), Math.round(g / k), Math.round(b / k)];
}

const CRC_TABLE = ((): Uint32Array => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 不透明の RGB 8 bit PNG（iOS は透明を黒にするので透明は使わない） */
function png(size: number, scale: number): Buffer {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // 行のフィルタなし
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x, y, size, scale);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // ビット深度
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const OUT = 'public/icons';
mkdirSync(OUT, { recursive: true });
for (const [name, size, scale] of [
  ['apple-touch-icon.png', 180, 1],
  ['icon-192.png', 192, 1],
  ['icon-512.png', 512, 1],
  ['icon-maskable-512.png', 512, 0.8],
] as const) {
  const buf = png(size, scale);
  writeFileSync(`${OUT}/${name}`, buf);
  console.log(`${OUT}/${name} ${size}×${size} ${buf.length} bytes`);
}
