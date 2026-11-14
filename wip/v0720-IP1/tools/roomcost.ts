// 部屋の響きの 1 標本の費用を、波形表の 1 声の 1 標本（1 単位）と比べる（node・温めてから 5 回の中央値）
import { MUSIC_WORK_SAMPLES } from '@repo/src/config/sfx-music-config';
import { MusicBuilder, composeMusicKey } from '@repo/src/assets/sfx-music-render';
import { MusicTables } from '@repo/src/assets/sfx-music-synth';
const tb = new MusicTables(), work = new Float32Array(MUSIC_WORK_SAMPLES);
while (!tb.ready) tb.stepTables(1e9);
const med = (a: number[]): number => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!;
const time = (sc: ReturnType<typeof composeMusicKey>): { ms: number; units: number } => { const b = new MusicBuilder(tb, work, sc), t = performance.now(); let u = 0; while (!b.done) u += b.stepBuild(150000); return { ms: performance.now() - t, units: u }; };
for (const k of ['title_d', 'title_e'] as const) {
  const sc = composeMusicKey(k), dryS = { ...sc, theme: { ...sc.theme, room: undefined } }, room = sc.theme.room!;
  for (let i = 0; i < 3; i++) { time(sc); time(dryS); }
  const w: number[] = [], d: number[] = [];
  let wu = 0, du = 0;
  for (let i = 0; i < 7; i++) { const a = time(sc), b = time(dryS); w.push(a.ms); d.push(b.ms); wu = a.units; du = b.units; }
  const samples = Math.round(1.5 * room[1] * 22050) + sc.n, roomMs = med(w) - med(d), nsUnit = (med(d) * 1e6) / du;
  console.log(`${k}: 響きあり ${med(w).toFixed(1)} ms・なし ${med(d).toFixed(1)} ms → 響き ${roomMs.toFixed(1)} ms／${samples} 標本 = ${(roomMs * 1e6 / samples).toFixed(1)} ns/標本・なしの曲は ${nsUnit.toFixed(2)} ns/単位 → 響き 1 標本 ≒ ${((roomMs * 1e6 / samples) / nsUnit).toFixed(2)} 単位（今の room 単位で数えた差 ${((wu - du) / 1e6).toFixed(2)}M）`);
}
