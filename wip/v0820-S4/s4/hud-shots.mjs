// v0.8.2 S4 の HUD の画面写し（scratch。lead の L47）: us_05 の 2 行目の出来事（戦艦を確認・無線の故障と中継の印・戦艦への命中・弾薬庫の誘爆）を W 1280・1560 × ノーマル・ハード（dpr 2）で撮る。
// 台本は測るためだけ（世界を書き換える）。SITE=<site> OUT=<dir> node hud-shots.mjs
import { mkdirSync } from 'node:fs';
import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';

function night(o) {
  const hl = window.__hl;
  const w = hl.world();
  const st = w.recon.state;
  const put = (x, y, h) => { const b = w.boat.state; b.x = x; b.y = y; b.speedMps = 0; if (h !== undefined) b.headingDeg = h; };
  const hudText = () => hl.texts('Hud').filter((t) => t.length > 0);
  const line2 = () => { const s = window.__game.scene.getScene('Hud'); const t = s.children.list.find((x) => x.type === 'Text' && x.y > 20 && x.y < 60 && x.originX === 0.5); return t ? t.text : ''; };
  const cls = w.destroyers.kits.classes;
  let fired = false;
  let mark = -1;
  for (let k = 0; k < 60 * 265 && hl.active('Mission'); k++) {
    w.damage.hp = w.damageParams.maxHp;
    if (o.kind === 'seen') { put(3000, 950); if (st.stage === 1 && mark < 0) mark = k; if (mark >= 0 && k >= mark + 30) break; }
    else if (o.kind === 'radio') {
      put(3000, 950);
      if (!st.radioBroken && st.stage === 1 && st.trackedS >= w.recon.plan.trackS - 1) { st.radioBroken = true; st.radioBrokenAtS = st.clockS; }
      if (st.stage === 3 && mark < 0) mark = k;
      if (mark >= 0 && k >= mark + 30) break;
    } else if (o.kind === 'boom' || o.kind === 'cap') {
      const bbI = cls.indexOf('battleship');
      const bb = w.destroyers.ships[bbI];
      if (!fired && !bb.out && bb.state.x > 1800) { put(bb.state.x + 300, bb.state.y + 500, 0); w.input.fireSalvoSpreadDeg = 4; w.input.fireSalvoCount = 4; fired = true; }
      else if (!fired) put(3000, 3300, 0);
      const t = window.__game.scene.getScene('Mission').world;
      const mg = w.destroyers.magazine;
      if (o.kind === 'cap' && bb.hitsTaken >= 1 && mark < 0) mark = k;
      if (o.kind === 'boom' && mg.detonations > 0 && mark < 0) mark = k;
      if (mark >= 0 && k >= mark + (o.kind === 'boom' ? 40 : 20)) break;
    }
    hl.steer(NaN, 0);
    hl.frame(o.frameMs);
  }
  return { t: w.stepTimeS, stage: st.stage, line2: line2(), texts: hudText().slice(0, 12), hits: w.destroyers.ships.map((d) => d.hitsTaken).join(''), det: w.destroyers.magazine ? w.destroyers.magazine.detonations : -1 };
}

const site = process.env.SITE;
const out = process.env.OUT;
mkdirSync(out, { recursive: true });
const s = await serve(site);
const browser = await chromium.launch();
let errs = 0;
for (const width of [1280, 1560]) for (const hard of [false, true]) for (const kind of ['seen', 'radio', 'cap', 'boom']) {
  const q = `mission=us_05&seed=1${hard ? '&hard' : ''}${kind === 'boom' ? '&boom' : ''}`;
  const g = await openGame(browser, s.base, q, { width, dpr: 2 });
  try {
    const r = await g.page.evaluate(night, { frameMs: FRAME_MS, kind });
    await g.page.evaluate(() => { for (let i = 0; i < 90; i++) window.__hl.render(); });
    const f = `${out}/hud-${kind}${hard ? '-hard' : ''}-w${width}.png`;
    await g.page.screenshot({ path: f });
    errs += g.errors.length;
    console.log(`${f.split('/').pop()} t ${r.t.toFixed(1)} 段 ${r.stage} 命中 ${r.hits} 誘爆 ${r.det} | 2 行目「${r.line2}」 | ${r.texts.join(' ｜ ')} | page errors ${g.errors.length}${g.errors.length ? ` ${g.errors[0]}` : ''}`);
  } finally {
    await g.ctx.close();
  }
}
await browser.close();
await s.close();
console.log(`page errors ${errs}`);
