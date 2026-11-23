// us_05 の探りと帯（v0.8.2 S3。spec-v0820 §6 D-P1〜D-P3、lead の L29〜L35。門ではない・ゲームの束と g2 には入らない）: ヘッドレスで本当の世界（?debug&mission=us_05）を
// 台本（scripts/headless/column-probe-policy.mjs＝素の JS）で回す。ページの糊は人が知れる物だけで素の view を書く（D-P2: 地図＝出発点・帰投の輪・中継の輪、レーダーの輝点、
// 目で見える艦＝mission-telemetry と同じ視程の比べの内の位置・艦の絵（テクスチャの鍵）の種類・目で見た位置の差の速さ、HUD のテレメトリ＝発見・照射・魚雷・輪・夜明け・報告の段）。
// 夜ごとの測り（D-P1）は印の間の 1 か所だけが何でも読む（tests/column-probe-scan はその間を除いて名前を走査する）。沈む絵の tween は Phaser の TweenManager が壁の時計（Date.now）で
// 進めるので、ページの Date.now を偽の時計に替える（strait-probe・anchor-probe と同じ）。帯（spec §6 の表）は ✓・✗・端（帯の端から ±5 点の内＝その行の台本だけ seed 41〜80 を足して 80 夜で決める）。
// 実行: VITE_BASE=/ww2-torpedo-boat/ npx vite build --outDir <site> の後
//   SITE=<site> [SEEDS=1-40] [POLS=shadow_report,…] [HARD=1] [MAXS=1600] [W=1560] [JOBS=2] [EXT=0] [Q=&noradio] node scripts/headless/column-probe.mjs
// HARD=1 はハード（既定の台本は ★ の shadow_report・report_attack）。EXT=0 は端の行に seed を足さない。Q は問い合わせに足す ?debug の旗（&noradar・&noradio の比べ）。
// 終了コードはページのエラーが 1 つでもあれば 1（帯は門にしない）。表と帯は column-probe-table。
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAME_MS, chromium, envNum, openGame, pool, serve } from './lib.mjs';
import { COLUMN_HARD_POLICIES, COLUMN_POLICIES } from './column-probe-policy.mjs';
import { bands, fmtNight, fmtRow, printBands, rowOf } from './column-probe-table.mjs';
import { parseSeeds } from './world-vs-sim.mjs';

const require = createRequire(import.meta.url), HERE = dirname(fileURLToPath(import.meta.url)), ROOT = join(HERE, '..', '..');
const MISSION = 'us_05', CHUNK = 600; // CHUNK: 1 回の evaluate で進めるフレーム

