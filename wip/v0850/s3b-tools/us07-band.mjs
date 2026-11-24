// us_07 の帯（v0.8.5 S3 の実装者の測り。ゲームは import しない）:
//   SITE=<site> [SCRIPTS=careful,silent,flee,smoke,straight] [SEEDS=1-16] [HARDS=0,1] [JOBS=2] [QUERY=fuel=400] [OUT=x.json] node us07-band.mjs
// 台本（どれも同じ艇の入力の口 hl.steer・input.silentOn・input.gunHeld・input.smokeTap だけを使う＝遊ぶ人と同じ）:
//   careful: 水路（帰投の輪 → フィッチ → 水路の端）を巡航（23 kt）で通り、群へは 4 kt で寄せて止まって拾う。20 名か 40 名に届けば水路の端 → フィッチの輪で止まって移す。
//            40 名を渡すか救助の時間が終わって空になれば、フィッチ → 帰投の輪。見えた機雷が前 30° の 200 m の内なら 40° よける。見つかった S ボートには機銃（3 秒撃って 3 秒休む）。
//   silent:  careful と同じで、走る間は静音のボタン（スティックいっぱいで 18 kt）。
//   flee:    careful ＋ S ボートが突撃・航過・追撃の間は全速でフィッチへ逃げる（S2 の開いた問題: フィッチの砲火で退くか）。
//   fleec:   flee と同じで、逃げる速さは巡航（全速の燃料を見ないため）。flee・fleec はフィッチの輪に着いて乗せていれば移す。
//   smoke:   careful ＋ 砲台の射界の中で撃たれたら煙幕を張る（張れる時だけ）。
//   straight: 出発からコリーへ全速で真っ直ぐ（水路を通らない・機雷をよけない。触雷を見る）。その後は careful と同じ。
//   direct:  careful と同じ速さで、水路を使わずいつも真っ直ぐ（群へ・フィッチへ・帰投の輪へ）・機雷をよけない（近道の触雷を見る）。
// 沈んだら（沈む tween は Date.now の時計で進むので）ページの Date.now をフレームごとに 1/60 秒進める偽の時計にして Result まで回す（S3 の項 4。ゲームのコードは変えない）。
import { writeFileSync } from 'node:fs';
import { FRAME_MS, chromium, envNum, openGame, pool, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';

function run(o) {
  const hl = window.__hl;
  const w = hl.world();
  const r = w.rescue;
  const st = r.state;
  const R = r.rules;
  const F = R.fitch;
  const C = R.corry;
  const rp = w.returnPoint;
  const lanes = r.field ? r.field.lanes : [];
  // v0.8.5 S3b: フィッチから先の水路の鎖（x0,y0 がフィッチ → その端 → …）を道にする（S3 は 1 本＝フィッチ → 水路の端）
  const chain = [];
  { let cx = F.x, cy = F.y; for (let g = 0; g < 8; g++) { const l = lanes.find((q) => Math.abs(q.x0 - cx) < 1 && Math.abs(q.y0 - cy) < 1); if (!l) break; cx = l.x1; cy = l.y1; chain.push([cx, cy]); } }
  const laneEnd = chain.length ? chain[chain.length - 1] : [C.x, C.y];
  const backWps = chain.slice(0, -1).reverse(); // 群 → 端の手前の点 … → フィッチ（端そのものは群のそばなので飛ばす）
  const cruise01 = o.cruiseKt / (w.params.speedMaxMps * 1.943844);
  const P = { mode: 'go', wp: 0, back: false, smokeN: 0 };
  const ev = { firstPickS: NaN, del20S: NaN, del40S: NaN, sinkS: NaN, cause: '', hpBy: { shore: 0, mine: 0, sboat: 0, other: 0 }, coverIn: [], fleeS: 0, fleeHitsAfterCover: 0, coverLeaveS: [], detectS: NaN };
  let last = { hp: w.damage.hp, shore: 0, blown: 0, cover: 0 };
  const d = (x, y) => Math.hypot(x - w.boat.state.x, y - w.boat.state.y);
  const totalFrames = Math.round(o.secs * 60);
  const sboats = () => (w.pts ? w.pts.section.boats : []);
  const attacking = () => sboats().some((b) => b.phase === 2 || b.phase === 3 || b.phase === 5);
  const coverM = F.coverM;
  let fleeStartS = NaN;
  let inCoverS = NaN;
  for (let k = 0; k < totalFrames; k++) {
    if (!hl.active('Mission') || w.boat.sinking) break;
    const t = w.stepTimeS;
    const b = w.boat.state;
    // 段の切り替え
    if (st.delivered >= R.objectiveDelivered || (st.timeUp && st.aboard === 0) || (st.aboard === 0 && !Array.from(st.left).some((x) => x > 0))) P.mode = 'home';
    else if (P.mode !== 'deliver' && (st.aboard >= R.capacity || (st.timeUp && st.aboard > 0) || (st.aboard > 0 && st.delivered + st.aboard >= R.objectiveDelivered) || (st.aboard > 0 && !Array.from(st.left).some((x) => x > 0)))) { P.mode = 'deliver'; P.back = false; }
    else if (P.mode === 'deliver' && st.aboard === 0) { P.mode = 'go'; P.wp = 1; }
    if (P.mode !== P.lastMode) { P.bwp = -1; P.lastMode = P.mode; }
    let tx; let ty; let speed = cruise01; let stop = false; let slow = false;
    const isFlee = o.script === 'flee' || o.script === 'fleec';
    if (isFlee && P.mode === 'go' && st.aboard > 0 && d(F.x, F.y) < F.ringM) { P.mode = 'deliver'; P.back = true; }
    const flee = isFlee && attacking() && d(F.x, F.y) > F.ringM && P.mode !== 'home';
    if (flee) {
      if (Number.isNaN(fleeStartS)) fleeStartS = t;
      tx = F.x; ty = F.y; speed = o.script === 'flee' ? 1 : cruise01;
    } else {
      if (!Number.isNaN(fleeStartS)) { ev.fleeS += t - fleeStartS; fleeStartS = NaN; }
      // 戻りの道（S3b）: 群 → 水路の端 → 鎖を逆に → フィッチ。点の 200 m の内か、フィッチの方が近ければ次へ
      const backTo = () => {
        if (P.bwp === undefined) P.bwp = -1;
        for (;;) {
          const w = P.bwp < 0 ? laneEnd : backWps[P.bwp];
          if (P.bwp >= backWps.length) return null;
          if (d(w[0], w[1]) < 200 || d(F.x, F.y) < d(w[0], w[1])) { P.bwp++; continue; }
          return w;
        }
      };
      if (P.mode === 'home') {
        const w = o.script !== 'direct' && !P.homeDirect ? backTo() : null;
        if (w) { tx = w[0]; ty = w[1]; } else if (o.script !== 'direct' && d(F.x, F.y) > 300 && d(rp.x, rp.y) > d(F.x, F.y) && !P.homeDirect) { tx = F.x; ty = F.y; } else { P.homeDirect = true; tx = rp.x; ty = rp.y; }
      } else if (P.mode === 'deliver') {
        const w = o.script !== 'direct' && !P.back ? backTo() : null;
        if (w) { tx = w[0]; ty = w[1]; } else { P.back = true; tx = F.x; ty = F.y; }
        const df = d(F.x, F.y);
        if (P.back && df < 300) slow = true;
        if (P.back && df < F.ringM - 40) stop = true;
      } else {
        const route = o.script === 'straight' || o.script === 'direct' ? [] : [[F.x, F.y], ...chain];
        if (o.script === 'straight' && P.wp === 0) { route.push([C.x, C.y]); speed = 1; }
        if (P.wp < route.length && d(route[P.wp][0], route[P.wp][1]) < 200) P.wp++;
        if (P.wp < route.length) { tx = route[P.wp][0]; ty = route[P.wp][1]; if (o.script === 'straight') speed = 1; }
        else {
          let g = -1; let bd = Infinity;
          for (let i = 0; i < st.n; i++) if (st.left[i] > 0) { const dd = d(st.gx[i], st.gy[i]); if (dd < bd) { bd = dd; g = i; } }
          if (g < 0) { tx = laneEnd[0]; ty = laneEnd[1]; }
          else {
            tx = st.gx[g]; ty = st.gy[g];
            if (bd < 250) slow = true;
            if (bd < 30) stop = true;
          }
        }
      }
    }
    let brg = hl.bearing(b.x, b.y, tx, ty);
    // 見えた機雷をよける（前 30° の 200 m の内）
    const m = r.mines;
    if (m && o.script !== 'straight' && o.script !== 'direct') {
      for (let i = 0; i < m.max; i++) {
        if (m.state[i] !== 2) continue;
        const dm = d(m.x[i], m.y[i]);
        if (dm > 200) continue;
        const bm = hl.bearing(b.x, b.y, m.x[i], m.y[i]);
        let diff = ((bm - brg + 540) % 360) - 180;
        if (Math.abs(diff) < 30) { brg = (brg + (diff >= 0 ? -40 : 40) + 360) % 360; break; }
      }
    }
    const silentOn = o.script === 'silent' && !flee;
    w.input.silentOn = silentOn;
    let s01 = stop ? 0 : slow ? o.slowKt / (w.params.speedMaxMps * 1.943844) : silentOn ? 1 : speed;
    if (t < 1) { hl.steer(NaN, 0); } else hl.steer(brg, s01);
    if (P.mode === 'deliver' && P.back && d(F.x, F.y) < F.ringM - 40) hl.steer(NaN, 0);
    w.input.gunHeld = !!(w.pts && w.pts.section.detected && t % 6 < 3);
    if (o.script === 'smoke' && w.shoreGuns && w.shoreGuns.shoreInArc && w.shoreGuns.shoreShots > 0 && w.smoke && w.smoke.activeLeftS <= 0 && w.smoke.cooldownLeftS <= 0) { w.input.smokeTap = true; P.smokeN++; }
    hl.frame(o.frameMs);
    // 記録
    const shore = w.shoreGuns ? w.shoreGuns.shoreHits : 0;
    const blown = m ? m.blown : 0;
    const hp = w.damage.hp;
    if (hp < last.hp) {
      const by = blown > last.blown ? 'mine' : shore > last.shore ? 'shore' : attacking() || sboats().some((x) => x.phase === 4) ? 'sboat' : 'other';
      ev.hpBy[by] += last.hp - hp;
      if (!Number.isNaN(inCoverS) && by === 'sboat') ev.fleeHitsAfterCover++;
    }
    if (isFlee) {
      const near = sboats().some((x) => x.phase !== 6 && x.phase !== 7 && x.phase !== 8 && Math.hypot(x.x - F.x, x.y - F.y) < coverM);
      if (near && Number.isNaN(inCoverS)) { inCoverS = w.stepTimeS; ev.coverIn.push(+inCoverS.toFixed(1)); }
      if (!near) inCoverS = NaN;
    }
    const cov = r.cover ? r.cover.count : 0;
    if (cov > last.cover) ev.coverLeaveS.push(+w.stepTimeS.toFixed(1));
    if (Number.isNaN(ev.detectS) && w.pts && w.pts.section.detected) ev.detectS = +w.stepTimeS.toFixed(1);
    if (Number.isNaN(ev.firstPickS) && st.aboard + st.delivered > 0) ev.firstPickS = +w.stepTimeS.toFixed(1);
    if (Number.isNaN(ev.del20S) && st.delivered >= 20) ev.del20S = +w.stepTimeS.toFixed(1);
    if (Number.isNaN(ev.del40S) && st.delivered >= R.objectiveDelivered) ev.del40S = +w.stepTimeS.toFixed(1);
    if (w.boat.sinking && Number.isNaN(ev.sinkS)) { ev.sinkS = +w.stepTimeS.toFixed(1); ev.cause = blown > last.blown ? 'mine' : shore > last.shore ? 'shore' : hp < last.hp ? 'sboat?' : 'fire'; }
    last = { hp, shore, blown, cover: cov };
  }
  const endS = w.stepTimeS;
  const snap = {
    endS: +endS.toFixed(1), fuelGal: +w.fuel.gal.toFixed(2), fuelPct: Math.round((100 * w.fuel.gal) / w.fuelAllotmentGal), allot: w.fuelAllotmentGal, hp: Math.round(w.damage.hp),
    delivered: st.delivered, aboard: st.aboard, lostShell: st.lostShell, byOthers: st.byOthers, shoreShots: w.shoreGuns ? w.shoreGuns.shoreShots : 0, shoreHits: w.shoreGuns ? w.shoreGuns.shoreHits : 0,
    minesSeen: r.mines ? r.mines.seen : 0, minesBlown: r.mines ? r.mines.blown : 0, coverLeaves: r.cover ? r.cover.count : 0, sboats: sboats().map((x) => x.phase).join(''), smokeN: P.smokeN,
    sinking: w.boat.sinking, active: hl.active('Mission'),
  };
  // 終わりまで（沈んでいれば偽の時計で tween を進める）
  const realNow = Date.now;
  let fake = realNow.call(Date);
  if (w.boat.sinking) Date.now = () => fake;
  for (let i = 0; i < 60 * 60 && hl.active('Mission'); i++) { if (!w.boat.sinking) { hl.steer(NaN, 0); w.input.gunHeld = false; } fake += o.frameMs; hl.frame(o.frameMs); }
  for (let i = 0; i < 30; i++) { fake += o.frameMs; hl.frame(o.frameMs); }
  Date.now = realNow;
  const res = hl.active('Result') ? hl.texts('Result') : null;
  return { ...snap, ev, res, fin: { delivered: st.delivered, aboard: st.aboard, lostSunk: st.lostSunk, deliveredAtReturn: st.deliveredAtReturn, endS: +w.stepTimeS.toFixed(1), fuelPct: Math.round((100 * w.fuel.gal) / w.fuelAllotmentGal) } };
}

function parseSeeds(s) {
  const out = [];
  for (const part of s.split(',')) { const m = part.match(/^(\d+)-(\d+)$/); if (m) for (let i = +m[1]; i <= +m[2]; i++) out.push(i); else out.push(+part); }
  return out;
}

async function main() {
  const site = process.env.SITE;
  const s = await serve(site);
  const browser = await chromium.launch();
  const scripts = (process.env.SCRIPTS ?? 'careful').split(',');
  const seeds = parseSeeds(process.env.SEEDS ?? '1-16');
  const hards = (process.env.HARDS ?? '0,1').split(',').map(Number);
  const cases = [];
  for (const script of scripts) for (const hard of hards) for (const seed of seeds) cases.push({ script, hard, seed });
  const results = [];
  await pool(cases, envNum('JOBS', 2), async (c) => {
    const g = await openGame(browser, s.base, `mission=us_07&seed=${c.seed}${c.hard ? '&hard' : ''}${process.env.QUERY ? `&${process.env.QUERY}` : ''}`, { width: 1560 });
    const r = await g.page.evaluate(run, { frameMs: FRAME_MS, secs: envNum('SECS', 600), script: c.script, cruiseKt: envNum('CRUISE_KT', 23), slowKt: envNum('SLOW_KT', 4) });
    const heading = r.res ? r.res[1] : '(Result なし)';
    const scoreLine = r.res ? r.res.find((x) => / ・ 達成 \d+/.test(x)) : '';
    const achieved = /達成 [1-9]/.test(scoreLine ?? '');
    results.push({ ...c, ...r, heading, scoreLine, achieved, errors: g.errors.length, res: undefined, resAll: r.res });
    console.log(`${c.script.padEnd(8)} h${c.hard} s${String(c.seed).padStart(2)} ${achieved ? 'OK ' : '-- '} del ${r.fin.delivered} (ret ${r.fin.deliveredAtReturn}) t ${r.fin.endS} fuel ${r.fin.fuelPct}% hp ${r.hp} shell ${r.shoreHits}/${r.shoreShots} lostShell ${r.lostShell} mines ${r.minesSeen}/${r.minesBlown} cover ${r.coverLeaves} sink ${r.ev.sinkS} ${r.ev.cause} hpBy ${JSON.stringify(r.ev.hpBy)} | ${heading} | err ${g.errors.length}`);
    await g.ctx.close();
  });
  await browser.close();
  await s.close();
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(results, null, 1));
  // 表
  const key = (r) => `${r.script} ${r.hard ? 'hard' : 'normal'}`;
  const groups = {};
  for (const r of results) (groups[key(r)] ??= []).push(r);
  console.log('\n| 台本 | 難 | 夜 | 達成 | 渡した（平均・最小〜最大） | 沈没（砲台・機雷・S ボート・火災） | 漂流 | 終わりの秒（平均） | 燃料の残り（達成の夜の平均・最小） | 砲台の命中（平均） | 触雷（平均） | 砲撃で失った（平均） | フィッチの砲火で退いた（平均） |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  for (const [k, rs] of Object.entries(groups)) {
    const n = rs.length;
    const ok = rs.filter((r) => r.achieved);
    const sunk = rs.filter((r) => /沈没/.test(r.heading) || !Number.isNaN(r.ev.sinkS));
    const cause = (c) => sunk.filter((r) => (c === 'shore' ? /沿岸砲/.test(r.heading) : c === 'mine' ? /触雷/.test(r.heading) : c === 'sboat' ? /PT|Sボート/.test(r.heading) : !/沿岸砲|触雷|PT|Sボート/.test(r.heading))).length;
    const drift = rs.filter((r) => /漂流/.test(r.heading)).length;
    const del = rs.map((r) => r.fin.delivered);
    const fuelOk = ok.map((r) => r.fin.fuelPct);
    const [sc, hd] = k.split(' ');
    console.log(`| ${sc} | ${hd} | ${n} | ${ok.length}/${n}（${Math.round((100 * ok.length) / n)}%） | ${avg(del).toFixed(1)}（${Math.min(...del)}〜${Math.max(...del)}） | ${sunk.length}（${cause('shore')}・${cause('mine')}・${cause('sboat')}・${cause('fire')}） | ${drift} | ${avg(rs.map((r) => r.fin.endS)).toFixed(0)} | ${fuelOk.length ? `${avg(fuelOk).toFixed(0)}%・${Math.min(...fuelOk)}%` : '-'} | ${avg(rs.map((r) => r.shoreHits)).toFixed(2)} | ${avg(rs.map((r) => r.minesBlown)).toFixed(2)} | ${avg(rs.map((r) => r.lostShell)).toFixed(1)} | ${avg(rs.map((r) => r.coverLeaves)).toFixed(2)} |`);
  }
  console.log('ERRORS', results.reduce((a, r) => a + r.errors, 0));
}
await main();
