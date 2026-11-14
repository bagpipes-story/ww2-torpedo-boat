// ../../../../../../../../../home/user/ww2-torpedo-boat/src/config/sfx-music-config.ts
var MUSIC_SAMPLE_RATE = 22050;
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
var MUSIC_BUILD_WARM = { samples: 6e5, perCall: 2e4, passShare: 0.25 };

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
var TAIL = 2.5;
var NOISE_N = 1 << 15;
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
      const fixed = nx && nx.src >= 0 && nx.src < i ? copyPitch(nx, ps[nx.src], lo, hi) : null, cand = [], w = [];
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
    room: [0.25, 1],
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
    room: [0.22, 0.9],
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
var ROOM = { combs: [557, 613, 677, 739], allpass: [173, 67], damp: 0.35, apG: 0.5, warmT60: 1.5 };
var NC = ROOM.combs.length;
var NA = ROOM.allpass.length;
var S_CLEAR = 0;
var WARM_LEFT = new Float64Array(12).fill(MUSIC_BUILD_WARM.samples);
WARM_LEFT[6 + S_CLEAR] = 0;
function composeMusicKey(key) {
  return composeMusic(MUSIC_THEMES[key], musicRng(key));
}

// mel.ts
var N = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
for (const k of (process.argv[2] ?? "title_e").split(",")) {
  const sc = composeMusicKey(k), th = sc.theme, six = sixteenthOf(th.bpm), barN = th.beats * 4;
  const rows = [];
  let bar = -1, line = "";
  for (const m of sc.melody) {
    const at = m.start / six, b = Math.floor(at / barN);
    if (b !== bar) {
      if (line) rows.push(line);
      bar = b;
      line = `${String(b + 1).padStart(2)} ${th.chords[b].padEnd(3)}|`;
    }
    const p = Math.round(m.pitch);
    line += ` ${(at % barN).toString().padStart(2)}:${N[p % 12]}${Math.floor(p / 12) - 1}(${Math.round(m.len / six * 10) / 10})`;
  }
  rows.push(line);
  console.log(`== ${k}
${rows.join("\n")}`);
}
