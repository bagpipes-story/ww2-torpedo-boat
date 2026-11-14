// src/config/sfx-music-config.ts
var MUSIC_SAMPLE_RATE = 22050;
var MUSIC_LENGTHS = {
  title_d: 672e3,
  title_d_prev: 672e3,
  mission_l0: 470400,
  mission_l1: 470400,
  mission_l2: 117600
};

// src/assets/sfx-music-theory.ts
var SR = MUSIC_SAMPLE_RATE;
var MODES = { aeolian: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], harmonic: [0, 2, 3, 5, 7, 8, 11], major: [0, 2, 4, 5, 7, 9, 11] };
var QUALITY = { "": [0, 4, 7], m: [0, 3, 7], "7": [0, 4, 7, 10], m7: [0, 3, 7, 10], sus4: [0, 5, 7] };
var NAME_PC = (letter, acc) => "C.D.EF.G.A.B".indexOf(letter) + (acc === "b" ? -1 : acc === "#" ? 1 : 0);
var CHORD_RE = /^([A-G])([b#]?)(m7|m|7|sus4|)(?:\/([A-G])([b#]?))?$/;
var pcOf = (p) => (Math.round(p) % 12 + 12) % 12;
var sixteenthOf = (bpm) => SR * 60 / (bpm * 4);
function parse(sym) {
  const m = CHORD_RE.exec(sym);
  if (!m) throw new Error(`\u548C\u97F3 '${sym}' \u304C\u8AAD\u3081\u306A\u3044`);
  return m;
}
function chordPcs(sym) {
  const m = parse(sym), root = NAME_PC(m[1], m[2]);
  return QUALITY[m[3]].map((iv) => (root + iv + 12) % 12);
}
function chordBass(sym) {
  const m = parse(sym);
  return (NAME_PC(m[4] ?? m[1], m[4] ? m[5] : m[2]) + 12) % 12;
}
function chordSymAt(th2, at) {
  const barN = th2.beats * 4, b = Math.floor(at / barN), parts = th2.chords[b].split(" ");
  return parts[Math.min(parts.length - 1, Math.floor((at - b * barN) * parts.length / barN))];
}
var chordAt = (th2, at) => chordPcs(chordSymAt(th2, at));
function barScale(th2, chord) {
  const sc = MODES[th2.mode].map((iv) => (th2.tonic + iv) % 12);
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
var tonicTriad = (th2) => [th2.tonic, (th2.tonic + (th2.mode === "major" ? 4 : 3)) % 12, (th2.tonic + 7) % 12];
function isAvoid(q, ch) {
  const pc = pcOf(q);
  if (ch.includes(pc) || (ch[1] - ch[0] + 12) % 12 !== 4) return false;
  return ch.some((c) => (pc - c + 12) % 12 === 1) || (pc - ch[0] + 12) % 12 === 6;
}
function note(inst, start, len, pitch, vel, decayS = 0, noise = 0) {
  return { inst, start: Math.round(start), len: Math.max(1, Math.round(len)), pitch, vel, decayS, noise };
}

// src/assets/sfx-music-arrange.ts
var NOISE_SPAN = 1 << 15;
var CONS = { 3: 1, 4: 1, 8: 1, 9: 1, 7: 0.45, 0: 0.2, 5: 0.15 };
var W_CONS = 2;
var W_MOTION = 1.5;
var W_STEP = 1;
var MIN_BELOW = 3;
function segmentsOf(th2) {
  const barN = th2.beats * 4, out = [];
  th2.chords.forEach((c, b) => {
    const parts = c.split(" "), len = barN / parts.length;
    parts.forEach((sym, k) => {
      const last = out[out.length - 1];
      if (last && last.sym === sym && last.at + last.len === b * barN + k * len && k > 0) out[out.length - 1] = { ...last, len: last.len + len };
      else out.push({ at: b * barN + k * len, len, sym });
    });
  });
  return out;
}
var segAt = (segs, at) => segs.find((s) => at >= s.at && at < s.at + s.len) ?? segs[segs.length - 1];
function bassLine(th2, segs, lo, hi) {
  const out = [];
  let prev = nearestOf((lo + hi) / 2, [chordBass(segs[0].sym)], lo, hi);
  segs.forEach((s, k) => {
    const ch = chordPcs(s.sym), sc = barScale(th2, ch), beats = s.len / 4, next = segs[(k + 1) % segs.length];
    const cb = nearestOf(prev, [chordBass(s.sym)], lo, hi), nb = nearestOf(cb, [chordBass(next.sym)], lo, hi);
    const between = (a, b, pcs) => {
      const r = [];
      for (let q = Math.min(a, b) + 1; q < Math.max(a, b); q++) if (pcs.includes(pcOf(q))) r.push(q);
      return r;
    };
    const approach = (x) => between(x, nb, sc).filter((q) => Math.abs(nb - q) <= 2).sort((p, q) => Math.abs(nb - p) - Math.abs(nb - q))[0] ?? x;
    let mid = cb;
    const inner = between(cb, nb, ch);
    if (inner.length > 0) mid = inner.sort((p, q) => Math.abs(p - (cb + nb) / 2) - Math.abs(q - (cb + nb) / 2))[0];
    else if (Math.abs(nb - cb) <= 2) mid = [...between(cb - 6, cb, ch), ...between(cb, cb + 6, ch)].filter((q) => q >= lo && q <= hi).sort((p, q) => Math.abs(p - cb) + Math.abs(p - nb) - Math.abs(q - cb) - Math.abs(q - nb))[0] ?? cb;
    const line = beats >= 4 ? [cb, cb, mid, approach(mid)] : beats >= 2 ? [cb, approach(cb), ...Array(beats - 2).fill(cb)] : [cb];
    out.push(...line);
    prev = line[line.length - 1];
  });
  return out;
}
function composeArrange(th2, a, melody, rng, six, n, out) {
  const barN = th2.beats * 4, segs = segmentsOf(th2), dyn = (at) => a.dyn[Math.min(a.dyn.length - 1, Math.floor(at / barN))];
  const jitter = (h) => 1 + h * (rng.next() * 2 - 1), noise = () => Math.floor(rng.next() * NOISE_SPAN);
  const voices = (inst, at, len, p, vel, v, cents) => {
    for (let k = 0; k < v; k++) out.push(note(inst, at * six, len * six, p + (k - (v - 1) / 2) * cents / 100, vel));
  };
  const bl = bassLine(th2, segs, a.bass.range[0], a.bass.range[1]), bs = a.bass;
  bl.forEach((p, beat) => {
    for (let e = 0; e < 2; e++) {
      const at = beat * 4 + e * 2, acc = bs.accents[at % barN / 2] / 100;
      voices(bs.inst, at, 1, p, bs.vel * acc * dyn(at) * jitter(bs.human), bs.voices, bs.cents);
    }
  });
  let center = (a.pad.range[0] + a.pad.range[1]) / 2;
  for (const s of segs) {
    const ps = chordPcs(s.sym).map((pc) => nearestOf(center, [pc], a.pad.range[0], a.pad.range[1]));
    center = Math.min(a.pad.range[1] - 4, Math.max(a.pad.range[0] + 4, ps.reduce((x, y) => x + y, 0) / ps.length));
    for (const p of ps) out.push(note(a.pad.inst, s.at * six, s.len * six, p, a.pad.vel * dyn(s.at)));
  }
  const mAt = melody.map((x) => x.start / six), mLen = melody.map((x) => x.len / six);
  const sounding = (t) => {
    let p = melody[0].pitch;
    for (let i = 0; i < melody.length && mAt[i] <= t; i++) p = melody[i].pitch;
    return Math.round(p);
  };
  const c = a.counter, cn = [];
  let prevC = NaN, prevM = NaN;
  for (const bar of c.bars) {
    for (let h = 0; h < barN; h += barN / 2) {
      const t02 = (bar - 1) * barN + h, long = melody.some((_, i) => mAt[i] === t02 && mLen[i] >= barN / 2 * 0.75);
      for (const t of long ? [t02, t02 + barN / 4] : [t02]) {
        const len = long ? barN / 4 : barN / 2, mp = sounding(t), ch = chordPcs(segAt(segs, t).sym), bass = bl[Math.floor(t / 4)];
        let best = NaN, bestS = -Infinity;
        for (let q = c.range[0]; q <= c.range[1]; q++) {
          if (!ch.includes(pcOf(q)) || q > mp - MIN_BELOW) continue;
          const iv = (mp - q) % 12, dc = Number.isNaN(prevC) ? 0 : q - prevC, dm = Number.isNaN(prevM) ? 0 : mp - prevM, prevIv = Number.isNaN(prevC) ? -1 : (prevM - prevC) % 12;
          const similar = Math.sign(dc) !== 0 && Math.sign(dc) === Math.sign(dm);
          if (similar && (iv === 0 || iv === 7) && prevIv === iv) continue;
          const motion = Number.isNaN(prevC) ? 0.6 : dc !== 0 && dm !== 0 ? similar ? 0.25 : 1 : dc === 0 && dm === 0 ? 0.5 : 0.6;
          const ad = Math.abs(dc), step = ad === 0 ? 0.7 : ad <= 2 ? 1 : ad <= 4 ? 0.6 : ad <= 5 ? 0.3 : 0.05;
          const sc = W_CONS * (CONS[iv] ?? 0) + W_MOTION * motion + W_STEP * step - (pcOf(q) === pcOf(bass) && Math.abs(q - bass) < 12 ? 0.5 : 0);
          if (sc > bestS) {
            bestS = sc;
            best = q;
          }
        }
        if (Number.isNaN(best)) best = nearestOf(mp - 8, ch, c.range[0], c.range[1]);
        const last = cn[cn.length - 1];
        if (last && last.p === best && last.at + last.len === t) last.len += len;
        else cn.push({ at: t, len, p: best });
        prevC = best;
        prevM = mp;
      }
    }
  }
  for (const x of cn) voices(c.inst, x.at, x.len, x.p, c.vel * dyn(x.at), c.voices, c.cents);
  for (let bar = 0; bar < th2.bars; bar++) {
    const si = a.snare.plan[bar], sr = si < 0 ? pick(a.snare.cells.slice(0, 2), rng) : a.snare.cells[si], bi = a.boom.plan[bar], br = a.boom.cells[Math.max(0, bi)];
    for (const [inst, r, p] of [["snare", sr, a.snare], ["boom", br, a.boom]]) {
      for (let k = 0; k < r.length; k += 3) {
        const at = bar * barN + r[k];
        out.push(note(inst, at * six, r[k + 1] * six, 0, p.vel * r[k + 2] / 100 * dyn(at) * jitter(p.human), 0, noise()));
      }
    }
  }
  for (const bar of a.crash.bars) out.push(note("crash", (bar - 1) * barN * six, barN / 2 * six, 0, a.crash.vel * dyn((bar - 1) * barN), 0, noise()));
  if (out.some((x) => x.start >= n)) throw new Error(`\u66F2 '${th2.key}' \u306E\u4F34\u594F\u304C\u8F2A\u306E\u5916`);
}

// src/assets/sfx-music-plan.ts
var STEP_W = [0.06, 1, 1, 0.35, 0.35, 0.3, 0, 0.3, 0.12, 0.12, 0, 0, 0.03];
var W_ON = 1.6;
var W_OFF = 0.6;
var W_BACK = 0.3;
var MOTIF_LEAPS = 2;
var W_EXTRA_LEAP = 0.05;
var W_DOWN6 = 0.25;
var W_MID = 1.2;
var P_RULE = 1e-4;
var W_AVOID = 0.05;
var W_NEAR = 2;
var W_FAR = 0.5;
var W_INTO = 3;
var W_INTO_SAME = 0.2;
var W_INTO_FAR = 0.3;
var HALF_W = [[7, 0.65], [2, 0.35]];
var CLOSED_W = [[0, 0.6], [3, 0.4]];
var PEAK_MIN = 3;
var PEAK_MAX = 8;
var TOP_ROOM = 4;
var PEAK_BAND = 2;
var B_GAP = 3;
var P_OUT = 100;
var P_SHAPE = 8;
var P_SAME = 8;
var P_LEAP = 6;
var UNSET = -1;
function awkward(a, b) {
  const d = Math.abs(b - a), lo = pcOf(Math.min(a, b)), hi = pcOf(Math.max(a, b));
  return d === 6 || d === 10 || d === 11 || d === 3 && (lo === 10 && hi === 1 || lo === 5 && hi === 8);
}
function nearIn(p, pcs, lo, hi) {
  for (let w = 0; w <= 24; w += 12) {
    let best = UNSET, bd = Infinity;
    for (let q = lo - w; q <= hi + w; q++) if (pcs.includes(pcOf(q)) && Math.abs(q - p) < bd) {
      bd = Math.abs(q - p);
      best = q;
    }
    if (best !== UNSET) return best;
  }
  return p;
}
function refit(q, o, lo, hi) {
  const p = o.sc.includes(pcOf(q)) && q >= lo && q <= hi ? q : nearIn(q, o.sc, lo, hi);
  return o.strong && !o.ch.includes(pcOf(p)) ? nearIn(p, o.ch, lo, hi) : p;
}
function weighted(list, rng) {
  let r = rng.next() * list.reduce((a, x) => a + x[1], 0);
  for (const [v, w] of list) if ((r -= w) < 0) return v;
  return list[list.length - 1][0];
}
var sign = (x) => x > 0 ? 1 : x < 0 ? -1 : 0;
function rhythmsOf(plan, rng, barN) {
  const head = pick(plan.heads, rng), tail = pick(plan.tails, rng), link = pick(plan.links, rng), half = pick(plan.halfs, rng), half2 = pick(plan.halfs, rng);
  const closed = pick(plan.closes, rng), fin = pick(plan.finals, rng), front = [], back = [], h = barN / 2;
  for (let k = 0; k < head.length; k += 3) (head[k] < h ? front : back).push(head[k] < h ? head[k] : head[k] - h, Math.min(head[k + 1], h - head[k] % h), head[k + 2]);
  const fragBack = back.length > front.length, src = fragBack ? back : front, frag = [...src, ...src.map((v, i) => i % 3 === 0 ? v + h : v)];
  return { m1: head, m2: tail, link, half, half2, closed, final: fin, seq: head, seq2: head, frag, top1: head, top2: tail, fragBack };
}
function composePlanMelody(th2, m, plan, rng, six) {
  const barN = th2.beats * 4, lo = m.low, hi = m.high, rh = rhythmsOf(plan, rng, barN), slots = [], firstOf = /* @__PURE__ */ new Map();
  let seenHalf = false;
  plan.roles.forEach((role, bar) => {
    const r = role === "half" && seenHalf ? rh.half2 : rh[role];
    if (role === "half") seenHalf = true;
    if (!firstOf.has(role)) firstOf.set(role, bar);
    for (let k = 0; k < r.length; k += 3) {
      const at = bar * barN + r[k], ch = chordAt(th2, at);
      slots.push({ at, dur: r[k + 1], vel: r[k + 2] / 100, bar, role, strong: r[k] % 8 === 0, ch, sc: barScale(th2, ch) });
    }
  });
  const ps = slots.map(() => UNSET), barSlots = (bar) => slots.flatMap((o, i) => o.bar === bar ? [i] : []);
  const mBars = [firstOf.get("m1"), firstOf.get("m2")], motif = [...barSlots(mBars[0]), ...barSlots(mBars[1])];
  const mcap = hi - TOP_ROOM, deg = pick(plan.starts, rng), s0 = motif[0], tonic = tonicPcs(th2);
  const strongs = motif.filter((i, k) => k > 0 && slots[i].strong).slice(0, 3), peakAt = strongs.length > 0 ? pick(strongs, rng) : motif[motif.length - 1];
  const peaks = [];
  for (let q = mcap - PEAK_BAND; q <= mcap; q++) if (slots[peakAt].ch.includes(pcOf(q))) peaks.push(q);
  const peak = peaks.length > 0 ? pick(peaks, rng) : mcap, startPc = scaleStep(th2.tonic + 60, deg, slots[s0].sc) % 12, starts = [];
  for (let q = peak - PEAK_MAX; q <= peak - PEAK_MIN; q++) if (q >= lo && pcOf(q) === startPc && !awkward(q, peak)) starts.push(q);
  const start = starts.length > 0 ? starts[0] : nearIn(peak - PEAK_MIN - 2, tonicPcs(th2), lo, peak - PEAK_MIN), center = start;
  ps[s0] = start;
  ps[peakAt] = peak;
  const k0 = motif.indexOf(peakAt);
  walk(ps, slots, motif.slice(1, k0), { target: peak, soft: false, cap: peak - 1, leaps: MOTIF_LEAPS }, lo, hi, rng, tonic);
  walk(ps, slots, motif.slice(k0 + 1), { target: start, soft: true, cap: peak - 1, leaps: 1 }, lo, hi, rng, tonic);
  let climax = -Infinity;
  plan.roles.forEach((role, bar) => {
    if (bar === mBars[0] || bar === mBars[1] || !["m1", "m2", "top1", "top2"].includes(role)) return;
    const src = role === "m1" || role === "top1" ? barSlots(mBars[0]) : barSlots(mBars[1]), dst = barSlots(bar), up = role.startsWith("top") ? plan.topShift : 0;
    const qs = up === 0 ? src.map((k) => ps[k]) : moveBar(slots, src.map((k) => ps[k]), dst, src.map(() => up), lo, hi);
    dst.forEach((i, k) => {
      ps[i] = qs[k];
      if (up) climax = Math.max(climax, qs[k]);
    });
  });
  if (!Number.isFinite(climax)) climax = hi + 1;
  const capOf = (bar) => bar < 8 ? peak : bar < 12 ? climax - B_GAP : climax - 1;
  const head = barSlots(mBars[0]), headPs = head.map((i) => ps[i]), half = barN / 2;
  const fragPs = head.filter((i) => slots[i].at % barN < half !== rh.fragBack).map((i) => ps[i]);
  const bBars = plan.roles.flatMap((role, bar) => role === "seq" || role === "seq2" || role === "frag" ? [bar] : []);
  let bestB = [], bestP = Infinity;
  for (const s02 of plan.seqShift) for (const oct of [0, -7]) {
    let p = rng.next(), ref = bBars.length > 0 ? lastSet(ps, barSlots(bBars[0])[0]) : UNSET;
    const bars = bBars.map((bar) => {
      const role = plan.roles[bar], dst = barSlots(bar), src = role === "frag" ? [...fragPs, ...fragPs] : headPs, cap = capOf(bar), up = role === "seq" ? 0 : role === "seq2" ? 1 : 2;
      const qs = moveBar(slots, src, dst, src.map((_, k) => s02 + oct + up + (role === "frag" && k >= fragPs.length ? 1 : 0)), lo, cap);
      p += placePenalty(qs, src, ref, lo, cap);
      ref = qs[qs.length - 1];
      return qs;
    });
    if (p < bestP) {
      bestP = p;
      bestB = bars;
    }
  }
  bBars.forEach((bar, k) => barSlots(bar).forEach((i, j) => {
    ps[i] = bestB[k][j];
  }));
  plan.roles.forEach((role, bar) => {
    if (role !== "half" && role !== "closed" && role !== "final") return;
    const idx = barSlots(bar), ci = idx.reduce((b, i) => slots[i].dur > slots[b].dur ? i : b, idx[0]), o = slots[ci], ref = lastSet(ps, ci);
    const iv = role === "final" ? 0 : weighted(role === "half" ? HALF_W : CLOSED_W, rng), pc = (th2.tonic + iv) % 12;
    const pcs = o.ch.includes(pc) ? [pc] : role === "half" ? [(th2.tonic + 2) % 12, (th2.tonic + 7) % 12].filter((x) => o.ch.includes(x)) : [th2.tonic];
    ps[ci] = nearIn(ref === UNSET ? center : ref, pcs.length > 0 ? pcs : o.ch, lo, capOf(bar));
  });
  for (let i = 0; i < slots.length; i++) {
    if (ps[i] !== UNSET) continue;
    let j = i;
    while (j < slots.length && ps[j] === UNSET) j++;
    const run = [];
    for (let k = i; k < j; k++) run.push(k);
    walk(ps, slots, run, { target: j < slots.length ? ps[j] : ps[0], soft: false, cap: capOf(slots[i].bar), leaps: 1 }, lo, hi, rng, tonic);
    i = j;
  }
  return slots.map((o, i) => noteOf(m, o, ps[i], six));
}
function noteOf(m, o, p, six) {
  return { inst: m.inst, start: Math.round(o.at * six), len: Math.max(1, Math.round(o.dur * six * m.legato)), pitch: p, vel: m.vel * o.vel, decayS: 0, noise: 0 };
}
function placePenalty(qs, src, ref, lo, cap) {
  const into = ref === UNSET ? 0 : qs[0] - ref;
  let p = Math.abs(into) + (Math.abs(into) > 12 || ref !== UNSET && awkward(ref, qs[0]) ? P_OUT : 0);
  qs.forEach((q, k) => {
    const a = k > 0 ? q - qs[k - 1] : into, b = k + 1 < qs.length ? qs[k + 1] - q : 0;
    if (q < lo || q > cap) p += P_OUT;
    if (k > 0 && sign(q - qs[k - 1]) !== sign(src[k] - src[k - 1])) p += P_SHAPE;
    if (k > 0 && q === qs[k - 1] && src[k] !== src[k - 1]) p += P_SAME;
    if (k >= 3 && q === qs[k - 2] && qs[k - 1] === qs[k - 3]) p += P_SAME;
    if (Math.abs(a) >= 3 && k + 1 < qs.length && !(Math.abs(b) >= 1 && Math.abs(b) <= 2 && sign(b) === -sign(a))) p += P_LEAP;
    if (k > 0 && awkward(qs[k - 1], q)) p += P_OUT;
  });
  return p;
}
function moveBar(slots, src, dst, shifts, lo, hi) {
  const out = [];
  dst.forEach((i, k) => {
    const o = slots[i], q = scaleStep(src[k], shifts[k], o.sc), pcs = o.strong ? o.ch : o.sc, prev = out[k - 1], dir = k > 0 ? sign(src[k] - src[k - 1]) : 0;
    const same = prev === void 0 || sign(q - prev) === dir && !awkward(prev, q) && Math.abs(src[k] - src[k - 1]) <= 2 === Math.abs(q - prev) <= 2;
    if (pcs.includes(pcOf(q)) && q >= lo && q <= hi && same) {
      out.push(q);
      return;
    }
    let best = UNSET, bd = Infinity;
    for (let r = Math.max(lo, q - 5); r <= Math.min(hi, q + 5); r++) {
      if (!pcs.includes(pcOf(r))) continue;
      const sd = k > 0 ? Math.abs(src[k] - src[k - 1]) : 0, rd = prev !== void 0 ? Math.abs(r - prev) : 0;
      const d = Math.abs(r - q) + (prev !== void 0 && sign(r - prev) !== dir ? 6 : 0) + (prev !== void 0 && sd <= 2 !== rd <= 2 ? 3 : 0) + (prev !== void 0 && rd > 0 && awkward(prev, r) ? 20 : 0);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    out.push(best === UNSET ? refit(q, o, lo, hi) : best);
  });
  return out;
}
var tonicPcs = (th2) => [th2.tonic, (th2.tonic + 3) % 12, (th2.tonic + 7) % 12];
function lastIndex(ps, idx) {
  for (let k = idx - 1; k >= 0; k--) if (ps[k] !== UNSET) return k;
  return UNSET;
}
function lastSet(ps, idx) {
  const k = lastIndex(ps, idx);
  return k === UNSET ? UNSET : ps[k];
}
function walk(ps, slots, run, w, lo, hi, rng, tonic) {
  const mid = (lo + hi) / 2, j1 = run.length > 0 ? run[run.length - 1] + 1 : 0;
  for (let r = 0; r < run.length; r++) {
    const i = run[r], o = slots[i], pi = lastIndex(ps, i), prev = ps[pi], prev2 = pi > 0 ? lastSet(ps, pi) : UNSET, iv = prev2 === UNSET ? 0 : prev - prev2, left = run.length - 1 - r;
    const nx = r + 1 < run.length ? slots[run[r + 1]] : void 0, cand = [], wt = [];
    let total = 0;
    for (let q = Math.max(lo, prev - 12); q <= Math.min(w.cap, prev + 12); q++) {
      if (!o.sc.includes(pcOf(q)) || o.strong && !o.ch.includes(pcOf(q))) continue;
      const d = q - prev, ad = Math.abs(d);
      let x = STEP_W[ad] ?? 0;
      if (x === 0 || awkward(prev, q) || ad === 0 && prev === prev2) continue;
      if (Math.abs(iv) >= 3 && !(ad >= 1 && ad <= 2 && sign(d) === -sign(iv))) x *= P_RULE;
      if (ad >= 3 && nx && !canStepBack(q, d, nx, lo, w.cap)) x *= P_RULE;
      if (ad >= 3 && w.leaps <= 0) x *= W_EXTRA_LEAP;
      if (Math.abs(iv) >= 1 && Math.abs(iv) <= 2) x *= q === prev2 ? W_BACK : sign(d) === sign(iv) ? W_ON : W_OFF;
      if (d <= -8) x *= W_DOWN6;
      if (pi >= 2 && q === prev2 && ps[pi - 2] === prev) x *= P_RULE;
      const dist = Math.abs(w.target - q), was = Math.abs(w.target - prev);
      if (!w.soft && dist > 2 * left + 7) x *= P_RULE;
      x *= dist < was ? W_NEAR : dist === was ? 1 : W_FAR;
      if (!w.soft && left === 0) x *= dist >= 1 && dist <= 2 ? W_INTO : dist === 0 ? W_INTO_SAME : dist > 4 ? W_INTO_FAR : 1;
      if (!w.soft && left === 0) {
        const into = w.target - q, after = j1 + 1 < ps.length && ps[j1 + 1] !== UNSET ? ps[j1 + 1] - w.target : 0;
        if (awkward(q, w.target)) x *= P_RULE * P_RULE;
        if (ad >= 3 && !(Math.abs(into) >= 1 && Math.abs(into) <= 2 && sign(into) === -sign(d))) x *= P_RULE;
        if (Math.abs(into) >= 3 && (Math.abs(d) >= 3 || after !== 0 && !(Math.abs(after) <= 2 && sign(after) === -sign(into)))) x *= P_RULE;
        if (into === 0 && after === 0 && q === prev) x *= P_RULE;
      }
      if (tonic.includes(pcOf(q)) && q !== prev && triadRun(ps, pi, tonic) >= 3) x *= P_RULE;
      if ((o.dur >= 4 || ad >= 3) && isAvoid(q, o.ch)) x *= W_AVOID;
      x *= Math.max(0.2, 1 + W_MID * sign(d) * (mid - prev) / (hi - lo));
      cand.push(q);
      wt.push(x);
      total += x;
    }
    let p = total > 0 ? cand[cand.length - 1] : nearIn(prev, o.strong ? o.ch : o.sc, lo, w.cap);
    for (let k = 0, x = rng.next() * total; k < cand.length && total > 0; k++) if ((x -= wt[k]) < 0) {
      p = cand[k];
      break;
    }
    if (Math.abs(p - prev) >= 3) w.leaps--;
    ps[i] = p;
  }
}
function triadRun(ps, pi, tonic) {
  let run = 0;
  for (let k = pi; k >= 0 && ps[k] !== UNSET && tonic.includes(pcOf(ps[k])); k--) if (k === pi || ps[k] !== ps[k + 1]) run++;
  return run;
}
function canStepBack(q, d, nx, lo, hi) {
  for (const s of [1, 2]) {
    const r = q - sign(d) * s;
    if (r >= lo && r <= hi && nx.sc.includes(pcOf(r)) && (!nx.strong || nx.ch.includes(pcOf(r)))) return true;
  }
  return false;
}

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
var SR2 = MUSIC_SAMPLE_RATE;
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
  strings: { kind: "tone", gain: 0.6, attackS: 0.09, decayS: 0, releaseS: 0.28, wave: "warm", vibHz: 5.2, vibDepth: 35e-4, vibDelayS: 0.25, vibRampS: 0.4 },
  trem: { kind: "tone", gain: 0.4, attackS: 0.9, decayS: 0, releaseS: 1.2, wave: "dark", tremHz: 7, tremDepth: 0.6 },
  snare: { kind: "noise", gain: 0.8, attackS: 1e-3, decayS: 0.12, releaseS: 0.05, hpHz: 1200, lpHz: 7e3, noiseGain: 1, bodyHz: 200, bodyToHz: 185, bodyDecayS: 0.05, bodyGain: 0.5 },
  boom: { kind: "noise", gain: 0.9, attackS: 2e-3, decayS: 0.08, releaseS: 0.3, hpHz: 250, lpHz: 1200, noiseGain: 0.35, bodyHz: 280, bodyToHz: 230, bodyDecayS: 0.3, bodyGain: 0.8, body2: 1 },
  crash: { kind: "noise", gain: 0.35, attackS: 2e-3, decayS: 1.1, releaseS: 0.4, hpHz: 2500, lpHz: 9e3, noiseGain: 1 },
  swell: { kind: "noise", gain: 0.4, attackS: 0, decayS: 0, releaseS: 1, hpHz: 400, lpHz: 1600, noiseGain: 1, attackFrac: 0.45, decayFrac: 0.5 }
};
function attackN(d, nt) {
  return Math.max(1, Math.round(d.attackFrac ? nt.len * d.attackFrac : d.attackS * SR2));
}
function decayOf(d, nt) {
  return nt.decayS > 0 ? nt.decayS : d.decayFrac ? nt.len * d.decayFrac / SR2 : d.decayS;
}
function musicNoteSamples(nt) {
  const d = MUSIC_INSTRUMENTS[nt.inst], dec = Math.max(decayOf(d, nt), d.bodyGain ? d.bodyDecayS ?? 0 : 0), ring = dec > 0 ? attackN(d, nt) + Math.ceil(TAIL * dec * SR2) : Infinity;
  return d.kind === "fm" ? ring : Math.min(ring, nt.len + Math.ceil(TAIL * d.releaseS * SR2));
}

// src/assets/sfx-music-compose.ts
var W_STEP2 = 0.35;
var W_LEAP = 0.05;
var W_SAME = 0.05;
var MAX_LEAP = 7;
var W_ON2 = 1.6;
var W_BACK2 = 0.4;
var SR3 = MUSIC_SAMPLE_RATE;
var SHIFTS = [-2, -1, 1, 2];
var NOISE_SPAN2 = 1 << 15;
var MELODY_MIN_NOTES = 8;
function cadencePcs(th2, o) {
  const half = [(th2.tonic + 2) % 12, (th2.tonic + 7) % 12].filter((x) => o.ch.includes(x));
  return o.cad === "half" ? half.length > 0 ? half : [(th2.tonic + 2) % 12, (th2.tonic + 7) % 12] : o.cad === "end" ? [o.ch.includes(th2.tonic) ? th2.tonic : o.ch[0]] : o.ch;
}
function canStepBack2(th2, q, d, nx, fixed, lo, hi) {
  for (const r of fixed !== null ? [fixed] : [q - 2, q - 1, q + 1, q + 2]) {
    const ok2 = Math.abs(r - q) >= 1 && Math.abs(r - q) <= 2 && Math.sign(r - q) === -Math.sign(d) && r >= lo && r <= hi && nx.sc.includes(pcOf(r));
    if (ok2 && (!nx.strong || nx.ch.includes(pcOf(r))) && (!nx.cad || cadencePcs(th2, nx).includes(pcOf(r)))) return true;
  }
  return false;
}
function copyPitch(o, src, lo, hi) {
  const p = clampOct(scaleStep(src, o.shift, o.sc), lo, hi);
  return o.strong && !o.ch.includes(pcOf(p)) ? nearestOf(p, o.ch, lo, hi) : p;
}
function composeMelody(th2, m, rng, six) {
  const barN = th2.beats * 4, lo = m.low, hi = m.high, mid = (lo + hi) / 2, triad = tonicTriad(th2);
  const rh = [], first = [], on = [], ps = [], out = [];
  for (let s = 0; s < th2.bars / m.span; s++) {
    const bar1 = s * m.span + 1, motif = m.motifs.find((x) => x[0] === bar1), cad = m.cadences.find((x) => x[0] === bar1 + m.span - 1)?.[1];
    const srcSlot = motif ? (motif[1] - 1) / m.span : -1, shift = srcSlot >= 0 ? pick(SHIFTS, rng) : 0;
    const r = srcSlot >= 0 ? rh[srcSlot] : pick(cad ? m.ends : m.rhythms, rng);
    rh.push(r);
    first.push(on.length);
    for (let k = 0; k < r.length; k += 3) {
      const at = s * barN * m.span + r[k], pos = at % barN, ch = chordAt(th2, at);
      on.push({ at, dur: r[k + 1], vel: r[k + 2] / 100, strong: pos === 0 || th2.beats === 4 && pos === 8, ch, sc: barScale(th2, ch), cad: k + 3 >= r.length ? cad : void 0, src: srcSlot >= 0 ? first[srcSlot] + k / 3 : -1, shift });
    }
  }
  for (let i = 0; i < on.length; i++) {
    const o = on[i], nx = on[i + 1], prev = ps[i - 1] ?? -1, iv = i >= 2 && !on[i - 1].cad ? prev - ps[i - 2] : 0;
    let run = 0;
    for (let j = i - 1; j >= 0 && triad.includes(pcOf(ps[j])) && (j === i - 1 || ps[j] !== ps[j + 1]); j--) run++;
    let p;
    if (o.src >= 0) p = copyPitch(o, ps[o.src], lo, hi);
    else if (o.cad) p = nearestOf(prev < 0 ? mid : prev, cadencePcs(th2, o), lo, hi);
    else if (prev < 0) p = nearestOf(mid + rng.next() * 6 - 3, o.ch, lo, hi);
    else {
      const fixed = nx && nx.src >= 0 && nx.src < i ? copyPitch(nx, ps[nx.src], lo, hi) : null, cand = [], w = [];
      let total = 0;
      for (let q = Math.max(lo, prev - MAX_LEAP); q <= Math.min(hi, prev + MAX_LEAP); q++) {
        if (!o.sc.includes(pcOf(q)) || o.strong && !o.ch.includes(pcOf(q))) continue;
        const d = q - prev, ad = Math.abs(d);
        let wt = ad === 0 ? prev === ps[i - 2] ? 0 : W_SAME : ad <= 2 ? W_STEP2 : W_LEAP;
        if (Math.abs(iv) >= 3 && !(ad >= 1 && ad <= 2 && Math.sign(d) === -Math.sign(iv))) wt = 0;
        if (ad >= 3 && nx && !canStepBack2(th2, q, d, nx, fixed, lo, hi)) wt = 0;
        if (run >= 3 && q !== prev && triad.includes(pcOf(q))) wt = 0;
        if (Math.abs(iv) >= 1 && Math.abs(iv) <= 2) wt *= q === ps[i - 2] ? W_BACK2 : Math.sign(d) === Math.sign(iv) ? W_ON2 : 1;
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
function composePart(th2, pt, rng, six, n, out) {
  const barN = th2.beats * 4, every = pt.every ?? 1, voices = pt.voices ?? 1, human = pt.human ?? 0;
  if (pt.rate) {
    for (let t = -Math.log(1 - rng.next()) / pt.rate; t * SR3 < n; t += -Math.log(1 - rng.next()) / pt.rate) {
      out.push(note(pt.inst, t * SR3, six, 0, pt.vel * (0.4 + 0.6 * rng.next()), 0, Math.floor(rng.next() * NOISE_SPAN2)));
    }
    return;
  }
  let center = (pt.low + pt.high) / 2, alt = 0;
  for (let b = 0; b < th2.bars; b += every) {
    const r = pt.fill && pt.fillEvery && (b + every) % pt.fillEvery === 0 ? pt.fill : pick(pt.rhythms, rng);
    for (let k = 0; k < r.length; k += 3) {
      const at = b * barN + r[k], ch = chordAt(th2, at), root = lowest(ch[0], pt.low), up = (ch[2] - ch[0] + 12) % 12;
      let ps;
      if (pt.pitch === "none") ps = [0];
      else if (pt.pitch === "root") ps = [root];
      else if (pt.pitch === "alt") ps = [alt++ % 2 === 0 ? root : root + up > pt.high ? root + up - 12 : root + up];
      else if (pt.pitch === "pedal") ps = (pt.pcs ?? []).map((pc) => lowest(pc, pt.low));
      else {
        ps = ch.map((pc) => nearestOf(center, [pc], pt.low, pt.high));
        center = Math.min(pt.high - 4, Math.max(pt.low + 4, ps.reduce((a, x) => a + x, 0) / ps.length));
      }
      const vel = pt.vel * r[k + 2] / 100 * (1 + human * (rng.next() * 2 - 1)), z = Math.floor(rng.next() * NOISE_SPAN2);
      for (const p of ps) for (let v = 0; v < voices; v++) out.push(note(pt.inst, at * six, r[k + 1] * six, p + (v - (voices - 1) / 2) * (pt.cents ?? 0) / 100, vel, 0, z));
    }
  }
}
function composeMusic(th2, rng) {
  const six = sixteenthOf(th2.bpm), n = th2.bars * th2.beats * 4 * six;
  if (!Number.isInteger(six) || n !== MUSIC_LENGTHS[th2.key] || th2.chords.length !== th2.bars) throw new Error(`\u66F2 '${th2.key}' \u306E\u9577\u3055 ${n} \u304C\u8868\u3068\u9055\u3046`);
  const m0 = th2.melody, melody = m0 ? m0.plan ? composePlanMelody(th2, m0, m0.plan, rng, six) : composeMelody(th2, m0, rng, six) : [];
  const voices = m0?.voices ?? 1, cents = m0?.cents ?? 0, dyn = th2.arrange?.dyn, barS = th2.beats * 4 * six, notes = [];
  for (const m of melody) {
    const vel = dyn ? m.vel * dyn[Math.floor(m.start / barS)] : m.vel;
    for (let v = 0; v < voices; v++) notes.push(voices > 1 || dyn ? { ...m, vel, pitch: m.pitch + (v - (voices - 1) / 2) * cents / 100 } : m);
  }
  if (th2.arrange) composeArrange(th2, th2.arrange, melody, rng, six, n, notes);
  else for (const pt of th2.parts) composePart(th2, pt, rng, six, n, notes);
  for (const x of notes) if (musicNoteSamples(x) > n) throw new Error(`\u66F2 '${th2.key}' \u306E ${x.inst} \u304C\u8F2A\u3088\u308A\u9577\u3044`);
  return { theme: th2, notes, melody, n };
}
function cadenceNoteIndex(ns, bar, b0) {
  let best = -1;
  for (let k = 0; k < ns.length; k++) if (bar[k] === b0 && (best < 0 || ns[k].len > ns[best].len)) best = k;
  return best;
}
function melodyCheck(sc) {
  const th2 = sc.theme, m = th2.melody, v = [];
  if (!m) return { count: 0, strongChord: 1, stepShare: 1, recovered: 1, low: 0, high: 0, cadences: [], violations: [] };
  const six = sixteenthOf(th2.bpm), barN = th2.beats * 4, ns = sc.melody, p = ns.map((x) => Math.round(x.pitch)), idx = p.map((_, i) => i);
  const at = ns.map((x) => x.start / six), bar = at.map((a) => Math.floor(a / barN)), ch = at.map((a) => chordAt(th2, a));
  const strong = idx.filter((i) => at[i] % barN === 0 || th2.beats === 4 && at[i] % barN === 8);
  if (idx.some((i) => !barScale(th2, ch[i]).includes(pcOf(p[i])))) v.push("mode");
  const strongChord = strong.filter((i) => ch[i].includes(pcOf(p[i]))).length / Math.max(1, strong.length);
  if (strongChord < 0.8) v.push("strong");
  const cadIdx = m.cadences.map(([b]) => m.plan ? cadenceNoteIndex(ns, bar, b - 1) : bar.reduce((last, x, k) => x < b && x >= b - m.span ? k : last, -1));
  const cadences = [];
  m.cadences.forEach(([b, kind], k) => {
    const i = cadIdx[k], pc = pcOf(p[i]), c = ch[i], half = [(th2.tonic + 2) % 12, (th2.tonic + 7) % 12], closed = [th2.tonic, tonicTriad(th2)[1]];
    cadences.push(p[i]);
    const ok2 = kind === "half" ? half.includes(pc) && (c.includes(pc) || !half.some((x) => c.includes(x))) : kind === "end" ? pc === (c.includes(th2.tonic) ? th2.tonic : c[0]) : kind === "closed" ? closed.includes(pc) && c.includes(pc) : c.includes(pc);
    if (!ok2) v.push(`cadence@${b}`);
  });
  const iv = p.slice(1).map((x, i) => x - p[i]), moves = iv.filter((x) => x !== 0);
  const stepShare = moves.filter((x) => Math.abs(x) <= 2).length / Math.max(1, moves.length);
  const leaps = idx.filter((i) => i + 1 < iv.length && Math.abs(iv[i]) >= 3 && !cadIdx.includes(i + 1));
  const recovered = leaps.filter((i) => Math.abs(iv[i + 1]) >= 1 && Math.abs(iv[i + 1]) <= 2 && Math.sign(iv[i + 1]) !== Math.sign(iv[i])).length / Math.max(1, leaps.length);
  const low = Math.min(...p), high = Math.max(...p);
  if (low < m.low || high > m.high) v.push("range");
  if (p.length >= MELODY_MIN_NOTES && (stepShare < 0.6 || stepShare > 0.85 || leaps.length === 0)) v.push("steps");
  if (p.length >= MELODY_MIN_NOTES && recovered < 0.9) v.push("recover");
  if (p.length >= MELODY_MIN_NOTES && high - low < 7) v.push("span");
  for (const [to, from2] of m.motifs) {
    const a = idx.filter((i) => bar[i] >= from2 - 1 && bar[i] < from2 - 1 + m.span), b = idx.filter((i) => bar[i] >= to - 1 && bar[i] < to - 1 + m.span);
    if (a.length !== b.length || a.some((i, k) => at[i] - (from2 - 1) * barN !== at[b[k]] - (to - 1) * barN) || a.every((i, k) => p[i] === p[b[k]])) v.push(`motif@${to}`);
  }
  const triad = tonicTriad(th2);
  for (let i = 0, run = 0; i < p.length; i++) {
    run = !triad.includes(pcOf(p[i])) ? 0 : run > 0 && p[i] !== p[i - 1] ? run + 1 : 1;
    if (run >= 4) {
      v.push("arpeggio");
      break;
    }
  }
  if (idx.some((i) => i + 4 < p.length && p[i] !== p[i + 1] && p[i] === p[i + 2] && p[i] === p[i + 4] && p[i + 1] === p[i + 3])) v.push("trill");
  for (let b = 0; b < th2.bars; b += 4) {
    const h = bar.findIndex((x) => x >= b && x < b + 4), q = h < 0 ? [] : p.slice(h, h + 4).map((x) => (pcOf(x) - th2.tonic + 12) % 12);
    if (q.length < 4) continue;
    if (q[0] === 7 && q[1] === 0 && (q[2] === 3 || q[2] === 4) && q[3] === 7) v.push(`fanfare@${b + 1}`);
    if (p[h] === p[h + 1] && p[h] === p[h + 2] && Math.abs(p[h + 3] - p[h]) >= 5) v.push(`repeatLeap@${b + 1}`);
  }
  const sigs = /* @__PURE__ */ new Map();
  for (let b = 0; b + 4 <= th2.bars; b++) {
    const s = idx.filter((i) => bar[i] >= b && bar[i] < b + 4).map((i) => `${at[i] - b * barN}:${p[i]}:${ns[i].len}`).join(",");
    sigs.set(s, (sigs.get(s) ?? 0) + 1);
  }
  if ([...sigs.values()].some((c) => c >= 3)) v.push("repeat4");
  return { count: p.length, strongChord, stepShare, recovered, low, high, cadences, violations: v };
}

// src/assets/sfx-music-score.ts
var MUSICALITY_WEIGHTS = { motif: 0.2, arch: 0.15, steps: 0.15, rhythm: 0.1, cadence: 0.15, range: 0.05, repeat: 0.1, seam: 0.05, harmony: 0.05 };
var MUSICALITY_RULES = { minReturns: 3, climaxFrom: 0.75, climaxTo: 0.9, minSpan: 13, maxSpan: 21, maxLeap: 12, maxRun: 2, shapeShare: 0.75, stepTarget: 0.72, stepWidth: 0.13 };
var clamp01 = (x) => Math.max(0, Math.min(1, x));
var sign2 = (x) => x > 0 ? 1 : x < 0 ? -1 : 0;
function shapeMatch(a, b, invert) {
  if (a.length !== b.length || a.length < 2) return 0;
  let same = 0;
  for (let k = 1; k < a.length; k++) if (sign2(a[k] - a[k - 1]) === (invert ? -1 : 1) * sign2(b[k] - b[k - 1])) same++;
  return same / (a.length - 1);
}
function musicality(sc) {
  const th2 = sc.theme, m = th2.melody, six = sixteenthOf(th2.bpm), barN = th2.beats * 4, barS = barN * six, ns = sc.melody, R = MUSICALITY_RULES, v = [];
  if (!m || ns.length < 2) throw new Error(`\u66F2 '${th2.key}' \u306B\u65CB\u5F8B\u304C\u7121\u3044`);
  v.push(...melodyCheck(sc).violations);
  const p = ns.map((x) => Math.round(x.pitch)), bar = ns.map((x) => Math.floor(x.start / barS)), n = p.length;
  const inBar = (b) => p.flatMap((_, i) => bar[i] === b ? [i] : []);
  const sigOf = (idx, from2) => idx.map((i) => `${ns[i].start - from2}:${ns[i].len}`).join(",");
  const m1 = inBar(0), m2 = inBar(1), sig1 = sigOf(m1, 0), sig2 = sigOf(m2, barS), half = barS / 2;
  const halves = [m1.filter((i) => ns[i].start < half), m1.filter((i) => ns[i].start >= half)];
  let returns = 0, fromMotif = 2;
  for (let b = 2; b < th2.bars; b++) {
    const idx = inBar(b), sig = sigOf(idx, b * barS), ps = idx.map((i) => p[i]);
    const like = (src) => Math.max(shapeMatch(ps, src.map((i) => p[i]), false), shapeMatch(ps, src.map((i) => p[i]), true)) >= R.shapeShare;
    let hit = sig === sig1 && like(m1) || sig === sig2 && like(m2);
    let rhythmHit = sig === sig1 || sig === sig2;
    for (const h of halves) {
      if (h.length < 2 || idx.length !== 2 * h.length) continue;
      const a = idx.slice(0, h.length), c = idx.slice(h.length), hs = sigOf(h, h === halves[0] ? 0 : half);
      if (sigOf(a, b * barS) === hs && sigOf(c, b * barS + half) === hs) {
        rhythmHit = true;
        const hp = h.map((i) => p[i]);
        if (Math.max(shapeMatch(a.map((i) => p[i]), hp, false), shapeMatch(a.map((i) => p[i]), hp, true)) >= R.shapeShare && Math.max(shapeMatch(c.map((i) => p[i]), hp, false), shapeMatch(c.map((i) => p[i]), hp, true)) >= R.shapeShare) hit = true;
      }
    }
    if (hit) returns++;
    if (rhythmHit) fromMotif++;
  }
  if (returns < R.minReturns) v.push("returns");
  const top = Math.max(...p), low = Math.min(...p), ci = p.indexOf(top), climaxCount = p.filter((x) => x === top).length, climaxAt = ns[ci].start / sc.n;
  if (climaxCount !== 1) v.push("climaxOnce");
  if (climaxAt < R.climaxFrom || climaxAt > R.climaxTo) v.push("climaxAt");
  const mean = (b0, b1) => {
    const s = p.filter((_, i) => bar[i] >= b0 && bar[i] < b1);
    return s.reduce((a, x) => a + x, 0) / Math.max(1, s.length);
  };
  const after = p.slice(ci + 1), rise = mean(8, 12) > mean(0, 8) - 1 || mean(10, 11) > mean(8, 9) + 1 ? 1 : 0.4, intoTop = ci >= 2 && p[ci - 1] < top && p[ci - 2] <= p[ci - 1] + 2 ? 1 : ci >= 1 && p[ci - 1] < top ? 0.6 : 0;
  const fall = after.length > 0 && after.reduce((a, x) => a + x, 0) / after.length <= top - 4 ? 1 : 0.4;
  const iv = p.slice(1).map((x, i) => x - p[i]), moves = iv.filter((x) => x !== 0), leapIv = moves.filter((x) => Math.abs(x) >= 3);
  const stepShare = moves.filter((x) => Math.abs(x) <= 2).length / Math.max(1, moves.length), expressive = leapIv.filter((x) => Math.abs(x) >= 5 && Math.abs(x) <= 9).length;
  if (leapIv.some((x) => Math.abs(x) > R.maxLeap)) v.push("bigLeap");
  let maxRun = 1, run = 1;
  for (let i = 1; i < n; i++) {
    run = p[i] === p[i - 1] ? run + 1 : 1;
    maxRun = Math.max(maxRun, run);
  }
  if (maxRun > R.maxRun) v.push("repeatRun");
  const span = top - low;
  if (span < R.minSpan || span > R.maxSpan) v.push("span13");
  const sigs = Array.from({ length: th2.bars }, (_, b) => sigOf(inBar(b), b * barS)), shared = sigs.filter((s, b) => sigs.some((t, c) => c !== b && t === s)).length;
  const cads = m.cadences.map(([b, kind]) => {
    const i = m.plan ? cadenceNoteIndex(ns, bar, b - 1) : bar.reduce((last, x, k) => x < b && x >= b - m.span ? k : last, -1), deg = (pcOf(p[i]) - th2.tonic + 12) % 12;
    const len = ns[i].len / six, degS = kind === "half" ? deg === 7 ? 1 : deg === 2 ? 0.8 : 0 : kind === "closed" ? deg === 0 ? 1 : deg === 3 ? 0.85 : 0 : kind === "end" ? deg === 0 ? 1 : 0 : 0.6;
    const longS = len >= 7 ? 1 : len >= 5 ? 0.75 : len >= 3.5 ? 0.5 : 0.2, strongS = ns[i].start / six % (barN / 2) === 0 ? 1 : 0.5, stepS = i > 0 && Math.abs(p[i] - p[i - 1]) <= 2 ? 1 : 0.6;
    return 0.35 * degS + 0.3 * longS + 0.15 * strongS + 0.2 * stepS;
  });
  const sameMoves = iv.filter((x) => x === 0).length, seamIv = Math.abs(p[0] - p[n - 1]);
  let avoidLen = 0, allLen = 0;
  ns.forEach((x, i) => {
    allLen += x.len;
    if ((x.len / six >= 3.5 || i > 0 && Math.abs(iv[i - 1]) >= 3) && isAvoid(p[i], chordAt(th2, x.start / six))) avoidLen += x.len;
  });
  const parts = {
    motif: clamp01(returns / 6),
    arch: (rise + intoTop + fall) / 3,
    steps: clamp01(0.6 * clamp01(1 - Math.abs(stepShare - R.stepTarget) / R.stepWidth) + 0.4 * clamp01(expressive / 3) - 0.1 * leapIv.filter((x) => Math.abs(x) > 7).length),
    rhythm: clamp01(0.7 * (fromMotif / th2.bars) + 0.3 * (shared / th2.bars)),
    cadence: cads.reduce((a, x) => a + x, 0) / Math.max(1, cads.length),
    range: span >= R.minSpan && span <= R.maxSpan ? 1 : 0,
    repeat: clamp01(1 - 3 * sameMoves / Math.max(1, iv.length)),
    seam: seamIv >= 1 && seamIv <= 2 ? 1 : seamIv <= 4 ? 0.6 : 0.2,
    harmony: clamp01(1 - 8 * avoidLen / allLen)
  };
  const total = v.length > 0 ? 0 : Object.keys(MUSICALITY_WEIGHTS).reduce((a, k) => a + MUSICALITY_WEIGHTS[k] * parts[k], 0);
  return { total, parts, violations: v, returns, climaxCount, climaxAt, span, stepShare, leaps: leapIv.length, maxRun };
}

// src/assets/sfx-music-themes.ts
var PREV_CHORDS = ["Dm", "Bb", "F", "C", "Dm", "Bb", "Gm", "A"];
var MISSION = { bpm: 90, beats: 4, bars: 8, tonic: 4, mode: "aeolian", chords: ["Em", "C", "D", "Em", "Em", "C", "Am", "B7"] };
var SWELL_4 = { inst: "swell", pitch: "none", low: 0, high: 0, vel: 1, every: 4, rhythms: [[0, 64, 100]] };
var PAD_BAR = [[0, 16, 100]];
var NONE = { pitch: "none", low: 0, high: 0 };
function roll(from2, to, v0, v1) {
  const out = [], k = (to - from2) * 2;
  for (let i = 0; i < k; i++) out.push(from2 + i / 2, 0.5, Math.round(v0 + (v1 - v0) * i / Math.max(1, k - 1)));
  return out;
}
var sixteenths = (vels) => vels.flatMap((v, i) => [i, 1, v]);
var MARCH_4 = [[0, 1, 100, 2, 1, 45, 3, 1, 50, 4, 1, 80, 6, 1, 50, 8, 1, 95, 10, 1, 45, 11, 1, 50, 12, 1, 80, 14, 1, 50], [0, 1, 100, 3, 1, 55, 4, 1, 80, 6, 1, 50, 7, 1, 55, 8, 1, 95, 11, 1, 55, 12, 1, 80, 14, 1, 50, 15, 1, 55]];
var BATTLE_SN = [45, 35, 100, 40, 50, 35, 95, 45, 45, 35, 100, 40, 50, 40, 95, 55];
var D_PLAN = {
  roles: ["m1", "m2", "link", "half", "m1", "m2", "link", "closed", "seq", "seq2", "frag", "half", "top1", "top2", "link", "final"],
  heads: [
    [0, 4, 100, 4, 3, 85, 7, 1, 70, 8, 8, 95],
    [0, 6, 100, 6, 2, 75, 8, 4, 90, 12, 4, 80],
    [0, 3, 100, 3, 1, 70, 4, 4, 90, 8, 3, 95, 11, 1, 70, 12, 4, 85],
    [0, 4, 100, 4, 2, 80, 6, 2, 75, 8, 6, 95, 14, 2, 75],
    [0, 8, 100, 8, 3, 85, 11, 1, 70, 12, 4, 90]
  ],
  tails: [[0, 4, 95, 4, 4, 85, 8, 8, 90], [0, 6, 95, 6, 2, 75, 8, 8, 90], [0, 3, 95, 3, 1, 70, 4, 4, 85, 8, 8, 90], [0, 12, 95, 12, 4, 80], [0, 8, 95, 8, 4, 85, 12, 4, 80]],
  links: [
    [0, 2, 90, 2, 2, 75, 4, 2, 85, 6, 2, 75, 8, 4, 90, 12, 4, 80],
    [0, 4, 95, 4, 2, 80, 6, 2, 75, 8, 2, 90, 10, 2, 75, 12, 4, 85],
    [0, 3, 95, 3, 1, 70, 4, 3, 90, 7, 1, 70, 8, 4, 90, 12, 4, 80],
    [0, 6, 95, 6, 2, 75, 8, 2, 85, 10, 2, 75, 12, 4, 85]
  ],
  halfs: [[0, 12, 100, 12, 2, 70, 14, 2, 80], [0, 4, 90, 4, 4, 85, 8, 8, 100], [0, 8, 100, 8, 4, 80, 12, 4, 85]],
  closes: [[0, 12, 100, 12, 4, 80], [0, 8, 100, 8, 4, 75, 12, 4, 85]],
  finals: [[0, 12, 100, 12, 4, 85]],
  starts: [0, 2, 4],
  seqShift: [2, 1, 0, -1, -2],
  topShift: 2
};
var D_SNARE = [
  ...MARCH_4,
  [0, 1, 100, 2, 1, 45, 4, 1, 80, 6, 1, 50, ...roll(8, 16, 40, 100)],
  [0, 1, 100, 2, 1, 50, 4, 1, 85, 6, 1, 55, 8, 1, 90, 10, 1, 60, ...roll(12, 16, 50, 100)],
  roll(0, 16, 30, 100),
  [0, 1, 90, 4, 1, 70, 8, 1, 85, 10, 1, 50, 12, 1, 70, 13, 1, 55, 14, 1, 75, 15, 1, 60]
];
var D_BOOM = [[0, 4, 100, 8, 4, 80], [0, 4, 100, 8, 4, 80, 12, 1, 60, 13, 1, 70, 14, 1, 85, 15, 1, 100]];
var D_ARRANGE = {
  dyn: [0.74, 0.74, 0.76, 0.8, 0.86, 0.86, 0.88, 0.9, 0.84, 0.88, 0.94, 1, 1.1, 1.08, 1.04, 0.9],
  bass: { inst: "bowed", range: [56, 69], vel: 0.55, voices: 2, cents: 7, human: 0.06, accents: [100, 55, 80, 55, 95, 55, 80, 60] },
  pad: { inst: "pad", range: [57, 71], vel: 0.4 },
  counter: { inst: "strings", range: [58, 74], vel: 0.42, voices: 2, cents: 8, bars: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] },
  snare: { vel: 0.4, human: 0.08, cells: D_SNARE, plan: [-1, -1, -1, 2, -1, -1, -1, 2, -1, -1, 3, 4, -1, -1, -1, 5] },
  boom: { vel: 0.7, human: 0.05, cells: D_BOOM, plan: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0] },
  crash: { vel: 0.5, bars: [13] }
};
var MUSIC_THEMES = {
  title_d: {
    key: "title_d",
    bpm: 126,
    beats: 4,
    bars: 16,
    tonic: 2,
    mode: "aeolian",
    room: [0.16, 1],
    chords: ["Dm", "Bb", "F", "C A", "Dm", "Bb", "Gm A7", "Dm", "F", "Gm", "Bb E7/G#", "A", "Dm", "Bb", "Gm A7", "Dm Dm Asus4 A"],
    melody: {
      inst: "horn",
      low: 64,
      high: 82,
      vel: 1,
      span: 1,
      legato: 0.88,
      voices: 2,
      cents: 6,
      rhythms: [],
      ends: [],
      motifs: [],
      cadences: [[4, "half"], [8, "closed"], [12, "half"], [16, "end"]],
      plan: D_PLAN
    },
    parts: [],
    arrange: D_ARRANGE
  },
  title_d_prev: {
    key: "title_d_prev",
    bpm: 126,
    beats: 4,
    bars: 16,
    tonic: 2,
    mode: "aeolian",
    chords: [...PREV_CHORDS, ...PREV_CHORDS],
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

// ../../../tmp/claude-0/-home-user-ww2-torpedo-boat/8620609b-38c2-5666-adab-d8b565d37033/scratchpad/v0720/impl/IP2/tools/search.ts
var from = Number(process.argv[2] ?? 76e4);
var count = Number(process.argv[3] ?? 400);
var th = MUSIC_THEMES.title_d;
var tally = /* @__PURE__ */ new Map();
var rows = [];
var t0 = performance.now();
for (let s = from; s < from + count; s++) {
  const r = musicality(composeMusic(th, new SeededRng(s)));
  for (const x of r.violations) {
    const k = x.replace(/@\d+/, "");
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  rows.push({ seed: s, t: r.total, parts: r.parts, r });
}
var ms = performance.now() - t0;
rows.sort((a, b) => b.t - a.t);
var ok = rows.filter((x) => x.t > 0).length;
console.log(`${count} seeds in ${ms.toFixed(0)} ms (${(ms / count).toFixed(2)} ms/seed). passing ${ok}. violations: ${[...tally].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k} ${c}`).join(" \xB7 ")}`);
for (const x of rows.slice(0, Number(process.env.TOP ?? 10))) console.log(`${x.seed}  total ${x.t.toFixed(3)}  ${Object.entries(x.parts).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(" ")}  returns ${x.r.returns} climax@${x.r.climaxAt.toFixed(3)} span ${x.r.span} steps ${(x.r.stepShare * 100).toFixed(0)}% leaps ${x.r.leaps}`);
