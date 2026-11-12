// IP3 の写し（scratchpad の道具。repo には入れない）: 自艇 Elco（us_01）・T-38 と青い隼艇と青い大発（jp_01 ハード）・敵の大発（us_03）・敵の米PT（jp_04）・jp_03 の隊（隠れた tint を道具の側で）・
// 駆逐艦の寄り（us_02）。PROFILES: p3＝852×393 CSS・dpr 3（iPhone 15 の Safari の横持ち）、w1280・w1560＝dpr 2。HEAD（cap 2）でも同じ台本で撮れる。
// 実行: SITE=<site> SHOTDIR=<dir> [PROFILES=p3,w1280,w1560] [ONLY=a,b] node ip3-shots.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';

const site = process.env.SITE;
const dir = process.env.SHOTDIR;
mkdirSync(dir, { recursive: true });
const PROFILES = { p3: { width: 1560, viewport: { width: 852, height: 393 }, dpr: 3 }, w1280: { width: 1280, dpr: 2 }, w1560: { width: 1560, dpr: 2 } };
const profs = (process.env.PROFILES ?? 'p3,w1280,w1560').split(',');
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

function prep() {
  const hl = window.__hl;
  for (const c of hl.mission().children.list) if (c.texture && c.texture.key === 'tex-debug-ring') { c.setVisible(false); c.setVisible = () => c; }
}
/** key の絵をみな見えるままに（視程で隠れない） */
function reveal(keys) {
  for (const c of window.__hl.mission().children.list) if (c.texture && keys.includes(c.texture.key)) { c.setVisible(true); c.setAlpha(1); c.setVisible = () => c; c.setAlpha = () => c; }
}
function run(o) {
  const hl = window.__hl; const w = hl.world(); const cam = hl.mission().cameras.main;
  for (let k = 0; k < Math.round(o.secs * 60); k++) {
    hl.steer(o.heading ?? NaN, o.speed01 ?? 0);
    hl.frame(o.frameMs);
    if (cam.shakeEffect) cam.shakeEffect.reset();
    if (o.zoom) cam.setZoom(o.zoom * window.__game.scene.getScene('Hud').cameras.main.zoom);
    if (o.camKey) { for (const c of hl.mission().children.list) if (c.texture && c.texture.key === o.camKey && c.visible) { cam.stopFollow(); cam.centerOn(c.x + (o.camDx ?? 0), c.y + (o.camDy ?? 0)); break; } }
    if (!hl.active('Mission')) break;
  }
  for (let i = 0; i < 3; i++) hl.render();
  return { t: w.stepTimeS, k: window.__game.scene.getScene('Hud').cameras.main.zoom, zoom: cam.zoom };
}
function at(key) {
  for (const c of window.__hl.mission().children.list) if (c.texture && c.texture.key === key && c.visible) return [c.x, c.y];
  return null;
}
async function crop(page, path, p, W, H) {
  const q = await page.evaluate((p) => {
    const cam = window.__hl.mission().cameras.main;
    const cv = document.querySelector('canvas'); const r = cv.getBoundingClientRect(); const k = r.width / cv.width;
    return { x: r.left + (p[0] - cam.worldView.x) * cam.zoom * k, y: r.top + (p[1] - cam.worldView.y) * cam.zoom * k };
  }, p);
  await page.screenshot({ path, clip: { x: Math.max(0, q.x - W / 2), y: Math.max(0, q.y - H / 2), width: W, height: H } });
}
const R = (page, o) => page.evaluate(run, { frameMs: FRAME_MS, ...o });
async function shot(page, tag, key, keys, o = {}) {
  await page.evaluate(reveal, keys);
  const r = await R(page, { camKey: key, ...o });
  await page.screenshot({ path: `${dir}/${tag}.png` });
  const p = await page.evaluate(at, key);
  if (p) { await crop(page, `${dir}/${tag}-crop.png`, p, 180, 120); await crop(page, `${dir}/${tag}-tight.png`, p, 64, 44); }
  return r;
}
const CASES = {
  elco: { q: 'mission=us_01&seed=1', f: async (page, t) => [await shot(page, `elco-${t}`, 'tex-boat-us_elco77', ['tex-boat-us_elco77'], { secs: 4, heading: 50, speed01: 0.6 }), await shot(page, `elco-z1-${t}`, 'tex-boat-us_elco77', [], { secs: 0.5, heading: 50, speed01: 0.6, zoom: 1 })] },
  t38: { q: 'mission=jp_01&seed=1&hard', f: async (page, t) => {
    const keys = ['tex-boat-jp_t38', 'tex-boat-jp_h38_hayabusa', 'tex-barge-friendly'];
    return [await shot(page, `t38-${t}`, 'tex-boat-jp_t38', keys, { secs: 6, heading: 80, speed01: 0.3 }), await shot(page, `h38-${t}`, 'tex-boat-jp_h38_hayabusa', keys, { secs: 0.2, zoom: 1 }), await shot(page, `bargeF-${t}`, 'tex-barge-friendly', keys, { secs: 0.2, zoom: 1 })];
  } },
  barge: { q: 'mission=us_03&seed=1&barges=near', f: async (page, t) => [await shot(page, `barge-${t}`, 'tex-barge', ['tex-barge'], { secs: 3 }), await shot(page, `barge-z1-${t}`, 'tex-barge', ['tex-barge'], { secs: 0.2, zoom: 1 })] },
  pt: { q: 'mission=jp_04&seed=1', f: async (page, t) => [await shot(page, `pt-${t}`, 'tex-pt-boat', ['tex-pt-boat'], { secs: 8 }), await shot(page, `pt-z1-${t}`, 'tex-pt-boat', ['tex-pt-boat'], { secs: 0.2, zoom: 1 })] },
  evac: { q: 'mission=jp_03&seed=1', f: async (page, t) => {
    const r = await R(page, { secs: 3, heading: 180, speed01: 0.4 });
    await page.evaluate(() => { const w = window.__hl.world(); const imgs = w.evacFlights ? w.evacFlights.boats.imgs : null; let n = 0; for (const c of window.__hl.mission().children.list) if (c.texture && c.texture.key === 'tex-boat-jp_t38' && c.visible && n++ % 2 === 1) { c.setTint(0x8796a8); c.setAlpha(0.45); c.setTint = () => c; c.setAlpha = () => c; } return !!imgs; });
    return [r, await shot(page, `evac-${t}`, 'tex-boat-jp_t38', [], { secs: 0.1 }), await shot(page, `evac-z1-${t}`, 'tex-boat-jp_t38', [], { secs: 0.1, zoom: 1 })];
  } },
  kagero: { q: 'mission=us_02&seed=1', f: async (page, t) => [await shot(page, `kagero-${t}`, 'tex-destroyer', ['tex-destroyer'], { secs: 1 }), await shot(page, `kagero-z1-${t}`, 'tex-destroyer', ['tex-destroyer'], { secs: 0.2, zoom: 1 })] },
};
async function main() {
  const { base, close } = await serve(site);
  const browser = await chromium.launch();
  const out = {};
  try {
    for (const t of profs) for (const [name, c] of Object.entries(CASES)) {
      if (ONLY && !ONLY.includes(name)) continue;
      const P = PROFILES[t];
      const { page, ctx, errors } = await openGame(browser, base, c.q, { width: P.width, viewport: P.viewport, dpr: P.dpr });
      await page.evaluate(prep);
      try { out[`${name}-${t}`] = { r: await c.f(page, t), errors }; } catch (e) { out[`${name}-${t}`] = { fail: String(e), errors }; }
      await ctx.close();
    }
  } finally { await browser.close(); await close(); }
  writeFileSync(`${dir}/ip3-shots.json`, JSON.stringify(out, null, 1));
  for (const [k, v] of Object.entries(out)) console.log(k, 'errors', (v.errors || []).length, v.fail || '', JSON.stringify(v.r));
}
main().catch((e) => { console.error(e); process.exit(1); });
