// us_04（ブラケット海峡の夜）の性能（v0.8.0 S5。spec-v0800 §5.2・lead の L53。S2 の道具 scratchpad v0800/tools/s2/perf.mjs の写し）: 列の通過とレーダーのある夜の
// 1 フレームの進める時間（game.headlessStep＝updateFrame）を、同じビルドの us_02（今の駆逐艦の任務）と比べる。門: updateFrame の p95 で us_04 ≤ us_02 × 1.2・
// us_04 のハード ≤ us_02 のハード × 1.2、どの件も画面の物（Mission の children.list.length）の 30 秒ごとの最小が増えない（漏れなし＝窓ごとに前の窓の最小以下）。
// 件（1 夜ずつ新しいブラウザ）: us_04・us_04h（t 140〜200＝復路の列が通る）・us_02・us_02h（t 70〜130＝夜明けの 20 秒前まで）・us_04nr（us_04 の &noradar。参考）。
// 測り方: t0 までは壁時計に合わせず速く進め（warm）、窓（WIN 秒・既定 60）はフレームを壁時計の 1/60 秒に合わせ、毎フレームの updateFrame の秒と、2 フレームに 1 回の
// （進める＋描く＋WebGL の 1 画素の読み）の秒（参考）を記録する。台本（測るためだけ）: 自艇は出発点で止まり、1,300 m の内の浮いている艦から全速で離れる。HP と火災は
// 毎フレーム満タンに戻す（砲で沈んで窓が終わらないように。体当たりでは沈みうる）。COOP・COEP の見出しで配り crossOriginIsolated の 5 μs の時計。ROUNDS 組の良い方（updateFrame の p95）。
// 数はヘッドレスの相対値（iPhone の FPS は実機テスト ③）。art-perf の A/B（基準 main 2afe092 に us_04 の世界は無い）には入れない＝同じビルドの中の比べ。
// 実行: SITE=<site> [ROUNDS=2] [WIN=60] [W=1560] [ONLY=us_04,us_02] [OUT=<json>] node scripts/headless/strait-perf.mjs
import { writeFileSync } from 'node:fs';
import { FRAME_MS, chromium, envNum, openGame, serve } from './lib.mjs';

/** 門（spec §5.2）: updateFrame の p95 の比の上限（us_04 / us_02・ハードどうし） */
const P95_RATIO_MAX = 1.2;
const CASES = [
  { id: 'us_04', q: 'mission=us_04&seed=1', t0: 140 },
  { id: 'us_04h', q: 'mission=us_04&seed=1&hard', t0: 140 },
  { id: 'us_02', q: 'mission=us_02&seed=1', t0: 70 },
  { id: 'us_02h', q: 'mission=us_02&seed=1&hard', t0: 70 },
  { id: 'us_04nr', q: 'mission=us_04&seed=1&noradar', t0: 140 },
];
const PAIRS = [['us_04', 'us_02'], ['us_04h', 'us_02h']];

const q = (xs, p) => { if (xs.length === 0) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');

/** ページの中: 1 夜（warm → 窓）。o = { frameMs, t0, win } */
function perfRun(o) {
  const hl = window.__hl;
  const w = hl.world();
  const m = hl.mission();
  const gl = window.__game.renderer.gl;
  const px = new Uint8Array(4);
  const mins = [];
  let cur = Infinity;
  let slot = 0;
  const note = () => {
    if (!hl.active('Mission')) return;
    const n = m.children.list.length;
    const k = Math.floor(w.stepTimeS / 30);
    if (k !== slot) { mins.push(cur); cur = Infinity; slot = k; }
    if (n < cur) cur = n;
  };
  const drive = () => {
    const b = w.boat.state;
    const g = w.destroyers;
    let near = null;
    let nd = 1300;
    if (g) for (const d of g.ships) { if (d.out) continue; const dd = Math.hypot(d.state.x - b.x, d.state.y - b.y); if (dd < nd) { nd = dd; near = d; } }
    if (near) hl.steer(hl.bearing(near.state.x, near.state.y, b.x, b.y), 1); else hl.steer(NaN, 0);
    w.damage.hp = w.damageParams.maxHp; // 測るためだけ（HP の固定）
    w.damage.fireLeftS = 0;
  };
  while (w.stepTimeS < o.t0 && hl.active('Mission')) { drive(); hl.frame(o.frameMs); note(); }
  const t0 = w.stepTimeS;
  const upd = [];
  const frame = [];
  const wall0 = performance.now();
  let ended = '';
  for (let k = 0; k < o.win * 60; k++) {
    if (!hl.active('Mission')) { ended = `ended@${w.stepTimeS.toFixed(1)}`; break; }
    while (performance.now() < wall0 + k * o.frameMs);
    drive();
    const a = performance.now();
    hl.frame(o.frameMs);
    upd.push(performance.now() - a);
    if (k % 2 === 0) { hl.render(); if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); frame.push(performance.now() - a); }
    note();
  }
  if (cur !== Infinity) mins.push(cur);
  const ships = w.destroyers ? w.destroyers.ships.map((d) => (d.out ? '-' : d.sinking ? 'x' : 'o')).join('') : '';
  return { upd, frame, mins, t0, t1: w.stepTimeS, ended, ships, sinking: w.boat.sinking, sweeps: w.radar ? w.radar.state.sweeps : -1, iso: self.crossOriginIsolated };
}

