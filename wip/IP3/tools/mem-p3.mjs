// dpr 3（852×393 CSS）で任務を開き、テクスチャの GPU の MB（幅×高さ×4・tex-debug-ring を除く）・一番大きいテクスチャ・canvas の大きさ・RENDER_SCALE。SITES=a,b MISSIONS=... node mem-p3.mjs
import { chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const sites = process.env.SITES.split(',');
const missions = (process.env.MISSIONS ?? 'us_01,us_02,us_03,jp_01&hard,jp_03&hard,jp_04&hard').split(',');
const browser = await chromium.launch();
for (const site of sites) {
  const s = await serve(site);
  for (const m of missions) {
    const { page, ctx, errors } = await openGame(browser, s.base, `mission=${m}&seed=1`, { width: 1560, viewport: { width: Number(process.env.VW ?? 852), height: Number(process.env.VH ?? 393) }, dpr: Number(process.env.DPR ?? 3) });
    const r = await page.evaluate(() => {
      const g = window.__game; let gpu = 0; let big = ['', 0, 0];
      for (const key of g.textures.getTextureKeys()) { if (key.startsWith('__') || key === 'tex-debug-ring') continue; const src = g.textures.get(key).source[0]; gpu += src.width * src.height * 4; if (Math.max(src.width, src.height) > Math.max(big[1], big[2])) big = [key, src.width, src.height]; }
      return { gpu: gpu / 1048576, big, canvas: [g.canvas.width, g.canvas.height], k: g.scene.getScene('Hud').cameras.main.zoom, heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : NaN };
    });
    console.log(site.split('/').pop(), m, `GPU ${r.gpu.toFixed(2)} MB`, `canvas ${r.canvas.join('x')} (${((r.canvas[0] * r.canvas[1] * 4 * 2) / 1048576).toFixed(1)} MB の前後 2 面)`, `k ${r.k.toFixed(3)}`, `最大 ${r.big.join(' ')}`, `heap ${r.heap.toFixed(1)} MB`, `errors ${errors.length}`);
    await ctx.close();
  }
  await s.close();
}
await browser.close();
