// 新しい D の楽譜を文字で見る（scratchpad の道具）: node show.mjs <種,種,...> [all]
import { composeMusic, melodyCheck, sixteenthOf } from '@repo/src/assets/sfx-music-compose';
import { MUSIC_THEMES } from '@repo/src/assets/sfx-music-themes';
import { SeededRng } from '@repo/src/core/rng';
const N = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const nm = (p: number): string => { const q = Math.round(p); return `${N[((q % 12) + 12) % 12]}${Math.floor(q / 12) - 1}`; };
const th = MUSIC_THEMES.title_d, six = sixteenthOf(th.bpm), barN = 16;
for (const seed of (process.argv[2] ?? '760000').split(',').map(Number)) {
  const sc = composeMusic(th, new SeededRng(seed)), c = melodyCheck(sc);
  console.log(`== seed ${seed}  notes ${sc.notes.length}  violations ${c.violations.join(',') || 'none'}  steps ${(c.stepShare * 100).toFixed(0)}%  rec ${(c.recovered * 100).toFixed(0)}%  range ${nm(c.low)}-${nm(c.high)}  cad ${c.cadences.map(nm).join(' ')}`);
  for (let b = 0; b < th.bars; b++) {
    const ms = sc.melody.filter((x) => Math.floor(x.start / six / barN) === b);
    const line = ms.map((x) => `${(x.start / six) % barN}:${nm(x.pitch)}/${Math.round(x.len / six / 0.88)}`).join(' ');
    let extra = '';
    if (process.argv[3] === 'all') {
      const bass = sc.notes.filter((x) => x.inst === 'bowed' && Math.floor(x.start / six / barN) === b && Math.abs(x.pitch - Math.round(x.pitch)) > 0.01 && x.pitch < Math.round(x.pitch));
      const bl = bass.filter((_, i) => i % 2 === 0).map((x) => nm(x.pitch)).join(' ');
      const ctr = sc.notes.filter((x) => x.inst === 'strings' && Math.floor(x.start / six / barN) === b && x.pitch < Math.round(x.pitch) + 1e-9 && x.pitch < Math.round(x.pitch));
      extra = `   | bass ${bl}   | ctr ${ctr.map((x) => `${(x.start / six) % barN}:${nm(x.pitch)}/${Math.round(x.len / six)}`).join(' ')}`;
    }
    console.log(`${String(b + 1).padStart(2)} ${th.chords[b]!.padEnd(14)} ${line}${extra}`);
  }
}
