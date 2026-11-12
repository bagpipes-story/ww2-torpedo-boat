import { renderSfx } from '/home/user/ww2-torpedo-boat/src/assets/sfx-bank';
import { spectrum } from '/home/user/ww2-torpedo-boat/scripts/sfx-files';
const SR = 22050;
function shareAbove(x: Float32Array, hz: number): number { const size = 1024; let hi = 0, all = 0; for (let f = 0; f < x.length; f += size) { const m = spectrum(x, f, Math.min(size, x.length - f), size); for (let i = 1; i < m.length; i++) { const p = m[i]! * m[i]!; all += p; if ((i * SR) / size >= hz) hi += p; } } return hi / all; }
// rate r で鳴らすと高さは × r ＝ 400 Hz より上 ＝ 元の 400/r Hz より上
const cases: [string, number][] = [['alarm', 1], ['alarm', 0.7], ['alarm', 1.3], ['bell', 1], ['bell', 0.7], ['bell', 0.5], ['engine_cough', 1], ['engine_cough', 0.7], ['blast_s', 0.6], ['smoke', 1.6], ['reload', 1.3], ['ui_tap', 0.7], ['torp_launch', 1]];
for (const [k, r] of cases) console.log(`${k} rate ${r}: >400 Hz ${(shareAbove(renderSfx(k as never), 400 / r) * 100).toFixed(0)}%  >2k ${(shareAbove(renderSfx(k as never), 2000 / r) * 100).toFixed(1)}%`);
