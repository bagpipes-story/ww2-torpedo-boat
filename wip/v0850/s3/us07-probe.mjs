// us_07 の 1 夜の探り（v0.8.5 S2 の実装者の確かめ。ゲームは import しない）: SITE=<site> [HARD=1] [SEED=1] [MODE=lane|straight] [SHOTS=dir] [W=1560] node us07-probe.mjs
// lane: 水路を通って群へ、5 kt 以下で拾い、満ちたらフィッチの輪で止まって移す（40 名で帰投）。straight: コリーへ全速で真っ直ぐ（触雷を見る）。
import { FRAME_MS, chromium, envNum, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';

function run(o) {
  const hl = window.__hl;
  const w = hl.world();
  const r = w.rescue;
  const P = (window.__pr ??= { log: { t: [], ev: [] }, wp: 0, back: false, home: false, deliver: false, k: 0, last: { pick: 0, tr: 0, shell: 0, seen: 0, blow: 0, cov: 0, shots: 0, hits: 0, hp: w.damage.hp, detect: 0 } });
  const log = P.log;
  const lane = [[4300, 1500], [2600, 2300]];
  let { wp, back, home, deliver, last } = P;
  const sb0 = () => w.shoreGuns ? w.shoreGuns.shoreShots : 0;
  const end = P.k + Math.round(o.secs * 60);
  let k = P.k;
  for (; k < end; k++) {
    if (!hl.active('Mission')) break;
    const t = w.stepTimeS;
    const b = w.boat.state;
    const st = r.state;
    const d = (x, y) => Math.hypot(x - b.x, y - b.y);
    if (t < 2) hl.steer(NaN, 0);
    else if (o.mode === 'straight') hl.steer(hl.bearing(b.x, b.y, 2600, 2700), 1);
    else if (o.mode === 'mines') hl.steer(hl.bearing(b.x, b.y, 5250, 3000), 1);
    else if (o.mode === 'minehit') {
      const m = r.mines; let kk = -1; let bd = Infinity;
      for (let i = 0; i < m.max; i++) if (m.state[i] === 1 || m.state[i] === 2) { const dd = d(m.x[i], m.y[i]); if (dd < bd) { bd = dd; kk = i; } }
      if (kk >= 0) hl.steer(hl.bearing(b.x, b.y, m.x[kk], m.y[kk]), bd < 200 ? 0.4 : 1); else hl.steer(NaN, 0);
    }
    else if (o.mode === 'cover') hl.steer(hl.bearing(b.x, b.y, 4300, 1500), d(4300, 1500) < 120 ? 0 : 0.6);
    else {
      if (st.aboard >= r.rules.capacity || (st.timeUp && st.aboard > 0) || (st.aboard > 0 && st.delivered + st.aboard >= r.rules.objectiveDelivered)) deliver = true;
      if (st.aboard === 0) deliver = false;
      const full = deliver;
      if (st.delivered >= r.rules.objectiveDelivered || (st.timeUp && st.aboard === 0)) home = true;
      let tx; let ty; let near = false; let stop = false;
      if (home) { tx = 5400; ty = 500; if (d(4300, 1500) > 400 && b.y > 1400) { tx = 4300; ty = 1500; } }
      else if (full) {
        // コリーの側から水路を戻ってフィッチへ
        if (d(2600, 2300) > 250 && b.y > 2250 && !back) { tx = 2600; ty = 2300; } else { back = true; tx = 4300; ty = 1500; }
        if (d(4300, 1500) < 150) stop = true;
      } else {
        back = false;
        if (wp < lane.length && d(lane[wp][0], lane[wp][1]) < 200) wp++;
        if (wp < lane.length) { tx = lane[wp][0]; ty = lane[wp][1]; }
        else {
          let g = -1; let bd = Infinity;
          for (let i = 0; i < st.n; i++) if (st.left[i] > 0) { const dd = d(st.gx[i], st.gy[i]); if (dd < bd) { bd = dd; g = i; } }
          if (g < 0) { tx = 2600; ty = 2300; } else { tx = st.gx[g]; ty = st.gy[g]; near = bd < 160; if (bd < 30) stop = true; }
        }
      }
      const dist = d(tx, ty);
      hl.steer(hl.bearing(b.x, b.y, tx, ty), stop ? 0 : near || (full && dist < 250) ? 0.11 : dist > 400 ? 0.75 : 0.35);
      if (full && d(4300, 1500) < 170) hl.steer(NaN, 0);
    }
    w.input.gunHeld = o.mode !== 'cover' && w.pts && w.pts.section.detected && t % 6 < 3;
    hl.frame(o.frameMs);
    const m = r.mines;
    const c = r.cover;
    const now = { pick: st.pickSeq, tr: st.transferSeq, shell: st.shellSeq, seen: m ? m.seen : 0, blow: m ? m.blown : 0, cov: c ? c.count : 0, shots: sb0(), hits: w.shoreGuns ? w.shoreGuns.shoreHits : 0, hp: w.damage.hp, detect: w.detect.count };
    for (const key of Object.keys(now)) if (now[key] !== last[key]) log.ev.push(`${w.stepTimeS.toFixed(1)} ${key} ${last[key]}→${now[key]}`);
    last = now;
    if (k % 600 === 0) log.t.push(`${t.toFixed(0)}s pos ${b.x.toFixed(0)},${b.y.toFixed(0)} v ${(b.speedMps * 1.944).toFixed(1)}kt aboard ${st.aboard} del ${st.delivered} water ${Array.from(st.left).reduce((a, x) => a + x, 0)} pts ${w.pts ? w.pts.section.boats.map((x) => x.phase).join('') : '-'} hp ${w.damage.hp.toFixed(0)}`);
  }
  Object.assign(P, { wp, back, home, deliver, last, k });
  if (!o.finish) return { k, done: !hl.active('Mission') };
  // v0.8.5 S3: 沈む tween は Date.now の時計で進むので、沈んでいればページの Date.now をフレームごとに 1/60 秒進める偽の時計で Result まで回す（ゲームのコードは変えない）
  const realNow = Date.now; let fake = realNow.call(Date); if (w.boat.sinking) Date.now = () => fake;
  for (let i = 0; i < 60 * 40 && hl.active('Mission'); i++) { if (!w.boat.sinking) hl.steer(NaN, 0); fake += o.frameMs; hl.frame(o.frameMs); }
  for (let i = 0; i < 30; i++) { fake += o.frameMs; hl.frame(o.frameMs); }
  Date.now = realNow;
  const res = hl.active('Result') ? hl.texts('Result') : ['(Result なし)', window.__game.scene.getScenes(true).map((x) => x.sys.settings.key).join(','), String(w.boat.sinking), String(w.stepTimeS)];
  return { log, res, frames: k };
}

async function main() {
  const site = process.env.SITE;
  const s = await serve(site);
  const browser = await chromium.launch();
  const hard = process.env.HARD === '1';
  const g = await openGame(browser, s.base, `mission=us_07&seed=${envNum('SEED', 1)}${hard ? '&hard' : ''}${process.env.QUERY ? `&${process.env.QUERY}` : ''}`, { width: envNum('W', 1560) });
  const total = envNum('SECS', 330);
  const every = envNum('EVERY', total);
  const dir = process.env.SHOTS;
  const tag = `${process.env.MODE ?? 'lane'}-${hard ? 'hard' : 'normal'}-s${envNum('SEED', 1)}-w${envNum('W', 1560)}`;
  for (let t = 0; t < total; t += every) {
    const r = await g.page.evaluate(run, { frameMs: FRAME_MS, secs: Math.min(every, total - t), mode: process.env.MODE ?? 'lane', finish: false });
    if (dir) {
      await g.page.evaluate(() => { for (let i = 0; i < 70; i++) window.__hl.render(); });
      await g.page.screenshot({ path: `${dir}/${tag}-t${String(t + every).padStart(3, '0')}.png` });
    }
    if (r.done) break;
  }
  if (dir && process.env.CLOSE) {
    const targets = await g.page.evaluate(() => {
      const w = window.__hl.world();
      const out = [['boat', w.boat.state.x, w.boat.state.y]];
      if (w.pts) w.pts.section.boats.forEach((b, i) => out.push([`sboat${i}`, b.x, b.y]));
      out.push(['fitch', w.rescue.rules.fitch.x, w.rescue.rules.fitch.y], ['corry', w.rescue.rules.corry.x, w.rescue.rules.corry.y]);
      const m = w.rescue.mines; for (let k = 0; k < m.max; k++) if (m.state[k] === 2) { out.push([`mine${k}`, m.x[k], m.y[k]]); break; }
      return out;
    });
    for (const [name, x, y] of targets) {
      await g.page.evaluate(([x, y, z]) => { const cam = window.__hl.mission().cameras.main; cam.stopFollow(); cam.setZoom(cam.zoom * z); cam.centerOn(x, y); for (let i = 0; i < 3; i++) window.__hl.render(); cam.setZoom(cam.zoom / z); }, [x, y, Number(process.env.CLOSE)]);
      await g.page.screenshot({ path: `${dir}/${tag}-close-${name}.png` });
    }
  }
  const out = await g.page.evaluate(run, { frameMs: FRAME_MS, secs: 0, mode: process.env.MODE ?? 'lane', finish: true });
  console.log(out.log.t.join('\n'));
  console.log(out.log.ev.join('\n'));
  console.log('RESULT', JSON.stringify(out.res));
  console.log('ERRORS', g.errors.length, g.errors.slice(0, 5).join(' | '));
  await g.ctx.close();
  await browser.close();
  await s.close();
}
await main();
