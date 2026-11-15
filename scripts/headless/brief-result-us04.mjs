// brief-result.mjs の US04=1（v0.8.0 S5。lead の L63）: us_04（ブラケット海峡の夜）の Briefing の本当の折り返しと Result の本文の下端。brief-result.mjs から呼ぶ
// （ページの中の読み口・下端の検査・道具は引数 h で受け取る＝同じ物を 2 つ書かない。brief-result.mjs は 300 行の内に収める）。
// - Briefing: ノーマル・ハード × W で値の行ごとの Phaser の本当の折り返しの行の数（Text.getWrappedText）と下端、史実メモの下端（≤ 出撃のボタンの上端 584 − 8）。
//   行の数は 目的 2・成功 1・月 2・敵 1・危険 1・条件 2・史実 3（tests/briefing の見積もりと同じ）。目的は S5 で隻数を外した文（L57）。
// - Result: ノーマル・ハード × W で 1 夜を台本で終わるまで回し（止まったまま、30 秒に目で見えない海へ 1 本撃ち、32 秒から輪の中へ置いて帰投＝魚雷の決着を待つ。
//   S4 の画面写しの台本）、本文の行の最後の下端 ≤ 592（ボタンの上端 − 8）・行が重ならない。行のいちばん多い形（帰投せず・輪まで 800 m・乗員 3 名死傷・夜明けの後）に
//   書き換えて作り直しても同じ。レーダーの行（「レーダー:」）と東京急行の行（「東京急行:」）を出す。SHOTDIR に Briefing と Result を撮る。
// 実行: SITE=<site> US04=1 [W=1560,1280] [SHOTDIR=<dir>] [TEXTS=1] node scripts/headless/brief-result.mjs
const US04_LINES = [2, 1, 2, 1, 1, 2];

/** ページの中: 台本の 1 夜（o = { frameMs }）。Result が出るまでは呼ぶ側が壁時計で待つ */
function us04Night(o) {
  const hl = window.__hl;
  const w = hl.world();
  let fired = false;
  for (let k = 0; k < 60 * 120 && hl.active('Mission'); k++) {
    hl.steer(NaN, 0);
    if (!fired && w.stepTimeS >= 30) { w.input.fireTap = true; fired = true; }
    if (fired && w.stepTimeS >= 32 && !w.atHome) { const b = w.boat.state; const rp = w.setup.mission.returnPoint; b.x = rp.x; b.y = rp.y; b.speedMps = 0; }
    hl.frame(o.frameMs);
  }
  return { t: w.stepTimeS, fired };
}

