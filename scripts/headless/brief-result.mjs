// Briefing の本当の折り返しと Result の本文の下端（v0.6.10 S7。spec-v0610 part 2 の S7「real headless wrap within its lines at W 1280/1560」「body bottom ≤ 592」）。
// - Briefing: jp_04（ノーマル・ハード・&noally）とほかの 7 任務（ノーマル・ハード）を W 1560・1280 で開き、値の行ごとに Phaser の本当の折り返しの行の数（Text.getWrappedText）と下端、
//   史実メモの下端を出す。jp_04 の卯月のいる夜は 目的 2・成功 1・月 1・敵 1・危険 1・条件 3・史実 3 行で、史実メモの下端が出撃のボタンの上端（720 − 24 − 112 = 584）の上でなければ違反。
//   A=<site> を渡せば同じ夜の A（基準）の Briefing の文と比べ、違った行を出す（ほかの任務は同じであるはず。jp_04 は史実メモと敵の行の卯月の句だけ）。
// - Result: jp_04 を台本（wvs-entry の POLICIES）で終わるまで遊び、Result の本文の行（見出し〜最後の行。原点 (0.5, 0) で y が 50〜600）の最後の下端が 592（ボタンの上端 − 8）以下で、
//   行が前の行に重ならないかを見る。さらにその夜の材料を写して行のいちばん多い形（帰投せず・輪まで 800 m・乗員 3 名死傷・夜明けの後）に書き換えて Result を作り直し、同じ検査をする。
//   卯月の行（「卯月:」）と雷撃の行を出す。台本の秒（SECS）で終わらない夜は帰投の台本（home）に替えて終わるまで回す。SHOTDIR を渡せば jp_04 の Briefing を撮る。
// 実行: SITE=<B の site> [A=<A の site>] [SEEDS=1-6] [POLS=lure,near,late,east,hide,home] [W=1560,1280] [SECS=200] [SHOTDIR=<dir>] [TEXTS=1] [JOBS=3] node scripts/headless/brief-result.mjs
import { mkdirSync } from 'node:fs';
import { FRAME_MS, chromium, envNum, openGame, pool, serve } from './lib.mjs';
import { bundleEntry, parseSeeds } from './world-vs-sim.mjs';

const SORTIE_TOP = 720 - 24 - 112;
const BODY_MAX_Y = 592;
const OTHER = ['us_01', 'us_02', 'us_03', 'jp_01', 'jp_02', 'jp_05', 'jp_06'];
const JP04_LINES = [2, 1, 1, 1, 1, 3];

/** ページの中: Briefing を開き直して値の行を読む（ラベル・文・本当の折り返しの行の数・上端・下端） */
function readBriefing(o) {
  const g = window.__game;
  for (const k of ['Hud', 'Mission']) if (g.scene.isActive(k)) g.scene.stop(k);
  g.scene.start('Briefing', { missionId: o.mission, seed: o.seed, hard: o.hard, historical: false });
  for (let i = 0; i < 10; i++) window.__hl.frame(0);
  const s = g.scene.getScene('Briefing');
  const texts = s.children.list.filter((x) => x.type === 'Text');
  const vals = texts.filter((x) => x.style.wordWrapWidth > 0);
  return vals.map((x) => ({ text: x.text, lines: x.getWrappedText().length, top: x.y, bottom: x.y + x.displayHeight, px: x.style.fontSize }));
}

/** ページの中: 本文の行（見出しから最後の行まで）の位置 */
function bodyRows() {
  const s = window.__game.scene.getScene('Result');
  return s.children.list
    .filter((x) => x.type === 'Text' && x.originY === 0 && x.originX === 0.5 && x.y >= 50 && x.y < 600)
    .map((x) => ({ text: x.text, top: x.y, bottom: x.y + x.displayHeight, sy: x.scaleY }));
}

/** ページの中: 今の Result の材料を行のいちばん多い形に書き換えて作り直す */
function worstResult() {
  const g = window.__game;
  const s = g.scene.getScene('Result');
  const r = structuredClone(s.result); // NaN・Infinity を残す（JSON の写しは null にして Result の toFixed が落ちる）
  r.returned = false;
  r.ringDistM = 800;
  r.crewAlive = Math.max(1, r.crewTotal - 3);
  r.hpLeft = Math.max(1, r.hpLeft);
  if (r.dawn) { r.dawn.reached = true; r.dawn.caughtOutside = true; r.dawn.daylightS = Math.max(30, r.dawn.daylightS || 0); }
  g.scene.start('Result', r);
  for (let i = 0; i < 5; i++) window.__hl.frame(0);
}

