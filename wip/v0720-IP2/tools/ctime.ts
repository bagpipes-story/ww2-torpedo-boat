// 作曲（1 回目＝冷えた JIT と温まった後）の時間（node・scratchpad の道具）
import { composeMusicKey } from '@repo/src/assets/sfx-music-render';
import { composePlanMelody } from '@repo/src/assets/sfx-music-plan';
import { MUSIC_THEMES, musicRng } from '@repo/src/assets/sfx-music-themes';
import { sixteenthOf } from '@repo/src/assets/sfx-music-compose';
const t0 = performance.now(); composeMusicKey('title_d'); const t1 = performance.now();
const xs: number[] = []; for (let i = 0; i < 20; i++) { const a = performance.now(); composeMusicKey('title_d'); xs.push(performance.now() - a); }
xs.sort((a, b) => a - b);
const th = MUSIC_THEMES.title_d, ps: number[] = [];
for (let i = 0; i < 20; i++) { const a = performance.now(); composePlanMelody(th, th.melody!, th.melody!.plan!, musicRng('title_d'), sixteenthOf(th.bpm)); ps.push(performance.now() - a); }
ps.sort((a, b) => a - b);
const p0 = performance.now(); composeMusicKey('title_d_prev'); const p1 = performance.now();
console.log(`title_d compose: first ${(t1 - t0).toFixed(1)} ms, warm median ${xs[10]!.toFixed(2)} ms; melody only warm median ${ps[10]!.toFixed(2)} ms; title_d_prev first ${(p1 - p0).toFixed(1)} ms`);
