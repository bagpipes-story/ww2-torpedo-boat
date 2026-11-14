import { MusicTables, stepNoise, stepTone, type MusicNote } from '/home/user/ww2-torpedo-boat/src/assets/sfx-music-synth';
(window as unknown as { __kern: unknown }).__kern = () => {
  const tb = new MusicTables(); while (!tb.ready) tb.stepTables(1e9);
  const n = 470400, x = new Float32Array(n), st = new Float64Array(8), out: string[] = [];
  const mk = (inst: MusicNote['inst'], len: number, pitch = 0): MusicNote => ({ inst, start: 1000, len, pitch, vel: 1, decayS: 0, noise: 77 });
  const cases: [string, MusicNote, number][] = [['swell', mk('swell', 235200), 2], ['snare', mk('snare', 3675), 2], ['pad', mk('pad', 58800, 64), 1], ['shaker', mk('shaker', 900), 2]];
  for (const [name, nt, kind] of cases) {
    const T = name === 'pad' ? 58800 + 60000 : name === 'swell' ? 290000 : 6000;
    const rounds: number[] = [];
    for (let r = 0; r < 8; r++) { const t = performance.now(); let done = 0; while (done < 300000) { if (kind === 2) stepNoise(x, n, nt, 0, T, st, tb); else stepTone(x, n, nt, 0, T, st, tb, 0, 0); done += T; } rounds.push(((performance.now() - t) * 1e6) / done); }
    out.push(`${name}: ns/sample by round ${rounds.map((v) => v.toFixed(1)).join(' ')}`);
  }
  return out;
};
