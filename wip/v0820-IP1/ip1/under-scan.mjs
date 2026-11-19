// B だけを ab-replay の台本で回し、HUD の文に「近すぎて船体の下を通過」が出たフレームを数える（IP1 Task E の確かめ。リポジトリに入れない）
import { abCases, abRun } from '/home/user/ww2-torpedo-boat/scripts/headless/ab-replay.mjs';
import { chromium, openGame, pool, serve, FRAME_MS } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const sv = await serve(process.env.SITE), browser = await chromium.launch();
const cases = (process.env.SETS ?? 'us05,all').split(',').flatMap((s) => abCases(s, 'primary'));
const q = (c) => `mission=${c.mission}&seed=${c.seed}${c.hard ? '&hard' : ''}${c.dawn ? `&dawn=${c.dawn}` : ''}${c.nodawn ? '&nostrike' : ''}`;
const res = await pool(cases, 2, async (c) => {
  const { page, ctx } = await openGame(browser, sv.base, q(c), { width: 1560 });
  try { await page.evaluate(abRun, { ...c, frameMs: FRAME_MS, hudEvery: 0 }); return { c, n: await page.evaluate(() => window.__ab.filter((s) => s.includes('近すぎて船体の下を通過')).length), u: await page.evaluate(() => window.__game.registry.get('boatTelemetry').torpedoUnder) }; }
  finally { await ctx.close(); }
});
for (const r of res) console.log(`${r.c.set} ${r.c.mission}${r.c.hard ? '&hard' : ''} seed ${r.c.seed} frames-with-text ${r.n} torpedoUnder ${r.u}`);
await browser.close(); await sv.close();
