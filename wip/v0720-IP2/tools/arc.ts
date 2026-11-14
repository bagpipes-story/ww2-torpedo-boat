// 小節ごとの RMS（強弱の弧）と楽器ごとの寄与（scratchpad の道具）
import { MUSIC_WORK_SAMPLES, type MusicKey } from '@repo/src/config/sfx-music-config';
import { MusicBuilder, composeMusicKey } from '@repo/src/assets/sfx-music-render';
import { MusicTables } from '@repo/src/assets/sfx-music-synth';
import { bandShare } from '@repo/scripts/sfx-files';
const tb = new MusicTables(), work = new Float32Array(MUSIC_WORK_SAMPLES), SR = 22050;
const render = (k: MusicKey, keep?: (inst: string) => boolean): Float32Array => {
  const sc = composeMusicKey(k), s2 = keep ? { ...sc, notes: sc.notes.filter((x) => keep(x.inst)) } : sc;
  const b = new MusicBuilder(tb, work, s2); while (!b.done) b.stepBuild(1e9); return b.result().slice();
};
const db = (v: number): string => (20 * Math.log10(Math.max(v, 1e-9))).toFixed(1);
for (const k of (process.argv[2] ?? 'title_d,title_d_prev').split(',') as MusicKey[]) {
  const x = render(k), barN = x.length / 16, rows: string[] = [];
  for (let b = 0; b < 16; b++) { let s = 0, p = 0; for (let i = b * barN; i < (b + 1) * barN; i++) { s += x[i]! ** 2; p = Math.max(p, Math.abs(x[i]!)); } rows.push(`${b + 1}:${db(Math.sqrt(s / barN))}`); }
  console.log(`${k} 小節ごとの RMS（dBFS・頂 0.9 の標本）: ${rows.join(' ')}`);
  if (process.argv[3] === 'parts') {
    const insts = [...new Set(composeMusicKey(k).notes.map((n) => n.inst))];
    for (const inst of insts) { const y = render(k, (i) => i === inst); let s = 0; for (const v of y) s += v * v; console.log(`   ${inst.padEnd(8)} RMS ${db(Math.sqrt(s / y.length))}（正規化後・1 つだけ）  >2.5 kHz ${(bandShare(y, SR, 2500, SR) * 100).toFixed(1)}%  <400 Hz ${(bandShare(y, SR, 0, 400) * 100).toFixed(1)}%`); }
  }
}
