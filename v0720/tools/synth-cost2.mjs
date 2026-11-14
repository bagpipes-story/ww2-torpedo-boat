// 速くした形の見積もり: 包絡は掛け算の漸化式（標本ごとの Math.exp なし）・継ぎ目の折り返しは 2 区間に分けて % なし・pad は 1 音 3 声
const SR = 22050, TAB = 2048, TAU = Math.PI * 2;
function table(nh, f0max) { const t = new Float32Array(TAB + 1); const hmax = Math.max(1, Math.min(nh, Math.floor(9900 / f0max)));
  for (let h = 1; h <= hmax; h++) for (let i = 0; i <= TAB; i++) t[i] += Math.sin(TAU * h * i / TAB) / h;
  let p = 0; for (const v of t) p = Math.max(p, Math.abs(v)); for (let i = 0; i <= TAB; i++) t[i] /= p; return t; }
const tabs = []; for (let o = 0; o < 8; o++) tabs.push(table(64, 55 * 2 ** (o + 1)));
function run(dst, from, to, t, ph, inc, e, r, rise, an, i0, gain) { // [from, to) に書く。戻り値なし（状態は呼ぶ側が持つ形の見積もり）
  let i = i0; for (let d = from; d < to; d++, i++) { const j = ph | 0; const v = t[j] + (t[j + 1] - t[j]) * (ph - j); const env = i < an ? i * rise : e; if (i >= an) e *= r;
    dst[d] += v * env * gain; ph += inc; if (ph >= TAB) ph -= TAB; } return [ph, e]; }
function osc(dst, start, n, hz, gain, att, dec) { const t = tabs[Math.max(0, Math.min(7, Math.floor(Math.log2(hz / 55))))]; const inc = hz * TAB / SR; const N = dst.length;
  const an = Math.round(att * SR), rise = 1 / Math.max(1, an), r = Math.exp(-Math.log(10) / (dec * SR)); const s = start % N; const first = Math.min(n, N - s);
  const [ph, e] = run(dst, s, s + first, t, 0, inc, 1, r, rise, an, 0, gain); if (n > first) run(dst, 0, n - first, t, ph, inc, e, r, rise, an, first, gain); }
const N = Math.round(30.48 * SR); const dst = new Float32Array(N); const beat = 21000;
const times = [];
for (let rep = 0; rep < 5; rep++) { dst.fill(0); const t0 = performance.now();
  for (let bar = 0; bar < 8; bar += 2) for (const m of [62, 65, 69]) for (let v = 0; v < 3; v++) osc(dst, bar * 4 * beat, 8 * beat + 2 * SR, 440 * 2 ** ((m - 69) / 12) * (1 + (v - 1) * 0.003), 0.07, 1.5, 3.0);
  for (let i = 0; i < 24; i++) osc(dst, i * 28000, Math.round(2.5 * SR), 1174 * 2 ** ((i % 5) / 12), 0.2, 0.003, 0.9);
  for (let i = 0; i < 64; i++) osc(dst, i * 10500, Math.round(0.6 * SR), 147 * 2 ** ((i % 3) / 12), 0.15, 0.004, 0.3);
  times.push(performance.now() - t0); }
const vs = 4 * 3 * 3 * (8 * beat + 2 * SR) + 24 * Math.round(2.5 * SR) + 64 * Math.round(0.6 * SR);
times.sort((a, b) => a - b);
console.log(JSON.stringify({ msMedian: +times[2].toFixed(1), msPerAudioS: +(times[2] / 30.48).toFixed(2), voiceSamples: vs, nsPerVoiceSample: +(times[2] * 1e6 / vs).toFixed(2), samples: N, mb: +(N * 4 / 1e6).toFixed(2) }));
