// ヒープの見回り（v0.6.10 S5b。spec-v0610 part 2「heap over 120 s」。v0.6.9 S8 の測り方の作り直し＝その道具はコンテナの作り直しで失われた）: jp_04 を台本（wvs-entry.mjs の POLICIES。
// 既定は east・seed 4＝200 秒まで終わらない夜）で偽の時計・固定ステップのまま遊び、毎フレーム描いて（__hl.render。雷跡の点・扇・探照灯・砲弾の描画のごみも入る）、SAMPLE 秒（既定 10）ごとに
// CDP で GC してから保持されるヒープ（Runtime.getHeapUsage の usedSize）を測る。報告: 秒ごとの KB・後半（60 秒から）の増え方 KB/秒・ページのエラー。任務が先に終われば、そこまで。
// v0.6.9 の数（CHANGELOG v0.6.9 の既知の制約）: 20 秒 8,515 KB → 60 秒 8,925 → 90 秒 9,123 → 120 秒 9,190 KB（約 10 KB/秒から 2.2 KB/秒へ落ちて頭打ち）。
// v0.6.11 S7（jp_03。spec-v0611-r2 §11）: EVAC=1 は jp_03 を台本なし（スティック中立・何も押さない＝模擬の stay。POL は still だけ・束ねない）で回す（既定 SEED 1・SECS 240）。
// 実行: SITE=<site> [EVAC=1] [SEED=4] [POL=east] [HARD=1] [NOALLY=1] [SECS=120] [SAMPLE=10] [W=1560] node scripts/headless/heap.mjs
import { FRAME_MS, chromium, envNum, openGame, serve } from './lib.mjs';
import { bundleEntry } from './world-vs-sim.mjs';

/** ページの中: n フレームを台本で進めて毎フレーム描く（任務が終われば止める）。戻りは任務がまだ続くか */
function playFrames(o) {
  const hl = window.__hl;
  const pol = o.policy === 'still' ? (h) => h.steer(NaN, 0) : window.__wvs.POLICIES[o.policy];
  if (!pol) throw new Error(`台本 ${o.policy} は無い`);
  for (let i = 0; i < o.n; i++) {
    if (!hl.active('Mission')) return false;
    pol(hl, hl.world());
    hl.frame(o.frameMs);
    hl.render();
  }
  return hl.active('Mission');
}

async function main() {
  const site = process.env.SITE;
  if (!site) throw new Error('SITE=<ビルドした site のディレクトリ> が要る');
  const evac = process.env.EVAC === '1';
  const seed = envNum('SEED', evac ? 1 : 4);
  const policy = evac ? 'still' : process.env.POL ?? 'east';
  const secs = envNum('SECS', evac ? 240 : 120);
  const sample = envNum('SAMPLE', 10);
  const q = `mission=${evac ? 'jp_03' : 'jp_04'}&seed=${seed}${process.env.HARD === '1' ? '&hard' : ''}${process.env.NOALLY === '1' && !evac ? '&noally' : ''}`;
  const code = evac ? '' : await bundleEntry();
  const sv = await serve(site);
  const browser = await chromium.launch();
  const { page, ctx, errors } = await openGame(browser, sv.base, q, { width: envNum('W', 1560) });
  const out = [];
  try {
    if (code) await page.addScriptTag({ content: code });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    const measure = async (t) => {
      await cdp.send('HeapProfiler.collectGarbage');
      const { usedSize } = await cdp.send('Runtime.getHeapUsage');
      out.push({ t, kb: Math.round(usedSize / 1024) });
    };
    await measure(0);
    let alive = true;
    for (let t = sample; t <= secs && alive; t += sample) {
      alive = await page.evaluate(playFrames, { policy, n: Math.round(sample * 60), frameMs: FRAME_MS });
      await measure(t);
    }
    if (!alive) console.log(`任務が ${out.at(-1).t} 秒までに終わった`);
  } finally {
    await ctx.close();
    await browser.close();
    await sv.close();
  }
  console.log(`${q} ${policy}: ${out.map((s) => `${s.t} s ${s.kb.toLocaleString('en-US')} KB`).join(' → ')}`);
  const a = out.find((s) => s.t >= 60);
  const z = out.at(-1);
  if (a && z && z.t > a.t) console.log(`後半（${a.t}〜${z.t} 秒）の増え方 ${((z.kb - a.kb) / (z.t - a.t)).toFixed(1)} KB/秒`);
  console.log(`page errors ${errors.length}${errors.length ? `: ${errors[0]}` : ''}`);
  process.exitCode = errors.length === 0 ? 0 : 1;
}

await main();
