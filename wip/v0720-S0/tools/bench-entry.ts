// v0.7.2 S0 の道具（scratchpad。ゲームは import しない）: ヘッドレスの Chromium で曲を作る 1 回の stepBuild(予算) の ms を測るページの中身。
import { MUSIC_BUILD_BUDGET, MUSIC_WORK_SAMPLES, type MusicKey } from '/home/user/ww2-torpedo-boat/src/config/sfx-music-config';
import { MusicBuilder, musicScore } from '/home/user/ww2-torpedo-boat/src/assets/sfx-music-render';
import { MusicTables } from '/home/user/ww2-torpedo-boat/src/assets/sfx-music-synth';
(window as unknown as { __bench: unknown }).__bench = (order: MusicKey[], budget = MUSIC_BUILD_BUDGET, ramp = 0) => {
  const out: { key: string; ms: number[]; units: number[]; composeMs: number }[] = [];
  const t0 = performance.now();
  const tables = new MusicTables(), work = new Float32Array(MUSIC_WORK_SAMPLES);
  const tb = { key: 'tables', ms: [] as number[], units: [] as number[], composeMs: performance.now() - t0 };
  let call = 0;
  const b = (): number => (ramp > 0 && call < ramp ? Math.round((budget * (call + 1)) / (ramp + 1)) : budget);
  while (!tables.ready) { const a = performance.now(); tb.units.push(tables.stepTables(b())); tb.ms.push(performance.now() - a); call++; }
  out.push(tb);
  for (const key of order) {
    const c0 = performance.now(), bu = new MusicBuilder(tables, work, musicScore(key)), composeMs = performance.now() - c0;
    const r = { key, ms: [] as number[], units: [] as number[], composeMs, tags: [] as string[] };
    while (!bu.done) { const z = bu as unknown as { stage: number; at: number; score: { notes: { inst: string }[] } }; r.tags.push(`${z.stage}:${z.stage === 1 ? z.score.notes[z.at]!.inst + '#' + z.at : ''}`); const a = performance.now(); r.units.push(bu.stepBuild(b())); r.ms.push(performance.now() - a); call++; }
    const x = bu.result(); let p = 0; for (let i = 0; i < x.length; i++) p = Math.max(p, Math.abs(x[i]!));
    out.push(r);
  }
  return out;
};
