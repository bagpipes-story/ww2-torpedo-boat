// us_06（オルモック湾の決着）の性能（v0.8.1 S4。spec-v0810 §5.2・lead の L67。v0.8.0 の strait-perf.mjs の写し）: 止まった艦・暗い岸を背に・レーダーのある夜の 1 フレームの
// 進める時間（game.headlessStep＝updateFrame）を、同じビルドの us_02（今の駆逐艦の任務）と比べる。門: updateFrame の p95 を ROUNDS 組（既定 4）の中央値で us_06 ≤ us_02 × 1.2・
// us_06 のハード ≤ us_02 のハード × 1.2、どの件も画面の物（Mission の children.list.length）の 30 秒ごとの最小が増えない（漏れなし＝窓ごとに前の窓の最小以下）。
// 件（1 夜ずつ新しいブラウザ）: us_06・us_06h（卯月が動き出して照らされた後の 60 秒）・us_02・us_02h（strait-perf と同じ t 70〜130）。
// 台本（測るためだけ・世界の何でも読む）: us_06 は出発点から卯月へ全速で寄り、卯月が動き出して（anchored が下りて）自艇が照らされるか 60 秒になったら窓。窓の間と us_02 は
// strait-perf と同じ（1,300 m の内の浮いている艦から全速で離れる・HP と火災は毎フレーム満タンに戻す）。窓はフレームを壁時計の 1/60 秒に合わせ、毎フレームの updateFrame の秒と、
// 2 フレームに 1 回の（進める＋描く＋WebGL の 1 画素の読み）の秒（参考）を記録する。COOP・COEP の見出しで配り crossOriginIsolated の 5 μs の時計。数はヘッドレスの相対値（iPhone の FPS は実機 ③）。
// 実行: SITE=<site> [ROUNDS=4] [WIN=60] [W=1560] [ONLY=us_06,us_02] [OUT=<json>] node scripts/headless/anchor-perf.mjs
import { writeFileSync } from 'node:fs';
import { FRAME_MS, chromium, envNum, openGame, serve } from './lib.mjs';

/** 門（spec §5.2）: updateFrame の p95 の中央値の比の上限（us_06 / us_02・ハードどうし） */
const P95_RATIO_MAX = 1.2;
const CASES = [
  { id: 'us_06', q: 'mission=us_06&seed=1', t0: -1 },
  { id: 'us_06h', q: 'mission=us_06&seed=1&hard', t0: -1 },
  { id: 'us_02', q: 'mission=us_02&seed=1', t0: 70 },
  { id: 'us_02h', q: 'mission=us_02&seed=1&hard', t0: 70 },
];
const PAIRS = [['us_06', 'us_02'], ['us_06h', 'us_02h']];
/** us_06 の窓を始める遅い方の秒（卯月が動き出さなくても）と、動き出してから窓までの秒 */
const ANCHOR_WARM_MAX_S = 60;
const ANCHOR_WARM_AFTER_S = 2;

const q = (xs, p) => { if (xs.length === 0) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const med = (xs) => q(xs, 0.5);
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');

/** ページの中: 1 夜（warm → 窓）。o = { frameMs, t0, win, warmMaxS, warmAfterS }。t0 < 0 は us_06 の台本（卯月へ寄って動き出して照らされるまで） */
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
  const keep = () => { w.damage.hp = w.damageParams.maxHp; w.damage.fireLeftS = 0; }; // 測るためだけ（HP の固定）
  const flee = () => {
    const b = w.boat.state;
    const g = w.destroyers;
    let near = null;
    let nd = 1300;
    if (g) for (const d of g.ships) { if (d.out) continue; const dd = Math.hypot(d.state.x - b.x, d.state.y - b.y); if (dd < nd) { nd = dd; near = d; } }
    if (near) hl.steer(hl.bearing(near.state.x, near.state.y, b.x, b.y), 1); else hl.steer(NaN, 0);
    keep();
  };
  let movedAt = NaN;
  if (o.t0 < 0) {
    const uz = w.destroyers.ships[0];
    while (hl.active('Mission') && w.stepTimeS < o.warmMaxS) {
      if (Number.isNaN(movedAt) && !uz.anchored) movedAt = w.stepTimeS;
      if (!Number.isNaN(movedAt) && w.stepTimeS >= movedAt + o.warmAfterS && w.enemy.illuminated) break;
      const b = w.boat.state;
      if (Number.isNaN(movedAt)) hl.steer(hl.bearing(b.x, b.y, uz.state.x, uz.state.y), 1); else flee();
      keep();
      hl.frame(o.frameMs);
      note();
    }
  } else while (w.stepTimeS < o.t0 && hl.active('Mission')) { flee(); hl.frame(o.frameMs); note(); }
  const t0 = w.stepTimeS;
  const lit0 = w.enemy.illuminated;
  const upd = [];
  const frame = [];
  const wall0 = performance.now();
  let ended = '';
  let litS = 0;
  for (let k = 0; k < o.win * 60; k++) {
    if (!hl.active('Mission')) { ended = `ended@${w.stepTimeS.toFixed(1)}`; break; }
    while (performance.now() < wall0 + k * o.frameMs);
    flee();
    const a = performance.now();
    hl.frame(o.frameMs);
    upd.push(performance.now() - a);
    if (w.enemy.illuminated) litS += o.frameMs / 1000;
    if (k % 2 === 0) { hl.render(); if (gl) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); frame.push(performance.now() - a); }
    note();
  }
  if (cur !== Infinity) mins.push(cur);
  const ships = w.destroyers ? w.destroyers.ships.map((d) => (d.out ? '-' : d.sinking ? 'x' : d.anchored ? 'a' : 'o')).join('') : '';
  return { upd, frame, mins, t0, t1: w.stepTimeS, movedAt, lit0, litS, ended, ships, sinking: w.boat.sinking, iso: self.crossOriginIsolated };
}

