const n = 604800; const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = Math.sin(i * 0.05) * 0.3 + Math.sin(i * 0.31) * 0.1;
const c = new Float64Array(10); c[0] = 0.9; c[1] = -1.8; c[2] = 0.9; c[3] = -1.8; c[4] = 0.81; c[5] = 0.1; c[6] = 0.2; c[7] = 0.1; c[8] = -1.2; c[9] = 0.5;
function fx(a, b, k) {
  const b0 = c[0], b1 = c[1], b2 = c[2], a1 = c[3], a2 = c[4], d0 = c[5], d1 = c[6], d2 = c[7], e1 = c[8], e2 = c[9];
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0, z1 = 0, z2 = 0, w1 = 0, w2 = 0, sum = 0, hi = -1, lo = 1;
  for (let i = a; i < b; i++) { const u = x[i] * k, w = u - (u * u * u) / 3, h = b0 * w + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2, v = d0 * h + d1 * z1 + d2 * z2 - e1 * w1 - e2 * w2;
    x2 = x1; x1 = w; y2 = y1; y1 = h; z2 = z1; z1 = h; w2 = w1; w1 = v; x[i] = v; sum += v; if (v > hi) hi = v; if (v < lo) lo = v; }
  return sum;
}
for (let r = 0; r < 4; r++) { const t = performance.now(); for (let a = 0; a < n; a += 150000) fx(a, Math.min(n, a + 150000), 1); console.log(`round ${r}: ${((performance.now() - t) * 1e6 / n).toFixed(1)} ns/sample`); }
