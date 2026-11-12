// 艦のテクスチャの canvas を 4 倍（最近傍）の PNG に（見る用）。SITE=<site> OUT=<dir> [MISSION=jp_06&seed=1] [KEYS=tex-destroyer,tex-transport] [SCALE=4] node tex-dump.mjs
import { writeFileSync } from 'node:fs';
import { chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const s = await serve(process.env.SITE);
const browser = await chromium.launch();
const keys = (process.env.KEYS ?? 'tex-destroyer,tex-destroyer-us,tex-destroyer-friendly,tex-transport,tex-transport-friendly,tex-barge,tex-barge-friendly,tex-pt-boat,tex-torpedo,tex-boat-us_elco80').split(',');
const scale = Number(process.env.SCALE ?? 4);
for (const q of (process.env.MISSION ?? 'mission=jp_06&seed=1').split(',')) {
  const { page, ctx, errors } = await openGame(browser, s.base, q, { width: 1560, dpr: Number(process.env.DPR ?? 2), viewport: process.env.VP ? { width: Number(process.env.VP.split('x')[0]), height: Number(process.env.VP.split('x')[1]) } : undefined });
  const out = await page.evaluate(([keys, scale]) => {
    const g = window.__game; const r = {};
    for (const key of keys) {
      if (!g.textures.exists(key)) continue;
      const img = g.textures.get(key).source[0].image;
      const c = document.createElement('canvas'); c.width = img.width * scale; c.height = img.height * scale;
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.fillStyle = '#0b1020'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
      r[key] = { w: img.width, h: img.height, png: c.toDataURL('image/png') };
    }
    return r;
  }, [keys, scale]);
  for (const [k, v] of Object.entries(out)) { writeFileSync(`${process.env.OUT}/${k}.png`, Buffer.from(v.png.split(',')[1], 'base64')); console.log(k, v.w, v.h); }
  console.log(q, 'errors', errors.length);
  await ctx.close();
}
await browser.close(); (s.close ? s.close() : s.server.close());
