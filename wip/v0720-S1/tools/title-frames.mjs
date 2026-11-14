// Title の出始め（起動から SECS 秒）のフレーム（A＝基準・B＝今。実時間・rAF を止めない）: 1 フレームの JS の仕事（PRE_STEP → POST_RENDER の ms）と rAF の間隔の 95%・最大。
// B は曲（既定のタイトルの曲）をこの間に作る。RUNS 回ずつ交互に開いて全部のフレームを合わせる。曲を作ったフレームだけの仕事の 95% も出す（B）。
import { chromium, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const RUNS = Number(process.env.RUNS ?? 6), SECS = Number(process.env.SECS ?? 4);
const sa = await serve(process.env.A); const sb = await serve(process.env.B);
const browser = await chromium.launch();
async function one(base) {
  const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const out = (window.__frames = { work: [], gap: [], build: [] });
    let game, t0 = 0, last = 0, calls = 0;
    Object.defineProperty(window, '__game', { configurable: true, get: () => game, set: (g) => {
      game = g;
      g.events.on('prestep', () => { t0 = performance.now(); const sfx = window.__sfx; calls = sfx && sfx.music ? sfx.music.build.calls : 0; });
      g.events.on('postrender', () => {
        const now = performance.now();
        if (!g.scene.isActive('Title')) return;
        out.work.push(now - t0);
        if (last > 0) out.gap.push(now - last);
        last = now;
        const sfx = window.__sfx;
        if (sfx && sfx.music && sfx.music.build.calls > calls) out.build.push(now - t0);
      });
    } });
  });
  await page.goto(`${base}?debug&title&nosw`);
  await page.waitForFunction(() => window.__game && window.__game.scene.isActive('Title'), null, { timeout: 60000 });
  await new Promise((r) => setTimeout(r, SECS * 1000));
  const r = await page.evaluate(() => window.__frames);
  await ctx.close();
  return r;
}
const q = (x, p) => { const s = [...x].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
const all = { A: { work: [], gap: [], build: [] }, B: { work: [], gap: [], build: [] } };
await one(sa.base); await one(sb.base);
for (let i = 0; i < RUNS; i++) for (const [k, s] of [['A', sa], ['B', sb]]) { const r = await one(s.base); for (const f of ['work', 'gap', 'build']) all[k][f].push(...r[f]); }
for (const k of ['A', 'B']) {
  const a = all[k];
  console.log(`${k}: フレーム ${a.work.length}・仕事 中央値 ${q(a.work, 0.5).toFixed(2)}・95% ${q(a.work, 0.95).toFixed(2)}・最大 ${Math.max(...a.work).toFixed(1)} ms ／ 間隔 中央値 ${q(a.gap, 0.5).toFixed(1)}・95% ${q(a.gap, 0.95).toFixed(1)}・最大 ${Math.max(...a.gap).toFixed(1)} ms${a.build.length ? ` ／ 曲を作ったフレーム ${a.build.length}・仕事 中央値 ${q(a.build, 0.5).toFixed(2)}・95% ${q(a.build, 0.95).toFixed(2)}・最大 ${Math.max(...a.build).toFixed(1)} ms` : ''}`);
}
console.log(`95% の差: 仕事 ${(q(all.B.work, 0.95) - q(all.A.work, 0.95)).toFixed(2)} ms・間隔 ${(q(all.B.gap, 0.95) - q(all.A.gap, 0.95)).toFixed(2)} ms（門 ＋4 ms）`);
await browser.close(); await sa.close(); await sb.close();
