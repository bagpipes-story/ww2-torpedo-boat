// 性能の計測（v0.6.11 S7。spec-v0611-r2 §11「測り方」）: ヘッドレスで jp_03 ハードを偽の時計・固定ステップ 1/60 秒のまま、フレームを壁時計の 1/60 秒に合わせて回し
// （Phaser の tween は壁時計で進む＝爆発の絵がゲームと同じ長さで消える）、EVERY フレーム（既定 6＝10 枚/秒）に 1 回描いて、フレームごとの壁時計（performance.now() の差）と物の数を測る。
// ヘッドレスの WebGL は CPU のラスタ（SwiftShader）で 1 枚 数十 ms かかり、毎フレーム描くと壁時計に合わせられない（描く秒は描いたフレームの JS の側だけ。GPU の工程の秒は入らない）。
// 比べる基準は jp_04 ハード（夜明けの空襲の第 2 波）。ページの中の半分は perf-evac-entry.mjs（束ねる。ゲームは import しない）。
// 測る物（フレームごと）: 進める（__hl.frame＝game.headlessStep。Mission と Hud の update＝入力の消費・固定ステップ・見た目の同期・HUD）とその中の世界の updateFrame・固定ステップ（stepFn）、
//   描く（__hl.render＝game.step(t, 0)。WebGL の命令は GPU の工程へ渡すだけなので JS の秒は描画の一部）、Mission の scene.children.length（30 秒ごとの最小値。爆発の絵は Image と tween を
//   作って消すので毎フレームの数は揺れる＝最小値が増えなければ漏れが無い。r2 L5）、Text.setText の呼ばれた回数（全部の Scene。同じ文で呼んだ回も数える）と文が変わった回数、
//   飛んでいる機（凍結の空襲の AirPlane の段 1〜5）・動く編隊・動く 2 回目（もう一度来る編隊）の数。performance.now は COOP・COEP の見出しで 5 μs 刻み（crossOriginIsolated）。
// 台本: jp_03 は模擬 core/evac-sim の台本の組 JP03（遊び方:seed。既定 dodge_only:20＝ハードの第 4 波で 4 機の編隊が 3 つ＝12 機が約 22 秒・第 3 波の 2 回目の編隊が第 4 波に重なる
//   いちばん重い夜（模擬のハード seed 1〜30 × 7 つの遊び方で第 4 波に 12 機が来たのは dodge_only の seed 4・20 だけ）と、spec §11 の stay:3（全部の隊が外・何もしない。S3b の data では
//   第 4 波までに隊が尽きて 12 機は来ない。seed 3 は第 4 波に 4 機の編隊 2 つと第 3 波の 2 回目が重なる。seed 2 は 150 秒で 18 隻とも沈む））。setText の門は stay の夜
//   （動く夜は全部の任務に共通の針路の欄が転舵の間 10 回/秒ほど替わる）。jp_04 は seed 2（seed 1・4・5 は自艇が第 1 波で沈む。2・3・6 は第 2 波まで浮く）。jp_04 は夜明けまでスティック中立・夜明けの後は全速で投下のたびに 0.35 秒後に 90° 転舵（第 2 波まで浮くため）。
// 窓: jp_03 は t 190〜225 秒（第 4 波。spec §11）、jp_04 は夜明けの空襲の第 2 波が飛んでいるフレーム（来なければ第 1 波＝そう書く）。ほかに 30 秒ごとの表。
// 門（spec §11）: jp_03 の窓の updateFrame の p95 ≤ jp_04 の窓の p95 × 1.5（フレーム＝進める＋描くも並べる）、30 秒ごとの children の最小値が（30 秒より後で）増えない、
//   setText ≤ 平均 10 回/秒、ページのエラー 0。数はヘッドレスの相対値（iPhone の FPS は実機テスト 3）。
// 実行: VITE_BASE=/ww2-torpedo-boat/ npm run build -- --outDir <site> の後
//   SITE=<site> [WS=1560,1280] [JP03=dodge_only:20,stay:3] [SEED04=2] [SECS=240] [SECS04=240] [PACE=1] [EVERY=6] [ONLY=jp03|jp04] [OUT=<json>] node scripts/headless/evac-perf.mjs
import { writeFileSync } from 'node:fs';
import { FRAME_MS, chromium, envNum, openGame, serve } from './lib.mjs';
import { bundleEntry } from './world-vs-sim.mjs';

