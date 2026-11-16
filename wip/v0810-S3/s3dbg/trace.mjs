// S3 の担当の調べ（repo に入れない）: 1 夜を anchor-probe と同じ台本で回し、0.5 秒ごとに世界の中を出す
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
window.__trace = function (o) {
  const hl = window.__hl, game = window.__game, out = [];
  for (let k = 0; k < o.frames; k++) {
    const r = window.__ap.run({ ...o, frames: 1 });
    if (r.done) { out.push(JSON.stringify(r.m)); return { done: true, out }; }
    const w = hl.world(), st = window.__apState, b = w.boat.state, g = w.destroyers;
    if (st.frames % 30 === 0 || st.out.fireN > 0) {
      const s = g.ships.map((d, i) => { const dx = d.state.x - b.x, dy = d.state.y - b.y; return i + ':' + d.state.x.toFixed(0) + ',' + d.state.y.toFixed(0) + ' d' + Math.hypot(dx, dy).toFixed(0) + ' v' + d.state.speedMps.toFixed(1) + (d.ai.playerDetected ? ' DET' : '') + (d.anchored ? ' A' : '') + (d.sinking ? ' S' : '') + ' r' + (g.backdrop ? g.backdrop.rangeAt(i, -1).toFixed(0) : '-') + ((g.backdrop && (g.backdrop.behindMask & (1 << i))) ? 'B' : ''); }).join(' | ');
      out.push(w.stepTimeS.toFixed(1) + ' mode' + st.d.mode + ' boat ' + b.x.toFixed(0) + ',' + b.y.toFixed(0) + ' h' + b.headingDeg.toFixed(0) + ' v' + b.speedMps.toFixed(1) + ' band ' + w.band + ' wdet ' + w.detectRangeM.toFixed(0) + ' lit ' + w.enemy.illuminated + ' hp ' + w.damage.hp + ' fire ' + st.out.fireN + ' | ' + s);
    }
  }
  return { done: false, out };
};`;
const code = (await require('esbuild').build({ stdin: { contents: page, resolveDir: R, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', write: false, logLevel: 'silent' })).outputFiles[0].text;
const seed = Number(process.env.SEED ?? 3), policy = process.env.POL ?? 'shore_east', hard = process.env.HARD === '1';
const rd = (f) => JSON.parse(readFileSync(join('/home/user/ww2-torpedo-boat/data', f), 'utf8'));
const m = rd('missions_seed.json').missions.find((x) => x.id === 'us_06'); const p = m.v0_1_prototype; const hr = rd('hit_rate_model.json');
const tp = rd('torpedoes.json').torpedoes.find((x) => x.id === m.torpedo_type);
const np = { uzX: p.enemy_start.x_m, uzY: p.enemy_start.y_m, trX: p.transport.start.x_m, trY: p.transport.start.y_m, torpScreenMps: (tp.settings[tp.default_setting].speed_kt * 1852 / 3600) * hr.world.time_scale, spacingDeg: hr.torpedo_launch.salvo_spacing_deg };
const sv = await serve(process.env.SITE);
const browser = await chromium.launch();
const tc = () => { const t0 = Date.now(); Date.now = () => t0 + (window.__hl ? window.__hl.t : 0); };
const q = `mission=us_06&seed=${seed}${hard ? '&hard' : ''}${policy === 'shore_east_nb' ? '&nobackdrop' : ''}`;
const { page: pg, ctx, errors } = await openGame(browser, sv.base, q, { width: 1560, init: tc });
await pg.addScriptTag({ content: code });
let r;
do { r = await pg.evaluate((o) => window.__trace(o), { policy, seed, np, frames: 600, frameMs: FRAME_MS, maxFrames: 1600 * 60 }); for (const l of r.out) console.log(l); } while (!r.done);
console.log('errors', errors);
await ctx.close(); await browser.close(); await sv.close();
