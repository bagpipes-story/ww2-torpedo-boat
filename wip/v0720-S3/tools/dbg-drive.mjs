import { chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const sv = await serve(process.env.SITE);
const browser = await chromium.launch();
const { page, ctx, errors } = await openGame(browser, sv.base, 'mission=us_03&seed=1', {});
await page.evaluate(() => { let last = performance.now(); window.__n = 0; setInterval(() => { const n = performance.now(); window.__hl.frame(Math.min(100, n - last)); last = n; window.__n++; }, 1000 / 60); });
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  console.log(await page.evaluate(() => { const st = window.__sfx ? window.__sfx.stats() : null; return JSON.stringify({ n: window.__n, t: window.__hl.t, state: st && st.state, ctxT: window.__game.sound.context && window.__game.sound.context.currentTime, buffers: st && st.buffers, loops: st && st.loops, music: st && { want: st.music.want, sources: st.music.sources, buffers: st.music.buffers, building: st.music.building, progress: st.music.progress } }); }));
}
console.log(errors.slice(0, 3));
await ctx.close(); await browser.close(); await sv.close();
