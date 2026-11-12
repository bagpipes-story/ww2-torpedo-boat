// ../../../../../../../../../home/user/ww2-torpedo-boat/src/config/sfx-config.ts
var SFX_SAMPLE_RATE = 22050;
var SFX_PEAK = 0.9;
var SFX_EDGE_FADE_S = 2e-3;
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
function def(seconds, seed, gain, priority, minIntervalS, reachBand, family, rateJitter = 0) {
  return { seconds, seed, gain, priority, minIntervalS, reachBand, family, loop: family === "loop", rateJitter };
}
var FAR = 3;
var MID = 2;
var NEAR = 1;
var SFX_TABLE = {
  mg: def(0.12, SFX_SEED_MG, 0.4, SFX_PRIORITY_GUN, 0.07, MID, "gun", 0.08),
  gun_near: def(0.6, SFX_SEED_GUN_NEAR, 0.7, SFX_PRIORITY_GUN, 0.2, FAR, "gun"),
  gun_far: def(0.9, SFX_SEED_GUN_FAR, 0.8, SFX_PRIORITY_GUN, 0.25, FAR, "gun"),
  splash_s: def(0.35, SFX_SEED_SPLASH_S, 0.3, SFX_PRIORITY_SPLASH, 0.08, NEAR, "splash", 0.12),
  splash_l: def(0.8, SFX_SEED_SPLASH_L, 0.5, SFX_PRIORITY_SPLASH, 0.15, MID, "splash"),
  blast_s: def(0.5, SFX_SEED_BLAST_S, 0.8, SFX_PRIORITY_BLAST, 0.1, FAR, "blast"),
  blast_l: def(1.6, SFX_SEED_BLAST_L, 1, SFX_PRIORITY_BLAST, 0.2, FAR, "blast"),
  torp_hit: def(2.2, SFX_SEED_TORP_HIT, 1, SFX_PRIORITY_BLAST, 0, FAR, "blast"),
  torp_launch: def(0.7, SFX_SEED_TORP_LAUNCH, 0.6, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  hull_hit: def(0.3, SFX_SEED_HULL_HIT, 0.7, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  alarm: def(0.6, SFX_SEED_ALARM, 0.6, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  light_on: def(0.5, SFX_SEED_LIGHT_ON, 0.6, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  flare_pop: def(1.2, SFX_SEED_FLARE_POP, 0.5, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  bomb_fall: def(1.2, SFX_SEED_BOMB_FALL, 0.5, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  reload: def(0.35, SFX_SEED_RELOAD, 0.5, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  smoke: def(1, SFX_SEED_SMOKE, 0.45, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  ui_tap: def(0.06, SFX_SEED_UI_TAP, 0.5, SFX_PRIORITY_CUE, 0, FAR, "ui"),
  bell: def(1.4, SFX_SEED_BELL, 0.6, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  engine_cough: def(0.8, SFX_SEED_ENGINE_COUGH, 0.7, SFX_PRIORITY_CUE, 0, FAR, "cue"),
  sink: def(2.5, SFX_SEED_SINK, 0.6, SFX_PRIORITY_BLAST, 0, FAR, "blast"),
  engine: def(1, SFX_SEED_ENGINE, 1, SFX_PRIORITY_CUE, 0, FAR, "loop"),
  sea: def(4, SFX_SEED_SEA, 1, SFX_PRIORITY_CUE, 0, FAR, "loop"),
  fire: def(2, SFX_SEED_FIRE, 1, SFX_PRIORITY_CUE, 0, FAR, "loop"),
  rain: def(2, SFX_SEED_RAIN, 1, SFX_PRIORITY_CUE, 0, FAR, "loop"),
  drone: def(1.5, SFX_SEED_DRONE, 1, SFX_PRIORITY_CUE, 0, FAR, "loop")
};

// ../../../../../../../../../home/user/ww2-torpedo-boat/src/assets/sfx-dsp.ts
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
function onePoleA(hz) {
  return 1 - Math.exp(-TAU * Math.max(1, hz) / SR);
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
function highPass(x, hz) {
  const low = lowPass(x, hz);
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
    const hz = hzTo === hzFrom ? hzFrom : hzFrom * Math.pow(ratio, Math.min(1, i / glideN));
    ph += TAU * hz / SR;
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
function meanOf(x) {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i];
  return x.length > 0 ? s / x.length : 0;
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

// ../../../../../../../../../home/user/ww2-torpedo-boat/src/core/rng.ts
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

// ../../../../../../../../../home/user/ww2-torpedo-boat/src/assets/sfx-recipes-blasts.ts
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
    const hz = rng.nextRange(c.blipMinHz, c.blipMaxHz);
    const len = Math.min(sfxSamples(c.blipS), n - sfxSamples(tS));
    if (len > 0) {
      mixInto(beat, envelope(sfxSamples(c.beatDecayS * 2), c.beatAttackS, c.beatDecayS), gain, tS);
      mixInto(blips, mul(sine(len, hz, hz * c.blipRise, c.blipS), envelope(len, c.blipAttackS, c.blipDecayS)), gain * c.blipGain, tS);
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

// ../../../../../../../../../home/user/ww2-torpedo-boat/src/assets/sfx-recipes-cues.ts
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
var RELOAD = {
  clickLowHz: 2e3,
  clickHighHz: 6e3,
  clickAttackS: 5e-4,
  clickDecayS: 0.015,
  pingHz: 1800,
  pingRatio: 2.3,
  pingIndex: 2,
  pingIndexDecayS: 0.02,
  pingDecayS: 0.03,
  pingGain: 0.35,
  firstAtS: 0.01,
  secondAtS: 0.19,
  secondGain: 1.3,
  secondPingHz: 1300,
  thudHz: 300,
  thudDecayS: 0.04,
  thudGain: 0.25
};
function reload(n) {
  const c = RELOAD;
  const rng = new SeededRng(SFX_SEED_RELOAD);
  const out = new Float32Array(n);
  const hits = [[c.firstAtS, 1, c.pingHz], [c.secondAtS, c.secondGain, c.secondPingHz]];
  for (const [atS, gain, pingHz] of hits) {
    const len2 = n - sfxSamples(atS);
    mixInto(out, mul(bandPass(whiteNoise(rng, len2), c.clickLowHz, c.clickHighHz), envelope(len2, c.clickAttackS, c.clickDecayS)), gain, atS);
    mixInto(out, mul(fm(len2, pingHz, c.pingRatio, c.pingIndex, c.pingIndexDecayS), envelope(len2, c.clickAttackS, c.pingDecayS)), gain * c.pingGain, atS);
  }
  const len = n - sfxSamples(c.secondAtS);
  mixInto(out, saturate(mul(sine(len, c.thudHz), envelope(len, c.clickAttackS, c.thudDecayS)), 2), c.thudGain, c.secondAtS);
  return out;
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
var CUE_RECIPES = { alarm, ui_tap: uiTap, bell, reload, hull_hit: hullHit, engine_cough: engineCough };

// ../../../../../../../../../home/user/ww2-torpedo-boat/src/assets/sfx-recipes-events.ts
var TAU2 = Math.PI * 2;
var SR2 = SFX_SAMPLE_RATE;
var TORP_LAUNCH = {
  airFromHz: 2500,
  airToHz: 400,
  airWidth: 0.4,
  airGlideS: 0.35,
  airAttackS: 6e-3,
  airDecayS: 0.3,
  airGain: 2.2,
  thunkFromHz: 180,
  thunkToHz: 90,
  thunkGlideS: 0.08,
  thunkAttackS: 2e-3,
  thunkDecayS: 0.06,
  thunkDrive: 2,
  thunkGain: 0.5,
  splashAtS: 0.3,
  splashLowHz: 800,
  splashHighHz: 4e3,
  splashAttackS: 8e-3,
  splashDecayS: 0.12,
  splashGain: 1,
  tailFadeS: 0.1
};
function torpLaunch(n) {
  const c = TORP_LAUNCH;
  const rng = new SeededRng(SFX_SEED_TORP_LAUNCH);
  const lo = 1 - c.airWidth, hi = 1 + c.airWidth;
  const out = mul(bandPass(whiteNoise(rng, n), c.airFromHz * lo, c.airFromHz * hi, c.airToHz * lo, c.airToHz * hi, c.airGlideS), envelope(n, c.airAttackS, c.airDecayS));
  for (let i = 0; i < n; i++) out[i] = out[i] * c.airGain;
  mixInto(out, saturate(mul(sine(n, c.thunkFromHz, c.thunkToHz, c.thunkGlideS), envelope(n, c.thunkAttackS, c.thunkDecayS)), c.thunkDrive), c.thunkGain);
  const sn = n - sfxSamples(c.splashAtS);
  mixInto(out, mul(bandPass(whiteNoise(rng, sn), c.splashLowHz, c.splashHighHz), envelope(sn, c.splashAttackS, c.splashDecayS)), c.splashGain, c.splashAtS);
  return fadeTail(out, c.tailFadeS);
}
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
  const hum = highPass(harmonics(n, Math.round(c.humHz * n / SR2), amps), c.humHighPassHz);
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
  for (let i = 0; i < n; i++) hiss[i] = hiss[i] * (1 - c.sway * (0.5 + 0.5 * Math.sin(TAU2 * c.swayHz * i / SR2)));
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
    const vib = Math.sin(TAU2 * c.vibHz * i / SR2);
    tone[i] = Math.sin(ph) * (1 - c.tremDepth * (0.5 + 0.5 * vib));
    ph += TAU2 * c.fromHz * Math.pow(c.toHz / c.fromHz, Math.min(1, i / glideN)) * (1 + c.vibDepth * vib) / SR2;
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
var EVENT_RECIPES = { torp_launch: torpLaunch, light_on: lightOn, flare_pop: flarePop, bomb_fall: bombFall, smoke };

// ../../../../../../../../../home/user/ww2-torpedo-boat/src/assets/sfx-recipes-guns.ts
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

// ../../../../../../../../../home/user/ww2-torpedo-boat/src/assets/sfx-recipes-loops.ts
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

// ../../../../../../../../../home/user/ww2-torpedo-boat/src/assets/sfx-recipes-splashes.ts
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

// ../../../../../../../../../home/user/ww2-torpedo-boat/src/assets/sfx-bank.ts
var RECIPES = { ...GUN_RECIPES, ...SPLASH_RECIPES, ...BLAST_RECIPES, ...CUE_RECIPES, ...EVENT_RECIPES, ...LOOP_RECIPES };
function renderSfx(key) {
  const recipe = RECIPES[key];
  if (!recipe) throw new Error(`sfx '${key}' \u306E\u4F5C\u308A\u65B9\u306F\u307E\u3060\u7121\u3044\uFF08v0.7.1 \u306E S2\u301CS4 \u3067\u8DB3\u3059\uFF09`);
  const def2 = SFX_TABLE[key];
  const n = sfxSamples(def2.seconds);
  const x = recipe(n);
  if (x.length !== n) throw new Error(`sfx '${key}' \u306E\u9577\u3055 ${x.length} \u304C\u8868\u306E ${n} \u3068\u9055\u3046`);
  removeDc(x);
  if (!def2.loop) fadeEdges(x);
  return normalizePeak(x);
}

// ../../../../../../../../../home/user/ww2-torpedo-boat/scripts/sfx-files.ts
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
var CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
  return c >>> 0;
});
var WAVE_H = 72;
var SPEC_H = 128;
var STRIP_H = WAVE_H + SPEC_H + 6;

// share.ts
var SR3 = 22050;
function shareAbove(x, hz) {
  const size = 1024;
  let hi = 0, all = 0;
  for (let f = 0; f < x.length; f += size) {
    const m = spectrum(x, f, Math.min(size, x.length - f), size);
    for (let i = 1; i < m.length; i++) {
      const p = m[i] * m[i];
      all += p;
      if (i * SR3 / size >= hz) hi += p;
    }
  }
  return hi / all;
}
var cases = [["alarm", 1], ["alarm", 0.7], ["alarm", 1.3], ["bell", 1], ["bell", 0.7], ["bell", 0.5], ["engine_cough", 1], ["engine_cough", 0.7], ["blast_s", 0.6], ["smoke", 1.6], ["reload", 1.3], ["ui_tap", 0.7], ["torp_launch", 1]];
for (const [k, r] of cases) console.log(`${k} rate ${r}: >400 Hz ${(shareAbove(renderSfx(k), 400 / r) * 100).toFixed(0)}%  >2k ${(shareAbove(renderSfx(k), 2e3 / r) * 100).toFixed(1)}%`);
