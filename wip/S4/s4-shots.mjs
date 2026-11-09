// S4 の写し（scratchpad の道具。repo には入れない。S3c の fx3-shots を写して件を S4 の直しに替えた）: jp_03 の岸の帯（南の壕・北の陰）、水柱（外れ・命中を w.splashes で自艇の近くに置く）、
// 沈む駆逐艦の油の輪、命中した駆逐艦と自艇の火災の煙、us_02 ハードの星弾と探照灯、艦の航跡（見張り）。
// 写しのために論理の欄（fireLeftS・takeHit・playSinking・smokeTap）を道具の側で書く（ゲームのコードではない）。A（基準）でも同じ台本で撮れる。
// 実行: SITE=<site> SHOTDIR=<dir> [W=1280,1560] [ONLY=a,b] node fx3-shots.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';

const site = process.env.SITE;
const dir = process.env.SHOTDIR;
mkdirSync(dir, { recursive: true });
const widths = (process.env.W ?? '1280,1560').split(',').map(Number);
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;

function prep() {
  const hl = window.__hl;
  for (const c of hl.mission().children.list) if (c.texture && c.texture.key === 'tex-debug-ring') { c.setVisible(false); c.setVisible = () => c; }
}
function vis() {
  const out = {};
  for (const c of window.__hl.mission().children.list) if (c.visible && c.alpha > 0) { const k = c.texture ? c.texture.key : c.type; out[k] = (out[k] || 0) + 1; }
  return out;
}
function run(o) {
  const hl = window.__hl; const w = hl.world(); const cam = hl.mission().cameras.main;
  const until = o.until;
  for (let k = 0; k < Math.round(o.secs * 60); k++) {
    let hd = o.heading;
    if (o.toward && w.destroyers) { const s = w.destroyers.ships[0].state; const b = w.boat.state; const d = Math.hypot(s.x - b.x, s.y - b.y); hd = (Math.atan2(s.x - b.x, -(s.y - b.y)) * 180) / Math.PI; if (d < (o.stopM ?? 1600)) hd += 100; }
    if (o.south && w.boat.state.y > w.setup.mission.bounds.height - o.south) { hl.steer(90, 0); } else hl.steer(hd, o.speed01);
    hl.frame(o.frameMs);
    if (cam.shakeEffect) cam.shakeEffect.reset();
    if (!hl.active('Mission')) break;
    if (until) {
      let sl = 0; let ss = 0;
      for (const c of hl.mission().children.list) if (c.visible && c.alpha > 0 && c.texture) { if (c.texture.key === 'tex-searchlight') sl++; if (c.texture.key === 'tex-starshell') ss++; }
      if (sl > 0 && ss > 0 && k > 120) break;
    }
  }
  for (let i = 0; i < 70; i++) hl.render();
  const vv = {};
  for (const c of hl.mission().children.list) if (c.visible && c.alpha > 0) { const kk = c.texture ? c.texture.key : c.type; vv[kk] = (vv[kk] || 0) + 1; }
  return { t: w.stepTimeS, x: w.boat.state.x, y: w.boat.state.y, vis: vv };
}
function poke(o) {
  const w = window.__hl.world();
  if (o.fire) w.damage.fireLeftS = 60;
  if (o.smoke) w.input.smokeTap = true;
  if (o.hit != null && w.destroyers) { const s = w.destroyers.ships[o.hit]; s.takeHit(); s.sprite.setVisible(true); s.sprite.setVisible = () => s.sprite; }
  if (o.sink != null && w.destroyers) { const s = w.destroyers.ships[o.sink]; s.sprite.setVisible(true); s.playSinking(w.stepTimeS, () => {}); }
  if (o.look) w.input.lookout = true;
  if (o.splash) { const b = w.boat.state; w.splashes.splash(b.x + 60, b.y - 40, false); w.splashes.splash(b.x - 70, b.y - 60, false); w.splashes.splash(b.x + 10, b.y - 120, true); }
  if (o.at) { const cam = window.__hl.mission().cameras.main; cam.stopFollow(); cam.centerOn(o.at[0], o.at[1] === 'H' ? w.setup.mission.bounds.height + (o.at[2] ?? 0) : o.at[1]); }
  if (o.cam != null && w.destroyers) { const s = w.destroyers.ships[o.cam].state; const cam = window.__hl.mission().cameras.main; cam.stopFollow(); cam.centerOn(s.x, s.y); }
  return true;
}

