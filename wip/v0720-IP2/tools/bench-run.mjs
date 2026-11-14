// ヘッドレスの Chromium で曲を作る費用を測る（v0.7.2 S0 の道具・scratchpad）: SITE=<bench の dir> node bench-run.mjs
// 1 回の stepBuild(予算) の ms（中央値・95%・最大・最初の 5 回）を鍵ごとに。COOP・COEP で performance.now を 5 μs 刻みに（lib.mjs の serve の isolate）。RAMP=<回> で最初の回数だけ予算を上げていく。
import { chromium, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const site = process.env.SITE, ramp = Number(process.env.RAMP ?? 0), budget = Number(process.env.BUDGET ?? 150000), rounds = Number(process.env.ROUNDS ?? 3);
const orders = process.env.ORDERS ? JSON.parse(process.env.ORDERS) : [['title_a', 'mission_l0', 'mission_l1', 'mission_l2'], ['title_b', 'title_c']];
const sv = await serve(site, { isolate: true });
const browser = await chromium.launch();
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
for (const order of orders) for (let r = 0; r < rounds; r++) {
  const ctx = await browser.newContext(); const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(sv.base); await page.waitForFunction(() => window.__bench);
  const res = await page.evaluate(([o, b, rp]) => window.__bench(o, b, rp), [order, budget, ramp]);
  const iso = await page.evaluate(() => crossOriginIsolated);
  const all = res.flatMap((x) => x.ms).sort((a, b) => a - b);
  console.log(`page ${order.join('+')} round ${r + 1} (isolated ${iso}, budget ${budget}${ramp ? `, ramp ${ramp}` : ''}): calls ${all.length}  per-call median ${q(all, 0.5).toFixed(2)} p95 ${q(all, 0.95).toFixed(2)} max ${all[all.length - 1].toFixed(2)} ms  total ${all.reduce((a, b) => a + b, 0).toFixed(0)} ms  errors ${errors.length}`);
  for (const x of res) { if (x.tags) { const top = x.ms.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 4); console.log(`   ${x.key} slowest: ${top.map(([v, i]) => `#${i} ${v.toFixed(1)}ms ${x.tags[i]} ${x.units[i]}u`).join(' | ')}`); } const s = [...x.ms].sort((a, b) => a - b); console.log(`   ${x.key.padEnd(11)} calls ${String(x.ms.length).padStart(3)}  median ${q(s, 0.5).toFixed(2)} p95 ${q(s, 0.95).toFixed(2)} max ${s[s.length - 1].toFixed(2)} ms  first5 ${x.ms.slice(0, 5).map((v) => v.toFixed(1)).join(',')}  compose ${x.composeMs.toFixed(1)} ms  ns/unit(median call) ${((q(s, 0.5) * 1e6) / Math.max(1, x.units[Math.floor(x.units.length / 2)])).toFixed(1)}`); }
  await ctx.close();
}
await browser.close(); await sv.close();
