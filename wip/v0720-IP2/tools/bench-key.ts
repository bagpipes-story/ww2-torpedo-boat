// 1 つの鍵だけを作る時間（node・1 回の stepBuild(150,000) の中央値・95%・最大・合計）。@repo を木に向けて束ねる
import { MUSIC_BUILD_BUDGET, MUSIC_WORK_SAMPLES, type MusicKey } from '@repo/src/config/sfx-music-config';
import { MusicBuilder, composeMusicKey } from '@repo/src/assets/sfx-music-render';
import { MusicTables } from '@repo/src/assets/sfx-music-synth';
const keys = (process.argv[2] ?? 'mission_l0').split(',') as MusicKey[];
const tables = new MusicTables(), work = new Float32Array(MUSIC_WORK_SAMPLES);
while (!tables.ready) tables.stepTables(MUSIC_BUILD_BUDGET);
const q = (a: number[], p: number): number => a[Math.min(a.length - 1, Math.floor(a.length * p))]!;
for (const k of keys) {
  const b = new MusicBuilder(tables, work, composeMusicKey(k)), ms: number[] = [];
  let u = 0;
  while (!b.done) { const t = performance.now(); u += b.stepBuild(MUSIC_BUILD_BUDGET); ms.push(performance.now() - t); }
  const s = [...ms].sort((x, y) => x - y);
  console.log(`${k.padEnd(11)} ${ms.length} 回  ${(u / 1e6).toFixed(2)}M 単位  合計 ${ms.reduce((x, y) => x + y, 0).toFixed(0)} ms  中央値 ${q(s, 0.5).toFixed(2)}  95% ${q(s, 0.95).toFixed(2)}  最大 ${s[s.length - 1]!.toFixed(2)} ms  ns/単位 ${(ms.reduce((x, y) => x + y, 0) * 1e6 / u).toFixed(1)}`);
}
