// v0.7.0 の段の画面写し（spec-v0700 §7.1 の 7。S0 で v0.7.0 の計画の道具 .../v0700/impl/plan/shots.mjs を移した）。各任務を ?debug で直行し、最寄りの敵へ向かって
// （1,500 m の内は静音 0.22、近すぎれば背を向ける＝ab-replay の台本に近い）、敵の絵が画面の内に 7 フレーム続くか stopM の内で止め（最大 secs 秒）、70 回描いてカメラを追いつかせて 1 枚。
// 見張りの件は続けて見張り（ズーム 0.5）で 90 フレーム後に 1 枚。夜で見えていない敵の絵が近くにあれば、参考に出した -reveal も 1 枚（遊びの画面ではない）。
// ?debug の距離の円は隠す（見越し点の小さな輪は残る）。dpr 2＝RENDER_SCALE 393/360（W 1560）・375/360（W 1280）＝iPhone と同じ密度。
// ROT8=1（S1・S2a。R17）: 見張りの写しの後、画面の艇・艦・機・大発の絵の角度を 0〜315° の 45° ごとに書き換えて 8 枚（-rot<角>）。絵だけ（世界の状態は読むだけ）。
// 基準（v0.7.0 の前＝main f5563ab）: .../v0700/before/（索引 INDEX.md）。13 件＝9 任務＋ハード 3＋夜明け 1（遊べない us_04〜us_07 は ?debug&mission= が us_02 に落ちるので撮らない）。
// 名前: <件>-w<幅>.png・<件>-lookout-w<幅>.png・<件>-reveal-w<幅>.png（・<件>-lookout-rot<角>-w<幅>.png）。shots.json に各件の止めた t・ズーム・見えていた絵の鍵の数・ページのエラー。
// 実行: SITE=<site> SHOTDIR=<dir> [W=1280,1560] [ONLY=us_02,jp_03] [ROT8=1] node scripts/headless/art-shots.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { FRAME_MS, chromium, openGame, serve } from './lib.mjs';

const site = process.env.SITE;
const dir = process.env.SHOTDIR;
if (!site || !dir) throw new Error('SITE SHOTDIR');
mkdirSync(dir, { recursive: true });
const widths = (process.env.W ?? '1280,1560').split(',').map(Number);
// [名前, query, 最大秒, 見張りも撮るか]
let CASES = [
  ['us_01', 'mission=us_01&seed=1', 110, true, 800, 500],
  ['us_01-dawn', 'mission=us_01&seed=1&dawn=25', 45, false],
  ['us_02', 'mission=us_02&seed=1', 70, true],
  ['us_02-hard', 'mission=us_02&seed=1&hard', 70, false],
  ['us_03', 'mission=us_03&seed=1', 70, true, 450],
  ['jp_01', 'mission=jp_01&seed=1', 70, true, 500],
  ['jp_01-hard', 'mission=jp_01&seed=1&hard', 70, false, 500],
  ['jp_02', 'mission=jp_02&seed=1', 90, true],
  ['jp_03', 'mission=jp_03&seed=1', 75, true],
  ['jp_04', 'mission=jp_04&seed=2', 70, true, 500],
  ['jp_04-hard', 'mission=jp_04&seed=2&hard', 70, false, 500],
  ['jp_05', 'mission=jp_05&seed=1', 110, true, 600, 400],
  ['jp_06', 'mission=jp_06&seed=1', 110, true, 800, 500],
];
if (process.env.ONLY) { const only = process.env.ONLY.split(','); CASES = CASES.filter((c) => only.includes(c[0])); }

function drive(o) {
  window.hideDebug = (m) => { for (const c of m.children.list) if (c.texture && c.texture.key === 'tex-debug-ring') { c.setVisible(false); c.setVisible = () => c; } };
  const hideDebug = window.hideDebug;
  const hl = window.__hl;
  const w = hl.world();
  const m = hl.mission();
  const cam = m.cameras.main;
  const end = Math.round(o.secs * 60);
  let k = 0;
  let inView = 0;
  const trace = [];
  for (; k < end; k++) {
    if (!hl.active('Mission')) return { t: w.stepTimeS, ended: true };
    const t = w.stepTimeS;
    const b = w.boat.state;
    const f = w.enemy.focus(b.x, b.y);
    const dist = f ? Math.hypot(f.x - b.x, f.y - b.y) : Infinity;
    if (t < 2) hl.steer(NaN, 0);
    else if (f && dist < 300) hl.steer(hl.bearing(f.x, f.y, b.x, b.y), 0.25);
    else if (f) hl.steer(hl.bearing(b.x, b.y, f.x, f.y), dist > o.slowM ? 0.6 : 0.22);
    else hl.steer((90 + t * 2) % 360, 0.5);
    hl.frame(o.frameMs);
    // 何か（敵の船・機・米PT・大発）が画面の内に見えている
    const hw = (cam.width / cam.zoom) * 0.35;
    const hh = (cam.height / cam.zoom) * 0.3;
    const v = { x: w.boat.state.x - hw, y: w.boat.state.y - hh, width: hw * 2, height: hh * 2, right: w.boat.state.x + hw, bottom: w.boat.state.y + hh };
    let seen = false;
    for (const c of m.children.list) {
      if (!c.visible || c.alpha < 0.3 || (c.type !== 'Image' && c.type !== 'Sprite')) continue;
      const key = c.texture ? c.texture.key : '';
      if (!/destroyer|transport|barge|pt-boat|aircraft/.test(key) || /friendly/.test(key)) continue;
      if (c.x > v.x + v.width * 0.08 && c.x < v.right - v.width * 0.08 && c.y > v.y + v.height * 0.1 && c.y < v.bottom - v.height * 0.1) { seen = true; break; }
    }
    inView = seen ? inView + 1 : 0;
    if (k % 120 === 0) trace.push([Math.round(t), Math.round(dist), seen, Math.round(w.damage.hp)]);
    if (t > o.minS && (inView > 6 || dist < o.stopM)) break;
  }
  hideDebug(m);
  for (let i = 0; i < 70; i++) hl.render();
  const keys = {};
  for (const c of m.children.list) if ((c.type === 'Image' || c.type === 'Sprite') && c.visible) { const kk = c.texture.key; keys[kk] = (keys[kk] ?? 0) + 1; }
  return { t: w.stepTimeS, zoom: cam.zoom, keys, objs: m.children.list.length, ended: false, hp: w.damage.hp, sink: w.boat.sinking, trace: o.trace ? trace : undefined };
}