export async function mainUs04(site, h) {
  const widths = (process.env.W ?? '1560,1280').split(',').map(Number);
  const shotDir = process.env.SHOTDIR ?? '';
  if (shotDir) h.mkdirSync(shotDir, { recursive: true });
  const s = await h.serve(site);
  const browser = await h.chromium.launch();
  let bad = 0;
  let errs = 0;
  let maxNote = 0;
  let maxB = 0;
  let maxW = 0;
  for (const width of widths) for (const hard of [false, true]) {
    const tag = `W ${width} us_04${hard ? '&hard' : ''}`;
    // Briefing
    const g = await h.openGame(browser, s.base, `mission=us_04&seed=1${hard ? '&hard' : ''}`, { width });
    try {
      const rows = await g.page.evaluate(h.readBriefing, { mission: 'us_04', seed: 1, hard });
      const lines = rows.map((r) => r.lines);
      const note = rows[rows.length - 1];
      maxNote = Math.max(maxNote, note.bottom);
      let v = '';
      if (JSON.stringify(lines.slice(0, 6)) !== JSON.stringify(US04_LINES)) v += ' 行の数が違う';
      if (note.lines !== 3) v += ' 史実が 3 行でない';
      if (note.bottom > h.BRIEF_BODY_MAX_Y) v += ` 史実の下端 ${note.bottom.toFixed(1)} > ${h.BRIEF_BODY_MAX_Y}`;
      if (v) bad++;
      errs += g.errors.length;
      console.log(`Briefing ${tag} 行 [${lines.join(',')}] 史実の下端 ${note.bottom.toFixed(1)}（上限 ${h.BRIEF_BODY_MAX_Y}・ボタン ${h.SORTIE_TOP}）${v ? ` 違反${v}` : ''} | page errors ${g.errors.length}`);
      console.log(`    目的 [${rows[0].lines}] ${await g.page.evaluate(() => { const sc = window.__game.scene.getScene('Briefing'); const t = sc.children.list.find((x) => x.type === 'Text' && x.style.wordWrapWidth > 0); return t.getWrappedText().join('⏎'); })}`);
      if (process.env.TEXTS === '1') for (const r of rows) console.log(`    [${r.lines}] ${r.text.replace(/\n/g, '⏎')}`);
      if (shotDir) { await g.page.evaluate(() => window.__hl.render()); await g.page.screenshot({ path: `${shotDir}/briefing-us_04${hard ? '-hard' : ''}-w${width}.png` }); }
    } finally {
      await g.ctx.close();
    }
    // Result
    const r = await h.openGame(browser, s.base, `mission=us_04&seed=1${hard ? '&hard' : ''}`, { width });
    try {
      const night = await r.page.evaluate(us04Night, { frameMs: h.FRAME_MS });
      let ok = false;
      for (let k = 0; k < 600 && !ok; k++) {
        ok = await r.page.evaluate((ms) => {
          for (let i = 0; i < 30 && !window.__hl.active('Result'); i++) { if (window.__hl.active('Mission')) window.__hl.steer(NaN, 0); window.__hl.frame(ms); }
          if (!window.__hl.active('Result')) return false;
          for (let i = 0; i < 5; i++) window.__hl.frame(ms);
          return true;
        }, h.FRAME_MS);
        if (!ok) await r.page.waitForTimeout(100);
      }
      errs += r.errors.length;
      if (!ok) { bad++; console.log(`Result ${tag} ERROR Result が出ない（t ${night.t.toFixed(1)}）`); continue; }
      const real = await r.page.evaluate(h.bodyRows);
      if (shotDir) { await r.page.evaluate(() => window.__hl.render()); await r.page.screenshot({ path: `${shotDir}/result-us_04${hard ? '-hard' : ''}-w${width}.png` }); }
      await r.page.evaluate(h.worstResult);
      const worst = await r.page.evaluate(h.bodyRows);
      if (shotDir) { await r.page.evaluate(() => window.__hl.render()); await r.page.screenshot({ path: `${shotDir}/result-us_04${hard ? '-hard' : ''}-worst-w${width}.png` }); }
      const a = h.checkRows(real);
      const wst = h.checkRows(worst);
      maxB = Math.max(maxB, a.lastBottom);
      maxW = Math.max(maxW, wst.lastBottom);
      if (!a.ok || !wst.ok) bad++;
      const pick = (re) => (real.find((x) => re.test(x.text)) || { text: '(なし)' }).text;
      console.log(`Result ${tag} 台本 t ${night.t.toFixed(1)} 撃った ${night.fired} | 行 ${a.n} 下端 ${a.lastBottom.toFixed(1)} 重なり ${a.overlap} | 多い形 ${wst.n} 行 下端 ${wst.lastBottom.toFixed(1)} 重なり ${wst.overlap} | page errors ${r.errors.length}`);
      console.log(`    ${pick(/^レーダー:/)}\n    ${pick(/^東京急行:/)}`);
    } finally {
      await r.ctx.close();
    }
  }
  await browser.close();
  await s.close();
  console.log(`us_04: Briefing ${widths.length * 2} 件（史実の下端の最大 ${maxNote.toFixed(1)}・上限 ${h.BRIEF_BODY_MAX_Y}）・Result ${widths.length * 2} 夜（本文の下端の最大 ${maxB.toFixed(1)}・多い形 ${maxW.toFixed(1)}・上限 ${h.BODY_MAX_Y}）・page errors ${errs}・違反 ${bad}`);
  process.exitCode = errs === 0 && bad === 0 ? 0 : 1;
}
