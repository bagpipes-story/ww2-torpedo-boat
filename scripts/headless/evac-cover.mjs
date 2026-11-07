// 空襲下の退避（v0.6.11 IP2 の U11。jp_03）の陰「屋我地の陰（東）」の画面写し: W 1280・1560 × 既定のズーム（0.75）・見張り（0.5）× 陰へ向かう途中（空の陰）・隠れている・見つかった。
// 検査はページのエラー 0 だけ（絵の読みやすさは写しを開いて見る）。
// 実行: SITE=<site> SHOTDIR=<dir> [SEED=1] [POLICY=seq_cover] [AT=approach,hidden,found] [W=1280,1560] [MODES=normal] node scripts/headless/evac-cover.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { FRAME_MS, chromium, envNum, openGame, serve } from './lib.mjs';
import { bundleEntry } from './world-vs-sim.mjs';

const site = process.env.SITE;
const dir = process.env.SHOTDIR;
if (!site || !dir) throw new Error('SITE=<site> SHOTDIR=<dir> が要る');
mkdirSync(dir, { recursive: true });
const code = await bundleEntry('evac-cover-entry.mjs');
const sv = await serve(site);
const browser = await chromium.launch();
const widths = (process.env.W ?? '1280,1560').split(',').map(Number);
const modes = (process.env.MODES ?? 'normal').split(',');
const ats = (process.env.AT ?? 'approach,hidden,found').split(',');
let bad = 0;
const all = [];
for (const width of widths)
  for (const mode of modes)
    for (const at of ats)
      for (const [tag, lookS] of [['zoom', 0], ['lookout', 999]]) {
        const hard = mode === 'hard';
        const seed = envNum(at === 'found' ? 'FSEED' : 'SEED', at === 'found' ? 2 : 1);
        const { page, ctx, errors } = await openGame(browser, sv.base, `mission=jp_03&seed=${seed}${hard ? '&hard' : ''}`, { width, dpr: 2 });
        const shot = `${dir}/evac-cover-${at}-${tag}-${mode}-w${width}.png`;
        try {
          await page.addScriptTag({ content: code });
          const r = await page.evaluate((o) => window.__evCover.coverProbe(o), { seed, hard, policy: process.env.POLICY ?? 'seq_cover', at, near: envNum('NEAR', 260), holdS: at === 'hidden' ? 2 : 0.5, lookS, frameMs: FRAME_MS, maxSteps: 240 * 60 });
          await page.screenshot({ path: shot });
          const v = errors.length ? [`page errors ${errors.length}: ${errors[0]}`] : [];
          if (v.length) bad++;
          console.log(`W ${width} ${mode} ${at} ${tag.padEnd(7)} seed ${seed} t ${r.t.toFixed(1)} ズーム ${r.zoom.toFixed(3)} 隊 ${r.control + 1} 段 ${r.phases.join('')} 物 ${r.objs} → ${shot}${v.length ? ` 違反 ${v.join('; ')}` : ''}`);
          all.push({ width, mode, at, tag, seed, ...r, shot, v });
        } catch (e) {
          bad++;
          console.log(`W ${width} ${mode} ${at} ${tag} seed ${seed} 失敗 ${e && e.message ? e.message.split('\n')[0] : e}`);
        } finally {
          await ctx.close();
        }
      }
await browser.close();
await sv.close();
writeFileSync(`${dir}/evac-cover.json`, JSON.stringify(all, null, 1));
console.log(`shots ${all.length} bad ${bad}`);
process.exitCode = bad === 0 ? 0 : 1;
