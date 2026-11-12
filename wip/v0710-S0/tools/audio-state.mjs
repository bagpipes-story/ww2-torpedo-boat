// 音の 3 つの状態の確かめ（v0.7.1 S0）: site を開いて Phaser の sound manager の種類と context の状態を出す。
// 実行: SITE=<site> [AUDIO=1|NOAUDIO=1] node audio-state.mjs（repo の scripts/headless/lib.mjs を使う）
import { chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const sv = await serve(process.env.SITE);
const browser = await chromium.launch();
const { page, ctx, errors } = await openGame(browser, sv.base, 'mission=us_02&seed=1', {});
const r = await page.evaluate(async () => {
  const s = window.__game.sound;
  const out = { manager: s.constructor.name, hasContext: 'context' in s && !!s.context, state: s.context ? s.context.state : null, rate: s.context ? s.context.sampleRate : null, AudioContext: typeof window.AudioContext, locked: s.locked };
  if (s.context) { const t0 = s.context.currentTime; await new Promise((r) => setTimeout(r, 300)); out.advanced = s.context.currentTime - t0; }
  return out;
});
console.log(`${process.env.AUDIO === '1' ? 'AUDIO=1  ' : process.env.NOAUDIO === '1' ? 'NOAUDIO=1' : '既定     '} ${JSON.stringify(r)} errors ${errors.length}${errors.length ? ` ${errors[0]}` : ''}`);
await ctx.close(); await browser.close(); await sv.close();
