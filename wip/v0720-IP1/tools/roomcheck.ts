// 部屋の響きの効き: room あり／なし（同じ楽譜）で、響きの RMS ÷ 元の RMS・谷・継ぎ目の差・作る費用
import { MUSIC_BUILD_BUDGET, MUSIC_SAMPLE_RATE, MUSIC_WORK_SAMPLES } from '@repo/src/config/sfx-music-config';
import { MusicBuilder, composeMusicKey } from '@repo/src/assets/sfx-music-render';
import { MusicTables } from '@repo/src/assets/sfx-music-synth';
const SR = MUSIC_SAMPLE_RATE, tb = new MusicTables(), work = new Float32Array(MUSIC_WORK_SAMPLES);
while (!tb.ready) tb.stepTables(1e9);
const build = (sc: ReturnType<typeof composeMusicKey>): { x: Float32Array; ms: number; units: number } => { const b = new MusicBuilder(tb, work, sc), t = performance.now(); let u = 0; while (!b.done) u += b.stepBuild(MUSIC_BUILD_BUDGET); return { x: b.result().slice(), ms: performance.now() - t, units: u }; };
const rms = (x: Float32Array): number => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);
const db = (v: number): number => 20 * Math.log10(v);
function valley(x: Float32Array): number { const w = Math.round(0.02 * SR), lv: number[] = []; for (let f = 0; f + w <= x.length; f += w) { let s = 0; for (let i = f; i < f + w; i++) s += x[i]! ** 2; lv.push(10 * Math.log10(s / w + 1e-30)); } lv.sort((a, b) => a - b); return lv[Math.floor(lv.length * 0.1)]! - db(rms(x)); }
for (const k of ['title_d', 'title_e'] as const) {
  const sc = composeMusicKey(k), dry = build({ ...sc, theme: { ...sc.theme, room: undefined } }), wet = build(sc);
  // 同じ頂にそろえた 2 本の差＝響き（おおよそ）
  const g = rms(wet.x) / rms(dry.x), diff = wet.x.map((v, i) => v - dry.x[i]! * g);
  console.log(`${k}: 響き ÷ 元 ${db(rms(diff) / rms(dry.x)).toFixed(1)} dB  谷 なし ${valley(dry.x).toFixed(1)} → あり ${valley(wet.x).toFixed(1)} dB  継ぎ目の差 ${Math.abs(wet.x[0]! - wet.x[wet.x.length - 1]!).toFixed(4)}  作る ${(dry.units / 1e6).toFixed(2)} → ${(wet.units / 1e6).toFixed(2)}M 単位・${dry.ms.toFixed(0)} → ${wet.ms.toFixed(0)} ms`);
}
