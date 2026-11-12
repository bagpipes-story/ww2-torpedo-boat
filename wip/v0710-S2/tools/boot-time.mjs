// Boot の create の壁時計（A＝基準・B＝今）。window.__game の setter で BootScene.prototype.create を包む。N 回ずつ交互に開いて中央値。
import { chromium, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const N = Number(process.env.N ?? 9);
const sa = await serve(process.env.A); const sb = await serve(process.env.B);
const browser = await chromium.launch();
async function one(base) {
  const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    let game;
    Object.defineProperty(window, '__game', { configurable: true, get: () => game, set: (g) => {
      game = g;
      const C = g.config.sceneConfig[0];
      const orig = C.prototype.create;
      C.prototype.create = function () { const t0 = performance.now(); orig.call(this); window.__bootMs = performance.now() - t0; };
    } });
    // 合成だけの時間も測る（Float32Array を作る renderSfx は束の中なので、createBuffer の呼び出しの間で見る）
    const AC = window.AudioContext;
    if (AC) { const cc = AC.prototype.createDynamicsCompressor; AC.prototype.createDynamicsCompressor = function (...a) { window.__buf.push(performance.now()); return cc.apply(this, a); }; const cb = AC.prototype.createBuffer; window.__buf = []; AC.prototype.createBuffer = function (...a) { window.__buf.push(performance.now()); return cb.apply(this, a); }; }
  });
  await page.goto(`${base}?debug&title&nosw`);
  await page.waitForFunction(() => window.__bootMs !== undefined, null, { timeout: 60000 });
  const r = await page.evaluate(() => ({ ms: window.__bootMs, buf: window.__buf }));
  await ctx.close();
  return r;
}
const a = []; const b = []; const spans = []; const counts = [];
await one(sa.base); await one(sb.base); // 暖機
for (let i = 0; i < N; i++) { a.push((await one(sa.base)).ms); const r = await one(sb.base); b.push(r.ms); if (r.buf && r.buf.length > 1) { spans.push(r.buf[1] - r.buf[0]); counts.push(r.buf.length - 1); } }
const med = (x) => [...x].sort((p, q) => p - q)[Math.floor(x.length / 2)];
const f = (x) => x.map((v) => v.toFixed(0)).join(' ');
console.log(`Boot create ms  A: ${f(a)}  中央値 ${med(a).toFixed(1)}`);
console.log(`Boot create ms  B: ${f(b)}  中央値 ${med(b).toFixed(1)}  差 ${(med(b) - med(a)).toFixed(1)} ms`);

console.log(`B の createSfx の Boot の分（エンジンを作り始めてから最初の createBuffer＝ui_tap まで。S2: 残りは次のフレームから 1 本ずつ）: ${f(spans)} ms 中央値 ${spans.length ? med(spans).toFixed(1) : '-'}`);
await browser.close(); await sa.close(); await sb.close();
