// 実機 1 回目の調べ: 見つかってから北の岸（または南）へ寄って止まり、5 秒ごとに写す。艦の位置・モード・見えるかを並べる
import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const srv = await serve(process.env.SITE); const browser = await chromium.launch();
const seed = process.env.SEED ?? 1; const side = process.env.SIDE ?? 'north';
const { page, ctx, errors } = await openGame(browser, srv.base, `mission=us_04&seed=${seed}`, { width: 1560, dpr: 1 });
const out = process.env.OUT;
const step = (o) => { const hl = window.__hl; let st = window.__ss ??= { phase: 'hunt' };
  for (let k = 0; k < o.n; k++) { if (!hl.active('Mission')) return { ended: true };
    const w = hl.world(); const B = w.boat.state; const H = w.setup.mission.bounds.height; const ships = w.destroyers.ships;
    if (st.phase === 'hunt') { const d = ships[0]; hl.steer(hl.bearing(B.x, B.y, d.state.x, d.state.y), 1); if (ships.some((s) => !s.out && s.ai.playerDetected)) st.phase = 'run'; }
    else if (st.phase === 'run') { const ty = o.side === 'north' ? 60 : H - 60; hl.steer(o.side === 'north' ? 0 : 180, 1); if (Math.abs(B.y - ty) < 80) st.phase = 'hide'; }
    else hl.steer(NaN, 0);
    hl.frame(o.ms); }
  const w = hl.world(); return { t: +w.stepTimeS.toFixed(0), phase: st.phase, boat: [Math.round(w.boat.state.x), Math.round(w.boat.state.y)], ships: w.destroyers.ships.map((s) => `${Math.round(s.state.x)},${Math.round(s.state.y)} ${s.ai.mode}${s.out ? ' out' : s.sprite.visible ? ' vis' : ''}`) }; };
for (let i = 0; i < 16; i++) {
  const r = await page.evaluate(step, { n: 300, ms: FRAME_MS, side });
  if (r.ended) break;
  await page.evaluate(() => window.__hl.render());
  await page.screenshot({ path: `${out}/shore-${side}-${r.t}.png` });
  console.log(JSON.stringify(r));
}
console.log('errors', errors.length); await ctx.close(); await browser.close(); await srv.close();
