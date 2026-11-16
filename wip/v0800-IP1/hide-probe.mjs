// 実機 1 回目の調べ: us_04 で「見つかる → 岸へ寄って止まる（隠れる）」台本の間、海域の中の艦（out でない）が南北の縁の外（陸）にいるか・
// 絵（sprite）が見えたまま陸の上にあるかを毎フレーム調べる。HIDE=north|south。SEEDS=1-6。HARD=1。
import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const site = process.env.SITE; const hide = process.env.HIDE ?? 'north'; const hard = process.env.HARD === '1';
const [a, b] = (process.env.SEEDS ?? '1-6').split('-').map(Number);
function run(o) {
  const hl = window.__hl; let st = window.__hp;
  if (!st) st = window.__hp = { phase: 'hunt', frames: 0, land: [], visLand: [], detT: NaN, maxOver: 0 };
  for (let k = 0; k < o.frames; k++) {
    if (!hl.active('Mission')) { const r = window.__game.scene.getScene('Result').result; return { done: true, reason: r ? r.reason : 'none', st }; }
    const w = hl.world(); const B = w.boat.state; const H = w.setup.mission.bounds.height;
    const ships = w.destroyers.ships;
    if (st.phase === 'hunt') {
      let near = null, nd = Infinity;
      for (const d of ships) { if (d.out) continue; const dd = Math.hypot(d.state.x - B.x, d.state.y - B.y); if (dd < nd) { nd = dd; near = d; } }
      if (near) hl.steer(hl.bearing(B.x, B.y, near.state.x, near.state.y), 1); else hl.steer(270, 0.5);
      if (ships.some((d) => !d.out && d.ai.playerDetected)) { st.phase = 'run'; st.detT = w.stepTimeS; }
    } else if (st.phase === 'run') {
      const ty = o.hide === 'north' ? 60 : H - 60;
      hl.steer(o.hide === 'north' ? 0 : 180, 1);
      if (Math.abs(B.y - ty) < 80) st.phase = 'hide';
    } else if (st.phase === 'hide' && o.fire && !st.fired) {
      // 隠れた所から通る列の艦へ見越しを解いて 4 本の扇（台本だけの細工）
      let best = null; const ts = w.setup.timeScale; const vT = w.setup.torpedoParams.speedMps * ts;
      for (let i = 0; i < ships.length; i++) { const d = ships[i]; if (d.out || !d.transitShip) continue;
        const h = d.state.headingDeg * Math.PI / 180; const vx = Math.sin(h) * d.state.speedMps * ts, vy = -Math.cos(h) * d.state.speedMps * ts;
        let t = 0; for (let it = 0; it < 30; it++) t = Math.hypot(d.state.x + vx * t - B.x, d.state.y + vy * t - B.y) / vT;
        const dist = Math.hypot(d.state.x - B.x, d.state.y - B.y);
        if (t > 0 && t < 25 && dist < 2000) { best = hl.bearing(B.x, B.y, d.state.x + vx * t, d.state.y + vy * t); break; } }
      if (best !== null) { const err = ((best - B.headingDeg + 540) % 360) - 180;
        if (Math.abs(err) < 1.5) { w.input.fireSalvoSpreadDeg = 4; w.input.fireSalvoCount = 4; st.fired = true; st.fireT = +w.stepTimeS.toFixed(1); hl.steer(NaN, 0); }
        else hl.steer(best, 0.12); } else hl.steer(NaN, 0);
    } else hl.steer(NaN, 0);
    hl.frame(o.frameMs); st.frames++;
    for (let i = 0; i < ships.length; i++) {
      const d = ships[i]; if (d.out) continue;
      const over = Math.max(-d.state.y, d.state.y - H);
      if (over > 0) {
        st.maxOver = Math.max(st.maxOver, over);
        const rec = { t: +w.stepTimeS.toFixed(1), i, col: d.transitShip, mode: d.ai.mode, ret: d.ai.retiring, x: Math.round(d.state.x), y: Math.round(d.state.y), hdg: Math.round(d.state.headingDeg), vis: d.sprite.visible, phase: st.phase };
        if (st.land.length < 400) st.land.push(rec);
      }
    }
  }
  return st.frames >= o.maxFrames ? { done: true, reason: 'max', st } : { done: false };
}
const srv = await serve(site); const browser = await chromium.launch();
for (let seed = a; seed <= b; seed++) {
  const { page, ctx, errors } = await openGame(browser, srv.base, `mission=us_04&seed=${seed}${hard ? '&hard' : ''}`);
  await page.addInitScript(() => {});
  let r; do { r = await page.evaluate(run, { frames: 600, frameMs: FRAME_MS, hide, maxFrames: 60 * 330, fire: process.env.FIRE === '1' }); } while (!r.done);
  const st = r.st; const firstVis = st.land.find((x) => x.vis);
  console.log(`seed ${seed}${hard ? ' hard' : ''} hide ${hide}: end ${r.reason} detected@${Number.isFinite(st.detT) ? st.detT.toFixed(0) : '-'}s phase ${st.phase} fired@${st.fireT ?? '-'} | frames on land ${st.land.length}${st.land.length >= 400 ? '+' : ''} max ${st.maxOver.toFixed(0)} m | first ${JSON.stringify(st.land[0] ?? null)} | first visible ${JSON.stringify(firstVis ?? null)} | errors ${errors.length}`);
  await ctx.close();
}
await browser.close(); await srv.close();
