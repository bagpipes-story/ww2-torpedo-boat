// brief-result.mjs の US05=1（v0.8.2 S4。lead の L46・L47。brief-result-us06.mjs の写し）: us_05（スリガオ海峡・最初の接触）の Briefing の本当の折り返しと Result の本文の下端。
// brief-result.mjs から呼ぶ（ページの中の読み口・下端の検査・道具は引数 h で受け取る）。
// - Briefing: ノーマル・ハード × W で値の行ごとの Phaser の本当の折り返しの行の数（Text.getWrappedText）と下端、史実メモの下端（≤ 出撃のボタンの上端 584 − 8）。
//   行の数は 目的 2・成功 1・月 2・敵 1・危険 1・条件 2・史実 3（tests/briefing の見積もりと同じ）。ハードの敵の行は「駆逐艦 ×5」。
// - Result: ノーマル・ハード × W で 3 つの夜を台本で終わるまで回す（測るためだけ・世界を書き換える）: sent＝本隊の前方 (3000, 950) に止まって待ち（&noradio＝見張りに見つかって撃たれても無線は壊れない）、報告を送ったら輪の中へ置いて帰投／
//   relayed＝同じ所で待ち、追い終える 0.5 秒前に無線を壊し（世界の報告の状態に書く）、中継待ちになったら中継の輪へ置いて中継し、輪の中へ置いて帰投／none＝3 秒から輪の中へ置いて帰投
//   （戦艦を見ていない）。本文の行の最後の下端 ≤ 592（ボタンの上端 − 8）・行が重ならない。行のいちばん多い形（帰投せず・輪まで 800 m・乗員 3 名死傷・夜明けの後）と、
//   報告の材料を多い形（中継・戦艦に命中 4・誘爆で轟沈 1・重巡 0・駆逐艦 0）に書き換えて作り直しても同じ。見出し・報告の 2 行を出す。SHOTDIR に Briefing と Result を撮る（dpr 2）。
// 実行: SITE=<site> US05=1 [W=1560,1280] [SHOTDIR=<dir>] [TEXTS=1] node scripts/headless/brief-result.mjs
const US05_LINES = [2, 1, 2, 1, 1, 2];

/** ページの中: 台本の 1 夜（o = { frameMs, kind }）。Result が出るまでは呼ぶ側が壁時計で待つ */
function us05Night(o) {
  const hl = window.__hl;
  const w = hl.world();
  const rp = w.setup.mission.returnPoint;
  const relay = w.recon.plan.relay;
  const st = w.recon.state;
  const put = (x, y) => { const b = w.boat.state; b.x = x; b.y = y; b.speedMps = 0; };
  for (let k = 0; k < 60 * 260 && hl.active('Mission'); k++) {
    const done = st.stage === 2 || st.stage === 4; // RECON_SENT・RECON_RELAYED
    if (o.kind === 'none' ? w.stepTimeS >= 3 : done) put(rp.x, rp.y);
    else if (o.kind === 'relayed' && st.stage === 3) put(relay.x, relay.y); // RECON_PENDING → 中継の輪
    else put(3000, 950);
    if (o.kind === 'relayed' && !st.radioBroken && st.stage === 1 && st.trackedS >= w.recon.plan.trackS - 0.5) { st.radioBroken = true; st.radioBrokenAtS = st.clockS; }
    w.damage.hp = w.damageParams.maxHp; // 測るためだけ（見つかって沈む夜を作らない）
    hl.steer(NaN, 0);
    hl.frame(o.frameMs);
  }
  return { t: w.stepTimeS, stage: st.stage };
}

/** ページの中: Result の報告の材料を多い形に書き換えて作り直す（h.worstResult の後に） */
function us05Worst() {
  const g = window.__game;
  const s = g.scene.getScene('Result');
  const r = structuredClone(s.result);
  if (r.recon) Object.assign(r.recon, { stage: 4, relayedAtS: 233, seenAtS: 148, bbHits: 4, bbSunk: 1, detonations: 1, caHits: 0, ddHits: 0, gone: 6 });
  g.scene.start('Result', r);
  for (let i = 0; i < 5; i++) window.__hl.frame(0);
}

