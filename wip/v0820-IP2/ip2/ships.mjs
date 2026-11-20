import { chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const sv = await serve(process.env.SITE), b = await chromium.launch();
for (const m of ['us_01','us_02','us_03','us_04','us_05','us_06','jp_01','jp_02','jp_03','jp_04','jp_05','jp_06']) for (const h of [0,1]) {
  const { page, ctx } = await openGame(b, sv.base, `mission=${m}&seed=1${h ? '&hard' : ''}`, { width: 1560 });
  const r = await page.evaluate(() => { const w = window.__hl.world(), g = w.destroyers; return g ? { n: g.ships.length, keys: g.kits.artKeys, pr: Math.sqrt(g.passRadius2), tp: g.transportIndex, pk: g.picketIndex, tr: !!g.transit } : null; });
  console.log(m, h ? 'hard' : 'normal', JSON.stringify(r)); await ctx.close();
}
await b.close(); await sv.close();
