import { SFX_SAMPLE_RATE as SR, type SfxKey } from '/home/user/ww2-torpedo-boat/src/config/sfx-config';
import { renderSfx } from '/home/user/ww2-torpedo-boat/src/assets/sfx-bank';
import { spectrum } from '/home/user/ww2-torpedo-boat/scripts/sfx-files';
const k = (process.env.KEY ?? 'torp_launch') as SfxKey;
const v = renderSfx(k);
for (const t of (process.env.T ?? '0.02,0.1,0.2,0.3,0.5,0.7').split(',').map(Number)) {
  const size = 2048, from = Math.round(t * SR);
  const m = spectrum(v, from, Math.min(size, v.length - from), size);
  // 帯ごとのエネルギー（dB）と、局所の頂（前後 6 bin の中央値より 8 dB 上）
  const bands = [[0, 400], [400, 1000], [1000, 2500], [2500, 5000], [5000, 11025]];
  const e = bands.map(([a, b]) => { let s = 0; for (let i = 1; i < m.length; i++) { const f = (i * SR) / size; if (f >= a! && f < b!) s += m[i]! * m[i]!; } return 10 * Math.log10(s + 1e-12); });
  const pk: string[] = [];
  for (let i = 8; i < m.length - 8; i++) { const nb = []; for (let j = -8; j <= 8; j++) if (j) nb.push(m[i + j]!); nb.sort((a, b) => a - b); const med = nb[8]!; if (m[i]! > m[i - 1]! && m[i]! >= m[i + 1]! && 20 * Math.log10(m[i]! / med) > 10) pk.push(`${Math.round((i * SR) / size)}`); }
  console.log(`t=${t}s bands(dB) <400 ${e[0]!.toFixed(0)} .4-1k ${e[1]!.toFixed(0)} 1-2.5k ${e[2]!.toFixed(0)} 2.5-5k ${e[3]!.toFixed(0)} 5k+ ${e[4]!.toFixed(0)} | tonal peaks ${pk.slice(0, 12).join(' ')}`);
}
