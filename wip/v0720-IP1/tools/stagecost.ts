// 段ごとの ns/単位（node）: 1 回の stepBuild を、呼んだ時の段（1 音符・2 ならし・3 響き・4 数え・5 掛け）で分けて数える。温めた後の 5 回
import { MUSIC_WORK_SAMPLES, MUSIC_COST, type MusicKey } from '@repo/src/config/sfx-music-config';
import { MusicBuilder, composeMusicKey } from '@repo/src/assets/sfx-music-render';
import { MusicTables } from '@repo/src/assets/sfx-music-synth';
const tb = new MusicTables(), work = new Float32Array(MUSIC_WORK_SAMPLES);
while (!tb.ready) tb.stepTables(1e9);
const keys = (process.argv[2] ?? 'title_d,title_e').split(',') as MusicKey[];
for (const k of keys) {
  const acc = new Map<number, [number, number]>();
  for (let rep = 0; rep < 8; rep++) {
    const b = new MusicBuilder(tb, work, composeMusicKey(k)), z = b as unknown as { stage: number };
    while (!b.done) {
      const st = z.stage, t = performance.now(), u = b.stepBuild(30000), ms = performance.now() - t;
      if (rep >= 3 && z.stage === st) { const a = acc.get(st) ?? [0, 0]; a[0] += ms; a[1] += u; acc.set(st, a); }
    }
  }
  const tone = acc.get(1)!;
  console.log(`${k}: ` + [...acc].sort((a, b) => a[0] - b[0]).map(([st, [ms, u]]) => `段 ${st} ${(ms * 1e6 / u).toFixed(2)} ns/単位`).join('・') + (acc.has(3) ? `  → 響き 1 標本 ≒ ${((acc.get(3)![0] * 1e6 / (acc.get(3)![1] / MUSIC_COST.room)) / (tone[0] * 1e6 / tone[1])).toFixed(2)} 単位（音符の段の 1 単位と比べて）` : ''));
}