export async function mainUs05(site, h) {
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
    const tag = `W ${width} us_05${hard ? '&hard' : ''}`;
    const g = await h.openGame(browser, s.base, `mission=us_05&seed=1${hard ? '&hard' : ''}`, { width, dpr: 2 });
    try {
      const rows = await g.page.evaluate(h.readBriefing, { mission: 'us_05', seed: 1, hard });
      const lines = rows.map((r) => r.lines);
      const note = rows[rows.length - 1];
      maxNote = Math.max(maxNote, note.bottom);
      let v = '';
      if (JSON.stringify(lines.slice(0, 6)) !== JSON.stringify(US05_LINES)) v += ' 行の数が違う';
      if (!rows[3].text.includes(`駆逐艦 ×${hard ? 5 : 4}`)) v += ' 敵の行の駆逐艦の隻数';
      if (note.lines !== 3) v += ' 史実が 3 行でない';
      if (note.bottom > h.BRIEF_BODY_MAX_Y) v += ` 史実の下端 ${note.bottom.toFixed(1)} > ${h.BRIEF_BODY_MAX_Y}`;
      if (v) bad++;
      errs += g.errors.length;
      console.log(`Briefing ${tag} 行 [${lines.join(',')}] 史実の下端 ${note.bottom.toFixed(1)}（上限 ${h.BRIEF_BODY_MAX_Y}・ボタン ${h.SORTIE_TOP}）${v ? ` 違反${v}` : ''} | page errors ${g.errors.length}`);
      if (process.env.TEXTS === '1') for (const r of rows) console.log(`    [${r.lines}] ${r.text.replace(/\n/g, '⏎')}`);
      if (shotDir) { await g.page.evaluate(() => window.__hl.render()); await g.page.screenshot({ path: `${shotDir}/briefing-us_05${hard ? '-hard' : ''}-w${width}.png` }); }
    } finally {
      await g.ctx.close();
    }
    for (const kind of ['sent', 'relayed', 'none']) {
      const r = await h.openGame(browser, s.base, `mission=us_05&seed=1${hard ? '&hard' : ''}${kind === 'sent' ? '&noradio' : ''}`, { width, dpr: 2 });
      try {
        const night = await r.page.evaluate(us05Night, { frameMs: h.FRAME_MS, kind });
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
        if (!ok) { bad++; console.log(`Result ${tag} ${kind} ERROR Result が出ない（t ${night.t.toFixed(1)}）`); continue; }
        const real = await r.page.evaluate(h.bodyRows);
        const sh = `${shotDir}/result-us_05${hard ? '-hard' : ''}-${kind}-w${width}.png`;
        if (shotDir) { await r.page.evaluate(() => { for (let i = 0; i < 4; i++) window.__hl.render(); }); await r.page.screenshot({ path: sh }); }
        await r.page.evaluate(h.worstResult);
        await r.page.evaluate(us05Worst);
        const worst = await r.page.evaluate(h.bodyRows);
        if (shotDir) { await r.page.evaluate(() => { for (let i = 0; i < 4; i++) window.__hl.render(); }); await r.page.screenshot({ path: sh.replace('.png', '-worst.png') }); }
        const a = h.checkRows(real);
        const wst = h.checkRows(worst);
        maxB = Math.max(maxB, a.lastBottom);
        maxW = Math.max(maxW, wst.lastBottom);
        const pick = (rows, re) => (rows.find((x) => re.test(x.text)) || { text: '(なし)' }).text;
        const want = { sent: /^報告: 出撃 \d+ 秒に送った（無線）/, relayed: /^報告: 無線が壊れ、出撃 \d+ 秒に隣の分隊で中継/, none: /^報告できなかった（戦艦を見ていない）/ }[kind];
        const shrunk = real.filter((x) => x.sy < 0.999).length + worst.filter((x) => x.sy < 0.999).length;
        if (!a.ok || !wst.ok || !want.test(pick(real, /^報告/)) || shrunk > 0 || /^列|往路/.test(pick(real, /往路/))) bad++;
        console.log(`Result ${tag} ${kind} 台本 t ${night.t.toFixed(1)} 段 ${night.stage} | 行 ${a.n} 下端 ${a.lastBottom.toFixed(1)} 重なり ${a.overlap} | 多い形 ${wst.n} 行 下端 ${wst.lastBottom.toFixed(1)} 重なり ${wst.overlap} | 縮め ${shrunk} | page errors ${r.errors.length}`);
        console.log(`    ${real[0] ? real[0].text : ''}\n    ${pick(real, /^報告/)}\n    ${pick(real, /^艦隊 \d/)}\n    ${pick(real, /^スコア/)}\n    ${pick(real, /^帰投 \d/)}\n    多い形: ${pick(worst, /^報告/)} ｜ ${pick(worst, /^艦隊 \d/)}`);
      } finally {
        await r.ctx.close();
      }
    }
  }
  await browser.close();
  await s.close();
  console.log(`us_05: Briefing ${widths.length * 2} 件（史実の下端の最大 ${maxNote.toFixed(1)}・上限 ${h.BRIEF_BODY_MAX_Y}）・Result ${widths.length * 6} 夜（本文の下端の最大 ${maxB.toFixed(1)}・多い形 ${maxW.toFixed(1)}・上限 ${h.BODY_MAX_Y}）・page errors ${errs}・違反 ${bad}`);
  process.exitCode = errs === 0 && bad === 0 ? 0 : 1;
}
