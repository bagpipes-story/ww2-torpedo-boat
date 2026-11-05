// 2 つのビルドの再生の A/B（v0.6.10 S5a で作り直した。v0.6.9 の replay-v069.mjs の代わり。spec-v0610 part 2「ab-replay」）: 同じ任務・seed・台本を、ビルド A（基準。例 6856840）と
// B（今の木）のヘッドレスで偽の時計・固定ステップのまま回し、フレームごとの世界の写し（自艇・HP・燃料・駆逐艦・大発・米PT・自艇の魚雷・揚陸の輸送船と敵の魚雷・HUD の文の全部・
// 終わったら Result の文）の指紋を比べる。違えば same:false と最初に違ったフレームと欄を出す（ページは開いたまま写しを取り出す）。
// 台本（下の abRun）: 最寄りの敵へ向かい（遠ければ 0.6・近ければ 0.4、600 m の内は背を向けて 0.8）、敵がいなければゆっくり回る。武器は INPUT で:
//   primary＝主兵装だけ（魚雷は 2,500 m の内の敵がいる間 12 秒ごとに 1 本・機銃は 1,500 m の内の敵がいる間 8 秒のうち 3 秒）・both＝もう一方も同じ間隔で・none＝撃たない。
// 件の組（既定 SET=all）: base（16 件: 7 任務 us_01・us_02・us_03・jp_01・jp_02・jp_05・jp_06 とハード＝12、seed 2 の us_03・jp_01・jp_02・jp_05＝4。SECS 既定 90）・dawn20（同じ 16 件を
// &dawn=20）・nodawn（同じ 16 件を &nostrike・SECS=200）・ptrun（jp_05 の seed 1・2 を全速で）・result（base の初めの 8 件を終わるまで回して Result の文も）＝58 件。
// 1 件だけ: MISSION=us_02 [HARD=1] [SEED=1] [DAWN=20] [NODAWN=1] [SECS=200] [PTRUN=1] [RESULT=1]。jp_04 の卯月を切った夜（B の &noally）と A を比べるのは NOALLY=1（MISSION=jp_04 の組）。
// v0.6.11 S6: SET=jp03 で jp_03（空襲下の退避）のノーマル・ハード × seed 1・2 を 260 秒（決着の 240 秒の後まで）。A は jp_03 の世界のあるビルド（88c9f19 には無いので S5 の ae6af75）。
//   all（88c9f19 と比べる 58 件）には入れない（元の件は今のまま）。jp_03 の写しは座席の自艇・HP・燃料・魚雷と HUD の文（隊の 18 隻は world-vs-sim が比べる）。
// v0.6.11 S8: SET=jp04base で jp_04（卯月あり）のノーマル・ハード × seed 1〜4 を 170 秒（A は 88c9f19。all には入れない）。
// 実行: A=<site A> B=<site B> [INPUT=primary|both|none] [SET=all|base|dawn20|nodawn|ptrun|result|jp04|jp04base|jp03] [JOBS=3] node scripts/headless/ab-replay.mjs
import { fileURLToPath } from 'node:url';
import { FRAME_MS, chromium, envNum, openGame, pool, serve } from './lib.mjs';