function checkRows(rows) {
  let overlap = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i].top < rows[i - 1].bottom - 0.5) overlap++;
  const last = rows[rows.length - 1];
  return { n: rows.length, lastBottom: last ? last.bottom : 0, overlap, ok: overlap === 0 && (!last || last.bottom <= BODY_MAX_Y + 0.01) };
}

async function briefingCase(browser, base, c) {
  const q = `mission=${c.mission}&seed=${c.seed}${c.hard ? '&hard' : ''}${c.noally ? '&noally' : ''}`;
  const { page, ctx, errors } = await openGame(browser, base, q, { width: c.width });
  try {
    const rows = await page.evaluate(readBriefing, { mission: c.mission, seed: c.seed, hard: c.hard });
    if (c.shotDir) {
      await page.evaluate(() => window.__hl.render());
      await page.screenshot({ path: `${c.shotDir}/briefing-${c.mission}${c.hard ? '-hard' : ''}${c.noally ? '-noally' : ''}-w${c.width}${c.tagA ?? ''}.png` });
    }
    return { rows, errors };
  } finally {
    await ctx.close();
  }
}

async function resultCase(browser, base, code, c) {
  const q = `mission=jp_04&seed=${c.seed}${c.hard ? '&hard' : ''}`;
  const { page, ctx, errors } = await openGame(browser, base, q, { width: c.width });
  try {
    await page.addScriptTag({ content: code });
    let r;
    do r = await page.evaluate((o) => window.__wvs.probeRun(o), { policy: c.policy, maxSteps: Math.round(c.secs * 60), frameMs: FRAME_MS, shots: [], forceSink: false });
    while (!r.done);
    // 台本の秒で終わらない夜（hide・east は輪へ帰らない）は帰投の台本に替えて終わるまで（probeRun の歩数は夜を通して数える）
    if (r.reason === 'maxSteps') {
      do r = await page.evaluate((o) => window.__wvs.probeRun(o), { policy: 'home', maxSteps: Math.round(2 * c.secs * 60), frameMs: FRAME_MS, shots: [], forceSink: false });
      while (!r.done);
    }
    // 自艇の沈む絵（tween）は Phaser の TweenManager が壁の時計（Date.now）で進めるので、偽の時計の歩数だけでは終わらない。壁の時計で最大 60 秒、フレームを回しながら待つ
    let ok = false;
    for (let k = 0; k < 600 && !ok; k++) {
      ok = await page.evaluate((ms) => {
        for (let i = 0; i < 30 && !window.__hl.active('Result'); i++) { if (window.__hl.active('Mission')) window.__hl.steer(NaN, 0); window.__hl.frame(ms); }
        if (!window.__hl.active('Result')) return false;
        for (let i = 0; i < 5; i++) window.__hl.frame(ms);
        return true;
      }, FRAME_MS);
      if (!ok) await page.waitForTimeout(100);
    }
    if (!ok) return { error: 'Result が出ない', errors };
    const real = await page.evaluate(bodyRows);
    await page.evaluate(worstResult);
    const worst = await page.evaluate(bodyRows);
    return { real, worst, errors };
  } finally {
    await ctx.close();
  }
}

