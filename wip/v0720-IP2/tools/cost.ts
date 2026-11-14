// 鍵ごと・楽器ごとの作る単位（作る前の見積もり）。@repo を木に向けて束ねる
import { MUSIC_BUILD_BUDGET, MUSIC_COST, MUSIC_KEYS, type MusicKey } from '@repo/src/config/sfx-music-config';
import { composeMusicKey } from '@repo/src/assets/sfx-music-render';
import { musicNoteSamples, musicUnitsPerSample } from '@repo/src/assets/sfx-music-synth';
const keys = (process.argv[2] ? process.argv[2].split(',') : [...MUSIC_KEYS]) as MusicKey[];
for (const k of keys) {
  const sc = composeMusicKey(k), by = new Map<string, [number, number]>();
  let tot = 0;
  for (const x of sc.notes) { const u = MUSIC_COST.note + musicNoteSamples(x) * musicUnitsPerSample(x.inst); tot += u; const e = by.get(x.inst) ?? [0, 0]; e[0]++; e[1] += u; by.set(x.inst, e); }
  const pass = 3 * sc.n * MUSIC_COST.pass;
  console.log(`${k}: notes ${sc.notes.length}  note units ${(tot / 1e6).toFixed(2)}M  pass ${(pass / 1e6).toFixed(2)}M  frames≈${Math.ceil((tot + pass) / MUSIC_BUILD_BUDGET)}`);
  for (const [i, [n, u]] of [...by].sort((a, b) => b[1][1] - a[1][1])) console.log(`   ${i.padEnd(8)} ${String(n).padStart(4)} notes  ${(u / 1e6).toFixed(2)}M`);
}
