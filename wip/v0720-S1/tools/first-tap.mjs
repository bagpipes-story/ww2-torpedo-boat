// 最初のタップ → ui_tap の音源（start）までの時間（A＝基準・B＝今。既定の状態＝context は suspended・本物のタップで起きる）。Title の難易度ボタンを AT ms 後に押す（B は曲を作っている最中）。
import { VIEWPORTS, chromium, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const N = Number(process.env.N ?? 9), AT = Number(process.env.AT ?? 1200);
const sa = await serve(process.env.A); const sb = await serve(process.env.B);
const browser = await chromium.launch();
async function one(base) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[1560], hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    const r = (window.__tap = { end: 0, start: 0, music: 0 });
    window.addEventListener('touchend', () => { if (!r.end) r.end = performance.now(); }, { capture: true });
    const P = window.AudioBufferSourceNode.prototype, st = P.start;
    P.start = function (...a) { if (!r.start && this.buffer && this.buffer.length === 1323) r.start = performance.now(); if (this.loop && this.buffer && this.buffer.length > 100000 && !r.music) r.music = performance.now(); return st.apply(this, a); };
  });
  await page.goto(`${base}?debug&title&nosw`);
  await page.waitForFunction(() => window.__game && window.__game.scene.isActive('Title'), null, { timeout: 60000 });
  await new Promise((res) => setTimeout(res, AT));
  const c = await page.evaluate(() => {
    const g = window.__game, sc = g.scene.getScene('Title');
    const t = sc.children.list.find((x) => x.type === 'Text' && x.text.startsWith('難易度: '));
    const b = t.getBounds(), rr = g.canvas.getBoundingClientRect(), k = rr.width / (g.scale.gameSize.width / sc.cameras.main.zoom);
    return { x: rr.left + b.centerX * k, y: rr.top + b.centerY * k };
  });
  await page.touchscreen.tap(c.x, c.y);
  await page.waitForFunction(() => window.__tap.start > 0, null, { timeout: 5000 }).catch(() => {});
  const r = await page.evaluate(() => ({ ...window.__tap, built: window.__sfx && window.__sfx.stats().music ? window.__sfx.stats().music.buffers : -1 }));
  await ctx.close();
  return r;
}
const med = (x) => [...x].sort((p, q) => p - q)[Math.floor(x.length / 2)];
await one(sa.base); await one(sb.base);
const a = [], b = [], built = [];
for (let i = 0; i < N; i++) { const ra = await one(sa.base); a.push(ra.start - ra.end); const rb = await one(sb.base); b.push(rb.start - rb.end); built.push(rb.built); }
console.log(`最初のタップ（touchend）→ ui_tap の start（ms）  A: ${a.map((v) => v.toFixed(1)).join(' ')}  中央値 ${med(a).toFixed(1)}`);
console.log(`                                      B: ${b.map((v) => v.toFixed(1)).join(' ')}  中央値 ${med(b).toFixed(1)}  差 ${(med(b) - med(a)).toFixed(1)} ms（タップの時に曲ができていた回 ${built.filter((x) => x >= 1).length}/${N}）`);
await browser.close(); await sa.close(); await sb.close();