async function main() {
  const siteB = process.env.SITE;
  if (!siteB) throw new Error('SITE=<ビルドした site> が要る');
  const siteA = process.env.A ?? '';
  const widths = (process.env.W ?? '1560,1280').split(',').map(Number);
  const seeds = parseSeeds(process.env.SEEDS ?? '1-6');
  const pols = (process.env.POLS ?? 'lure,near,late,east,hide,home').split(',');
  const sB = await serve(siteB);
  const sA = siteA ? await serve(siteA) : null;
  const browser = await chromium.launch();
  let bad = 0;
  let errs = 0;
  // Briefing
  const bc = [];
  for (const width of widths) for (const hard of [false, true]) {
    bc.push({ mission: 'jp_04', hard, seed: 1, width, noally: false });
    bc.push({ mission: 'jp_04', hard, seed: 1, width, noally: true });
    for (const m of OTHER) bc.push({ mission: m, hard, seed: 1, width, noally: false });
  }
  const shotDir = process.env.SHOTDIR ?? '';
  if (shotDir) mkdirSync(shotDir, { recursive: true });
  const bres = await pool(bc, envNum('JOBS', 3), async (c) => ({ c, b: await briefingCase(browser, sB.base, { ...c, shotDir: c.mission === 'jp_04' ? shotDir : '' }), a: sA && !c.noally ? await briefingCase(browser, sA.base, c) : null }));
  for (const { c, b, a } of bres) {
    errs += b.errors.length + (a ? a.errors.length : 0);
    const tag = `Briefing W ${c.width} ${c.mission}${c.hard ? '&hard' : ''}${c.noally ? '&noally' : ''}`;
    const lines = b.rows.map((r) => r.lines);
    const note = b.rows[b.rows.length - 1];
    let v = '';
    if (c.mission === 'jp_04' && !c.noally && JSON.stringify(lines.slice(0, 6)) !== JSON.stringify(JP04_LINES)) v += ' 行の数が違う';
    if (c.mission === 'jp_04' && note.lines !== 3) v += ' 史実が 3 行でない';
    if (note.bottom > SORTIE_TOP) v += ` 史実の下端 ${note.bottom.toFixed(1)} > ${SORTIE_TOP}`;
    if (v) bad++;
    const diff = a ? b.rows.map((r, i) => (a.rows[i] && a.rows[i].text === r.text ? null : i)).filter((i) => i !== null) : [];
    console.log(`${tag} 行 [${lines.join(',')}] 史実の下端 ${note.bottom.toFixed(1)}（ボタン ${SORTIE_TOP}）${a ? ` A と違う行 [${diff.join(',')}]` : ''}${v ? ` 違反${v}` : ''} | page errors ${b.errors.length}`);
    if (process.env.TEXTS === '1' || (a && diff.length > 0 && c.width === widths[0])) for (const i of diff) console.log(`    B「${b.rows[i].text.replace(/\n/g, '⏎')}」\n    A「${a.rows[i] ? a.rows[i].text.replace(/\n/g, '⏎') : '(なし)'}」`);
  }
  // Result
  const code = await bundleEntry();
  const rc = [];
  for (const width of widths) for (const hard of [false, true]) for (const seed of seeds) rc.push({ width, hard, seed, policy: pols[(seed - 1) % pols.length], secs: envNum('SECS', 200) });
  const rres = await pool(rc, envNum('JOBS', 3), async (c) => ({ c, r: await resultCase(browser, sB.base, code, c) }));
  let maxB = 0;
  let maxW = 0;
  for (const { c, r } of rres) {
    const tag = `Result W ${c.width} ${c.hard ? 'hard  ' : 'normal'} seed ${String(c.seed).padStart(2)} ${c.policy.padEnd(5)}`;
    errs += r.errors.length;
    if (r.error) { bad++; console.log(`${tag} ERROR ${r.error}`); continue; }
    const a = checkRows(r.real);
    const w = checkRows(r.worst);
    maxB = Math.max(maxB, a.lastBottom);
    maxW = Math.max(maxW, w.lastBottom);
    if (!a.ok || !w.ok) bad++;
    const ally = r.real.find((x) => x.text.startsWith('卯月:'));
    const log = r.real.find((x) => x.text.startsWith('雷撃:'));
    console.log(`${tag} 行 ${a.n} 下端 ${a.lastBottom.toFixed(1)} 重なり ${a.overlap} | 多い形 ${w.n} 行 下端 ${w.lastBottom.toFixed(1)} 重なり ${w.overlap} | page errors ${r.errors.length}`);
    console.log(`    ${log ? log.text : '(雷撃の行なし)'}\n    ${ally ? ally.text : '(卯月の行なし)'}`);
  }
  await browser.close();
  await sB.close();
  if (sA) await sA.close();
  console.log(`Briefing ${bres.length} 件・Result ${rres.length} 夜（多い形も）: 本文の下端の最大 ${maxB.toFixed(1)}・多い形 ${maxW.toFixed(1)}（上限 ${BODY_MAX_Y}）・page errors ${errs}・違反 ${bad}`);
  process.exitCode = errs === 0 && bad === 0 ? 0 : 1;
}

await main();
