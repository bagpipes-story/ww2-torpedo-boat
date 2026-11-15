// us_04 の向きの確かめ（v0.8.0 S3。spec-v0800 §4.11 の「世界との一致」・§8 R9、lead の L24。門ではない）: ヘッドレスで本当の世界（?debug&mission=us_04・今夜の水上機と誤射と
// 夜明けの空襲も込み＝模擬に無い危険）を、模擬と同じ台本（core/intercept-sim-policy をそのままページに束ねる。目は core/intercept-sim の fillInterceptEye＝世界と同じ視程の規則、
// 地図の値は systems/intercept-sim-setup の interceptPlan）で回し、同じ seed・同じ台本の模擬（node）と並べる。報告: 夜ごとの終わりの理由・撃沈・撃った本数・秒（世界／模擬）、
// 台本ごとの 1 隻以上撃沈・自艇の沈没・衝突（体当たり）の夜の数と、世界と模擬が食い違った夜（撃った本数は世界は減った本数・模擬は狙う艦のある魚雷）。ページのエラーが 1 つでもあれば終了コード 1（数の食い違いは門にしない）。
// 沈む絵の tween（自艇・艦）は Phaser の TweenManager が壁の時計（Date.now）で進めるので、ページの Date.now を偽の時計（__hl.t）に替える＝60 fps の実時間で遊んだのと同じ
// （替えないと沈み始めた艦の「沈没の演出中」が壁の 2 秒＝偽の時計の数百秒続き、終わりと水上機・誤射が止まる。ゲームの論理は Date.now を seed の既定にしか使わない＝&seed で渡す）。
// 実行: VITE_BASE=/ww2-torpedo-boat/ npx vite build --outDir <site> の後
//   SITE=<site> [SEEDS=1-8] [POLS=radar_ambush,idle_lane,radar_dodge] [HARD=1] [NOPLANE=1] [IDENT=1] [MAXS=330] [W=1560] [JOBS=3] node scripts/headless/strait-probe.mjs
// IDENT=1: 味方機の識別の要求（HUD の合図）から 1 秒で［識別］を押す（台本は既定では押さない＝誤射は模擬に無い危険のまま）。NOPLANE=1 は ?debug&noplane（水上機なし）。
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FRAME_MS, chromium, envNum, openGame, pool, serve } from './lib.mjs';
import { parseSeeds } from './world-vs-sim.mjs';

const require = createRequire(import.meta.url);
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src');
/** 1 回の evaluate で進めるフレーム */
const CHUNK = 600;

/** ページの中の台本（模擬と同じ関数）。台本の入力をスティックと魚雷の一斉の要求に写し、1 フレームずつ進める。任務が終われば Result の理由 */
const PAGE = `
import { gameData } from '${SRC}/config/game-data';
import { fillInterceptEye } from '${SRC}/core/intercept-sim';
import { createInterceptDriver, stepInterceptDriver } from '${SRC}/core/intercept-sim-policy';
import { interceptPlan } from '${SRC}/systems/intercept-sim-setup';
window.__sp = { run(o) {
  const hl = window.__hl;
  let st = window.__spState;
  if (!st) {
    const w = hl.world();
    st = window.__spState = { d: createInterceptDriver(o.policy, o.seed, interceptPlan(gameData, w.setup)), v: { t: 0, boat: w.boat.state, torpedoes: 0, atHome: false, radar: null, eyeX: NaN, eyeY: NaN, markerDeg: NaN },
      out: { headingDeg: NaN, speed01: 0, fireN: 0, fireSpreadDeg: 0 }, vel: { x: 0, y: 0 }, frames: 0, sunk: 0, fired: 0, r0: w.torpedoes.remaining };
  }
  for (let k = 0; k < o.frames; k++) {
    if (!hl.active('Mission')) { const r = window.__game.scene.getScene('Result').result; return { done: true, reason: r ? r.reason : 'none', sunk: st.sunk, fired: st.fired, t: st.frames / 60 }; }
    const w = hl.world();
    const v = st.v;
    v.t = w.stepTimeS; v.torpedoes = w.torpedoes.remaining; v.atHome = w.atHome; v.radar = w.radar ? w.radar.state : null;
    fillInterceptEye(v, w.boat.state, w.destroyers.ships, w.visRange2, w.setup.torpedoParams.speedMps, st.vel);
    stepInterceptDriver(st.d, v, st.out);
    hl.steer(st.out.headingDeg, st.out.speed01);
    const ff = w.friendly ? w.friendly.state : null;
    if (o.ident && ff && ff.phase === 1 && ff.periodS - ff.timerS >= 1) w.input.identifyTap = true; // core/friendly の FF_CHALLENGE
    if (st.out.fireN > 0) { w.input.fireSalvoSpreadDeg = st.out.fireSpreadDeg; w.input.fireSalvoCount = st.out.fireN; }
    hl.frame(o.frameMs);
    st.frames++;
    st.sunk = w.destroyers.sunkCount;
    st.fired = st.r0 - w.torpedoes.remaining;
  }
  return st.frames >= o.maxFrames ? { done: true, reason: 'maxSteps', sunk: st.sunk, fired: st.fired, t: st.frames / 60 } : { done: false };
} };
`;
/** 模擬の 1 夜（node）。同じ seed・同じ台本 */
const SIM = `
import { gameData } from '${SRC}/config/game-data';
import { runInterceptTrial } from '${SRC}/core/intercept-sim';
import { interceptNightSetup } from '${SRC}/systems/intercept-sim-setup';
export function simNight(policy, seed, hard) {
  const t = runInterceptTrial(interceptNightSetup(gameData, seed, hard), policy, seed);
  return { reason: t.reason, sunk: t.sunkCover + t.sunkColumn, fired: t.fired, t: t.endS, own: t.ownSunk !== null, ram: t.rammedBy !== 0 };
}
`;

