// spec-review-r2 の玩具の Monte Carlo（レビューの根拠だけ。repo には入れない）。node spec-review-r2-mc.mjs
// 1 編隊（2・3・3・4 機 = 4・6・6・8 発）が 1 つの隊（3 隻）から沈める隻数の期待値。data の値: T-38 半長 9 m・半幅 2.15 m（hit_scale 1）、
// 爆風 25 m（命中の半径 = 半幅 + 爆風 = 27.15 m）、散布 = CEP 32 m × √2 の一様円盤（core/air-strike-data.ts L201・air-strike.ts L88-89）。
// 見越しは直進なら当たる（air-strike.ts L83 predictBoat）ので「止まった艇」と「直進の艇」は同じ。HP 60・1 発 35 → 2 発で沈む（火災 24 では沈まない）。
// 回避（ai.dodge.success）が当たった投下は、隊長艇が 90° 切って約 72 m ずれる（130°/実秒・51 m/実秒・落下 1.28 実秒の概算）。僚艇は直進のまま（巻き添えの上限側）。
// cancel = 中心の隊長艇が沈んだら残りを落とさない（spec r2 §3.7 = 凍結の core の中断）、repoint = 次の隊長艇へ付け替えて落とし続ける（レビュー H2 の案）。
let s = 12345;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const HL = 9, HR = 2.15 + 25, SC = 32 * Math.SQRT2;
function near(px, py, bx, by) { // 北向きのカプセル（core/shells.ts pointNearBoat と同じ式）
  const ay = by + HL, aby = -2 * HL; const apx = px - bx, apy = py - ay; let t = (apy * aby) / (aby * aby); t = t < 0 ? 0 : t > 1 ? 1 : t; const ex = apx, ey = apy - aby * t; return ex * ex + ey * ey <= HR * HR;
}
const L = { moored: [[0, 0], [0, 12], [0, 24]], hauling: [[0, 0], [25, 0], [-25, 0]], underway: [[0, 0], [0, 40], [0, 80]] };
function flight(bombs, lay, dodgeP, repoint) {
  const hp = [2, 2, 2]; let lead = 0;
  for (let b = 0; b < bombs; b++) {
    while (lead < 3 && hp[lead] <= 0) lead++; if (lead >= 3) break;
    const base = lay[lead]; const r = SC * Math.sqrt(rnd()), th = 2 * Math.PI * rnd();
    const ix = base[0] + r * Math.cos(th), iy = base[1] + r * Math.sin(th);
    const dodge = lay === L.underway && rnd() < dodgeP;
    for (let k = 0; k < 3; k++) { if (hp[k] <= 0) continue; let bx = lay[k][0], by = lay[k][1]; if (dodge && k === lead) { bx = base[0] + 58; by = base[1] + 43; } if (near(ix, iy, bx, by)) hp[k]--; }
    if (hp[lead] <= 0 && !repoint) break;
  }
  return hp.filter((h) => h <= 0).length;
}
const N = 200000;
let h = 0; for (let i = 0; i < N; i++) { const r = SC * Math.sqrt(rnd()), th = 2 * Math.PI * rnd(); if (near(r * Math.cos(th), r * Math.sin(th), 0, 0)) h++; }
console.log('1 発の命中（止まった艇・直進の艇）', (h / N).toFixed(3));
for (const [name, lay, d] of [['停泊（間隔 12 m）', L.moored, 0], ['上げている（止まって ±25 m）', L.hauling, 0], ['走る・回避なし（間隔 40 m）', L.underway, 0], ['走る・回避 50%', L.underway, 0.5]]) {
  const row = []; for (const bombs of [4, 6, 8]) { let c = 0, p = 0; for (let i = 0; i < N; i++) c += flight(bombs, lay, d, false); for (let i = 0; i < N; i++) p += flight(bombs, lay, d, true); row.push(`${bombs} 発: 去る ${(c / N).toFixed(2)} / 追う ${(p / N).toFixed(2)}`); }
  console.log(name.padEnd(18), row.join(' | '));
}
