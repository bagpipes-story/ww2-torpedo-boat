// HUD の A/B（v0.6.10 S5a で作り直した。spec-v0610 part 2「hud-ab」）: ab-replay.mjs と同じ台本・偽の時計・固定ステップで、ビルド A（基準）と B（今の木）の Hud の物（文・大きさ・色・
// 位置・原点・α・見えるか・倍率・深さ、絵は鍵・色・角度）を 1 秒ごとに写して比べる。16 件（ab-replay の base の組＝ほかの 7 任務とハード・seed 2 の 4 件）× SECS（既定 62）秒。
// 違えば same:false と最初に違った秒と欄。ページのエラーも数える。
// 実行: A=<site A> B=<site B> [INPUT=primary|both|none] [SECS=62] [W=1560] [JOBS=3] node scripts/headless/hud-ab.mjs
import { abCases, oneCase } from './ab-replay.mjs';
import { chromium, envNum, pool, serve } from './lib.mjs';

if (!process.env.A || !process.env.B) throw new Error('A=<基準の site> B=<今の site> が要る');
const cases = abCases('base', process.env.INPUT ?? 'primary').map((c) => ({ ...c, secs: envNum('SECS', 62), hudEvery: 60, set: 'hud' }));
const sa = await serve(process.env.A);
const sb = await serve(process.env.B);
const browser = await chromium.launch();
const res = await pool(cases, envNum('JOBS', 3), (c) => oneCase(browser, sa.base, sb.base, c));
await browser.close();
await sa.close();
await sb.close();
let bad = 0;
for (const r of res) {
  if (!r.same) bad++;
  console.log(`hud ${r.mission}${r.hard ? '&hard' : ''} seed ${r.seed} same:${r.same} snapshots ${r.frames}${r.same ? '' : ` 最初の違い ${r.at + 1} 秒 ${JSON.stringify(r.field)}`}${r.errors.length ? ` page errors ${r.errors.length}: ${r.errors[0]}` : ''}`);
}
console.log(`cases ${res.length} same ${res.length - bad} diff ${bad}`);
process.exitCode = bad === 0 ? 0 : 1;