/** ページの中: 糊（人が知れる物で view を書く）・測り（印の間）・1 フレームずつ回す口 */
const PAGE = `
import { COLUMN_HUMAN, createColumnDriver, stepColumnDriver } from '${HERE}/column-probe-policy.mjs';
const CAP = 16, f64 = () => new Float64Array(CAP);
const newView = () => ({ t: 0, leftS: 0, x: 0, y: 0, h: 0, torps: 0, atHome: false, seen: false, lit: false, rep: 0,
  bn: 0, sweepS: NaN, bx: f64(), by: f64(), en: 0, ekind: new Int8Array(CAP), ex: f64(), ey: f64(), evx: f64(), evy: f64() });
/** 艦の絵の種類（テクスチャの鍵＝画面の絵。戦艦・重巡の絵のほかは駆逐艦の絵） */
const KIND_OF_ART = { 'tex-battleship-fuso': 2, 'tex-cruiser-mogami': 1 };
const artKindOf = (d) => KIND_OF_ART[d.sprite.texture.key] ?? 0;
/** 地図と艇の知れる値（Briefing・画面。中継の輪は地図の黄色い輪）。魚雷の速さと扇の間隔は node が data から渡す（np） */
function planOf(w, t, np) {
  const s = w.setup, m = s.mission, b = s.boatParams, r = t.recon;
  return { width: m.bounds.width, height: m.bounds.height, startX: m.playerStart.x, startY: m.playerStart.y, ringX: m.returnPoint.x, ringY: m.returnPoint.y, ringR: m.returnPoint.radiusM,
    relayX: w.boat.state.x + r.relayDx, relayY: w.boat.state.y + r.relayDy, relayR: r.relayRadiusM, dawnS: s.durationS, visM: Math.sqrt(w.visRange2),
    silent01: (b.silentMaxMps / b.speedMaxMps) * COLUMN_HUMAN.silentFrac, cruise01: b.speedCruiseMps / b.speedMaxMps, ...np };
}
/** 毎フレームの view: 自艇・HUD・報告の段・レーダーの輝点・目（視程の内の艦の位置と絵の種類と、見えている間 0.5 秒ごとの位置の差の速さ） */
function fillView(st, w, t) {
  const v = st.v, b = w.boat.state, g = w.destroyers, r = w.radar ? w.radar.state : null, e = st.eye;
  v.t = w.stepTimeS; v.leftS = t.timeLeftS; v.x = b.x; v.y = b.y; v.h = b.headingDeg; v.torps = t.torpedoesLeft; v.atHome = t.atHome;
  v.seen = t.playerDetected; v.lit = t.illuminated; v.rep = t.recon ? t.recon.stage : 0;
  v.bn = r ? r.n : 0; v.sweepS = r ? r.lastSweepS : NaN;
  for (let k = 0; k < v.bn; k++) { v.bx[k] = r.blips[k].x; v.by[k] = r.blips[k].y; }
  v.en = 0;
  for (let i = 0; g && i < g.ships.length && v.en < CAP; i++) {
    const p = g.ships[i].state, dx = p.x - b.x, dy = p.y - b.y;
    if (g.ships[i].out || dx * dx + dy * dy > w.visRange2) { e.t0[i] = NaN; continue; }
    if (Number.isNaN(e.t0[i])) { e.t0[i] = v.t; e.x0[i] = p.x; e.y0[i] = p.y; e.vx[i] = 0; e.vy[i] = 0; }
    else if (v.t - e.t0[i] >= 0.5) { e.vx[i] = (p.x - e.x0[i]) / (v.t - e.t0[i]); e.vy[i] = (p.y - e.y0[i]) / (v.t - e.t0[i]); e.t0[i] = v.t; e.x0[i] = p.x; e.y0[i] = p.y; }
    const n = v.en++; v.ekind[n] = artKindOf(g.ships[i]); v.ex[n] = p.x; v.ey[n] = p.y; v.evx[n] = e.vx[i]; v.evy[n] = e.vy[i];
  }
}
// <column-probe:measure> 測り（D-P1。ここだけは世界の何でも読む。台本には渡さない。tests/column-probe-scan はこの印の間を走査しない）
const CLS = { destroyer: 0, heavy_cruiser: 1, battleship: 2 };
function measureInit(st, w) {
  const g = w.destroyers, cls = g.kits.classes.map((c) => CLS[c] ?? 0), m = st.m = { cls, fired: 0, capKpi: 0, dd: 0, ddKpi: 0, ddBad: 0, hit: [0, 0, 0], h34: 0, firstS: NaN };
  const L = w.launcher, up = L.update, ev = w.torpedoEvents, onHit = ev.onHit;
  // 発射の時の KPI の旗（systems/torpedo-free の stepLauncher → launcher.update。狙った艦＝最寄りの浮いている艦）: 戦艦・重巡は偽が規則・駆逐艦は今の規則（夜明けの前・目標 ≥ 5 kt）
  L.update = function (dt, boat, target, kpi) {
    const s = up.call(this, dt, boat, target, kpi);
    if (!s || !target) return s;
    const ti = g.nearestAfloatIndex(boat.x, boat.y), c = cls[ti < 0 ? 0 : ti];
    m.fired++; if (Number.isNaN(m.firstS)) m.firstS = w.stepTimeS;
    if (c !== 0) { if (s.kpiTarget) m.capKpi++; }
    else { m.dd++; if (s.kpiTarget) m.ddKpi++; if (s.kpiTarget !== (!w.dawn.reached && target.speedMps >= w.kpiMinTargetSpeedMps)) m.ddBad++; }
    return s;
  };
  // 艦種ごとの命中（不発を除く）と戦艦の 3・4 本目の命中（弾薬庫を引く本数）
  // 自艇が受けた砲弾の damage を撃った艦の艦種ごとに（沈み始める前だけ）
  m.dmg = [0, 0, 0];
  g.fires.forEach((f, i) => { const h = f.onHit; f.onHit = (gi, x, y) => { if (!w.boat.sinking) m.dmg[cls[i] ?? 0] += g.gunneryAt(i).guns[gi].damage; h(gi, x, y); }; });
  ev.onHit = (i, x, y, s) => { onHit(i, x, y, s); if (s.dud) return; const c = cls[i] ?? 0; m.hit[c]++; const h = g.ships[i].hitsTaken; if (c === 2 && (h === 3 || h === 4)) m.h34++; };
}
function measureEnd(st, w, t, r) {
  const g = w.destroyers, m = st.m, q = w.recon.state, mg = g.magazine, ro = g.roles, sc = [];
  if (ro) for (let i = 0; i < ro.leftAtS.length; i++) if (!Number.isNaN(ro.leftAtS[i]) || !Number.isNaN(ro.rejoinedAtS[i])) sc.push([i, ro.leftAtS[i], ro.rejoinedAtS[i]]);
  return { reason: r ? r.reason : 'maxSteps', home: r ? r.returned : false, win: r ? r.objectiveDone : false, preDawn: r ? !r.dawn.reached : false, fuelPct: r ? r.fuelLeftPct : NaN, t: w.stepTimeS,
    rep: q.stage, seenS: q.seenAtS, sentS: q.sentAtS, relayS: q.relayedAtS, radio: q.radioBroken, radioS: q.radioBrokenAtS, radioDraws: q.draws, detections: w.detect.count,
    fired: m.fired, firstS: m.firstS, hitBB: m.hit[2], hitCA: m.hit[1], hitDD: m.hit[0], h34: m.h34, capKpi: m.capKpi, dd: m.dd, ddKpi: m.ddKpi, ddBad: m.ddBad,
    dmgDD: m.dmg[0], dmgCA: m.dmg[1], dmgBB: m.dmg[2], mgDraws: mg ? mg.draws : 0, mgSum: mg ? mg.chanceSum : 0, booms: mg ? mg.detonations : 0, sunk: g.sunkCount, sc };
}
// </column-probe:measure>
window.__cp = { run(o) {
  const hl = window.__hl, game = window.__game;
  let st = window.__cpState;
  if (!st) {
    const w = hl.world(), t = game.registry.get('boatTelemetry'), plan = planOf(w, t, o.np), eye = { t0: f64().fill(NaN), x0: f64(), y0: f64(), vx: f64(), vy: f64() };
    st = window.__cpState = { plan, d: createColumnDriver(o.policy, o.seed, plan), v: newView(), out: { headingDeg: NaN, speed01: 0, fireN: 0, fireSpreadDeg: 0, smoke: false }, eye, frames: 0, m: null };
    measureInit(st, w);
  }
  for (let k = 0; k < o.frames; k++) {
    const w = hl.world(), t = game.registry.get('boatTelemetry');
    if (!hl.active('Mission')) return { done: true, m: measureEnd(st, w, t, game.scene.getScene('Result').result) };
    if (st.frames >= o.maxFrames) return { done: true, m: measureEnd(st, w, t, null) };
    fillView(st, w, t);
    stepColumnDriver(st.d, st.v, st.out);
    hl.steer(st.out.headingDeg, st.out.speed01);
    if (st.out.smoke) w.input.smokeTap = true;
    if (st.out.fireN > 0) { w.input.fireSalvoSpreadDeg = st.out.fireSpreadDeg; w.input.fireSalvoCount = st.out.fireN; }
    hl.frame(o.frameMs); st.frames++;
  }
  return { done: false };
} };
`;

