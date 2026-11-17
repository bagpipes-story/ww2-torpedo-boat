// us_06 の探りと帯（v0.8.1 S3。spec-v0810 §3.9 D-P1〜D-P3、lead の L50〜L57。門ではない・ゲームの束と g2 には入らない）: ヘッドレスで本当の世界（?debug&mission=us_06）を
// 台本（scripts/headless/anchor-probe-policy.mjs＝素の JS）で回す。ページの糊は人が知れる物だけで素の view を書く（L52: 地図＝出発点・帰投の輪・岸の線・Briefing が言う停泊地＝
// missions_seed の種の位置、レーダーの輝点、目で見える艦＝mission-telemetry と同じ視程の比べの内の位置と目で見た位置の差の速さ、HUD のテレメトリ）。
// 夜ごとの測り（L55）は印の間の 1 か所だけが何でも読む（tests/anchor-probe-scan はその間を除いて名前を走査する）。沈む絵の tween は壁の時計で進むので、
// ページの Date.now を偽の時計に替える（strait-probe と同じ）。帯（spec §3.9 の表）は ✓・✗・端（帯の端から ±5 点の内＝その行だけ seed 41〜80 を足して 80 夜で決める）。
// 実行: VITE_BASE=/ww2-torpedo-boat/ npx vite build --outDir <site> の後
//   SITE=<site> [SEEDS=1-40] [POLS=shore_east,…] [HARD=1] [MAXS=1600] [W=1560] [JOBS=3] [EXT=0] [NOPLANE=1] [HUD=1] node scripts/headless/anchor-probe.mjs
// HARD=1 はハード（既定の台本は shore_east・open_north）。EXT=0 は端の行に seed を足さない。終了コードはページのエラーが 1 つでもあれば 1（帯は門にしない）。
// v0.8.1 IP2（us_06 に夜の水上機）: NOPLANE=1 は ?debug&noplane（水上機なし＝S3〜IP1 の世界。夜の行の字も同じ＝md5 を比べられる）。HUD=1 は台本が水上機の HUD に従う
// （2 行目の「敵機 N m ・ …」の間は静音・爆撃進路と投下の行で転舵。anchor-probe-policy の obey）。HUD の 2 行目はページの文そのもの（v.line2）。表と帯は anchor-probe-table。
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAME_MS, chromium, envNum, openGame, pool, serve } from './lib.mjs';
import { ANCHOR_HARD_POLICIES, ANCHOR_POLICIES } from './anchor-probe-policy.mjs';
import { bands, fmtNight, fmtRow, printBands, rowOf } from './anchor-probe-table.mjs';
import { parseSeeds } from './world-vs-sim.mjs';

const require = createRequire(import.meta.url), HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..');
const MISSION = 'us_06', CHUNK = 600; // CHUNK: 1 回の evaluate で進めるフレーム

