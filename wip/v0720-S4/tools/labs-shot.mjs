// v0.7.2 S4: 曲の試聴の場（?sfxlab）と、その「効果音の試聴へ」で開く効果音の試聴の場を、論理幅 1280・1584 で撮る（ページのエラーも数える）。
// 実行: SITE=<site> OUT=<dir> node labs-shot.mjs
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium, serve } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const OUT = process.env.OUT; mkdirSync(OUT, { recursive: true });
const sv = await serve(process.env.SITE);
const browser = await chromium.launch();
const errors = [];
/** 論理 px（高さ 720）→ 画面の px（canvas の矩形から） */
async function tapLogical(page, lx, ly) {
  const r = await page.evaluate(() => { const c = document.querySelector('canvas'); const b = c.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  const s = r.h / 720;
  await page.mouse.click(r.x + lx * s, r.y + ly * s);
}
for (const vp of [{ name: 'w1280', width: 1334, height: 750 }, { name: 'w1584', width: 1760, height: 800 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${sv.base}?sfxlab&nosw&debug`);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: join(OUT, `music-lab-${vp.name}.png`) });
  // 下の段の 2 つ目（「効果音の試聴へ」）: x = 24 + 320 + 16 = 360・幅 320、y = 720 − 24 − 84 = 612・高さ 84
  await tapLogical(page, 360 + 160, 612 + 42);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, `sound-lab-${vp.name}.png`) });
  // 魚雷の発射の行（行 2）のボタンを押す（状態の一文が「鳴らした: 魚雷の発射 F」になるか）
  const left = 24 + 236 + 16, top = 124 + 2 * (84 + 10);
  await tapLogical(page, left + 200, top + 42);
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, `sound-lab-${vp.name}-tap.png`) });
  // 「曲の試聴へ」で戻る
  await tapLogical(page, 360 + 160, 612 + 42);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, `music-lab-${vp.name}-back.png`) });
  await ctx.close();
}
await browser.close(); await sv.close();
console.log(errors.length ? `errors: ${errors.join(' | ')}` : 'errors: 0');
