// 再生の A/B を AUDIO=1 で回した時に、ループが本当に鳴っているかの確かめ（v0.7.1 S3。scratchpad の道具）: 偽の時計で us_02 を 20 秒・jp_03 ハードを 40 秒回して、エンジンの数を出す。
import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
import { abRun } from '/home/user/ww2-torpedo-boat/scripts/headless/ab-replay.mjs';
const sv = await serve(process.env.SITE);
const browser = await chromium.launch();
for (const [q, secs] of [['mission=us_02&seed=1', 20], ['mission=jp_03&seed=1&hard', 40]]) {
  const { page, ctx, errors } = await openGame(browser, sv.base, q, { width: 1560 });
  await page.evaluate(abRun, { secs, frameMs: FRAME_MS, input: 'both', cam: true, ptrun: false, result: false });
  const st = await page.evaluate(() => (window.__sfx ? window.__sfx.stats() : null));
  console.log(q, st ? `context ${st.state}・標本 ${st.buffers} 本・単発の音源 ${st.sources}・ループ 鳴っている ${st.loops} 作った ${st.loopStarts} 止めた ${st.loopStops} 書いた ${st.loopWrites}・捨てた ${st.idleDrops}` : 'エンジンなし', `エラー ${errors.length}`);
  await ctx.close();
}
await browser.close(); await sv.close();
