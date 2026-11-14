// 曲の試聴の場の見た目（論理幅 1280・1584）。ゲームは import しない。
import { chromium, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const sv = await serve(process.env.SITE);
const browser = await chromium.launch();
for (const [w, h] of [[667, 375], [880, 400]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${sv.base}?sfxlab&debug&nosw`);
  await page.waitForFunction(() => window.__game && window.__game.scene.isActive('MusicLab'), null, { timeout: 60000 });
  await new Promise((r) => setTimeout(r, 1500));
  const info = await page.evaluate(() => {
    const g = window.__game; const sc = g.scene.getScene('MusicLab');
    const texts = sc.children.list.filter((x) => x.type === 'Text').map((t) => { const b = t.getBounds(); return { text: t.text.slice(0, 24), x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; });
    return { width: g.scale.gameSize.width / sc.cameras.main.zoom, head: texts.find((t) => t.text.startsWith('曲の試聴')), rows: texts.filter((t) => /命中|タイトルの曲$|A（今）|B 低く|C なし/.test(t.text)) };
  });
  console.log(w, h, JSON.stringify(info), errors.length);
  await page.screenshot({ path: `${process.env.OUT}/lab-${w}x${h}.png` });
  await ctx.close();
}
await browser.close(); await sv.close();
