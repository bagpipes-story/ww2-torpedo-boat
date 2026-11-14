const TAB = 2048, MASK = 2047, ROW = TAB + 2;
const sine = new Float64Array(ROW); for (let i = 0; i < ROW; i++) sine[i] = Math.sin(2 * Math.PI * (i & MASK) / TAB);
const waves = new Float32Array(36 * ROW);
const H = [45, 22, 11, 5, 2, 1];
const t0 = performance.now(); const per = [];
for (let job = 0; job < 36; job++) { const top = H[job % 6], base = job * ROW;
  for (let h = 1; h <= top; h++) { const a = 1 / h; const t = performance.now();
    for (let i = 0; i < TAB; i++) waves[base + i] += a * sine[(h * i) & MASK];
    per.push(performance.now() - t); } }
const total = performance.now() - t0; per.sort((a, b) => a - b);
console.log(`total ${total.toFixed(2)} ms for ${per.length} harmonic passes; median ${(per[per.length >> 1] * 1000).toFixed(1)} us, max ${(per[per.length - 1] * 1000).toFixed(1)} us, first passes`, per.slice(-5).map((x) => (x * 1000).toFixed(0)).join(','));
