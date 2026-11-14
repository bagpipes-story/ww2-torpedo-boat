// ../../../../../../../../../home/user/ww2-torpedo-boat/src/config/sfx-music-config.ts
var MUSIC_SAMPLE_RATE = 22050;
var MUSIC_PEAK = 0.9;
var MUSIC_KEYS = ["title_a", "title_d", "title_e", "mission_l0", "mission_l1", "mission_l2"];
var MUSIC_LENGTHS = {
  title_a: 672e3,
  title_d: 672e3,
  title_e: 336e3,
  mission_l0: 470400,
  mission_l1: 470400,
  mission_l2: 117600
};
var SFX_SEED_MUSIC_A = 7603;
var SFX_SEED_MUSIC_D = 7609;
var SFX_SEED_MUSIC_E = 7627;
var SFX_SEED_MUSIC_L0 = 7628;
var SFX_SEED_MUSIC_L1 = 7629;
var SFX_SEED_MUSIC_L2 = 7630;
var SFX_SEED_MUSIC_NOISE = 7699;
var MUSIC_COST = { tone: 1, toneMix: 2, fm: 3, noise: 2, room: 3, pass: 0.5, tablePoint: 1, note: 300 };
var MUSIC_BUILD_WARM = { samples: 6e5, perCall: 2e4, passShare: 0.25 };
var MUSIC_WORK_SAMPLES = 672e3;

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

