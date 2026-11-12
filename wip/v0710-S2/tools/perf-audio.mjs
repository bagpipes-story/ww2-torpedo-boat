// 実時間に合わせた窓の速さ（v0.7.1 S2 の参考値。scratchpad の道具＝repo には入れない）: AUDIO=1（context が running＝音源を本当に作る）で、A（基準 3a9e7aa）と B（今）を交互に回し、
// 窓の間は 1 フレームごとに 進める＋描く（描画の終わりまで待つ）の壁時計を測り、実時間（1/60 秒）に合わせて待つ（ヘッドレスは描画が遅く 1 フレーム 60 ms 前後＝実時間より遅れる）。B はエンジンの数（作った音源／秒・同時の声の最大）も出す。
// 件: us_03 の連射（大発が近い・機銃を押しっぱなし。t 2 秒から 12 秒）・jp_03 ハードの最後の波（seed 2・機銃を押しっぱなし。t 186 秒から 20 秒）。
// 実行: AUDIO=1 A=<site A> B=<site B> [ROUNDS=3] node perf-audio.mjs
import { FRAME_MS, chromium, envNum, openGame, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';

const CASES = [
  { id: 'us_03-burst', q: 'mission=us_03&seed=1&barges=near', warm: 2, win: 12 },
  { id: 'jp_03h-last', q: 'mission=jp_03&seed=2&hard', warm: 186, win: 20 },
];
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

async function run(o) {
  const hl = window.__hl;
  const w = hl.world();
  const drive = () => {
    const b = w.boat.state;
    const f = w.enemy.focus(b.x, b.y);
    const dist = f ? Math.hypot(f.x - b.x, f.y - b.y) : Infinity;
    if (f && dist < 400) hl.steer(hl.bearing(f.x, f.y, b.x, b.y), 0.6);
    else if (f) hl.steer(hl.bearing(b.x, b.y, f.x, f.y), dist > 1800 ? 0.6 : 0.4);
    else hl.steer(90, 0.5);
    w.input.gunHeld = true;
  };
  for (let k = 0; k < o.warm * 60 && hl.active('Mission'); k++) { drive(); hl.frame(o.frameMs); }
  const sfx = window.__sfx;
  if (sfx) { sfx.mixer.reset(); sfx.mixer.maxBusy = 0; } // 暖機（偽の時計で速く進めた分）の声を数えない
  const s0 = sfx ? sfx.stats() : null;
  const gl = window.__game.renderer.gl;
  const px = new Uint8Array(4);
  const frames = [];
  const wall0 = performance.now();
  for (let k = 0; k < o.win * 60 && hl.active('Mission'); k++) {
    drive();
    const t0 = performance.now();
    hl.frame(o.frameMs);
    hl.render();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); // 描画の工程の終わりを待つ（art-perf の SYNC と同じ）
    frames.push(performance.now() - t0);
    const due = wall0 + (k + 1) * o.frameMs;
    if (performance.now() < due) await new Promise((r) => setTimeout(r, Math.max(0, due - performance.now())));
  }
  const wallS = (performance.now() - wall0) / 1000;
  const s1 = sfx ? sfx.stats() : null;
  return { frames, wallS, gameS: frames.length / 60, sfx: s1 ? { state: s1.state, sources: s1.sources - s0.sources, maxBusy: s1.maxBusy, idle: s1.idleDrops - s0.idleDrops, dropped: s1.dropped, noBuffer: s1.noBuffer } : null };
}

const sa = await serve(process.env.A); const sb = await serve(process.env.B);
const rounds = envNum('ROUNDS', 3);
for (const c of CASES) {
  const res = { A: [], B: [] };
  let sfx = null;
  for (let r = 0; r < rounds; r++) {
    for (const side of ['A', 'B']) {
      const browser = await chromium.launch();
      const { page, ctx, errors } = await openGame(browser, side === 'A' ? sa.base : sb.base, c.q, { width: 1560, dpr: 2 });
      const out = await page.evaluate(run, { ...c, frameMs: FRAME_MS });
      res[side].push({ p50: q(out.frames, 0.5), p95: q(out.frames, 0.95), n: out.frames.length, wallS: out.wallS, gameS: out.gameS, errors: errors.length });
      if (side === 'B') sfx = { ...out.sfx, wallS: out.wallS, gameS: out.gameS };
      await ctx.close(); await browser.close();
    }
  }
  const best = (xs, k) => Math.min(...xs.map((x) => x[k]));
  const f = (xs, k) => xs.map((x) => x[k].toFixed(1)).join(' ');
  console.log(`${c.id}: フレーム（進める＋描く）ms  A p50 ${f(res.A, 'p50')} p95 ${f(res.A, 'p95')}  B p50 ${f(res.B, 'p50')} p95 ${f(res.B, 'p95')}  良い方の p95 A ${best(res.A, 'p95').toFixed(1)} B ${best(res.B, 'p95').toFixed(1)}（比 ${(best(res.B, 'p95') / best(res.A, 'p95')).toFixed(3)}）  p50 の比 ${(best(res.B, 'p50') / best(res.A, 'p50')).toFixed(3)}  エラー ${res.A.concat(res.B).reduce((a, x) => a + x.errors, 0)}`);
  if (sfx) console.log(`  B のエンジン（最後の回）: ${sfx.state}・窓 ${sfx.gameS.toFixed(1)} 秒（実時間 ${sfx.wallS.toFixed(1)} 秒）に作った音源 ${sfx.sources}＝${(sfx.sources / sfx.wallS).toFixed(1)} 個/秒（実時間）・同時の声の最大 ${sfx.maxBusy}・落とした（間隔/帯/声）${sfx.dropped.slice(1).join('/')}・標本なし ${sfx.noBuffer}`);
}
await sa.close(); await sb.close();
