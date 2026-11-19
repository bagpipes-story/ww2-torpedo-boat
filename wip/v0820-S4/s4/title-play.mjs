// v0.8.2 S4 check (scratchpad tool, not in the repo; copy of the v0.8.1 S4 tool with us_05 instead of us_06): the Title as a user sees it, headless, with real CDP touch events (adapted from v0611/impl/S6check/play.mjs).
// dump: A=<base site> B=<S5 site> OUT=<dir> [W=1280,1584] node title-play.mjs dump
//   For each width and each storage state, dumps every object of the Title scene (type, position, size, colours, alpha, depth, text, font) on both builds and compares:
//   state fresh (nothing stored) / us06 (cleared = us_04 and us_06 only) / us123 (cleared = us_01..03, never us_06) -> the US tab view (and the JP tab button's status line);
//   state jp (cleared us_01..03 + unlocked jp_hard, then a touch on the JP tab) -> the JP tab view (must be object-identical A vs B).
//   Screenshots of B (and A) per width/state.
// play: SITE=<site> OUT=<dir> [W=1280,1560] [MODES=normal,hard] [SECS=20] node title-play.mjs play
//   Title -> touch the US tab -> (hard: touch the difficulty toggle) -> touch the us_06 card -> Briefing -> touch 出撃 -> hold the stick ~SECS s (mission time).
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';

const MODE = process.argv[2] ?? 'dump';
const out = process.env.OUT;
mkdirSync(out, { recursive: true });
const VP = { 1280: { width: 667, height: 375 }, 1560: { width: 852, height: 393 }, 1584: { width: 880, height: 400 } };

function pageInit() {
  window.requestAnimationFrame = () => 0;
  window.cancelAnimationFrame = () => {};
  try {
    const st = window.__STORE__ || {};
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v);
  } catch {}
  const hl = {
    t: 0,
    frame(d) { hl.t += d; window.__game.headlessStep(hl.t, d); },
    render() { window.__game.step(hl.t, 0); },
    active(k) { const g = window.__game; return g ? g.scene.isActive(k) : false; },
    scene(k) { return window.__game.scene.getScene(k); },
    css(key, lx, ly) {
      const g = window.__game; const cam = g.scene.getScene(key).cameras.main;
      const sx = (lx - cam.scrollX - cam.width * cam.originX) * cam.zoom + cam.width * cam.originX + cam.x;
      const sy = (ly - cam.scrollY - cam.height * cam.originY) * cam.zoom + cam.height * cam.originY + cam.y;
      const r = g.canvas.getBoundingClientRect();
      return { x: r.left + (sx * r.width) / g.scale.width, y: r.top + (sy * r.height) / g.scale.height };
    },
    logicalW(key) { const cam = window.__game.scene.getScene(key).cameras.main; return cam.width / cam.zoom; },
    dump(key) {
      const g = window.__game; if (!g.scene.isActive(key)) return [];
      const r6 = (v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v);
      return g.scene.getScene(key).children.list.map((o) => {
        const d = { type: o.type, x: r6(o.x), y: r6(o.y), ox: r6(o.originX), oy: r6(o.originY), a: r6(o.alpha), v: o.visible, d: o.depth, sx: r6(o.scaleX), sy: r6(o.scaleY), ang: r6(o.angle), inp: o.input ? o.input.enabled : null };
        if (o.type === 'Text') Object.assign(d, { text: o.text, px: o.style.fontSize, color: o.style.color, font: o.style.fontFamily, w: r6(o.width), h: r6(o.height), wrap: o.style.wordWrapWidth });
        if (o.type === 'Rectangle') Object.assign(d, { w: r6(o.width), h: r6(o.height), fill: o.fillColor, fa: r6(o.fillAlpha), stroke: o.strokeColor, lw: o.lineWidth, sa: r6(o.strokeAlpha), isF: o.isFilled, isS: o.isStroked });
        if (o.type === 'Image' || o.type === 'Sprite') Object.assign(d, { tex: o.texture ? o.texture.key : '', tint: o.tintTopLeft });
        return d;
      });
    },
  };
  window.__hl = hl;
}

