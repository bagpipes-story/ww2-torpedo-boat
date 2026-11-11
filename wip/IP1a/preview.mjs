// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0700/impl/IP1a/tools/preview.ts
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// src/config/sea-art-config.ts
var SEA_ART_PX_PER_M = 1;
var SEA_TILE_PERIOD_M = 1024;
var SEA_LIGHT_ART = {
  dark: { crest: 10466520, crestAlpha: 0.1, glints: 0, whitecaps: false },
  half: { crest: 12111084, crestAlpha: 0.12, glints: 12, whitecaps: false },
  full: { crest: 12111084, crestAlpha: 0.12, glints: 16, whitecaps: false },
  day: { crest: 14477810, crestAlpha: 0.16, glints: 16, whitecaps: true }
};
var SEA_TEX = {
  dirDeg: 78,
  swell: { count: 6, lamM: [96, 256], spreadDeg: 20, ampPow: 1 },
  chop: { count: 12, lamM: [24, 64], spreadDeg: 28, ampPow: 0.8 },
  ripple: { count: 10, lamM: [10, 20], spreadDeg: 50, ampPow: 0.5 },
  warp: { count: 3, lamM: [512, 1024], spreadDeg: 90, ampPow: 0 },
  warpM: 56,
  swellGain: 1.3,
  chopGain: 1.8,
  chopOnSwell: 0.4,
  mix: [0.25, 0.55, 0.2],
  crestBend: 0.5,
  foam: [0.6, 0.95],
  base: 0.1,
  band: 0.3,
  light: 0.5,
  dark: 0.3,
  foamAlpha: 0.3
};
var ART_SEED_SEA = 7401;

// src/core/rng.ts
var SeededRng = class {
  constructor(seed) {
    this.state = seed >>> 0;
  }
  /** [0, 1) の一様乱数 */
  next() {
    this.state = this.state + 1831565813 >>> 0;
    let t2 = this.state;
    t2 = Math.imul(t2 ^ t2 >>> 15, t2 | 1);
    t2 ^= t2 + Math.imul(t2 ^ t2 >>> 7, t2 | 61);
    return ((t2 ^ t2 >>> 14) >>> 0) / 4294967296;
  }
  /** [min, max) の一様乱数 */
  nextRange(min, max) {
    return min + (max - min) * this.next();
  }
  /** 確率 p で true */
  chance(p) {
    if (p <= 0) return false;
    if (p >= 1) return true;
    return this.next() < p;
  }
};

