// Boot の create の壁時計（A＝基準・B＝今）。window.__game の setter で BootScene.prototype.create を包む。N 回ずつ交互に開いて中央値（v0710 S2 の道具の写し）。ROUNDS 回まわす。
import { chromium, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const N = Number(process.env.N ?? 9), ROUNDS = Number(process.env.ROUNDS ?? 3);
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
      C.prototype.create = function () { const t0 = performance.now(); orig.call(this); window.__bootMs = performance.now() - t0; window.__bootEnd = performance.now(); };
    } });
    // createSfx の分: エンジンが最初に作るリミッタから、最初の buffer（ui_tap）まで（エンジン＋曲の再生のノード＋ ui_tap の合成）と、そこから Boot の終わりまで
    const AC = window.AudioContext;
    if (AC) {
      const t = (window.__sfxT = { c0: 0, b0: 0, gains: 0 });
      const cc = AC.prototype.createDynamicsCompressor, cb = AC.prototype.createBuffer, cg = AC.prototype.createGain;
      AC.prototype.createDynamicsCompressor = function (...a) { if (!t.c0) t.c0 = performance.now(); return cc.apply(this, a); };
      AC.prototype.createBuffer = function (...a) { if (!t.b0) t.b0 = performance.now(); return cb.apply(this, a); };
      AC.prototype.createGain = function (...a) { if (t.c0 && !t.b0) t.gains++; return cg.apply(this, a); };
    }
  });
  await page.goto(`${base}?debug&title&nosw`);
  await page.waitForFunction(() => window.__bootMs !== undefined, null, { timeout: 60000 });
  const r = await page.evaluate(() => ({ ms: window.__bootMs, music: window.__sfx && window.__sfx.stats().music ? window.__sfx.stats().music : null, sfx: window.__sfxT ? window.__sfxT.b0 - window.__sfxT.c0 : 0, rest: window.__sfxT ? window.__bootEnd - window.__sfxT.b0 : 0, gains: window.__sfxT ? window.__sfxT.gains : 0 }));
  await ctx.close();
  return r;
}
const med = (x) => [...x].sort((p, q) => p - q)[Math.floor(x.length / 2)];
const f = (x) => x.map((v) => v.toFixed(0)).join(' ');
await one(sa.base); await one(sb.base); // 暖機
const diffs = [];
for (let r = 0; r < ROUNDS; r++) {
  const a = [], b = [], sa1 = [], sb1 = [], ga = [], gb = [];
  let tablesAtBoot = 0;
  for (let i = 0; i < N; i++) {
    // 順を交互に（A→B・B→A）: 開く順の偏りを消す
    const pair = i % 2 === 0 ? [sa, sb] : [sb, sa];
    for (const s of pair) {
      const x = await one(s.base);
      if (s === sa) { a.push(x.ms); sa1.push(x.sfx); ga.push(x.gains); } else { b.push(x.ms); sb1.push(x.sfx); gb.push(x.gains); if (x.music && (x.music.tables || x.music.work || x.music.buildCalls > 0)) tablesAtBoot++; }
    }
  }
  diffs.push(med(b) - med(a));
  console.log(`回 ${r + 1}: Boot create ms  A: ${f(a)}  中央値 ${med(a).toFixed(1)}  ／ B: ${f(b)}  中央値 ${med(b).toFixed(1)}  差 ${(med(b) - med(a)).toFixed(1)} ms（B の Boot の終わりに曲の表・作業用の配列・作る仕事があった回 ${tablesAtBoot}/${N}）`);
  console.log(`      createSfx の分（エンジン＋ノード＋ ui_tap の合成）A 中央値 ${med(sa1).toFixed(2)}・B 中央値 ${med(sb1).toFixed(2)} ms（差 ${(med(sb1) - med(sa1)).toFixed(2)}）・その間に作った音量のノード A ${med(ga)}・B ${med(gb)}`);
}
console.log(`差（9 回の中央値の差 × ${ROUNDS}）: ${diffs.map((d) => d.toFixed(1)).join(' / ')} ms（門 ＋5 ms）`);
await browser.close(); await sa.close(); await sb.close();
