// 旋律の変化の数（最も多い音の割合・違う音の数・音域・同じ音の続き）を案ごとに。種は 7604 から決まりを通る最初の数
import { MUSIC_THEMES } from '@repo/src/assets/sfx-music-themes';
import { composeMusic, melodyCheck, type MusicMelody, type MusicTheme } from '@repo/src/assets/sfx-music-compose';
import { SeededRng } from '@repo/src/core/rng';
const N = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
function stats(th: MusicTheme, from: number): string {
  let seed = from;
  for (; seed < from + 3000; seed++) if (melodyCheck(composeMusic(th, new SeededRng(seed))).violations.length === 0) break;
  const sc = composeMusic(th, new SeededRng(seed)), p = sc.melody.map((m) => Math.round(m.pitch)), cnt = new Map<number, number>();
  for (const x of p) cnt.set(x, (cnt.get(x) ?? 0) + 1);
  const top = Math.max(...cnt.values()) / p.length;
  let run = 1, maxRun = 1; for (let i = 1; i < p.length; i++) { run = p[i] === p[i - 1] ? run + 1 : 1; maxRun = Math.max(maxRun, run); }
  const rep = p.slice(1).filter((x, i) => x === p[i]).length / (p.length - 1);
  return `種 ${seed}  ${p.length} 音  最多の音 ${(top * 100).toFixed(0)}%  違う音 ${cnt.size}  音域 ${Math.max(...p) - Math.min(...p)}  同じ音へ ${(rep * 100).toFixed(0)}%  最長の続き ${maxRun}  | ${p.map((x) => N[x % 12] + (Math.floor(x / 12) - 1)).join(' ')}`;
}
const variants: [string, MusicTheme][] = [];
const D = MUSIC_THEMES.title_d, E = MUSIC_THEMES.title_e;
const mel = (th: MusicTheme, m: Partial<MusicMelody>): MusicTheme => ({ ...th, melody: { ...th.melody!, ...m } });
variants.push(['D 今 67-79', D], ['D 69-81', mel(D, { low: 69, high: 81 })], ['D 65-79', mel(D, { low: 65, high: 79 })], ['D 67-81', mel(D, { low: 67, high: 81 })]);
variants.push(['E 今 69-81', E], ['E 67-81', mel(E, { low: 67, high: 81 })], ['E 70-82', mel(E, { low: 70, high: 82 })], ['E 67-79', mel(E, { low: 67, high: 79 })]);
for (const [name, th] of variants) console.log(`${name.padEnd(11)} ${stats(th, 7604)}`);
