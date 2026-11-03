// jp_04 のヘッドレスの見回り（v0.6.10 S5a で作り直した。spec-v0610 part 2「jp04-probe」）: jp_04 を簡単な台本（wvs-entry.mjs の POLICIES: lure・near・late・east・hide・home）で
// 偽の時計・固定ステップのまま遊び、選んだ出来事（卯月が気づく・探照灯・砲・撃たずに去らせた・卯月の命中・斉射・揚陸の決着・夜明け）の最初の瞬間に描いて撮る（カメラは自艇を追う。
// 描くのは delta 0 のフレームだけ＝世界は進まない）。報告: 夜ごとのページのエラー・2 行目のいちばん広い文の幅 px と文・出来事の秒・撮った画像。エラーが 1 つでもあれば終了コード 1。
// 実行: SITE=<site> [SEEDS=1-4] [POLS=lure,near,late,east] [MODES=normal,hard] [W=1560,1280] [SECS=200] [SHOTS=beam,shot,litAway,hit] [SHOTDIR=<dir>] [NOALLY=1] [JOBS=3]
//   node scripts/headless/jp04-probe.mjs
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { FRAME_MS, chromium, envNum, openGame, pool, serve } from './lib.mjs';
import { bundleEntry, parseSeeds } from './world-vs-sim.mjs';

/** 描くだけのフレーム（カメラの追従の補間が寄るまで） */
const RENDER_FRAMES = 45;

async function oneNight(browser, base, code, c) {
  const q = `mission=jp_04&seed=${c.seed}${c.hard ? '&hard' : ''}${c.noally ? '&noally' : ''}`;
  const { page, ctx, errors } = await openGame(browser, base, q, { width: c.width });
  const shots = [];
  try {
    await page.addScriptTag({ content: code });
    let r;
    for (;;) {
      r = await page.evaluate((o) => window.__wvs.probeRun(o), { policy: c.policy, maxSteps: Math.round(c.secs * 60), frameMs: FRAME_MS, shots: c.shots });
      if (r.done) break;
      if (c.shotDir) {
        await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__hl.render(); }, RENDER_FRAMES);
        const file = join(c.shotDir, `jp04-${c.hard ? 'hard' : 'normal'}-s${c.seed}-${c.policy}-w${c.width}-${r.reason}.png`);
        await page.screenshot({ path: file });
        shots.push(file);
      }
    }
    return { ...c, events: r.p.events, widest: r.p.widest, steps: r.p.steps, reason: r.reason, shots, errors };
  } catch (e) {
    return { ...c, error: String(e && e.message ? e.message : e), shots, errors };
  } finally {
    await ctx.close();
  }
}

async function main() {
  const site = process.env.SITE;
  if (!site) throw new Error('SITE=<ビルドした site のディレクトリ> が要る');
  const shotDir = process.env.SHOTDIR ?? '';
  if (shotDir) mkdirSync(shotDir, { recursive: true });
  const seeds = parseSeeds(process.env.SEEDS ?? '1-4');
  const pols = (process.env.POLS ?? 'lure,near,late,east').split(',');
  const modes = (process.env.MODES ?? 'normal,hard').split(',');
  const widths = (process.env.W ?? '1560,1280').split(',').map(Number);
  const shots = (process.env.SHOTS ?? '').split(',').filter((s) => s !== '');
  const cases = [];
  for (const width of widths) for (const mode of modes) for (const seed of seeds) {
    cases.push({ seed, hard: mode === 'hard', policy: pols[(seed - 1) % pols.length], width, secs: envNum('SECS', 200), shots, shotDir, noally: process.env.NOALLY === '1' });
  }
  const code = await bundleEntry();
  const sv = await serve(site);
  const browser = await chromium.launch();
  const res = await pool(cases, envNum('JOBS', 3), (c) => oneNight(browser, sv.base, code, c));
  await browser.close();
  await sv.close();
  let errs = 0;
  let widest = { w: 0, text: '' };
  for (const r of res) {
    const tag = `W ${r.width} ${r.hard ? 'hard  ' : 'normal'} seed ${String(r.seed).padStart(2)} ${r.policy.padEnd(5)}`;
    if (r.error) { errs++; console.log(`${tag} ERROR ${r.error}`); continue; }
    errs += r.errors.length;
    if (r.widest.w > widest.w) widest = r.widest;
    const ev = Object.entries(r.events).map(([k, v]) => `${k} ${v.toFixed(1)}`).join('・');
    console.log(`${tag} 終わり ${r.reason} ${(r.steps / 60).toFixed(1)} s | page errors ${r.errors.length}${r.errors.length ? `（${r.errors[0]}）` : ''} | 2 行目の最長 ${Math.round(r.widest.w)} px | ${ev}${r.shots.length ? ` | 撮った ${r.shots.length}` : ''}`);
  }
  console.log(`nights ${res.length} page errors ${errs} 2 行目の最長 ${Math.round(widest.w)} px「${widest.text}」`);
  process.exitCode = errs === 0 ? 0 : 1;
}

await main();
