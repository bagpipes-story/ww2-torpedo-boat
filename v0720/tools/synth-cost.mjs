// v0.7.2 計画の見積もり（ゲームは import しない）: 波形表の発振器で「音 1 秒あたり何 ms」かを node で測る。
const SR = 22050, TAB = 2048, TAU = Math.PI * 2;
function table(nh, f0max) { // 帯域制限の鋸波（Nyquist 11,025 の 0.9 まで）
  const t = new Float32Array(TAB + 1); const hmax = Math.max(1, Math.min(nh, Math.floor(9900 / f0max)));
  for (let h = 1; h <= hmax; h++) for (let i = 0; i <= TAB; i++) t[i] += Math.sin(TAU * h * i / TAB) / h;
  let p = 0; for (const v of t) p = Math.max(p, Math.abs(v)); for (let i = 0; i <= TAB; i++) t[i] /= p; return t;
}
const tabs = []; for (let o = 0; o < 8; o++) tabs.push(table(64, 55 * 2 ** (o + 1)));
function osc(dst, start, n, hz, gain, att, dec) { // 1 声: 波形表＋包絡（線形補間 1 回/標本）
  const t = tabs[Math.max(0, Math.min(7, Math.floor(Math.log2(hz / 55))))]; const inc = hz * TAB / SR; let ph = 0;
  const an = att * SR, k = Math.log(10) / (dec * SR); const N = dst.length;
  for (let i = 0; i < n; i++) { const j = ph | 0, f = ph - j; const v = t[j] + (t[j + 1] - t[j]) * f; const e = i < an ? i / an : Math.exp(-k * (i - an));
    const d = (start + i) % N; dst[d] += v * e * gain; ph += inc; if (ph >= TAB) ph -= TAB; }
}
function fmBell(dst, start, n, hz, gain) { const wc = TAU * hz / SR, wm = wc * 3.5, k1 = Math.log(10) / (0.4 * SR), k2 = Math.log(10) / (1.8 * SR), N = dst.length;
  for (let i = 0; i < n; i++) { const d = (start + i) % N; dst[d] += gain * Math.exp(-k2 * i) * Math.sin(wc * i + 2 * Math.exp(-k1 * i) * Math.sin(wm * i)); } }
function noiseHit(dst, start, n, gain, seed) { let s = seed >>> 0; let y = 0; const a = 0.6, k = Math.log(10) / (0.08 * SR), N = dst.length;
  for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; const w = s / 4294967296 * 2 - 1; y += a * (w - y); const d = (start + i) % N; dst[d] += (w - y) * Math.exp(-k * i) * gain; } }
// 「静かな夜の海」相当: 63 BPM・8 小節（30.48 秒）。pad 3 音 × 6 声（2 小節ずつ）・鈴 24 音・波の雑音なし
const N = Math.round(30.48 * SR); const dst = new Float32Array(N); const beat = 21000;
let t0 = performance.now();
for (let bar = 0; bar < 8; bar += 2) for (const m of [62, 65, 69]) for (let v = 0; v < 6; v++) osc(dst, bar * 4 * beat, 8 * beat + 2 * SR, 440 * 2 ** ((m - 69) / 12) * (1 + (v - 2.5) * 0.0023), 0.05, 1.5, 3.0);
const tPad = performance.now() - t0; t0 = performance.now();
for (let i = 0; i < 24; i++) fmBell(dst, i * 28000, Math.round(2.5 * SR), 587 * 2 ** ((i % 5) / 12), 0.2);
const tBell = performance.now() - t0;
// 行進相当: 105 BPM・2/4・16 小節（18.29 秒）。小太鼓 16 分 128 打・金管 64 音（4 声＝倍音の層）・低音 32 音
const N2 = Math.round(18.29 * SR); const d2 = new Float32Array(N2); t0 = performance.now();
for (let i = 0; i < 128; i++) noiseHit(d2, i * 3150, Math.round(0.25 * SR), 0.3, 9 + i);
for (let i = 0; i < 64; i++) for (let v = 0; v < 4; v++) osc(d2, i * 6300, Math.round(0.6 * SR), 349 * 2 ** ((i % 7) / 12) * (1 + v * 0.002), 0.08, 0.02, 0.4);
for (let i = 0; i < 32; i++) for (let v = 0; v < 2; v++) osc(d2, i * 12600, Math.round(0.5 * SR), 116.5 * (1 + v * 0.003), 0.2, 0.005, 0.25);
const tMarch = performance.now() - t0;
console.log(JSON.stringify({ padMs: +tPad.toFixed(1), bellMs: +tBell.toFixed(1), nightSeaS: 30.48, nightSeaMsPerAudioS: +((tPad + tBell) / 30.48).toFixed(2), marchMs: +tMarch.toFixed(1), marchMsPerAudioS: +(tMarch / 18.29).toFixed(2), voiceSamplesPad: 4 * 3 * 6 * (8 * beat + 2 * SR) }));