const q = (xs, p) => { if (xs.length === 0) return NaN; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const stats = (xs) => ({ p50: q(xs, 0.5), p95: q(xs, 0.95), p99: q(xs, 0.99), max: xs.length ? Math.max(...xs) : NaN, n: xs.length });
const fmt = (s, unit = 'ms') => `p50 ${f2(s.p50)}・p95 ${f2(s.p95)}・p99 ${f2(s.p99)}・最大 ${f2(s.max)} ${unit}`;

/** 1 夜を回す（夜ごとに新しいブラウザ。長く描いた後の次のページの読み込みが 30 秒を超えて止まることがあった） */
async function oneRun(base, code, c) {
  const browser = await chromium.launch();
  try {
    const { page, ctx, errors } = await openGame(browser, base, c.query, { width: c.width });
    try {
      await page.addScriptTag({ content: code });
      const o = { hard: true, policy: c.pol, seed: c.seed, secs: c.secs, frameMs: FRAME_MS, pace: c.pace, every: c.every };
      const r = await page.evaluate((x) => (x.kind === 'jp03' ? window.__perfEvac.run03(x) : window.__perfEvac.run04(x)), { ...o, kind: c.kind });
      return { ...c, ...r, errors };
    } finally {
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
}

/** 窓のフレームの番号（jp_04 は第 2 波、来なければ第 1 波） */
function windowIdx(r) {
  const pick = (f) => { const idx = []; for (let i = 0; i < r.t.length; i++) if (f(i)) idx.push(i); return idx; };
  if (r.kind === 'jp03') return { idx: pick((i) => r.t[i] >= 190 && r.t[i] <= 225), label: 't 190〜225 秒' };
  const w2 = pick((i) => r.wave[i] === 2 && r.planes[i] > 0);
  return w2.length > 0 ? { idx: w2, label: '夜明けの空襲の第 2 波' } : { idx: pick((i) => r.wave[i] === 1 && r.planes[i] > 0), label: '夜明けの空襲の第 1 波（第 2 波の前に沈んだ）' };
}

function report(r) {
  const frame = r.upd.map((x, i) => x + r.render[i]);
  const { idx, label } = windowIdx(r);
  const pick = (xs) => idx.map((i) => xs[i]).filter((x) => Number.isFinite(x)); // 描いていないフレームの描く・フレームは NaN
  const stepMean = (ii) => (ii.reduce((s, i) => s + r.stepSum[i], 0) / Math.max(1, ii.reduce((s, i) => s + r.stepN[i], 0))) * 1000;
  const win = {
    label, lag: stats(pick(r.lag)), frame: stats(pick(frame)), upd: stats(pick(r.upd)), uf: stats(pick(r.uf)), render: stats(pick(r.render)), stepMean: stepMean(idx), stepMax: stats(pick(r.stepMax).map((x) => x * 1000)),
    planesMax: Math.max(0, ...pick(r.planes)), s12: pick(r.planes).filter((x) => x >= 12).length / 60, liveMax: Math.max(0, ...pick(r.live)), againMax: Math.max(0, ...pick(r.again)),
    t0: idx.length ? r.t[idx[0]] : NaN, t1: idx.length ? r.t[idx[idx.length - 1]] : NaN,
  };
  const secs = r.t.length / 60;
  const per30 = [];
  for (let a = 0; a < secs; a += 30) {
    const ii = [];
    for (let i = 0; i < r.t.length; i++) if (r.t[i] > a && r.t[i] <= a + 30) ii.push(i);
    if (ii.length === 0) continue;
    const sum = (xs) => ii.reduce((s, i) => s + xs[i], 0) / (ii.length / 60);
    per30.push({
      a, b: a + 30, ufP95: q(ii.map((i) => r.uf[i]), 0.95), frameP95: q(ii.map((i) => frame[i]).filter((x) => Number.isFinite(x)), 0.95), lagMax: Math.max(...ii.map((i) => r.lag[i])), stepMean: stepMean(ii), ch: Math.min(...ii.map((i) => r.children[i])), chMax: Math.max(...ii.map((i) => r.children[i])),
      calls: sum(r.calls), changed: sum(r.changed), planesMax: Math.max(...ii.map((i) => r.planes[i])), againMax: Math.max(...ii.map((i) => r.again[i])),
    });
  }
  const callsAvg = r.calls.reduce((s, x) => s + x, 0) / secs;
  const changedAvg = r.changed.reduce((s, x) => s + x, 0) / secs;
  // 漏れの見方: 30 秒ごとの最小値が前の窓の最小値を超えない（最初の 30 秒は生成の途中の物を含むので 30 秒以降を比べる）
  let leak = false;
  for (let i = 2; i < per30.length; i++) if (per30[i].ch > per30[i - 1].ch) leak = true;
  return { win, per30, callsAvg, changedAvg, secs, leak };
}

async function main() {
  const site = process.env.SITE;
  if (!site) throw new Error('SITE=<ビルドした site のディレクトリ> が要る');
  const ws = (process.env.WS ?? '1560,1280').split(',').map(Number);
  const only = process.env.ONLY ?? '';
  const pace = process.env.PACE !== '0';
  const every = envNum('EVERY', 6);
  const cases = [];
  for (const width of ws) {
    const seed04 = envNum('SEED04', 2);
    for (const ps of (process.env.JP03 ?? 'dodge_only:20,stay:3').split(',')) {
      const [pol, sd] = ps.split(':');
      if (only !== 'jp04') cases.push({ kind: 'jp03', width, pace, every, pol, seed: Number(sd), secs: envNum('SECS', 240), query: `mission=jp_03&seed=${sd}&hard` });
    }
    if (only !== 'jp03') cases.push({ kind: 'jp04', width, pace, every, pol: 'react', seed: seed04, secs: envNum('SECS04', 240), query: `mission=jp_04&seed=${seed04}&hard` });
  }
  const code = await bundleEntry('perf-evac-entry.mjs');
  const sv = await serve(site, { isolate: true }); // performance.now を 5 μs 刻みに（crossOriginIsolated）
  const res = [];
  for (const c of cases) res.push(await oneRun(sv.base, code, c)); // 1 夜ずつ順に（並べると壁時計が互いに乱れる）
  await sv.close();
  const rows = [];
  let bad = 0;
  for (const r of res) {
    const rep = report(r);
    rows.push({ kind: r.kind, width: r.width, pol: r.pol, query: r.query, ended: r.ended, frames: r.t.length, iso: r.iso, errors: r.errors, ...rep });
    const w = rep.win;
    console.log(`[${r.query} W ${r.width} ${r.pol}${r.pace ? '' : ' 壁時計に合わせない'}・${r.every} フレームに 1 回描く] ${r.t.length} フレーム（${rep.secs.toFixed(1)} 秒${r.ended ? `・${r.ended}` : ''}）・crossOriginIsolated ${r.iso}・page errors ${r.errors.length}${r.errors.length ? `: ${r.errors[0]}` : ''}`);
    console.log(`  窓（${w.label}）${f2(w.t0)}〜${f2(w.t1)} 秒・${w.frame.n} フレーム: updateFrame ${fmt(w.uf)} | 進める ${fmt(w.upd)} | 描く ${fmt(w.render)} | 描いたフレーム（進める＋描く）${fmt(w.frame)} | 壁時計からの遅れ ${fmt(w.lag)} | 固定ステップ 1 つ 平均 ${f2(w.stepMean)} μs・フレームの最大のステップ ${fmt(w.stepMax, 'μs')}`);
    console.log(`  窓の機: 飛ぶ機の最大 ${w.planesMax}・12 機の秒 ${f2(w.s12)}・動く編隊の最大 ${w.liveMax}・動く 2 回目の編隊の最大 ${w.againMax}`);
    console.log(`  setText: 平均 ${f2(rep.callsAvg)} 回/秒（文が変わった ${f2(rep.changedAvg)} 回/秒）${rep.callsAvg <= 10 ? '' : r.pol === 'stay' ? ' ✗（> 10）' : '（> 10。動く夜は門にしない）'}・30 秒ごとの children の最小値 ${rep.per30.map((p) => p.ch).join(' → ')}${rep.leak ? ' ✗（増えた）' : '（30 秒より後で増えない）'}`);
    for (const p of rep.per30) console.log(`    ${String(p.a).padStart(3)}〜${String(p.b).padStart(3)} 秒: updateFrame p95 ${f2(p.ufP95)} ms・描いたフレーム p95 ${f2(p.frameP95)} ms・遅れの最大 ${f2(p.lagMax)} ms・ステップ 平均 ${f2(p.stepMean)} μs・children ${p.ch}〜${p.chMax}・setText ${f2(p.calls)}（変わった ${f2(p.changed)}）回/秒・機の最大 ${p.planesMax}・2 回目の編隊 ${p.againMax}`);
    if (r.errors.length > 0 || rep.leak || (r.pol === 'stay' && rep.callsAvg > 10) || !r.iso) bad++;
  }
  for (const width of ws) {
    const a = rows.find((x) => x.kind === 'jp03' && x.width === width); // JP03 の最初の組（既定 dodge_only:20＝いちばん重い夜）
    const b = rows.find((x) => x.kind === 'jp04' && x.width === width);
    if (!a || !b) continue;
    const ok = a.win.uf.p95 <= b.win.uf.p95 * 1.5;
    if (!ok) bad++;
    console.log(`W ${width}: jp_03 の窓の updateFrame の p95 ${f2(a.win.uf.p95)} ms ≤ jp_04 の窓（${b.win.label}）の p95 ${f2(b.win.uf.p95)} × 1.5 ＝ ${f2(b.win.uf.p95 * 1.5)} ${ok ? '✓' : '✗'}（フレームの p95 ${f2(a.win.frame.p95)}／${f2(b.win.frame.p95)} ms）`);
  }
  console.log(`runs ${rows.length} bad ${bad}`);
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(rows, null, 1));
  process.exitCode = bad === 0 ? 0 : 1;
}

await main();
