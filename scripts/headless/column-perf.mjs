// us_05（スリガオ海峡・最初の接触）の性能（v0.8.2 S4。spec-v0820 §7.2・lead の L46。v0.8.1 の anchor-perf.mjs の写し）: 片道の列 7 隻（ハード 8）・戦艦と重巡・レーダー・報告のある夜の
// 1 フレームの進める時間（game.headlessStep＝updateFrame）を、同じビルドの us_04（往復の列）と us_02（今の駆逐艦の任務）と比べる。門: updateFrame の p95 を ROUNDS 組（既定 4）の中央値で
// us_05 のハード ≤ us_04 のハード × 1.25 かつ ≤ us_02 × 1.4、どの件も画面の物（Mission の children.list.length）の 30 秒ごとの最小が増えない（漏れなし＝窓ごとに前の窓の最小以下）。
// 件（1 夜ずつ新しいブラウザ）: us_05・us_05h（本隊が自艇を照らして撃つ 60 秒）・us_04h（strait-perf と同じ t 140〜200＝復路の列）・us_02・us_02h（t 70〜130）。
// 台本（測るためだけ・世界の何でも読む）: us_05 は本隊（戦艦）が入るまで出発点で止まり、入ったら最寄りの戦艦の北 1,000 m の点へ全速で寄り、自艇が照らされて 2 秒（か 150 秒）で窓。
// 窓の間と us_04・us_02 は strait-perf と同じ（1,300 m の内の浮いている艦から全速で離れる・HP と火災は毎フレーム満タンに戻す）。窓はフレームを壁時計の 1/60 秒に合わせ、毎フレームの
// updateFrame の秒と、2 フレームに 1 回の（進める＋描く＋WebGL の 1 画素の読み）の秒（参考）を記録する。照らされていた秒・撃たれた弾（自艇への砲弾の命中の数）も出す。
// COOP・COEP の見出しで配り crossOriginIsolated の 5 μs の時計。数はヘッドレスの相対値（iPhone の FPS は実機 ③）。
// 実行: SITE=<site> [ROUNDS=4] [WIN=60] [W=1560] [ONLY=us_05h,us_04h,us_02] [OUT=<json>] node scripts/headless/column-perf.mjs
import { writeFileSync } from 'node:fs';
import { FRAME_MS, chromium, envNum, openGame, serve } from './lib.mjs';

/** 門（spec §7.2）: updateFrame の p95 の中央値の比の上限（us_05 のハード / us_04 のハード・us_05 のハード / us_02）。参考の比（us_05 / us_02・us_05h / us_02h）は門でない */
const PAIRS = [['us_05h', 'us_04h', 1.25], ['us_05h', 'us_02', 1.4], ['us_05', 'us_02', NaN], ['us_05h', 'us_02h', NaN]];
const CASES = [
  { id: 'us_05', q: 'mission=us_05&seed=1', t0: -1 },
  { id: 'us_05h', q: 'mission=us_05&seed=1&hard', t0: -1 },
  { id: 'us_04h', q: 'mission=us_04&seed=1&hard', t0: 140 },
  { id: 'us_02', q: 'mission=us_02&seed=1', t0: 70 },
  { id: 'us_02h', q: 'mission=us_02&seed=1&hard', t0: 70 },
];
/** us_05 の窓を始める遅い方の秒（照らされなくても）と、照らされてから窓までの秒・戦艦の北へ寄る m */
const COLUMN_WARM_MAX_S = 150;
const COLUMN_WARM_AFTER_S = 2;
const COLUMN_APPROACH_N_M = 1000;

const q = (xs, p) => { if (xs.length === 0) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const med = (xs) => q(xs, 0.5);
const f3 = (x) => (Number.isFinite(x) ? x.toFixed(3) : '—');

/** ページの中: 1 夜（warm → 窓）。o = { frameMs, t0, win, warmMaxS, warmAfterS, northM }。t0 < 0 は us_05 の台本（本隊の戦艦の北へ寄って照らされるまで） */
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
  let movedAt = NaN; // us_05: 初めて照らされた秒
  if (o.t0 < 0) {
    const cls = w.destroyers.kits.classes;
    const bbs = w.destroyers.ships.filter((_, i) => cls[i] === 'battleship');
    while (hl.active('Mission') && w.stepTimeS < o.warmMaxS) {
      if (Number.isNaN(movedAt) && w.enemy.illuminated) movedAt = w.stepTimeS;
      if (!Number.isNaN(movedAt) && w.stepTimeS >= movedAt + o.warmAfterS) break;
      const b = w.boat.state;
      const bb = bbs.find((d) => !d.out && !d.sinking);
      if (bb) hl.steer(hl.bearing(b.x, b.y, bb.state.x, bb.state.y - o.northM), 1); else hl.steer(NaN, 0);
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
  const ships = w.destroyers ? w.destroyers.ships.map((d) => (d.out ? '-' : d.sinking ? 'x' : 'o')).join('') : '';
  return { upd, frame, mins, t0, t1: w.stepTimeS, movedAt, lit0, litS, ended, ships, sinking: w.boat.sinking, iso: self.crossOriginIsolated };
}

async function oneRun(base, c, o) {
  const browser = await chromium.launch();
  try {
    const { page, ctx, errors } = await openGame(browser, base, c.q, { width: o.width, dpr: 2 });
    try {
      const r = await page.evaluate(perfRun, { frameMs: FRAME_MS, t0: c.t0, win: o.win, warmMaxS: COLUMN_WARM_MAX_S, warmAfterS: COLUMN_WARM_AFTER_S, northM: COLUMN_APPROACH_N_M });
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
      + ` | 初めて照らされた ${rs.map((x) => f3(x.movedAt)).join('/')} 窓で照らされた秒 ${rs.map((x) => x.litS.toFixed(1)).join('/')} 艦 ${rs.map((x) => x.ships).join('/')} 自艇の沈没 ${rs.map((x) => x.sinking).join('/')} iso ${rs[0].iso} page errors ${errs}`);
  }
  for (const [x, y, max] of PAIRS) {
    if (m95[x] === undefined || m95[y] === undefined) continue;
    const ratio = m95[x] / m95[y];
    const gate = Number.isFinite(max);
    const ok = !gate || ratio <= max;
    if (!ok) bad++;
    console.log(`比 ${x} / ${y}: updateFrame の p95 の中央値 ${f3(m95[x])} / ${f3(m95[y])} = ×${ratio.toFixed(2)}${gate ? `（≤ ${max} ${ok ? '✓' : '✗'}）` : '（参考）'}`);
  }
  console.log(`column-perf ${bad === 0 ? 'OK' : `NG ${bad}`}（${rounds} 組の中央値・窓 ${o.win} 秒・W ${o.width}・dpr 2）`);
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(Object.fromEntries(Object.entries(res).map(([k, rs]) => [k, rs.map((x) => ({ u50: x.u50, u95: x.u95, u99: x.u99, p95: x.p95, mins: x.mins, t0: x.t0, t1: x.t1, movedAt: x.movedAt, litS: x.litS, ended: x.ended, ships: x.ships, errors: x.errors }))])), null, 1));
  process.exitCode = bad === 0 ? 0 : 1;
}

await main();