/** ページの中: 糊（人が知れる物で view を書く）・測り（印の間）・1 フレームずつ回す口 */
const PAGE = `
import { ANCHOR_HUMAN, createAnchorDriver, stepAnchorDriver } from '${HERE}/anchor-probe-policy.mjs';
const CAP = 16, f64 = () => new Float64Array(CAP);
const newView = () => ({ t: 0, leftS: 0, x: 0, y: 0, h: 0, hp: 0, fuel01: 0, torps: 0, atHome: false, seen: false, lit: false, rangeM: 0, ddSunk: 0, trSunk: false,
  bn: 0, sweepS: NaN, bx: f64(), by: f64(), bAt: f64(), en: 0, eid: new Int8Array(CAP), ekind: new Int8Array(CAP), ex: f64(), ey: f64(), evx: f64(), evy: f64(), line2: '' });
/** HUD の 2 行目（上中央）の文そのもの（IP2。人が読む物。Hud の物を 1 回見つけて持つ） */
let l2 = null;
const line2Of = () => { if (!l2) { const h = window.__game.scene.getScene('Hud'); l2 = h && h.boatHud ? h.boatHud.missionLine.missionText : null; } return l2 ? l2.text : ''; };
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
  v.seen = t.playerDetected; v.lit = t.illuminated; v.rangeM = t.detectRangeM; v.ddSunk = t.shipsSunk; v.trSunk = t.transportSunk; v.line2 = line2Of();
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
  // 夜の水上機（IP2。今夜の水上機が無ければ null）: 発見確定・照明弾の回数、未確定の接近の秒、P3＝照明弾が岸の陰を消した・照明弾の光の中で卯月が気づいた
  m.pl = w.seaplane ? { locks: 0, flares: 0, slowS: 0, shadowOff: 0, uzFlare: false, prevLocked: false, prevFlare: false, prevBd: false } : null;
}
/** 毎フレーム（固定ステップの前・view の後）。水上機の測り（IP2） */
function measureStep(st, w, t, dt) {
  const q = st.m.pl, sp = w.seaplane;
  if (!q || !sp) return;
  const s = sp.state, a = t.anchor, lit = w.flareLit;
  if (s.locked && !q.prevLocked) q.locks++;
  if (s.phase === 1 && !s.locked) q.slowS += dt;
  if (lit && !q.prevFlare) { q.flares++; if (q.prevBd) q.shadowOff++; }
  if (a && !q.uzSeen && Number.isFinite(a.noticedAtS[0])) { q.uzSeen = true; q.uzFlare = lit; }
  q.prevLocked = s.locked; q.prevFlare = lit; q.prevBd = a ? a.backdropOn : false;
}
function measureEnd(st, w, t, r) {
  const g = w.destroyers, a = t.anchor, m = st.m, moveS = a ? a.underwayAtS[0] : NaN;
  const pk = g.picketIndex < 0 ? 0 : g.ships.slice(g.picketIndex).filter((d) => d.sinking).length;
  return { reason: r ? r.reason : 'maxSteps', home: r ? r.returned : false, preDawn: r ? !r.dawn.reached : false, fuelPct: r ? r.fuelLeftPct : NaN, t: w.stepTimeS,
    uz: g.ships[0].sinking ? 1 : 0, tr: g.transportSunk ? 1 : 0, pk, why: a ? WHY[a.reason[0]] : '-', alertS: a ? a.noticedAtS[0] : NaN, moveS,
    fired: m.fired, hits: w.hits, held: a ? a.heldShots : 0, heldHits: a ? a.heldHits : 0, bdS: a ? a.backdropS : 0, slow: m.slow, k5: m.k5, firstS: m.firstS,
    moveFirst: Number.isFinite(m.firstS) && moveS < m.firstS, moveEta: Number.isFinite(m.firstS) && moveS < m.firstEtaS, fan1: m.sinkFan === 1 ? 1 : 0, pl: planeEnd(m.pl, w.seaplane) };
}
const planeEnd = (q, sp) => (q && sp ? { app: sp.state.sorties, lost: sp.state.lost, locks: q.locks, flares: q.flares, bombs: sp.state.ordnance.bombsDropped, bombHits: sp.state.ordnance.bombsHit, litS: sp.state.ordnance.flare.litS, shadowOff: q.shadowOff, uzFlare: q.uzFlare, slowS: q.slowS } : null);
// </anchor-probe:measure>
window.__ap = { run(o) {
  const hl = window.__hl, game = window.__game;
  let st = window.__apState;
  if (!st) {
    const w = hl.world(), plan = planOf(w, o.np), eye = { t0: f64().fill(NaN), x0: f64(), y0: f64(), vx: f64(), vy: f64() };
    st = window.__apState = { plan, d: createAnchorDriver(o.policy, o.seed, plan, o.obey), v: newView(), out: { headingDeg: NaN, speed01: 0, fireN: 0, fireSpreadDeg: 0 }, eye, fan: 0, frames: 0, m: null };
    measureInit(st, w);
  }
  for (let k = 0; k < o.frames; k++) {
    const w = hl.world(), t = game.registry.get('boatTelemetry');
    if (!hl.active('Mission')) return { done: true, m: measureEnd(st, w, t, game.scene.getScene('Result').result) };
    if (st.frames >= o.maxFrames) return { done: true, m: measureEnd(st, w, t, null) };
    fillView(st, w, t);
    measureStep(st, w, t, o.frameMs / 1000);
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
  const q = `mission=${MISSION}&seed=${c.seed}${c.hard ? '&hard' : ''}${c.policy === 'shore_east_nb' ? '&nobackdrop' : ''}${c.noplane ? '&noplane' : ''}`;
  const { page, ctx, errors } = await openGame(browser, base, q, { width: c.width, init: tweenClock });
  try {
    await page.addScriptTag({ content: code });
    let r;
    do r = await page.evaluate((o) => window.__ap.run(o), { policy: c.policy, seed: c.seed, np: c.np, obey: c.obey, frames: CHUNK, frameMs: FRAME_MS, maxFrames: Math.round(c.maxS * 60) });
    while (!r.done);
    return { ...r.m, own: SUNK.has(r.m.reason), errors };
  } catch (e) {
    return { reason: 'error', own: false, errors: [...errors, String(e && e.message ? e.message : e)] };
  } finally {
    await ctx.close();
  }
}

async function main() {
  if (!process.env.SITE) throw new Error('SITE=<ビルドした site のディレクトリ> が要る');
  const hard = process.env.HARD === '1', pols = process.env.POLS ? process.env.POLS.split(',') : hard ? ANCHOR_HARD_POLICIES : ANCHOR_POLICIES, np = nominalPlan();
  const noplane = process.env.NOPLANE === '1', obey = process.env.HUD === '1';
  const mk = (seeds) => pols.flatMap((policy) => seeds.map((seed) => ({ policy, seed, hard, np, noplane, obey, maxS: envNum('MAXS', 1600), width: envNum('W', 1560) })));
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
  console.log(`nights ${res.length} page errors ${errs} md5 ${createHash('md5').update(lines.join('\n')).digest('hex')} ${((Date.now() - t0) / 1000).toFixed(0)} 秒${hard ? '（ハード）' : ''}${noplane ? '（水上機なし）' : ''}${obey ? '（HUD に従う）' : ''}`);
  process.exitCode = errs === 0 ? 0 : 1;
}

await main();
