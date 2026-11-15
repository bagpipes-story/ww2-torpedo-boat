// v0.8.0 S0 の確かめ（門ではない）: ビルドした site で ?debug&mission=us_04 が us_04 の世界（護衛の駆逐艦 1 隻）で始まり、夜明けの後まで回してもページのエラーが無いか。
// 実行: node us04-smoke.mjs <repo> <site>（repo の scripts/headless/lib.mjs を使う）
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const [repo, site] = process.argv.slice(2);
const { FRAME_MS, chromium, openGame, serve } = await import(pathToFileURL(join(repo, 'scripts', 'headless', 'lib.mjs')).href);
const srv = await serve(site);
const browser = await chromium.launch();
const out = [];
try {
  for (const q of ['mission=us_04&seed=1', 'mission=us_04&seed=2&hard', 'mission=us_02&seed=1']) {
    const { page, ctx, errors } = await openGame(browser, srv.base, q, { width: 1560 });
    try {
      const r = await page.evaluate(({ frameMs, secs }) => {
        const hl = window.__hl;
        const w0 = hl.world();
        const id = w0.setup.mission.id;
        const keys = ['radar', 'transit', 'shores'].filter((k) => k in w0.setup);
        let frames = 0;
        // 西へ静音で少し走ってから止まる（夜明けの後まで）
        for (; frames < secs * 60 && hl.active('Mission'); frames++) {
          hl.steer(270, frames < 600 ? 0.4 : 0);
          hl.frame(frameMs);
        }
        const w = hl.world();
        return { id, keys, ships: w0.setup.destroyer ? w0.setup.destroyer.starts.length : -1, frames, missionActive: hl.active('Mission'), resultActive: hl.active('Result'), t: w ? w.stepTimeS : null };
      }, { frameMs: FRAME_MS, secs: 300 });
      out.push({ q, ...r, errors });
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await srv.close();
}
for (const o of out) console.log(JSON.stringify(o));
const bad = out.filter((o) => o.errors.length > 0);
console.log(bad.length === 0 ? 'SMOKE OK' : `SMOKE NG ${bad.length}`);
process.exit(bad.length === 0 ? 0 : 1);
