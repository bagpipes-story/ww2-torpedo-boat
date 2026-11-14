import { MUSIC_BUILD_BUDGET, MUSIC_KEYS, MUSIC_WORK_SAMPLES } from '/home/user/ww2-torpedo-boat/src/config/sfx-music-config';
import { MusicBuilder, musicScore } from '/home/user/ww2-torpedo-boat/src/assets/sfx-music-render';
import { MusicTables } from '/home/user/ww2-torpedo-boat/src/assets/sfx-music-synth';
const tables = new MusicTables(), work = new Float32Array(MUSIC_WORK_SAMPLES);
while (!tables.ready) tables.stepTables(MUSIC_BUILD_BUDGET);
for (let round = 0; round < 2; round++) for (const key of MUSIC_KEYS) {
  const b = new MusicBuilder(tables, work, musicScore(key)) as any;
  const per = new Map<string, number[]>();
  while (!b.done) {
    const stage = b.stage, inst = stage === 1 ? b.score.notes[b.at].inst : '';
    const t = performance.now(); const u = b.stepBuild(MUSIC_BUILD_BUDGET); const dt = performance.now() - t;
    const k = `${stage}${inst ? ':' + inst : ''}`; if (!per.has(k)) per.set(k, []); per.get(k)!.push(dt / (u / 1e5));
  }
  if (round === 1) console.log(key, [...per].map(([k, a]) => `${k} ${(a.reduce((p, q) => p + q, 0) / a.length).toFixed(2)}ms/100k(${a.length})`).join('  '));
}
