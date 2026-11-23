// 倍速の 1 ステップずつの A/B（v0.8.3。docs/02 §5「倍速」・CHANGELOG v0.8.3 D2）: 同じビルド・同じ任務と seed を、1 倍（入れない）と倍速（入れる。MIX=1 なら 300 フレームごとに入り切り）で
// 同じステップの数まで回し、ステップごとの世界の写し（自艇・HP・火災・燃料・艦・大発・PT・輸送隊・魚雷・揚陸・退避の隊長艇・命中スローの時計・砲の乱数）を比べる。
// 写しは固定ステップごと（世界の stepFn を包む）。入力（スティック・魚雷・機銃）はステップの数と、そのステップの後の世界だけから決める（フレームの区切りに依らない＝倍速で 1 フレームに
// 2 ステップでも 1 倍と同じステップに同じ入力）。ゲームは import しない。ページのエラーも数える。違えば最初に違ったステップと欄。
// 実行: SITE=<site> [CASES=us_02:1,us_02:2,...] [STEPS=7200] [MIX=1] [FAULT=1] [JOBS=2] node scripts/headless/fast2-ab.mjs
import { chromium, envNum, openGame, pool, serve } from './lib.mjs';
import { firstField } from './ab-replay.mjs';

if (!process.env.SITE) throw new Error('SITE=<site> が要る');
const DEF = 'us_01:1,us_02:1,us_02:2,us_02h:1,us_03:1,jp_01:1,jp_02:1,jp_03:1,jp_03h:1,jp_04:1,jp_05:1,jp_06:1,us_04:1,us_05:1,us_05h:2,us_06:1';
const cases = (process.env.CASES ?? DEF).split(',').map((s) => {
  const [m, seed] = s.split(':');
  return { mission: m.replace(/h$/, ''), hard: m.endsWith('h'), seed: Number(seed) };
});
const STEPS = envNum('STEPS', 7200);

/** ページの中: 1 夜をステップの数 steps まで回し、ステップごとの写しを返す。fastAt(f) はフレーム f の倍速の入り切り（mode 'off'・'on'・'mix'） */
function run(o) {
  const hl = window.__hl;
  const w = hl.world();
  const r6 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e9) / 1e9 : v);
  const d2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
  const out = [];
  let lastTorp = -1;
  const snap = () => {
    const b = w.boat.state;
    const s = { n: out.length, t: w.stepTimeS, b: [b.x, b.y, b.headingDeg, b.speedMps], hp: w.damage.hp, fire: w.damage.fireLeftS, fuel: w.fuel.gal, sink: w.boat.sinking, home: w.atHome, slow: w.slowMoLeftS, gun: w.gunRng.state, hits: w.hits, shots: w.shots.length, det: w.detect.count };
    if (w.destroyers) s.d = w.destroyers.ships.map((x) => [x.state.x, x.state.y, x.state.headingDeg, x.sinking, x.withdrawn, x.hitsTaken]);
    if (w.hunt) s.g = w.hunt.flotilla.barges.map((x) => [x.x, x.y, x.phase, x.hp]);
    if (w.pts) s.p = w.pts.section.boats.map((x) => [x.x, x.y, x.phase, x.hp, x.fate]);
    if (w.convoy) s.c = [w.convoy.state.arrived, w.convoy.state.sunk, w.convoy.state.hitsTaken, w.convoy.state.barges.map((x) => [x.x, x.y])];
    s.tp = w.torpedoes.states.map((x) => (x.active ? [x.x, x.y] : 0));
    if (w.landing) s.l = [w.landing.state.phase, w.landing.state.hits];
    if (w.evac) s.e = [w.evac.sq.control, w.evac.sq.groups.map((g) => g.boats.map((x) => [x.state.x, x.state.y, x.sunk, x.up]))];
    if (w.recon) s.rc = [w.recon.state.stage, w.recon.state.radioBroken, w.recon.state.trackedS, w.recon.state.draws];
    return JSON.stringify(s);
  };
  // 次のステップの入力（ステップの数と今の世界だけから。ab-replay の台本と同じ形）
  const steer = () => {
    const t = w.stepTimeS;
    const b = w.boat.state;
    const f = w.enemy.focus(b.x, b.y);
    const dist = f ? Math.sqrt(d2(f, b)) : Infinity;
    const i = w.input;
    i.stickActive = true;
    if (t < 2) { i.headingDeg = NaN; i.speed01 = 0; }
    else if (f && dist < 600) { i.headingDeg = hl.bearing(f.x, f.y, b.x, b.y); i.speed01 = 0.8; }
    else if (f) { i.headingDeg = hl.bearing(b.x, b.y, f.x, f.y); i.speed01 = dist > 1800 ? 0.6 : 0.4; }
    else { i.headingDeg = (90 + t * 2) % 360; i.speed01 = 0.5; }
    const slot = Math.floor(t / 12);
    if (t > 8 && slot !== lastTorp && dist < 2500) { i.fireTap = true; lastTorp = slot; }
    i.gunHeld = t % 8 < 3 && dist < 1500;
    i.silentOn = Math.floor(t / 20) % 3 === 1; // 静音も 20 秒ずつ入れる（倍速の比べの中で静音の指令も通す）
    if (w.evac && out.length % 1500 === 750) i.switchTap = true; // jp_03 の［切替］
    if (o.fault && out.length === 1000) i.speed01 += 0.01; // FAULT=1: 倍速の側だけ 1 ステップの入力を変える（違いが出るはず＝比べが効いている試し）
  };
  const orig = w.stepFn;
  w.stepFn = (dt) => {
    orig(dt);
    out.push(snap());
    steer();
  };
  steer();
  let f = 0;
  while (out.length < o.steps && hl.active('Mission') && f < o.steps * 2) {
    w.input.fastOn = o.mode === 'on' || (o.mode === 'mix' && f % 600 < 300);
    hl.frame(1000 / 60);
    f++;
  }
  return { out, frames: f, fast: w.input.fastOn };
}

