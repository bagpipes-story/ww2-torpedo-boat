// 世界と模擬の突き合わせ（v0.6.10 S5a の G7。spec-v0610 part 2「world-vs-sim」）: ヘッドレスで jp_04 の夜を回し（偽の時計・固定ステップ 1/60 秒・台本は wvs-entry.mjs の POLICIES）、
// 自艇の入力（針路・速力・射撃ボタン）と命中スローの倍率を固定ステップごとに模擬 core/landing-sim（記録した入力の再生 core/landing-replay）へ渡して、ステップごとに状態を比べる
// （米PT の段階・位置 ≤ 1e-6 m・HP・結末・接触・斉射・揚陸の段階と被雷と出来事・敵の魚雷・卯月の見張り／照らす PT／照らされた印／手柄・乱数 seed+18・+20・+26・+27・+28 の内部の値）。
// 報告: 夜ごとに steps（比べたステップ）・diffSteps（違ったステップ）・最初の違い・卯月の数え（照らした PT・命中・撃退・撃沈・照らされた斉射・追い撃ち。撃たずに去らせたは v0.6.10 実機 1 回目に無くした）。全部 0 なら終了コード 0。
// 比べる site は今の木のビルド（模擬は束ねた時の repo の src と data）。夜明けの空襲は模擬に無いので &nostrike で回す（夜明けの後も比べる）。
// 実行: VITE_BASE=/ww2-torpedo-boat/ npm run build -- --outDir <site> の後
//   SITE=<site> [SEEDS=1-6] [POLS=lure,near,late,east,hide,home] [MODES=normal,hard] [NOALLY=1] [MAXS=200] [W=1560] [JOBS=3] [OUT=<json>] node scripts/headless/world-vs-sim.mjs
// v0.6.11 S4（jp_03。spec-v0611-r2 §12.1）: EVAC=1 は wvs-evac-entry.mjs（模擬 core/evac-sim の台本の入力を世界へ写す。台本の組は POLS（既定 seq,seq_shoot,stay）× SEEDS（既定 1-3）× MODES）。
//   夜ごとに steps・diffSteps・最初の違いと、切替・隊長艇の交代・撃墜・消火・予告し直し（2 回目の編隊）の数。SMOKE=1 は台本なしの jp_03 の煙（SECS 既定 240 ＋ 落ち着く 30 秒・ページのエラー 0）。
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRAME_MS, chromium, envNum, openGame, pool, serve } from './lib.mjs';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));

/** "1-6,9" → [1..6, 9] */
export function parseSeeds(s) {
  const out = [];
  for (const part of s.split(',')) {
    const [a, b] = part.split('-').map(Number);
    for (let i = a; i <= (b ?? a); i++) out.push(i);
  }
  return out;
}

/** wvs-entry.mjs（EVAC は wvs-evac-entry.mjs）を 1 本の IIFE に束ねる（src の TS と data の JSON ごと） */
export async function bundleEntry(entry = 'wvs-entry.mjs') {
  const esbuild = require('esbuild');
  const r = await esbuild.build({ entryPoints: [join(here, entry)], bundle: true, format: 'iife', platform: 'browser', write: false, logLevel: 'silent' });
  return r.outputFiles[0].text;
}

/** 1 夜: 開いて突き合わせる */
export async function oneNight(browser, base, code, c) {
  const q = `mission=jp_04&seed=${c.seed}&nostrike${c.hard ? '&hard' : ''}${c.allyOff ? '&noally' : ''}`;
  const { page, ctx, errors } = await openGame(browser, base, q, { width: c.width });
  try {
    await page.addScriptTag({ content: code });
    const r = await page.evaluate((o) => window.__wvs.runWorldVsSim(o), { seed: c.seed, hard: c.hard, policy: c.policy, maxSteps: Math.round(c.maxS * 60), frameMs: FRAME_MS, allyOff: c.allyOff });
    return { ...c, ...r, errors };
  } catch (e) {
    return { ...c, error: String(e && e.message ? e.message : e), errors };
  } finally {
    await ctx.close();
  }
}

/** jp_03 の 1 夜（EVAC=1）: 突き合わせか煙（c.smoke） */
export async function oneEvacNight(browser, base, code, c) {
  const q = `mission=jp_03&seed=${c.seed}${c.hard ? '&hard' : ''}`;
  const { page, ctx, errors } = await openGame(browser, base, q, { width: c.width });
  try {
    await page.addScriptTag({ content: code });
    const r = c.smoke
      ? await page.evaluate((o) => window.__wvsEvac.smokeRun(o), { secs: c.secs, frameMs: FRAME_MS })
      : await page.evaluate((o) => window.__wvsEvac.runEvacVsSim(o), { seed: c.seed, hard: c.hard, policy: c.policy, maxSteps: Math.round(c.maxS * 60), frameMs: FRAME_MS });
    return { ...c, ...r, errors };
  } catch (e) {
    return { ...c, error: String(e && e.message ? e.message : e), errors };
  } finally {
    await ctx.close();
  }
}

