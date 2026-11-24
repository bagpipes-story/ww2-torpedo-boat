// us_07 の地図の幾何の見積もり（v0.8.5 S3b。ゲームは import しない）: node us07-geo.mjs [variant.json]
// 今の data（variant を当てた後の値）から: 丁寧な道の長さ・出発の真西の線と帰投の輪・砲台の射界・S ボートの線・区画と水路の余白・
// 真っ直ぐ（出発 → コリー）と近道（フィッチ ↔ 群）の触雷の見込み（区画の一様 ＋ 置けない所を捨てる。帯は半幅 + contact 6）を出す。
import { readFileSync } from 'node:fs';
const D = '/home/user/ww2-torpedo-boat/data/';
const ms = JSON.parse(readFileSync(D + 'missions_seed.json', 'utf8'));
const p = structuredClone(ms.missions.find((m) => m.id === 'us_07').v0_1_prototype);
if (process.argv[2]) {
  const v = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  for (const [path, val] of Object.entries(v)) { if (path.startsWith('//')) continue; const ks = path.split('.'); let o = p; for (const k of ks.slice(0, -1)) o = o[k]; o[ks.at(-1)] = val; }
}
const H = p.bounds_m.height;
const S = [p.player_start.x_m, p.player_start.y_m];
const R = [p.return_point.x_m, p.return_point.y_m, p.return_point.radius_m];
const F = [p.rescue.ships.fitch.x_m, p.rescue.ships.fitch.y_m, p.rescue.ships.fitch.ring_m];
const C = [p.rescue.ships.corry.x_m, p.rescue.ships.corry.y_m];
const G = p.rescue.groups;
const lanes = p.minefield.lanes;
const fields = p.minefield.fields;
const clear = p.minefield.clear_m;
const eff = p.shore_battery.params.gun.effective_night_m;
const bats = [p.shore_battery.x_m, ...(p.hard?.extra_shore_battery_x_m ?? [])].map((x) => [x, H + p.shore_battery.params.inland_m]);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segD(px, py, ax, ay, bx, by) { const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy; let t = l2 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(ax + vx * t - px, ay + vy * t - py); }
const f0 = (x) => Math.round(x);
// 道: 出発 → 水路の鎖（出発の水路の端 → フィッチ → フィッチから先の鎖）
const eq = (a, b) => Math.abs(a[0] - b[0]) < 1 && Math.abs(a[1] - b[1]) < 1;
const chain = []; let cur = [F[0], F[1]];
for (let g = 0; g < 8; g++) { const l = lanes.find((q) => eq([q[0], q[1]], cur)); if (!l) break; cur = [l[2], l[3]]; chain.push(cur); }
const lenPoly = (pts) => pts.slice(1).reduce((a, q, i) => a + dist(pts[i], q), 0);
const toF = lenPoly([S, [F[0], F[1]]]);
const fc = lenPoly([[F[0], F[1]], ...chain]);
const gc = G.reduce((a, g) => a + g[0], 0) / G.length, gcy = G.reduce((a, g) => a + g[1], 0) / G.length;
const endToG = dist(chain.at(-1) ?? C, [gc, gcy]);
console.log(`出発 (${S}) 帰投の輪 (${R}) フィッチ (${F}) コリー (${C}) 水路の鎖 ${JSON.stringify(chain)}`);
console.log(`丁寧な道の見込み: 出発→フィッチ ${f0(toF)}・フィッチ→鎖の端 ${f0(fc)}（真っ直ぐ ${f0(dist([F[0], F[1]], chain.at(-1) ?? C))}）・端→群の中心 ${f0(endToG)}・フィッチ→帰投 ${f0(dist(F, R))}・計 ${f0(toF + 4 * (fc + endToG) + dist(F, R))}`);
console.log(`出発の真西の線（y ${S[1]}）から帰投の輪の縁: ${f0(Math.abs(S[1] - R[1]) - R[2])} m・出発 → 帰投の輪の中心 ${f0(dist(S, R))}`);
console.log(`出発 → フィッチの道から帰投の輪の縁: ${f0(segD(R[0], R[1], S[0], S[1], F[0], F[1]) - R[2])}・出発 → コリーの直線から: ${f0(segD(R[0], R[1], S[0], S[1], C[0], C[1]) - R[2])}・フィッチ→コリー: ${f0(segD(R[0], R[1], F[0], F[1], C[0], C[1]) - R[2])}`);
for (const b of bats) console.log(`砲台 (${b}): 帰投の輪の縁まで ${f0(dist(b, R) - R[2])}（射界 ${eff}）・フィッチの輪の縁 ${f0(dist(b, F) - F[2])}・コリー ${f0(dist(b, C))}`);
const legs = [...p.pt_boats.legs_m, ...(p.hard?.extra_pt_legs_m ?? [])];
const sj = Math.hypot(p.night.enemy_jitter.x_m, p.night.enemy_jitter.y_m);
for (const [i, l] of legs.entries()) console.log(`S ボートの線 ${i}: 帰投の輪の縁から ${f0(segD(R[0], R[1], ...l) - R[2] - sj)}・フィッチの輪の縁から ${f0(segD(F[0], F[1], ...l) - F[2] - sj)}（cover ${p.rescue.ships.fitch.cover_m}）・出発から線の始め ${f0(dist(S, [l[0] + p.night.enemy_jitter.x_m, l[1]]))}`);
console.log(`フィッチ ↔ 帰投の輪の間 ${f0(dist(F, R) - F[2] - R[2])}（V-Q4 > 0）`);
// 区画: 置ける割合（格子 20 m）と触雷の見込み
const keepC = [[S[0], S[1], 0], R, F, [C[0], C[1], 0], ...G.map((g) => [g[0], g[1], p.rescue.group_jitter_m * 1.4142])];
const shal = p.shallows.map((s) => [s.x_m, s.y_m, s.width_m, s.height_m]);
function placeable(x, y) {
  for (const l of lanes) if (segD(x, y, l[0], l[1], l[2], l[3]) <= l[4] / 2 + clear) return false;
  for (const k of keepC) if (Math.hypot(x - k[0], y - k[1]) <= k[2] + clear) return false;
  for (const q of shal) if (x >= q[0] - clear && x <= q[0] + q[2] + clear && y >= q[1] - clear && y <= q[1] + q[3] + clear) return false;
  return true;
}
let expN = 0, expH = 0;
for (const [i, f] of fields.entries()) {
  let a = 0, ok = 0;
  for (let y = f[1] + 10; y < f[1] + f[3]; y += 20) for (let x = f[0] + 10; x < f[0] + f[2]; x += 20) { a++; if (placeable(x, y)) ok++; }
  expN += (ok / a) * f[4]; expH += (ok / a) * (f[4] + f[5]);
  console.log(`区画 ${i} [${f}] 置ける ${(100 * ok / a).toFixed(0)}%`);
}
const nN = fields.reduce((a, f) => a + f[4], 0);
console.log(`置ける見込み ノーマル ${expN.toFixed(1)}／${nN}（${(100 * expN / nN).toFixed(0)}%・V-X2 は 80% 以上）・ハード ${expH.toFixed(1)}`);
// 触雷の見込み（モンテカルロ。乱数は Math.random＝見積もりだけ）
const band = 6.1 / 2 + 6;
const nearestG = (pt) => G.reduce((b, g) => (dist(pt, g) < dist(pt, b) ? g : b), G[0]);
const paths = {
  straight: [[S, [C[0] + (S[0] - C[0]) * 200 / dist(S, C), C[1] + (S[1] - C[1]) * 200 / dist(S, C)]]],
  'direct(出発→群)': [[S, nearestG(S)]],
  'direct(フィッチ↔群 1 回)': [[[F[0], F[1]], nearestG(F)]],
  'careful(水路)': [[S, [F[0], F[1]]], ...[[F[0], F[1]], ...chain].slice(1).map((q, i, a) => [i ? a[i - 1] : [F[0], F[1]], q]), [[F[0], F[1]], [R[0], R[1]]]],
};
const N = 4000;
for (const hard of [0, 1]) {
  const res = {};
  for (const k of Object.keys(paths)) res[k] = 0;
  for (let n = 0; n < N; n++) {
    const mines = [];
    for (const f of fields) for (let j = 0; j < f[4] + (hard ? f[5] : 0); j++) { const x = f[0] + Math.random() * f[2], y = f[1] + Math.random() * f[3]; if (placeable(x, y)) mines.push([x, y]); }
    for (const [k, segs] of Object.entries(paths)) if (mines.some((m) => segs.some((s) => segD(m[0], m[1], s[0][0], s[0][1], s[1][0], s[1][1]) <= band))) res[k]++;
  }
  console.log(`${hard ? 'ハード' : 'ノーマル'} 触雷の見込み（1 個以上）: ${Object.entries(res).map(([k, v]) => `${k} ${(100 * v / N).toFixed(0)}%`).join('・')}`);
}
