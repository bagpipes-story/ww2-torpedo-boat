// ../head-tree/src/config/sfx-music-config.ts
var MUSIC_SAMPLE_RATE = 22050;
var MUSIC_PEAK = 0.9;
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
var MUSIC_BUILD_BUDGET = 15e4;
var MUSIC_COST = { tone: 1, toneMix: 2, fm: 3, noise: 2, fx: 3, pass: 0.5, tablePoint: 1, note: 300 };
var MUSIC_BUILD_WARM = { samples: 6e5, perCall: 2e4, passShare: 0.25 };
var MUSIC_WORK_SAMPLES = 672e3;

// ../head-tree/src/core/rng.ts
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

// ../head-tree/src/assets/sfx-music-synth.ts
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
var MOD_BLOCK = 31;
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
function midiHz(p) {
  return 440 * 2 ** ((p - 69) / 12);
}
function musicUnitsPerSample(inst) {
  const d = MUSIC_INSTRUMENTS[inst];
  return d.kind === "fm" ? MUSIC_COST.fm : d.kind === "noise" ? MUSIC_COST.noise : d.wave2 ? MUSIC_COST.toneMix : MUSIC_COST.tone;
}
function attackN(d, nt) {
  return Math.max(1, Math.round(d.attackFrac ? nt.len * d.attackFrac : d.attackS * SR));
}
function decayOf(d, nt) {
  return nt.decayS > 0 ? nt.decayS : d.decayFrac ? nt.len * d.decayFrac / SR : d.decayS;
}
function musicNoteSamples(nt) {
  const d = MUSIC_INSTRUMENTS[nt.inst], dec = Math.max(decayOf(d, nt), d.bodyGain ? d.bodyDecayS ?? 0 : 0), ring = dec > 0 ? attackN(d, nt) + Math.ceil(TAIL * dec * SR) : Infinity;
  return d.kind === "fm" ? ring : Math.min(ring, nt.len + Math.ceil(TAIL * d.releaseS * SR));
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
function stepTone(dst, n, nt, i0, i1, st, tb, wowDepth, wowCycles) {
  const d = MUSIC_INSTRUMENTS[nt.inst], w = tb.waves, s = tb.sine, hz = midiHz(nt.pitch);
  const inc = hz * TAB / SR, r1 = tb.waveRow(d.wave, hz), r2 = d.wave2 ? tb.waveRow(d.wave2, hz) : -1;
  const an = attackN(d, nt), invA = 1 / an, len = nt.len, g = nt.vel * d.gain, dec = decayOf(d, nt);
  const rD = dec > 0 ? Math.exp(-LN10 / (dec * SR)) : 1, rR = Math.exp(-LN10 / (d.releaseS * SR));
  const bn = Math.max(1, Math.round((d.brightS ?? 0) * SR)), bright = d.bright ?? 0;
  const vibInc = (d.vibHz ?? 0) * TAB / SR * (MOD_BLOCK + 1), vibD = d.vibDepth ?? 0;
  const vib0 = Math.round((d.vibDelayS ?? 0) * SR), vibRamp = Math.max(1, Math.round((d.vibRampS ?? 0) * SR)), wowK = wowCycles * TAB / n;
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
  const d = MUSIC_INSTRUMENTS[nt.inst], s = tb.sine, ic = midiHz(nt.pitch) * TAB / SR, im = ic * (d.ratio ?? 1);
  const an = attackN(d, nt), invA = 1 / an, g = nt.vel * d.gain, k = TAB / TAU;
  const rA = Math.exp(-LN10 / (decayOf(d, nt) * SR)), rI = Math.exp(-LN10 / ((d.indexDecayS ?? 1) * SR));
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
  const aH = 1 - Math.exp(-TAU * (d.hpHz ?? 20) / SR), aL = 1 - Math.exp(-TAU * (d.lpHz ?? 1e4) / SR);
  const an = attackN(d, nt), invA = 1 / an, len = nt.len, dec = decayOf(d, nt);
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

// ../head-tree/src/assets/sfx-music-compose.ts
var SR2 = MUSIC_SAMPLE_RATE;
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
var sixteenthOf = (bpm) => SR2 * 60 / (bpm * 4);
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
  let q2 = Math.round(p);
  while (!sc.includes(pcOf(q2))) q2++;
  for (let i = 0; i < Math.abs(k); i++) do
    q2 += Math.sign(k);
  while (!sc.includes(pcOf(q2)));
  return q2;
}
function nearestOf(p, pcs, lo, hi) {
  let best = lo, bd = Infinity;
  for (let q2 = lo; q2 <= hi; q2++) if (pcs.includes(pcOf(q2)) && Math.abs(q2 - p) < bd) {
    bd = Math.abs(q2 - p);
    best = q2;
  }
  return best;
}
var clampOct = (p, lo, hi) => p > hi ? clampOct(p - 12, lo, hi) : p < lo ? clampOct(p + 12, lo, hi) : p;
var pick = (list, rng) => list[Math.floor(rng.next() * list.length)];
var lowest = (pc, lo) => lo + (pc - lo % 12 + 12) % 12;
var tonicTriad = (th) => [th.tonic, (th.tonic + (th.mode === "major" ? 4 : 3)) % 12, (th.tonic + 7) % 12];
function note(inst, start, len, pitch, vel, decayS = 0, noise = 0) {
  return { inst, start: Math.round(start), len: Math.max(1, Math.round(len)), pitch, vel, decayS, noise };
}
function cadencePcs(th, o) {
  const half = [(th.tonic + 2) % 12, (th.tonic + 7) % 12].filter((x) => o.ch.includes(x));
  return o.cad === "half" ? half.length > 0 ? half : [(th.tonic + 2) % 12, (th.tonic + 7) % 12] : o.cad === "end" ? [o.ch.includes(th.tonic) ? th.tonic : o.ch[0]] : o.ch;
}
function canStepBack(th, q2, d, nx, fixed, lo, hi) {
  for (const r of fixed !== null ? [fixed] : [q2 - 2, q2 - 1, q2 + 1, q2 + 2]) {
    const ok = Math.abs(r - q2) >= 1 && Math.abs(r - q2) <= 2 && Math.sign(r - q2) === -Math.sign(d) && r >= lo && r <= hi && nx.sc.includes(pcOf(r));
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
    const srcSlot = motif ? (motif[1] - 1) / m.span : -1, shift = srcSlot >= 0 ? pick(SHIFTS, rng) : 0;
    const r = srcSlot >= 0 ? rh[srcSlot] : pick(cad ? m.ends : m.rhythms, rng);
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
      let total = 0;
      for (let q2 = Math.max(lo, prev - MAX_LEAP); q2 <= Math.min(hi, prev + MAX_LEAP); q2++) {
        if (!o.sc.includes(pcOf(q2)) || o.strong && !o.ch.includes(pcOf(q2))) continue;
        const d = q2 - prev, ad = Math.abs(d);
        let wt = ad === 0 ? prev === ps[i - 2] ? 0 : W_SAME : ad <= 2 ? W_STEP : W_LEAP;
        if (Math.abs(iv) >= 3 && !(ad >= 1 && ad <= 2 && Math.sign(d) === -Math.sign(iv))) wt = 0;
        if (ad >= 3 && nx && !canStepBack(th, q2, d, nx, fixed, lo, hi)) wt = 0;
        if (run >= 3 && q2 !== prev && triad.includes(pcOf(q2))) wt = 0;
        if (Math.abs(iv) >= 1 && Math.abs(iv) <= 2) wt *= q2 === ps[i - 2] ? W_BACK : Math.sign(d) === Math.sign(iv) ? W_ON : 1;
        wt *= 1 + Math.sign(d) * (mid - prev) / (hi - lo);
        cand.push(q2);
        w.push(wt);
        total += wt;
      }
      p = total > 0 ? cand[cand.length - 1] : nearestOf(prev, o.strong ? o.ch : o.sc, lo, hi);
      for (let k = 0, r = rng.next() * total; k < cand.length && total > 0; k++) if ((r -= w[k]) < 0) {
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
    for (let t = -Math.log(1 - rng.next()) / pt.rate; t * SR2 < n; t += -Math.log(1 - rng.next()) / pt.rate) {
      out.push(note(pt.inst, t * SR2, six, 0, pt.vel * (0.4 + 0.6 * rng.next()), 0, Math.floor(rng.next() * NOISE_SPAN)));
    }
    return;
  }
  let center = (pt.low + pt.high) / 2, alt = 0;
  for (let b = 0; b < th.bars; b += every) {
    const r = pt.fill && pt.fillEvery && (b + every) % pt.fillEvery === 0 ? pt.fill : pick(pt.rhythms, rng);
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

// ../head-tree/src/assets/sfx-music-themes.ts
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

// ../head-tree/src/assets/sfx-music-render.ts
var SR3 = MUSIC_SAMPLE_RATE;
var TAU2 = Math.PI * 2;
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
function biquad(co, o, hz, high) {
  const w = TAU2 * hz / SR3, c = Math.cos(w), al = Math.sin(w) / (2 * RADIO.q), a0 = 1 + al;
  const b1 = high ? -(1 + c) : 1 - c, b0 = high ? (1 + c) / 2 : (1 - c) / 2;
  co[o] = b0 / a0;
  co[o + 1] = b1 / a0;
  co[o + 2] = b0 / a0;
  co[o + 3] = -2 * c / a0;
  co[o + 4] = (1 - al) / a0;
}
var MusicBuilder = class {
  constructor(tables2, work2, score) {
    this.tables = tables2;
    this.work = work2;
    this.score = score;
    this.n = score.n;
    if (work2.length < this.n) throw new Error(`\u4F5C\u696D\u7528\u306E\u914D\u5217 ${work2.length} \u304C\u66F2 '${score.theme.key}' \u306E ${this.n} \u3088\u308A\u77ED\u3044`);
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
  warmN = Math.round(RADIO.warmS * SR3);
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
      const total = notes ? this.noteN : this.stage === S_WARM ? this.warmN : this.n;
      const v = this.stepVariant(), w = WARM_LEFT[v] > 0 ? notes ? 1 : MUSIC_BUILD_WARM.passShare : 0;
      const k = Math.min(total - this.sub, Math.floor((left - setup) / unit), w > 0 ? Math.floor(cold / w) : Infinity);
      if (k <= 0) break;
      this.stepStage(this.sub, this.sub + k);
      this.sub += k;
      left -= setup + k * unit;
      this.ownUnits += setup + k * unit;
      if (this.sub >= total) this.stepAdvance();
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

// bench-key.ts
var keys = (process.argv[2] ?? "mission_l0").split(",");
var tables = new MusicTables();
var work = new Float32Array(MUSIC_WORK_SAMPLES);
while (!tables.ready) tables.stepTables(MUSIC_BUILD_BUDGET);
var q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
for (const k of keys) {
  const b = new MusicBuilder(tables, work, composeMusicKey(k)), ms = [];
  let u = 0;
  while (!b.done) {
    const t = performance.now();
    u += b.stepBuild(MUSIC_BUILD_BUDGET);
    ms.push(performance.now() - t);
  }
  const s = [...ms].sort((x, y) => x - y);
  console.log(`${k.padEnd(11)} ${ms.length} \u56DE  ${(u / 1e6).toFixed(2)}M \u5358\u4F4D  \u5408\u8A08 ${ms.reduce((x, y) => x + y, 0).toFixed(0)} ms  \u4E2D\u592E\u5024 ${q(s, 0.5).toFixed(2)}  95% ${q(s, 0.95).toFixed(2)}  \u6700\u5927 ${s[s.length - 1].toFixed(2)} ms  ns/\u5358\u4F4D ${(ms.reduce((x, y) => x + y, 0) * 1e6 / u).toFixed(1)}`);
}
