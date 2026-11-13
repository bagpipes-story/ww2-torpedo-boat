// IP3（IP2 の写し・5 行の置き方）: 試聴の場（?sfxlab）の写しと、押した時に音のエンジンへ届くか（scratchpad の道具）。SITE=<dir> OUT=<dir>。AUDIO=1 で context が running の状態
import { mkdirSync } from 'node:fs';
import { chromium, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const site = process.env.SITE, out = process.env.OUT; mkdirSync(out, { recursive: true });
const srv = await serve(site);
const browser = await chromium.launch();
const sizes = [[1280, { width: 667, height: 375 }], [1584, { width: 880, height: 400 }]];
const report = [];
for (const [lw, vp] of sizes) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 2, hasTouch: false });
  const errs = []; page.on('pageerror', (e) => errs.push(String(e))); page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`${srv.base}?sfxlab&debug&nosw`);
  await page.waitForFunction(() => window.__game && window.__game.scene.isActive('SoundLab'), null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => { const g = window.__game; const cam = g.scene.getScene('SoundLab').cameras.main; return { w: cam.width / cam.zoom, scenes: g.scene.getScenes(true).map((s) => s.scene.key), sfx: window.__sfx ? window.__sfx.stats() : null }; });
  await page.screenshot({ path: `${out}/lab-w${lw}.png` });
  // 押す: 魚雷の発射 A（3 行目の 1 列目）・続けて聞く B・戻る
  const box = await page.locator('canvas').boundingBox();
  const k = box.width / info.w;
  const tap = async (x, y) => { await page.mouse.move(box.x + x * k, box.y + y * k); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(150); };
  const before = info.sfx;
  const colX = (c, n) => { const left = 24 + 236 + 16; const w = (info.w - 24 - left - (n - 1) * 16) / n; return left + c * (w + 16) + w / 2; };
  const rowY = (r) => 124 + r * 94 + 42;
  await tap(colX(0, 5), rowY(3)); // 魚雷の発射（新）E
  await tap(colX(1, 4), rowY(4)); // 続けて聞く B
  await page.waitForTimeout(1400);
  const after = await page.evaluate(() => (window.__sfx ? window.__sfx.stats() : null));
  await page.screenshot({ path: `${out}/lab-w${lw}-tapped.png` });
  await tap(24 + 160, 720 - 24 - 42);
  await page.waitForTimeout(800);
  const end = await page.evaluate(() => ({ scenes: window.__game.scene.getScenes(true).map((s) => s.scene.key), sfx: window.__sfx ? window.__sfx.stats() : null }));
  report.push({ lw, logicalW: info.w, scenes: info.scenes, state: before?.state, muted: before?.muted, srcBefore: before?.sources, srcAfter: after?.sources, idleBefore: before?.idleDrops, idleAfter: after?.idleDrops, played: after ? after.played.map((n, i) => n ? i + ":" + n : "").filter(Boolean).join(" ") : null, endScenes: end.scenes, endMuted: end.sfx?.muted, errs });
  await page.close();
}
await browser.close(); await srv.close();
for (const r of report) console.log(JSON.stringify(r));