async function bundle(contents, format, platform) {
  const r = await require('esbuild').build({ stdin: { contents, resolveDir: SRC, loader: 'js' }, bundle: true, format, platform, write: false, logLevel: 'silent' });
  return r.outputFiles[0].text;
}

/** ページの Date.now を偽の時計に（init script。lib の pageInit の後） */
function tweenClock() {
  const t0 = Date.now();
  Date.now = () => t0 + (window.__hl ? window.__hl.t : 0);
}

async function worldNight(browser, base, code, c) {
  const q = `mission=us_04&seed=${c.seed}${c.hard ? '&hard' : ''}${c.noplane ? '&noplane' : ''}`;
  const { page, ctx, errors } = await openGame(browser, base, q, { width: c.width, init: tweenClock });
  try {
    await page.addScriptTag({ content: code });
    let r;
    do r = await page.evaluate((o) => window.__sp.run(o), { policy: c.policy, seed: c.seed, frames: CHUNK, frameMs: FRAME_MS, maxFrames: Math.round(c.maxS * 60), ident: c.ident });
    while (!r.done);
    return { ...r, own: SUNK.has(r.reason), ram: r.reason === 'rammed', errors };
  } catch (e) {
    return { done: true, reason: 'error', sunk: 0, fired: 0, t: 0, own: false, ram: false, errors: [...errors, String(e && e.message ? e.message : e)] };
  } finally {
    await ctx.close();
  }
}

/** 世界の終わりの理由のうち自艇の沈没（水上機・夜明けの空襲・誤射も＝模擬に無い危険） */
const SUNK = new Set(['rammed', 'destroyed', 'friendly_fire', 'bombed', 'air_strike', 'storm']);
const tally = (rs) => ({ sink: rs.filter((r) => r.sunk >= 1).length, own: rs.filter((r) => r.own).length, ram: rs.filter((r) => r.ram).length, home: rs.filter((r) => r.reason === 'returned' || r.reason === 'cleared').length });
/** 食い違い: 1 隻以上撃沈・自艇の沈没・衝突のどれかが世界と模擬で違う夜 */
const differs = (w, s) => (w.sunk >= 1) !== (s.sunk >= 1) || w.own !== s.own || w.ram !== s.ram;

async function main() {
  const site = process.env.SITE;
  if (!site) throw new Error('SITE=<ビルドした site のディレクトリ> が要る');
  const seeds = parseSeeds(process.env.SEEDS ?? '1-8');
  const pols = (process.env.POLS ?? 'radar_ambush,idle_lane,radar_dodge').split(',');
  const hard = process.env.HARD === '1';
  const cases = [];
  for (const policy of pols) for (const seed of seeds) cases.push({ policy, seed, hard, noplane: process.env.NOPLANE === '1', ident: process.env.IDENT === '1', maxS: envNum('MAXS', 330), width: envNum('W', 1560) });
  const dir = mkdtempSync(join(tmpdir(), 'strait-probe-'));
  writeFileSync(join(dir, 'sim.mjs'), await bundle(SIM, 'esm', 'node'));
  const { simNight } = await import(pathToFileURL(join(dir, 'sim.mjs')).href);
  const code = await bundle(PAGE, 'iife', 'browser');
  const sv = await serve(site);
  const browser = await chromium.launch();
  const res = await pool(cases, envNum('JOBS', 3), async (c) => ({ c, w: await worldNight(browser, sv.base, code, c), s: simNight(c.policy, c.seed, c.hard) }));
  await browser.close();
  await sv.close();
  let errs = 0;
  const f = (r) => `${r.reason.padEnd(9)} 撃沈 ${r.sunk} 撃つ ${r.fired} ${r.t.toFixed(0).padStart(3)} 秒`;
  for (const { c, w, s } of res) {
    errs += w.errors.length;
    console.log(`${c.policy.padEnd(13)} seed ${String(c.seed).padStart(2)} | 世界 ${f(w)} | 模擬 ${f(s)}${differs(w, s) ? ' | 食い違い' : ''}${w.errors.length ? ` | page errors ${w.errors.length}（${w.errors[0]}）` : ''}`);
  }
  for (const policy of pols) {
    const mine = res.filter((r) => r.c.policy === policy);
    const tw = tally(mine.map((r) => r.w));
    const ts = tally(mine.map((r) => r.s));
    const differ = mine.filter(({ w, s }) => differs(w, s)).length;
    console.log(`${policy.padEnd(13)} ${mine.length} 夜: 1 隻以上撃沈 世界 ${tw.sink}・模擬 ${ts.sink} | 自艇の沈没 世界 ${tw.own}・模擬 ${ts.own} | 衝突 世界 ${tw.ram}・模擬 ${ts.ram} | 帰投 世界 ${tw.home}・模擬 ${ts.home} | 食い違った夜 ${differ}`);
  }
  console.log(`nights ${res.length} page errors ${errs}${hard ? '（ハード）' : ''}${process.env.NOPLANE === '1' ? '（&noplane）' : ''}${process.env.IDENT === '1' ? '（識別を押す）' : ''}`);
  process.exitCode = errs === 0 ? 0 : 1;
}

await main();
