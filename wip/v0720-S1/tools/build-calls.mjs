// 曲を作る 1 回ずつの ms（作る列の輪をそのまま読む）: どの回が遅いか（初回の確保・作曲・表・書き方の初回）。RUNS 回開き直す。
import { chromium, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const sv = await serve(process.env.SITE);
const browser = await chromium.launch();
for (let r = 0; r < Number(process.env.RUNS ?? 4); r++) {
  const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${sv.base}?debug&title&nosw`);
  await page.waitForFunction(() => window.__sfx && window.__sfx.stats().music.buffers >= 1, null, { timeout: 60000 });
  const ms = await page.evaluate(() => Array.from(window.__sfx.music.build.ms.subarray(0, window.__sfx.music.build.calls)));
  const top = ms.map((v, i) => [i, v]).sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(`回 ${r + 1}: ${ms.length} 回・最初の 6 回 ${ms.slice(0, 6).map((v) => v.toFixed(1)).join(' ')} ms・遅い順 ${top.map(([i, v]) => `#${i} ${v.toFixed(1)}`).join(' ')}`);
  await ctx.close();
}
await browser.close(); await sv.close();