function reveal() {
  const hl = window.__hl;
  const w = hl.world();
  const m = hl.mission();
  const cam = m.cameras.main;
  const hw = (cam.width / cam.zoom) * 0.6;
  const hh = (cam.height / cam.zoom) * 0.6;
  let n = 0;
  for (const c of m.children.list) {
    if ((c.type !== 'Image' && c.type !== 'Sprite') || c.visible) continue;
    const key = c.texture ? c.texture.key : '';
    if (!/destroyer|transport|barge|pt-boat|aircraft|boat-/.test(key)) continue;
    if (Math.abs(c.x - w.boat.state.x) > hw || Math.abs(c.y - w.boat.state.y) > hh) continue;
    c.setVisible(true);
    c.setVisible = () => c;
    if (c.alpha < 0.5) c.setAlpha(1);
    n++;
  }
  window.hideDebug(m);
  for (let i = 0; i < 3; i++) hl.render();
  return n;
}

function lookout(o) {
  const hl = window.__hl;
  const w = hl.world();
  w.input.lookout = true;
  for (let i = 0; i < 90 && hl.active('Mission'); i++) { hl.frame(o.frameMs); }
  window.hideDebug(hl.mission());
  for (let i = 0; i < 40; i++) hl.render();
  return { t: w.stepTimeS, zoom: hl.mission().cameras.main.zoom };
}

function rot8(deg) {
  const hl = window.__hl;
  const m = hl.mission();
  for (const c of m.children.list) {
    if ((c.type !== 'Image' && c.type !== 'Sprite') || !c.visible) continue;
    const key = c.texture ? c.texture.key : '';
    if (!/destroyer|transport|barge|pt-boat|aircraft|boat-/.test(key) || /fan/.test(key)) continue;
    if (c.__rot0 === undefined) c.__rot0 = c.angle;
    c.setAngle(deg);
  }
  for (let i = 0; i < 3; i++) hl.render();
}

const sv = await serve(site);
const browser = await chromium.launch();
const out = [];
let bad = 0;
for (const width of widths) {
  for (const [name, q, secs, look, stopM = 800, slowM = 1500] of CASES) {
    const { page, ctx, errors } = await openGame(browser, sv.base, q, { width, dpr: 2 });
    try {
      const r = await page.evaluate(drive, { secs, minS: 8, slowM, stopM: stopM, frameMs: FRAME_MS, trace: process.env.TRACE === '1' });
      const shot = `${dir}/${name}-w${width}.png`;
      await page.screenshot({ path: shot });
      const nRev = r.ended ? 0 : await page.evaluate(reveal);
      if (nRev > 0) await page.screenshot({ path: `${dir}/${name}-reveal-w${width}.png` });
      r.revealed = nRev;
      let lk = null;
      if (look && !r.ended) {
        lk = await page.evaluate(lookout, { frameMs: FRAME_MS });
        await page.screenshot({ path: `${dir}/${name}-lookout-w${width}.png` });
        if (process.env.ROT8 === '1') {
          for (let a = 0; a < 360; a += 45) {
            await page.evaluate(rot8, a);
            await page.screenshot({ path: `${dir}/${name}-lookout-rot${a}-w${width}.png` });
          }
        }
      }
      if (errors.length) bad++;
      console.log(`${name} W${width} t ${r.t.toFixed(1)} zoom ${r.zoom?.toFixed(3)} objs ${r.objs} ${JSON.stringify(r.keys)}${lk ? ` lookout zoom ${lk.zoom.toFixed(3)}` : ''}${errors.length ? ` ERR ${errors[0]}` : ''} hp ${r.hp} revealed ${r.revealed} ${r.trace ? JSON.stringify(r.trace) : ''}`);
      out.push({ name, width, ...r, lookout: lk, errors });
    } finally {
      await ctx.close();
    }
  }
}
await browser.close();
await sv.close();
writeFileSync(`${dir}/shots.json`, JSON.stringify(out, null, 1));
console.log(`shots ${out.length} page-error cases ${bad}`);
