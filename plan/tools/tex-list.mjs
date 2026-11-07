// テクスチャの一覧（鍵・幅・高さ・px）と GPU の推定（幅×高さ×4 B）を任務ごとに。RENDER_SCALE も。
// 実行: SITE=<site> [W=1560] [DPR=2] [MISSIONS=us_01,...] node tex-list.mjs
import { chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';

const site = process.env.SITE;
const width = Number(process.env.W ?? 1560);
const dpr = Number(process.env.DPR ?? 2);
const missions = (process.env.MISSIONS ?? 'us_01,us_02,us_03,jp_01,jp_02,jp_03,jp_04,jp_05,jp_06').split(',');
const sv = await serve(site);
const browser = await chromium.launch();
const all = {};
for (const m of missions) {
  const { page, ctx } = await openGame(browser, sv.base, `mission=${m}&seed=1`, { width, dpr });
  for (let i = 0; i < 5; i++) await page.evaluate(() => window.__hl.render());
  const r = await page.evaluate(() => {
    const g = window.__game;
    const out = [];
    for (const key of g.textures.getTextureKeys()) {
      const t = g.textures.get(key);
      const src = t.source[0];
      out.push([key, src.width, src.height]);
    }
    const ms = g.scene.getScene('Mission');
    return { tex: out, scale: g.canvas.width / g.scale.gameSize.width, canvas: [g.canvas.width, g.canvas.height], children: ms.children.list.length };
  });
  all[m] = r;
  await ctx.close();
}
await browser.close();
await sv.close();
const keys = new Map();
for (const m of missions) for (const [k, w, h] of all[m].tex) keys.set(k, [w, h, (keys.get(k)?.[2] ?? []).concat(m)]);
let total = 0;
for (const [k, [w, h, ms]] of [...keys].sort()) {
  total += w * h * 4;
  console.log(`${k.padEnd(34)} ${String(w).padStart(5)}x${String(h).padEnd(5)} ${((w * h * 4) / 1024).toFixed(0).padStart(7)} KB  ${ms.length === missions.length ? 'all' : ms.join(',')}`);
}
console.log(`total ${(total / 1048576).toFixed(2)} MB over ${keys.size} textures; canvas ${JSON.stringify(all[missions[0]].canvas)}`);
for (const m of missions) console.log(`${m} children ${all[m].children}`);
