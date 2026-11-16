// S3 の担当の画面写し（repo に入れない）: shore_east の 1 夜（W 1280）を anchor-probe と同じ台本で回し、浜で背に岸が効いている時と扇を撃った直後を写す
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const R = '/home/user/ww2-torpedo-boat/scripts/headless';
const { FRAME_MS, chromium, openGame, serve } = await import(R + '/lib.mjs');
const require = createRequire(R + '/x.mjs');
const src = readFileSync(R + '/anchor-probe.mjs', 'utf8');
let page = src.slice(src.indexOf('const PAGE = `') + 14, src.indexOf('`;\n\n/** Briefing'));
page = page.replace(/\$\{HERE\}/g, R);
page += `
window.__shot = function (o) {
  const hl = window.__hl, game = window.__game;
  for (let k = 0; k < o.frames; k++) {
    const r = window.__ap.run({ ...o, frames: 1 });
    if (r.done) return { done: true };
    const st = window.__apState, t = game.registry.get('boatTelemetry'), b = hl.world().boat.state;
    if (o.want === 'beach' && st.d.mode === 1 && b.y > 2800 && b.x < 4300 && t.anchor && t.anchor.backdropOn) return { done: false, hit: 'beach', t: hl.world().stepTimeS, x: b.x, y: b.y, range: t.detectRangeM };
    if (o.want === 'fan' && st.fan > 0) { st.after = (st.after ?? 0) + 1; if (st.after >= 90) return { done: false, hit: 'fan', t: hl.world().stepTimeS, x: b.x, y: b.y }; }
  }
  return { done: false };
};`;
const code = (await require('esbuild').build({ stdin: { contents: page, resolveDir: R, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', write: false, logLevel: 'silent' })).outputFiles[0].text;
const rd = (f) => JSON.parse(readFileSync(join('/home/user/ww2-torpedo-boat/data', f), 'utf8'));
const m = rd('missions_seed.json').missions.find((x) => x.id === 'us_06'); const p = m.v0_1_prototype; const hr = rd('hit_rate_model.json');
const tp = rd('torpedoes.json').torpedoes.find((x) => x.id === m.torpedo_type);
const np = { uzX: p.enemy_start.x_m, uzY: p.enemy_start.y_m, trX: p.transport.start.x_m, trY: p.transport.start.y_m, torpScreenMps: (tp.settings[tp.default_setting].speed_kt * 1852 / 3600) * hr.world.time_scale, spacingDeg: hr.torpedo_launch.salvo_spacing_deg };
const sv = await serve(process.env.SITE);
const browser = await chromium.launch();
const tc = () => { const t0 = Date.now(); Date.now = () => t0 + (window.__hl ? window.__hl.t : 0); };
const seed = Number(process.env.SEED ?? 1);
const { page: pg, ctx, errors } = await openGame(browser, sv.base, `mission=us_06&seed=${seed}`, { width: 1280, dpr: 2, init: tc });
await pg.addScriptTag({ content: code });
for (const want of ['beach', 'fan']) {
  let r;
  do r = await pg.evaluate((o) => window.__shot(o), { policy: 'shore_east', seed, np, frames: 600, frameMs: FRAME_MS, maxFrames: 1600 * 60, want }); while (!r.done && !r.hit);
  console.log(want, JSON.stringify(r));
  if (r.hit) {
    await pg.evaluate(() => { const m = window.__hl.mission(); for (const c of m.children.list) if (c.texture && c.texture.key === 'tex-debug-ring') c.setVisible(false); for (let i = 0; i < 60; i++) window.__hl.render(); });
    await pg.screenshot({ path: `${process.env.OUT}/us06-shore_east-${want === 'beach' ? 'beach-backdrop' : 'fan'}-seed${seed}-w1280.png` });
  }
}
console.log('errors', errors);
await ctx.close(); await browser.close(); await sv.close();
