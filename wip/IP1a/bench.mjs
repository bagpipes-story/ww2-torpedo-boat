// src/config/sea-art-config.ts
var SEA_ART_PX_PER_M = 1;
var SEA_TILE_PERIOD_M = 1024;
var SEA_TEX = {
  dirDeg: 78,
  swell: { count: 6, lamPx: [96, 256], spreadDeg: 20, ampPow: 1 },
  chop: { count: 12, lamPx: [24, 64], spreadDeg: 28, ampPow: 0.8 },
  ripple: { count: 10, lamPx: [10, 20], spreadDeg: 50, ampPow: 0.5 },
  warp: { count: 3, lamPx: [512, 1024], spreadDeg: 90, ampPow: 0 },
  warpPx: 56,
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
    let t = this.state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
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
  const top = Math.ceil(size / b.lamPx[0]);
  for (let m = 0; m <= top; m++) {
    for (let n = -top; n <= top; n++) {
      if (m === 0 && n <= 0) continue;
      const lam = size / Math.hypot(n, m);
      if (lam < b.lamPx[0] || lam > b.lamPx[1]) continue;
      if (Math.abs(dirDiffDeg(Math.atan2(m, n) * 180 / Math.PI, dirDeg)) > b.spreadDeg) continue;
      cands.push([n, m]);
    }
  }
  const out = [];
  let sum = 0;
  for (let i = 0; i < b.count && cands.length > 0; i++) {
    const [n, m] = cands.splice(Math.floor(rng.next() * cands.length), 1)[0];
    const amp = (size / Math.hypot(n, m) / b.lamPx[1]) ** b.ampPow * rng.nextRange(0.7, 1);
    sum += amp;
    out.push({ n, m, kx: TAU * n / size, ky: TAU * m / size, amp, phase: rng.next() * TAU });
  }
  return out.map((w) => ({ ...w, amp: w.amp / sum }));
}
function seaWaveSet(seed, t = SEA_TEX, size = SEA_TILE_TEX_PX) {
  const rng = new SeededRng(seed);
  return {
    swell: pickWaves(rng, t.swell, t.dirDeg, size),
    chop: pickWaves(rng, t.chop, t.dirDeg, size),
    ripple: pickWaves(rng, t.ripple, t.dirDeg, size),
    warpX: pickWaves(rng, t.warp, t.dirDeg + 90, size),
    warpY: pickWaves(rng, t.warp, t.dirDeg, size)
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
function pack(set, t) {
  return { swell: packWaves(set.swell, t.swellGain), chop: packWaves(set.chop, t.chopGain), ripple: packWaves(set.ripple, 1) };
}
function shadeAt(out, p, qx, qy, t) {
  const sw = clamp1(sumPacked(p.swell, qx, qy));
  const ch = clamp1(sumPacked(p.chop, qx, qy));
  const rp = sumPacked(p.ripple, qx, qy);
  const u = (sw + 1) / 2;
  const crest = 2 * u * (1 - t.crestBend + t.crestBend * u) - 1;
  const lift = 1 - t.chopOnSwell + t.chopOnSwell * (sw > 0 ? sw : 0);
  const v = t.mix[0] * crest + t.mix[1] * ch * lift + t.mix[2] * rp;
  out[0] = sw;
  out[1] = v > 0 ? v > 1 ? 1 : v : 0;
  out[2] = smoothstep(t.foam[0], t.foam[1], 0.55 * sw + 0.45 * ch + 0.15 * rp);
}
var WARP_STEP = 16;
function seaTilePixels(seed, t = SEA_TEX, size = SEA_TILE_TEX_PX) {
  const set = seaWaveSet(seed, t, size);
  const p = pack(set, t);
  const g = size / WARP_STEP + 1;
  const wx = new Float32Array(g * g);
  const wy = new Float32Array(g * g);
  for (let j = 0; j < g; j++) {
    for (let i = 0; i < g; i++) {
      wx[j * g + i] = t.warpPx * sumExact(set.warpX, i * WARP_STEP, j * WARP_STEP);
      wy[j * g + i] = t.warpPx * sumExact(set.warpY, i * WARP_STEP, j * WARP_STEP);
    }
  }
  const px = new Uint8ClampedArray(size * size * 4);
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
      shadeAt(o, p, x + dx, y + dy, t);
      const sw = o[0];
      const L = t.base + t.band * (0.5 + 0.5 * sw) + t.light * o[1] + t.foamAlpha * o[2];
      const a = Math.min(1, L + (sw < 0 ? -sw * t.dark : 0));
      const q = (y * size + x) * 4;
      px[q] = px[q + 1] = px[q + 2] = Math.round(255 * (a > 0 ? Math.min(1, L / a) : 1));
      px[q + 3] = Math.round(255 * a);
    }
  }
  return px;
}

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0700/impl/IP1a/tools/bench.ts
for (let i = 0; i < 4; i++) {
  const t0 = performance.now();
  seaTilePixels(ART_SEED_SEA, SEA_TEX);
  console.log("full", (performance.now() - t0).toFixed(0));
}
var t2 = { ...SEA_TEX, ripple: { ...SEA_TEX.ripple, count: 0 } };
{
  const t0 = performance.now();
  seaTilePixels(ART_SEED_SEA, t2);
  console.log("no ripple", (performance.now() - t0).toFixed(0));
}
var t3 = { ...t2, chop: { ...SEA_TEX.chop, count: 0 } };
{
  const t0 = performance.now();
  seaTilePixels(ART_SEED_SEA, t3);
  console.log("no chop/ripple", (performance.now() - t0).toFixed(0));
}
var t4 = { ...t3, swell: { ...SEA_TEX.swell, count: 0 } };
{
  const t0 = performance.now();
  try {
    seaTilePixels(ART_SEED_SEA, t4);
  } catch {
  }
  console.log("none", (performance.now() - t0).toFixed(0));
}