async function step(page, n) { await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__hl.frame(1000 / 60); }, n); }

/** open the Title (?debug&title) with the given localStorage; returns helpers */
async function openTitle(browser, base, width, store) {
  const ctx = await browser.newContext({ viewport: VP[width], deviceScaleFactor: 2, hasTouch: true, isMobile: false });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e && e.message ? e.message : e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  await page.addInitScript((s) => { window.__STORE__ = s; }, store);
  await page.addInitScript(pageInit);
  const cdp = await ctx.newCDPSession(page);
  const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const tapAt = async (key, lx, ly) => {
    await page.evaluate(() => window.__hl.render());
    const c = await page.evaluate(([k, x, y]) => window.__hl.css(k, x, y), [key, lx, ly]);
    await touch('touchStart', [{ x: c.x, y: c.y, id: 9, radiusX: 4, radiusY: 4, force: 1 }]); await step(page, 3);
    await touch('touchEnd', []); await step(page, 2);
    return c;
  };
  await page.goto(`${base}?debug&title&nosw`);
  await page.waitForFunction(() => window.__game && window.__game.isBooted, null, { timeout: 60000 });
  for (let i = 0; i < 400; i++) { if (await page.evaluate(() => window.__hl.active('Title'))) break; await step(page, 1); await page.waitForTimeout(10); }
  await step(page, 40);
  return { ctx, page, errors, cdp, touch, tapAt };
}

const tabsOf = (page) => page.evaluate(() => window.__hl.scene('Title').tabs.map((t) => ({ x: t.rect.x, y: t.rect.y, title: t.titleText.text, sub: t.subText ? t.subText.text : '', en: t.enabled })));
const rowsOf = (page) => page.evaluate(() => window.__hl.scene('Title').rows.map((r) => ({ x: r.rect.x, y: r.rect.y, w: r.rect.width, h: r.rect.height, title: r.titleText.text, sub: r.subText ? r.subText.text : '', en: r.enabled })));

const CLEARED = 'night-hunters.cleared';
const UNLOCKED = 'night-hunters.unlocked';
const STATES = {
  fresh: {},
  us456: { [CLEARED]: JSON.stringify(['us_04', 'us_05', 'us_06']) },
  us123: { [CLEARED]: JSON.stringify(['us_01', 'us_02', 'us_03']) },
  jp: { [CLEARED]: JSON.stringify(['us_01', 'us_02', 'us_03']), [UNLOCKED]: JSON.stringify(['jp_hard']) },
};

async function dumpOne(browser, base, width, state, tag) {
  const g = await openTitle(browser, base, width, STATES[state]);
  try {
    if (state === 'jp') {
      const jt = (await tabsOf(g.page)).find((t) => t.title.includes('日本'));
      await g.tapAt('Title', jt.x, jt.y);
      await step(g.page, 40);
    }
    await g.page.evaluate(() => window.__hl.render());
    const objs = await g.page.evaluate(() => window.__hl.dump('Title'));
    const tabs = await tabsOf(g.page);
    const rows = await rowsOf(g.page);
    const lw = await g.page.evaluate(() => window.__hl.logicalW('Title'));
    const stored = await g.page.evaluate(([a, b]) => ({ cleared: localStorage.getItem(a), unlocked: localStorage.getItem(b) }), [CLEARED, UNLOCKED]);
    const shot = `${out}/title-${state}-w${width}-${tag}.png`;
    await g.page.screenshot({ path: shot });
    return { objs, tabs, rows, lw, stored, shot, errors: g.errors };
  } finally { await g.ctx.close(); }
}