// src/assets/sea-shape.ts
var SEA_TILE_TEX_PX = SEA_TILE_PERIOD_M * SEA_ART_PX_PER_M;
var TAU = Math.PI * 2;
function dirDiffDeg(a, b) {
  const d = ((a - b) % 180 + 180) % 180;
  return d > 90 ? d - 180 : d;
}
function pickWaves(rng, b, dirDeg, size) {
  const cands = [];
  const top = Math.ceil(size / b.lamM[0]);
  for (let m = 0; m <= top; m++) {
    for (let n = -top; n <= top; n++) {
      if (m === 0 && n <= 0) continue;
      const lam = size / Math.hypot(n, m);
      if (lam < b.lamM[0] || lam > b.lamM[1]) continue;
      if (Math.abs(dirDiffDeg(Math.atan2(m, n) * 180 / Math.PI, dirDeg)) > b.spreadDeg) continue;
      cands.push([n, m]);
    }
  }
  const out2 = [];
  let sum = 0;
  for (let i = 0; i < b.count && cands.length > 0; i++) {
    const [n, m] = cands.splice(Math.floor(rng.next() * cands.length), 1)[0];
    const amp = (size / Math.hypot(n, m) / b.lamM[1]) ** b.ampPow * rng.nextRange(0.7, 1);
    sum += amp;
    out2.push({ n, m, kx: TAU * n / size, ky: TAU * m / size, amp, phase: rng.next() * TAU });
  }
  return out2.map((w) => ({ ...w, amp: w.amp / sum }));
}
function seaWaveSet(seed, t2 = SEA_TEX, size = SEA_TILE_PERIOD_M) {
  const rng = new SeededRng(seed);
  return {
    swell: pickWaves(rng, t2.swell, t2.dirDeg, size),
    chop: pickWaves(rng, t2.chop, t2.dirDeg, size),
    ripple: pickWaves(rng, t2.ripple, t2.dirDeg, size),
    warpX: pickWaves(rng, t2.warp, t2.dirDeg + 90, size),
    warpY: pickWaves(rng, t2.warp, t2.dirDeg, size)
  };
}
var LUT_N = 4096;
var LUT_MASK = LUT_N - 1;
var LUT_K = LUT_N / TAU;
var SIN_LUT = new Float32Array(LUT_N);
for (let i = 0; i < LUT_N; i++) SIN_LUT[i] = Math.sin(i / LUT_K);
function packWaves(ws, gain) {
  const p = new Float32Array(ws.length * 4);
  ws.forEach((w, i) => p.set([w.kx * LUT_K, w.ky * LUT_K, w.phase * LUT_K, w.amp * gain], i * 4));
  return p;
}
function sumPacked(p, x, y) {
  let s = 0;
  for (let i = 0; i < p.length; i += 4) s += p[i + 3] * SIN_LUT[p[i] * x + p[i + 1] * y + p[i + 2] & LUT_MASK];
  return s;
}
function sumExact(ws, x, y) {
  let s = 0;
  for (const w of ws) s += w.amp * Math.sin(w.kx * x + w.ky * y + w.phase);
  return s;
}
function smoothstep(e0, e1, x) {
  const u = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
}
var clamp1 = (v) => v < -1 ? -1 : v > 1 ? 1 : v;
function pack(set, t2) {
  return { swell: packWaves(set.swell, t2.swellGain), chop: packWaves(set.chop, t2.chopGain), ripple: packWaves(set.ripple, 1) };
}
function shadeAt(out2, p, qx, qy, t2) {
  const sw = clamp1(sumPacked(p.swell, qx, qy));
  const ch = clamp1(sumPacked(p.chop, qx, qy));
  const rp = sumPacked(p.ripple, qx, qy);
  const u = (sw + 1) / 2;
  const crest = 2 * u * (1 - t2.crestBend + t2.crestBend * u) - 1;
  const lift = 1 - t2.chopOnSwell + t2.chopOnSwell * (sw > 0 ? sw : 0);
  const v = t2.mix[0] * crest + t2.mix[1] * ch * lift + t2.mix[2] * rp;
  out2[0] = sw;
  out2[1] = v > 0 ? v > 1 ? 1 : v : 0;
  out2[2] = smoothstep(t2.foam[0], t2.foam[1], 0.55 * sw + 0.45 * ch + 0.15 * rp);
}
var WARP_STEP = 16;
function seaTilePixels(seed, t2 = SEA_TEX, size = SEA_TILE_TEX_PX) {
  const set = seaWaveSet(seed, t2);
  const m = SEA_TILE_PERIOD_M / size;
  const p = pack(set, t2);
  const g = size / WARP_STEP + 1;
  const wx = new Float32Array(g * g);
  const wy = new Float32Array(g * g);
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) {
      wx[j * g + i] = t2.warpM * sumExact(set.warpX, i * WARP_STEP * m, j * WARP_STEP * m);
      wy[j * g + i] = t2.warpM * sumExact(set.warpY, i * WARP_STEP * m, j * WARP_STEP * m);
    }
  }
  const px2 = new Uint8ClampedArray(size * size * 4);
  const o = new Float32Array(3);
  for (let y = 0; y < size; y++) {
    const j = Math.floor(y / WARP_STEP);
    const fy = (y - j * WARP_STEP) / WARP_STEP;
    for (let x = 0; x < size; x++) {
      const i = Math.floor(x / WARP_STEP);
      const fx = (x - i * WARP_STEP) / WARP_STEP;
      const k = j * g + i;
      const dx = (wx[k] * (1 - fx) + wx[k + 1] * fx) * (1 - fy) + (wx[k + g] * (1 - fx) + wx[k + g + 1] * fx) * fy;
      const dy = (wy[k] * (1 - fx) + wy[k + 1] * fx) * (1 - fy) + (wy[k + g] * (1 - fx) + wy[k + g + 1] * fx) * fy;
      shadeAt(o, p, x * m + dx, y * m + dy, t2);
      const sw = o[0];
      const L = t2.base + t2.band * (0.5 + 0.5 * sw) + t2.light * o[1] + t2.foamAlpha * o[2];
      const a = Math.min(1, L + (sw < 0 ? -sw * t2.dark : 0));
      const q = (y * size + x) * 4;
      px2[q] = px2[q + 1] = px2[q + 2] = Math.round(255 * (a > 0 ? Math.min(1, L / a) : 1));
      px2[q + 3] = Math.round(255 * a);
    }
  }
  return px2;
}

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0700/impl/IP1a/tools/preview.ts
function crc32(b) {
  let c = ~0;
  for (let i = 0; i < b.length; i++) {
    c ^= b[i];
    for (let k = 0; k < 8; k++) c = c >>> 1 ^ 3988292384 & -(c & 1);
  }
  return ~c >>> 0;
}
function png(w, h, rgb) {
  const raw2 = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw2[y * (w * 3 + 1)] = 0;
    Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw2, y * (w * 3 + 1) + 1);
  }
  const chunk = (t2, d) => {
    const l = Buffer.alloc(4);
    l.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(t2), d]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc32(td));
    return Buffer.concat([l, td, c]);
  };
  const ih = Buffer.alloc(13);
  ih.writeUInt32BE(w, 0);
  ih.writeUInt32BE(h, 4);
  ih[8] = 8;
  ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", deflateSync(raw2)), chunk("IEND", Buffer.alloc(0))]);
}
var t = { ...SEA_TEX, ...process.env.PARAMS ? JSON.parse(process.env.PARAMS) : {} };
var light = { ...SEA_LIGHT_ART, ...process.env.LIGHT ? JSON.parse(process.env.LIGHT) : {} };
var t0 = Date.now();
var S = Number(process.env.SIZE ?? SEA_TILE_TEX_PX);
var px = seaTilePixels(ART_SEED_SEA, t, S);
console.log("tile ms", Date.now() - t0);
var grid = Number(process.env.GRID ?? 1713472);
var gridA = Number(process.env.GRIDA ?? 1);
var W = 1700;
var H = 785;
var SC = Number(process.env.SC ?? 1.25);
var out = (name, bg, tint, alpha) => {
  const rgb = new Uint8Array(W * H * 3);
  const ch = (c, s) => c >> s & 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const mx = x / SC, my = y / SC;
    const u = mx * S / 1024, v = my * S / 1024;
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    let g = 0, a = 0;
    for (const [dx, dy, wt] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
      const i = ((y0 + dy) % S * S + (x0 + dx) % S) * 4;
      a += px[i + 3] / 255 * wt;
      g += px[i] / 255 * (px[i + 3] / 255) * wt;
    }
    const A = a * alpha;
    const o = (y * W + x) * 3;
    for (let k = 0; k < 3; k++) {
      const sh = 16 - 8 * k;
      let c = ch(bg, sh) * (1 - A) + ch(tint, sh) * g * alpha;
      const onGrid = mx % 100 < 2 / 1 || my % 100 < 2;
      if (onGrid) c = c * (1 - gridA) + ch(grid, sh) * gridA;
      rgb[o + k] = Math.max(0, Math.min(255, Math.round(c)));
    }
  }
  writeFileSync(`${process.env.OUT ?? "."}/${name}.png`, png(W, H, rgb));
};
out("dark", 725024, light.dark.crest, light.dark.crestAlpha);
out("half", 725024, light.half.crest, light.half.crestAlpha);
out("day", 3888752, light.day.crest, light.day.crestAlpha);
out("boost", 725024, 16777215, Number(process.env.BOOST ?? 0.5));
var raw = new Uint8Array(S * S * 3);
for (let i = 0; i < S * S; i++) {
  const a = px[i * 4 + 3] / 255, g = px[i * 4];
  raw[i * 3] = raw[i * 3 + 1] = raw[i * 3 + 2] = Math.round(g * a * 0.5 + 64 * (1 - a) * 0);
}
writeFileSync(`${process.env.OUT ?? "."}/raw.png`, png(S, S, raw));
