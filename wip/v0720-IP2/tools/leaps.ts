// 戻らない跳躍の場所を数える（scratchpad の道具）
import { cadenceNoteIndex, composeMusic, sixteenthOf } from '@repo/src/assets/sfx-music-compose';
import { MUSIC_THEMES } from '@repo/src/assets/sfx-music-themes';
import { SeededRng } from '@repo/src/core/rng';
const th = MUSIC_THEMES.title_d, six = sixteenthOf(th.bpm), barS = 16 * six, where = new Map<string, number>();
const from = Number(process.argv[2] ?? 760000), count = Number(process.argv[3] ?? 200);
for (let s = from; s < from + count; s++) {
  const sc = composeMusic(th, new SeededRng(s)), ns = sc.melody, p = ns.map((x) => Math.round(x.pitch)), bar = ns.map((x) => Math.floor(x.start / barS));
  const cad = th.melody!.cadences.map(([b]) => cadenceNoteIndex(ns, bar, b - 1));
  const iv = p.slice(1).map((x, i) => x - p[i]!);
  for (let i = 0; i + 1 < iv.length; i++) {
    if (Math.abs(iv[i]!) < 3 || cad.includes(i + 1)) continue;
    const ok = Math.abs(iv[i + 1]!) >= 1 && Math.abs(iv[i + 1]!) <= 2 && Math.sign(iv[i + 1]!) !== Math.sign(iv[i]!);
    if (ok) continue;
    const role = (b: number): string => th.melody!.plan!.roles[b]!;
    const k = `${role(bar[i]!)}${bar[i] === bar[i + 1] ? '' : '→' + role(bar[i + 1]!)} next:${iv[i + 1] === 0 ? 'same' : Math.abs(iv[i + 1]!) <= 2 ? 'stepSameDir' : 'leap'}`;
    where.set(k, (where.get(k) ?? 0) + 1);
  }
}
console.log([...where].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, c]) => `${String(c).padStart(4)} ${k}`).join('\n'));
