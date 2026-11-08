// 絵の性能の A/B（v0.7.0 S0。spec-v0700 §5.7・§7.2「art-perf」。門はフレーム p95 ≤ +15%・画面に見える Mission の物 ≤ +40）: ビルド A（基準 main f5563ab）と B（今の木）を
// 同じ台本・同じ窓で交互に回し（A → B を 1 組、ROUNDS 組。夜ごとに新しいブラウザ）、窓の間 EVERY フレーム（既定 2）に 1 回描いて、描いたフレームの（進める＋描く）の壁時計の p95 と、
// そのフレームで見えている Mission の物の数（visible で α > 0）の p95 を出す。組ごとの良い方（p95 の小さい方）で比べ、A 対 A（組の間の揺れ）も出す。
// ヘッドレスの WebGL は CPU のラスタ（SwiftShader）で塗りに厳しい＝ここで +15% に収まれば iPhone の GPU は安全側（spec §5.7）。数はヘッドレスの相対値（iPhone の FPS は実機テスト ③）。
// 件（spec §7.2）: us_02 ハード（星弾が上がっている窓＝R20）・us_01 &dawn=20（夜明けの空襲）・us_03（大発と沿岸砲）・jp_04 ハード（米PT・卯月・輸送船）・jp_02（夜の哨戒機）・
//   jp_03 ハード（模擬の台本 dodge_only:20 の t 190〜＝第 4 波の 12 機。evac-perf の窓）。ページの中は art-perf-entry.mjs（束ねる）。
// 描いた後に WebGL の 1 画素を読んで描画の工程の終わりを待つ（SYNC=0 で待たない）。
// 実行: A=<site A> B=<site B> [ONLY=us_02h,jp_03h] [ROUNDS=2] [WIN=15] [EVERY=2] [W=1560] [PACE=1] [SYNC=1] [OUT=<json>] node scripts/headless/art-perf.mjs
import { writeFileSync } from 'node:fs';
import { FRAME_MS, chromium, envNum, openGame, serve } from './lib.mjs';
import { bundleEntry } from './world-vs-sim.mjs';

const CASES = [
  { id: 'us_02h', query: 'mission=us_02&seed=1&hard', kind: 'script', script: 'standoff', start: 'starshell', maxWarm: 60 },
  { id: 'us_01d', query: 'mission=us_01&seed=1&dawn=20', kind: 'script', start: 'planes', maxWarm: 60 },
  { id: 'us_03', query: 'mission=us_03&seed=1', kind: 'script', start: 40, maxWarm: 40 },
  { id: 'jp_04h', query: 'mission=jp_04&seed=2&hard', kind: 'script', start: 40, maxWarm: 40 },
  { id: 'jp_02', query: 'mission=jp_02&seed=1', kind: 'script', start: 'planes', maxWarm: 60 },
  { id: 'jp_03h', query: 'mission=jp_03&seed=20&hard', kind: 'evac', policy: 'dodge_only', seed: 20, hard: true, start: 190, maxWarm: 190 },
];

const q = (xs, p) => { if (xs.length === 0) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');

async function oneRun(base, code, c, o) {
  const browser = await chromium.launch();
  try {
    const { page, ctx, errors } = await openGame(browser, base, c.query, { width: o.width, dpr: 2 });
    try {
      await page.addScriptTag({ content: code });
      const arg = { ...c, win: o.win, every: o.every, pace: o.pace, sync: o.sync, frameMs: FRAME_MS };
      const r = await page.evaluate((x) => (x.kind === 'evac' ? window.__artPerf.runEvac(x) : window.__artPerf.runScript(x)), arg);
      return { ...r, errors, p95: q(r.frame, 0.95), p50: q(r.frame, 0.5), vis95: q(r.vis, 0.95), all95: q(r.all, 0.95), n: r.frame.length };
    } finally {
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  if (!process.env.A || !process.env.B) throw new Error('A=<基準の site> B=<今の site> が要る');
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const cases = only ? CASES.filter((c) => only.includes(c.id)) : CASES;
  const o = { win: envNum('WIN', 15), every: envNum('EVERY', 2), pace: process.env.PACE !== '0', sync: process.env.SYNC !== '0', width: envNum('W', 1560) };
  const rounds = envNum('ROUNDS', 2);
  const code = await bundleEntry('art-perf-entry.mjs');
  const sa = await serve(process.env.A);
  const sb = await serve(process.env.B);
  const res = cases.map(() => ({ a: [], b: [] }));
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < cases.length; i++) {
      res[i].a.push(await oneRun(sa.base, code, cases[i], o));
      res[i].b.push(await oneRun(sb.base, code, cases[i], o));
    }
  }
  await sa.close();
  await sb.close();
  let bad = 0;
  const rows = [];
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const best = (xs) => xs.reduce((m, x) => (x.p95 < m.p95 ? x : m), xs[0]);
    const A = best(res[i].a);
    const B = best(res[i].b);
    const ratio = B.p95 / A.p95;
    const dVis = B.vis95 - A.vis95;
    const aa = res[i].a.length > 1 ? Math.max(...res[i].a.map((x) => x.p95)) / Math.min(...res[i].a.map((x) => x.p95)) : NaN;
    const errs = [...res[i].a, ...res[i].b].reduce((s, x) => s + x.errors.length, 0);
    const ok = ratio <= 1.15 && dVis <= 40 && errs === 0;
    if (!ok) bad++;
    const win = (x) => `t ${f2(x.t0)}〜${f2(x.t1)}（${x.reason}${x.ended ? `・${x.ended}` : ''}）`;
    console.log(`${c.id.padEnd(7)} ${c.query}: 描いたフレーム（進める＋描く）の p95 A ${f2(A.p95)} → B ${f2(B.p95)} ms（×${f2(ratio)}・≤ 1.15 ${ratio <= 1.15 ? '✓' : '✗'}）・p50 ${f2(A.p50)} → ${f2(B.p50)}・`
      + `見える物の p95 ${A.vis95} → ${B.vis95}（${dVis >= 0 ? '+' : ''}${dVis}・≤ +40 ${dVis <= 40 ? '✓' : '✗'}）・全部の物 ${A.all95} → ${B.all95}・A 対 A の揺れ ×${f2(aa)}・描いた ${A.n}/${B.n} 枚・窓 A ${win(A)} B ${win(B)}・page errors ${errs}`);
    rows.push({ ...c, A, B, ratio, dVis, aa, runs: res[i] });
  }
  console.log(`art-perf ${bad === 0 ? 'OK' : `NG ${bad}`}（${rounds} 組・窓 ${o.win} 秒・${o.every} フレームに 1 回描く・W ${o.width}）`);
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(rows.map((r) => ({ ...r, runs: r.runs.a.map((x, j) => ({ a: { p95: x.p95, vis95: x.vis95 }, b: { p95: r.runs.b[j].p95, vis95: r.runs.b[j].vis95 } })) })), null, 1));
  process.exitCode = bad === 0 ? 0 : 1;
}

await main();
