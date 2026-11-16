// 実機 1 回目の調べ: 東の端（ビラへ消える所・戻りで現れる所）の画面写し。自艇を東へ寄せて止め、列の艦が東の縁に来た時と戻って現れた時を写す
import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const srv = await serve(process.env.SITE); const browser = await chromium.launch();
const { page, ctx, errors } = await openGame(browser, srv.base, `mission=us_04&seed=${process.env.SEED ?? 1}`, { width: 1560, dpr: 1 });
const out = process.env.OUT;
const step = (o) => { const hl = window.__hl; for (let k = 0; k < o.n; k++) { if (!hl.active('Mission')) return { ended: true };
  const w = hl.world(); const B = w.boat.state; const tx = o.tx, ty = o.ty; const d = Math.hypot(tx - B.x, ty - B.y);
  hl.steer(d > 60 ? hl.bearing(B.x, B.y, tx, ty) : NaN, d > 60 ? 0.35 : 0); hl.frame(o.ms); }
  const w = hl.world(); return { t: w.stepTimeS, boat: [Math.round(w.boat.state.x), Math.round(w.boat.state.y)], ships: w.destroyers.ships.map((s) => [Math.round(s.state.x), Math.round(s.state.y), s.out ? 'out' : s.sprite.visible ? 'vis' : 'hid']) }; };
const marks = [60, 75, 90, 110, 125, 140, 155];
let last = null;
for (const m of marks) {
  let r; do { r = await page.evaluate(step, { n: 60, ms: FRAME_MS, tx: 5500, ty: 1900 }); } while (!r.ended && r.t < m);
  await page.evaluate(() => window.__hl.render());
  await page.screenshot({ path: `${out}/east-${m}.png` });
  console.log(m, JSON.stringify(r));
}
console.log('errors', errors.length); await ctx.close(); await browser.close(); await srv.close();