/** 魚雷の画面の速さ・扇の間隔（data から。人は画面で知れる） */
function nominalPlan() {
  const rd = (f) => JSON.parse(readFileSync(join(ROOT, 'data', f), 'utf8'));
  const seed = rd('missions_seed.json').missions.find((x) => x.id === MISSION), hr = rd('hit_rate_model.json');
  const tp = rd('torpedoes.json').torpedoes.find((x) => x.id === seed.torpedo_type), kt = tp.settings[tp.default_setting].speed_kt;
  return { torpScreenMps: (kt * 1852 / 3600) * hr.world.time_scale, spacingDeg: hr.torpedo_launch.salvo_spacing_deg };
}
const bundle = async (contents) => (await require('esbuild').build({ stdin: { contents, resolveDir: HERE, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', write: false, logLevel: 'silent' })).outputFiles[0].text;
/** ページの Date.now を偽の時計に（init script。lib の pageInit の後） */
function tweenClock() { const t0 = Date.now(); Date.now = () => t0 + (window.__hl ? window.__hl.t : 0); }

const SUNK = new Set(['rammed', 'destroyed', 'friendly_fire', 'storm', 'bombed', 'air_strike']);
async function night(browser, base, code, c) {
  const q = `mission=${MISSION}&seed=${c.seed}${c.hard ? '&hard' : ''}${c.q}`;
  const { page, ctx, errors } = await openGame(browser, base, q, { width: c.width, init: tweenClock });
  try {
    await page.addScriptTag({ content: code });
    let r;
    do r = await page.evaluate((o) => window.__cp.run(o), { policy: c.policy, seed: c.seed, np: c.np, frames: CHUNK, frameMs: FRAME_MS, maxFrames: Math.round(c.maxS * 60) });
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
  const hard = process.env.HARD === '1', pols = process.env.POLS ? process.env.POLS.split(',') : hard ? COLUMN_HARD_POLICIES : COLUMN_POLICIES, np = nominalPlan(), q = process.env.Q ?? '';
  const mk = (seeds) => pols.flatMap((policy) => seeds.map((seed) => ({ policy, seed, hard, np, q, maxS: envNum('MAXS', 1600), width: envNum('W', 1560) })));
  const code = await bundle(PAGE), sv = await serve(process.env.SITE), browser = await chromium.launch(), t0 = Date.now();
  const runAll = (cs) => pool(cs, envNum('JOBS', 2), async (c) => ({ c, r: await night(browser, sv.base, code, c) }));
  const res = await runAll(mk(parseSeeds(process.env.SEEDS ?? '1-40')));
  const table = (ext) => Object.fromEntries(pols.map((p) => [p, rowOf(res.filter((x) => x.c.policy === p && (ext.includes(p) || x.c.seed <= 40)).map((x) => x.r))]));
  let B = bands(table(pols), hard), R;
  // 端（±5 点の内）の行の台本だけ seed 41〜80 を足して 80 夜で決め直す（端なしの判定＝spec §14。SEEDS を渡した時と EXT=0 は足さない）
  const ext = process.env.EXT === '0' || process.env.SEEDS ? [] : [...new Set(B.filter((b) => b[3].includes('端')).flatMap((b) => b[1].split('+')).filter((p) => pols.includes(p)))];
  if (ext.length > 0) {
    console.log(`40 夜の帯（端の行の台本 ${ext.join('・')} に seed 41〜80 を足す）:`);
    printBands(B);
    res.push(...(await runAll(mk(parseSeeds('41-80')).filter((c) => ext.includes(c.policy)))));
    B = bands((R = table(ext)), hard, true);
  } else R = table(pols);
  await browser.close();
  await sv.close();
  const lines = res.map(({ c, r }) => fmtNight(c, r)).sort(), errs = res.reduce((s, x) => s + x.r.errors.length, 0);
  for (const l of lines) console.log(l);
  console.log(`${hard ? 'ハード' : 'ノーマル'}の台本ごと:`);
  for (const p of pols) console.log(fmtRow(p, R[p]));
  console.log('帯:');
  printBands(B);
  console.log(`nights ${res.length} page errors ${errs} md5 ${createHash('md5').update(lines.join('\n')).digest('hex')} ${((Date.now() - t0) / 1000).toFixed(0)} 秒${hard ? '（ハード）' : ''}${q ? `（${q}）` : ''}`);
  process.exitCode = errs === 0 ? 0 : 1;
}

await main();
