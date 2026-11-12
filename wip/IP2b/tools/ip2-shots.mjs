// IP2b: 輸送船 2 件を足した。IP2 の写し（scratchpad の道具。repo には入れない）: 砲撃・爆撃の命中の爆発（夜 us_02・昼 jp_03）、魚雷の命中の水柱の順（us_02 の駆逐艦）、駆逐艦 3 種（既定ズーム・寄り・見張り）。
// 写しのために論理の欄（events・takeHit）とカメラを道具の側で書く（ゲームのコードではない）。A（基準）でも同じ台本で撮れる。
// 実行: SITE=<site> SHOTDIR=<dir> [W=1280,1560] [ONLY=a,b] node ip2-shots.mjs
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
/** n 秒進める（自艇は止まる・カメラは at に。最大の見える物を数える） */
function run(o) {
  const hl = window.__hl; const w = hl.world(); const cam = hl.mission().cameras.main;
  let maxVis = 0;
  for (let k = 0; k < Math.round(o.secs * 60); k++) {
    if (o.toward && w.destroyers) { const s = w.destroyers.ships[0].state; const b = w.boat.state; const d = Math.hypot(s.x - b.x, s.y - b.y); let hd = (Math.atan2(s.x - b.x, -(s.y - b.y)) * 180) / Math.PI; if (d < 1500) hd += 100; hl.steer(hd, 0.6); }
    else hl.steer(o.heading ?? NaN, o.speed01 ?? 0);
    if (o.look) w.input.lookout = true;
    hl.frame(o.frameMs);
    if (cam.shakeEffect) cam.shakeEffect.reset();
    if (o.camKey) { for (const c of hl.mission().children.list) if (c.texture && c.texture.key === o.camKey && c.visible) { cam.stopFollow(); cam.centerOn(c.x, c.y - (o.camDy ?? 0)); break; } }
    else if (o.camAt) { cam.stopFollow(); cam.centerOn(o.camAt[0], o.camAt[1]); }
    if (!hl.active('Mission')) break;
    let n = 0; for (const c of hl.mission().children.list) if (c.visible && c.alpha > 0) n++; maxVis = Math.max(maxVis, n);
  }
  for (let i = 0; i < 3; i++) hl.render();
  let all = 0; for (const c of hl.mission().children.list) if (c.visible && c.alpha > 0) all++;
  return { t: w.stepTimeS, all, maxVis };
}
function shipAt(key) {
  for (const c of window.__hl.mission().children.list) if (c.texture && c.texture.key === key) return [c.x, c.y];
  return null;
}
function boom(o) {
  const w = window.__hl.world();
  if (o.kind === 'torpedo') { const s = w.destroyers.ships[0]; s.sprite.setVisible(true); s.sprite.setVisible = () => s.sprite; w.events.onTorpedoHit(s.state.x, s.state.y, false); s.takeHit(); return [s.state.x, s.state.y]; }
  const x = o.at ? o.at[0] : w.boat.state.x + 60; const y = o.at ? o.at[1] : w.boat.state.y - 40;
  w.events.onShellHit(x, y, false, false);
  return [x, y];
}
async function detail(page, path, at, W = 300, H = 180) {
  const p = await page.evaluate((at) => {
    const hl = window.__hl; const cam = hl.mission().cameras.main;
    const cv = document.querySelector('canvas'); const r = cv.getBoundingClientRect(); const k = r.width / cv.width;
    return { x: r.left + (at[0] - cam.worldView.x) * cam.zoom * k, y: r.top + (at[1] - cam.worldView.y) * cam.zoom * k };
  }, at);
  await page.screenshot({ path, clip: { x: Math.max(0, p.x - W / 2), y: Math.max(0, p.y - H / 2), width: W, height: H } });
}
const R = (page, o) => page.evaluate(run, { frameMs: FRAME_MS, ...o });
const CASES = {
  // 砲撃・爆撃の命中（大きい版の爆発。onShellHit small=false）: 夜の海（us_02）
  gun_night: async (page, width) => {
    const r = [];
    r.push(await R(page, { secs: 2 }));
    const at = await page.evaluate(boom, { kind: 'shell' });
    for (const [secs, lab] of [[0.05, 't005'], [0.1, 't015'], [0.2, 't035'], [0.35, 't070']]) {
      r.push(await R(page, { secs, camAt: at }));
      await page.screenshot({ path: `${dir}/gun_night-${lab}-w${width}.png` });
      await detail(page, `${dir}/gun_night-${lab}-detail-w${width}.png`, at, 320, 200);
    }
    return r;
  },
  // 昼の海（jp_03）
  bomb_day: async (page, width) => {
    const r = [];
    r.push(await R(page, { secs: 2 }));
    const at = await page.evaluate(boom, { kind: 'shell' });
    for (const [secs, lab] of [[0.05, 't005'], [0.1, 't015'], [0.2, 't035'], [0.35, 't070']]) {
      r.push(await R(page, { secs, camAt: at }));
      await page.screenshot({ path: `${dir}/bomb_day-${lab}-w${width}.png` });
      await detail(page, `${dir}/bomb_day-${lab}-detail-w${width}.png`, at, 320, 200);
    }
    return r;
  },
  // 魚雷の命中の順（us_02 の駆逐艦。カメラを柱の中ほどに）
  torpedo: async (page, width) => {
    const r = [];
    r.push(await R(page, { secs: 30, toward: true }));
    const at = await page.evaluate(boom, { kind: 'torpedo' });
    const cam = [at[0], at[1] - 60];
    let t = 0;
    for (const T of [0.15, 0.35, 0.6, 1.0, 1.5, 2.0, 2.6, 3.2, 4.2, 5.5]) {
      r.push(await R(page, { secs: T - t, camAt: cam }));
      t = T;
      const lab = `t${String(Math.round(T * 100)).padStart(3, '0')}`;
      await page.screenshot({ path: `${dir}/torpedo-${lab}-w${width}.png` });
      await detail(page, `${dir}/torpedo-${lab}-detail-w${width}.png`, cam, 300, 260);
    }
    return r;
  },
  // 駆逐艦（既定ズーム・寄り・見張り）
  kagero: async (page, width) => ships(page, width, 'kagero', 'tex-destroyer', true),
  fletcher: async (page, width) => ships(page, width, 'fletcher', 'tex-destroyer-us', true),
  mutsuki: async (page, width) => ships(page, width, 'mutsuki', 'tex-destroyer-friendly', false),
  transport: async (page, width) => ships(page, width, 'transport', 'tex-transport', true),
  transportf: async (page, width) => ships(page, width, 'transportf', 'tex-transport-friendly', false),
};
async function ships(page, width, name, key, reveal) {
  const r = [];
  if (reveal) await page.evaluate(() => { const w = window.__hl.world(); if (w.destroyers) for (const s of w.destroyers.ships) { s.sprite.setVisible(true); s.sprite.setAlpha(1); s.sprite.setVisible = () => s.sprite; s.sprite.setAlpha = () => s.sprite; } });
  r.push(await R(page, { secs: 1, camKey: key }));
  const at = await page.evaluate(shipAt, key);
  await page.screenshot({ path: `${dir}/${name}-w${width}.png` });
  await detail(page, `${dir}/${name}-detail-w${width}.png`, at, 260, 260);
  await detail(page, `${dir}/${name}-close-w${width}.png`, at, 170, 120);
  r.push(await R(page, { secs: 1.5, camKey: key, look: true }));
  await page.screenshot({ path: `${dir}/${name}-lookout-w${width}.png` });
  return r;
}
const QUERY = { gun_night: 'mission=us_02&seed=1', bomb_day: 'mission=jp_03&seed=1', torpedo: 'mission=us_02&seed=1', kagero: 'mission=us_02&seed=1', fletcher: 'mission=jp_06&seed=1', mutsuki: 'mission=jp_04&seed=2', transport: 'mission=us_02&seed=1', transportf: 'mission=jp_04&seed=2' };

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
  writeFileSync(`${dir}/ip2-shots.json`, JSON.stringify(out, null, 1));
  for (const [k, v] of Object.entries(out)) console.log(k, 'errors', (v.errors || []).length, v.fail || '', JSON.stringify((v.r || []).map((x) => x && [x.t && x.t.toFixed(1), x.all, x.maxVis])));
}
main().catch((e) => { console.error(e); process.exit(1); });
