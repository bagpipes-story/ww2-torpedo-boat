// FM の鈴を Math.sin で引く形と、正弦の波形表で引く形の比べ（1 音 2.5 秒 × 24 音）
const SR = 22050, TAB = 2048, TAU = Math.PI * 2; const S = new Float32Array(TAB + 1); for (let i = 0; i <= TAB; i++) S[i] = Math.sin(TAU * i / TAB);
const n = Math.round(2.5 * SR), N = 24 * n; const dst = new Float32Array(N);
function fmSin(d0, hz) { const wc = TAU * hz / SR, wm = wc * 3.5; let e1 = 1, e2 = 1; const r1 = Math.exp(-Math.log(10) / (0.4 * SR)), r2 = Math.exp(-Math.log(10) / (1.8 * SR));
  for (let i = 0; i < n; i++) { dst[d0 + i] += e2 * Math.sin(wc * i + 2 * e1 * Math.sin(wm * i)); e1 *= r1; e2 *= r2; } }
function fmTab(d0, hz) { const ic = hz * TAB / SR, im = ic * 3.5; let pc = 0, pm = 0, e1 = 1, e2 = 1; const r1 = Math.exp(-Math.log(10) / (0.4 * SR)), r2 = Math.exp(-Math.log(10) / (1.8 * SR));
  for (let i = 0; i < n; i++) { const jm = pm | 0; const m = S[jm] + (S[jm + 1] - S[jm]) * (pm - jm); let p = pc + 2 * e1 * m * TAB / TAU; p -= Math.floor(p / TAB) * TAB; const jc = p | 0;
    dst[d0 + i] += e2 * (S[jc] + (S[jc + 1] - S[jc]) * (p - jc)); pc += ic; if (pc >= TAB) pc -= TAB; pm += im; if (pm >= TAB) pm -= TAB; e1 *= r1; e2 *= r2; } }
for (const [name, f] of [['sin', fmSin], ['table', fmTab]]) { const ts = []; for (let k = 0; k < 5; k++) { dst.fill(0); const t0 = performance.now(); for (let i = 0; i < 24; i++) f(i * n, 587 * 2 ** ((i % 5) / 12)); ts.push(performance.now() - t0); }
  ts.sort((a, b) => a - b); console.log(name, 'ms', ts[2].toFixed(1), 'ns/sample', (ts[2] * 1e6 / N).toFixed(1)); }
