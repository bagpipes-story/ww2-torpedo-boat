// v0.8.1 S2b の担当の smoke（repo の外）: ?debug&mission=us_06&hard&seed=1 を W 1280・dpr 2 で開き、自艇を卯月の北 250 m の点へ静音で寄せて卯月に気づかせ（駆潜艇は遠い）、
// 駆潜艇 2 隻が止まったまま→警報（卯月の 4 秒後）で気づき→体感 4 秒で動き出すまでを記録し、2 枚の画面写しを撮る（止まっている時・駆潜艇が動き出した後）。
// 実行: SITE=<site> OUT=<dir> node smoke-s2b.mjs
import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';

const SITE = process.env.SITE;
const OUT = process.env.OUT;

function run(o) {
  const hl = window.__hl;
  const w = hl.world();
  const m = hl.mission();
  if (!w) return { ended: true };
  for (const c of m.children.list) if (c.texture && c.texture.key === 'tex-debug-ring') { c.setVisible(false); c.setVisible = () => c; }
  const g = w.destroyers;
  const b = w.boat.state;
  const uz = g.ships[0];
  window.__smk ??= { start: g.ships.map((d) => [d.state.x, d.state.y, d.state.headingDeg]), moved: g.ships.map(() => 0), noticedAt: NaN, log: [] };
  const S = window.__smk;
  while (w.stepTimeS < o.secs && hl.active('Mission')) {
    const t = w.stepTimeS;
    const tx = S.start[0][0];
    const ty = S.start[0][1] - 250;
    const dT = Math.hypot(tx - b.x, ty - b.y);
    if (t < 2) hl.steer(NaN, 0);
    else if (Number.isNaN(S.noticedAt)) hl.steer(hl.bearing(b.x, b.y, tx, ty), dT < 150 ? 0 : dT > 1700 ? 0.6 : 0.35);
    else if (t < o.holdUntil) hl.steer(90, 0); // 気づかれたら東（駆潜艇 2 の側）へ向けて止まる＝画面に駆潜艇が入る
    else hl.steer(0, 1); // その後は北へ全速
    hl.frame(o.frameMs);
    g.ships.forEach((d, i) => { if (d.anchored && (d.state.x !== S.start[i][0] || d.state.y !== S.start[i][1] || d.state.headingDeg !== S.start[i][2] || d.state.speedMps !== 0)) S.moved[i]++; });
    if (Number.isNaN(S.noticedAt) && g.anchors.state.stage[0] !== 0) S.noticedAt = w.stepTimeS;
    if (Math.round(w.stepTimeS * 60) % 60 === 0 && w.stepTimeS > 44) S.log.push([Math.round(w.stepTimeS), Array.from(g.anchors.state.stage).join(''), Array.from(g.anchors.state.reason).join(''), g.ships.map((d) => +d.state.speedMps.toFixed(1)).join('/'), g.ships.slice(2).map((d) => `${Math.round(d.state.x)},${Math.round(d.state.y)},${Math.round(d.state.headingDeg)}`).join(' ')]);
    if (o.until === 'near' && uz.anchored && Math.hypot(uz.state.x - b.x, uz.state.y - b.y) < 700) break;
    if (o.until === 'picketsUnderway' && !g.ships[2].anchored && !g.ships[3].anchored && w.stepTimeS > g.anchors.log.underwayAtS[2] + o.after) break;
  }
  for (let i = 0; i < 60; i++) hl.render();
  const vis = g.ships.map((d) => d.sprite.visible);
  return {
    t: +w.stepTimeS.toFixed(2), mission: hl.active('Mission'), result: hl.active('Result'), ships: g.ships.length, picketIndex: g.picketIndex, picketCount: g.picketCount, destroyerCount: g.destroyerCount,
    tex: g.ships.map((d) => d.sprite.texture.key), vis, movedWhileAnchored: S.moved,
    anchored: g.ships.map((d) => d.anchored), stage: Array.from(g.anchors.state.stage), reason: Array.from(g.anchors.state.reason),
    noticedAtS: Array.from(g.anchors.log.noticedAtS).map((v) => +v.toFixed(3)), underwayAtS: Array.from(g.anchors.log.underwayAtS).map((v) => +v.toFixed(3)),
    pickets: g.ships.slice(2).map((d) => [Math.round(d.state.x), Math.round(d.state.y), Math.round(d.state.headingDeg), +d.state.speedMps.toFixed(2), d.ai.mode]),
    boat: [Math.round(b.x), Math.round(b.y), w.damage.hp, w.boat.sinking], radarN: w.radar ? w.radar.state.n : -1, radarBlips: w.radar ? w.radar.state.blips.slice(0, w.radar.state.n).map((q) => [q.x, q.y]) : [],
    sunk: g.sunkCount, total: g.total, hud: hl.texts('Hud').filter((x) => /撃沈|輸送船|見つかる|発見|照|レーダー|敵/.test(x)).slice(0, 5), log: S.log.slice(-14),
  };
}

const sv = await serve(SITE);
const browser = await chromium.launch();
const { page, ctx, errors } = await openGame(browser, sv.base, 'mission=us_06&seed=1&hard', { width: 1280, dpr: 2 });
const near = await page.evaluate(run, { secs: 150, until: 'near', frameMs: FRAME_MS, holdUntil: 75 });
await page.screenshot({ path: `${OUT}/us06-hard-pickets-anchored-w1280.png` });
const under = await page.evaluate(run, { secs: 150, until: 'picketsUnderway', after: 3, frameMs: FRAME_MS, holdUntil: 75 });
await page.screenshot({ path: `${OUT}/us06-hard-pickets-underway-w1280.png` });
const end = await page.evaluate(run, { secs: 230, until: 'end', frameMs: FRAME_MS, holdUntil: 75 });
await ctx.close();
await browser.close();
await sv.close();
console.log(JSON.stringify({ near }, null, 0));
console.log(JSON.stringify({ under }, null, 0));
console.log(JSON.stringify({ end }, null, 0));
console.log(JSON.stringify({ errors }));
