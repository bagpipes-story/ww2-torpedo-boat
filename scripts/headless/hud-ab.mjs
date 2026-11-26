// HUD の A/B（v0.6.10 S5a で作り直した。spec-v0610 part 2「hud-ab」）: ab-replay.mjs と同じ台本・偽の時計・固定ステップで、ビルド A（基準）と B（今の木）の Hud の物（文・大きさ・色・
// 位置・原点・α・見えるか・倍率・深さ、絵は鍵・色・角度）を 1 秒ごとに写して比べる。16 件（ab-replay の base の組＝ほかの 7 任務とハード・seed 2 の 4 件）× SECS（既定 62）秒。
// 違えば same:false と最初に違った秒と欄。ページのエラーも数える。
// v0.6.10 S5b: SET=jp04 で ab-replay の jp04 の組（jp_04 の B は &noally・ノーマルとハード × seed 1〜4＝G6w）。既定は base。
// v0.6.11 S6: SET=jp03 で ab-replay の jp03 の組（jp_03 のノーマル・ハード × seed 1・2。既定の秒は 260＝決着の後まで。A は S5 の ae6af75）。
// v0.6.11 S8: SET=jp04base で jp_04（卯月あり）を 88c9f19 と（ab-replay の jp04base の組。秒は 170）。
// v0.8.0 S2: SET=us04 で us_04（ab-replay の us04 の組。秒は 260＝夜明けまで）。NORADAR=1 で B だけ &noradar（レーダーが HUD を変えない証。S4 からはレーダーの文を除いて比べる）。
// v0.8.0 S4（brief L33）: RADARUI=1・NORADAR=1 は ab-replay の S4 の濾し（S4_FILTER）で比べる（2 行目の S4 の行のスナップの数を masked に出す）。FILTERTEST=1 は濾しの試し（違いが出るはず）。
// v0.8.1 S2: SET=us06 で us_06（ab-replay の us06 の組。秒は 200＝夜明けまで。S2 は A＝B＝今の木・S3 から A は S2 の commit のビルド）。
// v0.8.1 S4（brief L69）: ANCHORUI=1 は us_06 の S4 の新しい文だけを比べから外す濾し（scripts/headless/anchor-filter。A は S3 の commit のビルド・B は今の木。tests/anchor-ab-filter が固定）。
// v0.8.2 S2: SET=us05 で us_05（ab-replay の us05 の組。秒は 270＝夜明けまで。S2 は A＝B＝今の木・S2b から A は S2 の commit のビルド）。
// v0.8.5 S2: SET=us07 で us_07（ab-replay の us07 の組。秒は 320＝救助の時間の後まで。S2 は A＝B＝今の木・S2 の後は A を S2 の commit のビルド）。
// v0.8.2 S4（lead の L48）: RECONUI=1 は us_05 の S4 の新しい文と中継の端の印だけを比べから外す濾し（scripts/headless/recon-filter。A は S3 の commit のビルド）。
// v0.8.3: CTRLUI（既定 1）は ab-replay と同じ（「静音」「倍速」の丸と字を両方の側で除く。行に除いた数 ctrl A n B m）。
// 実行: A=<site A> B=<site B> [CTRLUI=0] [SET=base|jp04|jp04base|jp03|us04|us06|us05|us07] [NORADAR=1] [RADARUI=1] [ANCHORUI=1] [RECONUI=1] [FILTERTEST=1] [INPUT=primary|both|none] [SECS=62] [W=1560] [JOBS=3] node scripts/headless/hud-ab.mjs
import { abCases, oneCase } from './ab-replay.mjs';
import { chromium, envNum, pool, serve } from './lib.mjs';

if (!process.env.A || !process.env.B) throw new Error('A=<基準の site> B=<今の site> が要る');
const cases = abCases(process.env.SET ?? 'base', process.env.INPUT ?? 'primary').map((c) => ({ ...c, secs: envNum('SECS', c.set === 'jp03' || c.set === 'us04' ? 260 : c.set === 'us05' ? 270 : c.set === 'us07' ? 320 : c.set === 'us06' ? 200 : c.set === 'jp04base' ? 170 : 62), hudEvery: 60, set: 'hud' }));
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
  console.log(`hud ${r.mission}${r.hard ? '&hard' : ''} seed ${r.seed}${r.noally ? ' B&noally' : ''}${r.noradar ? ' B&noradar' : ''}${r.noplane ? ' B&noplane' : ''}${r.radarui ? ' RADARUI' : ''}${r.anchorui ? ' ANCHORUI' : ''}${r.reconui ? ' RECONUI' : ''}${r.filtertest ? ' FILTERTEST' : ''}${r.masked !== undefined ? ` masked ${r.masked}` : ''}${r.ctrl ? ` ctrl A ${r.ctrl[0]} B ${r.ctrl[1]}` : ''} same:${r.same} snapshots ${r.frames}${r.same ? '' : ` 最初の違い ${r.at + 1} 秒 ${JSON.stringify(r.field)}`}${r.errors.length ? ` page errors ${r.errors.length}: ${r.errors[0]}` : ''}`);
}
console.log(`cases ${res.length} same ${res.length - bad} diff ${bad}`);
process.exitCode = bad === 0 ? 0 : 1;