// ../../../../../../../../../home/user/ww2-torpedo-boat/src/assets/sfx-music-synth.ts
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
var WAVES = ["warm", "dark", "horn"];
var WAVE_AMP = {
  warm: (h) => 1 / h / (1 + (h / 6) ** 2),
  dark: (h) => 1 / h / (1 + (h / 3) ** 2),
  horn: (h, hz) => 1 / h / (1 + (hz / 2e3) ** 2)
};
var harmonicsOf = (o) => Math.max(1, Math.floor(TOP_HZ / (OCT_BASE_HZ * 2 ** (o + 1))));
var refHz = (o) => OCT_BASE_HZ * 2 ** (o + 0.5);
var octaveOf = (hz) => Math.min(OCTS - 1, Math.max(0, Math.floor(Math.log2(hz / OCT_BASE_HZ))));
var MUSIC_INSTRUMENTS = {
  pad: { kind: "tone", gain: 0.5, attackS: 1.5, decayS: 0, releaseS: 0.9, wave: "warm" },
  padDark: { kind: "tone", gain: 0.5, attackS: 2, decayS: 0, releaseS: 1.2, wave: "dark" },
  bell: { kind: "fm", gain: 0.8, attackS: 2e-3, decayS: 1.3, releaseS: 0, ratio: 3.5, index: 2.2, indexDecayS: 0.35 },
  horn: { kind: "tone", gain: 0.7, attackS: 0.035, decayS: 4, releaseS: 0.14, wave: "dark", wave2: "horn", brightS: 0.07, bright: 0.8, vibHz: 5, vibDepth: 3e-3, vibDelayS: 0.2, vibRampS: 0.3 },
  stab: { kind: "tone", gain: 0.8, attackS: 6e-3, decayS: 0.5, releaseS: 0.06, wave: "dark", wave2: "horn", brightS: 0.012, bright: 1 },
  bowed: { kind: "tone", gain: 0.75, attackS: 0.012, decayS: 0.45, releaseS: 0.07, wave: "warm" },
  soft: { kind: "tone", gain: 0.7, attackS: 0.02, decayS: 0.6, releaseS: 0.1, wave: "dark" },
  trem: { kind: "tone", gain: 0.4, attackS: 0.9, decayS: 0, releaseS: 1.2, wave: "dark", tremHz: 7, tremDepth: 0.6 },
  snare: { kind: "noise", gain: 0.8, attackS: 1e-3, decayS: 0.12, releaseS: 0.05, hpHz: 1200, lpHz: 7e3, noiseGain: 1, bodyHz: 200, bodyToHz: 185, bodyDecayS: 0.05, bodyGain: 0.5 },
  boom: { kind: "noise", gain: 0.9, attackS: 2e-3, decayS: 0.08, releaseS: 0.3, hpHz: 250, lpHz: 1200, noiseGain: 0.35, bodyHz: 280, bodyToHz: 230, bodyDecayS: 0.3, bodyGain: 0.8, body2: 1 },
  crash: { kind: "noise", gain: 0.35, attackS: 2e-3, decayS: 1.1, releaseS: 0.4, hpHz: 2500, lpHz: 9e3, noiseGain: 1 },
  swell: { kind: "noise", gain: 0.4, attackS: 0, decayS: 0, releaseS: 1, hpHz: 400, lpHz: 1600, noiseGain: 1, attackFrac: 0.45, decayFrac: 0.5 }
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
function stepHarmonic(w2, s, base, h, a) {
  for (let i = 0; i < TAB; i++) w2[base + i] = w2[base + i] + a * s[h * i & MASK];
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
function stepTone(dst, n, nt, i0, i1, st, tb2) {
  const d = MUSIC_INSTRUMENTS[nt.inst], w2 = tb2.waves, s = tb2.sine, hz = midiHz(nt.pitch);
  const inc = hz * TAB / SR, r1 = tb2.waveRow(d.wave, hz), r2 = d.wave2 ? tb2.waveRow(d.wave2, hz) : -1;
  const an = attackN(d, nt), invA = 1 / an, len = nt.len, g = nt.vel * d.gain, dec = decayOf(d, nt);
  const rD = dec > 0 ? Math.exp(-LN10 / (dec * SR)) : 1, rR = Math.exp(-LN10 / (d.releaseS * SR));
  const bn = Math.max(1, Math.round((d.brightS ?? 0) * SR)), bright = d.bright ?? 0;
  const vibInc = (d.vibHz ?? 0) * TAB / SR * (MOD_BLOCK + 1), vibD = d.vibDepth ?? 0;
  const vib0 = Math.round((d.vibDelayS ?? 0) * SR), vibRamp = Math.max(1, Math.round((d.vibRampS ?? 0) * SR));
  const trD = d.tremDepth ?? 0, trInc = (d.tremHz ?? 0) * TAB / SR * (MOD_BLOCK + 1);
  let ph = st[0], e = st[1], cur = st[2], lfo = st[3], tl = st[4], tg = st[5], dt = st[6];
  if (i0 === 0) {
    ph = 0;
    e = 0;
    cur = inc;
    lfo = 0;
    tl = 0;
    tg = 1 - trD * 0.5;
    dt = 0;
  }
  const split = n - nt.start;
  for (let seg = 0; seg < 2; seg++) {
    const a = seg === 0 ? i0 : Math.max(i0, split), b = seg === 0 ? Math.min(i1, split) : i1, off = seg === 0 ? nt.start : nt.start - n;
    for (let i = a; i < b; i++) {
      if ((i & MOD_BLOCK) === 0 && (vibD > 0 || trD > 0)) {
        if (vibD > 0) {
          const depth = i <= vib0 ? 0 : i >= vib0 + vibRamp ? vibD : vibD * (i - vib0) / vibRamp;
          cur = inc * (1 + depth * s[lfo | 0]);
          if ((lfo += vibInc) >= TAB) lfo -= TAB;
        }
        if (trD > 0) {
          if ((tl += trInc) >= TAB) tl -= TAB;
          dt = (1 - trD * (0.5 + 0.5 * s[tl | 0]) - tg) / (MOD_BLOCK + 1);
        }
      }
      e = i >= len ? e * rR : i < an ? i * invA : i === an ? 1 : e * rD;
      const j = ph | 0, f = ph - j;
      let v = w2[r1 + j] + (w2[r1 + j + 1] - w2[r1 + j]) * f;
      if (r2 >= 0) v += (w2[r2 + j] + (w2[r2 + j + 1] - w2[r2 + j]) * f - v) * (i >= bn ? bright : bright * i / bn);
      dst[i + off] = dst[i + off] + v * e * g * tg;
      tg += dt;
      if ((ph += cur) >= TAB) ph -= TAB;
    }
  }
  st[0] = ph;
  st[1] = e;
  st[2] = cur;
  st[3] = lfo;
  st[4] = tl;
  st[5] = tg;
  st[6] = dt;
}
function stepFm(dst, n, nt, i0, i1, st, tb2) {
  const d = MUSIC_INSTRUMENTS[nt.inst], s = tb2.sine, ic = midiHz(nt.pitch) * TAB / SR, im = ic * (d.ratio ?? 1);
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
function stepNoise(dst, n, nt, i0, i1, st, tb2) {
  const d = MUSIC_INSTRUMENTS[nt.inst], z = tb2.noise, s = tb2.sine, g = nt.vel * d.gain, ng = d.noiseGain ?? 1, bg = d.bodyGain ?? 0, b2 = d.body2 ?? 0;
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
        let u = s[j] + (s[j + 1] - s[j]) * (bp - j);
        if (b2 > 0) {
          const q = bp * 2 >= TAB ? bp * 2 - TAB : bp * 2, k = q | 0;
          u += (s[k] + (s[k + 1] - s[k]) * (q - k)) * b2;
        }
        v += u * be * bg;
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

// ../../../../../../../../../home/user/ww2-torpedo-boat/src/assets/sfx-music-compose.ts
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
      const fixed = nx && nx.src >= 0 && nx.src < i ? copyPitch(nx, ps[nx.src], lo, hi) : null, cand = [], w2 = [];
      let total = 0;
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
        w2.push(wt);
        total += wt;
      }
      p = total > 0 ? cand[cand.length - 1] : nearestOf(prev, o.strong ? o.ch : o.sc, lo, hi);
      for (let k = 0, r = rng.next() * total; k < cand.length && total > 0; k++) if ((r -= w2[k]) < 0) {
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
  const melody = th.melody ? composeMelody(th, th.melody, rng, six) : [], voices = th.melody?.voices ?? 1, cents = th.melody?.cents ?? 0, notes = [];
  for (const m of melody) for (let v = 0; v < voices; v++) notes.push(voices > 1 ? { ...m, pitch: m.pitch + (v - (voices - 1) / 2) * cents / 100 } : m);
  for (const pt of th.parts) composePart(th, pt, rng, six, n, notes);
  for (const x of notes) if (musicNoteSamples(x) > n) throw new Error(`\u66F2 '${th.key}' \u306E ${x.inst} \u304C\u8F2A\u3088\u308A\u9577\u3044`);
  return { theme: th, notes, melody, n };
}

// ../../../../../../../../../home/user/ww2-torpedo-boat/src/assets/sfx-music-themes.ts
var A_CHORDS = ["Dm", "Bb", "F", "C", "Dm", "Bb", "Gm", "A"];
var MISSION = { bpm: 90, beats: 4, bars: 8, tonic: 4, mode: "aeolian", chords: ["Em", "C", "D", "Em", "Em", "C", "Am", "B7"] };
var SWELL_4 = { inst: "swell", pitch: "none", low: 0, high: 0, vel: 1, every: 4, rhythms: [[0, 64, 100]] };
var PAD_BAR = [[0, 16, 100]];
var NONE = { pitch: "none", low: 0, high: 0 };
function roll(from, to, v0, v1) {
  const out = [], k = (to - from) * 2;
  for (let i = 0; i < k; i++) out.push(from + i / 2, 0.5, Math.round(v0 + (v1 - v0) * i / Math.max(1, k - 1)));
  return out;
}
var sixteenths = (vels) => vels.flatMap((v, i) => [i, 1, v]);
var MARCH_4 = [[0, 1, 100, 2, 1, 45, 3, 1, 50, 4, 1, 80, 6, 1, 50, 8, 1, 95, 10, 1, 45, 11, 1, 50, 12, 1, 80, 14, 1, 50], [0, 1, 100, 3, 1, 55, 4, 1, 80, 6, 1, 50, 7, 1, 55, 8, 1, 95, 11, 1, 55, 12, 1, 80, 14, 1, 50, 15, 1, 55]];
var BATTLE_SN = [45, 35, 100, 40, 50, 35, 95, 45, 45, 35, 100, 40, 50, 40, 95, 55];
var MUSIC_THEMES = {
  title_a: {
    key: "title_a",
    bpm: 63,
    beats: 4,
    bars: 8,
    tonic: 2,
    mode: "aeolian",
    chords: A_CHORDS,
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
  title_d: {
    key: "title_d",
    bpm: 126,
    beats: 4,
    bars: 16,
    tonic: 2,
    mode: "aeolian",
    chords: [...A_CHORDS, ...A_CHORDS],
    room: [0.16, 1],
    melody: {
      inst: "horn",
      low: 65,
      high: 79,
      vel: 1,
      span: 1,
      legato: 0.85,
      voices: 2,
      cents: 6,
      rhythms: [[0, 4, 100, 4, 4, 80, 8, 6, 90, 14, 2, 70], [0, 6, 100, 6, 2, 75, 8, 4, 90, 12, 4, 80], [0, 3, 100, 3, 1, 70, 4, 4, 85, 8, 8, 95], [0, 4, 100, 4, 2, 75, 6, 2, 75, 8, 4, 90, 12, 4, 80], [0, 8, 100, 8, 3, 85, 11, 1, 70, 12, 4, 90]],
      ends: [[0, 4, 90, 4, 4, 80, 8, 8, 100], [0, 6, 95, 6, 2, 75, 8, 8, 100], [0, 16, 100]],
      cadences: [[4, "half"], [8, "end"], [12, "half"], [16, "end"]],
      motifs: [[5, 1], [9, 1], [13, 5]]
    },
    parts: [
      { inst: "pad", pitch: "chord", low: 57, high: 71, vel: 0.4, voices: 2, cents: 4, rhythms: PAD_BAR },
      { inst: "bowed", pitch: "root", low: 57, high: 69, vel: 0.55, voices: 2, cents: 7, human: 0.06, rhythms: [[0, 1, 100, 2, 1, 55, 4, 1, 80, 6, 1, 55, 8, 1, 95, 10, 1, 55, 12, 1, 80, 14, 1, 60]] },
      { inst: "snare", ...NONE, vel: 0.4, human: 0.08, fillEvery: 4, rhythms: MARCH_4, fill: [0, 1, 100, 2, 1, 45, 4, 1, 80, 6, 1, 50, ...roll(8, 16, 40, 100)] },
      { inst: "boom", ...NONE, vel: 0.7, human: 0.05, rhythms: [[0, 4, 100, 8, 4, 80]] }
    ]
  },
  title_e: {
    key: "title_e",
    bpm: 126,
    beats: 2,
    bars: 16,
    tonic: 7,
    mode: "harmonic",
    room: [0.15, 0.9],
    chords: ["Gm", "Gm", "Cm", "D", "Gm", "Eb", "Cm", "D", "Gm", "Gm", "Cm", "Cm", "Eb", "Cm", "Gm", "D"],
    melody: {
      inst: "horn",
      low: 67,
      high: 81,
      vel: 1,
      span: 1,
      legato: 0.8,
      voices: 2,
      cents: 6,
      rhythms: [[0, 3, 100, 3, 1, 70, 4, 4, 90], [0, 3, 100, 3, 1, 70, 4, 3, 90, 7, 1, 70], [0, 2, 95, 2, 2, 80, 4, 3, 90, 7, 1, 70], [0, 4, 100, 4, 3, 85, 7, 1, 70], [0, 6, 100, 6, 2, 75]],
      ends: [[0, 8, 100], [0, 3, 90, 3, 1, 70, 4, 4, 100], [0, 4, 90, 4, 4, 100]],
      cadences: [[4, "rest"], [8, "half"], [12, "rest"], [16, "end"]],
      motifs: [[5, 1], [9, 1], [13, 5]]
    },
    parts: [
      { inst: "stab", pitch: "alt", low: 53, high: 65, vel: 0.7, voices: 2, cents: 5, rhythms: [[0, 2, 100, 4, 2, 85]] },
      { inst: "soft", pitch: "chord", low: 62, high: 74, vel: 0.35, voices: 2, cents: 5, rhythms: [[2, 1, 100, 6, 1, 90]] },
      { inst: "snare", ...NONE, vel: 0.5, human: 0.08, fillEvery: 4, rhythms: [[0, 1, 100, 2, 1, 45, 3, 1, 50, 4, 1, 85, 6, 1, 50], [0, 1, 100, 3, 1, 55, 4, 1, 85, 6, 1, 50, 7, 1, 55]], fill: [0, 1, 100, 2, 1, 50, ...roll(4, 8, 45, 100)] },
      { inst: "crash", ...NONE, vel: 0.5, every: 4, rhythms: [[0, 8, 100]] },
      { inst: "boom", ...NONE, vel: 0.55, human: 0.05, rhythms: [[0, 4, 100]] }
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
      { inst: "boom", ...NONE, vel: 0.5, human: 0.04, rhythms: [[0, 1, 100, 1, 1, 55, 8, 1, 95, 9, 1, 50]] },
      { inst: "trem", pitch: "pedal", low: 79, high: 91, vel: 0.5, pcs: [11], every: 4, rhythms: [[0, 64, 100]] },
      { inst: "bowed", pitch: "alt", low: 64, high: 76, vel: 0.4, voices: 2, cents: 5, human: 0.06, rhythms: [[12, 1, 90, 14, 1, 100]] }
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
      { inst: "snare", ...NONE, vel: 1, human: 0.1, fillEvery: 2, rhythms: [sixteenths(BATTLE_SN)], fill: [...sixteenths(BATTLE_SN.slice(0, 8)), ...roll(8, 16, 50, 100)] },
      { inst: "boom", ...NONE, vel: 0.85, human: 0.04, rhythms: [[0, 2, 100, 4, 2, 85, 8, 2, 95, 12, 2, 85]] },
      { inst: "stab", pitch: "pedal", low: 71, high: 83, vel: 0.5, pcs: [4, 11], rhythms: [[0, 1, 100, 3, 1, 85, 6, 1, 90, 8, 1, 95, 11, 1, 85, 14, 1, 90], [0, 1, 100, 3, 1, 85, 6, 2, 90, 10, 1, 85, 12, 1, 95, 14, 1, 90]] },
      { inst: "bowed", pitch: "pedal", low: 64, high: 76, vel: 0.25, pcs: [4], voices: 2, cents: 6, rhythms: [sixteenths([100, 50, 70, 50, 90, 50, 70, 50, 95, 50, 70, 50, 90, 50, 70, 55])] }
    ]
  }
};
function musicRng(key) {
  switch (key) {
    case "title_a":
      return new SeededRng(SFX_SEED_MUSIC_A);
    case "title_d":
      return new SeededRng(SFX_SEED_MUSIC_D);
    case "title_e":
      return new SeededRng(SFX_SEED_MUSIC_E);
    case "mission_l0":
      return new SeededRng(SFX_SEED_MUSIC_L0);
    case "mission_l1":
      return new SeededRng(SFX_SEED_MUSIC_L1);
    case "mission_l2":
      return new SeededRng(SFX_SEED_MUSIC_L2);
  }
}

// ../../../../../../../../../home/user/ww2-torpedo-boat/src/assets/sfx-music-render.ts
var SR3 = MUSIC_SAMPLE_RATE;
var ROOM = { combs: [557, 613, 677, 739], allpass: [173, 67], damp: 0.35, apG: 0.5, warmT60: 1.5 };
var NC = ROOM.combs.length;
var NA = ROOM.allpass.length;
var GLUE_C1 = 1.5;
var GLUE_C3 = 0.5;
var S_CLEAR = 0;
var S_NOTES = 1;
var S_WARM = 2;
var S_FX = 3;
var S_SCAN = 4;
var S_SCALE = 5;
var S_DONE = 6;
var WARM_LEFT = new Float64Array(12).fill(MUSIC_BUILD_WARM.samples);
WARM_LEFT[6 + S_CLEAR] = 0;
var MusicBuilder = class {
  constructor(tables, work, score) {
    this.tables = tables;
    this.work = work;
    this.score = score;
    this.stage = S_CLEAR;
    /** 今の音符の番号と、今の段の次の標本 */
    this.at = 0;
    this.sub = 0;
    this.noteN = 0;
    this.ownUnits = 0;
    this.st = new Float64Array(8);
    this.rOff = new Int32Array(NC + NA);
    this.rLen = new Int32Array(NC + NA);
    this.rPos = new Int32Array(NC + NA);
    this.rFb = new Float64Array(NC);
    this.rLp = new Float64Array(NC);
    this.sum = 0;
    this.hi = -Infinity;
    this.lo = Infinity;
    this.mean = 0;
    this.scale = 1;
    this.n = score.n;
    if (work.length < this.n) throw new Error(`\u4F5C\u696D\u7528\u306E\u914D\u5217 ${work.length} \u304C\u66F2 '${score.theme.key}' \u306E ${this.n} \u3088\u308A\u77ED\u3044`);
    this.glue = score.theme.glue === true;
    const room = score.theme.room;
    let at = 0, e2 = 0;
    for (let k = 0; k < NC + NA; k++) {
      const d = k < NC ? ROOM.combs[k] : ROOM.allpass[k - NC];
      this.rOff[k] = at;
      this.rLen[k] = d;
      at += d;
      if (k < NC && room) {
        this.rFb[k] = 10 ** (-3 * d / (room[1] * SR3));
        e2 += this.rFb[k] ** 2;
      }
    }
    this.rb = new Float64Array(room ? at : 0);
    this.warmN = room ? Math.min(this.n, Math.round(ROOM.warmT60 * room[1] * SR3)) : 0;
    this.wet = room ? room[0] * Math.sqrt((1 - e2 / NC) / NC) : 0;
    let u = 3 * this.n * MUSIC_COST.pass;
    for (const x of score.notes) u += MUSIC_COST.note + musicNoteSamples(x) * musicUnitsPerSample(x.inst);
    if (room) u += (this.warmN + this.n) * MUSIC_COST.room - this.n * MUSIC_COST.pass;
    this.totalUnits = u;
    this.noteN = score.notes.length > 0 ? musicNoteSamples(score.notes[0]) : 0;
  }
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
      const notes = this.stage === S_NOTES, room = this.stage === S_WARM || this.stage === S_FX, setup = notes && this.sub === 0 ? MUSIC_COST.note : 0;
      const unit = notes ? musicUnitsPerSample(this.score.notes[this.at].inst) : room ? MUSIC_COST.room : MUSIC_COST.pass;
      const total = notes ? this.noteN : this.stage === S_WARM ? this.warmN : this.n;
      const v = this.stepVariant(), w2 = WARM_LEFT[v] > 0 ? notes || room ? 1 : MUSIC_BUILD_WARM.passShare : 0;
      const k = Math.min(total - this.sub, Math.floor((left - setup) / unit), w2 > 0 ? Math.floor(cold / w2) : Infinity);
      if (k <= 0) break;
      this.stepStage(this.sub, this.sub + k);
      this.sub += k;
      left -= setup + k * unit;
      this.ownUnits += setup + k * unit;
      if (this.sub >= total) this.stepAdvance();
      if (w2 > 0) {
        WARM_LEFT[v] = WARM_LEFT[v] - k;
        cold -= k * w2;
      }
    }
    return budget - left;
  }
  /** 今の書き方（WARM_LEFT の添字） */
  stepVariant() {
    if (this.stage !== S_NOTES) return 6 + this.stage;
    const d = MUSIC_INSTRUMENTS[this.score.notes[this.at].inst];
    return d.kind === "fm" ? 3 : d.kind === "noise" ? d.bodyGain ? 5 : 4 : d.tremDepth ? 2 : d.wave2 || d.vibHz ? 1 : 0;
  }
  /** 今の段の [a, b) の標本 */
  stepStage(a, b) {
    const x = this.work, n = this.n;
    if (this.stage === S_CLEAR) x.fill(0, a, b);
    else if (this.stage === S_NOTES) {
      const nt = this.score.notes[this.at], kind = MUSIC_INSTRUMENTS[nt.inst].kind;
      if (kind === "tone") stepTone(x, n, nt, a, b, this.st, this.tables);
      else if (kind === "fm") stepFm(x, n, nt, a, b, this.st, this.tables);
      else stepNoise(x, n, nt, a, b, this.st, this.tables);
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
  /**
   * ならし（輪の末尾を響きに通して状態だけ作る）・響き（元 ＋ 割合 × 全域通過（櫛の和）。書いて数える）・数え（和・最大・最小）。
   * 櫛: 出 = 列[位置]・低域 = 出 × (1 − damp) ＋ 低域 × damp・列[位置] = 入 ＋ 低域 × 帰り。全域通過: 出 = 列[位置] − 入・列[位置] = 入 ＋ 列[位置] × 0.5
   */
  stepFx(a, b) {
    const x = this.work, warm = this.stage === S_WARM, from = warm ? this.n - this.warmN : 0, rb = this.rb, off = this.rOff, len = this.rLen, pos = this.rPos, fb = this.rFb, lp = this.rLp;
    const dmp = ROOM.damp, dm1 = 1 - dmp, ag = ROOM.apG, wet = this.wet;
    let sum = this.sum, hi = this.hi, lo = this.lo;
    if (this.stage === S_SCAN) {
      for (let i = a; i < b; i++) {
        const v = x[i];
        sum += v;
        if (v > hi) hi = v;
        if (v < lo) lo = v;
      }
    } else {
      for (let i = a; i < b; i++) {
        const u = x[from + i];
        let y = 0;
        for (let c = 0; c < NC; c++) {
          const p = off[c] + pos[c], o = rb[p];
          lp[c] = o * dm1 + lp[c] * dmp;
          rb[p] = u + lp[c] * fb[c];
          const q = pos[c] + 1;
          pos[c] = q >= len[c] ? 0 : q;
          y += o;
        }
        for (let c = NC; c < NC + NA; c++) {
          const p = off[c] + pos[c], o = rb[p];
          rb[p] = y + o * ag;
          y = o - y;
          const q = pos[c] + 1;
          pos[c] = q >= len[c] ? 0 : q;
        }
        if (warm) continue;
        const v = u + y * wet;
        x[i] = v;
        sum += v;
        if (v > hi) hi = v;
        if (v < lo) lo = v;
      }
    }
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
    else if (this.stage === S_NOTES) this.stage = this.warmN > 0 ? S_WARM : S_SCAN;
    else if (this.stage === S_WARM) this.stage = S_FX;
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
function renderMusic(key, budget = Infinity, tables = new MusicTables(), work = new Float32Array(MUSIC_WORK_SAMPLES)) {
  const b = new MusicBuilder(tables, work, composeMusicKey(key));
  for (let guard = 0; !b.done; guard++) {
    if (b.stepBuild(budget === Infinity ? 1e15 : budget) === 0 && guard > 4) throw new Error(`\u66F2 '${key}' \u304C\u4E88\u7B97 ${budget} \u3067\u9032\u307E\u306A\u3044`);
  }
  return b.result().slice();
}

// fp.ts
function fingerprint16(x) {
  let h = 2166136261;
  for (let i = 0; i < x.length; i++) {
    const v = Math.round(x[i] * 32767) & 65535;
    h = Math.imul(h ^ v & 255, 16777619) >>> 0;
    h = Math.imul(h ^ v >>> 8, 16777619) >>> 0;
  }
  return h;
}
var tb = new MusicTables();
var w = new Float32Array(MUSIC_WORK_SAMPLES);
console.log(MUSIC_KEYS.map((k) => `${k}: ${fingerprint16(renderMusic(k, 15e4, tb, w))}`).join(", "));
