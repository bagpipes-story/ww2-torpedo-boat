// v0.8.4 の画面写し（W 1280・dpr 2）: 史実モードの us_02 seed 1。駆逐艦の真横 D m に自艇を置いて止め、見つかったら煙幕を張って止まったまま。
// 乱射の弾が近くに落ちて少し経ったところ（2 行目「煙の中へ乱射されている」）を写す。D は 400・150。比べに史実モードのオフ（D 150）も（撃たれない・2 行目に出ない）。
import { mkdirSync, writeFileSync } from 'node:fs';
import { FRAME_MS, chromium, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';

const site = process.env.SITE;
const dir = process.env.SHOTDIR;
mkdirSync(dir, { recursive: true });
const sv = await serve(site);
const browser = await chromium.launch();
const log = [];

function drive(o) {
  const hl = window.__hl;
  const w = hl.world();
  for (let i = 0; i < 120; i++) { hl.steer(NaN, 0); hl.frame(o.frameMs); }
  const d = w.destroyers.ships[0];
  const b = w.boat.state;
  const h = (d.state.headingDeg * Math.PI) / 180;
  // 艦の右舷の真横 D m・艦と同じ向き
  b.x = d.state.x + Math.cos(h) * o.D;
  b.y = d.state.y + Math.sin(h) * o.D;
  b.headingDeg = d.state.headingDeg;
  b.speedMps = 0;
  const cam = hl.mission().cameras.main;
  cam.setLerp(1, 1); // 置き直した自艇へカメラをすぐ寄せる（写しのためだけ）
  const dist = () => Math.hypot(d.state.x - b.x, d.state.y - b.y);
  let f = 0;
  for (; f < 240 && !d.ai.playerDetected; f++) { hl.steer(NaN, 0); hl.frame(o.frameMs); }
  const detectedAt = dist();
  w.input.smokeTap = true;
  const br = w.destroyers.fires[0].barrageOf;
  let firstNear = -1;
  let prevNear = 0;
  let k = 0;
  const hp0 = w.damage.hp;
  for (; k < 60 * 12; k++) {
    hl.steer(NaN, 0);
    hl.frame(o.frameMs);
    const near = w.destroyers.barrageNear;
    if (near > 0 && firstNear < 0) firstNear = k;
    if (firstNear >= 0 && k - firstNear >= o.after && near > prevNear) { for (let i = 0; i < 4; i++) hl.frame(o.frameMs); break; } // 着いた直後（水柱が見える）
    prevNear = near;
  }
  for (let i = 0; i < 4; i++) hl.render();
  const hud = hl.texts('Hud');
  return { D: o.D, detectedAt, distNow: dist(), framesAfterSmoke: k, firstNear, hidden: w.hiddenBySmoke, detected: d.ai.playerDetected, fired: br ? br.state.fired : null, landed: br ? br.state.landed : null, hits: br ? br.state.hits : null, near: w.destroyers.barrageNear, hp0, hp: w.damage.hp, line2: hud.find((x) => /乱射|煙/.test(x)) ?? null };
}

const CASES = [
  ['hist-400', 'mission=us_02&seed=1&historical&nostrike', { D: 400, after: 180 }],
  ['hist-150', 'mission=us_02&seed=1&historical&nostrike', { D: 150, after: 240 }],
  ['off-150', 'mission=us_02&seed=1&nostrike', { D: 150, after: 240 }],
];
for (const [name, q, o] of CASES) {
  const { page, ctx, errors } = await openGame(browser, sv.base, q, { width: 1280, dpr: 2 });
  try {
    const r = await page.evaluate(drive, { ...o, frameMs: FRAME_MS });
    await page.screenshot({ path: `${dir}/${name}-w1280.png` });
    const line = { name, ...r, errors };
    log.push(line);
    console.log(JSON.stringify(line));
  } finally {
    await ctx.close();
  }
}
writeFileSync(`${dir}/shots.json`, JSON.stringify(log, null, 1));
await browser.close();
await sv.close();
