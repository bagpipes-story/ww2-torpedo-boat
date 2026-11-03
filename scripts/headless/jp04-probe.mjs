// jp_04 のヘッドレスの見回り（v0.6.10 S5a で作り直した。spec-v0610 part 2「jp04-probe」）: jp_04 を簡単な台本（wvs-entry.mjs の POLICIES: lure・near・late・east・hide・home）で
// 偽の時計・固定ステップのまま遊び、選んだ出来事（卯月が気づく・探照灯・砲・撃たずに去らせた・卯月の命中・斉射・揚陸の決着・夜明け）の最初の瞬間に描いて撮る（カメラは自艇を追う。
// 描くのは delta 0 のフレームだけ＝世界は進まない）。報告: 夜ごとのページのエラー・2 行目のいちばん広い文の幅 px と文・出来事の秒・撮った画像。エラーが 1 つでもあれば終了コード 1。
// v0.6.10 S5b: フレームごとの絵の検査（wvs-entry の visualChecks: 照らされた PT は視程の外でも見える・照らしていない PT は見えない・撃退は灰色・沈んだ PT は沈み込みの tween・
// 卯月が沈めた PT は命中スロー）。違反が 1 つでもあれば終了コード 1。SINK=1 は道具だけの細工（卯月の 12 cm の 1 命中を必ず撃沈に）で、卯月が沈めた PT の絵の道を通す（門には使わない）。
// v0.6.10 S6: 2 行目の最長は縮める前の幅（Text.width）で、WMAX（既定 840）を超えたら終了コード 1。卯月の文（「卯月」「帰投の輪で」を含む 2 行目）を夜ごとに出た順に出す（TEXTS=1）・
// 出来事 ringCall・allyLine（SHOTS にも使える）。
// 実行: SITE=<site> [SEEDS=1-4] [POLS=lure,near,late,east] [MODES=normal,hard] [W=1560,1280] [SECS=200] [SHOTS=beam,shot,litAway,hit,sunkPt,ringCall,allyLine] [SHOTDIR=<dir>] [NOALLY=1] [SINK=1]
//   [WMAX=840] [TEXTS=1] [JOBS=3]
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
      r = await page.evaluate((o) => window.__wvs.probeRun(o), { policy: c.policy, maxSteps: Math.round(c.secs * 60), frameMs: FRAME_MS, shots: c.shots, forceSink: c.forceSink });
      if (r.done) break;
      if (c.shotDir) {
        await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__hl.render(); }, RENDER_FRAMES);
        const file = join(c.shotDir, `jp04-${c.hard ? 'hard' : 'normal'}-s${c.seed}-${c.policy}-w${c.width}-${r.reason}.png`);
        await page.screenshot({ path: file });
        shots.push(file);
      }
    }
    return { ...c, events: r.p.events, widest: r.p.widest, allyTexts: r.p.allyTexts, steps: r.p.steps, reason: r.reason, ck: r.p.ck, shots, errors };
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
    cases.push({ seed, hard: mode === 'hard', policy: pols[(seed - 1) % pols.length], width, secs: envNum('SECS', 200), shots, shotDir, noally: process.env.NOALLY === '1', forceSink: process.env.SINK === '1' });
  }
  const code = await bundleEntry();
  const sv = await serve(site);
  const browser = await chromium.launch();
  const res = await pool(cases, envNum('JOBS', 3), (c) => oneNight(browser, sv.base, code, c));
  await browser.close();
  await sv.close();
  let errs = 0;
  let bad = 0;
  const tot = { litFar: 0, litFarHidden: 0, unlitFarShown: 0, notGrey: 0, sinkNoTween: 0, allySinks: 0, allySinkNoSlow: 0, retiredN: 0, allyRetiredN: 0, sunkN: 0 };
  let widest = { w: 0, text: '' };
  for (const r of res) {
    const tag = `W ${r.width} ${r.hard ? 'hard  ' : 'normal'} seed ${String(r.seed).padStart(2)} ${r.policy.padEnd(5)}`;
    if (r.error) { errs++; console.log(`${tag} ERROR ${r.error}`); continue; }
    errs += r.errors.length;
    if (r.widest.w > widest.w) widest = r.widest;
    for (const k of Object.keys(tot)) tot[k] += r.ck[k];
    bad += r.ck.litFarHidden + r.ck.unlitFarShown + r.ck.notGrey + r.ck.sinkNoTween + r.ck.allySinkNoSlow;
    const ev = Object.entries(r.events).map(([k, v]) => `${k} ${v.toFixed(1)}`).join('・');
    const ck = `照らされ遠く ${r.ck.litFar}（隠れ ${r.ck.litFarHidden}）・照らさず遠く見えた ${r.ck.unlitFarShown}・撃退 ${r.ck.retiredN}（卯月 ${r.ck.allyRetiredN}。灰色でない ${r.ck.notGrey}）・沈んだ ${r.ck.sunkN}（沈む絵なし ${r.ck.sinkNoTween}）・卯月の撃沈 ${r.ck.allySinks}（スローなし ${r.ck.allySinkNoSlow}）`;
    if (process.env.TEXTS === '1') for (const s of r.allyTexts) console.log(`  ${tag} 卯月の文「${s}」`);
    console.log(`${tag} 終わり ${r.reason} ${(r.steps / 60).toFixed(1)} s | page errors ${r.errors.length}${r.errors.length ? `（${r.errors[0]}）` : ''} | 2 行目の最長 ${Math.round(r.widest.w)} px | ${ev} | ${ck}${r.shots.length ? ` | 撮った ${r.shots.length}` : ''}`);
  }
  const wmax = envNum('WMAX', 840);
  const allTexts = [...new Set(res.flatMap((r) => r.allyTexts ?? []))];
  console.log(`nights ${res.length} page errors ${errs} 2 行目の最長 ${Math.round(widest.w)} px「${widest.text}」（上限 ${wmax}）・卯月の文 ${allTexts.length} 種`);
  if (widest.w > wmax) bad++;
  console.log(`絵の検査（S5b）: 照らされ遠く ${tot.litFar} フレーム（隠れ ${tot.litFarHidden}）・照らさず遠く見えた ${tot.unlitFarShown}・撃退 ${tot.retiredN} 隻（卯月 ${tot.allyRetiredN}。灰色でない ${tot.notGrey} フレーム）・沈んだ ${tot.sunkN} 隻（沈む絵なし ${tot.sinkNoTween}）・卯月の撃沈 ${tot.allySinks}（スローなし ${tot.allySinkNoSlow}）・違反 ${bad}`);
  process.exitCode = errs === 0 && bad === 0 ? 0 : 1;
}

await main();
