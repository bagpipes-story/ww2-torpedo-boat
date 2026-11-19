// v0.8.2 IP1 Task D（診断だけ・リポジトリに入れない）: 安全距離（武装の 100 m）が全任務で同じに効くか。1 夜 1 本。
// 自艇を狙う艦の「当たりのカプセルの縁」から D m に置き（beam＝艦の真横から直角に・bow＝艦首の前から向かって＝艦が近づく）、1 本撃つ（fireTap）。
// 記録: 発射点・カプセルに初めて入った時の走った距離 runM と武装の有無・結末（命中・不発・外れ）・命中の時の runM・発射の時の HUD（敵の中心までの距離＝テレメトリ・「敵 N m」の字）。
// 実行: SITE=<site> CASES='us_02:0,1;us_04:0' DS=40,70,100,130,200 GEOMS=beam,bow SEEDS=1-2 JOBS=2 node arming-probe.mjs > out.jsonl
import { chromium, openGame, pool, serve, FRAME_MS } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';

const parse = (s) => { const [a, b] = s.split('-').map(Number); return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i); };
const SEEDS = parse(process.env.SEEDS ?? '1-2');
const DS = (process.env.DS ?? '40,70,100,130,200').split(',').map(Number);
const GEOMS = (process.env.GEOMS ?? 'beam,bow').split(',');
const CASES = (process.env.CASES ?? 'us_02:0,1').split(';').map((x) => { const [m, t] = x.split(':'); const hard = m.endsWith('!'); return { mission: m.replace('!', ''), hard, targets: t.split(',').map(Number) }; });

function armRun(o) {
  const hl = window.__hl, w = hl.world(), g = w.destroyers, P = w.torpedoes.params, ST = w.torpedoes.states;
  if (!g) return { skipped: 'no ship group' };
  const keep = () => { w.damage.hp = w.damageParams.maxHp; w.damage.fireLeftS = 0; };
  const W = w.setup.mission.bounds.width, H = w.setup.mission.bounds.height;
  const ti = o.target, d = g.ships[ti];
  if (!d) return { skipped: `no ship ${ti}` };
  const ready = () => !d.out && w.stepTimeS >= o.minS && d.state.x > 700 && d.state.x < W - 700 && d.state.y > 700 && d.state.y < H - 700;
  while (hl.active('Mission') && w.stepTimeS < 400 && !ready()) { keep(); hl.steer(NaN, 0); hl.frame(o.frameMs); }
  if (!ready()) return { skipped: 'not ready', t: w.stepTimeS };
  const c = d.circles, r = c[0].r, half = Math.hypot(c[c.length - 1].x - c[0].x, c[c.length - 1].y - c[0].y) / 2 + r;
  const s0 = d.state, h = (s0.headingDeg * Math.PI) / 180, ax = Math.sin(h), ay = -Math.cos(h), nx = Math.cos(h), ny = Math.sin(h), v = s0.speedMps, u = P.speedMps;
  let bx, by;
  if (o.geom === 'beam') { const T = (r + o.D) / u; bx = s0.x + ax * v * T + nx * (r + o.D); by = s0.y + ay * v * T + ny * (r + o.D); }
  else { bx = s0.x + ax * (half + o.D); by = s0.y + ay * (half + o.D); }
  const b = w.boat.state; b.x = bx; b.y = by; b.speedMps = 0; b.headingDeg = o.geom === 'beam' ? hl.bearing(bx, by, bx - nx, by - ny) : hl.bearing(bx, by, bx - ax, by - ay);
  const H0 = b.headingDeg, shipH0 = s0.headingDeg;
  hl.steer(H0, 0); keep();
  const ev = w.torpedoEvents, oh = ev.onHit, om = ev.onMiss;
  const rec = { out: '', target: -1, runAtHit: NaN, dud: false };
  ev.onHit = (i, x, y, s) => { rec.out = s.dud ? 'dud' : 'hit'; rec.target = i; rec.runAtHit = s.runM; rec.shipH = d.state.headingDeg; rec.shipMovedM = launch ? Math.hypot(d.state.x - launch.shipX, d.state.y - launch.shipY) : NaN; oh.call(ev, i, x, y, s); };
  ev.onMiss = (s) => { rec.out = rec.out || 'miss'; om.call(ev, s); };
  w.input.fireTap = true;
  const inCap = (x, y) => { for (let i = 0; i < c.length - 1; i++) { const A = c[i], B = c[i + 1], abx = B.x - A.x, aby = B.y - A.y, apx = x - A.x, apy = y - A.y, l2 = abx * abx + aby * aby; let t = l2 > 0 ? (apx * abx + apy * aby) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t; const ex = apx - abx * t, ey = apy - aby * t; if (ex * ex + ey * ey <= A.r * A.r) return true; } return false; };
  let s = null, launch = null, entry = null, hud = null, moved = false;
  for (let f = 0; f < 60 * 20 && hl.active('Mission'); f++) {
    keep();
    if (!moved) { b.x = bx; b.y = by; b.headingDeg = H0; b.speedMps = 0; }
    hl.frame(o.frameMs);
    if (!s) {
      s = ST.find((q) => q.active || q.resolved) || null;
      if (s) {
        const t = window.__game.registry.get('boatTelemetry');
        launch = { x: s.x - Math.sin((s.headingDeg * Math.PI) / 180) * s.runM, y: s.y + Math.cos((s.headingDeg * Math.PI) / 180) * s.runM, centreM: Math.hypot(d.state.x - bx, d.state.y - by), run0: s.runM, shipH: d.state.headingDeg, shipV: d.state.speedMps, shipX: d.state.x, shipY: d.state.y, mode: d.ai.mode };
        hud = { enemyM: Math.hypot(t.enemyDx, t.enemyDy), sighted: t.enemySighted, texts: hl.texts('Hud').filter((x) => /^敵 /.test(x)) };
        // 艦首の前でも自艇は動かさない（横へ動かすと艦が追って向きを変える＝試しの 1 夜で見た）
      }
    }
    if (s && !entry && s.active && inCap(s.x, s.y)) entry = { run: s.runM, armed: s.runM >= P.armingM, shipH: d.state.headingDeg };
    if (s && !s.active && (rec.out || f > 600)) break;
    if (s && rec.out && !s.active) break;
  }
  return { shipH0, target: ti, geom: o.geom, D: o.D, armingM: P.armingM, u, v, r, half, cls: g.kits && g.kits.classes ? g.kits.classes[ti] : null, spec: { L: d.spec.lengthM, B: d.spec.beamM, k: d.spec.hitScale }, launch, hud, entry, rec, dud: s ? s.dud : null, erratic: s ? s.erratic : null };
}

async function main() {
  const sv = await serve(process.env.SITE), browser = await chromium.launch();
  const cases = [];
  for (const C of CASES) for (const target of C.targets) for (const geom of GEOMS) for (const D of DS) for (const seed of SEEDS) cases.push({ ...C, target, geom, D, seed });
  const res = await pool(cases, Number(process.env.JOBS ?? 2), async (c) => {
    const { page, ctx, errors } = await openGame(browser, sv.base, `mission=${c.mission}&seed=${c.seed}${c.hard ? '&hard' : ''}`, { width: 1560 });
    try { return { c, r: await page.evaluate(armRun, { target: c.target, geom: c.geom, D: c.D, frameMs: FRAME_MS, minS: 5 }), errors }; }
    catch (e) { return { c, r: { skipped: String(e && e.message ? e.message : e) }, errors }; } finally { await ctx.close(); }
  });
  for (const x of res) console.log(JSON.stringify(x));
  await browser.close(); await sv.close();
}
await main();
