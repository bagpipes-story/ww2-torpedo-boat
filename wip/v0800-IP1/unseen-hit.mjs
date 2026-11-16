// 実機 1 回目の確かめ: us_04 で出発点に止まり、北の道を通る列の艦（目の 900 m の外）へ見越しを解いた 1 本を撃つ。当たり・撃沈・Result の数えを見る。
import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const site = process.env.SITE; const [a, b] = (process.env.SEEDS ?? '1-12').split('-').map(Number); const hard = process.env.HARD === '1';
function run(o) {
  const hl = window.__hl; let st = window.__uh;
  const w0 = hl.world();
  if (!st) st = window.__uh = { phase: 'aim', frames: 0, fire: null, r0: w0.torpedoes.remaining, hits0: 0 };
  for (let k = 0; k < o.frames; k++) {
    if (!hl.active('Mission')) { const R = window.__game.scene.getScene('Result'); return { done: true, why: 'ended', st, texts: hl.texts('Result') }; }
    const w = hl.world(); const B = w.boat.state; const ships = w.destroyers.ships; const vT = w.setup.torpedoParams.speedMps * w.setup.timeScale;
    if (st.phase === 'aim') {
      // 近づいてくる列の艦（西にいて東へ進む・海域の中）で、解ける見越し
      let best = null;
      for (let i = 0; i < ships.length; i++) {
        const d = ships[i]; if (d.out || !d.transitShip || d.state.x > B.x - 300) continue;
        const h = d.state.headingDeg * Math.PI / 180; const ts = w.setup.timeScale; const vx = Math.sin(h) * d.state.speedMps * ts, vy = -Math.cos(h) * d.state.speedMps * ts;
        let t = 0; for (let it = 0; it < 30; it++) { const px = d.state.x + vx * t - B.x, py = d.state.y + vy * t - B.y; t = Math.hypot(px, py) / vT; }
        const px = d.state.x + vx * t, py = d.state.y + vy * t; const dist = Math.hypot(d.state.x - B.x, d.state.y - B.y);
        if (t > 0 && dist < (Number(o.maxd) || 1700) && dist > Math.sqrt(w.visRange2) + 50) { best = { i, hdg: hl.bearing(B.x, B.y, px, py), dist, t }; break; }
      }
      if (best) {
        const err = ((best.hdg - B.headingDeg + 540) % 360) - 180;
        if (Math.abs(err) < 1.0 && B.speedMps < 3) {
          const e = w.enemy.focus(B.x, B.y); const seen = e ? (e.x - B.x) ** 2 + (e.y - B.y) ** 2 <= w.visRange2 : false;
          w.input.fireTap = true; st.phase = 'run'; st.fire = { t: +w.stepTimeS.toFixed(1), target: best.i, dist: Math.round(best.dist), tti: +best.t.toFixed(1), seen, sprVis: ships[best.i].sprite.visible }; st.hits0 = w.hits; st.ft = w.stepTimeS;
          hl.steer(NaN, 0);
        } else hl.steer(best.hdg, Math.abs(err) < 1.0 ? 0 : 0.12);
      } else hl.steer(NaN, 0);
    } else if (st.phase === 'run') {
      hl.steer(NaN, 0); { const d = ships[st.fire.target]; if (d.ai.mode === 'evade') st.evadeS = (st.evadeS || 0) + 1 / 60; const dd = Math.hypot(d.state.x - B.x, d.state.y - B.y); }
      if (w.stepTimeS - st.ft > (st.fire.tti + 12)) {
        const d = ships[st.fire.target];
        st.result = { evadeS: +(st.evadeS || 0).toFixed(1), hitsWorld: w.hits - st.hits0, targetHits: d.hitsTaken, sinking: d.sinking, unseenShots: w.radar.unseenShots, unseenHits: w.radar.unseenHits, fired: st.r0 - w.torpedoes.remaining, shots: w.shots.length, lastShot: w.shots.length ? w.shots[w.shots.length - 1] : null };
        return { done: true, why: 'measured', st };
      }
    }
    hl.frame(o.frameMs); st.frames++;
    if (st.frames > 60 * 200) return { done: true, why: 'timeout', st };
  }
  return { done: false };
}
const srv = await serve(site); const browser = await chromium.launch();
let hits = 0, n = 0;
for (let seed = a; seed <= b; seed++) {
  const { page, ctx, errors } = await openGame(browser, srv.base, `mission=us_04&seed=${seed}${hard ? '&hard' : ''}&noplane`);
  let r; do { r = await page.evaluate(run, { frames: 600, frameMs: FRAME_MS, maxd: process.env.MAXD }); } while (!r.done);
  const f = r.st.fire, x = r.st.result;
  if (x) { n++; if (x.hitsWorld > 0) hits++; }
  console.log(`seed ${seed}: ${r.why} fire ${JSON.stringify(f)} → ${JSON.stringify(x)} errors ${errors.length}`);
  await ctx.close();
}
console.log(`unseen single shots ${n}, hits ${hits}`);
await browser.close(); await srv.close();
