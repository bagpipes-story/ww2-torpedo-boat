// 区画の置けない格子（20 m）の場所: node us07-fieldfit.mjs [variant.json]
import { readFileSync } from 'node:fs';
const ms = JSON.parse(readFileSync('/home/user/ww2-torpedo-boat/data/missions_seed.json', 'utf8'));
const p = structuredClone(ms.missions.find((m) => m.id === 'us_07').v0_1_prototype);
if (process.argv[2]) { const v = JSON.parse(readFileSync(process.argv[2], 'utf8')); for (const [path, val] of Object.entries(v)) { if (path.startsWith('//')) continue; const ks = path.split('.'); let o = p; for (const k of ks.slice(0, -1)) o = o[k]; o[ks.at(-1)] = val; } }
function segD(px, py, ax, ay, bx, by) { const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy; let t = l2 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(ax + vx * t - px, ay + vy * t - py); }
const c = p.minefield.clear_m, j = p.rescue.group_jitter_m * Math.SQRT2;
const keep = [[p.player_start.x_m, p.player_start.y_m, 0, 'start'], [p.return_point.x_m, p.return_point.y_m, p.return_point.radius_m, 'ring'], [p.rescue.ships.fitch.x_m, p.rescue.ships.fitch.y_m, p.rescue.ships.fitch.ring_m, 'fitch'], [p.rescue.ships.corry.x_m, p.rescue.ships.corry.y_m, 0, 'corry'], ...p.rescue.groups.map((g, i) => [g[0], g[1], j, 'g' + i])];
const why = (x, y) => { for (const [i, l] of p.minefield.lanes.entries()) if (segD(x, y, l[0], l[1], l[2], l[3]) <= l[4] / 2 + c) return 'lane' + i; for (const k of keep) if (Math.hypot(x - k[0], y - k[1]) <= k[2] + c) return k[3]; return null; };
for (const [i, f] of p.minefield.fields.entries()) {
  const bad = {};
  let n = 0, a = 0;
  for (let y = f[1] + 10; y < f[1] + f[3]; y += 20) for (let x = f[0] + 10; x < f[0] + f[2]; x += 20) { a++; const w = why(x, y); if (w) { n++; const b = (bad[w] ??= [1e9, 1e9, -1e9, -1e9]); b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } }
  console.log(`区画 ${i} [${f}] 置ける ${(100 * (1 - n / a)).toFixed(1)}%`, JSON.stringify(bad));
}
