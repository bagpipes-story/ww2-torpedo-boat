// 一時停止の画面の写し（v0.7.1 S3。scratchpad の道具）: 論理幅 1280 と 1584 で、音: オン／オフの両方。ボタンの矩形（論理 px）も出す。
// 実行: SITE=<site> OUT=<dir> node pause-shot.mjs
import { join } from 'node:path';
import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const sv = await serve(process.env.SITE);
const browser = await chromium.launch();
for (const [name, viewport] of [['1280', { width: 667, height: 375 }], ['1584', { width: 880, height: 400 }]]) {
  const { page, ctx, errors } = await openGame(browser, sv.base, 'mission=us_02&seed=1', { viewport, dpr: 2 });
  await page.evaluate((ms) => { const hl = window.__hl; for (let i = 0; i < 120; i++) { hl.steer(0, 0.6); hl.frame(ms); } window.__game.scene.getScene('Hud').pause.open(); for (let i = 0; i < 30; i++) hl.frame(ms); hl.render(); }, FRAME_MS);
  const info = await page.evaluate(() => {
    const g = window.__game; const p = g.scene.getScene('Pause');
    return { gameW: g.scale.gameSize.width / p.cameras.main.zoom, active: g.scene.isActive('Pause'), rects: p.children.list.filter((o) => o.type === 'Rectangle' && o.input).map((o) => [o.x, o.y, o.width, o.height]), texts: p.children.list.filter((o) => o.type === 'Text').map((o) => [o.text.replace(/\n/g, '/'), Math.round(o.x), Math.round(o.y)]) };
  });
  console.log(name, JSON.stringify(info), 'errors', errors.length);
  await page.screenshot({ path: join(process.env.OUT, `pause-${name}-on.png`) });
  // 「音」ボタンを押す（本物のタップ → Phaser の入力はフレームで進む）
  const c = await page.evaluate(() => { const g = window.__game; const sc = g.scene.getScene('Pause'); const t = sc.children.list.find((x) => x.type === 'Text' && x.text.startsWith('音: オン')); const b = t.getBounds(); const r = g.canvas.getBoundingClientRect(); const k = r.width / (g.scale.gameSize.width / sc.cameras.main.zoom); return { x: r.left + b.centerX * k, y: r.top + b.centerY * k }; });
  await page.evaluate((ms) => { for (let i = 0; i < 30; i++) window.__hl.frame(ms); }, FRAME_MS); // 押下を受けない 0.3 秒を過ぎる
  await page.touchscreen.tap(c.x, c.y);
  await page.evaluate((ms) => { for (let i = 0; i < 5; i++) window.__hl.frame(ms); window.__hl.render(); }, FRAME_MS);
  const after = await page.evaluate(() => ({ texts: window.__game.scene.getScene('Pause').children.list.filter((o) => o.type === 'Text').map((o) => o.text.replace(/\n/g, '/')), stored: localStorage.getItem('night-hunters.sound'), muted: window.__sfx ? window.__sfx.muted : null }));
  console.log(name, 'after tap', JSON.stringify(after));
  await page.screenshot({ path: join(process.env.OUT, `pause-${name}-off.png`) });
  await ctx.close();
}
await browser.close(); await sv.close();