async function mainEvac(site) {
  const seeds = parseSeeds(process.env.SEEDS ?? '1-3');
  const pols = (process.env.POLS ?? 'seq,seq_shoot,stay').split(',');
  const modes = (process.env.MODES ?? 'normal,hard').split(',');
  const smoke = process.env.SMOKE === '1';
  const cases = [];
  for (const mode of modes) for (const seed of seeds) for (const policy of smoke ? ['-'] : pols) cases.push({ seed, hard: mode === 'hard', policy, smoke, secs: envNum('SECS', 240) + 30, maxS: envNum('MAXS', 600), width: envNum('W', 1560) });
  const code = await bundleEntry('wvs-evac-entry.mjs');
  const sv = await serve(site);
  const browser = await chromium.launch();
  const res = await pool(cases, envNum('JOBS', 3), (c) => oneEvacNight(browser, sv.base, code, c));
  await browser.close();
  await sv.close();
  let bad = 0;
  for (const r of res) {
    const tag = `${r.hard ? 'hard  ' : 'normal'} seed ${String(r.seed).padStart(2)} ${r.policy.padEnd(9)}`;
    if (r.error) { bad++; console.log(`${tag} ERROR ${r.error}${r.errors.length ? ` | page errors ${r.errors.length}: ${r.errors[0]}` : ''}`); continue; }
    if (r.smoke) {
      const ok = r.errors.length === 0 && r.settled && r.result && r.resultLines > 0;
      if (!ok) bad++;
      console.log(`${tag} smoke frames ${r.frames} t ${r.t.toFixed(1)} 残存 ${r.survivors} 決着 ${r.settled} 来た ${r.came} 着弾 ${r.impacts} 物（最大）${r.children} → Result ${r.result}（文 ${r.resultLines}）${r.errors.length ? ` | page errors ${r.errors.length}: ${r.errors[0]}` : ''}`);
      continue;
    }
    const ok = r.diffSteps === 0 && r.errors.length === 0 && !r.worldEnded;
    if (!ok) bad++;
    console.log(`${tag} steps ${r.steps} diffSteps ${r.diffSteps} 終わり ${r.simEnd}（${r.simT.toFixed(1)} 秒・残存 ${r.survivors}）${r.worldEnded ? ` 世界 ${r.worldEnded}` : ''} | 切替 ${r.switches}（自動 ${r.autoSwitches}）・交代 ${r.promotions}・撃墜 ${r.downsEvac}/${r.downs}・消火 ${r.extinguished}・予告し直し ${r.again}（2 回目 ${r.passes2} 編隊）・発 ${r.rounds}・座席に命中 ${r.seatHits}${r.errors.length ? ` | page errors ${r.errors.length}: ${r.errors[0]}` : ''}`);
    if (r.first) console.log(`    最初の違い step ${r.first.step}（${r.first.t.toFixed(2)} s）: ${JSON.stringify(r.first.fields)}`);
  }
  console.log(`nights ${res.length} bad ${bad}`);
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(res, null, 1));
  process.exitCode = bad === 0 ? 0 : 1;
}

async function main() {
  const site = process.env.SITE;
  if (!site) throw new Error('SITE=<ビルドした site のディレクトリ> が要る');
  if (process.env.EVAC === '1') return mainEvac(site);
  const seeds = parseSeeds(process.env.SEEDS ?? '1-6');
  const pols = (process.env.POLS ?? 'lure,near,late,east,hide,home').split(',');
  const modes = (process.env.MODES ?? 'normal,hard').split(',');
  const allyOff = process.env.NOALLY === '1';
  const cases = [];
  for (const mode of modes) for (const seed of seeds) cases.push({ seed, hard: mode === 'hard', policy: pols[(seed - 1) % pols.length], allyOff, maxS: envNum('MAXS', 200), width: envNum('W', 1560) });
  const code = await bundleEntry();
  const sv = await serve(site);
  const browser = await chromium.launch();
  const res = await pool(cases, envNum('JOBS', 3), (c) => oneNight(browser, sv.base, code, c));
  await browser.close();
  await sv.close();
  let bad = 0;
  for (const r of res) {
    const tag = `${r.hard ? 'hard  ' : 'normal'} seed ${String(r.seed).padStart(2)} ${r.policy.padEnd(5)}`;
    if (r.error) { bad++; console.log(`${tag} ERROR ${r.error}`); continue; }
    const a = r.ally;
    const ally = a ? `卯月 気づき ${a.spots}・照らした ${a.litPts}・弾 ${a.shells}・命中 ${a.liveHits}・撃退 ${a.retired}・撃沈 ${a.sunk}・照らされた斉射 ${a.litSalvos}・追い撃ち ${a.chaseShells}` : '卯月なし';
    const ok = r.diffSteps === 0 && r.errors.length === 0;
    if (!ok) bad++;
    console.log(`${tag} steps ${r.steps} diffSteps ${r.diffSteps} 終わり ${r.simEnd}${r.worldEnded ? `/${r.worldEnded}` : ''} 揚陸 ${r.landing} 被雷 ${r.hits} 斉射 ${r.salvos} スロー ${r.slowSteps} | ${ally}${r.errors.length ? ` | page errors ${r.errors.length}: ${r.errors[0]}` : ''}`);
    if (r.first) console.log(`    最初の違い step ${r.first.step}（${r.first.t.toFixed(2)} s）: ${JSON.stringify(r.first.fields)}`);
  }
  console.log(`nights ${res.length} bad ${bad}`);
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(res, null, 1));
  process.exitCode = bad === 0 ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
