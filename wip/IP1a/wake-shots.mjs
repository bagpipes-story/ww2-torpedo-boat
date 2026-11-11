// IP1a の写し（scratchpad の道具。repo には入れない）: 自艇の航跡（全速の旋回・巡航の旋回・静音）、駆逐艦の航跡（夜は見えている時だけ＝写しのため道具の側で絵を見せる）。
// 全体と、艇の周りの切り抜き（×1。clip）を撮る。実行: SITE=<site> SHOTDIR=<dir> [W=1280,1560] node wake-shots.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';

const site = process.env.SITE;
const dir = process.env.SHOTDIR;
mkdirSync(dir, { recursive: true });
const widths = (process.env.W ?? '1280,1560').split(',').map(Number);

function hide() {
  const m = window.__hl.mission();
  for (const c of m.children.list) if (c.texture && c.texture.key === 'tex-debug-ring') { c.setVisible(false); c.setVisible = () => c; }
}
function run(o) {
  const hl = window.__hl;
  const w = hl.world();
  const n = Math.round(o.secs * 60);
  for (let k = 0; k < n; k++) {
    const t = k / 60;
    let hd = (o.heading + o.turn * t + 360) % 360;
    if (o.reveal && w.destroyers) {
      // 写しのため（道具の側）: カメラを駆逐艦の絵に付ける（自艇は止まったまま。駆逐艦は自分の動きのまま）
      if (k === 0) hl.mission().cameras.main.startFollow(w.destroyers.ships[0].sprite, false, 0.2, 0.2);
      o.speed01 = 0;
    }
    hl.steer(hd, o.speed01);
    hl.frame(o.frameMs);
    if (o.reveal) for (const s of w.destroyers ? w.destroyers.ships : []) { s.sprite.setVisible(true).setAlpha(1); }
  }
  for (let i = 0; i < 3; i++) hl.render();
  const b = w.boat.state;
  const cam = hl.mission().cameras.main;
  const v = cam.worldView;
  const r = document.querySelector('canvas').getBoundingClientRect();
  const k2 = r.width / v.width;
  const puffs = hl.mission().children.list.filter((c) => c.visible && c.alpha > 0 && c.texture && c.texture.key === 'tex-wake-puff').length;
  let ship = null;
  if (w.destroyers) { const s = w.destroyers.ships[0]; ship = { x: r.left + (s.state.x - v.x) * k2, y: r.top + (s.state.y - v.y) * k2 }; }
  const s0 = w.destroyers ? w.destroyers.ships[0].state : null;
  return { dd: s0 ? { sp: s0.speedMps, hd: s0.headingDeg } : null, t: w.stepTimeS, band: w.band, speed: b.speedMps, sx: r.left + (b.x - v.x) * k2, sy: r.top + (b.y - v.y) * k2, puffs, ship, vw: r.width, vh: r.height };
}
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const clip = (r, cx, cy, hw, hh) => ({ x: Math.max(0, Math.min(r.vw - 2 * hw, cx - hw)), y: Math.max(0, Math.min(r.vh - 2 * hh, cy - hh)), width: 2 * hw, height: 2 * hh });

const { base, close } = await serve(site);
const browser = await chromium.launch();
const out = {};
for (const width of widths) {
  for (const [name, q, steps] of [
    ['us_01-turn', 'mission=us_01&seed=1', [['full', 6, 30, 0, 1], ['full-turn', 3.5, 30, 70, 1], ['cruise-turn', 6, 280, -45, 0.55], ['silent', 6, 200, 0, 0.2]]],
    ['jp_03-day', 'mission=jp_03&seed=1', [['full-turn', 5, 140, 50, 1]]],
    ['us_02-dd', 'mission=us_02&seed=1', [['dd', 8, 10, 0, 0, true]]],
    ['jp_06-dd', 'mission=jp_06&seed=1', [['dd', 8, 10, 0, 0, true]]],
    ['us_01-dd', 'mission=us_01&seed=1', [['dd', 8, 10, 0, 0, true]]],
  ]) {
    if (ONLY && !ONLY.includes(name)) continue;
    const { page, ctx, errors } = await openGame(browser, base, q, { width, dpr: 2 });
    await page.evaluate(hide);
    for (const [tag, secs, heading, turn, speed01, reveal] of steps) {
      const r = await page.evaluate(run, { secs, heading, turn, speed01, reveal: !!reveal, frameMs: FRAME_MS });
      await page.screenshot({ path: `${dir}/${name}-${tag}-w${width}.png` });
      await page.screenshot({ path: `${dir}/${name}-${tag}-crop-w${width}.png`, clip: clip(r, r.sx, r.sy, 210, 130) });
      if (r.ship) await page.screenshot({ path: `${dir}/${name}-${tag}-ship-w${width}.png`, clip: clip(r, r.ship.x, r.ship.y, 260, 150) });
      out[`${name}-${tag}-w${width}`] = { ...r, errors: errors.length };
      console.log(name, tag, width, JSON.stringify(r), 'errors', errors.length, errors[0] ?? '');
    }
    await ctx.close();
  }
}
await browser.close();
await close();
writeFileSync(`${dir}/wake.json`, JSON.stringify(out, null, 1));