/** ページの中: 1 夜を回してフレームごとの写しの指紋を返す（写しの文字列はページに残す＝最初の違いの取り出し用）。o.hudEvery があればその間隔のフレームだけ HUD の物を写す（hud-ab） */
export function abRun(o) {
  const hl = window.__hl;
  const w = hl.world();
  const frames = [];
  const hashes = [];
  window.__ab = frames;
  const d2 = (a, b) => (a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y);
  const r6 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : v);
  let lastTorp = -1;
  const snap = () => {
    const b = w.boat.state;
    const s = { t: r6(w.stepTimeS), b: [r6(b.x), r6(b.y), r6(b.headingDeg), r6(b.speedMps)], hp: r6(w.damage.hp), fire: r6(w.damage.fireLeftS), fuel: r6(w.fuel.gal), sink: w.boat.sinking, home: w.atHome };
    if (w.destroyers) s.d = w.destroyers.ships.map((x) => [r6(x.state.x), r6(x.state.y), r6(x.state.headingDeg), x.sinking, x.withdrawn, x.hitsTaken]);
    if (w.hunt) s.g = w.hunt.flotilla.barges.map((x) => [r6(x.x), r6(x.y), x.phase, r6(x.hp)]);
    if (w.pts) s.p = w.pts.section.boats.map((x) => [r6(x.x), r6(x.y), x.phase, r6(x.hp), x.fate]);
    if (w.convoy) s.c = [w.convoy.state.arrived, w.convoy.state.sunk, w.convoy.state.hitsTaken, w.convoy.state.barges.map((x) => [r6(x.x), r6(x.y)])];
    s.tp = w.torpedoes.states.map((x) => (x.active ? [r6(x.x), r6(x.y)] : 0));
    if (w.landing) s.l = [w.landing.state.phase, w.landing.state.hits, w.landing.pool.states.map((x) => (x.active ? [r6(x.x), r6(x.y)] : 0))];
    s.hud = hl.texts('Hud');
    return JSON.stringify(s);
  };
  const end = Math.round(o.secs * 60);
  for (let k = 0; k < end; k++) {
    if (!hl.active('Mission')) break;
    const t = w.stepTimeS;
    const b = w.boat.state;
    const f = w.enemy.focus(b.x, b.y);
    const dist = f ? Math.sqrt(d2(f, b)) : Infinity;
    if (t < 2) hl.steer(NaN, 0);
    else if (f && dist < 600) hl.steer(hl.bearing(f.x, f.y, b.x, b.y), o.ptrun ? 1 : 0.8);
    else if (f) hl.steer(hl.bearing(b.x, b.y, f.x, f.y), o.ptrun ? 1 : dist > 1800 ? 0.6 : 0.4);
    else hl.steer((90 + t * 2) % 360, 0.5);
    const main = w.setup.mainWeapon;
    const torp = o.input !== 'none' && (main === 'torpedo' || o.input === 'both');
    const gun = o.input !== 'none' && (main === 'guns' || o.input === 'both');
    const slot = Math.floor(t / 12);
    if (torp && t > 8 && slot !== lastTorp && dist < 2500) { w.input.fireTap = true; lastTorp = slot; }
    w.input.gunHeld = gun && t % 8 < 3 && dist < 1500;
    hl.frame(o.frameMs);
    if (o.hudEvery && (k + 1) % o.hudEvery !== 0) continue;
    const sn = o.hudEvery ? JSON.stringify({ t: r6(w.stepTimeS), hud: hl.objects('Hud') }) : snap();
    frames.push(sn);
    hashes.push(hl.fnv(sn));
  }
  let result = null;
  if (o.result) {
    for (let i = 0; i < 60 * 30 && hl.active('Mission'); i++) { hl.steer(NaN, 0); hl.frame(o.frameMs); }
    for (let i = 0; i < 30; i++) hl.frame(o.frameMs);
    result = hl.active('Result') ? hl.texts('Result') : ['(Result なし)'];
    hashes.push(hl.fnv(JSON.stringify(result)));
    frames.push(JSON.stringify(result));
  }
  return { hashes, result };
}

/** 2 つの写し（JSON の文字列）の最初に違う欄 */
export function firstField(a, b) {
  const A = JSON.parse(a);
  const B = JSON.parse(b);
  const walk = (x, y, p) => {
    if (typeof x !== 'object' || x === null || typeof y !== 'object' || y === null) return JSON.stringify(x) === JSON.stringify(y) ? null : { path: p, a: x, b: y };
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const k of keys) {
      const r = walk(x[k], y[k], `${p}.${k}`);
      if (r) return r;
    }
    return null;
  };
  return walk(A, B, '');
}

export function abCases(set, input) {
  const V = [['us_01', 0], ['us_01', 1], ['us_02', 0], ['us_02', 1], ['us_03', 0], ['us_03', 1], ['jp_01', 0], ['jp_01', 1], ['jp_02', 0], ['jp_05', 0], ['jp_06', 0], ['jp_06', 1]].map(([m, h]) => ({ mission: m, hard: h === 1, seed: 1 }));
  for (const m of ['us_03', 'jp_01', 'jp_02', 'jp_05']) V.push({ mission: m, hard: false, seed: 2 });
  const base = { input, secs: envNum('SECS', 90), dawn: 0, nodawn: false, ptrun: false, result: false, noally: false };
  const sets = {
    base: () => V.map((v) => ({ ...base, ...v, set: 'base' })),
    dawn20: () => V.map((v) => ({ ...base, ...v, dawn: 20, set: 'dawn20' })),
    nodawn: () => V.map((v) => ({ ...base, ...v, nodawn: true, secs: envNum('SECS', 200), set: 'nodawn' })),
    ptrun: () => [1, 2].map((seed) => ({ ...base, mission: 'jp_05', hard: false, seed, ptrun: true, set: 'ptrun' })),
    result: () => V.slice(0, 8).map((v) => ({ ...base, ...v, secs: envNum('SECS', 200), result: true, set: 'result' })),
    // jp_04 の卯月を切った夜（B は &noally）と A（6856840）: ノーマル・ハード × seed 1〜4（G6w。S5b の門）
    jp04: () => [false, true].flatMap((hard) => [1, 2, 3, 4].map((seed) => ({ ...base, mission: 'jp_04', hard, seed, secs: envNum('SECS', 170), noally: true, set: 'jp04' }))),
    // jp_04 の卯月のいる夜を 88c9f19（v0.6.10）と比べる（v0.6.11 S8。ほかの 8 任務のビット同一の jp_04 の分。B に &noally は付けない）: ノーマル・ハード × seed 1〜4
    jp04base: () => [false, true].flatMap((hard) => [1, 2, 3, 4].map((seed) => ({ ...base, mission: 'jp_04', hard, seed, secs: envNum('SECS', 170), set: 'jp04base' }))),
    // jp_03 の空襲下の退避（v0.6.11 S6。Title に出た版）: 決着の 240 秒の後まで。A は S5（ae6af75）のビルド
    jp03: () => [false, true].flatMap((hard) => [1, 2].map((seed) => ({ ...base, mission: 'jp_03', hard, seed, secs: envNum('SECS', 260), set: 'jp03' }))),
  };
  if (process.env.MISSION) {
    return [{ ...base, mission: process.env.MISSION, hard: process.env.HARD === '1', seed: envNum('SEED', 1), dawn: envNum('DAWN', 0), nodawn: process.env.NODAWN === '1', ptrun: process.env.PTRUN === '1', result: process.env.RESULT === '1', noally: process.env.NOALLY === '1', secs: envNum('SECS', 90), set: 'one' }];
  }
  return set === 'all' ? [...sets.base(), ...sets.dawn20(), ...sets.nodawn(), ...sets.ptrun(), ...sets.result()] : sets[set]();
}

