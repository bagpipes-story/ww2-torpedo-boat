// v0.8.1 S2b の絵の確かめ（repo の外）: ?debug&mission=us_06&hard&seed=1 を W 1280・dpr 2 で開き、自艇の前に敵の卯月（tex-destroyer-mutsuki）と駆潜艇（tex-subchaser）を
// 隊の艦と同じ倍率（Destroyer の sprite.scaleX）で東西に並べて 1 枚（遊びの縮尺）、続けて 2 枚のテクスチャの画素をそのまま 3 倍で並べた 1 枚（DOM の canvas。参考）。
// 実行: SITE=<site> OUT=<dir> node art-s2b.mjs
import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';

const SITE = process.env.SITE;
const OUT = process.env.OUT;
const sv = await serve(SITE);
const browser = await chromium.launch();
const { page, ctx, errors } = await openGame(browser, sv.base, 'mission=us_06&seed=1&hard', { width: 1280, dpr: 2 });
const info = await page.evaluate((frameMs) => {
  const hl = window.__hl;
  const w = hl.world();
  const m = hl.mission();
  for (const c of m.children.list) if (c.texture && c.texture.key === 'tex-debug-ring') { c.setVisible(false); c.setVisible = () => c; }
  hl.steer(NaN, 0);
  for (let i = 0; i < 30; i++) hl.frame(frameMs);
  const g = w.destroyers;
  const b = w.boat.state;
  const uz = g.ships[0].sprite;
  const pk = g.ships[2].sprite;
  // 艇の南西（画面の中ほど）に東西向きで並べる（卯月・駆潜艇。もう 1 隻の駆潜艇は北向き）
  const add = (key, sc, x, y, ang) => m.add.image(x, y, key).setScale(sc).setDepth(uz.depth).setAngle(ang);
  add('tex-destroyer-mutsuki', uz.scaleX, b.x - 380, b.y + 260, 90);
  add('tex-subchaser', pk.scaleX, b.x - 430, b.y + 340, 90);
  add('tex-subchaser', pk.scaleX, b.x - 150, b.y + 300, 0);
  for (let i = 0; i < 60; i++) hl.render();
  const tex = (k) => { const t = window.__game.textures.get(k); const s = t.getSourceImage(); return { key: k, w: s.width, h: s.height, density: t.customData.density }; };
  return { boat: [b.x, b.y], scale: [uz.scaleX, pk.scaleX], tex: [tex('tex-destroyer-mutsuki'), tex('tex-subchaser'), tex('tex-destroyer')] };
}, FRAME_MS);
await page.screenshot({ path: `${OUT}/art-subchaser-ingame-w1280.png` });
await page.evaluate(() => {
  const keys = ['tex-destroyer-mutsuki', 'tex-subchaser'];
  const srcs = keys.map((k) => window.__game.textures.get(k).getSourceImage());
  const k = 3;
  const c = document.createElement('canvas');
  const W = Math.ceil(Math.max(...srcs.map((s) => s.height)) * k) + 40;
  const H = Math.ceil(srcs.reduce((a, s) => a + s.width * k + 30, 10));
  c.width = W; c.height = H;
  Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 99, background: '#0b1626', width: `${W / 2}px`, height: `${H / 2}px` });
  const x = c.getContext('2d');
  x.fillStyle = '#0b1626'; x.fillRect(0, 0, W, H);
  let y = 20;
  for (const s of srcs) {
    x.save(); x.translate(20, y + s.width * k); x.rotate(-Math.PI / 2); x.drawImage(s, 0, 0, s.width * k, s.height * k); x.restore(); // 艦首を右へ
    y += s.width * k + 30;
  }
  document.body.appendChild(c);
});
await page.screenshot({ path: `${OUT}/art-subchaser-texels.png` });
await ctx.close();
await browser.close();
await sv.close();
console.log(JSON.stringify({ info, errors }));
