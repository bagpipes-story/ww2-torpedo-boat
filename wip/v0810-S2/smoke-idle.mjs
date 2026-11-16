// 出発点で止まったまま夜明けを越える（us_06 seed 1 ノーマル・ハード）: 夜明けに卯月が遅れなしで動き出して東へ退き、空知丸は動かない
import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const sv = await serve(process.env.SITE);
const browser = await chromium.launch();
for (const hard of [false, true]) {
  const { page, ctx, errors } = await openGame(browser, sv.base, `mission=us_06&seed=1${hard ? '&hard' : ''}`, { width: 1280 });
  const r = await page.evaluate((o) => {
    const hl = window.__hl; const w = hl.world(); const g = w.destroyers; const uz = g.ships[0]; const sm = g.ships[1];
    const uz0 = [uz.state.x, uz.state.y]; const sm0 = [sm.state.x, sm.state.y];
    const snap = () => ({ t: +w.stepTimeS.toFixed(2), dawn: w.dawn.reached, uz: [Math.round(uz.state.x), Math.round(uz.state.y), Math.round(uz.state.headingDeg), +uz.state.speedMps.toFixed(1), uz.anchored, uz.ai.mode, uz.withdrawn], sm: [sm.state.x === sm0[0] && sm.state.y === sm0[1], sm.anchored, sm.ai.retiring, sm.withdrawn], stage: Array.from(g.anchors.state.stage), reason: Array.from(g.anchors.state.reason), allOut: g.allOut, active: hl.active('Mission') });
    const out = [];
    let movedBeforeDawn = 0;
    for (let k = 0; k < 60 * 300 && hl.active('Mission'); k++) {
      hl.steer(NaN, 0); hl.frame(o.frameMs);
      if (!w.dawn.reached && (uz.state.x !== uz0[0] || uz.state.y !== uz0[1])) movedBeforeDawn++;
      if (k === 60 * 199 || k === 60 * 201 || k === 60 * 230 || k === 60 * 299) out.push(snap());
    }
    return { out, movedBeforeDawn, ships: g.ships.length };
  }, { frameMs: FRAME_MS });
  console.log(hard ? 'hard' : 'normal', JSON.stringify(r), 'errors', JSON.stringify(errors));
  await ctx.close();
}
await browser.close(); await sv.close();