export function query(c, side) {
  return `mission=${c.mission}&seed=${c.seed}${c.hard ? '&hard' : ''}${c.dawn ? `&dawn=${c.dawn}` : ''}${c.nodawn ? '&nostrike' : ''}${c.noally && side === 'B' ? '&noally' : ''}`;
}

export async function oneCase(browser, A, B, c) {
  const pa = await openGame(browser, A, query(c, 'A'), { width: envNum('W', 1560) });
  const pb = await openGame(browser, B, query(c, 'B'), { width: envNum('W', 1560) });
  try {
    const o = { ...c, frameMs: FRAME_MS, hudEvery: c.hudEvery ?? 0 };
    const [ra, rb] = await Promise.all([pa.page.evaluate(abRun, o), pb.page.evaluate(abRun, o)]);
    const n = Math.min(ra.hashes.length, rb.hashes.length);
    let at = -1;
    for (let i = 0; i < n; i++) if (ra.hashes[i] !== rb.hashes[i]) { at = i; break; }
    if (at < 0 && ra.hashes.length !== rb.hashes.length) at = n;
    const errors = [...pa.errors.map((e) => `A: ${e}`), ...pb.errors.map((e) => `B: ${e}`)];
    if (at < 0) return { ...c, same: errors.length === 0, frames: n, errors };
    const [sa, sb] = await Promise.all([pa.page.evaluate((i) => window.__ab[i] ?? null, at), pb.page.evaluate((i) => window.__ab[i] ?? null, at)]);
    return { ...c, same: false, frames: n, at, field: sa && sb ? firstField(sa, sb) : { path: '(長さ)', a: ra.hashes.length, b: rb.hashes.length }, errors };
  } finally {
    await pa.ctx.close();
    await pb.ctx.close();
  }
}

async function main() {
  if (!process.env.A || !process.env.B) throw new Error('A=<基準の site> B=<今の site> が要る');
  const cases = abCases(process.env.SET ?? 'all', process.env.INPUT ?? 'primary');
  const sa = await serve(process.env.A);
  const sb = await serve(process.env.B);
  const browser = await chromium.launch();
  const res = await pool(cases, envNum('JOBS', 3), (c) => oneCase(browser, sa.base, sb.base, c));
  await browser.close();
  await sa.close();
  await sb.close();
  let bad = 0;
  for (const r of res) {
    const tag = `${r.set.padEnd(6)} ${r.mission}${r.hard ? '&hard' : ''} seed ${r.seed}${r.dawn ? ` dawn ${r.dawn}` : ''}${r.nodawn ? ' nostrike' : ''}${r.ptrun ? ' ptrun' : ''}${r.result ? ' result' : ''}${r.noally ? ' B&noally' : ''}`;
    if (!r.same) bad++;
    console.log(`${tag} same:${r.same} frames ${r.frames}${r.same ? '' : ` 最初の違い frame ${r.at} ${JSON.stringify(r.field)}`}${r.errors.length ? ` page errors ${r.errors.length}: ${r.errors[0]}` : ''}`);
  }
  console.log(`cases ${res.length} same ${res.length - bad} diff ${bad}`);
  process.exitCode = bad === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
