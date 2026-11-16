import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const browser = await chromium.launch(); const srv = await serve(process.env.A);
for (const first of ['nan', 'move']) {
  const { page, ctx } = await openGame(browser, srv.base, `mission=us_04&seed=2&noplane`, { width: 1560, dpr: 1 });
  const r = await page.evaluate((o) => { const hl = window.__hl; const out = [];
    for (let k = 0; k < 1200; k++) { const w = hl.world(); if (o.first === 'nan' && k < 300) hl.steer(NaN, 0); else hl.steer(170, 1); hl.frame(o.ms); if (k % 300 === 299) out.push([Math.round(w.boat.state.x), Math.round(w.boat.state.y), +w.boat.state.speedMps.toFixed(1), w.input.stickActive, w.input.speed01]); }
    return out; }, { ms: FRAME_MS, first });
  console.log(first, JSON.stringify(r)); await ctx.close();
}
await srv.close(); await browser.close();
