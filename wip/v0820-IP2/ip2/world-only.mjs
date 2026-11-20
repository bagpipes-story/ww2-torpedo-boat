// ab-replay の台本で A・B を回し、HUD の文を除いた世界の写しの最初の違いを出す（IP2 の確かめ。リポジトリに入れない）。CASES='set:mission:hard:seed,...'
import { abCases, abRun, firstField, query } from '/home/user/ww2-torpedo-boat/scripts/headless/ab-replay.mjs';
import { chromium, openGame, serve, FRAME_MS } from '/home/user/ww2-torpedo-boat/scripts/headless/lib.mjs';
const sa = await serve(process.env.A), sb = await serve(process.env.B), browser = await chromium.launch();
const want = process.env.CASES.split(',').map((s) => s.split(':'));
const all = [...new Set(want.map((w) => w[0]))].flatMap((s) => abCases(s, 'primary'));
for (const [set, m, h, seed] of want) {
  const c = all.find((x) => x.set === set && x.mission === m && x.hard === (h === '1') && x.seed === Number(seed));
  const pa = await openGame(browser, sa.base, query(c, 'A'), { width: 1560 }), pb = await openGame(browser, sb.base, query(c, 'B'), { width: 1560 });
  const o = { ...c, frameMs: FRAME_MS, hudEvery: 0 };
  await Promise.all([pa.page.evaluate(abRun, o), pb.page.evaluate(abRun, o)]);
  const fa = await pa.page.evaluate(() => window.__ab), fb = await pb.page.evaluate(() => window.__ab);
  const strip = (s) => { const j = JSON.parse(s); if (j && typeof j === 'object' && !Array.isArray(j)) delete j.hud; return JSON.stringify(j); };
  let at = -1, hudDiff = 0;
  for (let i = 0; i < Math.min(fa.length, fb.length); i++) { if (fa[i] !== fb[i]) hudDiff++; if (at < 0 && strip(fa[i]) !== strip(fb[i])) at = i; }
  const texts = new Set(); for (let i = 0; i < Math.min(fa.length, fb.length); i++) if (fa[i] !== fb[i]) { const A = JSON.parse(fa[i]).hud ?? [], B = JSON.parse(fb[i]).hud ?? []; for (const t of B) if (!A.includes(t)) texts.add('B+ ' + t.replace(/\d+/g, 'N')); for (const t of A) if (!B.includes(t)) texts.add('A+ ' + t.replace(/\d+/g, 'N')); }
  console.log(`${set} ${m}${h === '1' ? '&hard' : ''} seed ${seed}: frames ${fa.length}/${fb.length} 文の違うフレーム ${hudDiff} 世界の最初の違い ${at < 0 ? 'なし' : `frame ${at} ${JSON.stringify(firstField(strip(fa[at]), strip(fb[at])))}`} 違った文 ${[...texts].join(' | ')}`);
  await pa.ctx.close(); await pb.ctx.close();
}
await browser.close(); await sa.close(); await sb.close();
