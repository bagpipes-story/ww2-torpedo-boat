import { composeMusicKey } from '@repo/src/assets/sfx-music-render';
import { sixteenthOf } from '@repo/src/assets/sfx-music-compose';
import type { MusicKey } from '@repo/src/config/sfx-music-config';
const N = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
for (const k of (process.argv[2] ?? 'title_e').split(',') as MusicKey[]) {
  const sc = composeMusicKey(k), th = sc.theme, six = sixteenthOf(th.bpm), barN = th.beats * 4;
  const rows: string[] = [];
  let bar = -1, line = '';
  for (const m of sc.melody) {
    const at = m.start / six, b = Math.floor(at / barN);
    if (b !== bar) { if (line) rows.push(line); bar = b; line = `${String(b + 1).padStart(2)} ${th.chords[b]!.padEnd(3)}|`; }
    const p = Math.round(m.pitch);
    line += ` ${(at % barN).toString().padStart(2)}:${N[p % 12]}${Math.floor(p / 12) - 1}(${Math.round(m.len / six * 10) / 10})`;
  }
  rows.push(line);
  console.log(`== ${k}\n${rows.join('\n')}`);
}
