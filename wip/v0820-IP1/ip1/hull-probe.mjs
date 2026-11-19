// v0.8.2 IP1 Task B（診断だけ・門ではない・リポジトリに入れない）: 「魚雷が船体の下を通る」を本物の世界で測る。
// 1 夜 1 本の扇（4 本）を狙った艦へ。自艇を射点へ置き（瞬間移動）、迎撃の針路に向けて止まり、HP を毎フレーム満タンに戻す（測るためだけ）。
// 毎フレームの後に、走っている魚雷の位置が各艦の「描いた船体」（艦の絵のテクスチャの不透明の画素 α ≥ 128 を、スプライトの位置・回転・表示の大きさで世界へ写した物）の中かを見る。
// 魚雷ごとに: 描いた船体を通った艦・その時の状態（決着済み＝通り過ぎの外れ・武装前・不発・蛇行・艦が沈む／出た・当たりのカプセルの中か・艦の絵が見えていたか）と結末（命中・不発・終わり際・外れ）。
// 実行: SITE=<site> MISSION=us_05|us_02 SEEDS=1-24 RANGES=800,1100,1500 SIDES=1,-1 JOBS=2 node hull-probe.mjs > out.txt
import { chromium, openGame, pool, serve, FRAME_MS } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';

const MISSION = process.env.MISSION ?? 'us_05';
const parse = (s) => { const [a, b] = s.split('-').map(Number); return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i); };
const SEEDS = parse(process.env.SEEDS ?? '1-24');
const RANGES = (process.env.RANGES ?? '800,1100,1500').split(',').map(Number);
const SIDES = (process.env.SIDES ?? '1,-1').split(',').map(Number);
const Q = process.env.Q ?? '';

