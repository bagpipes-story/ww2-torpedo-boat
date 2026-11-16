// us_06 の探りと帯（v0.8.1 S3。spec-v0810 §3.9 D-P1〜D-P3、lead の L50〜L57。門ではない・ゲームの束と g2 には入らない）: ヘッドレスで本当の世界（?debug&mission=us_06）を
// 台本（scripts/headless/anchor-probe-policy.mjs＝素の JS）で回す。ページの糊は人が知れる物だけで素の view を書く（L52: 地図＝出発点・帰投の輪・岸の線・Briefing が言う停泊地＝
// missions_seed の種の位置、レーダーの輝点、目で見える艦＝mission-telemetry と同じ視程の比べの内の位置と目で見た位置の差の速さ、HUD のテレメトリ）。
// 夜ごとの測り（L55）は印の間の 1 か所だけが何でも読む（tests/anchor-probe-scan はその間を除いて名前を走査する）。沈む絵の tween は壁の時計で進むので、
// ページの Date.now を偽の時計に替える（strait-probe と同じ）。帯（spec §3.9 の表）は ✓・✗・端（帯の端から ±5 点の内＝その行だけ seed 41〜80 を足して 80 夜で決める）。
// 実行: VITE_BASE=/ww2-torpedo-boat/ npx vite build --outDir <site> の後
//   SITE=<site> [SEEDS=1-40] [POLS=shore_east,…] [HARD=1] [MAXS=1600] [W=1560] [JOBS=3] [EXT=0] node scripts/headless/anchor-probe.mjs
// HARD=1 はハード（既定の台本は shore_east・open_north）。EXT=0 は端の行に seed を足さない。終了コードはページのエラーが 1 つでもあれば 1（帯は門にしない）。
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAME_MS, chromium, envNum, openGame, pool, serve } from './lib.mjs';
import { ANCHOR_HARD_POLICIES, ANCHOR_POLICIES } from './anchor-probe-policy.mjs';
import { parseSeeds } from './world-vs-sim.mjs';

const require = createRequire(import.meta.url), HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..');
const MISSION = 'us_06', CHUNK = 600; // CHUNK: 1 回の evaluate で進めるフレーム

