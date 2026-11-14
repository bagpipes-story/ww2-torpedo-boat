// 種の点を並べる（scratchpad の道具）: node search.mjs [from] [count]
import { composeMusic } from '@repo/src/assets/sfx-music-compose';
import { musicality } from '@repo/src/assets/sfx-music-score';
import { MUSIC_THEMES } from '@repo/src/assets/sfx-music-themes';
import { SeededRng } from '@repo/src/core/rng';
const from = Number(process.argv[2] ?? 760000), count = Number(process.argv[3] ?? 400), th = MUSIC_THEMES.title_d;
const tally = new Map<string, number>(), rows: { seed: number; t: number; parts: Record<string, number>; r: ReturnType<typeof musicality> }[] = [];
const t0 = performance.now();
for (let s = from; s < from + count; s++) {
  const r = musicality(composeMusic(th, new SeededRng(s)));
  for (const x of r.violations) { const k = x.replace(/@\d+/, ''); tally.set(k, (tally.get(k) ?? 0) + 1); }
  rows.push({ seed: s, t: r.total, parts: r.parts, r });
}
const ms = performance.now() - t0;
rows.sort((a, b) => b.t - a.t);
const ok = rows.filter((x) => x.t > 0).length;
console.log(`${count} seeds in ${ms.toFixed(0)} ms (${(ms / count).toFixed(2)} ms/seed). passing ${ok}. violations: ${[...tally].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k} ${c}`).join(' · ')}`);
for (const x of rows.slice(0, Number(process.env.TOP ?? 10))) console.log(`${x.seed}  total ${x.t.toFixed(3)}  ${Object.entries(x.parts).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' ')}  returns ${x.r.returns} climax@${x.r.climaxAt.toFixed(3)} span ${x.r.span} steps ${(x.r.stepShare * 100).toFixed(0)}% leaps ${x.r.leaps}`);