function nightRun(o) {
  const hl = window.__hl, w = hl.world(), g = w.destroyers, P = w.torpedoes.params, ST = w.torpedoes.states;
  const keep = () => { w.damage.hp = w.damageParams.maxHp; w.damage.fireLeftS = 0; };
  const cls = g.kits && g.kits.classes ? g.kits.classes : g.ships.map(() => 'destroyer');
  // 描いた船体の α（テクスチャの鍵ごとに 1 回）
  const alpha = {};
  const alphaOf = (spr) => {
    const k = spr.texture.key;
    if (!alpha[k]) {
      const img = spr.texture.getSourceImage(), c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const cx = c.getContext('2d'); cx.drawImage(img, 0, 0);
      alpha[k] = { w: img.width, h: img.height, d: cx.getImageData(0, 0, img.width, img.height).data };
    }
    return alpha[k];
  };
  const inDrawn = (spr, x, y) => {
    if (!spr.visible && !o.countHidden) return false;
    const a = alphaOf(spr), f = spr.frame, r = spr.rotation, dx = x - spr.x, dy = y - spr.y;
    const lx = (dx * Math.cos(r) + dy * Math.sin(r)) / spr.scaleX + spr.displayOriginX, ly = (-dx * Math.sin(r) + dy * Math.cos(r)) / spr.scaleY + spr.displayOriginY;
    const px = Math.floor(f.cutX + lx), py = Math.floor(f.cutY + ly);
    if (lx < 0 || ly < 0 || lx >= f.cutWidth || ly >= f.cutHeight) return false;
    return a.d[(py * a.w + px) * 4 + 3] >= 128;
  };
  const capsule = (ship, x, y) => {
    const c = ship.circles, n = c.length;
    for (let i = 0; i < n - 1; i++) {
      const A = c[i], B = c[i + 1], abx = B.x - A.x, aby = B.y - A.y, apx = x - A.x, apy = y - A.y, l2 = abx * abx + aby * aby;
      let t = l2 > 0 ? (apx * abx + apy * aby) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = apx - abx * t, ey = apy - aby * t, rr = Math.max(A.r, B.r);
      if (ex * ex + ey * ey <= rr * rr) return true;
    }
    return false;
  };
  // 結末の記録
  const idx = (s) => ST.indexOf(s);
  const rec = ST.map(() => ({ fired: false, out: '', target: -1, dud: false, erratic: false, cross: {}, missNear: -1, missD: NaN, missRun: NaN, missAtS: NaN, passMiss: false }));
  const ev = w.torpedoEvents, oh = ev.onHit, om = ev.onMiss, ol = ev.onLateHit;
  const nearestAfloat = (x, y) => { let b = -1, bd = Infinity; for (let i = 0; i < g.ships.length; i++) { const d = g.ships[i]; if (d.out) continue; const q = (d.state.x - x) ** 2 + (d.state.y - y) ** 2; if (q < bd) { bd = q; b = i; } } return [b, Math.sqrt(bd)]; };
  ev.onHit = (i, x, y, s) => { const r = rec[idx(s)]; r.out = s.dud ? 'dud' : 'hit'; r.target = i; oh.call(ev, i, x, y, s); };
  ev.onLateHit = (i, x, y, s) => { const r = rec[idx(s)]; r.out = 'late'; r.target = i; ol.call(ev, i, x, y, s); };
  ev.onMiss = (s) => {
    const r = rec[idx(s)]; r.out = 'miss'; r.missRun = s.runM; r.missAtS = w.stepTimeS;
    const [b, d] = nearestAfloat(s.x, s.y); r.missNear = b; r.missD = d;
    r.passMiss = s.active && s.runM < P.rangeM; // 走っている間に決着（通り過ぎの外れ）
    om.call(ev, s);
  };
  // 狙う艦が射点の距離に来るまで回す
  const ti = o.target;
  const ready = () => { const d = g.ships[ti]; if (!d || d.out) return false; const s = d.state; return w.stepTimeS >= o.minS && s.x > o.x0 && s.x < w.setup.mission.bounds.width - o.x1 && s.y > 500 && s.y < w.setup.mission.bounds.height - 500; };
  while (hl.active('Mission') && w.stepTimeS < o.maxWaitS && !ready()) { keep(); hl.steer(NaN, 0); hl.frame(o.frameMs); }
  if (!ready()) return { skipped: 'target not ready', t: w.stepTimeS };
  // 射点: 艦の今の速度で魚雷が R を走る間に進む先の横 R
  const d = g.ships[ti], s0 = d.state, h = (s0.headingDeg * Math.PI) / 180, vx = Math.sin(h) * s0.speedMps, vy = -Math.cos(h) * s0.speedMps, u = P.speedMps;
  const T = o.range / u, ix = s0.x + vx * T, iy = s0.y + vy * T, nx = Math.cos(h) * o.side, ny = Math.sin(h) * o.side; // 右手の法線（side 1）・左手（−1）
  const W = w.setup.mission.bounds.width, H = w.setup.mission.bounds.height;
  let bx = ix + nx * o.range, by = iy + ny * o.range;
  if (bx < 100 || by < 100 || bx > W - 100 || by > H - 100) return { skipped: 'off map', t: w.stepTimeS };
  // 迎撃の針路（艦の速度一定・魚雷の速さ u）
  const ihead = () => { const rx = d.state.x - bx, ry = d.state.y - by, a = vx * vx + vy * vy - u * u, bq = 2 * (rx * vx + ry * vy), c = rx * rx + ry * ry, disc = bq * bq - 4 * a * c; const t = (-bq - Math.sqrt(Math.max(0, disc))) / (2 * a); const px = d.state.x + vx * t, py = d.state.y + vy * t; return hl.bearing(bx, by, px, py); };
  const b = w.boat.state; b.x = bx; b.y = by; b.speedMps = 0; b.headingDeg = ihead();
  hl.steer(b.headingDeg, 0); keep(); hl.frame(o.frameMs);
  b.x = bx; b.y = by; b.headingDeg = ihead();
  w.input.fireSalvoSpreadDeg = o.spreadDeg; w.input.fireSalvoCount = 4;
  const fireH = b.headingDeg, t0 = w.stepTimeS;
  let frames = 0;
  // 当たりの円と絵の位置・向きのずれ（艦ごとの最大。絵は world-visuals が固定ステップの後に合わせる）
  const dev = g.ships.map(() => ({ pos: 0, ang: 0, n: 0 }));
  const checkDev = () => {
    for (let j = 0; j < g.ships.length; j++) {
      const sh = g.ships[j];
      if (sh.out) continue;
      const c = sh.circles, a = c[0], z = c[c.length - 1], mx = (a.x + z.x) / 2, my = (a.y + z.y) / 2;
      const dp = Math.hypot(mx - sh.sprite.x, my - sh.sprite.y), ah = hl.bearing(z.x, z.y, a.x, a.y), da = Math.abs(((ah - sh.sprite.angle) % 360 + 540) % 360 - 180);
      const D = dev[j]; D.n++; if (dp > D.pos) D.pos = dp; if (c.length > 1 && Math.min(da, 180 - da) > D.ang) D.ang = Math.min(da, 180 - da);
    }
  };
  while (hl.active('Mission') && frames < o.maxRunF) {
    keep(); b.x = bx; b.y = by; b.speedMps = 0; b.headingDeg = fireH; hl.steer(fireH, 0);
    hl.frame(o.frameMs); frames++;
    checkDev();
    let live = 0;
    for (let k = 0; k < ST.length; k++) {
      const s = ST[k], r = rec[k];
      if (!s.active) continue;
      live++;
      if (!r.fired) { r.fired = true; r.dud = s.dud; r.erratic = s.erratic; }
      for (let j = 0; j < g.ships.length; j++) {
        const sh = g.ships[j];
        if (sh.offMap || sh.withdrawn) continue;
        if (!inDrawn(sh.sprite, s.x, s.y)) continue;
        const c = r.cross[j] ?? (r.cross[j] = { f: 0, resolved: 0, unarmed: 0, sinking: 0, inCap: 0, okOut: 0, visible: 0, firstRun: s.runM, firstS: w.stepTimeS });
        c.f++;
        if (s.resolved) c.resolved++; if (s.runM < P.armingM) c.unarmed++; if (sh.sinking) c.sinking++; if (capsule(sh, s.x, s.y)) c.inCap++;
        if (!s.resolved && s.runM >= P.armingM && !sh.sinking && !capsule(sh, s.x, s.y)) c.okOut++;
        if (sh.sprite.visible) c.visible++;
      }
    }
    if (frames > 30 && live === 0 && rec.every((r) => !r.fired || r.out)) break;
  }
  return { t0, fireH, range: o.range, side: o.side, target: ti, cls: cls[ti], armingM: P.armingM, u, classes: cls, dev, rec: rec.filter((r) => r.fired), names: g.kits && g.kits.names ? g.kits.names : null };
}

