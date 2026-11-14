import { MusicTables, musicNoteSamples, stepNoise, type MusicNote } from '/home/user/ww2-torpedo-boat/src/assets/sfx-music-synth';
const TB = new MusicTables(); while (!TB.ready) TB.stepTables(1e9);
const nt: MusicNote = { inst: 'rim', start: 300, len: 8820, pitch: 69, vel: 1, decayS: 0, noise: 1234 };
const T = musicNoteSamples(nt), n = T + 1000;
const a = new Float32Array(n), sa = new Float64Array(8); stepNoise(a, n, nt, 0, T, sa, TB);
const b = new Float32Array(n), sb = new Float64Array(8); const pts = [0, 1, 31, 32, 33, 1000, Math.floor(T / 2), T - 1, T].filter((v, i, arr) => v <= T && (i === 0 || v > arr[i - 1]!));
for (let k = 0; k + 1 < pts.length; k++) stepNoise(b, n, nt, pts[k]!, pts[k + 1]!, sb, TB);
let first = -1; for (let i = 0; i < n; i++) if (a[i] !== b[i]) { first = i; break; }
console.log({ T, pts, first, a: a[first], b: b[first], sa: [...sa], sb: [...sb] });
