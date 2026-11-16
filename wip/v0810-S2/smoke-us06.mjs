// v0.8.1 S2 の担当の smoke（repo の外。S3 の anchor-probe の代わりではない）: ?debug&mission=us_06&seed=1（ノーマル・ハード）を W 1280 で開き、
// 自艇を卯月の北 250 m の点へ巡航で寄せて（背に岸なし）気づかれるまでと、気づいて動き出した後を記録し、2 枚の画面写しを撮る（卯月が止まっている時・動き出した後）。
// 実行: SITE=<site> OUT=<dir> node smoke-us06.mjs
import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';

const SITE = process.env.SITE;
const OUT = process.env.OUT;

/** ページの中: until（'near'＝止まった卯月まで 700 m・'underway'＝動き出して 8 秒・'end'＝secs まで）まで回し、絵を描いて状態を返す */
function run(o) {
  const hl = window.__hl;
  const w = hl.world();
  const m = hl.mission();
  if (!w) return { ended: true };
  for (const c of m.children.list) if (c.texture && c.texture.key === 'tex-debug-ring') { c.setVisible(false); c.setVisible = () => c; }
  const g = w.destroyers;
  const uz = g.ships[0];
  const sm = g.ships[1];
  const b = w.boat.state;
  window.__smk ??= { underwayAt: NaN, uz0: [uz.state.x, uz.state.y, uz.state.headingDeg], sm0: [sm.state.x, sm.state.y, sm.state.headingDeg], moved: 0, smMoved: 0, log: [], minUzM: Infinity };
  const S = window.__smk;
  while (w.stepTimeS < o.secs && hl.active('Mission')) {
    const t = w.stepTimeS;
    const tx = S.uz0[0];
    const ty = S.uz0[1] - 250;
    const dT = Math.hypot(tx - b.x, ty - b.y);
    if (t < 2) hl.steer(NaN, 0);
    else if (Number.isNaN(S.underwayAt)) hl.steer(hl.bearing(b.x, b.y, tx, ty), dT < 150 ? 0 : dT > 1700 ? 0.6 : 0.35); // 遠くは巡航・卯月の 1,700 m の内は静音
    else if (w.stepTimeS < S.underwayAt + 10) hl.steer(0, 1); // 動き出したら北へ全速で 10 秒
    else hl.steer(NaN, 0); // その後は止まって夜明けを待つ
    hl.frame(o.frameMs);
    if (uz.anchored && (uz.state.x !== S.uz0[0] || uz.state.y !== S.uz0[1] || uz.state.headingDeg !== S.uz0[2])) S.moved++;
    if (sm.state.x !== S.sm0[0] || sm.state.y !== S.sm0[1] || sm.state.headingDeg !== S.sm0[2]) S.smMoved++;
    if (!uz.anchored && Number.isNaN(S.underwayAt)) S.underwayAt = w.stepTimeS;
    const d = Math.hypot(uz.state.x - b.x, uz.state.y - b.y);
    if (d < S.minUzM) { S.minUzM = d; S.minAt = w.stepTimeS; }
    if (Math.round(w.stepTimeS * 60) % 120 === 0) S.log.push([Math.round(w.stepTimeS), Math.round(b.x), Math.round(b.y), Math.round(uz.state.x), Math.round(uz.state.y), +uz.state.speedMps.toFixed(1), uz.anchored, g.anchors.state.stage[0], g.anchors.state.reason[0], g.anchors.state.stage[1], g.anchors.state.reason[1], Math.round(w.detectRangeM), uz.ai.playerDetected]);
    if (o.until === 'near' && uz.anchored && d < 700) break;
    if (o.until === 'underway' && !Number.isNaN(S.underwayAt) && w.stepTimeS > S.underwayAt + 8) break;
  }
  for (let i = 0; i < 60; i++) hl.render();
  return {
    t: +w.stepTimeS.toFixed(2), active: hl.active('Mission'), underwayAt: S.underwayAt, movedWhileAnchored: S.moved, smMoved: S.smMoved, minUzM: Math.round(S.minUzM), minAt: S.minAt,
    uz: [Math.round(uz.state.x), Math.round(uz.state.y), +uz.state.speedMps.toFixed(2), uz.anchored, uz.ai.mode], sm: [sm.state.x, sm.state.y, sm.anchored, sm.withdrawn], ships: g.ships.length,
    stage: Array.from(g.anchors.state.stage), reason: Array.from(g.anchors.state.reason), noticedAtS: Array.from(g.anchors.log.noticedAtS).map((v) => +v.toFixed(2)), underwayAtS: Array.from(g.anchors.log.underwayAtS).map((v) => +v.toFixed(2)),
    backdrop: g.backdrop !== null, dawn: w.dawn.reached, sinking: w.boat.sinking, hp: w.damage.hp, retiring: uz.ai.retiring, end: hl.active('Result'), radarN: w.radar ? w.radar.state.n : -1, tex: uz.sprite.texture.key, hud: hl.texts('Hud').filter((x) => /見つかる|発見|照|レーダー|敵/.test(x)).slice(0, 4), log: S.log.slice(-8),
  };
}

const sv = await serve(SITE);
const browser = await chromium.launch();
const results = [];
for (const hard of [false, true]) {
  const name = hard ? 'hard' : 'normal';
  const { page, ctx, errors } = await openGame(browser, sv.base, `mission=us_06&seed=1${hard ? '&hard' : ''}`, { width: 1280, dpr: 2 });
  const near = await page.evaluate(run, { secs: 150, until: 'near', frameMs: FRAME_MS });
  await page.screenshot({ path: `${OUT}/us06-${name}-anchored-w1280.png` });
  const under = await page.evaluate(run, { secs: 190, until: 'underway', frameMs: FRAME_MS });
  await page.screenshot({ path: `${OUT}/us06-${name}-underway-w1280.png` });
  const end = await page.evaluate(run, { secs: 230, until: 'end', frameMs: FRAME_MS });
  results.push({ hard, near, under, end, errors });
  await ctx.close();
}
await browser.close();
await sv.close();
for (const r of results) console.log(JSON.stringify(r));