async function oneRun(base, c, o) {
  const browser = await chromium.launch();
  try {
    const { page, ctx, errors } = await openGame(browser, base, c.q, { width: o.width, dpr: 2 });
    try {
      const r = await page.evaluate(perfRun, { frameMs: FRAME_MS, t0: c.t0, win: o.win });
      return { ...r, errors: errors.length, u50: q(r.upd, 0.5), u95: q(r.upd, 0.95), u99: q(r.upd, 0.99), p95: q(r.frame, 0.95) };
    } finally {
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}

/** 漏れなし: どの窓の最小も前の窓の最小より大きくない */
const noLeak = (mins) => mins.every((x, i) => i === 0 || x <= mins[i - 1]);

async function main() {
  if (!process.env.SITE) throw new Error('SITE=<ビルドした site> が要る');
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const cases = only ? CASES.filter((c) => only.includes(c.id)) : CASES;
  const o = { win: envNum('WIN', 60), width: envNum('W', 1560) };
  const rounds = envNum('ROUNDS', 2);
  const s = await serve(process.env.SITE, { isolate: true });
  const res = {};
  for (let r = 0; r < rounds; r++) for (const c of cases) (res[c.id] ??= []).push(await oneRun(s.base, c, o));
  await s.close();
  const best = {};
  let bad = 0;
  for (const c of cases) {
    const rs = res[c.id];
    const b = rs.reduce((m, x) => (x.u95 < m.u95 ? x : m), rs[0]);
    best[c.id] = b;
    const leakOk = noLeak(b.mins);
    const errs = rs.reduce((n, x) => n + x.errors, 0);
    if (!leakOk || errs > 0 || b.ended) bad++;
    console.log(`${c.id.padEnd(7)} 窓 t ${b.t0.toFixed(0)}〜${b.t1.toFixed(0)}${b.ended ? ` ${b.ended}` : ''} | updateFrame p50 ${f3(b.u50)} p95 ${f3(b.u95)} p99 ${f3(b.u99)} ms（${rs.length} 組の p95 ${rs.map((x) => f3(x.u95)).join('/')}）`
      + ` | 進める＋描く p95 ${b.p95.toFixed(1)} ms（参考） | 物の 30 秒ごとの最小 ${b.mins.join(',')} ${leakOk ? '増えない ✓' : '増えた ✗'} | 艦 ${b.ships} 自艇の沈没 ${b.sinking} 掃引 ${b.sweeps} iso ${b.iso} page errors ${errs}`);
  }
  for (const [x, y] of PAIRS) {
    if (!best[x] || !best[y]) continue;
    const ratio = best[x].u95 / best[y].u95;
    const ok = ratio <= P95_RATIO_MAX;
    if (!ok) bad++;
    console.log(`比 ${x} / ${y}: updateFrame の p95 ${f3(best[x].u95)} / ${f3(best[y].u95)} = ×${ratio.toFixed(2)}（≤ ${P95_RATIO_MAX} ${ok ? '✓' : '✗'}）`);
  }
  console.log(`strait-perf ${bad === 0 ? 'OK' : `NG ${bad}`}（${rounds} 組・窓 ${o.win} 秒・W ${o.width}・dpr 2）`);
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(Object.fromEntries(Object.entries(res).map(([k, rs]) => [k, rs.map((x) => ({ u50: x.u50, u95: x.u95, u99: x.u99, p95: x.p95, mins: x.mins, t0: x.t0, t1: x.t1, ended: x.ended, ships: x.ships, errors: x.errors }))])), null, 1));
  process.exitCode = bad === 0 ? 0 : 1;
}

await main();
