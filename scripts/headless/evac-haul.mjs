// 空襲下の退避（v0.6.11 IP1 の U9・U10。jp_03）のレールの画面写し: W 1280・1560 × 既定のズーム（0.75）・見張り（0.5）で、模擬の台本（POLICY 既定 seq）を世界へ写して進め、
// 操作中の隊が壕で上げている（2 隻目のレールの上・PCT% 以上）所で止めて撮る。検査: レールの下の % の札（「2隻目 45%」）が画面の内で、画面上の字が 20 px 以上・2 行目に % が入る・ページのエラー 0。
// 実行: SITE=<site> SHOTDIR=<dir> [SEED=1] [POLICY=seq] [UP=0] [PCT=40] [W=1280,1560] [MODES=normal] node scripts/headless/evac-haul.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { FRAME_MS, chromium, envNum, openGame, serve } from './lib.mjs';
import { bundleEntry } from './world-vs-sim.mjs';

const site = process.env.SITE;
const dir = process.env.SHOTDIR;
if (!site || !dir) throw new Error('SITE=<site> SHOTDIR=<dir> が要る');
mkdirSync(dir, { recursive: true });
const code = await bundleEntry('wvs-evac-entry.mjs');
const sv = await serve(site);
const browser = await chromium.launch();
const widths = (process.env.W ?? '1280,1560').split(',').map(Number);
const modes = (process.env.MODES ?? 'normal').split(',');
let bad = 0;
const all = [];
for (const width of widths)
  for (const mode of modes)
    for (const [tag, lookS] of [['zoom', 0], ['lookout', 999]]) {
      const hard = mode === 'hard';
      const seed = envNum('SEED', 1);
      const { page, ctx, errors } = await openGame(browser, sv.base, `mission=jp_03&seed=${seed}${hard ? '&hard' : ''}`, { width, dpr: 2 });
      try {
        await page.addScriptTag({ content: code });
        const r = await page.evaluate((o) => window.__wvsEvac.haulProbe(o), { seed, hard, policy: process.env.POLICY ?? 'seq', up: envNum('UP', 0), pct: envNum('PCT', 40), lookS, frameMs: FRAME_MS, maxSteps: 240 * 60 });
        const shot = `${dir}/evac-haul-${tag}-${mode}-w${width}.png`;
        await page.screenshot({ path: shot });
        const v = [];
        const H = 720;
        const pctMarks = r.marks.filter((m) => /隻目 \d+%/.test(m.text));
        if (pctMarks.length === 0) v.push('% の札なし');
        for (const m of pctMarks) {
          if (m.px < 20 - 0.01) v.push(`札の字 ${m.px.toFixed(1)} px`);
          if (m.sx - m.w / 2 < 0 || m.sx + m.w / 2 > width || m.sy < 0 || m.sy + m.h > H) v.push(`札「${m.text}」が画面の外（${m.sx.toFixed(0)}, ${m.sy.toFixed(0)}）`);
        }
        const line2 = r.hud.find((o) => Math.abs(o.y - 50) < 1 && o.ox === 0.5);
        if (!line2 || !/\d+%/.test(line2.text)) v.push(`2 行目に % なし「${line2 ? line2.text : ''}」`);
        if (errors.length) v.push(`page errors ${errors.length}: ${errors[0]}`);
        if (v.length) bad++;
        console.log(`W ${width} ${mode} ${tag.padEnd(7)} t ${r.t.toFixed(1)} ズーム ${r.zoom.toFixed(3)} 隊 ${r.control + 1} 壕 ${r.shelter} 上げ済 ${r.upCount} ${r.haulPct}% | 札 ${pctMarks.map((m) => `「${m.text}」${m.px.toFixed(1)}px@${m.sx.toFixed(0)},${m.sy.toFixed(0)}`).join(' ')} | 2 行目「${line2 ? line2.text : ''}」 → ${shot}${v.length ? ` 違反 ${v.join('; ')}` : ''}`);
        all.push({ width, mode, tag, ...r, shot, v });
      } finally {
        await ctx.close();
      }
    }
await browser.close();
await sv.close();
writeFileSync(`${dir}/evac-haul.json`, JSON.stringify(all, null, 1));
console.log(`shots ${all.length} bad ${bad}`);
process.exitCode = bad === 0 ? 0 : 1;
