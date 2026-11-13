// 混む窓の鍵ごとのエネルギーの割合（リミッタの前・単発だけ）と、ループの束の RMS（×0.5）
import { readFileSync } from 'node:fs';
import { SFX_SAMPLE_RATE as SR, SFX_TABLE, type SfxKey } from '/home/user/ww2-torpedo-boat/src/config/sfx-config';
import { renderSfx } from '/home/user/ww2-torpedo-boat/src/assets/sfx-bank';
import { busiestWindow, type ProbeCase } from '/home/user/ww2-torpedo-boat/scripts/sfx-mixdown';
const data = JSON.parse(readFileSync(process.env.PROBE!, 'utf8')) as { cases: ProbeCase[] };
const pick = process.env.CASES!.split(',');
const energy = new Map<SfxKey, number>();
for (const k of Object.keys(SFX_TABLE) as SfxKey[]) { if (SFX_TABLE[k].loop) continue; const x = renderSfx(k); let s = 0; for (const v of x) s += v * v; energy.set(k, s); }
for (const c of data.cases) {
  if (!pick.includes(c.name)) continue;
  const w = busiestWindow(c, 10); const t0 = c.t0 + w.from / SR, t1 = t0 + 10;
  const e: Record<string, number> = {}; const n: Record<string, number> = {}; let tot = 0;
  for (const r of c.log) { if (r[6] < 0 || r[0] < t0 || r[0] >= t1) continue; const v = energy.get(r[1])! / r[4] * r[8] * r[8]; e[r[1]] = (e[r[1]] ?? 0) + v; n[r[1]] = (n[r[1]] ?? 0) + 1; tot += v; }
  const bandOf: Record<string, number[]> = {};
  for (const r of c.log) { if (r[6] < 0 || r[0] < t0 || r[0] >= t1) continue; (bandOf[r[1]] ??= [0, 0, 0, 0, 0])[r[10] < 0 ? 4 : r[10]]++; }
  console.log(`${c.name.padEnd(13)} @${(w.from / SR).toFixed(0)} ` + Object.entries(e).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / tot).toFixed(0)}%(${n[k]} b${bandOf[k]!.map(String).join('/')})`).join(' '));
}