function where(o) {
  const hl = window.__hl; const w = hl.world(); const cam = hl.mission().cameras.main;
  const s = o.ship != null ? w.destroyers.ships[o.ship].state : w.boat.state;
  const cv = document.querySelector('canvas'); const r = cv.getBoundingClientRect(); const k = r.width / cv.width;
  return { x: r.left + (s.x - cam.worldView.x) * cam.zoom * k, y: r.top + (s.y - cam.worldView.y) * cam.zoom * k };
}
async function detail(page, path, o = {}) {
  const p = await page.evaluate(where, o);
  const W = 260; const H = 150;
  await page.screenshot({ path, clip: { x: Math.max(0, p.x - W / 2), y: Math.max(0, p.y - H / 2), width: W, height: H } });
}
function forceLights() {
  const hl = window.__hl; const w = hl.world(); const b = w.boat.state; const out = [];
  for (const c of hl.mission().children.list) {
    if (!c.texture) continue;
    if (c.texture.key === 'tex-starshell' && !out.includes('star')) { c.setPosition(b.x + 500, b.y - 300); c.setAlpha(0.14); c.setVisible(true); c.setVisible = () => c; c.setAlpha = () => c; c.setPosition = () => c; out.push('star'); }
  }
  return out;
}
const CASES = {
  jp_03: async (page, width) => {
    const r = [];
    r.push(await page.evaluate(run, { frameMs: FRAME_MS, secs: 2, heading: 300, speed01: 0 }));
    for (const [nm, at] of [['cave-mid', [1600, 'H', 30]], ['cave-west', [900, 'H', 30]], ['cover', [2250, 40]], ['cover-west', [1900, 40]]]) {
      await page.evaluate(poke, { at });
      r.push(await page.evaluate(run, { frameMs: FRAME_MS, secs: 0.1, heading: 300, speed01: 0 }));
      await page.screenshot({ path: `${dir}/jp_03-${nm}-w${width}.png` });
    }
    await page.evaluate(poke, { look: true });
    r.push(await page.evaluate(run, { frameMs: FRAME_MS, secs: 1.5, heading: 300, speed01: 0 }));
    for (const [nm, at] of [['cave', [1600, 'H', 30]], ['cover', [2250, 40]]]) {
      await page.evaluate(poke, { at });
      r.push(await page.evaluate(run, { frameMs: FRAME_MS, secs: 0.1, heading: 300, speed01: 0 }));
      await page.screenshot({ path: `${dir}/jp_03-lookout-${nm}-w${width}.png` });
    }
    return r;
  },
  splash: async (page, width) => {
    const r = [];
    r.push(await page.evaluate(run, { frameMs: FRAME_MS, secs: 3, heading: 20, speed01: 0.3 }));
    await page.evaluate(poke, { splash: true });
    r.push(await page.evaluate(run, { frameMs: FRAME_MS, secs: 0.05, heading: 20, speed01: 0.3 }));
    await page.screenshot({ path: `${dir}/splash-w${width}.png` });
    await detail(page, `${dir}/splash-detail-w${width}.png`);
    return r;
  },
  us_02h: async (page, width) => {
    const r = [];
    r.push(await page.evaluate(run, { frameMs: FRAME_MS, secs: 50, toward: true, speed01: 0.6, until: true, stopM: 2300 }));
    r.push(await page.evaluate(forceLights));
    r.push(await page.evaluate(run, { frameMs: FRAME_MS, secs: 0.2, toward: true, speed01: 0.3, stopM: 2300 }));
    await page.screenshot({ path: `${dir}/us_02h-lights-w${width}.png` });
    await page.evaluate(poke, { look: true });
    r.push(await page.evaluate(run, { frameMs: FRAME_MS, secs: 1.5, toward: true, speed01: 0.3, stopM: 2300 }));
    await page.screenshot({ path: `${dir}/us_02h-lights-lookout-w${width}.png` });
    await page.evaluate(poke, { hit: 0, cam: 0 });
    r.push(await page.evaluate(run, { frameMs: FRAME_MS, secs: 2.5, toward: true, speed01: 0.3, stopM: 2300 }));
    await page.screenshot({ path: `${dir}/us_02h-burn-lookout-w${width}.png` });
    await detail(page, `${dir}/us_02h-burn-detail-w${width}.png`, { ship: 0 });
    await page.evaluate(poke, { sink: 1, cam: 1 });
    r.push(await page.evaluate(run, { frameMs: FRAME_MS, secs: 1.0, toward: true, speed01: 0.3, stopM: 2300 }));
    await page.screenshot({ path: `${dir}/us_02h-sink-t10-lookout-w${width}.png` });
    await detail(page, `${dir}/us_02h-sink-t10-detail-w${width}.png`, { ship: 1 });
    r.push(await page.evaluate(run, { frameMs: FRAME_MS, secs: 1.5, toward: true, speed01: 0.3, stopM: 2300 }));
    await detail(page, `${dir}/us_02h-sink-t25-detail-w${width}.png`, { ship: 1 });
    return r;
  },
  us_01: async (page, width) => {
    const r = [];
    r.push(await page.evaluate(run, { frameMs: FRAME_MS, secs: 4, heading: 20, speed01: 0.6 }));
    await page.evaluate(poke, { fire: true });
    r.push(await page.evaluate(run, { frameMs: FRAME_MS, secs: 3, heading: 20, speed01: 0.6 }));
    await page.screenshot({ path: `${dir}/us_01-fire-w${width}.png` });
    await detail(page, `${dir}/us_01-fire-detail-w${width}.png`);
    return r;
  },
};
const QUERY = { us_02h: 'mission=us_02&seed=1&hard', us_01: 'mission=us_01&seed=1', splash: 'mission=us_01&seed=1', jp_03: 'mission=jp_03&seed=1' };

async function main() {
  const { base, close } = await serve(site);
  const browser = await chromium.launch();
  const out = {};
  try {
    for (const width of widths) for (const [name, fn] of Object.entries(CASES)) {
      if (ONLY && !ONLY.includes(name)) continue;
      const { page, ctx, errors } = await openGame(browser, base, QUERY[name], { width, dpr: 2 });
      await page.evaluate(prep);
      try { out[`${name}-w${width}`] = { r: await fn(page, width), errors }; } catch (e) { out[`${name}-w${width}`] = { fail: String(e), errors }; }
      await ctx.close();
    }
  } finally { await browser.close(); await close(); }
  writeFileSync(`${dir}/s4-shots.json`, JSON.stringify(out, null, 1));
  for (const [k, v] of Object.entries(out)) console.log(k, 'errors', (v.errors || []).length, v.fail || '', JSON.stringify((v.r || []).map((x) => x.vis && Object.fromEntries(Object.entries(x.vis).filter(([kk]) => /flame|smoke|splash|searchlight|starshell|Blitter|coast/.test(kk))))));
}
main().catch((e) => { console.error(e); process.exit(1); });
