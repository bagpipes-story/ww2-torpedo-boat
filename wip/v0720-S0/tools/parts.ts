// 層の中の楽器ごとの寄与（頂・RMS・>400 Hz）。scratchpad の道具
import { MUSIC_KEYS, MUSIC_WORK_SAMPLES, type MusicKey } from '/home/user/ww2-torpedo-boat/src/config/sfx-music-config';
import { MusicBuilder, composeMusicKey } from '/home/user/ww2-torpedo-boat/src/assets/sfx-music-render';
import { MusicTables } from '/home/user/ww2-torpedo-boat/src/assets/sfx-music-synth';
import { bandShares } from '/home/user/ww2-torpedo-boat/scripts/sfx-music';
const tables = new MusicTables(), work = new Float32Array(MUSIC_WORK_SAMPLES);
const keys = (process.env.KEYS ?? MUSIC_KEYS.join(',')).split(',') as MusicKey[];
for (const key of keys) {
  const sc = composeMusicKey(key), insts = [...new Set(sc.notes.map((x) => x.inst))];
  const full = new MusicBuilder(tables, work, sc); while (!full.done) full.stepBuild(1e12);
  const all = full.result().slice();
  // 仕上げの前の大きさで比べたいので、楽器ごとに同じ仕上げ（全体の倍率）を使う: 全体の raw の頂を知るために raw を作る
  const raw = (notes: typeof sc.notes): Float32Array => { const b = new MusicBuilder(tables, work, { ...sc, notes }) as any; while (b.stage < 5 || (b.stage === 5 && b.sub === 0 && b.stage !== 7)) { if (b.stage >= 5) break; b.stepBuild(1e12); if (b.stage >= 5) break; } return work.slice(0, sc.n); };
  const r0 = raw(sc.notes); let p0 = 0, s0 = 0; for (const v of r0) { p0 = Math.max(p0, Math.abs(v)); s0 += v * v; }
  console.log(`${key}: raw peak ${p0.toFixed(3)} rms ${Math.sqrt(s0 / r0.length).toFixed(4)}  final >400 ${(bandShares(all)[0] * 100).toFixed(0)}%`);
  for (const inst of insts) {
    const x = raw(sc.notes.filter((n) => n.inst === inst)); let p = 0, s = 0; for (const v of x) { p = Math.max(p, Math.abs(v)); s += v * v; }
    const [hi, lo] = bandShares(x);
    console.log(`   ${inst.padEnd(8)} peak ${(p / p0).toFixed(3)} of full  rms ${(20 * Math.log10(Math.sqrt(s / x.length) / Math.sqrt(s0 / r0.length))).toFixed(1)} dB re full  >400 ${(hi * 100).toFixed(0)}%  <200 ${(lo * 100).toFixed(0)}%`);
  }
}
