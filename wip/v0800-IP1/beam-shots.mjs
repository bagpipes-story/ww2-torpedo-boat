// 実機 1 回目の確かめ: 見つかってから南の岸へ寄って止まり、探照灯が点いている時を写す（A と B の site を同じ台本で）
import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const browser = await chromium.launch();
const step = (o) => { const hl = window.__hl; const st = window.__bs ??= { phase: 'park', litFrames: 0 };
  for (let k = 0; k < o.n; k++) { if (!hl.active('Mission')) return { ended: true };
    const w = hl.world(); const B = w.boat.state; const H = w.setup.mission.bounds.height; const ships = w.destroyers.ships;
    if (st.phase === 'park') { const dx = 5000 - B.x, dy = 3300 - B.y; if (dx * dx + dy * dy > 100 * 100) hl.steer(hl.bearing(B.x, B.y, 5000, 3300), 0.3); else hl.steer(NaN, 0); if (ships.some((s) => s.transitShip && !s.out && s.state.y > 1900)) st.phase = 'hunt'; }
    else if (st.phase === 'hunt') { const ret = ships.find((s) => s.transitShip && !s.out && s.state.y > 1900); if (!ret) hl.steer(NaN, 0); else { hl.steer(hl.bearing(B.x, B.y, ret.state.x, ret.state.y), 1); if (ret.ai.playerDetected) st.phase = 'run'; } }
    else if (st.phase === 'run') { hl.steer(170, 1); if (B.y > H - 120) st.phase = 'hide'; }
    else hl.steer(NaN, 0);
    hl.frame(o.ms);
    const lit = w.destroyers.fires.filter((f, i) => !ships[i].out && f.state.light.on && ships[i].state.y > 1900).length;
    if (B.y > 3600 && lit > 0) { st.litFrames++; if (st.litFrames > 5) return { lit, t: w.stepTimeS, boat: [Math.round(B.x), Math.round(B.y)], ships: ships.map((s) => [Math.round(s.state.x), Math.round(s.state.y)]) }; }
  }
  return { cont: true }; };
for (const [tag, site] of [['A', process.env.A], ['B', process.env.B]]) {
  const srv = await serve(site);
  const { page, ctx, errors } = await openGame(browser, srv.base, `mission=us_04&seed=${process.env.SEED ?? 2}&noplane`, { width: 1560, dpr: 1 });
  let r; let guard = 0; do { r = await page.evaluate(step, { n: 120, ms: FRAME_MS }); } while (r.cont && ++guard < 400);
  await page.evaluate(() => { for (let i = 0; i < 70; i++) window.__hl.render(); });
  await page.screenshot({ path: `${process.env.OUT}/beam-${tag}.png` });
  console.log(tag, JSON.stringify(r), 'errors', errors.length);
  await ctx.close(); await srv.close();
}
await browser.close();
