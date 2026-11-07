// 空襲下の退避（v0.6.11 S5。jp_03）の HUD の画面写し（spec-v0611-r2 §13 の S5 の追加の門）: W 1280・1560 × ノーマル・ハードで、模擬の台本（POLICY 既定 seq）を世界へ写して進め、
// もう一度来る編隊の予告し直し（S3b の U7）の始まりから AFTER 秒（既定 1・予告の行と中央の帯）と、さらに BOMB 秒（既定 14・2 回目の爆撃）の 2 つの所で止め、見張りを始めから押したまま（ズーム 0.5）撮る。
// 検査: 2 行目（y 50）は ≤ 840 px で縮まず画面の内・3 行目（y 80）は W 1280 でも左上の HP の箱（x ≤ 342）と右端の技能（x ≥ W − 113.8）に触れない・どの HUD の文も画面の内・
// 地図の上の隊の番号と札は画面上 24 px 以上（論理 px）・輪の半径。写しは SHOTDIR（既定は scratchpad の外に置かない＝必ず渡す）。
// 実行: SITE=<site> SHOTDIR=<dir> [SEED=1] [POLICY=seq] [AFTER=1] [BOMB=14] [W=1280,1560] [MODES=normal,hard] node scripts/headless/evac-hud.mjs
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
const modes = (process.env.MODES ?? 'normal,hard').split(',');
let bad = 0;
const all = [];
for (const width of widths)
  for (const mode of modes)
    for (const [tag, afterS] of [['announce', envNum('AFTER', 1)], ['bomb', envNum('AFTER', 1) + envNum('BOMB', 14)]]) {
      const hard = mode === 'hard';
      const seed = envNum('SEED', 1);
      const { page, ctx, errors } = await openGame(browser, sv.base, `mission=jp_03&seed=${seed}${hard ? '&hard' : ''}`, { width, dpr: 2 });
      try {
        await page.addScriptTag({ content: code });
        const r = await page.evaluate((o) => window.__wvsEvac.hudProbe(o), { seed, hard, policy: process.env.POLICY ?? 'seq', afterS, lookS: 999, frameMs: FRAME_MS, maxSteps: 240 * 60 });
        const shot = `${dir}/evac-${tag}-${mode}-w${width}.png`;
        await page.screenshot({ path: shot });
        const W = width;
        const v = [];
        const line2 = r.hud.find((o) => Math.abs(o.y - 50) < 1 && o.ox === 0.5);
        const line3 = r.hud.find((o) => Math.abs(o.y - 80) < 1 && o.ox === 0.5);
        if (!line2 || line2.w * line2.sx > 840 + 0.5 || line2.sx !== 1) v.push(`2 行目 ${line2 ? `${(line2.w * line2.sx).toFixed(0)} px ×${line2.sx}` : 'なし'}`);
        if (!line3) v.push('3 行目なし');
        else {
          const x0 = line3.x - (line3.w * line3.sx) / 2;
          const x1 = line3.x + (line3.w * line3.sx) / 2;
          if (x0 < 342 || x1 > W - 113.8) v.push(`3 行目 ${x0.toFixed(0)}〜${x1.toFixed(0)}`);
        }
        for (const o of r.hud) {
          const x0 = o.x - o.w * o.sx * o.ox;
          if (x0 < -0.5 || x0 + o.w * o.sx > W + 0.5) v.push(`画面の外の文「${o.text}」`);
        }
        const nums = r.marks.filter((m) => !m.ring && /^[1-6×]$/.test(m.text));
        const labels = r.marks.filter((m) => !m.ring && m.text.includes('空き'));
        // 画面上の字の大きさ（字の px × 倍率 × 論理ズーム）: 隊の番号は ≥ 24 px（spec §10.4 の L4）、札は 20 px（ズームによらない）
        const minPx = Math.min(...nums.map((m) => m.px));
        const labelPx = Math.min(...labels.map((m) => m.px));
        if (!(minPx >= 24 - 0.01) || nums.length === 0) v.push(`番号の字 ${minPx.toFixed(1)} px（${nums.length} 個）`);
        if (!(labelPx >= 20 - 0.01) || labels.length === 0) v.push(`札の字 ${labelPx.toFixed(1)} px（${labels.length} 個）`);
        if (errors.length) v.push(`page errors ${errors.length}: ${errors[0]}`);
        if (v.length) bad++;
        const rings = r.marks.filter((m) => m.ring).map((m) => m.r.toFixed(0));
        console.log(`W ${W} ${mode.padEnd(6)} ${tag.padEnd(8)} t ${r.t.toFixed(1)}（予告し直し ${r.repassAtS.toFixed(1)} 秒）ズーム ${r.zoom.toFixed(3)} | 2 行目「${line2 ? line2.text : ''}」${line2 ? ` ${(line2.w * line2.sx).toFixed(0)} px` : ''}`);
        console.log(`    3 行目「${line3 ? line3.text : ''}」・番号 ${nums.map((m) => m.text).join('')}（字 ${minPx.toFixed(1)} px 以上・高さ ${Math.min(...nums.map((m) => m.h)).toFixed(1)} px）・札（${labelPx.toFixed(1)} px） ${labels.map((m) => m.text).join(' / ')}・輪の半径 px [${rings.join(',')}] → ${shot}${v.length ? ` 違反 ${v.join('; ')}` : ''}`);
        console.log(`    隊の段階 [${r.phases.join(',')}] 狙われている [${r.targeted.join(',')}] 操作中 ${r.control + 1} ・ 番号の色 ${nums.map((m) => `${m.text}${m.color}${m.bold ? '太' : ''}`).join(' ')}`);
        all.push({ W, mode, tag, ...r, shot, v });
      } finally {
        await ctx.close();
      }
    }
await browser.close();
await sv.close();
writeFileSync(`${dir}/evac-hud.json`, JSON.stringify(all, null, 1));
console.log(`shots ${all.length} bad ${bad}`);
process.exitCode = bad === 0 ? 0 : 1;
