// 本物の機銃・爆発の道が音の口まで届くか（偽の時計。AUDIO=1 で context は running）。us_03&barges=near で機銃を押しっぱなし 40 秒、us_02 は ab-replay の台本 90 秒。
import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
import { abRun } from '/home/user/ww2-torpedo-boat/scripts/headless/ab-replay.mjs';
const sv = await serve(process.env.SITE);
const browser = await chromium.launch();
for (const [q, secs, mode] of [['mission=us_03&seed=1&barges=near', 40, 'hold'], ['mission=us_02&seed=1', 90, 'ab'], ['mission=jp_03&seed=1&hard', 60, 'hold']]) {
  const { page, ctx, errors } = await openGame(browser, sv.base, q, {});
  if (mode === 'ab') await page.evaluate(abRun, { secs, frameMs: FRAME_MS, input: 'both', cam: false });
  else await page.evaluate(({ secs, ms }) => { const hl = window.__hl; for (let k = 0; k < secs * 60; k++) { const w = hl.world(); if (!w) break; w.input.gunHeld = true; hl.frame(ms); } }, { secs, ms: FRAME_MS });
  const st = await page.evaluate(() => window.__sfx ? window.__sfx.stats() : null);
  console.log(`${q} ${secs}s: ${st ? `state ${st.state} gameS ${st.gameS.toFixed(1)} 音源 ${st.sources} 最大 ${st.maxBusy} mg ${st.played[0]} blast_l ${st.played[6]} ui_tap ${st.played[16]} idle ${st.idleDrops} 落とした（間隔/遠い/声）${st.dropped.slice(1).join('/')} 見張り ${st.watchdogKicks}` : 'エンジンなし'} errors ${errors.length}`);
  await ctx.close();
}
await browser.close(); await sv.close();