/** ページの中: 糊（人が知れる物で view を書く）・測り（印の間）・1 フレームずつ回す口 */
const PAGE = `
import { ANCHOR_HUMAN, createAnchorDriver, stepAnchorDriver } from '${HERE}/anchor-probe-policy.mjs';
const CAP = 16, f64 = () => new Float64Array(CAP);
const newView = () => ({ t: 0, leftS: 0, x: 0, y: 0, h: 0, hp: 0, fuel01: 0, torps: 0, atHome: false, seen: false, lit: false, rangeM: 0, ddSunk: 0, trSunk: false,
  bn: 0, sweepS: NaN, bx: f64(), by: f64(), bAt: f64(), en: 0, eid: new Int8Array(CAP), ekind: new Int8Array(CAP), ex: f64(), ey: f64(), evx: f64(), evy: f64() });
/** 地図と艇の知れる値（Briefing・画面）。停泊地と魚雷の速さと扇の間隔は node が data から渡す（np） */
function planOf(w, np) {
  const s = w.setup, m = s.mission, b = s.boatParams;
  return { width: m.bounds.width, height: m.bounds.height, coastY: m.bounds.height, startX: m.playerStart.x, startY: m.playerStart.y, ringX: m.returnPoint.x, ringY: m.returnPoint.y,
    ringR: m.returnPoint.radiusM, dawnS: s.durationS, visM: Math.sqrt(w.visRange2), silent01: (b.silentMaxMps / b.speedMaxMps) * ANCHOR_HUMAN.silentFrac, cruise01: b.speedCruiseMps / b.speedMaxMps, ...np };
}
/** 毎フレームの view: 自艇・HUD・レーダーの輝点・目（視程の内の艦の位置と、見えている間 0.5 秒ごとの位置の差の速さ） */
function fillView(st, w, t) {
  const v = st.v, b = w.boat.state, g = w.destroyers, r = w.radar ? w.radar.state : null, e = st.eye;
  v.t = w.stepTimeS; v.leftS = t.timeLeftS; v.x = b.x; v.y = b.y; v.h = b.headingDeg; v.hp = t.hp; v.fuel01 = t.fuel01; v.torps = t.torpedoesLeft; v.atHome = t.atHome;
  v.seen = t.playerDetected; v.lit = t.illuminated; v.rangeM = t.detectRangeM; v.ddSunk = t.shipsSunk; v.trSunk = t.transportSunk;
  v.bn = r ? r.n : 0; v.sweepS = r ? r.lastSweepS : NaN;
  for (let k = 0; k < v.bn; k++) { v.bx[k] = r.blips[k].x; v.by[k] = r.blips[k].y; v.bAt[k] = r.blips[k].atS; }
  v.en = 0;
  for (let i = 0; g && i < g.ships.length; i++) {
    const p = g.ships[i].state, dx = p.x - b.x, dy = p.y - b.y;
    if (g.ships[i].out || dx * dx + dy * dy > w.visRange2) { e.t0[i] = NaN; continue; }
    if (Number.isNaN(e.t0[i])) { e.t0[i] = v.t; e.x0[i] = p.x; e.y0[i] = p.y; e.vx[i] = 0; e.vy[i] = 0; }
    else if (v.t - e.t0[i] >= 0.5) { e.vx[i] = (p.x - e.x0[i]) / (v.t - e.t0[i]); e.vy[i] = (p.y - e.y0[i]) / (v.t - e.t0[i]); e.t0[i] = v.t; e.x0[i] = p.x; e.y0[i] = p.y; }
    const n = v.en++; v.eid[n] = i; v.ekind[n] = i < g.destroyerCount ? 0 : i === g.transportIndex ? 1 : 2; v.ex[n] = p.x; v.ey[n] = p.y; v.evx[n] = e.vx[i]; v.evy[n] = e.vy[i];
  }
}
// <anchor-probe:measure> 測り（L55。ここだけは世界の何でも読む。台本には渡さない。tests/anchor-probe-scan はこの印の間を走査しない）
const WHY = ['-', 'seen', 'wake', 'hit', 'alarm', 'dawn'];
function measureInit(st, w) {
  const g = w.destroyers, m = st.m = { slow: 0, k5: 0, fired: 0, firstS: NaN, firstEtaS: NaN, sinkFan: 0, fanOf: new WeakMap() };
  const L = w.launcher, up = L.update, ev = w.torpedoEvents, onHit = ev.onHit;
  // D-K1 が kpiTarget を決める所（systems/torpedo-free の stepLauncher → launcher.update）: 狙った艦が 5 kt 未満の 1 本と、そのうち kpiTarget が真の本数
  L.update = function (dt, boat, target, kpi) {
    const s = up.call(this, dt, boat, target, kpi);
    if (!s) return s;
    m.fired++; m.fanOf.set(s, st.fan);
    if (Number.isNaN(m.firstS)) { m.firstS = w.stepTimeS; m.firstEtaS = w.stepTimeS + (Number.isFinite(s.rangeAtLaunchM) ? s.rangeAtLaunchM : 0) / st.plan.torpScreenMps; }
    if (target && target.speedMps < w.kpiMinTargetSpeedMps) { m.slow++; if (kpi || s.kpiTarget) m.k5++; }
    return s;
  };
  // 卯月を沈め始めた 1 本の扇の番号（A5）
  ev.onHit = (i, x, y, s) => { const uz = g.ships[0], was = uz.sinking; onHit(i, x, y, s); if (!was && uz.sinking) m.sinkFan = m.fanOf.get(s) ?? -1; };
}
function measureEnd(st, w, t, r) {
  const g = w.destroyers, a = t.anchor, m = st.m, moveS = a ? a.underwayAtS[0] : NaN;
  const pk = g.picketIndex < 0 ? 0 : g.ships.slice(g.picketIndex).filter((d) => d.sinking).length;
  return { reason: r ? r.reason : 'maxSteps', home: r ? r.returned : false, preDawn: r ? !r.dawn.reached : false, fuelPct: r ? r.fuelLeftPct : NaN, t: w.stepTimeS,
    uz: g.ships[0].sinking ? 1 : 0, tr: g.transportSunk ? 1 : 0, pk, why: a ? WHY[a.reason[0]] : '-', alertS: a ? a.noticedAtS[0] : NaN, moveS,
    fired: m.fired, hits: w.hits, held: a ? a.heldShots : 0, heldHits: a ? a.heldHits : 0, bdS: a ? a.backdropS : 0, slow: m.slow, k5: m.k5, firstS: m.firstS,
    moveFirst: Number.isFinite(m.firstS) && moveS < m.firstS, moveEta: Number.isFinite(m.firstS) && moveS < m.firstEtaS, fan1: m.sinkFan === 1 ? 1 : 0 };
}
// </anchor-probe:measure>
window.__ap = { run(o) {
  const hl = window.__hl, game = window.__game;
  let st = window.__apState;
  if (!st) {
    const w = hl.world(), plan = planOf(w, o.np), eye = { t0: f64().fill(NaN), x0: f64(), y0: f64(), vx: f64(), vy: f64() };
    st = window.__apState = { plan, d: createAnchorDriver(o.policy, o.seed, plan), v: newView(), out: { headingDeg: NaN, speed01: 0, fireN: 0, fireSpreadDeg: 0 }, eye, fan: 0, frames: 0, m: null };
    measureInit(st, w);
  }
  for (let k = 0; k < o.frames; k++) {
    const w = hl.world(), t = game.registry.get('boatTelemetry');
    if (!hl.active('Mission')) return { done: true, m: measureEnd(st, w, t, game.scene.getScene('Result').result) };
    if (st.frames >= o.maxFrames) return { done: true, m: measureEnd(st, w, t, null) };
    fillView(st, w, t);
    stepAnchorDriver(st.d, st.v, st.out);
    hl.steer(st.out.headingDeg, st.out.speed01);
    if (st.out.fireN > 0) { w.input.fireSalvoSpreadDeg = st.out.fireSpreadDeg; w.input.fireSalvoCount = st.out.fireN; st.fan++; }
    hl.frame(o.frameMs); st.frames++;
  }
  return { done: false };
} };
`;

