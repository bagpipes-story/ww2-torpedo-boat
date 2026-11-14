// 楽器の群ごとの大きさの釣り合い（正規化の前の和。scratchpad の道具）
import type { MusicKey } from '@repo/src/config/sfx-music-config';
import { composeMusicKey } from '@repo/src/assets/sfx-music-render';
import { MUSIC_INSTRUMENTS, MusicTables, musicNoteSamples, stepFm, stepNoise, stepTone } from '@repo/src/assets/sfx-music-synth';
const tb = new MusicTables(); while (!tb.ready) tb.stepTables(1e9);
const db = (v: number): string => (20 * Math.log10(Math.max(v, 1e-12))).toFixed(1);
for (const k of (process.argv[2] ?? 'title_d,title_d_prev').split(',') as MusicKey[]) {
  const sc = composeMusicKey(k), n = sc.n, by = new Map<string, Float32Array>(), all = new Float32Array(n), st = new Float64Array(8);
  for (const nt of sc.notes) {
    const x = by.get(nt.inst) ?? new Float32Array(n); by.set(nt.inst, x);
    st.fill(0); const T = musicNoteSamples(nt), kind = MUSIC_INSTRUMENTS[nt.inst].kind;
    if (kind === 'tone') stepTone(x, n, nt, 0, T, st, tb); else if (kind === 'fm') stepFm(x, n, nt, 0, T, st, tb); else stepNoise(x, n, nt, 0, T, st, tb);
  }
  for (const x of by.values()) for (let i = 0; i < n; i++) all[i] = all[i]! + x[i]!;
  const rms = (x: Float32Array, a = 0, b = n): number => { let s = 0; for (let i = a; i < b; i++) s += x[i]! ** 2; return Math.sqrt(s / (b - a)); };
  const tot = rms(all);
  console.log(`${k}: 和の RMS ${db(tot)} dB（相対）・楽器ごと（和からの dB）: ${[...by].map(([i, x]) => `${i} ${(20 * Math.log10(rms(x) / tot)).toFixed(1)}`).join('・')}`);
  const bar = n / 16, h = by.get('horn')!;
  console.log(`   旋律 − ほか（小節ごと dB）: ${Array.from({ length: 16 }, (_, b) => { const acc = new Float32Array(bar); for (const [i, x] of by) if (i !== 'horn') for (let j = 0; j < bar; j++) acc[j] = acc[j]! + x[b * bar + j]!; return (20 * Math.log10(rms(h, b * bar, (b + 1) * bar) / rms(acc))).toFixed(1); }).join(' ')}`);
}
