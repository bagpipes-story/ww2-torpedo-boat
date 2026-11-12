// Title の右上の「音」ボタンの置き方を論理幅 1280・1584（と 1560）で撮り、Title の物（文と矩形）の箱を出す（重なりの確かめ）。
// 実行: SITE=<site> OUT=<dir> node title-shots.mjs
import { chromium, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const sv = await serve(process.env.SITE);
const browser = await chromium.launch();
const VPS = { 1280: { width: 667, height: 375 }, 1560: { width: 852, height: 393 }, 1584: { width: 900, height: 400 } };
for (const camp of ['us_pt', 'jp_hard']) for (const [w, vp] of Object.entries(VPS)) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
  await page.goto(`${sv.base}?debug&title&unlock&nosw`);
  await page.waitForFunction(() => window.__game && window.__game.scene.isActive('Title'), null, { timeout: 60000 });
  if (camp === 'jp_hard') { await page.evaluate(() => { const g = window.__game; g.registry.set('campaign', 'jp_hard'); }); }
  const info = await page.evaluate((camp) => {
    const g = window.__game;
    const s = g.scene.getScene('Title');
    if (camp === 'jp_hard') { const k = Object.keys(g.registry.list).find((x) => /campaign/i.test(x)); g.registry.set(k, 'jp_hard'); s.scene.restart(); }
    return new Promise((res) => setTimeout(() => {
      const s2 = g.scene.getScene('Title');
      const boxes = s2.children.list.map((o) => { const b = o.getBounds(); return { type: o.type, text: o.text ? o.text.replace(/\n/g, '⏎').slice(0, 24) : '', x0: Math.round(b.x), y0: Math.round(b.y), x1: Math.round(b.right), y1: Math.round(b.bottom) }; });
      res({ W: g.scale.gameSize.width / s2.cameras.main.zoom, boxes });
    }, 400));
  }, camp);
  await page.screenshot({ path: `${process.env.OUT}/title-${camp}-${w}.png` });
  const top = info.boxes.filter((b) => b.y0 < 215);
  console.log(`${camp} W ${info.W} errors ${errors.length}`);
  for (const b of top) console.log(`   ${b.type.padEnd(9)} x ${b.x0}..${b.x1} y ${b.y0}..${b.y1} ${b.text}`);
  // 重なり: 右上のボタン（矩形 200×80）・一言 と、ほかの物
  const btn = info.boxes.find((b) => b.type === 'Rectangle' && b.x1 - b.x0 >= 200 && b.x1 - b.x0 <= 204 && b.y0 <= 20);
  const hint = info.boxes.find((b) => b.text.startsWith('音が出ない'));
  const hit = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
  const mine = new Set([btn, hint, info.boxes.find((b) => b.text.startsWith('音:'))]);
  for (const m of [btn, hint]) for (const o of info.boxes) if (!mine.has(o) && hit(m, o)) console.log(`   ✗ 重なり: ${JSON.stringify(m)} と ${JSON.stringify(o)}`);
  console.log(`   btn ${JSON.stringify(btn)} hint ${JSON.stringify(hint)} 画面の内 ${btn.x1 <= info.W && hint.x0 >= 0}`);
  await ctx.close();
}
await browser.close(); await sv.close();