/** Briefing が言う停泊地（種の位置そのもの）・魚雷の画面の速さ・扇の間隔（data から。人は Briefing と画面で知れる） */
function nominalPlan() {
  const rd = (f) => JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8'));
  const seed = rd('missions_seed.json').missions.find((x) => x.id === MISSION), p = seed.v0_1_prototype, hr = rd('hit_rate_model.json');
  const tp = rd('torpedoes.json').torpedoes.find((x) => x.id === seed.torpedo_type), kt = tp.settings[tp.default_setting].speed_kt;
  return { uzX: p.enemy_start.x_m, uzY: p.enemy_start.y_m, trX: p.transport.start.x_m, trY: p.transport.start.y_m, torpScreenMps: (kt * 1852 / 3600) * hr.world.time_scale, spacingDeg: hr.torpedo_launch.salvo_spacing_deg };
}
const bundle = async (contents) => (await require('esbuild').build({ stdin: { contents, resolveDir: HERE, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', write: false, logLevel: 'silent' })).outputFiles[0].text;
/** ページの Date.now を偽の時計に（init script。lib の pageInit の後） */
function tweenClock() { const t0 = Date.now(); Date.now = () => t0 + (window.__hl ? window.__hl.t : 0); }

const SUNK = new Set(['rammed', 'destroyed', 'friendly_fire', 'storm', 'bombed', 'air_strike']);
async function night(browser, base, code, c) {
  const q = `mission=${MISSION}&seed=${c.seed}${c.hard ? '&hard' : ''}${c.policy === 'shore_east_nb' ? '&nobackdrop' : ''}`;
  const { page, ctx, errors } = await openGame(browser, base, q, { width: c.width, init: tweenClock });
  try {
    await page.addScriptTag({ content: code });
    let r;
    do r = await page.evaluate((o) => window.__ap.run(o), { policy: c.policy, seed: c.seed, np: c.np, frames: CHUNK, frameMs: FRAME_MS, maxFrames: Math.round(c.maxS * 60) });
    while (!r.done);
    return { ...r.m, own: SUNK.has(r.m.reason), errors };
  } catch (e) {
    return { reason: 'error', own: false, errors: [...errors, String(e && e.message ? e.message : e)] };
  } finally {
    await ctx.close();
  }
}

const pct = (rs, f) => (rs.length === 0 ? NaN : Math.round((100 * rs.filter(f).length) / rs.length));
const sum = (rs, k) => rs.reduce((s, r) => s + (r[k] ?? 0), 0);
const median = (xs) => { const s = [...xs].sort((a, b) => a - b), h = s.length >> 1; return s.length === 0 ? NaN : s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-');
/** 台本ごとの数（%・中央値）: 達成＝卯月撃沈＋帰投。A5 は撃った夜のうち撃つ前に動かなかった夜 */
function rowOf(rs) {
  const home = rs.filter((r) => r.home), fired = rs.filter((r) => r.fired > 0), early = fired.filter((r) => !r.moveFirst), reasons = {};
  for (const r of rs) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  return { n: rs.length, win: pct(rs, (r) => r.uz && r.home), own: pct(rs, (r) => r.own), home: pct(rs, (r) => r.home), uz: pct(rs, (r) => r.uz), tr: pct(rs, (r) => r.tr),
    moveFirst: pct(fired, (r) => r.moveFirst), moveEta: pct(fired, (r) => r.moveEta), a5: pct(early, (r) => r.fan1), a5n: early.length, fuel: median(home.map((r) => r.fuelPct)), preDawn: pct(home, (r) => r.preDawn),
    k5: sum(rs, 'k5'), slow: sum(rs, 'slow'), held: sum(rs, 'held'), heldHits: sum(rs, 'heldHits'), pk: sum(rs, 'pk'), bdS: median(rs.map((r) => r.bdS ?? 0)),
    drift: rs.filter((r) => r.reason === 'adrift' && !r.preDawn && r.t < 1500).length, ends: rs.filter((r) => (r.reason === 'adrift' || r.reason === 'air_strike') && !r.preDawn && r.t < 1500).length,
    lastS: Math.max(...rs.map((r) => r.t ?? 0)), reasons: Object.entries(reasons).map(([k, v]) => `${k} ${v}`).join('・') };
}
/** 帯の判定: 下限・上限（null は無し）。端は帯の端から ±5 点の内 */
function verdict(x, lo, hi) {
  if (!Number.isFinite(x)) return '—';
  if ((lo !== null && Math.abs(x - lo) <= 5) || (hi !== null && Math.abs(x - hi) <= 5)) return '端';
  return (lo === null || x >= lo) && (hi === null || x <= hi) ? '✓' : '✗';
}
/** spec §3.9 の帯（ノーマル A1〜A6・F・T・D・K、ハード H1・H2・K）: [名, 台本, 文, 判定の列] */
function bands(R, hard) {
  const a = R.shore_east, o = R.open_north, out = [];
  const add = (name, pol, parts) => out.push([name, pol, parts.map(([lab, x, lo, hi]) => `${lab} ${Number.isFinite(x) ? x : '-'} ${verdict(x, lo, hi)}`).join(' ・ '), parts.map(([, x, lo, hi]) => verdict(x, lo, hi))]);
  if (hard && a) add('H1', 'shore_east', [['達成', a.win, 40, 70], ['沈没', a.own, null, 20]]);
  if (hard && a && o) add('H2', 'open_north', [[`達成（≤ ${a.win - 15}）`, o.win, null, a.win - 15]]);
  if (!hard && a) add('A1', 'shore_east', [['達成', a.win, 55, 80], ['沈没', a.own, null, 10], ['帰投', a.home, 85, null]]);
  if (!hard && a && o) add('A2', 'open_north', [[`達成（≤ ${a.win - 15}）`, o.win, null, a.win - 15], ['最初の 1 本を撃つ前に動いた', o.moveFirst, 50, null]]);
  if (!hard && a && R.shore_east_nb) add('A3', 'shore_east_nb', [[`達成（≤ ${a.win - 15}）`, R.shore_east_nb.win, null, a.win - 15]]);
  const c = R.charge, v4 = c ? [verdict(c.own, 30, null), verdict(c.win, null, 35)] : [];
  if (!hard && c) out.push(['A4', 'charge', `沈没 ${c.own}（≥ 30）か 達成 ${c.win}（≤ 35）`, [v4.includes('✓') ? '✓' : v4.includes('端') ? '端' : '✗']]);
  if (!hard && a) add('A5', 'shore_east', [[`最初の扇で沈んだ（動く前に撃った ${a.a5n} 夜のうち）`, a.a5, 60, 90]]);
  if (!hard && a && R.transport_first) add('A6', 'transport_first', [['空知丸撃沈', R.transport_first.tr, 70, null], [`達成（≤ ${a.win}）`, R.transport_first.win, null, a.win]]);
  if (!hard && a) add('F', 'shore_east', [['帰投の夜の燃料の中央値 %', a.fuel, 15, 35]]);
  if (!hard && a) add('T', 'shore_east', [['帰投の夜の夜明け前 %', a.preDawn, 90, null]]);
  const d = R.idle;
  if (!hard && d) out.push(['D', 'idle', `夜明けの後・1,500 秒未満に終わった ${d.ends}/${d.n}（漂流 ${d.drift}・最も遅い ${f1(d.lastS)} 秒）`, [d.ends === d.n ? '✓' : '✗']]);
  const k = Object.values(R).reduce((s, r) => s + r.k5, 0);
  out.push(['K', 'すべて', `5 kt 未満の艦への 1 本で kpiTarget が真 ${k} 本`, [k === 0 ? '✓' : '✗']]);
  return out;
}
const fmtRow = (p, r) => `${p.padEnd(15)} ${String(r.n).padStart(2)} 夜 | 達成 ${r.win} | 沈没 ${r.own} | 帰投 ${r.home} | 卯月撃沈 ${r.uz} | 空知丸撃沈 ${r.tr} | 撃つ前に動いた ${r.moveFirst}・着く前 ${r.moveEta} | A5 ${r.a5}（${r.a5n}）| 燃料 ${f1(r.fuel)} | 夜明け前 ${r.preDawn} | 止まった艦へ ${r.held}（命中 ${r.heldHits}）| 5kt 未満 ${r.slow}・K ${r.k5} | 背に岸 ${f1(r.bdS)} 秒 | 駆潜艇撃沈 ${r.pk} | ${r.reasons}`;
const fmtNight = (c, r) => `${c.policy.padEnd(15)} seed ${String(c.seed).padStart(2)} | ${String(r.reason).padEnd(10)} 卯月 ${r.uz ?? '-'} 空知丸 ${r.tr ?? '-'} 駆潜艇 ${r.pk ?? '-'} 帰投 ${r.home ? 1 : 0} 夜明け前 ${r.preDawn ? 1 : 0} 燃料 ${r.fuelPct ?? '-'} | 気づき ${r.why ?? '-'} ${f1(r.alertS)} 動き ${f1(r.moveS)} 初弾 ${f1(r.firstS)} | 撃つ ${r.fired ?? '-'} 命中 ${r.hits ?? '-'} 止まった艦へ ${r.held ?? '-'}/${r.heldHits ?? '-'} 5kt ${r.slow ?? '-'}/${r.k5 ?? '-'} | 背に岸 ${f1(r.bdS)} | ${f1(r.t)} 秒${r.errors.length ? ` | page errors ${r.errors.length}（${r.errors[0]}）` : ''}`;
const printBands = (B) => { for (const [name, pol, text, v] of B) console.log(`  ${name} ${pol.padEnd(15)} ${text}  → ${v.join('')}`); };

async function main() {
  if (!process.env.SITE) throw new Error('SITE=<ビルドした site のディレクトリ> が要る');
  const hard = process.env.HARD === '1', pols = process.env.POLS ? process.env.POLS.split(',') : hard ? ANCHOR_HARD_POLICIES : ANCHOR_POLICIES, np = nominalPlan();
  const mk = (seeds) => pols.flatMap((policy) => seeds.map((seed) => ({ policy, seed, hard, np, maxS: envNum('MAXS', 1600), width: envNum('W', 1560) })));
  const code = await bundle(PAGE), sv = await serve(process.env.SITE), browser = await chromium.launch(), t0 = Date.now();
  const runAll = (cs) => pool(cs, envNum('JOBS', 3), async (c) => ({ c, r: await night(browser, sv.base, code, c) }));
  const res = await runAll(mk(parseSeeds(process.env.SEEDS ?? '1-40')));
  const table = (ext) => Object.fromEntries(pols.map((p) => [p, rowOf(res.filter((x) => x.c.policy === p && (ext.includes(p) || x.c.seed <= 40)).map((x) => x.r))]));
  let B = bands(table(pols), hard), R;
  // 端（±5 点の内）の行の台本だけ seed 41〜80 を足して 80 夜で決め直す（SEEDS を渡した時と EXT=0 は足さない）
  const ext = process.env.EXT === '0' || process.env.SEEDS ? [] : [...new Set(B.filter((b) => b[3].includes('端')).map((b) => b[1]).filter((p) => pols.includes(p)))];
  if (ext.length > 0) {
    console.log(`40 夜の帯（端の行の台本 ${ext.join('・')} に seed 41〜80 を足す）:`);
    printBands(B);
    res.push(...(await runAll(mk(parseSeeds('41-80')).filter((c) => ext.includes(c.policy)))));
    B = bands((R = table(ext)), hard);
  } else R = table(pols);
  await browser.close();
  await sv.close();
  const lines = res.map(({ c, r }) => fmtNight(c, r)).sort(), errs = res.reduce((s, x) => s + x.r.errors.length, 0);
  for (const l of lines) console.log(l);
  console.log(`${hard ? 'ハード' : 'ノーマル'}の台本ごと:`);
  for (const p of pols) console.log(fmtRow(p, R[p]));
  console.log('帯:');
  printBands(B);
  console.log(`nights ${res.length} page errors ${errs} md5 ${createHash('md5').update(lines.join('\n')).digest('hex')} ${((Date.now() - t0) / 1000).toFixed(0)} 秒${hard ? '（ハード）' : ''}`);
  process.exitCode = errs === 0 ? 0 : 1;
}

await main();
