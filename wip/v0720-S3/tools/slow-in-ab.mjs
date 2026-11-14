// ab-replay の台本（INPUT ごと）で、世界の slowMoLeftS > 0 の窓が SECS 秒の内に何回あるか（S3 の短い A/B がスローを含むかの確かめ）。ゲームは import しない。
import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
import { abRun } from '/home/user/ww2-torpedo-boat/scripts/headless/ab-replay.mjs';
const sv = await serve(process.env.SITE);
const browser = await chromium.launch();
for (const [mission, input, secs] of JSON.parse(process.env.CASES)) {
  const { page, ctx } = await openGame(browser, sv.base, `mission=${mission}&seed=1`, {});
  await page.evaluate(() => { const hl = window.__hl, f0 = hl.frame; window.__slow = []; let last = false, t = 0; hl.frame = (d) => { f0(d); t += d / 1000; const w = hl.world(); const on = !!w && w.slowMoLeftS > 0; if (on !== last) { window.__slow.push([Math.round(t * 100) / 100, on ? 1 : 0]); last = on; } }; });
  await page.evaluate(abRun, { secs, frameMs: FRAME_MS, input, cam: true, ptrun: false, result: false });
  console.log(mission, input, secs, JSON.stringify(await page.evaluate(() => window.__slow)));
  await ctx.close();
}
await browser.close(); await sv.close();