const site = await serve(process.env.SITE);
const browser = await chromium.launch();
const mode = process.env.MIX === '1' ? 'mix' : 'on';
const res = await pool(cases, envNum('JOBS', 2), async (c) => {
  const q = `mission=${c.mission}&seed=${c.seed}${c.hard ? '&hard' : ''}`;
  const pa = await openGame(browser, site.base, q);
  const pb = await openGame(browser, site.base, q);
  try {
    const [ra, rb] = await Promise.all([pa.page.evaluate(run, { steps: STEPS, mode: 'off' }), pb.page.evaluate(run, { steps: STEPS, mode, fault: process.env.FAULT === '1' })]);
    const n = Math.min(ra.out.length, rb.out.length);
    let at = -1;
    for (let i = 0; i < n; i++) if (ra.out[i] !== rb.out[i]) { at = i; break; }
    const slow = ra.out.filter((s) => JSON.parse(s).slow > 0).length;
    const errors = [...pa.errors.map((e) => `1x: ${e}`), ...pb.errors.map((e) => `2x: ${e}`)];
    return { ...c, n, framesA: ra.frames, framesB: rb.frames, slow, at, field: at >= 0 ? firstField(ra.out[at], rb.out[at]) : null, errors };
  } finally {
    await pa.ctx.close();
    await pb.ctx.close();
  }
});
await browser.close();
await site.close();
let bad = 0;
for (const r of res) {
  const same = r.at < 0 && r.errors.length === 0 && r.n > 0;
  if (!same) bad++;
  console.log(`${r.mission}${r.hard ? '&hard' : ''} seed ${r.seed} ${mode} same:${same} steps ${r.n} frames 1x ${r.framesA} 2x ${r.framesB} slow-steps ${r.slow}${r.at >= 0 ? ` 最初の違い step ${r.at} ${JSON.stringify(r.field)}` : ''}${r.errors.length ? ` page errors ${r.errors.length}: ${r.errors[0]}` : ''}`);
}
console.log(`cases ${res.length} same ${res.length - bad} diff ${bad}`);
process.exitCode = bad === 0 ? 0 : 1;
