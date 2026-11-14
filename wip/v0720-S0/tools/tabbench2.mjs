const TAB = 2048, MASK = 2047, ROW = TAB + 2;
const t00 = performance.now();
const sine = new Float64Array(ROW); for (let i = 0; i < ROW; i++) sine[i] = Math.sin(2 * Math.PI * (i & MASK) / TAB);
const waves = new Float32Array(36 * ROW);
const tA = performance.now();
const H = [45, 22, 11, 5, 2, 1];
function pass(base, h, a) { for (let i = 0; i < TAB; i++) waves[base + i] += a * sine[(h * i) & MASK]; }
const t0 = performance.now(); let n = 0; const marks = [];
for (let job = 0; job < 36; job++) { const top = H[job % 6], base = job * ROW;
  for (let h = 1; h <= top; h++) { pass(base, h, 1 / h); n++; if (n % 64 === 0) marks.push(performance.now() - t0); } }
console.log(`alloc+sine ${(tA - t00).toFixed(2)} ms; build ${(performance.now() - t0).toFixed(2)} ms for ${n} passes; cumulative every 64: ${marks.map((x) => x.toFixed(1)).join(' ')}`);