async function main() {
  const sv = await serve(process.env.SITE), browser = await chromium.launch();
  const hr = JSON.parse(await (await import('node:fs/promises')).readFile('/home/user/ww2-torpedo-boat/data/hit_rate_model.json', 'utf8'));
  const spreadDeg = hr.torpedo_launch.salvo_spacing_deg * 3;
  const TARGETS = MISSION === 'us_05' ? (process.env.HARD ? [5, 6, 3, 4, 0, 7] : [5, 6, 3, 4, 0, 1]) : (process.env.TARGETS ?? '0,1,2').split(',').map(Number);
  const cases = [];
  for (const seed of SEEDS) for (const range of RANGES) for (const side of SIDES) cases.push({ seed, range, side, target: TARGETS[(seed - 1) % TARGETS.length] });
  const res = await pool(cases, Number(process.env.JOBS ?? 2), async (c) => {
    const { page, ctx, errors } = await openGame(browser, sv.base, `mission=${MISSION}&seed=${c.seed}${process.env.HARD ? '&hard' : ''}${Q}`, { width: 1560 });
    try {
      const r = await page.evaluate(nightRun, { ...c, frameMs: FRAME_MS, spreadDeg, minS: MISSION === 'us_05' ? 0 : 15, maxWaitS: 400, x0: 900, x1: 1500, maxRunF: 60 * 120, countHidden: false });
      return { c, r, errors };
    } catch (e) { return { c, r: { skipped: String(e && e.message ? e.message : e) }, errors }; } finally { await ctx.close(); }
  });
  for (const x of res) console.log(JSON.stringify(x));
  await browser.close(); await sv.close();
}
await main();
