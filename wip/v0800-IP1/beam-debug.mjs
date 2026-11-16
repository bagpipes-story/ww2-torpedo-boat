import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const browser = await chromium.launch(); const srv = await serve(process.env.A);
const { page, ctx } = await openGame(browser, srv.base, `mission=us_04&seed=2&noplane`, { width: 1560, dpr: 1 });
for (let i = 0; i < 30; i++) {
  const r = await page.evaluate((o) => { const hl = window.__hl; const st = window.__bd ??= { phase: 'hunt' };
    for (let k = 0; k < 600; k++) { if (!hl.active('Mission')) return { ended: window.__game.scene.getScene('Result').result?.reason };
      const w = hl.world(); const B = w.boat.state; const ships = w.destroyers.ships;
      if (st.phase === 'hunt') { const ret = ships.find((s) => s.transitShip && !s.out && s.state.y > 1900); if (!ret) hl.steer(NaN, 0); else { hl.steer(hl.bearing(B.x, B.y, ret.state.x, ret.state.y), 1); if (ships.some((s) => !s.out && s.ai.playerDetected)) st.phase = 'run'; } }
      else if (st.phase === 'run') { hl.steer(170, 1); if (B.y > 3880) st.phase = 'hide'; } else hl.steer(NaN, 0);
      hl.frame(o.ms); }
    const w = hl.world(); return { t: Math.round(w.stepTimeS), phase: st.phase, boat: [Math.round(w.boat.state.x), Math.round(w.boat.state.y)], hp: Math.round(w.boat.hp ?? -1), ships: w.destroyers.ships.map((s, i) => `${Math.round(s.state.x)},${Math.round(s.state.y)}${s.out ? 'o' : ''}${s.ai.playerDetected ? 'D' : ''}${w.destroyers.fires[i].state.light.on ? 'L' : ''}`).join(' ') }; }, { ms: FRAME_MS });
  console.log(JSON.stringify(r)); if (r.ended) break;
}
await ctx.close(); await srv.close(); await browser.close();
