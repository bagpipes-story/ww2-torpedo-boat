// 標本を作るフレームの長さ（v0.7.1 S3。scratchpad の道具）: Boot の後、音の PRE_STEP の口（1 フレームに標本 1 本＝systems/sfx-boot の buildNext）に掛かった ms をフレームごとに測る。
// headlessStep の頭から、後から付けた自分の PRE_STEP の口までの時間（＝先に付いている口の時間。ほぼ buildNext）。RUNS 回の中央値。
// 実行: SITE=<site> [RUNS=5] [Q=title] node build-frames.mjs
import { chromium, envNum, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const sv = await serve(process.env.SITE);
const browser = await chromium.launch();
const runs = [];
for (let r = 0; r < envNum('RUNS', 5); r++) {
  const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 1, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.requestAnimationFrame = () => 0; window.cancelAnimationFrame = () => {}; });
  await page.goto(`${sv.base}?debug&nosw&${process.env.Q ?? 'title'}`);
  await page.waitForFunction(() => window.__game && window.__game.isBooted, null, { timeout: 60000 });
  runs.push(await page.evaluate(() => {
    const g = window.__game;
    const out = [];
    let start = 0, t = 0, buffers = 0;
    const orig = g.headlessStep.bind(g);
    let hooked = false;
    for (let i = 0; i < 60; i++) {
      t += 1000 / 60;
      start = performance.now();
      let pre = 0;
      const mark = () => { pre = performance.now() - start; };
      if (window.__sfx && !hooked) { hooked = true; }
      g.events.once('prestep', mark);
      orig(t, 1000 / 60);
      const total = performance.now() - start;
      const b = window.__sfx ? window.__sfx.stats().buffers : 0;
      out.push({ i, pre: Math.round(pre * 10) / 10, total: Math.round(total * 10) / 10, built: b - buffers, buffers: b });
      buffers = b;
    }
    return out;
  }));
  await ctx.close();
}
await browser.close(); await sv.close();
const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
const frames = runs[0].map((f, i) => ({ i, built: f.built, buffers: f.buffers, pre: med(runs.map((r) => r[i].pre)), total: med(runs.map((r) => r[i].total)) }));
for (const f of frames.filter((x) => x.built > 0 || x.pre > 2)) console.log(`フレーム ${String(f.i).padStart(2)}: 標本 ${f.buffers} 本目まで（このフレームに ${f.built}）  音の口まで ${f.pre.toFixed(1)} ms  フレーム全体 ${f.total.toFixed(1)} ms`);
console.log(`一番長い（音の口まで）${Math.max(...frames.map((f) => f.pre)).toFixed(1)} ms・標本を作るフレームの合計 ${frames.filter((f) => f.built > 0).reduce((a, f) => a + f.pre, 0).toFixed(1)} ms・作り終わり フレーム ${frames.findLast((f) => f.built > 0)?.i}`);
