// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/scripts/sfx-mix.ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/config/sfx-config.ts
var SFX_SAMPLE_RATE = 22050;
var SFX_PEAK = 0.9;
var SFX_EDGE_FADE_S = 2e-3;
var SFX_MAX_TOTAL_SAMPLES = 7e5;
var SFX_KEYS = [
  "mg",
  "gun_near",
  "gun_far",
  "splash_s",
  "splash_l",
  "blast_s",
  "blast_l",
  "torp_hit",
  "torp_launch",
  "hull_hit",
  "alarm",
  "light_on",
  "flare_pop",
  "bomb_fall",
  "reload",
  "reload_end",
  "smoke",
  "ui_tap",
  "bell",
  "engine_cough",
  "sink",
  "engine",
  "sea",
  "fire",
  "rain",
  "drone"
];
var SFX_PRIORITY_CUE = 3;
var SFX_PRIORITY_BLAST = 2;
var SFX_PRIORITY_GUN = 1;
var SFX_PRIORITY_SPLASH = 0;
var SFX_SEED_MG = 7501;
var SFX_SEED_GUN_NEAR = 7502;
var SFX_SEED_GUN_FAR = 7503;
var SFX_SEED_SPLASH_S = 7504;
var SFX_SEED_SPLASH_L = 7505;
var SFX_SEED_BLAST_S = 7506;
var SFX_SEED_BLAST_L = 7507;
var SFX_SEED_TORP_HIT = 7508;
var SFX_SEED_TORP_LAUNCH = 7509;
var SFX_SEED_HULL_HIT = 7510;
var SFX_SEED_ALARM = 7511;
var SFX_SEED_LIGHT_ON = 7512;
var SFX_SEED_FLARE_POP = 7513;
var SFX_SEED_BOMB_FALL = 7514;
var SFX_SEED_RELOAD = 7515;
var SFX_SEED_SMOKE = 7516;
var SFX_SEED_UI_TAP = 7517;
var SFX_SEED_BELL = 7518;
var SFX_SEED_ENGINE_COUGH = 7519;
var SFX_SEED_SINK = 7520;
var SFX_SEED_ENGINE = 7521;
var SFX_SEED_SEA = 7522;
var SFX_SEED_FIRE = 7523;
var SFX_SEED_RAIN = 7524;
var SFX_SEED_DRONE = 7525;
var SFX_SEED_RELOAD_END = 7526;
var SFX_SEED_LAB_LAUNCH_E = 7527;
var SFX_SEED_LAB_LAUNCH_F = 7528;
var SFX_SEED_LAB_LAUNCH_G = 7529;
var SFX_SEED_LAB_LAUNCH_H = 7530;
var SFX_SEED_LAB_LAUNCH_I = 7531;
function def(seconds, seed, gain, priority, minIntervalS, reachBand, family, rateJitter = 0) {
  return { seconds, seed, gain, priority, minIntervalS, reachBand, family, loop: family === "loop", rateJitter };
}
var FAR = 3;
var MID = 2;
var NEAR = 1;
var SFX_TABLE = {
  mg: def(0.12, SFX_SEED_MG, 0.18, SFX_PRIORITY_GUN, 0.07, MID, "gun", 0.08),
  gun_near: def(0.6, SFX_SEED_GUN_NEAR, 0.26, SFX_PRIORITY_GUN, 0.3, FAR, "gun"),
  gun_far: def(0.9, SFX_SEED_GUN_FAR, 0.4, SFX_PRIORITY_GUN, 0.25, FAR, "gun"),
  splash_s: def(0.35, SFX_SEED_SPLASH_S, 0.12, SFX_PRIORITY_SPLASH, 0.08, NEAR, "splash", 0.12),
  splash_l: def(0.8, SFX_SEED_SPLASH_L, 0.2, SFX_PRIORITY_SPLASH, 0.15, MID, "splash"),
  blast_s: def(0.5, SFX_SEED_BLAST_S, 0.4, SFX_PRIORITY_BLAST, 0.35, FAR, "blast"),
  blast_l: def(1.6, SFX_SEED_BLAST_L, 0.8, SFX_PRIORITY_BLAST, 0.2, FAR, "blast"),
  torp_hit: def(2.2, SFX_SEED_TORP_HIT, 0.8, SFX_PRIORITY_BLAST, 0, FAR, "blast"),
  torp_launch: def(1.4, SFX_SEED_TORP_LAUNCH, 0.8, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  hull_hit: def(0.3, SFX_SEED_HULL_HIT, 0.7, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  alarm: def(0.6, SFX_SEED_ALARM, 0.6, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  light_on: def(0.5, SFX_SEED_LIGHT_ON, 0.6, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  flare_pop: def(1.2, SFX_SEED_FLARE_POP, 0.5, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  bomb_fall: def(1.2, SFX_SEED_BOMB_FALL, 0.3, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  reload: def(0.3, SFX_SEED_RELOAD, 1, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  reload_end: def(0.42, SFX_SEED_RELOAD_END, 1, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  smoke: def(1, SFX_SEED_SMOKE, 0.7, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  ui_tap: def(0.06, SFX_SEED_UI_TAP, 0.5, SFX_PRIORITY_CUE, 0, FAR, "ui"),
  bell: def(1.4, SFX_SEED_BELL, 0.6, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  engine_cough: def(0.8, SFX_SEED_ENGINE_COUGH, 0.7, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  sink: def(2.5, SFX_SEED_SINK, 0.3, SFX_PRIORITY_BLAST, 0, FAR, "blast"),
  engine: def(1, SFX_SEED_ENGINE, 1, SFX_PRIORITY_CUE, 0, FAR, "loop"),
  sea: def(4, SFX_SEED_SEA, 1, SFX_PRIORITY_CUE, 0, FAR, "loop"),
  fire: def(2, SFX_SEED_FIRE, 1, SFX_PRIORITY_CUE, 0, FAR, "loop"),
  rain: def(2, SFX_SEED_RAIN, 1, SFX_PRIORITY_CUE, 0, FAR, "loop"),
  drone: def(1.5, SFX_SEED_DRONE, 1, SFX_PRIORITY_CUE, 0, FAR, "loop")
};
var SFX_LIMITER = { thresholdDb: -10, ratio: 12, attackS: 3e-3, releaseS: 0.25, kneeDb: 6 };
var SFX_MASTER_GAIN = 0.8;
var SFX_LOOP_TIME_CONSTANT_S = 0.08;
var SFX_LOOP_BUS_GAIN = 0.5;

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/assets/sfx-dsp.ts
var TAU = Math.PI * 2;
var SR = SFX_SAMPLE_RATE;
var DECAY_RATIO_LN = Math.log(10);
function sfxSamples(seconds) {
  return Math.round(seconds * SR);
}
function whiteNoise(rng, n) {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rng.next() * 2 - 1;
  return out;
}
function onePoleA(hz2) {
  return 1 - Math.exp(-TAU * Math.max(1, hz2) / SR);
}
function lowPass(x, hzFrom, hzTo = hzFrom, glideS = 0, poles = 1) {
  let cur = x;
  const glideN = Math.max(1, sfxSamples(glideS));
  const ratio = hzTo / hzFrom;
  for (let p = 0; p < poles; p++) {
    const out = new Float32Array(cur.length);
    let y = 0;
    let a = onePoleA(hzFrom);
    for (let i = 0; i < cur.length; i++) {
      if (hzTo !== hzFrom && (i & 15) === 0) a = onePoleA(hzFrom * Math.pow(ratio, Math.min(1, i / glideN)));
      y += a * (cur[i] - y);
      out[i] = y;
    }
    cur = out;
  }
  return cur;
}
function highPass(x, hz2) {
  const low = lowPass(x, hz2);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] - low[i];
  return out;
}
function bandPass(x, lowHz, highHz, toLowHz = lowHz, toHighHz = highHz, glideS = 0) {
  const out = new Float32Array(x.length);
  const glideN = Math.max(1, sfxSamples(glideS));
  const sweep = toLowHz !== lowHz || toHighHz !== highHz;
  let b0 = 0, a1 = 0, a2 = 0;
  const coef = (lo, hi) => {
    const fc = Math.min(Math.sqrt(lo * hi), SR * 0.45);
    const q = fc / Math.max(1, hi - lo);
    const w = TAU * fc / SR;
    const alpha = Math.sin(w) / (2 * q);
    const a0 = 1 + alpha;
    b0 = alpha / a0;
    a1 = -2 * Math.cos(w) / a0;
    a2 = (1 - alpha) / a0;
  };
  coef(lowHz, highHz);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    if (sweep && (i & 15) === 0) {
      const u = Math.min(1, i / glideN);
      coef(lowHz * Math.pow(toLowHz / lowHz, u), highHz * Math.pow(toHighHz / highHz, u));
    }
    const v = x[i];
    const y = b0 * (v - x2) - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = v;
    y2 = y1;
    y1 = y;
    out[i] = y;
  }
  return out;
}
function envelope(n, attackS, decayS, startS = 0) {
  const out = new Float32Array(n);
  const s0 = sfxSamples(startS);
  const an = sfxSamples(attackS);
  const k = DECAY_RATIO_LN / Math.max(1, decayS * SR);
  for (let i = Math.max(0, s0); i < n; i++) {
    const j = i - s0;
    out[i] = j < an ? j / an : Math.exp(-k * (j - an));
  }
  return out;
}
function ramp(n, riseS, pow = 1) {
  const out = new Float32Array(n);
  const rn = Math.max(1, sfxSamples(riseS));
  for (let i = 0; i < n; i++) out[i] = Math.pow(Math.min(1, i / rn), pow);
  return out;
}
function sine(n, hzFrom, hzTo = hzFrom, glideS = 0) {
  const out = new Float32Array(n);
  const glideN = Math.max(1, sfxSamples(glideS));
  const ratio = hzTo / hzFrom;
  let ph = 0;
  for (let i = 0; i < n; i++) {
    out[i] = Math.sin(ph);
    const hz2 = hzTo === hzFrom ? hzFrom : hzFrom * Math.pow(ratio, Math.min(1, i / glideN));
    ph += TAU * hz2 / SR;
  }
  return out;
}
function fm(n, carrierHz, ratio, index, indexDecayS) {
  const out = new Float32Array(n);
  const k = DECAY_RATIO_LN / Math.max(1, indexDecayS * SR);
  const wc = TAU * carrierHz / SR;
  const wm = wc * ratio;
  for (let i = 0; i < n; i++) out[i] = Math.sin(wc * i + index * Math.exp(-k * i) * Math.sin(wm * i));
  return out;
}
function modes(n, hz2, amps, decays) {
  const out = new Float32Array(n);
  for (let m = 0; m < hz2.length; m++) {
    const w = TAU * hz2[m] / SR, k = DECAY_RATIO_LN / Math.max(1, decays[m] * SR), a = amps[m];
    const end = Math.min(n, Math.ceil(6 * decays[m] * SR));
    for (let i = 0; i < end; i++) out[i] = out[i] + a * Math.exp(-k * i) * Math.sin(w * i);
  }
  return out;
}
function mul(a, b) {
  for (let i = 0; i < a.length; i++) a[i] = a[i] * (b[i] ?? 0);
  return a;
}
function mixInto(dst, src, gain = 1, offsetS = 0) {
  const o = sfxSamples(offsetS);
  const n = Math.min(src.length, dst.length - o);
  for (let i = Math.max(0, -o); i < n; i++) dst[i + o] = dst[i + o] + src[i] * gain;
  return dst;
}
function saturate(x, drive) {
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * drive);
  return x;
}
function peakOf(x) {
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const v = Math.abs(x[i]);
    if (v > p) p = v;
  }
  return p;
}
function rmsOf(x, from = 0, to = x.length) {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return to > from ? Math.sqrt(s / (to - from)) : 0;
}
function meanOf(x) {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i];
  return x.length > 0 ? s / x.length : 0;
}
function zeroCrossings(x, from = 0, to = x.length) {
  let c = 0;
  for (let i = Math.max(1, from + 1); i < to; i++) if (x[i] >= 0 !== x[i - 1] >= 0) c++;
  return c;
}
function removeDc(x) {
  const m = meanOf(x);
  for (let i = 0; i < x.length; i++) x[i] = x[i] - m;
  return x;
}
function normalizePeak(x, peak = SFX_PEAK) {
  const p = peakOf(x);
  if (p <= 0) return x;
  const g = peak / p;
  for (let i = 0; i < x.length; i++) x[i] = x[i] * g;
  return x;
}
function fadeEdges(x, fadeS = SFX_EDGE_FADE_S) {
  const fn = Math.min(sfxSamples(fadeS), x.length >> 1);
  for (let i = 0; i < fn; i++) {
    const g = i / fn;
    x[i] = x[i] * g;
    x[x.length - 1 - i] = x[x.length - 1 - i] * g;
  }
  return x;
}
function fadeTail(x, fadeS) {
  const fn = Math.min(sfxSamples(fadeS), x.length);
  for (let i = 0; i < fn; i++) x[x.length - 1 - i] = x[x.length - 1 - i] * (i / fn);
  return x;
}
function crossfadeLoop(x, n, overlapS) {
  const ov = Math.min(x.length - n, sfxSamples(overlapS));
  const out = x.slice(0, n);
  for (let i = 0; i < ov; i++) {
    const u = (i + 0.5) / ov * (Math.PI / 2);
    out[i] = x[i] * Math.sin(u) + x[n + i] * Math.cos(u);
  }
  return out;
}
function harmonics(n, cycles, amps) {
  const out = new Float32Array(n);
  for (let h = 1; h <= amps.length; h++) {
    const a = amps[h - 1];
    if (a === 0) continue;
    const w = TAU * cycles * h / n;
    for (let i = 0; i < n; i++) out[i] = out[i] + a * Math.sin(w * i);
  }
  return out;
}
function loopSway(x, cycles, depth) {
  const w = TAU * cycles / x.length;
  for (let i = 0; i < x.length; i++) x[i] = x[i] * (1 + depth * Math.cos(w * i));
  return x;
}
function mixWrap(dst, src, gain, at) {
  const n = dst.length;
  for (let i = 0; i < src.length; i++) {
    const j = (at + i) % n;
    dst[j] = dst[j] + src[i] * gain;
  }
  return dst;
}
function rotateToQuietSeam(x, windowS) {
  const n = x.length;
  const w = Math.min(sfxSamples(windowS), n >> 1);
  let best = 0, bestV = Infinity;
  for (let k = -w; k <= w; k++) {
    const i = (k + n) % n;
    const v = Math.abs(x[i]) + Math.abs(x[(i + n - 1) % n]);
    if (v < bestV) {
      bestV = v;
      best = i;
    }
  }
  const out = new Float32Array(n);
  out.set(x.subarray(best), 0);
  out.set(x.subarray(0, best), n - best);
  return out;
}

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/core/rng.ts
var SeededRng = class {
  state;
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

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/assets/sfx-recipes-blasts.ts
function addCrackles(out, rng, c) {
  const n = out.length;
  const hiss = highPass(whiteNoise(rng, n), c.crackleHighPassHz);
  for (let i = 0; i < c.crackles; i++) {
    const atS = rng.nextRange(c.crackleFromS, c.crackleToS);
    const decayS = rng.nextRange(c.crackleDecayMinS, c.crackleDecayMaxS);
    const gain = rng.nextRange(c.crackleGainMin, c.crackleGainMax) * (1 - atS / c.crackleToS * c.crackleTailFade);
    const at = sfxSamples(atS);
    const len = Math.min(sfxSamples(decayS * 3), n - at);
    mixInto(out, mul(hiss.slice(at, at + len), envelope(len, c.crackleAttackS, decayS)), gain, atS);
  }
}
function boom(n, rng, c) {
  const out = new Float32Array(n);
  mixInto(out, mul(sine(n, c.bodyFromHz, c.bodyToHz, c.bodyGlideS), envelope(n, c.bodyAttackS, c.bodyDecayS)), c.bodyGain);
  mixInto(out, mul(lowPass(whiteNoise(rng, n), c.roarFromHz, c.roarToHz, c.roarGlideS, c.roarPoles), envelope(n, c.roarAttackS, c.roarDecayS)), c.roarGain);
  return saturate(out, c.drive);
}
var BLAST_L = {
  bodyFromHz: 120,
  bodyToHz: 30,
  bodyGlideS: 0.8,
  bodyAttackS: 4e-3,
  bodyDecayS: 0.8,
  bodyGain: 0.7,
  roarFromHz: 3e3,
  roarToHz: 100,
  roarGlideS: 1.2,
  roarPoles: 2,
  roarAttackS: 2e-3,
  roarDecayS: 0.7,
  roarGain: 3.2,
  drive: 1.5,
  crackles: 14,
  crackleFromS: 0.18,
  crackleToS: 1.3,
  crackleHighPassHz: 1500,
  crackleAttackS: 5e-4,
  crackleDecayMinS: 4e-3,
  crackleDecayMaxS: 0.012,
  crackleGainMin: 0.1,
  crackleGainMax: 0.3,
  crackleTailFade: 0.7
};
function blastL(n) {
  const rng = new SeededRng(SFX_SEED_BLAST_L);
  const out = boom(n, rng, BLAST_L);
  addCrackles(out, rng, BLAST_L);
  return out;
}
var BLAST_S = {
  bodyFromHz: 110,
  bodyToHz: 50,
  bodyGlideS: 0.25,
  bodyAttackS: 3e-3,
  bodyDecayS: 0.2,
  bodyGain: 0.5,
  roarFromHz: 2e3,
  roarToHz: 150,
  roarGlideS: 0.5,
  roarPoles: 2,
  roarAttackS: 15e-4,
  roarDecayS: 0.22,
  roarGain: 4.5,
  drive: 1.8,
  crackles: 6,
  crackleFromS: 0.08,
  crackleToS: 0.42,
  crackleHighPassHz: 1500,
  crackleAttackS: 5e-4,
  crackleDecayMinS: 4e-3,
  crackleDecayMaxS: 0.01,
  crackleGainMin: 0.08,
  crackleGainMax: 0.2,
  crackleTailFade: 0.6
};
function blastS(n) {
  const rng = new SeededRng(SFX_SEED_BLAST_S);
  const out = boom(n, rng, BLAST_S);
  addCrackles(out, rng, BLAST_S);
  return out;
}
var TORP_HIT = {
  bodyFromHz: 80,
  bodyToHz: 25,
  bodyGlideS: 1,
  bodyAttackS: 6e-3,
  bodyDecayS: 1.1,
  bodyGain: 0.9,
  roarFromHz: 2500,
  roarToHz: 80,
  roarGlideS: 1,
  roarPoles: 2,
  roarAttackS: 2e-3,
  roarDecayS: 0.8,
  roarGain: 3.4,
  drive: 1.7,
  washAtS: 0.25,
  washAttackS: 0.3,
  washDecayS: 1.2,
  washLowHz: 500,
  washHighHz: 2e3,
  washToLowHz: 1e3,
  washToHighHz: 4e3,
  washGlideS: 0.55,
  washGain: 0.55,
  tailFadeS: 0.4
};
function torpHit(n) {
  const c = TORP_HIT;
  const rng = new SeededRng(SFX_SEED_TORP_HIT);
  const out = boom(n, rng, c);
  const wash = bandPass(whiteNoise(rng, n), c.washLowHz, c.washHighHz, c.washToLowHz, c.washToHighHz, c.washAtS + c.washGlideS);
  mixInto(out, mul(wash, envelope(n, c.washAttackS, c.washDecayS, c.washAtS)), c.washGain);
  return fadeTail(out, c.tailFadeS);
}
var SINK = {
  gurgleHz: 400,
  gurglePoles: 2,
  gurgleGain: 3,
  gurgleFloor: 0.08,
  waterLowHz: 500,
  waterHighHz: 2400,
  waterGain: 1,
  beatHz: 9,
  beatJitter: 0.5,
  beatAttackS: 0.012,
  beatDecayS: 0.09,
  beatGainMin: 0.45,
  beatGainMax: 1,
  beatThinTo: 2.2,
  blipMinHz: 320,
  blipMaxHz: 760,
  blipRise: 1.7,
  blipS: 0.06,
  blipAttackS: 4e-3,
  blipDecayS: 0.045,
  blipGain: 0.8,
  creakFromHz: 80,
  creakToHz: 50,
  creakDrive: 3.5,
  creakGain: 0.16,
  creakWobbleHz: 2.3,
  creakWobble: 0.45,
  drive: 0.7,
  attackS: 0.12,
  tailFadeS: 0.9
};
function sink(n) {
  const c = SINK;
  const rng = new SeededRng(SFX_SEED_SINK);
  const out = lowPass(whiteNoise(rng, n), c.gurgleHz, c.gurgleHz, 0, c.gurglePoles);
  for (let i = 0; i < n; i++) out[i] = out[i] * c.gurgleGain;
  mixInto(out, bandPass(whiteNoise(rng, n), c.waterLowHz, c.waterHighHz), c.waterGain);
  const beat = new Float32Array(n).fill(c.gurgleFloor);
  const blips = new Float32Array(n);
  const totalS = n / sfxSamples(1);
  for (let tS = 0.02; tS < totalS; ) {
    const gain = rng.nextRange(c.beatGainMin, c.beatGainMax);
    const hz2 = rng.nextRange(c.blipMinHz, c.blipMaxHz);
    const len = Math.min(sfxSamples(c.blipS), n - sfxSamples(tS));
    if (len > 0) {
      mixInto(beat, envelope(sfxSamples(c.beatDecayS * 2), c.beatAttackS, c.beatDecayS), gain, tS);
      mixInto(blips, mul(sine(len, hz2, hz2 * c.blipRise, c.blipS), envelope(len, c.blipAttackS, c.blipDecayS)), gain * c.blipGain, tS);
    }
    tS += (1 + rng.nextRange(-c.beatJitter, c.beatJitter)) / c.beatHz * (1 + (c.beatThinTo - 1) * tS / totalS);
  }
  mixInto(mul(out, beat), blips);
  const creak = saturate(sine(n, c.creakFromHz, c.creakToHz, totalS), c.creakDrive);
  const wobble = sine(n, c.creakWobbleHz);
  for (let i = 0; i < n; i++) out[i] = out[i] + creak[i] * c.creakGain * (1 - c.creakWobble * (0.5 + 0.5 * wobble[i]));
  return fadeTail(mul(saturate(out, c.drive), envelope(n, c.attackS, totalS * 100)), c.tailFadeS);
}
var BLAST_RECIPES = { blast_s: blastS, blast_l: blastL, torp_hit: torpHit, sink };

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/assets/sfx-recipes-cues.ts
var UI_TAP = { fromHz: 880, toHz: 660, glideS: 0.06, attackS: 2e-3, decayS: 0.04 };
function uiTap(n) {
  return mul(sine(n, UI_TAP.fromHz, UI_TAP.toHz, UI_TAP.glideS), envelope(n, UI_TAP.attackS, UI_TAP.decayS));
}
var ALARM = { toneHz: [400, 520], toneS: 0.3, amps: [1, 0.45, 0.3, 0.15, 0.1, 0.05], lowPassHz: 2e3, attackS: 6e-3, releaseS: 0.03, sag: 0.5 };
function alarm(n) {
  const c = ALARM;
  const out = new Float32Array(n);
  const tn = sfxSamples(c.toneS);
  const an = sfxSamples(c.attackS);
  const rn = sfxSamples(c.releaseS);
  for (let k = 0; k < c.toneHz.length; k++) {
    const len = Math.min(tn, n - k * tn);
    const tone = harmonics(len, Math.round(c.toneHz[k] * c.toneS), c.amps);
    for (let i = 0; i < len; i++) {
      const edge = Math.min(1, i / an, Math.max(0, (len - rn - i) / an));
      tone[i] = tone[i] * edge * (1 - c.sag * i / len);
    }
    mixInto(out, tone, 1, k * c.toneS);
  }
  return lowPass(out, c.lowPassHz);
}
var BELL = { carrierHz: 660, ratio: 2.76, index: 3.2, indexDecayS: 0.5, attackS: 2e-3, decayS: 1.2, strikeRatio: 2, strikeDecayS: 0.15, strikeGain: 0.35, tailFadeS: 0.15 };
function bell(n) {
  const c = BELL;
  const out = mul(fm(n, c.carrierHz, c.ratio, c.index, c.indexDecayS), envelope(n, c.attackS, c.decayS));
  mixInto(out, mul(sine(n, c.carrierHz * c.strikeRatio), envelope(n, c.attackS, c.strikeDecayS)), c.strikeGain);
  return fadeTail(out, c.tailFadeS);
}
var HULL_HIT = {
  carrierHz: 320,
  ratio: 1.4,
  index: 6,
  indexDecayS: 0.06,
  attackS: 1e-3,
  decayS: 0.12,
  drive: 1.6,
  noiseHighPassHz: 1500,
  noiseAttackS: 5e-4,
  noiseDecayS: 0.012,
  noiseGain: 0.8,
  ringHz: 1240,
  ringDecayS: 0.09,
  ringGain: 0.25
};
function hullHit(n) {
  const c = HULL_HIT;
  const rng = new SeededRng(SFX_SEED_HULL_HIT);
  const out = saturate(mul(fm(n, c.carrierHz, c.ratio, c.index, c.indexDecayS), envelope(n, c.attackS, c.decayS)), c.drive);
  mixInto(out, mul(sine(n, c.ringHz), envelope(n, c.attackS, c.ringDecayS)), c.ringGain);
  mixInto(out, mul(highPass(whiteNoise(rng, n), c.noiseHighPassHz), envelope(n, c.noiseAttackS, c.noiseDecayS)), c.noiseGain);
  return out;
}
var ENGINE_COUGH = {
  atS: [0, 0.21, 0.47],
  gains: [1, 0.8, 0.6],
  lowHz: 300,
  lowPoles: 2,
  lowGain: 2,
  bodyHz: 70,
  bodyGain: 0.9,
  attackS: 4e-3,
  decayS: 0.09,
  drive: 4,
  puffLowHz: 500,
  puffHighHz: 2e3,
  puffDecayS: 0.07,
  puffGain: 5,
  idleLowHz: 250,
  idleHighHz: 900,
  idleGain: 0.06
};
function engineCough(n) {
  const c = ENGINE_COUGH;
  const rng = new SeededRng(SFX_SEED_ENGINE_COUGH);
  const out = new Float32Array(n);
  for (let k = 0; k < c.atS.length; k++) {
    const atS = c.atS[k];
    const len = n - sfxSamples(atS);
    const pop = mul(lowPass(whiteNoise(rng, len), c.lowHz, c.lowHz, 0, c.lowPoles), envelope(len, c.attackS, c.decayS));
    for (let i = 0; i < len; i++) pop[i] = pop[i] * c.lowGain;
    mixInto(pop, mul(sine(len, c.bodyHz), envelope(len, c.attackS, c.decayS)), c.bodyGain);
    mixInto(out, saturate(pop, c.drive), c.gains[k], atS);
    mixInto(out, mul(bandPass(whiteNoise(rng, len), c.puffLowHz, c.puffHighHz), envelope(len, c.attackS, c.puffDecayS)), c.gains[k] * c.puffGain, atS);
  }
  const idle = bandPass(whiteNoise(rng, n), c.idleLowHz, c.idleHighHz);
  for (let i = 0; i < n; i++) out[i] = out[i] + idle[i] * c.idleGain * (1 - i / n);
  return out;
}
var CUE_RECIPES = { alarm, ui_tap: uiTap, bell, hull_hit: hullHit, engine_cough: engineCough };

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/assets/sfx-recipes-launch.ts
var ATTACK_S = 3e-4;
var SPLASH = { thumpLoHz: 250, thumpHiHz: 800, loHz: 400, hiHz: 4e3, attackS: 5e-3 };
function thud(n, rng, t, atS = 0) {
  const len = n - sfxSamples(atS);
  const x = mul(bandPass(bandPass(whiteNoise(rng, len), t.loHz, t.hiHz), t.loHz, t.hiHz), envelope(len, t.attackS, t.decayS));
  const g = 1 / Math.max(1e-9, peakOf(x));
  for (let i = 0; i < len; i++) x[i] = x[i] * g;
  return saturate(x, t.drive);
}
function launch(c, makeRng) {
  return (n) => {
    const rng = makeRng ? makeRng() : new SeededRng(SFX_SEED_TORP_LAUNCH);
    const out = mul(highPass(whiteNoise(rng, n), c.crackHpHz), envelope(n, ATTACK_S, c.crackS));
    for (let i = 0; i < n; i++) out[i] = out[i] * c.crackGain;
    for (const t of c.thuds) mixInto(out, thud(n, rng, t), t.gain);
    const tl = c.tail;
    for (let k = 0; k < tl.tapsS.length; k++) {
      mixInto(out, thud(n, rng, { loHz: tl.loHz, hiHz: tl.hiHz, attackS: ATTACK_S * 10, decayS: tl.decayS, drive: 1, gain: 1 }, tl.tapsS[k]), tl.gains[k] * c.tailGain, tl.tapsS[k]);
    }
    if (c.roomGain > 0) mixInto(out, mul(bandPass(whiteNoise(rng, n), c.roomLoHz, c.roomHiHz), envelope(n, c.roomAttackS, c.roomDecayS)), c.roomGain);
    const an = n - sfxSamples(c.airAtS);
    const lo = 1 - c.airWidth, hi = 1 + c.airWidth;
    mixInto(out, mul(bandPass(whiteNoise(rng, an), c.airFromHz * lo, c.airFromHz * hi, c.airToHz * lo, c.airToHz * hi, c.airGlideS), envelope(an, c.airAttackS, c.airDecayS)), c.airGain, c.airAtS);
    const sn = n - sfxSamples(c.splashAtS);
    mixInto(out, mul(bandPass(whiteNoise(rng, sn), SPLASH.thumpLoHz, SPLASH.thumpHiHz), envelope(sn, SPLASH.attackS, c.splashThumpS)), c.splashThumpGain, c.splashAtS);
    mixInto(out, mul(bandPass(whiteNoise(rng, sn), SPLASH.loHz, SPLASH.hiHz), envelope(sn, SPLASH.attackS, c.splashS)), c.splashGain, c.splashAtS);
    if (c.busDrive) {
      const g = 1 / Math.max(1e-9, peakOf(out));
      for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * g * c.busDrive);
    }
    return fadeTail(out, c.tailFadeS);
  };
}
var LAUNCH_A = {
  crackHpHz: 1500,
  crackS: 5e-3,
  crackGain: 2.4,
  thuds: [{ loHz: 180, hiHz: 700, attackS: 2e-3, decayS: 0.22, drive: 2.5, gain: 1 }],
  tail: { tapsS: [0.022, 0.037, 0.051, 0.064], gains: [0.5, 0.38, 0.28, 0.2], loHz: 200, hiHz: 900, decayS: 0.12 },
  tailGain: 0.7,
  roomLoHz: 0,
  roomHiHz: 0,
  roomAttackS: 0,
  roomDecayS: 0,
  roomGain: 0,
  airAtS: 0.04,
  airFromHz: 3e3,
  airToHz: 800,
  airWidth: 0.45,
  airGlideS: 0.3,
  airAttackS: 0.02,
  airDecayS: 0.35,
  airGain: 1.6,
  splashAtS: 0.37,
  splashThumpS: 0.08,
  splashThumpGain: 1,
  splashS: 0.2,
  splashGain: 1.1,
  tailFadeS: 0.1
};
var LAUNCH_B = {
  crackHpHz: 1200,
  crackS: 5e-3,
  crackGain: 0.5,
  thuds: [{ loHz: 140, hiHz: 600, attackS: 3e-3, decayS: 0.32, drive: 3.5, gain: 1 }, { loHz: 300, hiHz: 1200, attackS: 2e-3, decayS: 0.12, drive: 2, gain: 0.45 }],
  tail: { tapsS: [0.019, 0.031, 0.046, 0.058, 0.073, 0.089], gains: [0.6, 0.5, 0.42, 0.34, 0.26, 0.2], loHz: 160, hiHz: 750, decayS: 0.18 },
  tailGain: 1,
  roomLoHz: 200,
  roomHiHz: 800,
  roomAttackS: 0.03,
  roomDecayS: 0.45,
  roomGain: 0.6,
  airAtS: 0.03,
  airFromHz: 2500,
  airToHz: 700,
  airWidth: 0.4,
  airGlideS: 0.3,
  airAttackS: 0.02,
  airDecayS: 0.3,
  airGain: 0.8,
  splashAtS: 0.45,
  splashThumpS: 0.09,
  splashThumpGain: 1.2,
  splashS: 0.2,
  splashGain: 1.1,
  tailFadeS: 0.1
};
var LAUNCH_C = {
  crackHpHz: 2500,
  crackS: 7e-3,
  crackGain: 1.4,
  thuds: [{ loHz: 400, hiHz: 1500, attackS: 1e-3, decayS: 0.08, drive: 1.5, gain: 0.45 }],
  tail: { tapsS: [0.02, 0.035], gains: [0.3, 0.2], loHz: 500, hiHz: 1800, decayS: 0.06 },
  tailGain: 1,
  roomLoHz: 0,
  roomHiHz: 0,
  roomAttackS: 0,
  roomDecayS: 0,
  roomGain: 0,
  airAtS: 4e-3,
  airFromHz: 5e3,
  airToHz: 900,
  airWidth: 0.45,
  airGlideS: 0.45,
  airAttackS: 5e-3,
  airDecayS: 0.5,
  airGain: 2.6,
  splashAtS: 0.42,
  splashThumpS: 0.07,
  splashThumpGain: 0.9,
  splashS: 0.2,
  splashGain: 1.3,
  tailFadeS: 0.1
};
var IP1 = {
  crackHighPassHz: 2e3,
  crackAttackS: 3e-4,
  crackDecayS: 3e-3,
  crackGain: 1.6,
  punchFromHz: 140,
  punchToHz: 60,
  punchGlideS: 0.1,
  punchAttackS: 1e-3,
  punchDecayS: 0.15,
  punchDrive: 4,
  punchGain: 0.5,
  thumpLowHz: 300,
  thumpHighHz: 1200,
  thumpAttackS: 1e-3,
  thumpDecayS: 0.12,
  thumpGain: 2.4,
  airFromHz: 3500,
  airToHz: 700,
  airWidth: 0.45,
  airGlideS: 0.3,
  airAttackS: 4e-3,
  airDecayS: 0.32,
  airGain: 2.6,
  ringHz: [640, 1047, 1523, 2210, 2870],
  ringAmps: [0.6, 0.9, 1, 0.75, 0.5],
  ringDecays: [0.35, 0.33, 0.3, 0.27, 0.24],
  ringGain: 0.3,
  splashAtS: 0.37,
  splashThumpLowHz: 250,
  splashThumpHighHz: 800,
  splashThumpDecayS: 0.08,
  splashThumpGain: 1.6,
  splashLowHz: 400,
  splashHighHz: 4e3,
  splashAttackS: 5e-3,
  splashDecayS: 0.2,
  splashGain: 1.6,
  whineAtS: 0.45,
  whineFromHz: 700,
  whineToHz: 1100,
  whineGlideS: 0.5,
  whineDetune: 1.012,
  whineWidth: 0.06,
  whineAttackS: 0.06,
  whineDecayS: 0.4,
  whineGain: 0.16,
  whineNoiseGain: 0.6,
  tailFadeS: 0.1
};
function launchIp1(n) {
  const c = IP1;
  const rng = new SeededRng(SFX_SEED_TORP_LAUNCH);
  const out = mul(highPass(whiteNoise(rng, n), c.crackHighPassHz), envelope(n, c.crackAttackS, c.crackDecayS));
  for (let i = 0; i < n; i++) out[i] = out[i] * c.crackGain;
  mixInto(out, saturate(mul(sine(n, c.punchFromHz, c.punchToHz, c.punchGlideS), envelope(n, c.punchAttackS, c.punchDecayS)), c.punchDrive), c.punchGain);
  mixInto(out, mul(bandPass(whiteNoise(rng, n), c.thumpLowHz, c.thumpHighHz), envelope(n, c.thumpAttackS, c.thumpDecayS)), c.thumpGain);
  const lo = 1 - c.airWidth, hi = 1 + c.airWidth;
  mixInto(out, mul(bandPass(whiteNoise(rng, n), c.airFromHz * lo, c.airFromHz * hi, c.airToHz * lo, c.airToHz * hi, c.airGlideS), envelope(n, c.airAttackS, c.airDecayS)), c.airGain);
  mixInto(out, modes(n, c.ringHz, c.ringAmps, c.ringDecays), c.ringGain);
  const sn = n - sfxSamples(c.splashAtS);
  mixInto(out, mul(bandPass(whiteNoise(rng, sn), c.splashThumpLowHz, c.splashThumpHighHz), envelope(sn, c.splashAttackS, c.splashThumpDecayS)), c.splashThumpGain, c.splashAtS);
  mixInto(out, mul(bandPass(whiteNoise(rng, sn), c.splashLowHz, c.splashHighHz), envelope(sn, c.splashAttackS, c.splashDecayS)), c.splashGain, c.splashAtS);
  const wn = n - sfxSamples(c.whineAtS);
  const whine = sine(wn, c.whineFromHz, c.whineToHz, c.whineGlideS);
  mixInto(whine, sine(wn, c.whineFromHz * c.whineDetune, c.whineToHz * c.whineDetune, c.whineGlideS));
  const wlo = 1 - c.whineWidth, whi = 1 + c.whineWidth;
  mixInto(whine, bandPass(whiteNoise(rng, wn), c.whineFromHz * wlo, c.whineFromHz * whi, c.whineToHz * wlo, c.whineToHz * whi, c.whineGlideS), c.whineNoiseGain);
  mixInto(out, mul(whine, envelope(wn, c.whineAttackS, c.whineDecayS)), c.whineGain, c.whineAtS);
  return fadeTail(out, c.tailFadeS);
}
var LAUNCH_SECONDS = 1;
var LAUNCH_VARIANTS = [
  { id: "A", recipe: launch(LAUNCH_A), seconds: LAUNCH_SECONDS, rate: 1 },
  { id: "B", recipe: launch(LAUNCH_B), seconds: LAUNCH_SECONDS, rate: 1 },
  { id: "C", recipe: launch(LAUNCH_C), seconds: LAUNCH_SECONDS, rate: 1 },
  { id: "D", recipe: launchIp1, seconds: LAUNCH_SECONDS, rate: 1 }
];

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/assets/sfx-recipes-reload.ts
var SR2 = SFX_SAMPLE_RATE;
var ATTACK_S2 = 2e-4;
function clack(out, rng, c) {
  const at = sfxSamples(c.atS);
  const len = Math.min(out.length - at, sfxSamples(6 * Math.max(c.bodyS, c.clickS, c.ringS)));
  if (len <= 0) return;
  const hit = mul(highPass(whiteNoise(rng, len), c.clickHpHz), envelope(len, ATTACK_S2, c.clickS));
  for (let i = 0; i < len; i++) hit[i] = hit[i] * c.clickGain;
  mixInto(hit, mul(bandPass(whiteNoise(rng, len), c.bodyLoHz, c.bodyHiHz), envelope(len, ATTACK_S2, c.bodyS)), c.bodyGain);
  if (c.ringGain > 0) {
    const decays = [];
    const amps = [];
    for (let m = 0; m < c.ringHz.length; m++) {
      decays.push(c.ringS);
      amps.push(1 / (1 + m));
    }
    mixInto(hit, modes(len, c.ringHz, amps, decays), c.ringGain);
  }
  mixInto(out, hit, c.gain, c.atS);
}
function slide(out, rng, s) {
  const len = Math.min(out.length - sfxSamples(s.atS), sfxSamples(s.durS));
  if (len <= 0) return;
  const x = bandPass(whiteNoise(rng, len), s.loHz, s.hiHz, s.toLoHz, s.toHiHz, s.durS);
  const step = Math.max(1, Math.round(SR2 / s.grainHz));
  let g0 = rng.next(), g1 = rng.next();
  for (let i = 0; i < len; i++) {
    if (i > 0 && i % step === 0) {
      g0 = g1;
      g1 = rng.next();
    }
    const u = i % step / step;
    x[i] = x[i] * Math.sin(Math.PI * i / len) * (1 - s.rough + s.rough * (g0 + (g1 - g0) * u));
  }
  mixInto(out, x, s.gain, s.atS);
}
function mech(m, end) {
  return (n) => {
    const rng = end ? new SeededRng(SFX_SEED_RELOAD_END) : new SeededRng(SFX_SEED_RELOAD);
    const out = new Float32Array(n);
    for (const s of m.slides) slide(out, rng, s);
    for (const c of m.clacks) clack(out, rng, c);
    return out;
  };
}
var NO_RING = [];
var HEAVY = { clickS: 2e-3, clickHpHz: 1e3, clickGain: 1, bodyLoHz: 450, bodyHiHz: 1700, bodyS: 0.035, bodyGain: 2.4, ringHz: [1530, 2270, 3110, 3940], ringS: 7e-3, ringGain: 0.25 };
var MID2 = { clickS: 15e-4, clickHpHz: 1500, clickGain: 1, bodyLoHz: 800, bodyHiHz: 2600, bodyS: 0.02, bodyGain: 1.6, ringHz: [2230, 3290, 4470], ringS: 6e-3, ringGain: 0.25 };
var LIGHT = { clickS: 1e-3, clickHpHz: 2500, clickGain: 1, bodyLoHz: 1500, bodyHiHz: 4200, bodyS: 8e-3, bodyGain: 1, ringHz: [3620, 4810], ringS: 4e-3, ringGain: 0.2 };
var DRY = { clickS: 8e-4, clickHpHz: 2e3, clickGain: 1, bodyLoHz: 1200, bodyHiHz: 4500, bodyS: 5e-3, bodyGain: 0.9, ringHz: NO_RING, ringS: 0, ringGain: 0 };
var MAG_SLIDE = { loHz: 1600, hiHz: 4800, toLoHz: 1300, toHiHz: 3800, grainHz: 170, rough: 0.6 };
var BOLT_SLIDE = { loHz: 2200, hiHz: 6e3, toLoHz: 2600, toHiHz: 7e3, grainHz: 320, rough: 0.7 };
var RELOAD_A = {
  slides: [{ ...MAG_SLIDE, atS: 0.03, durS: 0.11, gain: 1.3 }],
  clacks: [{ ...LIGHT, atS: 6e-3, gain: 0.8 }, { ...MID2, atS: 0.13, gain: 1 }, { ...LIGHT, atS: 0.142, gain: 0.35 }]
};
var RELOAD_END_A = {
  slides: [{ ...MAG_SLIDE, atS: 0, durS: 0.05, gain: 0.9 }, { ...BOLT_SLIDE, atS: 0.225, durS: 0.07, gain: 0.9 }],
  clacks: [
    { ...HEAVY, atS: 0.048, gain: 1 },
    { ...LIGHT, atS: 0.064, gain: 0.45 },
    { ...LIGHT, atS: 0.22, gain: 0.4 },
    { ...MID2, atS: 0.3, gain: 1, ringS: 8e-3 },
    { ...LIGHT, atS: 0.313, gain: 0.3 }
  ]
};
var B_BODY = { bodyLoHz: 260, bodyHiHz: 1100, bodyS: 0.055, bodyGain: 3.6, ringHz: [1130, 1690, 2410], ringS: 8e-3 };
var RELOAD_B = {
  slides: [{ ...MAG_SLIDE, loHz: 800, hiHz: 3e3, toLoHz: 700, toHiHz: 2500, grainHz: 120, rough: 0.75, atS: 0.035, durS: 0.16, gain: 1.6 }],
  clacks: [{ ...HEAVY, bodyLoHz: 500, bodyHiHz: 1800, bodyS: 0.02, atS: 8e-3, gain: 0.7 }, { ...HEAVY, ...B_BODY, atS: 0.2, gain: 1 }, { ...HEAVY, ...B_BODY, atS: 0.215, gain: 0.35 }]
};
var RELOAD_END_B = {
  slides: [
    { ...MAG_SLIDE, loHz: 900, hiHz: 3200, toLoHz: 800, toHiHz: 2600, grainHz: 120, rough: 0.75, atS: 0, durS: 0.07, gain: 1.2 },
    { ...BOLT_SLIDE, loHz: 1300, hiHz: 4200, toLoHz: 1600, toHiHz: 5e3, grainHz: 220, rough: 0.8, atS: 0.25, durS: 0.09, gain: 1.2 }
  ],
  clacks: [
    { ...HEAVY, ...B_BODY, atS: 0.068, gain: 1 },
    { ...HEAVY, ...B_BODY, atS: 0.081, gain: 0.35 },
    { ...MID2, atS: 0.1, gain: 0.5 },
    { ...MID2, atS: 0.245, gain: 0.5 },
    { ...HEAVY, bodyLoHz: 500, bodyHiHz: 2e3, bodyS: 0.03, atS: 0.35, gain: 1 },
    { ...MID2, atS: 0.364, gain: 0.4 }
  ]
};
var RELOAD_C = {
  slides: [{ ...BOLT_SLIDE, loHz: 3e3, hiHz: 7500, toLoHz: 2600, toHiHz: 6500, atS: 0.025, durS: 0.05, gain: 0.5 }],
  clacks: [{ ...DRY, atS: 6e-3, gain: 1 }, { ...DRY, atS: 0.09, gain: 0.9 }]
};
var RELOAD_END_C = {
  slides: [{ ...BOLT_SLIDE, loHz: 3e3, hiHz: 7500, toLoHz: 3400, toHiHz: 8500, atS: 0.17, durS: 0.05, gain: 0.5 }],
  clacks: [{ ...DRY, atS: 4e-3, gain: 1 }, { ...DRY, atS: 0.017, gain: 0.6 }, { ...DRY, atS: 0.165, gain: 0.5 }, { ...DRY, atS: 0.24, gain: 1 }, { ...DRY, atS: 0.25, gain: 0.5 }]
};
var IP12 = {
  clickHighPassHz: 1500,
  clickAttackS: 2e-4,
  detune: 0.03,
  strikes: [
    {
      atS: 8e-3,
      gain: 0.7,
      baseHz: 2150,
      ratios: [1, 1.43, 1.97, 2.61, 3.27],
      amps: [1, 0.8, 0.6, 0.45, 0.3],
      decays: [0.04, 0.03, 0.022, 0.017, 0.013],
      clickS: 12e-4,
      clickGain: 1.2,
      bodyLowHz: 1e3,
      bodyHighHz: 2500,
      bodyDecayS: 0.02,
      bodyGain: 0.8
    },
    {
      atS: 0.15,
      gain: 1,
      baseHz: 1230,
      ratios: [1, 1.37, 1.81, 2.36, 2.94, 3.71, 4.52],
      amps: [1, 0.9, 0.75, 0.6, 0.45, 0.35, 0.25],
      decays: [0.08, 0.065, 0.05, 0.04, 0.03, 0.022, 0.016],
      clickS: 2e-3,
      clickGain: 1.5,
      bodyLowHz: 600,
      bodyHighHz: 2e3,
      bodyDecayS: 0.04,
      bodyGain: 2.2
    },
    {
      atS: 0.162,
      gain: 0.35,
      baseHz: 1290,
      ratios: [1, 1.37, 1.81, 2.36, 2.94],
      amps: [1, 0.9, 0.75, 0.6, 0.45],
      decays: [0.05, 0.04, 0.03, 0.025, 0.02],
      clickS: 15e-4,
      clickGain: 1.2,
      bodyLowHz: 700,
      bodyHighHz: 2200,
      bodyDecayS: 0.025,
      bodyGain: 1.2
    },
    {
      atS: 0.29,
      gain: 0.6,
      baseHz: 2750,
      ratios: [1, 1.52, 2.09, 2.71],
      amps: [1, 0.7, 0.5, 0.35],
      decays: [0.03, 0.022, 0.016, 0.012],
      clickS: 1e-3,
      clickGain: 1.4,
      bodyLowHz: 1200,
      bodyHighHz: 2500,
      bodyDecayS: 0.015,
      bodyGain: 0.8
    },
    {
      atS: 0.31,
      gain: 0.8,
      baseHz: 2900,
      ratios: [1, 1.52, 2.09, 2.71],
      amps: [1, 0.7, 0.5, 0.35],
      decays: [0.06, 0.045, 0.03, 0.02],
      clickS: 1e-3,
      clickGain: 1.2,
      bodyLowHz: 1200,
      bodyHighHz: 2500,
      bodyDecayS: 0.015,
      bodyGain: 0.6
    }
  ]
};
function reloadIp1(n) {
  const c = IP12;
  const rng = new SeededRng(SFX_SEED_RELOAD);
  const out = new Float32Array(n);
  for (const s of c.strikes) {
    const len = n - sfxSamples(s.atS);
    const f = 1 + c.detune * (rng.next() - 0.5);
    const hit = modes(len, s.ratios.map((r) => s.baseHz * f * r), s.amps, s.decays);
    mixInto(hit, mul(highPass(whiteNoise(rng, len), c.clickHighPassHz), envelope(len, c.clickAttackS, s.clickS)), s.clickGain);
    mixInto(hit, mul(bandPass(whiteNoise(rng, len), s.bodyLowHz, s.bodyHighHz), envelope(len, c.clickAttackS, s.bodyDecayS)), s.bodyGain);
    mixInto(out, hit, s.gain, s.atS);
  }
  return out;
}
var IP1_SECONDS = 0.42;
var IP1_END_RATE = 1.06;
var RELOAD_SECONDS = 0.3;
var RELOAD_END_SECONDS = 0.42;
var RELOAD_VARIANTS = [
  { id: "A", recipe: mech(RELOAD_A, false), seconds: RELOAD_SECONDS, rate: 1 },
  { id: "B", recipe: mech(RELOAD_B, false), seconds: RELOAD_SECONDS, rate: 1 },
  { id: "C", recipe: mech(RELOAD_C, false), seconds: RELOAD_SECONDS, rate: 1 },
  { id: "D", recipe: reloadIp1, seconds: IP1_SECONDS, rate: 1 }
];
var RELOAD_END_VARIANTS = [
  { id: "A", recipe: mech(RELOAD_END_A, true), seconds: RELOAD_END_SECONDS, rate: 1 },
  { id: "B", recipe: mech(RELOAD_END_B, true), seconds: RELOAD_END_SECONDS, rate: 1 },
  { id: "C", recipe: mech(RELOAD_END_C, true), seconds: RELOAD_END_SECONDS, rate: 1 },
  { id: "D", recipe: reloadIp1, seconds: IP1_SECONDS, rate: IP1_END_RATE }
];
var RELOAD_DEFAULT_ID = "B";
function pick(list, id) {
  const v = list.find((x) => x.id === id);
  if (!v) throw new Error(`\u5F3E\u5009\u306E\u97F3\u306E\u6848 '${id}' \u304C\u7121\u3044`);
  return v.recipe;
}
var RELOAD_RECIPES = { reload: pick(RELOAD_VARIANTS, RELOAD_DEFAULT_ID), reload_end: pick(RELOAD_END_VARIANTS, RELOAD_DEFAULT_ID) };

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/assets/sfx-recipes-launch2.ts
var SR3 = SFX_SAMPLE_RATE;
var TAU2 = Math.PI * 2;
var LN10 = Math.log(10);
var BURST_END_FADE_S = 5e-3;
function burst(out, rng, b) {
  const at = sfxSamples(b.atS);
  const len = Math.min(out.length - at, sfxSamples(b.lenS ?? b.attackS + 6 * b.decayS));
  if (len <= 0) return;
  let x = whiteNoise(rng, len);
  if (b.hiHz <= 0) x = highPass(x, b.loHz);
  else {
    const g = b.glideS ?? 0;
    x = bandPass(x, b.loHz, b.hiHz, b.toLoHz ?? b.loHz, b.toHiHz ?? b.hiHz, g);
    if (b.twice) x = bandPass(x, b.loHz, b.hiHz, b.toLoHz ?? b.loHz, b.toHiHz ?? b.hiHz, g);
  }
  const an = Math.max(1, sfxSamples(b.attackS));
  const k = LN10 / Math.max(1, b.decayS * SR3);
  const pw = b.attackPow ?? 1;
  for (let j = 0; j < len; j++) x[j] = x[j] * (j < an ? Math.pow(j / an, pw) : Math.exp(-k * (j - an)));
  if (b.drive) {
    const g = 1 / Math.max(1e-9, peakOf(x));
    for (let j = 0; j < len; j++) x[j] = Math.tanh(x[j] * g * b.drive);
  }
  if (b.amHz) {
    const d = b.amDepth ?? 0.5, to = b.amToHz ?? b.amHz;
    let ph = 0;
    for (let j = 0; j < len; j++) {
      x[j] = x[j] * (1 - d + d * (0.5 + 0.5 * Math.sin(ph)));
      ph += TAU2 * b.amHz * Math.pow(to / b.amHz, j / len) / SR3;
    }
  }
  fadeTail(x, BURST_END_FADE_S);
  mixInto(out, x, b.gain, b.atS);
}
function bubbles(out, rng, s) {
  for (let i = 0; i < s.count; i++) {
    const t = s.fromS + (s.toS - s.fromS) * ((i + rng.next()) / s.count);
    const c = s.loHz * Math.pow(s.hiHz / s.loHz, rng.next());
    const u = (t - s.fromS) / (s.toS - s.fromS);
    burst(out, rng, {
      atS: t,
      gain: s.gain * (0.6 + 0.4 * rng.next()) * Math.pow(s.fall, u),
      loHz: c * 0.8,
      hiHz: c * 1.25,
      toLoHz: c * s.rise * 0.8,
      toHiHz: c * s.rise * 1.25,
      glideS: s.lenS,
      attackS: 2e-3,
      decayS: s.decayS,
      lenS: s.lenS
    });
  }
}
function recipe2(r) {
  return (n) => {
    const rng = r.rng();
    const out = new Float32Array(n);
    for (const s of r.slides ?? []) slide(out, rng, s);
    for (const c of r.clacks ?? []) clack(out, rng, c);
    for (const b of r.bursts) burst(out, rng, b);
    if (r.bubbles) bubbles(out, rng, r.bubbles);
    return fadeTail(out, r.tailFadeS);
  };
}
function echoes(tapsS, gains, loHz, hiHz, decayS, drive) {
  return tapsS.map((t, i) => ({ atS: t, gain: gains[i], loHz, hiHz, twice: true, attackS: 4e-3, decayS: decayS * (1 + 0.25 * i), drive }));
}
function splash(atS, thumpGain, washS, washGain, fallGain) {
  return [
    { atS, gain: thumpGain, loHz: 250, hiHz: 850, twice: true, attackS: 4e-3, decayS: 0.09, drive: 2 },
    { atS, gain: washGain, loHz: 500, hiHz: 5e3, attackS: 8e-3, decayS: washS },
    { atS: atS + 0.08, gain: fallGain, loHz: 350, hiHz: 3e3, attackS: 0.06, decayS: washS * 1.6 }
  ];
}
var E = {
  rng: () => new SeededRng(SFX_SEED_LAB_LAUNCH_E),
  bursts: [
    { atS: 0, gain: 2.2, loHz: 2e3, hiHz: 0, attackS: 2e-4, decayS: 25e-4 },
    { atS: 0, gain: 1.6, loHz: 300, hiHz: 0, attackS: 2e-4, decayS: 12e-4 },
    { atS: 0, gain: 1, loHz: 250, hiHz: 900, twice: true, attackS: 1e-3, decayS: 0.34, drive: 6 },
    { atS: 0, gain: 0.4, loHz: 900, hiHz: 2600, attackS: 1e-3, decayS: 0.09, drive: 2 },
    ...echoes([0.031, 0.062, 0.095, 0.13, 0.172, 0.215], [0.5, 0.42, 0.34, 0.27, 0.2, 0.14], 220, 1300, 0.16, 1.5),
    { atS: 0.02, gain: 0.3, loHz: 200, hiHz: 1200, attackS: 0.05, decayS: 0.5 },
    ...splash(0.4, 0.75, 0.3, 0.85, 0.35)
  ],
  tailFadeS: 0.12
};
var F_HEAVY = { ...HEAVY, clickHpHz: 700, bodyLoHz: 200, bodyHiHz: 900, bodyS: 0.07, bodyGain: 4, ringHz: [820, 1240, 1770], ringS: 8e-3 };
var F = {
  rng: () => new SeededRng(SFX_SEED_LAB_LAUNCH_F),
  clacks: [
    { ...F_HEAVY, atS: 4e-3, gain: 1 },
    { ...F_HEAVY, atS: 0.016, gain: 0.45 },
    { ...MID2, atS: 0.038, gain: 0.32 },
    { ...MID2, atS: 0.055, gain: 0.26 },
    { ...LIGHT, atS: 0.074, gain: 0.2 },
    { ...MID2, atS: 0.1, gain: 0.15 }
  ],
  slides: [{ ...MAG_SLIDE, loHz: 450, hiHz: 2200, toLoHz: 380, toHiHz: 1700, grainHz: 70, rough: 0.85, atS: 0.03, durS: 0.19, gain: 1.4 }],
  bursts: [
    { atS: 0.24, gain: 1.1, loHz: 200, hiHz: 700, twice: true, attackS: 4e-3, decayS: 0.15, drive: 3 },
    { atS: 0.24, gain: 0.9, loHz: 200, hiHz: 3e3, attackS: 6e-3, decayS: 0.35, drive: 1.5 },
    { atS: 0.245, gain: 0.45, loHz: 1500, hiHz: 6e3, attackS: 3e-3, decayS: 0.16 },
    { atS: 0.3, gain: 0.25, loHz: 250, hiHz: 1500, attackS: 0.05, decayS: 0.6 }
  ],
  bubbles: { fromS: 0.42, toS: 1.2, count: 22, loHz: 500, hiHz: 1600, rise: 1.6, lenS: 0.03, decayS: 0.02, gain: 0.6, fall: 0.3 },
  tailFadeS: 0.1
};
var G = {
  rng: () => new SeededRng(SFX_SEED_LAB_LAUNCH_G),
  bursts: [
    { atS: 0, gain: 0.7, loHz: 400, hiHz: 1200, toLoHz: 1800, toHiHz: 6e3, glideS: 0.16, attackS: 0.155, attackPow: 3, decayS: 8e-3, lenS: 0.18 },
    { atS: 0.16, gain: 2.4, loHz: 1500, hiHz: 0, attackS: 2e-4, decayS: 3e-3 },
    { atS: 0.16, gain: 1, loHz: 200, hiHz: 800, twice: true, attackS: 1e-3, decayS: 0.3, drive: 7 },
    { atS: 0.16, gain: 0.4, loHz: 700, hiHz: 2200, attackS: 1e-3, decayS: 0.1, drive: 2 },
    ...echoes([0.2, 0.245, 0.295], [0.4, 0.3, 0.22], 200, 1e3, 0.25, 1.5),
    { atS: 0.17, gain: 0.45, loHz: 150, hiHz: 900, attackS: 0.04, decayS: 0.75, drive: 1.5 },
    { atS: 0.17, gain: 0.12, loHz: 3e3, hiHz: 8e3, attackS: 0.03, decayS: 0.5 },
    ...splash(0.62, 0.45, 0.22, 0.5, 0.2)
  ],
  tailFadeS: 0.12
};
var H = {
  rng: () => new SeededRng(SFX_SEED_LAB_LAUNCH_H),
  bursts: [
    { atS: 0, gain: 2.2, loHz: 1800, hiHz: 0, attackS: 2e-4, decayS: 3e-3 },
    { atS: 0, gain: 0.8, loHz: 250, hiHz: 900, twice: true, attackS: 1e-3, decayS: 0.12, drive: 3 },
    { atS: 5e-3, gain: 0.9, loHz: 1500, hiHz: 6e3, toLoHz: 900, toHiHz: 3e3, glideS: 0.15, attackS: 3e-3, decayS: 0.15 },
    { atS: 0.18, gain: 0.35, loHz: 500, hiHz: 4e3, attackS: 6e-3, decayS: 0.12 },
    { atS: 0.05, gain: 0.9, loHz: 1040, hiHz: 2160, toLoHz: 325, toHiHz: 675, glideS: 1.15, attackS: 0.12, decayS: 1.2, lenS: 1.4, amHz: 34, amToHz: 26, amDepth: 0.55, drive: 1.2 },
    { atS: 0.05, gain: 0.4, loHz: 300, hiHz: 900, toLoHz: 180, toHiHz: 550, glideS: 1.1, attackS: 0.15, decayS: 0.9, lenS: 1.4, amHz: 34, amToHz: 26, amDepth: 0.55 }
  ],
  tailFadeS: 0.12
};
var I = {
  ...LAUNCH_A,
  crackGain: 2.6,
  thuds: [{ loHz: 170, hiHz: 720, attackS: 2e-3, decayS: 0.34, drive: 7, gain: 1 }, { loHz: 350, hiHz: 1300, attackS: 1e-3, decayS: 0.12, drive: 2.5, gain: 0.35 }],
  tail: { tapsS: [0.022, 0.037, 0.051, 0.064, 0.082, 0.101], gains: [0.55, 0.45, 0.36, 0.28, 0.2, 0.14], loHz: 200, hiHz: 950, decayS: 0.2 },
  tailGain: 0.8,
  roomLoHz: 250,
  roomHiHz: 1200,
  roomAttackS: 0.03,
  roomDecayS: 0.75,
  roomGain: 0.6,
  airGain: 1.9,
  splashAtS: 0.42,
  splashThumpS: 0.1,
  splashThumpGain: 1.1,
  splashS: 0.26,
  splashGain: 1.2,
  tailFadeS: 0.12,
  busDrive: 2
};
var LAUNCH_NEW_VARIANTS = [
  { id: "E", recipe: recipe2(E), seconds: 1.3, rate: 1 },
  { id: "F", recipe: recipe2(F), seconds: 1.4, rate: 1 },
  { id: "G", recipe: recipe2(G), seconds: 1.5, rate: 1 },
  { id: "H", recipe: recipe2(H), seconds: 1.5, rate: 1 },
  { id: "I", recipe: launch(I, () => new SeededRng(SFX_SEED_LAB_LAUNCH_I)), seconds: 1.2, rate: 1 }
];
var LAUNCH_ALL_VARIANTS = [...LAUNCH_VARIANTS, ...LAUNCH_NEW_VARIANTS];
var LAUNCH_DEFAULT_ID = "F";
var LAUNCH_RECIPES = { torp_launch: LAUNCH_ALL_VARIANTS.find((v) => v.id === LAUNCH_DEFAULT_ID).recipe };

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/assets/sfx-recipes-events.ts
var TAU3 = Math.PI * 2;
var SR4 = SFX_SAMPLE_RATE;
var LIGHT_ON = {
  clickHz: 600,
  clickPoles: 2,
  clickAttackS: 1e-3,
  clickDecayS: 0.03,
  clickGain: 1.6,
  humHz: 120,
  humHarmonics: 14,
  humLowShare: 0.3,
  humHighPassHz: 300,
  humAttackS: 0.02,
  humPeakS: 0.06,
  humSag: 0.35,
  humGain: 0.7,
  drive: 1.4,
  tailFadeS: 0.12
};
function lightOn(n) {
  const c = LIGHT_ON;
  const rng = new SeededRng(SFX_SEED_LIGHT_ON);
  const amps = [];
  for (let h = 1; h <= c.humHarmonics; h++) amps.push(h < 3 ? c.humLowShare : 1 / Math.sqrt(h));
  const hum = highPass(harmonics(n, Math.round(c.humHz * n / SR4), amps), c.humHighPassHz);
  const an = sfxSamples(c.humAttackS), pn = sfxSamples(c.humPeakS);
  for (let i = 0; i < n; i++) hum[i] = hum[i] * (i < an ? i / an : i < pn ? 1 : 1 - c.humSag);
  const out = saturate(hum, c.drive);
  for (let i = 0; i < n; i++) out[i] = out[i] * c.humGain;
  mixInto(out, mul(lowPass(whiteNoise(rng, n), c.clickHz, c.clickHz, 0, c.clickPoles), envelope(n, c.clickAttackS, c.clickDecayS)), c.clickGain);
  return fadeTail(out, c.tailFadeS);
}
var FLARE_POP = {
  popFromHz: 200,
  popToHz: 90,
  popGlideS: 0.12,
  popAttackS: 3e-3,
  popDecayS: 0.12,
  popDrive: 2.4,
  popGain: 0.4,
  puffLowHz: 500,
  puffHighHz: 2e3,
  puffAttackS: 2e-3,
  puffDecayS: 0.04,
  puffGain: 1.2,
  hissHz: 3e3,
  hissAttackS: 0.06,
  hissDecayS: 1,
  hissGain: 0.7,
  swayHz: 3,
  sway: 0.3,
  tailFadeS: 0.15
};
function flarePop(n) {
  const c = FLARE_POP;
  const rng = new SeededRng(SFX_SEED_FLARE_POP);
  const out = saturate(mul(sine(n, c.popFromHz, c.popToHz, c.popGlideS), envelope(n, c.popAttackS, c.popDecayS)), c.popDrive);
  for (let i = 0; i < n; i++) out[i] = out[i] * c.popGain;
  mixInto(out, mul(bandPass(whiteNoise(rng, n), c.puffLowHz, c.puffHighHz), envelope(n, c.puffAttackS, c.puffDecayS)), c.puffGain);
  const hiss = mul(highPass(whiteNoise(rng, n), c.hissHz), envelope(n, c.hissAttackS, c.hissDecayS));
  for (let i = 0; i < n; i++) hiss[i] = hiss[i] * (1 - c.sway * (0.5 + 0.5 * Math.sin(TAU3 * c.swayHz * i / SR4)));
  mixInto(out, hiss, c.hissGain);
  return fadeTail(out, c.tailFadeS);
}
var BOMB_FALL = {
  fromHz: 1800,
  toHz: 600,
  glideS: 1.15,
  vibHz: 6,
  vibDepth: 0.015,
  tremDepth: 0.25,
  riseS: 1.1,
  risePow: 1.6,
  floor: 0.12,
  airWidth: 0.25,
  airGain: 0.5,
  tailFadeS: 0.06
};
function bombFall(n) {
  const c = BOMB_FALL;
  const rng = new SeededRng(SFX_SEED_BOMB_FALL);
  const tone = new Float32Array(n);
  const glideN = sfxSamples(c.glideS);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const vib = Math.sin(TAU3 * c.vibHz * i / SR4);
    tone[i] = Math.sin(ph) * (1 - c.tremDepth * (0.5 + 0.5 * vib));
    ph += TAU3 * c.fromHz * Math.pow(c.toHz / c.fromHz, Math.min(1, i / glideN)) * (1 + c.vibDepth * vib) / SR4;
  }
  const lo = 1 - c.airWidth, hi = 1 + c.airWidth;
  mixInto(tone, bandPass(whiteNoise(rng, n), c.fromHz * lo, c.fromHz * hi, c.toHz * lo, c.toHz * hi, c.glideS), c.airGain);
  const rise = ramp(n, c.riseS, c.risePow);
  for (let i = 0; i < n; i++) tone[i] = tone[i] * (c.floor + (1 - c.floor) * rise[i]);
  return fadeTail(tone, c.tailFadeS);
}
var SMOKE = { hissHz: 2e3, softHz: 5e3, attackS: 0.15, decayS: 0.8, bodyLowHz: 600, bodyHighHz: 1600, bodyGain: 0.6, tailFadeS: 0.12 };
function smoke(n) {
  const c = SMOKE;
  const rng = new SeededRng(SFX_SEED_SMOKE);
  const out = lowPass(highPass(whiteNoise(rng, n), c.hissHz), c.softHz);
  mixInto(out, bandPass(whiteNoise(rng, n), c.bodyLowHz, c.bodyHighHz), c.bodyGain);
  return fadeTail(mul(out, envelope(n, c.attackS, c.decayS)), c.tailFadeS);
}
var EVENT_RECIPES = { light_on: lightOn, flare_pop: flarePop, bomb_fall: bombFall, smoke };

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/assets/sfx-recipes-guns.ts
var MG = { bandLowHz: 900, bandHighHz: 3e3, attackS: 5e-4, decayS: 0.025, secondAtS: 0.05, secondGain: 0.6, thumpHz: 150, thumpAttackS: 2e-3, thumpDecayS: 0.03, thumpGain: 0.22, drive: 2.5 };
function mg(n) {
  const rng = new SeededRng(SFX_SEED_MG);
  const out = new Float32Array(n);
  const first = bandPass(whiteNoise(rng, n), MG.bandLowHz, MG.bandHighHz);
  const second = bandPass(whiteNoise(rng, n), MG.bandLowHz, MG.bandHighHz);
  mixInto(out, mul(first, envelope(n, MG.attackS, MG.decayS)));
  mixInto(out, mul(second, envelope(n, MG.attackS, MG.decayS, MG.secondAtS)), MG.secondGain);
  mixInto(out, mul(sine(n, MG.thumpHz), envelope(n, MG.thumpAttackS, MG.thumpDecayS)), MG.thumpGain);
  return saturate(out, MG.drive);
}
var GUN_NEAR = {
  roarFromHz: 4e3,
  roarToHz: 200,
  roarGlideS: 0.4,
  roarPoles: 2,
  roarAttackS: 1e-3,
  roarDecayS: 0.25,
  roarGain: 2.6,
  thumpFromHz: 90,
  thumpToHz: 45,
  thumpGlideS: 0.2,
  thumpAttackS: 3e-3,
  thumpDecayS: 0.18,
  thumpGain: 0.6,
  crackHighPassHz: 2500,
  crackAttackS: 3e-4,
  crackDecayS: 5e-3,
  crackGain: 1.4,
  drive: 1.8
};
function gunNear(n) {
  const c = GUN_NEAR;
  const rng = new SeededRng(SFX_SEED_GUN_NEAR);
  const out = new Float32Array(n);
  mixInto(out, mul(lowPass(whiteNoise(rng, n), c.roarFromHz, c.roarToHz, c.roarGlideS, c.roarPoles), envelope(n, c.roarAttackS, c.roarDecayS)), c.roarGain);
  mixInto(out, mul(sine(n, c.thumpFromHz, c.thumpToHz, c.thumpGlideS), envelope(n, c.thumpAttackS, c.thumpDecayS)), c.thumpGain);
  mixInto(out, mul(highPass(whiteNoise(rng, n), c.crackHighPassHz), envelope(n, c.crackAttackS, c.crackDecayS)), c.crackGain);
  return saturate(out, c.drive);
}
var GUN_FAR = {
  rumbleHz: 250,
  rumblePoles: 2,
  attackS: 0.04,
  decayS: 0.5,
  rumbleGain: 1,
  airHz: 700,
  airGain: 0.3,
  bodyHz: 60,
  bodyAttackS: 0.05,
  bodyDecayS: 0.45,
  bodyGain: 0.3,
  rollHz: 9,
  rollDepth: 0.55,
  echoAtS: 0.21,
  echoGain: 0.4,
  drive: 2.4
};
function gunFar(n) {
  const c = GUN_FAR;
  const rng = new SeededRng(SFX_SEED_GUN_FAR);
  const rumble = normalizePeak(lowPass(whiteNoise(rng, n), c.rumbleHz, c.rumbleHz, 0, c.rumblePoles), 1);
  mixInto(rumble, normalizePeak(lowPass(whiteNoise(rng, n), c.airHz), 1), c.airGain);
  const roll = normalizePeak(lowPass(whiteNoise(rng, n), c.rollHz), 1);
  for (let i = 0; i < n; i++) rumble[i] = rumble[i] * (1 + c.rollDepth * roll[i]);
  mul(rumble, envelope(n, c.attackS, c.decayS));
  const out = new Float32Array(n);
  mixInto(out, rumble, c.rumbleGain);
  mixInto(out, rumble, c.echoGain, c.echoAtS);
  mixInto(out, mul(sine(n, c.bodyHz), envelope(n, c.bodyAttackS, c.bodyDecayS)), c.bodyGain);
  return saturate(out, c.drive);
}
var GUN_RECIPES = { mg, gun_near: gunNear, gun_far: gunFar };

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/assets/sfx-recipes-loops.ts
var SEAM = { overlapS: 0.3, quietS: 0.05 };
function loopNoise(rng, n, filter) {
  return crossfadeLoop(filter(whiteNoise(rng, n + sfxSamples(SEAM.overlapS))), n, SEAM.overlapS);
}
var ENGINE = {
  firings: 28,
  harmonics: [1, 0.5, 0.33, 0.25, 0.2, 0.17],
  toneGain: 0.3,
  lump: [1, 0.8, 0.92, 0.74],
  pulseAttack: 0.05,
  pulseDecay: 0.3,
  pulseFloor: 0.14,
  exhaustLowHz: 300,
  exhaustHighHz: 1800,
  exhaustGain: 2.7,
  bodyHz: 500,
  bodyPoles: 2,
  bodyGain: 4.5,
  drive: 1.5
};
function engine(n) {
  const c = ENGINE;
  const rng = new SeededRng(SFX_SEED_ENGINE);
  const pulse = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = c.firings * i / n;
    const k = Math.floor(u);
    const ph = u - k;
    const e = ph < c.pulseAttack ? ph / c.pulseAttack : Math.exp(-(ph - c.pulseAttack) / c.pulseDecay);
    pulse[i] = c.lump[k % c.lump.length] * (c.pulseFloor + (1 - c.pulseFloor) * e);
  }
  const out = harmonics(n, c.firings, c.harmonics);
  for (let i = 0; i < n; i++) out[i] = out[i] * c.toneGain;
  mixInto(out, mul(loopNoise(rng, n, (x) => bandPass(x, c.exhaustLowHz, c.exhaustHighHz)), pulse), c.exhaustGain);
  mixInto(out, mul(loopNoise(rng, n, (x) => lowPass(x, c.bodyHz, c.bodyHz, 0, c.bodyPoles)), pulse), c.bodyGain);
  return rotateToQuietSeam(saturate(normalizePeak(out, 1), c.drive), SEAM.quietS);
}
var SEA = {
  bedHz: 1200,
  bedPoles: 2,
  bedCutHz: 120,
  bedGain: 1,
  swellCycles: 1,
  swellDepth: -0.28,
  chopCycles: 2,
  chopDepth: -0.16,
  foamLowHz: 1500,
  foamHighHz: 4500,
  foamGain: 0.22,
  foamDepth: -0.75
};
function sea(n) {
  const c = SEA;
  const rng = new SeededRng(SFX_SEED_SEA);
  const out = loopSway(loopSway(loopNoise(rng, n, (x) => highPass(lowPass(x, c.bedHz, c.bedHz, 0, c.bedPoles), c.bedCutHz)), c.swellCycles, c.swellDepth), c.chopCycles, c.chopDepth);
  for (let i = 0; i < n; i++) out[i] = out[i] * c.bedGain;
  mixInto(out, loopSway(loopNoise(rng, n, (x) => bandPass(x, c.foamLowHz, c.foamHighHz)), c.swellCycles, c.foamDepth), c.foamGain);
  return rotateToQuietSeam(out, SEAM.quietS);
}
var FIRE = {
  roarHz: 800,
  roarPoles: 2,
  roarGain: 2.2,
  midLowHz: 300,
  midHighHz: 1500,
  midGain: 0.8,
  flutterCycles: [3, 5, 8, 13, 19],
  flutterDepth: [0.16, 0.13, 0.1, 0.08, 0.06],
  crackles: 26,
  crackleHighPassHz: 1800,
  crackleAttackS: 4e-4,
  crackleDecayMinS: 3e-3,
  crackleDecayMaxS: 0.012,
  crackleGainMin: 0.5,
  crackleGainMax: 1.6
};
function fire(n) {
  const c = FIRE;
  const rng = new SeededRng(SFX_SEED_FIRE);
  const out = loopNoise(rng, n, (x) => lowPass(x, c.roarHz, c.roarHz, 0, c.roarPoles));
  for (let i = 0; i < n; i++) out[i] = out[i] * c.roarGain;
  mixInto(out, loopNoise(rng, n, (x) => bandPass(x, c.midLowHz, c.midHighHz)), c.midGain);
  for (let k = 0; k < c.flutterCycles.length; k++) loopSway(out, c.flutterCycles[k], rng.next() < 0.5 ? c.flutterDepth[k] : -c.flutterDepth[k]);
  const hiss = highPass(whiteNoise(rng, n), c.crackleHighPassHz);
  for (let k = 0; k < c.crackles; k++) {
    const at = Math.floor(rng.next() * n);
    const decayS = rng.nextRange(c.crackleDecayMinS, c.crackleDecayMaxS);
    const gain = rng.nextRange(c.crackleGainMin, c.crackleGainMax);
    const len = sfxSamples(decayS * 3);
    mixWrap(out, mul(hiss.slice(k * len, (k + 1) * len), envelope(len, c.crackleAttackS, decayS)), gain, at);
  }
  return rotateToQuietSeam(out, SEAM.quietS);
}
var RAIN = {
  rainHz: 2500,
  rainGain: 1,
  rainCycles: 3,
  rainDepth: 0.08,
  windLowHz: 200,
  windHighHz: 500,
  windGain: 1.5,
  gustLowHz: 500,
  gustHighHz: 1400,
  gustGain: 0.45,
  windCycles: 1,
  windDepth: -0.45
};
function rain(n) {
  const c = RAIN;
  const rng = new SeededRng(SFX_SEED_RAIN);
  const out = loopSway(loopNoise(rng, n, (x) => highPass(x, c.rainHz)), c.rainCycles, c.rainDepth);
  for (let i = 0; i < n; i++) out[i] = out[i] * c.rainGain;
  mixInto(out, loopSway(loopNoise(rng, n, (x) => bandPass(x, c.windLowHz, c.windHighHz)), c.windCycles, c.windDepth), c.windGain);
  mixInto(out, loopSway(loopNoise(rng, n, (x) => bandPass(x, c.gustLowHz, c.gustHighHz)), c.windCycles, c.windDepth), c.gustGain);
  return rotateToQuietSeam(out, SEAM.quietS);
}
var DRONE = {
  cyclesA: 144,
  cyclesB: 150,
  harmonics: 16,
  tilt: 0.8,
  boostFrom: 5,
  boostTo: 9,
  boost: 2.2,
  gainB: 0.8,
  drive: 1.2,
  washLowHz: 400,
  washHighHz: 1600,
  washCycles: 18,
  washDepth: 0.6,
  washGain: 0.5
};
function drone(n) {
  const c = DRONE;
  const rng = new SeededRng(SFX_SEED_DRONE);
  const amps = [];
  for (let h = 1; h <= c.harmonics; h++) amps.push(Math.pow(h, -c.tilt) * (h >= c.boostFrom && h <= c.boostTo ? c.boost : 1));
  const out = saturate(normalizePeak(mixInto(harmonics(n, c.cyclesA, amps), harmonics(n, c.cyclesB, amps), c.gainB), 1), c.drive);
  mixInto(out, loopSway(loopNoise(rng, n, (x) => bandPass(x, c.washLowHz, c.washHighHz)), c.washCycles, c.washDepth), c.washGain);
  return rotateToQuietSeam(out, SEAM.quietS);
}
var LOOP_RECIPES = { engine, sea, fire, rain, drone };

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/assets/sfx-recipes-splashes.ts
var SPLASH_S = { lowHz: 1e3, highHz: 5e3, toLowHz: 700, toHighHz: 3600, glideS: 0.3, attackS: 5e-3, decayS: 0.15 };
function splashS(n) {
  const c = SPLASH_S;
  const rng = new SeededRng(SFX_SEED_SPLASH_S);
  return mul(bandPass(whiteNoise(rng, n), c.lowHz, c.highHz, c.toLowHz, c.toHighHz, c.glideS), envelope(n, c.attackS, c.decayS));
}
var SPLASH_L = {
  thumpHz: 70,
  thumpAttackS: 4e-3,
  thumpDecayS: 0.2,
  thumpGain: 0.9,
  thumpDrive: 2.4,
  washLowHz: 300,
  washHighHz: 3e3,
  washToLowHz: 180,
  washToHighHz: 1500,
  washGlideS: 0.6,
  washAttackS: 0.012,
  washDecayS: 0.4,
  washGain: 2,
  fallAtS: 0.22,
  fallLowHz: 1500,
  fallHighHz: 5e3,
  fallAttackS: 0.12,
  fallDecayS: 0.35,
  fallGain: 0.3
};
function splashL(n) {
  const c = SPLASH_L;
  const rng = new SeededRng(SFX_SEED_SPLASH_L);
  const out = saturate(mul(sine(n, c.thumpHz), envelope(n, c.thumpAttackS, c.thumpDecayS)), c.thumpDrive);
  for (let i = 0; i < n; i++) out[i] = out[i] * c.thumpGain;
  mixInto(out, mul(bandPass(whiteNoise(rng, n), c.washLowHz, c.washHighHz, c.washToLowHz, c.washToHighHz, c.washGlideS), envelope(n, c.washAttackS, c.washDecayS)), c.washGain);
  mixInto(out, mul(bandPass(whiteNoise(rng, n), c.fallLowHz, c.fallHighHz), envelope(n, c.fallAttackS, c.fallDecayS, c.fallAtS)), c.fallGain);
  return out;
}
var SPLASH_RECIPES = { splash_s: splashS, splash_l: splashL };

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/assets/sfx-bank.ts
var RECIPES = { ...GUN_RECIPES, ...SPLASH_RECIPES, ...BLAST_RECIPES, ...CUE_RECIPES, ...RELOAD_RECIPES, ...EVENT_RECIPES, ...LAUNCH_RECIPES, ...LOOP_RECIPES };
function sfxImplementedKeys() {
  return SFX_KEYS.filter((k) => RECIPES[k] !== void 0);
}
function renderSfx(key) {
  const recipe = RECIPES[key];
  if (!recipe) throw new Error(`sfx '${key}' \u306E\u4F5C\u308A\u65B9\u306F\u307E\u3060\u7121\u3044\uFF08v0.7.1 \u306E S2\u301CS4 \u3067\u8DB3\u3059\uFF09`);
  const def2 = SFX_TABLE[key];
  const n = sfxSamples(def2.seconds);
  const x = recipe(n);
  if (x.length !== n) throw new Error(`sfx '${key}' \u306E\u9577\u3055 ${x.length} \u304C\u8868\u306E ${n} \u3068\u9055\u3046`);
  return finishSfx(x, def2.loop);
}
function finishSfx(x, loop) {
  removeDc(x);
  if (!loop) fadeEdges(x);
  return normalizePeak(x);
}

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/scripts/sfx-files.ts
import { deflateSync } from "node:zlib";
function wavBytes(x, sampleRate) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + x.length * 2, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  return b;
}
function wavStereoBytes(l, r, sampleRate) {
  const b = Buffer.alloc(44 + l.length * 4);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + l.length * 4, 4);
  b.write("WAVEfmt ", 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(2, 22);
  b.writeUInt32LE(sampleRate, 24);
  b.writeUInt32LE(sampleRate * 4, 28);
  b.writeUInt16LE(4, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(l.length * 4, 40);
  for (let i = 0; i < l.length; i++) {
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l[i])) * 32767), 44 + i * 4);
    b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r[i])) * 32767), 46 + i * 4);
  }
  return b;
}
function spectrum(x, from, len, size) {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let i = 0; i < Math.min(len, size); i++) re[i] = (x[from + i] ?? 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / len));
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const t = re[i];
      re[i] = re[j];
      re[j] = t;
    }
  }
  for (let m = 2; m <= size; m <<= 1) {
    const ang = -2 * Math.PI / m;
    for (let s = 0; s < size; s += m) {
      for (let k = 0; k < m / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const a = s + k, c = a + m / 2;
        const tr = re[c] * wr - im[c] * wi, ti = re[c] * wi + im[c] * wr;
        re[c] = re[a] - tr;
        im[c] = im[a] - ti;
        re[a] = re[a] + tr;
        im[a] = im[a] + ti;
      }
    }
  }
  const out = new Float64Array(size / 2);
  for (let i = 0; i < out.length; i++) out[i] = Math.hypot(re[i], im[i]);
  return out;
}
function centroidHz(x, from, to, sampleRate) {
  let size = 256;
  while (size < to - from) size <<= 1;
  const mag = spectrum(x, from, to - from, size);
  let num = 0, den = 0;
  for (let i = 1; i < mag.length; i++) {
    const p = mag[i] * mag[i];
    num += p * (i * sampleRate / size);
    den += p;
  }
  return den > 0 ? num / den : 0;
}
var CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
  return c >>> 0;
});
function crc32(b) {
  let c = 4294967295;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ c >>> 8;
  return (c ^ 4294967295) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function pngBytes(rgb, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
var STRIP_W = 640;
var WAVE_H = 72;
var SPEC_H = 128;
var STRIP_H = WAVE_H + SPEC_H + 6;
function drawStrip(rgb, y0, x) {
  const put = (px, py, r, g, b) => {
    const o = ((y0 + py) * STRIP_W + px) * 3;
    rgb[o] = r;
    rgb[o + 1] = g;
    rgb[o + 2] = b;
  };
  for (let px = 0; px < STRIP_W; px++) {
    const a = Math.floor(px * x.length / STRIP_W), b = Math.max(a + 1, Math.floor((px + 1) * x.length / STRIP_W));
    let lo = 1, hi = -1;
    for (let i = a; i < b; i++) {
      const v = x[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const yHi = Math.round((1 - hi) * 0.5 * (WAVE_H - 1)), yLo = Math.round((1 - lo) * 0.5 * (WAVE_H - 1));
    for (let py = 0; py < WAVE_H; py++) {
      const on = py >= yHi && py <= yLo;
      const mid = py === WAVE_H - 1 >> 1;
      put(px, py, on ? 120 : mid ? 60 : 16, on ? 220 : mid ? 60 : 16, on ? 140 : mid ? 60 : 24);
    }
    const win = Math.min(256, x.length);
    const from = Math.max(0, Math.min(x.length - win, Math.round((px + 0.5) * x.length / STRIP_W - win / 2)));
    const mag = spectrum(x, from, win, 256);
    for (let py = 0; py < SPEC_H; py++) {
      const db2 = 20 * Math.log10(mag[SPEC_H - 1 - py] / (win / 4) + 1e-9);
      const u = Math.max(0, Math.min(1, (db2 + 70) / 70));
      put(px, WAVE_H + 6 + py, Math.round(255 * Math.min(1, u * 1.6)), Math.round(255 * Math.max(0, u * 1.8 - 0.6)), Math.round(255 * (u < 0.5 ? u * 1.2 : Math.max(0, u * 3 - 2))));
    }
  }
}

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/scripts/sfx-mixdown.ts
var SR5 = SFX_SAMPLE_RATE;
var cache = /* @__PURE__ */ new Map();
function samples(key) {
  let x = cache.get(key);
  if (!x) {
    x = renderSfx(key);
    cache.set(key, x);
  }
  return x;
}
function mixdown(c, tailS = 3) {
  const n = Math.ceil((c.t1 - c.t0 + tailS) * SR5);
  const m = { mono: new Float32Array(n), left: new Float32Array(n), right: new Float32Array(n), blast: new Float32Array(n), rest: new Float32Array(n), blastAt: [], played: 0 };
  const plays = c.log.filter((r) => r[6] >= 0).map((r) => ({ r, stopAt: Infinity }));
  const onVoice = /* @__PURE__ */ new Map();
  for (const p of plays) {
    if (p.r[11] === 1) {
      const prev = onVoice.get(p.r[6]);
      if (prev) prev.stopAt = p.r[0];
    }
    onVoice.set(p.r[6], p);
  }
  for (const p of plays) {
    const [t, key, , , rate, , , , gain, pan] = p.r;
    const x = samples(key);
    const at = Math.round((t - c.t0) * SR5);
    const len = Math.min(Math.floor((x.length - 1) / rate), n - at, p.stopAt === Infinity ? Infinity : Math.round((p.stopAt - t) * SR5));
    const a = (pan + 1) / 2 * (Math.PI / 2);
    const gl = Math.cos(a) * gain, gr = Math.sin(a) * gain;
    const isBlast = SFX_TABLE[key].family === "blast" && key !== "sink";
    const stem = isBlast ? m.blast : m.rest;
    if (isBlast) m.blastAt.push(at);
    for (let i = 0; i < len; i++) {
      const pos = i * rate;
      const j = Math.floor(pos);
      const v = x[j] + (x[j + 1] - x[j]) * (pos - j);
      m.mono[at + i] = m.mono[at + i] + v * gain;
      m.left[at + i] = m.left[at + i] + v * gl;
      m.right[at + i] = m.right[at + i] + v * gr;
      stem[at + i] = stem[at + i] + v * gain;
    }
    m.played++;
  }
  return m;
}
function mixStats(m, from = 0, to = m.mono.length) {
  let peak = 0, peakStereo = 0, over = 0, sum = 0, worst = 0, secOver = 0;
  for (let i = from; i < to; i++) {
    const a = Math.abs(m.mono[i]);
    if (a > peak) peak = a;
    const s = Math.max(Math.abs(m.left[i]), Math.abs(m.right[i]));
    if (s > peakStereo) peakStereo = s;
    if (a > 1) {
      over++;
      secOver++;
    }
    sum += a * a;
    if ((i - from + 1) % SR5 === 0 || i === to - 1) {
      if (secOver / SR5 > worst) worst = secOver / SR5;
      secOver = 0;
    }
  }
  const len = Math.max(1, to - from);
  return { peak, peakStereo, overShare: over / len, rms: Math.sqrt(sum / len), worstSecOver: worst };
}
function busiestWindow(c, windowS) {
  const total2 = Math.max(1, Math.ceil(c.t1 - c.t0));
  const perSec = new Uint32Array(total2 + 1);
  for (const r of c.log) if (r[6] >= 0) perSec[Math.min(total2, Math.floor(r[0] - c.t0))]++;
  let best = 0, bestAt = 0;
  for (let s = 0; s + windowS <= total2 || s === 0; s++) {
    let k = 0;
    for (let i = s; i < Math.min(total2 + 1, s + windowS); i++) k += perSec[i];
    if (k > best) {
      best = k;
      bestAt = s;
    }
  }
  return { from: bestAt * SR5, count: best };
}
function blastMargins(m, headS = 0.3) {
  const len = Math.round(headS * SR5);
  const out = [];
  for (const at of m.blastAt) {
    let b = 0, r = 0;
    for (let i = at; i < Math.min(m.mono.length, at + len); i++) {
      b += m.blast[i] * m.blast[i];
      r += m.rest[i] * m.rest[i];
    }
    out.push(10 * Math.log10((b + 1e-12) / (r + 1e-12)));
  }
  return out.sort((x, y) => x - y);
}
function limiterCurveDb(x) {
  const { thresholdDb: T, kneeDb: K, ratio: R } = SFX_LIMITER;
  const over = x - T;
  return over <= 0 ? x : over < K ? x + (1 / R - 1) * over * over / (2 * K) : T + K + (1 / R - 1) * K / 2 + (over - K) / R;
}
var LIMITER_MAKEUP = Math.pow(10, -limiterCurveDb(0) * 0.6 / 20);
function limiterGain(m, add, addGain = 1) {
  const { attackS, releaseS } = SFX_LIMITER;
  const up = 1 - Math.exp(-1 / (attackS * SR5));
  const down = 1 - Math.exp(-1 / (releaseS * SR5));
  const out = new Float32Array(m.mono.length);
  let env = 0;
  for (let i = 0; i < out.length; i++) {
    const e = add ? add[i] * addGain : 0;
    const a = Math.max(Math.abs(m.left[i] + e), Math.abs(m.right[i] + e));
    env += (a > env ? up : down) * (a - env);
    const x = 20 * Math.log10(env + 1e-9);
    out[i] = Math.pow(10, (limiterCurveDb(x) - x) / 20);
  }
  return out;
}
function limiterStats(m, g, from = 0, to = g.length) {
  let on = 0, over3 = 0, min = 1;
  for (let i = from; i < to; i++) {
    if (Math.max(Math.abs(m.left[i]), Math.abs(m.right[i])) <= 0.01) continue;
    on++;
    if (g[i] < 0.708) over3++;
    if (g[i] < min) min = g[i];
  }
  return { over3Share: on > 0 ? over3 / on : 0, maxDb: -20 * Math.log10(min) };
}
function blastPops(m, g, headS = 0.3, beforeS = 1) {
  const power = (a, b) => {
    let s = 0;
    for (let i = Math.max(0, a); i < Math.min(g.length, b); i++) s += (m.left[i] * m.left[i] + m.right[i] * m.right[i]) * g[i] * g[i];
    return s / Math.max(1, b - a);
  };
  const h = Math.round(headS * SR5), p = Math.round(beforeS * SR5);
  return m.blastAt.map((at) => 10 * Math.log10((power(at, at + h) + 1e-9) / (power(at - p, at) + 1e-9))).sort((x, y) => x - y);
}
var loopCache = /* @__PURE__ */ new Map();
var LOOP_KEYS = ["engine", "sea", "fire", "rain", "drone"];
function loopStem(c, n) {
  const out = new Float32Array(n);
  const rows = c.loops ?? [];
  const k = 1 - Math.exp(-1 / (SFX_LOOP_TIME_CONSTANT_S * SR5));
  for (let li = 0; li < LOOP_KEYS.length; li++) {
    const key = LOOP_KEYS[li];
    let x = loopCache.get(key);
    if (!x) {
      x = renderSfx(key);
      loopCache.set(key, x);
    }
    const len = x.length;
    let g = 0, r = 1, gT = 0, rT = 1, ph = 0, ri = 0;
    for (let i = 0; i < n; i++) {
      const t = c.t0 + i / SR5;
      while (ri < rows.length && rows[ri][0] <= t) {
        const row = rows[ri++];
        gT = row[1 + li];
        rT = li === 0 ? row[6] : li === 4 ? row[7] : 1;
      }
      g += (gT - g) * k;
      r += (rT - r) * k;
      const j = Math.floor(ph);
      const a = x[j], b = x[j + 1 < len ? j + 1 : 0];
      out[i] = out[i] + (a + (b - a) * (ph - j)) * g;
      ph += r;
      if (ph >= len) ph -= len;
    }
  }
  return out;
}
var LOOKAHEAD_S = 6e-3;
function routeStats(m, loops, bus, through, from = 0, to = m.mono.length) {
  const g0 = through ? limiterGain(m, loops, bus) : limiterGain(m);
  const n = m.mono.length;
  const la = Math.round(LOOKAHEAD_S * SR5);
  const g = new Float32Array(n);
  for (let i = 0; i < n; i++) g[i] = g0[i + la < n ? i + la : n - 1];
  const outL = new Float32Array(n), outR = new Float32Array(n);
  const quiet = [], duck = [];
  let peak = 0, over = 0, qs = 0, qn = 0;
  for (let i = 0; i < n; i++) {
    const lp = loops[i] * bus;
    const lg = through ? g[i] * LIMITER_MAKEUP : 1;
    outL[i] = (m.left[i] * g[i] * LIMITER_MAKEUP + lp * lg) * SFX_MASTER_GAIN;
    outR[i] = (m.right[i] * g[i] * LIMITER_MAKEUP + lp * lg) * SFX_MASTER_GAIN;
    if (i < from || i >= to) continue;
    const a = Math.max(Math.abs(outL[i]), Math.abs(outR[i]));
    if (a > peak) peak = a;
    if (a > 1) over++;
    const shot = Math.max(Math.abs(m.left[i]), Math.abs(m.right[i]));
    const red = through ? -20 * Math.log10(g[i]) : 0;
    if (shot < 3e-3) {
      qs += (lp * lg * SFX_MASTER_GAIN) ** 2;
      qn++;
      if (i % 64 === 0) quiet.push(red);
    } else if (shot > 0.05 && i % 64 === 0) duck.push(red);
  }
  const mid = (a, q) => a.length ? a.sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))] : 0;
  const power = (a, b) => {
    let s2 = 0;
    for (let i = Math.max(0, a); i < Math.min(n, b); i++) s2 += outL[i] * outL[i] + outR[i] * outR[i];
    return s2 / Math.max(1, b - a);
  };
  const h = Math.round(0.3 * SR5), p = SR5;
  const pops = m.blastAt.filter((at) => at >= from && at < to).map((at) => 10 * Math.log10((power(at, at + h) + 1e-9) / (power(at - p, at) + 1e-9))).sort((x, y) => x - y);
  return { quietLoopRms: Math.sqrt(qs / Math.max(1, qn)), quietDb: mid(quiet, 0.5), duckDb: mid(duck, 0.5), duck95Db: mid(duck, 0.95), outPeak: peak, outOver: over / Math.max(1, to - from), pops };
}

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/config/sfx-music-config.ts
var MUSIC_SAMPLE_RATE = 22050;
var MUSIC_PEAK = 0.9;
var MUSIC_LAYER_KEYS = ["mission_l0", "mission_l1", "mission_l2"];
var MUSIC_LENGTHS = {
  title_a: 672e3,
  title_b: 403200,
  title_c: 604800,
  mission_l0: 470400,
  mission_l1: 470400,
  mission_l2: 117600
};
var SFX_SEED_MUSIC_A = 7603;
var SFX_SEED_MUSIC_B = 7619;
var SFX_SEED_MUSIC_C = 7621;
var SFX_SEED_MUSIC_L0 = 7622;
var SFX_SEED_MUSIC_L1 = 7623;
var SFX_SEED_MUSIC_L2 = 7624;
var SFX_SEED_MUSIC_NOISE = 7699;
var MUSIC_GAIN = {
  title_a: 0.411,
  title_b: 0.399,
  title_c: 0.622,
  mission_l0: 0.152,
  mission_l1: 0.232,
  mission_l2: 0.268
};
var MUSIC_MOOD_BATTLE = 2;
var MUSIC_MOOD_SINK = 3;
var MUSIC_MOOD_WEIGHTS = [[1, 0, 0], [0.8, 1, 0], [0.6, 0.8, 1]];
var SFX_MUSIC_MOOD = {
  updateHz: 10,
  riseTcBattleS: 0.6,
  riseTcTenseS: 1.5,
  holdBattleS: 6,
  holdTenseS: 8,
  fallBattleS: 3,
  fallTenseS: 4,
  sinkFadeS: 2.5,
  maxChangesPerMin: 6,
  hitMinDropHp: 0.5
};
var MUSIC_FADE = {
  firstInS: 2,
  menuInS: 2,
  menuOutS: 1.2,
  missionInS: 3,
  missionOutS: 0.5,
  resultReturnedDelayS: 2.2,
  resultLostDelayS: 3,
  pauseS: 0.15,
  musicOffS: 0.3,
  muteStopS: 0.15,
  labCrossS: 0.5,
  hastyStopS: 0.03
};
var MUSIC_PLAYER = { updateHz: 10, startLeadS: 0.05, slots: 9, layersMax: 3, fadeTc: 0.25, timingRing: 512 };
var SFX_MUSIC_DUCK = {
  alarm: { db: -8, holdS: 0.8 },
  bell: { db: -6, holdS: 1.2 },
  torp_hit: { db: -5, holdS: 0.8 },
  blast_l: { db: -4, holdS: 0.5, maxBand: 1 },
  light_on: { db: -4, holdS: 0.5 }
};
var SFX_MUSIC_DUCK_SHAPE = { downTcS: 0.03, upS: 0.25, reworkWindowS: 0.5, reworkMax: 2 };
var MUSIC_BUILD_BUDGET = 15e4;
var MUSIC_COST = { tone: 1, toneMix: 2, fm: 3, noise: 2, fx: 3, pass: 0.5, tablePoint: 1, note: 300 };
var MUSIC_BUILD_WARM = { samples: 6e5, perCall: 2e4, passShare: 0.25 };
var MUSIC_WORK_SAMPLES = 672e3;

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/assets/sfx-music-synth.ts
var SR6 = MUSIC_SAMPLE_RATE;
var TAU4 = Math.PI * 2;
var LN102 = Math.log(10);
var MUSIC_TAB = 2048;
var TAB = MUSIC_TAB;
var MASK = TAB - 1;
var ROW = TAB + 2;
var OCT_BASE_HZ = 110;
var OCTS = 6;
var TOP_HZ = 1e4;
var TAIL = 2.5;
var NOISE_N = 1 << 15;
var MOD_BLOCK = 31;
var WAVES = ["warm", "dark", "bright", "brassLo", "brassHi", "mute"];
var WAVE_AMP = {
  warm: (h) => 1 / h / (1 + (h / 6) ** 2),
  dark: (h) => 1 / h / (1 + (h / 3) ** 2),
  bright: (h) => h === 1 ? 0.45 : 1 / h,
  brassLo: (h) => h <= 4 ? 1 / (h * h) : 0,
  brassHi: (h, hz2) => (hz2 < 1800 ? 1 : (1800 / hz2) ** 2) / Math.sqrt(h),
  mute: (h, hz2) => (h === 1 ? 0.2 : 1 / Math.sqrt(h)) * (0.15 + Math.exp(-(((hz2 - 1700) / 700) ** 2)))
};
var harmonicsOf = (o) => Math.max(1, Math.floor(TOP_HZ / (OCT_BASE_HZ * 2 ** (o + 1))));
var refHz = (o) => OCT_BASE_HZ * 2 ** (o + 0.5);
var octaveOf = (hz2) => Math.min(OCTS - 1, Math.max(0, Math.floor(Math.log2(hz2 / OCT_BASE_HZ))));
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
function midiHz(p) {
  return 440 * 2 ** ((p - 69) / 12);
}
function musicUnitsPerSample(inst) {
  const d = MUSIC_INSTRUMENTS[inst];
  return d.kind === "fm" ? MUSIC_COST.fm : d.kind === "noise" ? MUSIC_COST.noise : d.wave2 ? MUSIC_COST.toneMix : MUSIC_COST.tone;
}
function attackN(d, nt) {
  return Math.max(1, Math.round(d.attackFrac ? nt.len * d.attackFrac : d.attackS * SR6));
}
function decayOf(d, nt) {
  return nt.decayS > 0 ? nt.decayS : d.decayFrac ? nt.len * d.decayFrac / SR6 : d.decayS;
}
function musicNoteSamples(nt) {
  const d = MUSIC_INSTRUMENTS[nt.inst], dec = Math.max(decayOf(d, nt), d.bodyGain ? d.bodyDecayS ?? 0 : 0), ring = dec > 0 ? attackN(d, nt) + Math.ceil(TAIL * dec * SR6) : Infinity;
  return d.kind === "fm" ? ring : Math.min(ring, nt.len + Math.ceil(TAIL * d.releaseS * SR6));
}
function stepHarmonic(w, s, base, h, a) {
  for (let i = 0; i < TAB; i++) w[base + i] = w[base + i] + a * s[h * i & MASK];
}
var MusicTables = class {
  sine = new Float64Array(ROW);
  waves = new Float32Array(WAVES.length * OCTS * ROW);
  noise = new Float32Array(NOISE_N);
  rng = new SeededRng(SFX_SEED_MUSIC_NOISE);
  /** 次の仕事（表の番号。WAVES × OCTS で雑音、その次で済み）と、その中の次の倍音（雑音は次の標本） */
  job = 0;
  at = 0;
  norm = 0;
  constructor() {
    for (let i = 0; i < ROW; i++) this.sine[i] = Math.sin(TAU4 * (i & MASK) / TAB);
  }
  get ready() {
    return this.job > WAVES.length * OCTS;
  }
  /** 波形 wave・基音 hz の表の始まり（waves の添字） */
  waveRow(wave, hz2) {
    return (WAVES.indexOf(wave) * OCTS + octaveOf(hz2)) * ROW;
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
function stepTone(dst, n, nt, i0, i1, st, tb, wowDepth, wowCycles) {
  const d = MUSIC_INSTRUMENTS[nt.inst], w = tb.waves, s = tb.sine, hz2 = midiHz(nt.pitch);
  const inc = hz2 * TAB / SR6, r1 = tb.waveRow(d.wave, hz2), r2 = d.wave2 ? tb.waveRow(d.wave2, hz2) : -1;
  const an = attackN(d, nt), invA = 1 / an, len = nt.len, g = nt.vel * d.gain, dec = decayOf(d, nt);
  const rD = dec > 0 ? Math.exp(-LN102 / (dec * SR6)) : 1, rR = Math.exp(-LN102 / (d.releaseS * SR6));
  const bn = Math.max(1, Math.round((d.brightS ?? 0) * SR6)), bright = d.bright ?? 0;
  const vibInc = (d.vibHz ?? 0) * TAB / SR6 * (MOD_BLOCK + 1), vibD = d.vibDepth ?? 0;
  const vib0 = Math.round((d.vibDelayS ?? 0) * SR6), vibRamp = Math.max(1, Math.round((d.vibRampS ?? 0) * SR6)), wowK = wowCycles * TAB / n;
  let ph = st[0], e = st[1], cur = st[2], lfo = st[3];
  if (i0 === 0) {
    ph = 0;
    e = 0;
    cur = inc;
    lfo = 0;
  }
  const split = n - nt.start;
  for (let seg = 0; seg < 2; seg++) {
    const a = seg === 0 ? i0 : Math.max(i0, split), b = seg === 0 ? Math.min(i1, split) : i1, off = seg === 0 ? nt.start : nt.start - n;
    for (let i = a; i < b; i++) {
      if ((i & MOD_BLOCK) === 0 && (vibD > 0 || wowDepth > 0)) {
        const depth = i <= vib0 ? 0 : i >= vib0 + vibRamp ? vibD : vibD * (i - vib0) / vibRamp;
        cur = inc * (1 + depth * s[lfo | 0] + wowDepth * s[(nt.start + i) * wowK % TAB | 0]);
        if ((lfo += vibInc) >= TAB) lfo -= TAB;
      }
      e = i >= len ? e * rR : i < an ? i * invA : i === an ? 1 : e * rD;
      const j = ph | 0, f = ph - j;
      let v = w[r1 + j] + (w[r1 + j + 1] - w[r1 + j]) * f;
      if (r2 >= 0) v += (w[r2 + j] + (w[r2 + j + 1] - w[r2 + j]) * f - v) * (i >= bn ? bright : bright * i / bn);
      dst[i + off] = dst[i + off] + v * e * g;
      if ((ph += cur) >= TAB) ph -= TAB;
    }
  }
  st[0] = ph;
  st[1] = e;
  st[2] = cur;
  st[3] = lfo;
}
function stepFm(dst, n, nt, i0, i1, st, tb) {
  const d = MUSIC_INSTRUMENTS[nt.inst], s = tb.sine, ic = midiHz(nt.pitch) * TAB / SR6, im = ic * (d.ratio ?? 1);
  const an = attackN(d, nt), invA = 1 / an, g = nt.vel * d.gain, k = TAB / TAU4;
  const rA = Math.exp(-LN102 / (decayOf(d, nt) * SR6)), rI = Math.exp(-LN102 / ((d.indexDecayS ?? 1) * SR6));
  let pc = st[0], pm = st[1], e = st[2], x = st[3];
  if (i0 === 0) {
    pc = 0;
    pm = 0;
    e = 0;
    x = d.index ?? 0;
  }
  const split = n - nt.start;
  for (let seg = 0; seg < 2; seg++) {
    const a = seg === 0 ? i0 : Math.max(i0, split), b = seg === 0 ? Math.min(i1, split) : i1, off = seg === 0 ? nt.start : nt.start - n;
    for (let i = a; i < b; i++) {
      e = i < an ? i * invA : i === an ? 1 : e * rA;
      const jm = pm | 0, m = s[jm] + (s[jm + 1] - s[jm]) * (pm - jm);
      let p = pc + x * m * k;
      p -= Math.floor(p / TAB) * TAB;
      const jc = p | 0;
      dst[i + off] = dst[i + off] + (s[jc] + (s[jc + 1] - s[jc]) * (p - jc)) * e * g;
      if ((pc += ic) >= TAB) pc -= TAB;
      if ((pm += im) >= TAB) pm -= TAB;
      x *= rI;
    }
  }
  st[0] = pc;
  st[1] = pm;
  st[2] = e;
  st[3] = x;
}
function stepNoise(dst, n, nt, i0, i1, st, tb) {
  const d = MUSIC_INSTRUMENTS[nt.inst], z = tb.noise, s = tb.sine, g = nt.vel * d.gain, ng = d.noiseGain ?? 1, bg = d.bodyGain ?? 0;
  const aH = 1 - Math.exp(-TAU4 * (d.hpHz ?? 20) / SR6), aL = 1 - Math.exp(-TAU4 * (d.lpHz ?? 1e4) / SR6);
  const an = attackN(d, nt), invA = 1 / an, len = nt.len, dec = decayOf(d, nt);
  const rD = dec > 0 ? Math.exp(-LN102 / (dec * SR6)) : 1, rR = Math.exp(-LN102 / (d.releaseS * SR6));
  const bTo = (d.bodyToHz ?? 0) * TAB / SR6, rG = Math.exp(Math.log((d.bodyToHz ?? 1) / (d.bodyHz ?? 1)) / (0.03 * SR6)), rB = Math.exp(-LN102 / ((d.bodyDecayS ?? 1) * SR6));
  let lo = st[0], y = st[1], e = st[2], be = st[3], bp = st[4], bi = st[5];
  if (i0 === 0) {
    lo = 0;
    y = 0;
    e = 0;
    be = 1;
    bp = 0;
    bi = (d.bodyHz ?? 0) * TAB / SR6;
  }
  const split = n - nt.start, z0 = nt.noise;
  for (let seg = 0; seg < 2; seg++) {
    const a = seg === 0 ? i0 : Math.max(i0, split), b = seg === 0 ? Math.min(i1, split) : i1, off = seg === 0 ? nt.start : nt.start - n;
    for (let i = a; i < b; i++) {
      const x = z[z0 + i & NOISE_N - 1];
      lo += aH * (x - lo);
      y += aL * (x - lo - y);
      e = i >= len ? e * rR : i < an ? i * invA : i === an ? 1 : e * rD;
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

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/assets/sfx-music-compose.ts
var SR7 = MUSIC_SAMPLE_RATE;
var MODES = { aeolian: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], harmonic: [0, 2, 3, 5, 7, 8, 11], major: [0, 2, 4, 5, 7, 9, 11] };
var QUALITY = { "": [0, 4, 7], m: [0, 3, 7], "7": [0, 4, 7, 10], m7: [0, 3, 7, 10] };
var W_STEP = 0.35;
var W_LEAP = 0.05;
var W_SAME = 0.05;
var MAX_LEAP = 7;
var W_ON = 1.6;
var W_BACK = 0.4;
var SHIFTS = [-2, -1, 1, 2];
var NOISE_SPAN = 1 << 15;
var pcOf = (p) => (Math.round(p) % 12 + 12) % 12;
var sixteenthOf = (bpm) => SR7 * 60 / (bpm * 4);
function chordPcs(sym) {
  const m = /^([A-G])([b#]?)(m7|m|7|)$/.exec(sym);
  if (!m) throw new Error(`\u548C\u97F3 '${sym}' \u304C\u8AAD\u3081\u306A\u3044`);
  const root = "C.D.EF.G.A.B".indexOf(m[1]) + (m[2] === "b" ? -1 : m[2] === "#" ? 1 : 0);
  return QUALITY[m[3]].map((iv) => (root + iv + 12) % 12);
}
function barScale(th, chord) {
  const sc = MODES[th.mode].map((iv) => (th.tonic + iv) % 12);
  for (const c of chord) if (!sc.includes(c)) sc[sc.includes((c + 11) % 12) ? sc.indexOf((c + 11) % 12) : sc.indexOf((c + 1) % 12)] = c;
  return sc;
}
function scaleStep(p, k, sc) {
  let q = Math.round(p);
  while (!sc.includes(pcOf(q))) q++;
  for (let i = 0; i < Math.abs(k); i++) do
    q += Math.sign(k);
  while (!sc.includes(pcOf(q)));
  return q;
}
function nearestOf(p, pcs, lo, hi) {
  let best = lo, bd = Infinity;
  for (let q = lo; q <= hi; q++) if (pcs.includes(pcOf(q)) && Math.abs(q - p) < bd) {
    bd = Math.abs(q - p);
    best = q;
  }
  return best;
}
var clampOct = (p, lo, hi) => p > hi ? clampOct(p - 12, lo, hi) : p < lo ? clampOct(p + 12, lo, hi) : p;
var pick2 = (list, rng) => list[Math.floor(rng.next() * list.length)];
var lowest = (pc, lo) => lo + (pc - lo % 12 + 12) % 12;
var tonicTriad = (th) => [th.tonic, (th.tonic + (th.mode === "major" ? 4 : 3)) % 12, (th.tonic + 7) % 12];
function note(inst, start, len, pitch, vel, decayS = 0, noise = 0) {
  return { inst, start: Math.round(start), len: Math.max(1, Math.round(len)), pitch, vel, decayS, noise };
}
function cadencePcs(th, o) {
  const half = [(th.tonic + 2) % 12, (th.tonic + 7) % 12].filter((x) => o.ch.includes(x));
  return o.cad === "half" ? half.length > 0 ? half : [(th.tonic + 2) % 12, (th.tonic + 7) % 12] : o.cad === "end" ? [o.ch.includes(th.tonic) ? th.tonic : o.ch[0]] : o.ch;
}
function canStepBack(th, q, d, nx, fixed, lo, hi) {
  for (const r of fixed !== null ? [fixed] : [q - 2, q - 1, q + 1, q + 2]) {
    const ok = Math.abs(r - q) >= 1 && Math.abs(r - q) <= 2 && Math.sign(r - q) === -Math.sign(d) && r >= lo && r <= hi && nx.sc.includes(pcOf(r));
    if (ok && (!nx.strong || nx.ch.includes(pcOf(r))) && (!nx.cad || cadencePcs(th, nx).includes(pcOf(r)))) return true;
  }
  return false;
}
function copyPitch(o, src, lo, hi) {
  const p = clampOct(scaleStep(src, o.shift, o.sc), lo, hi);
  return o.strong && !o.ch.includes(pcOf(p)) ? nearestOf(p, o.ch, lo, hi) : p;
}
function composeMelody(th, m, rng, six) {
  const barN = th.beats * 4, lo = m.low, hi = m.high, mid = (lo + hi) / 2, triad = tonicTriad(th);
  const rh = [], first = [], on = [], ps = [], out = [];
  for (let s = 0; s < th.bars / m.span; s++) {
    const bar1 = s * m.span + 1, motif = m.motifs.find((x) => x[0] === bar1), cad = m.cadences.find((x) => x[0] === bar1 + m.span - 1)?.[1];
    const srcSlot = motif ? (motif[1] - 1) / m.span : -1, shift = srcSlot >= 0 ? pick2(SHIFTS, rng) : 0;
    const r = srcSlot >= 0 ? rh[srcSlot] : pick2(cad ? m.ends : m.rhythms, rng);
    rh.push(r);
    first.push(on.length);
    for (let k = 0; k < r.length; k += 3) {
      const at = s * barN * m.span + r[k], pos = at % barN, ch = chordPcs(th.chords[Math.floor(at / barN)]);
      on.push({ at, dur: r[k + 1], vel: r[k + 2] / 100, strong: pos === 0 || th.beats === 4 && pos === 8, ch, sc: barScale(th, ch), cad: k + 3 >= r.length ? cad : void 0, src: srcSlot >= 0 ? first[srcSlot] + k / 3 : -1, shift });
    }
  }
  for (let i = 0; i < on.length; i++) {
    const o = on[i], nx = on[i + 1], prev = ps[i - 1] ?? -1, iv = i >= 2 && !on[i - 1].cad ? prev - ps[i - 2] : 0;
    let run = 0;
    for (let j = i - 1; j >= 0 && triad.includes(pcOf(ps[j])) && (j === i - 1 || ps[j] !== ps[j + 1]); j--) run++;
    let p;
    if (o.src >= 0) p = copyPitch(o, ps[o.src], lo, hi);
    else if (o.cad) p = nearestOf(prev < 0 ? mid : prev, cadencePcs(th, o), lo, hi);
    else if (prev < 0) p = nearestOf(mid + rng.next() * 6 - 3, o.ch, lo, hi);
    else {
      const fixed = nx && nx.src >= 0 && nx.src < i ? copyPitch(nx, ps[nx.src], lo, hi) : null, cand = [], w = [];
      let total2 = 0;
      for (let q = Math.max(lo, prev - MAX_LEAP); q <= Math.min(hi, prev + MAX_LEAP); q++) {
        if (!o.sc.includes(pcOf(q)) || o.strong && !o.ch.includes(pcOf(q))) continue;
        const d = q - prev, ad = Math.abs(d);
        let wt = ad === 0 ? prev === ps[i - 2] ? 0 : W_SAME : ad <= 2 ? W_STEP : W_LEAP;
        if (Math.abs(iv) >= 3 && !(ad >= 1 && ad <= 2 && Math.sign(d) === -Math.sign(iv))) wt = 0;
        if (ad >= 3 && nx && !canStepBack(th, q, d, nx, fixed, lo, hi)) wt = 0;
        if (run >= 3 && q !== prev && triad.includes(pcOf(q))) wt = 0;
        if (Math.abs(iv) >= 1 && Math.abs(iv) <= 2) wt *= q === ps[i - 2] ? W_BACK : Math.sign(d) === Math.sign(iv) ? W_ON : 1;
        wt *= 1 + Math.sign(d) * (mid - prev) / (hi - lo);
        cand.push(q);
        w.push(wt);
        total2 += wt;
      }
      p = total2 > 0 ? cand[cand.length - 1] : nearestOf(prev, o.strong ? o.ch : o.sc, lo, hi);
      for (let k = 0, r = rng.next() * total2; k < cand.length && total2 > 0; k++) if ((r -= w[k]) < 0) {
        p = cand[k];
        break;
      }
    }
    ps.push(p);
    out.push(note(m.inst, o.at * six, o.dur * six * m.legato, p, m.vel * o.vel, m.decayS ? m.decayS[0] + (m.decayS[1] - m.decayS[0]) * rng.next() : 0));
  }
  return out;
}
function composePart(th, pt, rng, six, n, out) {
  const barN = th.beats * 4, every = pt.every ?? 1, voices = pt.voices ?? 1, human = pt.human ?? 0;
  if (pt.rate) {
    for (let t = -Math.log(1 - rng.next()) / pt.rate; t * SR7 < n; t += -Math.log(1 - rng.next()) / pt.rate) {
      out.push(note(pt.inst, t * SR7, six, 0, pt.vel * (0.4 + 0.6 * rng.next()), 0, Math.floor(rng.next() * NOISE_SPAN)));
    }
    return;
  }
  let center = (pt.low + pt.high) / 2, alt = 0;
  for (let b = 0; b < th.bars; b += every) {
    const r = pt.fill && pt.fillEvery && (b + every) % pt.fillEvery === 0 ? pt.fill : pick2(pt.rhythms, rng);
    for (let k = 0; k < r.length; k += 3) {
      const at = b * barN + r[k], ch = chordPcs(th.chords[Math.floor(at / barN)]), root = lowest(ch[0], pt.low), up = (ch[2] - ch[0] + 12) % 12;
      let ps;
      if (pt.pitch === "none") ps = [0];
      else if (pt.pitch === "root") ps = [root];
      else if (pt.pitch === "alt") ps = [alt++ % 2 === 0 ? root : root + up > pt.high ? root + up - 12 : root + up];
      else if (pt.pitch === "pedal") ps = (pt.pcs ?? []).map((pc) => lowest(pc, pt.low));
      else {
        ps = ch.map((pc) => nearestOf(center, [pc], pt.low, pt.high));
        center = Math.min(pt.high - 4, Math.max(pt.low + 4, ps.reduce((a, x) => a + x, 0) / ps.length));
      }
      const vel = pt.vel * r[k + 2] / 100 * (1 + human * (rng.next() * 2 - 1)), z = Math.floor(rng.next() * NOISE_SPAN);
      for (const p of ps) for (let v = 0; v < voices; v++) out.push(note(pt.inst, at * six, r[k + 1] * six, p + (v - (voices - 1) / 2) * (pt.cents ?? 0) / 100, vel, 0, z));
    }
  }
}
function composeMusic(th, rng) {
  const six = sixteenthOf(th.bpm), n = th.bars * th.beats * 4 * six;
  if (!Number.isInteger(six) || n !== MUSIC_LENGTHS[th.key] || th.chords.length !== th.bars) throw new Error(`\u66F2 '${th.key}' \u306E\u9577\u3055 ${n} \u304C\u8868\u3068\u9055\u3046`);
  const melody = th.melody ? composeMelody(th, th.melody, rng, six) : [], notes = [...melody];
  for (const pt of th.parts) composePart(th, pt, rng, six, n, notes);
  for (const x of notes) if (musicNoteSamples(x) > n) throw new Error(`\u66F2 '${th.key}' \u306E ${x.inst} \u304C\u8F2A\u3088\u308A\u9577\u3044`);
  return { theme: th, notes, melody, n };
}

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/assets/sfx-music-themes.ts
var MISSION = { bpm: 90, beats: 4, bars: 8, tonic: 4, mode: "aeolian", chords: ["Em", "C", "D", "Em", "Em", "C", "Am", "B7"] };
var SWELL_4 = { inst: "swell", pitch: "none", low: 0, high: 0, vel: 1, every: 4, rhythms: [[0, 64, 100]] };
var PAD_BAR = [[0, 16, 100]];
var MUSIC_THEMES = {
  title_a: {
    key: "title_a",
    bpm: 63,
    beats: 4,
    bars: 8,
    tonic: 2,
    mode: "aeolian",
    chords: ["Dm", "Bb", "F", "C", "Dm", "Bb", "Gm", "A"],
    melody: {
      inst: "bell",
      low: 74,
      high: 86,
      vel: 1,
      span: 2,
      legato: 1,
      decayS: [0.9, 1.8],
      rhythms: [
        [0, 8, 100, 12, 4, 70, 16, 16, 90],
        [0, 6, 100, 6, 2, 60, 8, 8, 80, 16, 16, 90],
        [0, 4, 90, 4, 4, 70, 8, 8, 80, 24, 8, 70],
        [0, 12, 100, 12, 4, 60, 16, 8, 90, 24, 4, 60, 28, 4, 70],
        [4, 4, 80, 8, 8, 100, 16, 12, 90, 28, 4, 60]
      ],
      ends: [[0, 8, 100, 8, 8, 80, 16, 16, 90], [0, 4, 90, 4, 4, 70, 8, 8, 80, 16, 16, 100], [0, 12, 100, 12, 4, 70, 16, 16, 90]],
      cadences: [[4, "half"], [8, "end"]],
      motifs: [[5, 1]]
    },
    parts: [
      { inst: "pad", pitch: "chord", low: 62, high: 76, vel: 0.5, voices: 3, cents: 3, rhythms: PAD_BAR },
      SWELL_4
    ]
  },
  title_b: {
    key: "title_b",
    bpm: 105,
    beats: 2,
    bars: 16,
    tonic: 10,
    mode: "major",
    chords: ["Bb", "F", "Bb", "Eb", "Bb", "F", "Gm", "F", "Bb", "Eb", "Bb", "Gm", "Eb", "F", "F", "Bb"],
    melody: {
      inst: "brass",
      low: 65,
      high: 77,
      vel: 1,
      span: 1,
      legato: 0.9,
      rhythms: [[0, 2, 100, 2, 2, 80, 4, 4, 90], [0, 3, 100, 3, 1, 70, 4, 4, 90], [0, 4, 100, 4, 2, 80, 6, 2, 80], [0, 2, 100, 2, 2, 80, 4, 2, 90, 6, 2, 80], [0, 6, 100, 6, 2, 70]],
      ends: [[0, 8, 100], [0, 2, 90, 2, 2, 80, 4, 4, 100], [0, 4, 90, 4, 4, 100]],
      cadences: [[4, "rest"], [8, "half"], [12, "rest"], [16, "end"]],
      motifs: [[5, 1], [9, 1], [13, 5]]
    },
    parts: [
      {
        inst: "snare",
        pitch: "none",
        low: 0,
        high: 0,
        vel: 0.7,
        human: 0.08,
        fillEvery: 4,
        rhythms: [[0, 1, 100, 2, 1, 50, 3, 1, 60, 4, 1, 90, 6, 1, 55, 7, 1, 60], [0, 1, 100, 1, 1, 45, 2, 1, 60, 4, 1, 90, 5, 1, 45, 6, 1, 60], [0, 1, 100, 3, 1, 55, 4, 1, 85, 6, 1, 60, 7, 1, 70]],
        fill: [0, 1, 60, 1, 1, 65, 2, 1, 70, 3, 1, 75, 4, 1, 80, 5, 1, 85, 6, 1, 90, 7, 1, 100]
      },
      { inst: "pluck", pitch: "alt", low: 46, high: 58, vel: 0.8, rhythms: [[0, 2, 100, 4, 2, 85]] },
      { inst: "pluck", pitch: "chord", low: 58, high: 70, vel: 0.35, rhythms: [[2, 1, 80, 6, 1, 80]] }
    ]
  },
  title_c: {
    key: "title_c",
    bpm: 70,
    beats: 4,
    bars: 8,
    tonic: 9,
    mode: "harmonic",
    chords: ["Am", "Dm", "E7", "Am", "F", "Dm", "E7", "Am"],
    radio: true,
    wow: [25e-4, 22],
    melody: {
      inst: "mute",
      low: 64,
      high: 81,
      vel: 1,
      span: 1,
      legato: 0.92,
      rhythms: [[0, 6, 100, 6, 2, 70, 8, 8, 90], [0, 4, 90, 4, 4, 80, 8, 4, 100, 12, 4, 80], [0, 8, 100, 8, 2, 70, 10, 2, 75, 12, 4, 85], [2, 2, 80, 4, 4, 90, 8, 6, 100, 14, 2, 70], [0, 3, 90, 3, 1, 70, 4, 4, 85, 8, 8, 100]],
      ends: [[0, 4, 90, 4, 12, 100], [0, 8, 90, 8, 8, 100], [0, 16, 100]],
      cadences: [[4, "half"], [8, "end"]],
      motifs: [[5, 1]]
    },
    parts: [
      { inst: "pad", pitch: "chord", low: 57, high: 72, vel: 0.4, voices: 3, cents: 3, rhythms: PAD_BAR },
      { inst: "brush", pitch: "none", low: 0, high: 0, vel: 0.6, human: 0.1, rhythms: [[4, 2, 100, 12, 2, 100], [4, 2, 100, 10, 1, 40, 12, 2, 100]] },
      { inst: "pluck", pitch: "alt", low: 45, high: 57, vel: 0.7, rhythms: [[0, 4, 100, 8, 4, 85]] },
      { inst: "crackle", pitch: "none", low: 0, high: 0, vel: 1, rhythms: [], rate: 6 }
    ]
  },
  mission_l0: {
    key: "mission_l0",
    ...MISSION,
    melody: { inst: "bell", low: 71, high: 83, vel: 0.7, span: 2, legato: 1, decayS: [1.2, 1.8], rhythms: [[0, 32, 100]], ends: [[0, 32, 100]], cadences: [[4, "half"], [8, "end"]], motifs: [] },
    parts: [{ inst: "padDark", pitch: "chord", low: 64, high: 79, vel: 0.6, voices: 3, cents: 4, rhythms: PAD_BAR }, { ...SWELL_4, vel: 0.8 }]
  },
  mission_l1: {
    key: "mission_l1",
    ...MISSION,
    melody: null,
    glue: true,
    parts: [
      { inst: "pluck", pitch: "alt", low: 64, high: 76, vel: 0.7, human: 0.08, rhythms: [[0, 2, 100, 2, 2, 70, 4, 2, 90, 6, 2, 70, 8, 2, 95, 10, 2, 70, 12, 2, 90, 14, 2, 75]] },
      { inst: "tom", pitch: "none", low: 0, high: 0, vel: 0.45, human: 0.05, rhythms: [[0, 2, 100, 8, 2, 85]] },
      {
        inst: "shaker",
        pitch: "none",
        low: 0,
        high: 0,
        vel: 0.4,
        human: 0.15,
        rhythms: [[0, 1, 100, 1, 1, 50, 2, 1, 70, 3, 1, 50, 4, 1, 90, 5, 1, 50, 6, 1, 70, 7, 1, 50, 8, 1, 100, 9, 1, 50, 10, 1, 70, 11, 1, 50, 12, 1, 90, 13, 1, 50, 14, 1, 70, 15, 1, 60]]
      }
    ]
  },
  mission_l2: {
    key: "mission_l2",
    ...MISSION,
    bars: 2,
    chords: ["Em", "Em"],
    melody: null,
    glue: true,
    parts: [
      {
        inst: "snare",
        pitch: "none",
        low: 0,
        high: 0,
        vel: 0.75,
        human: 0.1,
        fillEvery: 2,
        rhythms: [[0, 1, 100, 1, 1, 40, 2, 1, 55, 3, 1, 40, 4, 1, 90, 5, 1, 40, 6, 1, 55, 7, 1, 45, 8, 1, 100, 9, 1, 40, 10, 1, 55, 11, 1, 40, 12, 1, 90, 13, 1, 45, 14, 1, 60, 15, 1, 50]],
        fill: [0, 1, 100, 2, 1, 55, 4, 1, 90, 6, 1, 55, 8, 1, 70, 9, 1, 75, 10, 1, 80, 11, 1, 85, 12, 1, 90, 13, 1, 95, 14, 1, 100, 15, 1, 100]
      },
      { inst: "tom", pitch: "none", low: 0, high: 0, vel: 0.5, human: 0.05, rhythms: [[0, 2, 100, 6, 2, 80, 10, 2, 85], [0, 2, 100, 10, 2, 85, 14, 2, 70]] },
      { inst: "rim", pitch: "none", low: 0, high: 0, vel: 0.6, rhythms: [[4, 1, 100, 12, 1, 100]] },
      { inst: "brass", pitch: "pedal", low: 64, high: 76, vel: 0.28, pcs: [4, 11], rhythms: [[0, 2, 100, 6, 2, 85, 12, 2, 95]] }
    ]
  }
};
function musicRng(key) {
  switch (key) {
    case "title_a":
      return new SeededRng(SFX_SEED_MUSIC_A);
    case "title_b":
      return new SeededRng(SFX_SEED_MUSIC_B);
    case "title_c":
      return new SeededRng(SFX_SEED_MUSIC_C);
    case "mission_l0":
      return new SeededRng(SFX_SEED_MUSIC_L0);
    case "mission_l1":
      return new SeededRng(SFX_SEED_MUSIC_L1);
    case "mission_l2":
      return new SeededRng(SFX_SEED_MUSIC_L2);
  }
}

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/assets/sfx-music-render.ts
var SR8 = MUSIC_SAMPLE_RATE;
var TAU5 = Math.PI * 2;
var RADIO = { lowHz: 320, highHz: 3200, q: Math.SQRT1_2, drive: 0.9, warmS: 0.1 };
var GLUE_C1 = 1.5;
var GLUE_C3 = 0.5;
var S_CLEAR = 0;
var S_NOTES = 1;
var S_PRE = 2;
var S_WARM = 3;
var S_FX = 4;
var S_SCAN = 5;
var S_SCALE = 6;
var S_DONE = 7;
var WARM_LEFT = new Float64Array(14).fill(MUSIC_BUILD_WARM.samples);
WARM_LEFT[7 + S_CLEAR] = 0;
function biquad(co, o, hz2, high) {
  const w = TAU5 * hz2 / SR8, c = Math.cos(w), al = Math.sin(w) / (2 * RADIO.q), a0 = 1 + al;
  const b1 = high ? -(1 + c) : 1 - c, b0 = high ? (1 + c) / 2 : (1 - c) / 2;
  co[o] = b0 / a0;
  co[o + 1] = b1 / a0;
  co[o + 2] = b0 / a0;
  co[o + 3] = -2 * c / a0;
  co[o + 4] = (1 - al) / a0;
}
var MusicBuilder = class {
  constructor(tables, work, score) {
    this.tables = tables;
    this.work = work;
    this.score = score;
    this.n = score.n;
    if (work.length < this.n) throw new Error(`\u4F5C\u696D\u7528\u306E\u914D\u5217 ${work.length} \u304C\u66F2 '${score.theme.key}' \u306E ${this.n} \u3088\u308A\u77ED\u3044`);
    this.radio = score.theme.radio === true;
    this.glue = score.theme.glue === true;
    this.wowD = score.theme.wow?.[0] ?? 0;
    this.wowC = score.theme.wow?.[1] ?? 0;
    let u = 3 * this.n * MUSIC_COST.pass;
    for (const x of score.notes) u += MUSIC_COST.note + musicNoteSamples(x) * musicUnitsPerSample(x.inst);
    if (this.radio) u += this.n * MUSIC_COST.pass + (this.warmN + this.n) * MUSIC_COST.fx - this.n * MUSIC_COST.pass;
    this.totalUnits = u;
    biquad(this.co, 0, RADIO.lowHz, true);
    biquad(this.co, 5, RADIO.highHz, false);
    this.noteN = score.notes.length > 0 ? musicNoteSamples(score.notes[0]) : 0;
  }
  tables;
  work;
  score;
  n;
  /** 自分の仕事の単位の合計（表を除く。progress の分母） */
  totalUnits;
  stage = S_CLEAR;
  /** 今の音符の番号と、今の段の次の標本 */
  at = 0;
  sub = 0;
  noteN = 0;
  ownUnits = 0;
  st = new Float64Array(8);
  /** ラジオ: 係数 10（高域・低域）と状態 8（x1 x2 y1 y2 × 2） */
  co = new Float64Array(10);
  fx = new Float64Array(8);
  warmN = Math.round(RADIO.warmS * SR8);
  radio;
  glue;
  wowD;
  wowC;
  pre = 0;
  sum = 0;
  hi = -Infinity;
  lo = Infinity;
  mean = 0;
  scale = 1;
  get done() {
    return this.stage === S_DONE;
  }
  /** 進み（0〜1。自分の仕事の単位の割合＝試聴の場の「作っています 40%」） */
  get progress() {
    return this.done ? 1 : Math.min(0.99, this.ownUnits / this.totalUnits);
  }
  /** 出来た標本（作業用の配列の中。次に作る前に写す） */
  result() {
    if (!this.done) throw new Error(`\u66F2 '${this.score.theme.key}' \u306F\u307E\u3060\u51FA\u6765\u3066\u3044\u306A\u3044`);
    return this.work.subarray(0, this.n);
  }
  /** 1 フレームの仕事: 予算 budget 単位の内で進める（使った単位を返す。表がまだなら先に表）。確保しない */
  stepBuild(budget) {
    let left = budget, cold = MUSIC_BUILD_WARM.perCall;
    if (!this.tables.ready) left -= this.tables.stepTables(left);
    while (this.tables.ready && this.stage !== S_DONE) {
      const notes = this.stage === S_NOTES, setup = notes && this.sub === 0 ? MUSIC_COST.note : 0;
      const unit = notes ? musicUnitsPerSample(this.score.notes[this.at].inst) : this.stage === S_WARM || this.stage === S_FX ? MUSIC_COST.fx : MUSIC_COST.pass;
      const total2 = notes ? this.noteN : this.stage === S_WARM ? this.warmN : this.n;
      const v = this.stepVariant(), w = WARM_LEFT[v] > 0 ? notes ? 1 : MUSIC_BUILD_WARM.passShare : 0;
      const k = Math.min(total2 - this.sub, Math.floor((left - setup) / unit), w > 0 ? Math.floor(cold / w) : Infinity);
      if (k <= 0) break;
      this.stepStage(this.sub, this.sub + k);
      this.sub += k;
      left -= setup + k * unit;
      this.ownUnits += setup + k * unit;
      if (this.sub >= total2) this.stepAdvance();
      if (w > 0) {
        WARM_LEFT[v] = WARM_LEFT[v] - k;
        cold -= k * w;
      }
    }
    return budget - left;
  }
  /** 今の書き方（WARM_LEFT の添字） */
  stepVariant() {
    if (this.stage !== S_NOTES) return 7 + this.stage;
    const d = MUSIC_INSTRUMENTS[this.score.notes[this.at].inst];
    return d.kind === "fm" ? 4 : d.kind === "noise" ? d.bodyGain ? 6 : 5 : (d.wave2 || d.vibHz ? 1 : 0) + (this.wowD > 0 ? 2 : 0);
  }
  /** 今の段の [a, b) の標本 */
  stepStage(a, b) {
    const x = this.work, n = this.n;
    if (this.stage === S_CLEAR) x.fill(0, a, b);
    else if (this.stage === S_NOTES) {
      const nt = this.score.notes[this.at], kind = MUSIC_INSTRUMENTS[nt.inst].kind;
      if (kind === "tone") stepTone(x, n, nt, a, b, this.st, this.tables, this.wowD, this.wowC);
      else if (kind === "fm") stepFm(x, n, nt, a, b, this.st, this.tables);
      else stepNoise(x, n, nt, a, b, this.st, this.tables);
    } else if (this.stage === S_PRE) {
      let p = this.pre;
      for (let i = a; i < b; i++) p = Math.max(p, Math.abs(x[i]));
      this.pre = p;
    } else if (this.stage === S_SCALE && this.glue) {
      const m = this.mean, g = this.scale, c3 = GLUE_C3 / (MUSIC_PEAK * MUSIC_PEAK);
      for (let i = a; i < b; i++) {
        const v = (x[i] - m) * g;
        x[i] = v * (GLUE_C1 - c3 * v * v);
      }
    } else if (this.stage === S_SCALE) {
      const m = this.mean, g = this.scale;
      for (let i = a; i < b; i++) x[i] = (x[i] - m) * g;
    } else this.stepFx(a, b);
  }
  /** ならし（輪の末尾を通して状態だけ作る）・ラジオ（柔らかい歪み → 高域通過 → 低域通過。書いて数える）・数え（和・最大・最小）。状態と係数は手元に写して回す */
  stepFx(a, b) {
    const x = this.work, c = this.co, s = this.fx, warm = this.stage === S_WARM, k = RADIO.drive / (this.pre > 0 ? this.pre : 1), from = warm ? this.n - this.warmN : 0;
    const b0 = c[0], b1 = c[1], b2 = c[2], a1 = c[3], a2 = c[4], d0 = c[5], d1 = c[6], d2 = c[7], e1 = c[8], e2 = c[9];
    let x1 = s[0], x2 = s[1], y1 = s[2], y2 = s[3], z1 = s[4], z2 = s[5], w1 = s[6], w2 = s[7], sum = this.sum, hi = this.hi, lo = this.lo;
    if (this.stage === S_SCAN) {
      for (let i = a; i < b; i++) {
        const v = x[i];
        sum += v;
        if (v > hi) hi = v;
        if (v < lo) lo = v;
      }
    } else {
      for (let i = a; i < b; i++) {
        const u = x[from + i] * k, w = u - u * u * u / 3, h = b0 * w + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2, v = d0 * h + d1 * z1 + d2 * z2 - e1 * w1 - e2 * w2;
        x2 = x1;
        x1 = w;
        y2 = y1;
        y1 = h;
        z2 = z1;
        z1 = h;
        w2 = w1;
        w1 = v;
        if (warm) continue;
        x[i] = v;
        sum += v;
        if (v > hi) hi = v;
        if (v < lo) lo = v;
      }
    }
    s[0] = x1;
    s[1] = x2;
    s[2] = y1;
    s[3] = y2;
    s[4] = z1;
    s[5] = z2;
    s[6] = w1;
    s[7] = w2;
    this.sum = sum;
    this.hi = hi;
    this.lo = lo;
  }
  /** 今の段を終えて次へ */
  stepAdvance() {
    this.sub = 0;
    if (this.stage === S_NOTES && ++this.at < this.score.notes.length) {
      this.noteN = musicNoteSamples(this.score.notes[this.at]);
      return;
    }
    if (this.stage === S_CLEAR) this.stage = S_NOTES;
    else if (this.stage === S_NOTES) this.stage = this.radio ? S_PRE : S_SCAN;
    else if (this.stage === S_PRE || this.stage === S_WARM) this.stage++;
    else if (this.stage === S_FX || this.stage === S_SCAN) {
      this.mean = this.sum / this.n;
      const peak = Math.max(this.hi - this.mean, this.mean - this.lo);
      this.scale = peak > 0 ? MUSIC_PEAK / peak : 1;
      this.stage = S_SCALE;
    } else this.stage = S_DONE;
  }
};
function composeMusicKey(key) {
  return composeMusic(MUSIC_THEMES[key], musicRng(key));
}

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/core/pt-chase.ts
function createChaseTarget() {
  return { x: 0, y: 0, vx: 0, vy: 0, v2: 0, headingDeg: 0, ready: false, v: 0, courseDeg: 0, ux: 0, uy: -1 };
}

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/core/pt-boats.ts
var TARGET = createChaseTarget();

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/core/sfx-music-mood.ts
var TICK_S = 1 / SFX_MUSIC_MOOD.updateHz;
function musicMoodTc(from, to) {
  const m = SFX_MUSIC_MOOD;
  if (to === MUSIC_MOOD_SINK) return m.sinkFadeS * MUSIC_PLAYER.fadeTc;
  if (to > from) return to === MUSIC_MOOD_BATTLE ? m.riseTcBattleS : m.riseTcTenseS;
  return (from === MUSIC_MOOD_BATTLE ? m.fallBattleS : m.fallTenseS) * MUSIC_PLAYER.fadeTc;
}
function musicMoodGain(layer, mood) {
  return mood === MUSIC_MOOD_SINK ? 0 : MUSIC_GAIN[MUSIC_LAYER_KEYS[layer]] * MUSIC_MOOD_WEIGHTS[mood][layer];
}

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/src/systems/sfx-music-duck.ts
var NO_DUCK = 1;
var ANY_BAND = 127;
var UP_TC = SFX_MUSIC_DUCK_SHAPE.upS * MUSIC_PLAYER.fadeTc;
var SfxMusicDuck = class {
  /** node は曲の再生の「下げる音量」（systems/sfx-music-player の duck）。table はゲームでは SFX_MUSIC_DUCK */
  constructor(node, table = SFX_MUSIC_DUCK) {
    this.node = node;
    this.gainOf = Float64Array.from(SFX_KEYS, (k) => table[k] ? 10 ** (table[k].db / 20) : NO_DUCK);
    this.holdOf = Float64Array.from(SFX_KEYS, (k) => table[k]?.holdS ?? 0);
    this.bandOf = Int16Array.from(SFX_KEYS, (k) => table[k]?.maxBand ?? ANY_BAND);
  }
  node;
  /** 鍵ごとの下げ（SFX_KEYS の順。作る時に 1 回）: 音量の倍率（1 は下げない）・hold 秒・届く帯 */
  gainOf;
  holdOf;
  bandOf;
  /** 今の予約の倍率と、戻り始める再生の時計（下げていなければ −Infinity） */
  level = NO_DUCK;
  untilS = -Infinity;
  /** 直しの窓の始まりと、その中で直した回数 */
  windowAtS = -Infinity;
  reworks = 0;
  /** 確かめ用の数: 下げた回数（直しも含む）・直した回数・ノードへ書いた回数 */
  ducks = 0;
  reworked = 0;
  writes = 0;
  /** 単発を鳴らせた（エンジンの fire の後）: keyIndex は SFX_KEYS の添字・band は距離の帯（位置なしは 0）・whenS は鳴り始める再生の時計 */
  play(keyIndex, band, whenS) {
    const g = this.gainOf[keyIndex];
    if (g >= NO_DUCK || band > this.bandOf[keyIndex]) return;
    const sh = SFX_MUSIC_DUCK_SHAPE;
    let level = g;
    let until = whenS + this.holdOf[keyIndex];
    if (whenS < this.untilS) {
      if (level >= this.level && until <= this.untilS) return;
      if (whenS - this.windowAtS >= sh.reworkWindowS) {
        this.windowAtS = whenS;
        this.reworks = 0;
      }
      if (this.reworks >= sh.reworkMax) return;
      this.reworks++;
      this.reworked++;
      if (this.level < level) level = this.level;
      if (this.untilS > until) until = this.untilS;
    }
    const p = this.node.gain;
    p.cancelScheduledValues(whenS);
    p.setTargetAtTime(level, whenS, sh.downTcS);
    p.setTargetAtTime(NO_DUCK, until, UP_TC);
    this.level = level;
    this.untilS = until;
    this.ducks++;
    this.writes += 3;
  }
};

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/scripts/sfx-music-stem.ts
var SR9 = MUSIC_SAMPLE_RATE;
var ParamModel = class {
  evs = [];
  value;
  constructor(v0) {
    this.value = v0;
  }
  setValueAtTime(v, t) {
    this.add({ t, v, tc: 0 });
  }
  setTargetAtTime(v, t, tc) {
    this.add({ t, v, tc });
  }
  linearRampToValueAtTime() {
    throw new Error("\u66F2\u306E\u6A21\u578B\u306F\u76F4\u7DDA\u306E\u4E88\u7D04\u3092\u4F7F\u308F\u306A\u3044");
  }
  cancelScheduledValues(t) {
    this.evs = this.evs.filter((e) => e.t < t);
  }
  /** 標本 [from, to) の値（時刻 = t0 ＋ 標本 / SR） */
  render(from, to, t02) {
    const out = new Float32Array(Math.max(0, to - from));
    let v = this.value, cv = v, j = 0;
    let cur = null;
    const step = (e) => {
      if (cur) v = cur.v + (cv - cur.v) * Math.exp(-(e.t - cur.t) / cur.tc);
      if (e.tc === 0) {
        v = e.v;
        cur = null;
      } else {
        cur = e;
        cv = v;
      }
    };
    const tA = t02 + from / SR9;
    while (j < this.evs.length && this.evs[j].t <= tA) step(this.evs[j++]);
    for (let s = from; s < to; s++) {
      const t = t02 + s / SR9;
      while (j < this.evs.length && this.evs[j].t <= t) step(this.evs[j++]);
      out[s - from] = cur ? cur.v + (cv - cur.v) * Math.exp(-(t - cur.t) / cur.tc) : v;
    }
    return out;
  }
  add(e) {
    let i = this.evs.length;
    while (i > 0 && this.evs[i - 1].t > e.t) i--;
    this.evs.splice(i, 0, e);
  }
};
var layers = /* @__PURE__ */ new Map();
function familyLayers() {
  if (layers.size === 0) {
    const tables = new MusicTables(), work = new Float32Array(MUSIC_WORK_SAMPLES);
    while (!tables.ready) tables.stepTables(MUSIC_BUILD_BUDGET);
    for (const k of MUSIC_LAYER_KEYS) {
      const b = new MusicBuilder(tables, work, composeMusicKey(k));
      while (!b.done) b.stepBuild(MUSIC_BUILD_BUDGET);
      layers.set(k, b.result().slice());
    }
  }
  return MUSIC_LAYER_KEYS.map((k) => layers.get(k));
}
function duckParam(c, table) {
  const p = new ParamModel(1);
  const d = new SfxMusicDuck({ gain: p, connect: () => void 0 }, table);
  const rows = c.log.filter((r) => r[6] >= 0).slice().sort((a, b) => a[0] - b[0]);
  for (const r of rows) d.play(SFX_KEYS.indexOf(r[1]), r[12] === 1 ? 0 : r[10], r[0]);
  return { p, ducks: d.ducks, reworked: d.reworked };
}
function musicStem(c, from, to, o = {}) {
  const xs = familyLayers();
  const when = c.t0 + MUSIC_PLAYER.startLeadS;
  const rows = c.mood && c.mood.length ? c.mood : [[c.t0, 0]];
  const mul2 = o.layerMul ?? [1, 1, 1];
  const gains = xs.map((_, i) => {
    const p = new ParamModel(0);
    p.cancelScheduledValues(c.t0);
    p.setValueAtTime(0, c.t0);
    p.setTargetAtTime(musicMoodGain(i, rows[0][1]) * mul2[i], when, MUSIC_FADE.missionInS * MUSIC_PLAYER.fadeTc);
    for (let r = 1; r < rows.length; r++) {
      p.cancelScheduledValues(rows[r][0]);
      p.setTargetAtTime(musicMoodGain(i, rows[r][1]) * mul2[i], rows[r][0], musicMoodTc(rows[r - 1][1], rows[r][1]));
    }
    return p.render(from, to, c.t0);
  });
  const dk = duckParam(c, o.table);
  const duck = dk.p.render(from, to, c.t0);
  const start = Math.round((when - c.t0) * SR9);
  const x = new Float32Array(Math.max(0, to - from));
  for (let s = Math.max(from, start); s < to; s++) {
    let v = 0;
    for (let i = 0; i < xs.length; i++) v += xs[i][(s - start) % xs[i].length] * gains[i][s - from];
    x[s - from] = v * duck[s - from];
  }
  return { x, ducks: dk.ducks, reworked: dk.reworked };
}

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP1/head-tree/scripts/sfx-mix.ts
var SR10 = SFX_SAMPLE_RATE;
var db = (v) => v > 0 ? `${(20 * Math.log10(v)).toFixed(1)} dB` : "-inf dB";
var hz = (v) => v >= 1e3 ? `${(v / 1e3).toFixed(2)} kHz` : `${v.toFixed(0)} Hz`;
var ms = (samples2) => `${(samples2 / SR10 * 1e3).toFixed(1)} ms`;
function fallsBelow(x, ratio) {
  const win = Math.round(5e-3 * SR10);
  const peak = peakOf(x);
  for (let end = x.length; end > 0; end -= win) {
    let p = 0;
    for (let i = Math.max(0, end - win); i < end; i++) p = Math.max(p, Math.abs(x[i]));
    if (p >= peak * ratio) return Math.min(x.length, end);
  }
  return 0;
}
function shareAbove(x, hz2) {
  const size = 1024;
  let hi = 0, all = 0;
  for (let from = 0; from < x.length; from += size) {
    const mag = spectrum(x, from, Math.min(size, x.length - from), size);
    for (let i = 1; i < mag.length; i++) {
      const p = mag[i] * mag[i];
      all += p;
      if (i * SR10 / size >= hz2) hi += p;
    }
  }
  return all > 0 ? hi / all : 0;
}
function describe(key, x) {
  const d = SFX_TABLE[key];
  const n = x.length;
  let peakAt = 0;
  for (let i = 0; i < n; i++) if (Math.abs(x[i]) > Math.abs(x[peakAt])) peakAt = i;
  const cuts = [0, Math.round(n / 3), Math.round(2 * n / 3), n];
  const slices = [0, 1, 2].map((s) => {
    const a = cuts[s], b = cuts[s + 1];
    return { rms: rmsOf(x, a, b), zcHz: zeroCrossings(x, a, b) * SR10 / (2 * (b - a)), cen: centroidHz(x, a, b, SR10) };
  });
  const to20 = fallsBelow(x, 0.1);
  const bright = (c) => c >= 3e3 ? "\u660E\u308B\u3044" : c >= 1200 ? "\u4E2D\u304F\u3089\u3044" : c >= 400 ? "\u4F4E\u3044" : "\u3068\u3066\u3082\u4F4E\u3044";
  const move = slices[2].cen < slices[0].cen * 0.6 ? "\u6697\u304F\u306A\u3063\u3066\u3044\u304F" : slices[2].cen > slices[0].cen * 1.6 ? "\u660E\u308B\u304F\u306A\u3063\u3066\u3044\u304F" : "\u97F3\u8272\u306F\u307B\u307C\u540C\u3058";
  return [
    `${key.padEnd(13)} ${d.family.padEnd(6)} ${(n / SR10).toFixed(3)} \u79D2 (${n})  \u9802 ${peakOf(x).toFixed(3)}  RMS ${rmsOf(x).toFixed(4)} (${db(rmsOf(x))})  \u76F4\u6D41 ${meanOf(x).toExponential(1)}  \u96F6\u4EA4\u5DEE ${hz(zeroCrossings(x) * SR10 / (2 * n))}  \u7AEF ${Math.abs(x[0]).toExponential(1)}/${Math.abs(x[n - 1]).toExponential(1)}`,
    ...slices.map((s, i) => `    \u533A\u9593 ${i + 1}/3: RMS ${db(s.rms).padStart(9)}  \u96F6\u4EA4\u5DEE ${hz(s.zcHz).padStart(9)}  \u91CD\u5FC3 ${hz(s.cen).padStart(9)}`),
    `    \u5C0F\u3055\u3044\u30B9\u30D4\u30FC\u30AB\u30FC\u306E\u76EE\u5B89: 400 Hz \u3088\u308A\u4E0A\u306E\u30A8\u30CD\u30EB\u30AE\u30FC ${(shareAbove(x, 400) * 100).toFixed(0)}%\u30FB1 kHz \u3088\u308A\u4E0A ${(shareAbove(x, 1e3) * 100).toFixed(0)}%`,
    `    \u8AAD\u307F: \u9802\u306F\u982D\u304B\u3089 ${ms(peakAt)}\uFF08${peakAt < 5e-3 * SR10 ? "\u92ED\u3044\u7ACB\u3061\u4E0A\u304C\u308A" : peakAt < 0.03 * SR10 ? "\u901F\u3044\u7ACB\u3061\u4E0A\u304C\u308A" : "\u3086\u3063\u304F\u308A\u7ACB\u3064"}\uFF09\u30FB\u221220 dB \u3092\u6700\u5F8C\u306B\u4E0B\u56DE\u308B\u306E\u306F ${ms(to20)}\u30FB\u982D\u306F${bright(slices[0].cen)}\uFF08\u91CD\u5FC3 ${hz(slices[0].cen)}\uFF09\u2192 \u7D42\u308F\u308A ${hz(slices[2].cen)}\uFF1D${move}\u30FB\u7D42\u308F\u308A\u306E\u533A\u9593\u306F\u982D\u3088\u308A ${(20 * Math.log10((slices[2].rms + 1e-9) / (slices[0].rms + 1e-9))).toFixed(1)} dB`
  ];
}
var outDir = process.argv[2] ?? "";
var wav = process.env.WAV === "1";
var png = process.env.PNG === "1";
if ((wav || png || process.env.RAW === "1") && !outDir) throw new Error("WAV=1\u30FBPNG=1\u30FBRAW=1 \u306F\u51FA\u529B\u5148\uFF08scratchpad \u306E\u30C7\u30A3\u30EC\u30AF\u30C8\u30EA\uFF09\u304C\u8981\u308B: node sfx-mix.mjs <\u51FA\u529B\u5148>");
var only = process.env.ONLY ? process.env.ONLY.split(",") : null;
var keys = sfxImplementedKeys().filter((k) => !only || only.includes(k));
if (outDir) mkdirSync(outDir, { recursive: true });
function probeReport(file) {
  const WINDOW_S = 10;
  const data = JSON.parse(readFileSync(file, "utf8"));
  const pick3 = process.env.MIXCASES ? process.env.MIXCASES.split(",") : null;
  const pct = (v) => `${(v * 100).toFixed(2)}%`;
  let worstOver = 0, worstOut = 0;
  for (const c of data.cases) {
    if (pick3 && !pick3.includes(c.name)) continue;
    const m = mixdown(c);
    const all = mixStats(m);
    const w = busiestWindow(c, WINDOW_S);
    const to = Math.min(m.mono.length, w.from + WINDOW_S * SR10);
    const busy = mixStats(m, w.from, to);
    const margins = blastMargins(m);
    const g = limiterGain(m);
    const lim = limiterStats(m, g, w.from, to);
    const pops = blastPops(m, g);
    const mid = (a) => a.length ? `${a[a.length >> 1].toFixed(1)} dB` : "-";
    worstOver = Math.max(worstOver, busy.overShare);
    console.log(`${c.name.padEnd(12)} \u9CF4\u3089\u3057\u305F ${String(m.played).padStart(4)}  \u5168\u4F53: \u9802 ${all.peak.toFixed(2)}\uFF08\u5DE6\u53F3 ${all.peakStereo.toFixed(2)}\uFF09\u30FB1.0 \u8D85\u3048 ${pct(all.overShare)}\u30FBRMS ${db(all.rms)}  \u4E00\u756A\u6DF7\u3080 ${WINDOW_S} \u79D2\uFF08${(w.from / SR10).toFixed(0)} \u79D2\u304B\u3089\u30FB${w.count} \u767A\uFF09: \u9802 ${busy.peak.toFixed(2)}\uFF08\u5DE6\u53F3 ${busy.peakStereo.toFixed(2)}\uFF09\u30FB1.0 \u8D85\u3048 ${pct(busy.overShare)}\uFF08\u4E00\u756A\u3072\u3069\u3044 1 \u79D2 ${pct(busy.worstSecOver)}\uFF09\u30FBRMS ${db(busy.rms)}\u30FB\u30EA\u30DF\u30C3\u30BF\uFF08\u6A21\u578B\uFF09\u304C 3 dB \u3088\u308A\u591A\u304F\u4E0B\u3052\u308B ${pct(lim.over3Share)}\u30FB\u6700\u5927 ${lim.maxDb.toFixed(1)} dB`);
    console.log(`${"".padEnd(12)} \u7206\u767A ${margins.length} \u56DE: \u982D 0.3 \u79D2 \u2212 \u307B\u304B\u306E\u97F3 \u4E2D\u592E\u5024 ${mid(margins)}\u30FB\u4E00\u756A\u60AA\u3044 ${margins.length ? `${margins[0].toFixed(1)} dB` : "-"}\u30FB\u57CB\u3082\u308C\u305F\uFF08< 0 dB\uFF09${margins.filter((v) => v < 0).length} \u56DE  \u98DB\u3073\u51FA\u3057\uFF08\u982D 0.3 \u79D2 \u2212 \u76F4\u524D 1 \u79D2\u3002\u30EA\u30DF\u30C3\u30BF\u306E\u5F8C\uFF09\u4E2D\u592E\u5024 ${mid(pops)}\u30FB\u4E00\u756A\u60AA\u3044 ${pops.length ? `${pops[0].toFixed(1)} dB` : "-"}\u30FB< 3 dB ${pops.filter((v) => v < 3).length} \u56DE`);
    if (c.loops && c.loops.length > 0) {
      const lp = loopStem(c, m.mono.length);
      const lpAll = { peak: peakOf(lp.subarray(0, Math.round((c.t1 - c.t0) * SR10))), rms: rmsOf(lp, 0, Math.round((c.t1 - c.t0) * SR10)), busyPeak: peakOf(lp.subarray(w.from, to)), busyRms: rmsOf(lp, w.from, to) };
      console.log(`${"".padEnd(12)} \u30EB\u30FC\u30D7\u306E\u675F\uFF08\u675F\u306E\u97F3\u91CF 1\uFF09: \u5168\u4F53 \u9802 ${lpAll.peak.toFixed(2)}\u30FBRMS ${db(lpAll.rms)}  \u6DF7\u3080 10 \u79D2 \u9802 ${lpAll.busyPeak.toFixed(2)}\u30FBRMS ${db(lpAll.busyRms)}`);
      const routes = [["\u901A\u3059\xD71.0", 1, true], [`\u901A\u3059\xD7${SFX_LOOP_BUS_GAIN}`, SFX_LOOP_BUS_GAIN, true], [`\u5F8C\xD7${SFX_LOOP_BUS_GAIN}`, SFX_LOOP_BUS_GAIN, false]];
      for (const [name, bus, through] of routes) {
        const r = routeStats(m, lp, bus, through, w.from, to);
        const all2 = routeStats(m, lp, bus, through);
        worstOut = Math.max(worstOut, through ? 0 : all2.outPeak);
        console.log(`${"".padEnd(12)}   ${name.padEnd(8)} \u6DF7\u3080 10 \u79D2: \u30EB\u30FC\u30D7\u3060\u3051\u306E\u6642 \u30EA\u30DF\u30C3\u30BF \u2212${r.quietDb.toFixed(1)} dB\u30FB\u51FA\u53E3\u306E\u30EB\u30FC\u30D7 RMS ${db(r.quietLoopRms)}  \u5358\u767A\u306E\u9593\u306B\u30EB\u30FC\u30D7\u304C\u6C88\u3080 \u4E2D\u592E\u5024 ${r.duckDb.toFixed(1)} dB\u30FB95% ${r.duck95Db.toFixed(1)} dB  \u51FA\u53E3\u306E\u9802 ${r.outPeak.toFixed(2)}\uFF08\u5168\u4F53 ${all2.outPeak.toFixed(2)}\uFF09\u30FB1.0 \u8D85\u3048 ${pct(all2.outOver)}  \u98DB\u3073\u51FA\u3057 \u4E2D\u592E\u5024 ${mid(r.pops)}\u30FB\u4E00\u756A\u60AA\u3044 ${r.pops.length ? `${r.pops[0].toFixed(1)} dB` : "-"}\uFF08\u5168\u4F53\u306E\u4E2D\u592E\u5024 ${mid(all2.pops)}\u30FB< 3 dB ${all2.pops.filter((v) => v < 3).length}/${all2.pops.length} \u56DE\uFF09`);
      }
      if (process.env.RAW === "1") writeRaw(c, m, lp, w.from);
      if (wav) {
        const k = SFX_MASTER_GAIN;
        const l = new Float32Array(to - w.from), rr = new Float32Array(to - w.from);
        for (let i = w.from; i < to; i++) {
          l[i - w.from] = (m.left[i] * g[i] * LIMITER_MAKEUP + lp[i] * SFX_LOOP_BUS_GAIN) * k;
          rr[i - w.from] = (m.right[i] * g[i] * LIMITER_MAKEUP + lp[i] * SFX_LOOP_BUS_GAIN) * k;
        }
        writeFileSync(join(outDir, `mix-${c.name}.wav`), wavStereoBytes(l, rr, SR10));
      }
    } else if (wav) writeFileSync(join(outDir, `mix-${c.name}.wav`), wavStereoBytes(m.left.subarray(w.from, to), m.right.subarray(w.from, to), SR10));
  }
  if (worstOut > 0) console.log(`S3 \u306E\u6C7A\u3081\uFF08\u30EB\u30FC\u30D7\u306F\u30EA\u30DF\u30C3\u30BF\u306E\u5F8C\uFF09\u306E\u51FA\u53E3\u306E\u9802\u306E\u6700\u5927 ${worstOut.toFixed(2)}\uFF08\u6A21\u578B\u3002\u81EA\u52D5\u306E\u88DC\u6B63\u306E\u97F3\u91CF \xD7${LIMITER_MAKEUP.toFixed(2)}\u30FBmaster \xD7${SFX_MASTER_GAIN}\u30021 \u672A\u6E80\u304C\u76EE\u6A19\uFF09`);
  console.log(`\u4E00\u756A\u6DF7\u3080 ${WINDOW_S} \u79D2\u306E 1.0 \u8D85\u3048\u306E\u5272\u5408\u306E\u6700\u5927 ${pct(worstOver)}\uFF08\u76EE\u6A19 < 1%\uFF09${wav ? `  \u66F8\u3044\u305F\u5148: ${outDir}/mix-<\u4EF6>.wav\uFF08\u30EB\u30FC\u30D7\u306E\u884C\u306E\u3042\u308B\u8A18\u9332\u306F S3 \u306E\u51FA\u53E3\uFF1D\u30EA\u30DF\u30C3\u30BF\u306E\u6A21\u578B\u306E\u5F8C\uFF0B\u30EB\u30FC\u30D7 \xD7 \u675F\u306E\u97F3\u91CF \xD7 master\u3002\u7121\u3044\u8A18\u9332\u306F\u30EA\u30DF\u30C3\u30BF\u306E\u524D\u30021.0 \u3092\u8D85\u3048\u305F\u6240\u306F WAV \u3067\u306F\u982D\u6253\u3061\uFF09` : ""}`);
}
function quietWindow(c, windowS) {
  const sink2 = (c.mood ?? []).find(([, lv]) => lv === 3);
  const total2 = Math.ceil((sink2 ? sink2[0] : c.t1) - c.t0);
  const per = new Uint32Array(Math.max(1, total2 + 1));
  for (const r of c.log) if (r[6] >= 0 && r[12] !== 1) per[Math.min(total2, Math.floor(r[0] - c.t0))]++;
  let best = Infinity, at = 5;
  for (let s = 5; s + windowS <= total2; s++) {
    let k = 0;
    for (let i = s; i < s + windowS; i++) k += per[i];
    if (k < best) {
      best = k;
      at = s;
    }
  }
  return at * SR10;
}
function stemOptions() {
  const o = {};
  if (process.env.DUCK) {
    const t = { ...SFX_MUSIC_DUCK };
    for (const kv of process.env.DUCK.split(",")) {
      const [k, db2, h, b] = kv.split(":");
      t[k] = { db: Number(db2), holdS: Number(h), ...b !== void 0 ? { maxBand: Number(b) } : {} };
    }
    o.table = t;
  }
  if (process.env.LAYERS) o.layerMul = process.env.LAYERS.split(",").map(Number);
  return o;
}
function writeRaw(c, m, lp, busyFrom) {
  const music = process.env.MUSIC === "1";
  const opts = stemOptions();
  const wins = music ? [["busy", busyFrom], ["quiet", quietWindow(c, 10)]] : [["", busyFrom]];
  for (const [tag, from] of wins) {
    const to = Math.min(m.mono.length, from + 10 * SR10), a = Math.max(0, from - SR10);
    const b64 = (x) => Buffer.from(new Float32Array(x.subarray(a, to)).buffer).toString("base64");
    const rec = { name: c.name, tag, sr: SR10, pre: from - a, startS: from / SR10, blastAt: m.blastAt.filter((v) => v >= from && v < to).map((v) => v - a), left: b64(m.left), right: b64(m.right), loops: b64(lp) };
    if (music) {
      rec.onsets = c.log.filter((r) => r[6] >= 0).map((r) => ({ at: Math.round((r[0] - c.t0) * SR10) - a, key: r[1], fam: SFX_TABLE[r[1]].family, len: Math.round(SFX_TABLE[r[1]].seconds * SR10 / r[4]) })).filter((o) => o.at >= 0 && o.at < to - a);
      const st = musicStem(c, a, to, opts);
      rec.music = Buffer.from(st.x.buffer).toString("base64");
      rec.musicGain = 1;
      rec.ducks = st.ducks;
    }
    writeFileSync(join(outDir, `raw-${c.name}${tag ? `-${tag}` : ""}.json`), JSON.stringify(rec));
  }
}
if (process.env.PROBE) {
  probeReport(process.env.PROBE);
  process.exit(0);
}
var t0 = performance.now();
var sounds = keys.map((k) => ({ key: k, x: renderSfx(k) }));
var synthMs = performance.now() - t0;
var total = 0;
for (const s of sounds) {
  total += s.x.length;
  for (const line of describe(s.key, s.x)) console.log(line);
  if (wav) writeFileSync(join(outDir, `${s.key}.wav`), wavBytes(s.x, SR10));
}
if (png && sounds.length > 0) {
  const rgb = new Uint8Array(STRIP_W * STRIP_H * sounds.length * 3);
  sounds.forEach((s, i) => drawStrip(rgb, i * STRIP_H, s.x));
  writeFileSync(join(outDir, "sfx-strip.png"), pngBytes(rgb, STRIP_W, STRIP_H * sounds.length));
}
var planned = SFX_KEYS.reduce((a, k) => a + Math.round(SFX_TABLE[k].seconds * SR10), 0);
console.log(`\u9375 ${sounds.length}/${SFX_KEYS.length} \u672C\uFF08\u4F5C\u308A\u65B9\u306E\u3042\u308B\u5206\u3002\u4E0A\u304B\u3089 ${keys.join("\u30FB")}\uFF09  \u5408\u6210 ${synthMs.toFixed(1)} ms  \u6A19\u672C ${total}\uFF08${(total / SR10).toFixed(2)} \u79D2\uFF09  \u8868\u306E 25 \u672C\u3076\u3093 ${planned}\uFF08\u4E0A\u9650 ${SFX_MAX_TOTAL_SAMPLES}\uFF09`);
if (wav || png) console.log(`\u66F8\u3044\u305F\u5148: ${outDir}${wav ? " \uFF08<\u9375>.wav\uFF09" : ""}${png ? " \uFF08sfx-strip.png: \u4E0A\u304B\u3089\u9375\u306E\u9806\u3002\u5404\u5E2F\u306F\u4E0A\u304C\u6CE2\u5F62\u30FB\u4E0B\u304C\u58F0\u7D0B 0\u301C11 kHz\uFF09" : ""}`);
