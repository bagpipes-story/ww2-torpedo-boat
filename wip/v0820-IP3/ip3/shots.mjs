// v0.8.2 IP3 の画面写し（scratch）: 中継の輪と隣の分隊の艇（game の zoom）・無線の故障と中継の印・中継した。W 1280・1560・dpr 2。台本は測るためだけ（世界を書き換える）
import { mkdirSync } from 'node:fs';
import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
function night(o) {
  const hl = window.__hl, w = hl.world(), st = w.recon.state;
  const put = (x, y, h) => { const b = w.boat.state; b.x = x; b.y = y; b.speedMps = 0; if (h !== undefined) b.headingDeg = h; };
  const line2 = () => { const s = window.__game.scene.getScene('Hud'); const t = s.children.list.find((x) => x.type === 'Text' && x.y > 20 && x.y < 60 && x.originX === 0.5); return t ? t.text : ''; };
  let mark = -1;
  for (let k = 0; k < 60 * 265 && hl.active('Mission'); k++) {
    w.damage.hp = w.damageParams.maxHp;
    if (o.kind === 'relay') { put(1600, 830, 0); if (k > 60 * 8) break; }
    else if (o.kind === 'radio') {
      put(3000, 950);
      if (!st.radioBroken && st.stage === 1 && st.trackedS >= w.recon.plan.trackS - 1) { st.radioBroken = true; st.radioBrokenAtS = st.clockS; }
      if (st.stage === 3 && mark < 0) mark = k;
      if (mark >= 0 && k >= mark + 30) break;
    } else if (o.kind === 'relayed') {
      if (st.stage !== 3 && st.stage < 4) put(3000, 950);
      if (!st.radioBroken && st.stage === 1 && st.trackedS >= w.recon.plan.trackS - 1) { st.radioBroken = true; st.radioBrokenAtS = st.clockS; }
      if (st.stage === 3) put(1600, 700, 0);
      if (st.stage === 4 && mark < 0) mark = k;
      if (mark >= 0 && k >= mark + 30) break;
    }
    hl.steer(NaN, 0); hl.frame(o.frameMs);
  }
  const mk = hl.objects('Hud').filter((x) => x.tex === 'tex-coast-marker' && x.v).map((x) => `${x.x.toFixed(0)},${x.y.toFixed(0)} ang ${x.ang.toFixed(0)}`).join(' ');
  return { mk, boat: [w.boat.state.x, w.boat.state.y, w.boat.state.headingDeg].map((v) => v.toFixed(0)).join(','), t: w.stepTimeS, stage: st.stage, line2: line2(), texts: hl.texts('Hud').filter((t) => t.length > 0).slice(0, 14) };
}
const out = process.env.OUT; mkdirSync(out, { recursive: true });
const s = await serve(process.env.SITE), browser = await chromium.launch();
let errs = 0;
for (const width of [1280, 1560]) for (const kind of ['relay', 'radio', 'relayed']) {
  const g = await openGame(browser, s.base, `mission=us_05&seed=1`, { width, dpr: 2 });
  try {
    const r = await g.page.evaluate(night, { frameMs: FRAME_MS, kind });
    await g.page.evaluate(() => { for (let i = 0; i < 90; i++) window.__hl.render(); });
    const f = `${out}/ip3-${kind}-w${width}.png`;
    await g.page.screenshot({ path: f });
    errs += g.errors.length;
    console.log(`${f.split("/").pop()} marker ${r.mk} boat ${r.boat} t ${r.t.toFixed(1)} 段 ${r.stage} | 2 行目「${r.line2}」 | ${r.texts.join(' ｜ ')} | page errors ${g.errors.length}${g.errors.length ? ` ${g.errors[0]}` : ''}`);
  } finally { await g.ctx.close(); }
}
await browser.close(); await s.close(); console.log(`page errors ${errs}`);
