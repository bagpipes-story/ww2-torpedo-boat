// src/config/sfx-music-config.ts
var MUSIC_SAMPLE_RATE = 22050;
var SFX_SEED_MUSIC_NOISE = 7699;
var MUSIC_COST = { tone: 1, toneMix: 2, fm: 3, noise: 2, fx: 3, pass: 0.5, tablePoint: 1, note: 300 };

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

// src/assets/sfx-music-synth.ts
var SR = MUSIC_SAMPLE_RATE;
var TAU = Math.PI * 2;
var LN10 = Math.log(10);
var MUSIC_TAB = 2048;
var TAB = MUSIC_TAB;
var MASK = TAB - 1;
var ROW = TAB + 2;
var OCT_BASE_HZ = 110;
var OCTS = 6;
var TOP_HZ = 1e4;
var TAIL = 2.5;
var NOISE_N = 1 << 15;
var WAVES = ["warm", "dark", "bright", "brassLo", "brassHi", "mute"];
var WAVE_AMP = {
  warm: (h) => 1 / h / (1 + (h / 6) ** 2),
  dark: (h) => 1 / h / (1 + (h / 3) ** 2),
  bright: (h) => h === 1 ? 0.45 : 1 / h,
  brassLo: (h) => h <= 4 ? 1 / (h * h) : 0,
  brassHi: (h, hz) => (hz < 1800 ? 1 : (1800 / hz) ** 2) / Math.sqrt(h),
  mute: (h, hz) => (h === 1 ? 0.2 : 1 / Math.sqrt(h)) * (0.15 + Math.exp(-(((hz - 1700) / 700) ** 2)))
};
var harmonicsOf = (o) => Math.max(1, Math.floor(TOP_HZ / (OCT_BASE_HZ * 2 ** (o + 1))));
var refHz = (o) => OCT_BASE_HZ * 2 ** (o + 0.5);
var octaveOf = (hz) => Math.min(OCTS - 1, Math.max(0, Math.floor(Math.log2(hz / OCT_BASE_HZ))));
var MUSIC_INSTRUMENTS = {
  pad: { kind: "tone", gain: 0.5, attackS: 1.5, decayS: 0, releaseS: 0.9, wave: "warm" },
  padDark: { kind: "tone", gain: 0.5, attackS: 2, decayS: 0, releaseS: 1.2, wave: "dark" },
  bell: { kind: "fm", gain: 0.8, attackS: 2e-3, decayS: 1.3, releaseS: 0, ratio: 3.5, index: 2.2, indexDecayS: 0.35 },
  pluck: { kind: "tone", gain: 0.8, attackS: 3e-3, decayS: 0.3, releaseS: 0.05, wave: "bright" },
  brass: { kind: "tone", gain: 0.7, attackS: 0.04, decayS: 3, releaseS: 0.12, wave: "brassLo", wave2: "brassHi", brightS: 0.08, bright: 0.85, vibHz: 5, vibDepth: 4e-3, vibDelayS: 0.15, vibRampS: 0.25 },
  mute: { kind: "tone", gain: 0.7, attackS: 0.03, decayS: 2.5, releaseS: 0.1, wave: "brassLo", wave2: "mute", brightS: 0.06, bright: 0.9, vibHz: 5.5, vibDepth: 6e-3, vibDelayS: 0.15, vibRampS: 0.3 },
  snare: { kind: "noise", gain: 0.8, attackS: 1e-3, decayS: 0.12, releaseS: 0.05, hpHz: 1200, lpHz: 7e3, noiseGain: 1, bodyHz: 200, bodyToHz: 185, bodyDecayS: 0.05, bodyGain: 0.5 },
  tom: { kind: "noise", gain: 0.8, attackS: 2e-3, decayS: 0.15, releaseS: 0.05, hpHz: 300, lpHz: 2e3, noiseGain: 0.35, bodyHz: 260, bodyToHz: 205, bodyDecayS: 0.2, bodyGain: 1 },
  rim: { kind: "noise", gain: 0.6, attackS: 5e-4, decayS: 0.02, releaseS: 0.02, hpHz: 2500, lpHz: 8e3, noiseGain: 1, bodyHz: 600, bodyToHz: 560, bodyDecayS: 0.03, bodyGain: 0.5 },
  brush: { kind: "noise", gain: 0.5, attackS: 0.012, decayS: 0.1, releaseS: 0.05, hpHz: 2e3, lpHz: 7e3, noiseGain: 1 },
  swell: { kind: "noise", gain: 0.4, attackS: 0, decayS: 0, releaseS: 1, hpHz: 400, lpHz: 1600, noiseGain: 1, attackFrac: 0.45, decayFrac: 0.5 },
  shaker: { kind: "noise", gain: 0.4, attackS: 4e-3, decayS: 0.05, releaseS: 0.03, hpHz: 2e3, lpHz: 4e3, noiseGain: 1 },
  crackle: { kind: "noise", gain: 0.3, attackS: 0, decayS: 3e-3, releaseS: 2e-3, hpHz: 1500, lpHz: 8e3, noiseGain: 1 }
};
function attackN(d, nt2) {
  return Math.max(1, Math.round(d.attackFrac ? nt2.len * d.attackFrac : d.attackS * SR));
}
function decayOf(d, nt2) {
  return nt2.decayS > 0 ? nt2.decayS : d.decayFrac ? nt2.len * d.decayFrac / SR : d.decayS;
}
function musicNoteSamples(nt2) {
  const d = MUSIC_INSTRUMENTS[nt2.inst], dec = decayOf(d, nt2), ring = dec > 0 ? attackN(d, nt2) + Math.ceil(TAIL * dec * SR) : Infinity;
  return d.kind === "fm" ? ring : Math.min(ring, nt2.len + Math.ceil(TAIL * d.releaseS * SR));
}
function stepHarmonic(w, s, base, h, a2) {
  for (let i = 0; i < TAB; i++) w[base + i] = w[base + i] + a2 * s[h * i & MASK];
}
var MusicTables = class {
  constructor() {
    this.sine = new Float64Array(ROW);
    this.waves = new Float32Array(WAVES.length * OCTS * ROW);
    this.noise = new Float32Array(NOISE_N);
    this.rng = new SeededRng(SFX_SEED_MUSIC_NOISE);
    /** 次の仕事（表の番号。WAVES × OCTS で雑音、その次で済み）と、その中の次の倍音（雑音は次の標本） */
    this.job = 0;
    this.at = 0;
    this.norm = 0;
    for (let i = 0; i < ROW; i++) this.sine[i] = Math.sin(TAU * (i & MASK) / TAB);
  }
  get ready() {
    return this.job > WAVES.length * OCTS;
  }
  /** 波形 wave・基音 hz の表の始まり（waves の添字） */
  waveRow(wave, hz) {
    return (WAVES.indexOf(wave) * OCTS + octaveOf(hz)) * ROW;
  }
  /** 予算 budget 単位の内で表を埋めていく（使った単位を返す）。1 倍音＝2,048 点ずつ・雑音は標本ずつ */
  stepTables(budget) {
    const perHarmonic = TAB * MUSIC_COST.tablePoint, jobs = WAVES.length * OCTS;
    let left = budget;
    while (this.job < jobs && left >= perHarmonic) {
      const amp = WAVE_AMP[WAVES[this.job / OCTS | 0]], o = this.job % OCTS, top = harmonicsOf(o), base = this.job * ROW, ref = refHz(o);
      if (this.at === 0) {
        let s = 0;
        for (let h = 1; h <= top; h++) s += amp(h, h * ref) ** 2;
        this.norm = 1 / Math.sqrt(s);
        this.at = 1;
      }
      stepHarmonic(this.waves, this.sine, base, this.at, amp(this.at, this.at * ref) * this.norm);
      left -= perHarmonic;
      this.at++;
      if (this.at > top) {
        this.waves.copyWithin(base + TAB, base, base + 2);
        this.job++;
        this.at = 0;
      }
    }
    if (this.job === jobs) {
      const k = Math.min(NOISE_N - this.at, Math.floor(left / MUSIC_COST.tone)), z = this.noise, rng = this.rng;
      for (let i = this.at; i < this.at + k; i++) z[i] = rng.next() * 2 - 1;
      this.at += k;
      left -= k * MUSIC_COST.tone;
      if (this.at >= NOISE_N) {
        this.job++;
        this.at = 0;
      }
    }
    return budget - left;
  }
};
function stepNoise(dst, n2, nt2, i0, i1, st, tb) {
  const d = MUSIC_INSTRUMENTS[nt2.inst], z = tb.noise, s = tb.sine, g = nt2.vel * d.gain, ng = d.noiseGain ?? 1, bg = d.bodyGain ?? 0;
  const aH = 1 - Math.exp(-TAU * (d.hpHz ?? 20) / SR), aL = 1 - Math.exp(-TAU * (d.lpHz ?? 1e4) / SR);
  const an = attackN(d, nt2), invA = 1 / an, len = nt2.len, dec = decayOf(d, nt2);
  const rD = dec > 0 ? Math.exp(-LN10 / (dec * SR)) : 1, rR = Math.exp(-LN10 / (d.releaseS * SR));
  const bTo = (d.bodyToHz ?? 0) * TAB / SR, rG = Math.exp(Math.log((d.bodyToHz ?? 1) / (d.bodyHz ?? 1)) / (0.03 * SR)), rB = Math.exp(-LN10 / ((d.bodyDecayS ?? 1) * SR));
  let lo = st[0], y = st[1], e = st[2], be = st[3], bp = st[4], bi = st[5];
  if (i0 === 0) {
    lo = 0;
    y = 0;
    e = 0;
    be = 1;
    bp = 0;
    bi = (d.bodyHz ?? 0) * TAB / SR;
  }
  const split = n2 - nt2.start, z0 = nt2.noise;
  for (let seg = 0; seg < 2; seg++) {
    const a2 = seg === 0 ? i0 : Math.max(i0, split), b2 = seg === 0 ? Math.min(i1, split) : i1, off = seg === 0 ? nt2.start : nt2.start - n2;
    for (let i = a2; i < b2; i++) {
      const x = z[z0 + i & NOISE_N - 1];
      lo += aH * (x - lo);
      y += aL * (x - lo - y);
      e = i < an ? i * invA : i < len ? i === an ? 1 : e * rD : e * rR;
      let v = y * e * ng;
      if (bg > 0) {
        const j = bp | 0;
        v += (s[j] + (s[j + 1] - s[j]) * (bp - j)) * be * bg;
        if ((bp += bi) >= TAB) bp -= TAB;
        if (bi > bTo) bi *= rG;
        be *= rB;
      }
      dst[i + off] = dst[i + off] + v * g;
    }
  }
  st[0] = lo;
  st[1] = y;
  st[2] = e;
  st[3] = be;
  st[4] = bp;
  st[5] = bi;
}

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/S0/tools/rimdbg.ts
var TB = new MusicTables();
while (!TB.ready) TB.stepTables(1e9);
var nt = { inst: "rim", start: 300, len: 8820, pitch: 69, vel: 1, decayS: 0, noise: 1234 };
var T = musicNoteSamples(nt);
var n = T + 1e3;
var a = new Float32Array(n);
var sa = new Float64Array(8);
stepNoise(a, n, nt, 0, T, sa, TB);
var b = new Float32Array(n);
var sb = new Float64Array(8);
var pts = [0, 1, 31, 32, 33, 1e3, Math.floor(T / 2), T - 1, T].filter((v, i, arr) => v <= T && (i === 0 || v > arr[i - 1]));
for (let k = 0; k + 1 < pts.length; k++) stepNoise(b, n, nt, pts[k], pts[k + 1], sb, TB);
var first = -1;
for (let i = 0; i < n; i++) if (a[i] !== b[i]) {
  first = i;
  break;
}
console.log({ T, pts, first, a: a[first], b: b[first], sa: [...sa], sb: [...sb] });