async function oneRun(base, c, o) {
  const browser = await chromium.launch();
  try {
    const { page, ctx, errors } = await openGame(browser, base, c.q, { width: o.width, dpr: 2 });
    try {
      const r = await page.evaluate(perfRun, { frameMs: FRAME_MS, t0: c.t0, win: o.win, warmMaxS: ANCHOR_WARM_MAX_S, warmAfterS: ANCHOR_WARM_AFTER_S });
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
  const rounds = envNum('ROUNDS', 4);
  const s = await serve(process.env.SITE, { isolate: true });
  const res = {};
  for (let r = 0; r < rounds; r++) for (const c of cases) (res[c.id] ??= []).push(await oneRun(s.base, c, o));
  await s.close();
  const m95 = {};
  let bad = 0;
  for (const c of cases) {
    const rs = res[c.id];
    m95[c.id] = med(rs.map((x) => x.u95));
    const leakOk = rs.every((x) => noLeak(x.mins));
    const errs = rs.reduce((n, x) => n + x.errors, 0);
    const ended = rs.filter((x) => x.ended).map((x) => x.ended);
    if (!leakOk || errs > 0 || ended.length > 0) bad++;
    console.log(`${c.id.padEnd(7)} 窓 t ${rs.map((x) => `${x.t0.toFixed(0)}〜${x.t1.toFixed(0)}`).join('/')}${ended.length ? ` ${ended.join(',')}` : ''} | updateFrame（${rs.length} 組の中央値）p50 ${f3(med(rs.map((x) => x.u50)))} p95 ${f3(m95[c.id])} p99 ${f3(med(rs.map((x) => x.u99)))} ms（組ごとの p95 ${rs.map((x) => f3(x.u95)).join('/')}）`
      + ` | 進める＋描く p95 ${med(rs.map((x) => x.p95)).toFixed(1)} ms（参考） | 物の 30 秒ごとの最小 ${rs.map((x) => x.mins.join(',')).join(' / ')} ${leakOk ? '増えない ✓' : '増えた ✗'}`
      + ` | 動き出し ${rs.map((x) => f3(x.movedAt)).join('/')} 照らされた秒 ${rs.map((x) => x.litS.toFixed(1)).join('/')} 艦 ${rs.map((x) => x.ships).join('/')} 自艇の沈没 ${rs.map((x) => x.sinking).join('/')} iso ${rs[0].iso} page errors ${errs}`);
  }
  for (const [x, y] of PAIRS) {
    if (m95[x] === undefined || m95[y] === undefined) continue;
    const ratio = m95[x] / m95[y];
    const ok = ratio <= P95_RATIO_MAX;
    if (!ok) bad++;
    console.log(`比 ${x} / ${y}: updateFrame の p95 の中央値 ${f3(m95[x])} / ${f3(m95[y])} = ×${ratio.toFixed(2)}（≤ ${P95_RATIO_MAX} ${ok ? '✓' : '✗'}）`);
  }
  console.log(`anchor-perf ${bad === 0 ? 'OK' : `NG ${bad}`}（${rounds} 組の中央値・窓 ${o.win} 秒・W ${o.width}・dpr 2）`);
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(Object.fromEntries(Object.entries(res).map(([k, rs]) => [k, rs.map((x) => ({ u50: x.u50, u95: x.u95, u99: x.u99, p95: x.p95, mins: x.mins, t0: x.t0, t1: x.t1, movedAt: x.movedAt, litS: x.litS, ended: x.ended, ships: x.ships, errors: x.errors }))])), null, 1));
  process.exitCode = bad === 0 ? 0 : 1;
}

await main();