async function dump() {
  const widths = (process.env.W ?? '1280,1584').split(',').map(Number);
  const sa = await serve(process.env.A); const sb = await serve(process.env.B);
  const browser = await chromium.launch();
  const res = [];
  for (const width of widths) for (const state of Object.keys(STATES)) {
    const a = await dumpOne(browser, sa.base, width, state, 'A');
    const b = await dumpOne(browser, sb.base, width, state, 'B');
    const ja = a.objs.map((o) => JSON.stringify(o)); const jb = b.objs.map((o) => JSON.stringify(o));
    const same = ja.length === jb.length && ja.every((s, i) => s === jb[i]);
    const onlyA = ja.filter((s) => !jb.includes(s)); const onlyB = jb.filter((s) => !ja.includes(s));
    res.push({ width, state, lw: [a.lw, b.lw], n: [ja.length, jb.length], same, onlyA, onlyB, tabsA: a.tabs, tabsB: b.tabs, rowsA: a.rows, rowsB: b.rows, storedB: b.stored, errors: [...a.errors.map((e) => `A: ${e}`), ...b.errors.map((e) => `B: ${e}`)], shots: [a.shot, b.shot] });
    console.log(`W ${width} (logical ${a.lw}/${b.lw}) ${state.padEnd(5)} objects A ${ja.length} B ${jb.length} same:${same} onlyA ${onlyA.length} onlyB ${onlyB.length} | tabs B ${b.tabs.map((t) => `${t.title}「${t.sub}」${t.en ? '' : '(off)'}`).join(' / ')} | rows B ${b.rows.map((r) => `${r.title}[${r.x},${r.y},${r.w}]「${r.sub}」`).join(' ; ')} | errors ${a.errors.length + b.errors.length}`);
  }
  await browser.close(); await sa.close(); await sb.close();
  writeFileSync(`${out}/title-dump.json`, JSON.stringify(res, null, 1));
}

async function play() {
  const widths = (process.env.W ?? '1280,1560').split(',').map(Number);
  const modes = (process.env.MODES ?? 'normal,hard').split(',');
  const secs = Number(process.env.SECS ?? 20);
  const s = await serve(process.env.SITE);
  const browser = await chromium.launch();
  const all = [];
  for (const width of widths) for (const mode of modes) {
    const g = await openTitle(browser, s.base, width, {});
    const rec = { width, mode, steps: [], errors: g.errors, labels: {}, shots: [] };
    // in-mission shots: render 40 times first (the camera follow runs in preRender; headlessStep alone does not move the camera)
    const shot = async (tag) => { await g.page.evaluate((n) => { for (let i = 0; i < n; i++) window.__hl.render(); }, tag.startsWith('m') ? 40 : 1); const p = `${out}/play-${tag}-${mode}-w${width}.png`; await g.page.screenshot({ path: p }); rec.shots.push(p); };
    const label = (key) => g.page.evaluate((k) => { const s = window.__hl.scene(k); const t = s.children.list.find((o) => o.type === 'Text' && /@[0-9a-f]{7}/.test(o.text)); return t ? { text: t.text, v: t.visible, a: t.alpha, x: t.x, y: t.y } : null; }, key);
    try {
      const ut = (await tabsOf(g.page)).find((t) => t.title.includes('米PT'));
      await g.tapAt('Title', ut.x, ut.y); await step(g.page, 40); rec.steps.push('US tab');
      if (mode === 'hard') {
        const d = await g.page.evaluate(() => { const b = window.__hl.scene('Title').diff; return { x: b.rect.x, y: b.rect.y }; });
        await g.tapAt('Title', d.x, d.y); await step(g.page, 5); rec.steps.push('difficulty');
      }
      rec.rows = await rowsOf(g.page);
      rec.labels.Title = await label('Title');
      await shot('title');
      const r4 = rec.rows.find((r) => r.title === 'スリガオ海峡・最初の接触');
      if (!r4) throw new Error(`us_05 card not found ${JSON.stringify(rec.rows.map((r) => r.title))}`);
      await g.tapAt('Title', r4.x, r4.y); await step(g.page, 40);
      if (!(await g.page.evaluate(() => window.__hl.active('Briefing')))) throw new Error('Briefing did not open');
      rec.steps.push('us_05 card');
      rec.brief = await g.page.evaluate(() => { const s = window.__hl.scene('Briefing'); return { sortie: s.sortie ? { id: s.sortie.missionId, seed: s.sortie.seed, hard: s.sortie.hard } : null, texts: s.children.list.filter((o) => o.type === 'Text').map((o) => o.text) }; });
      rec.labels.Briefing = await label('Briefing');
      await shot('briefing');
      const go = await g.page.evaluate(() => { const b = window.__hl.scene('Briefing').go; return { x: b.rect.x, y: b.rect.y }; });
      await g.tapAt('Briefing', go.x, go.y);
      for (let i = 0; i < 60 && !(await g.page.evaluate(() => window.__hl.active('Hud') && window.__hl.scene('Mission').world)); i++) await step(g.page, 1);
      if (!(await g.page.evaluate(() => window.__hl.active('Hud')))) throw new Error('Mission did not open');
      rec.steps.push('出撃');
      rec.mission = await g.page.evaluate(() => { const m = window.__hl.scene('Mission'); const w = m.world; return { sortie: { ...m.sortie }, hard: w.setup.hard, radar: !!w.radar, recon: !!w.recon, magazine: !!(w.destroyers && w.destroyers.magazine), roles: !!(w.destroyers && w.destroyers.roles), ships: w.destroyers ? w.destroyers.ships.length : 0 }; });
      // stick: press at its base, tilt toward 160° (south-south-east, toward the beach east of Uzuki) at ~60%, hold for secs of mission time
      const stick = await g.page.evaluate(() => { const st = window.__hl.scene('Hud').stick; return { x: st.base.x, y: st.base.y }; });
      const c0 = await g.page.evaluate(([x, y]) => window.__hl.css('Hud', x, y), [stick.x, stick.y]);
      const R = 110 * 0.6; const hdg = 250;
      const c1 = await g.page.evaluate(([x, y]) => window.__hl.css('Hud', x, y), [stick.x + Math.sin((hdg * Math.PI) / 180) * R, stick.y - Math.cos((hdg * Math.PI) / 180) * R]);
      await g.touch('touchStart', [{ x: c0.x, y: c0.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }]); await step(g.page, 2);
      await g.touch('touchMove', [{ x: c1.x, y: c1.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }]);
      let t = 0; let shot10 = false;
      for (let k = 0; k < 60 * (secs + 10) && t < secs; k += 6) {
        await step(g.page, 6);
        const st = await g.page.evaluate(() => { const w = window.__hl.scene('Mission').world; return w ? { t: w.stepTimeS, stick: w.input.stickActive, sp: w.input.speed01, hd: w.input.headingDeg, v: w.boat.state.speedMps, h: w.boat.state.headingDeg, x: w.boat.state.x, y: w.boat.state.y } : null; });
        if (!st) break;
        t = st.t; rec.last = st;
        if (!shot10 && t >= secs / 2) { shot10 = true; await shot('m10'); }
      }
      rec.labels.Hud = await label('Hud');
      await shot('m20');
      await g.touch('touchEnd', []); await step(g.page, 2);
      rec.hud = await g.page.evaluate(() => window.__hl.scene('Hud').children.list.filter((o) => o.type === 'Text' && o.visible && o.text).map((o) => o.text));
    } catch (e) { rec.fatal = String(e && e.stack ? e.stack : e); }
    finally {
      console.log(`W ${width} ${mode}: steps ${rec.steps.join(' → ')} | Briefing sortie ${JSON.stringify(rec.brief && rec.brief.sortie)} | mission ${JSON.stringify(rec.mission)} | last ${JSON.stringify(rec.last)} | labels ${Object.entries(rec.labels).map(([k, v]) => `${k}:${v ? `${v.text}(v ${v.v} a ${v.a})` : 'none'}`).join(' ')} | page errors ${rec.errors.length}${rec.errors.length ? ` [${rec.errors.slice(0, 3).join(' | ')}]` : ''}${rec.fatal ? ` FATAL ${rec.fatal}` : ''}`);
      all.push(rec);
      await g.ctx.close();
    }
  }
  await browser.close(); await s.close();
  writeFileSync(`${out}/play.json`, JSON.stringify(all, null, 1));
}

if (MODE === 'dump') await dump(); else await play();
