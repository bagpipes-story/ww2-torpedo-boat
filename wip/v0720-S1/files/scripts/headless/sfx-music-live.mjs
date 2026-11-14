// 曲が本当に鳴る所の確かめ（v0.7.2 S1。spec-v0720 §8.2「sfx-music-live」）。sfx-live と同じく requestAnimationFrame を止めず、実時間で回す（再生の context は実時間でしか進まない）。
// ゲームは import しない（開発の道具だけ）。?debug の時だけ systems/sfx-boot が公開する window.__sfx（エンジン）の stats().music と、master につないだ AnalyserNode の波形の頂を読む。
// ページの中で曲の音源（繰り返す・長い buffer＝効果音のループは 4 秒まで）の start・stop を数え、stop の予約がまだ先の物も「鳴っている」に数える（どの時点も ≤ 6 が門）。
// 流れ（FLOW）:
//   title（既定）: ?debug&title で Title → 曲の標本ができるのを待つ →（既定の状態は）本物のタップで context を起こす（何も無い所）→ 曲の音源 1・単発の無い窓の頂 > 0 →
//     「曲: オン」を押す（曲: オフ）→ 0 → もう一度（曲: オン）→ 1 → us_02 の行 → Briefing（作り直さない・始め直さない）→「出撃」→ Mission（S1 は曲なし＝0）→
//     一時停止（窓の頂 ≈ 0。一時停止の「曲」ボタンで題が変わる・曲は 0 のまま）→ 再開 → 帰投で Result（鐘の後 2.2 秒で 1。始まった時刻を測る）→「もう一度」→ Briefing →「出撃」→
//     帰投 → Result を 3 回 → Mission で一時停止 →「任務をやめる」→ Title で 1。
//   notap: 既定の状態でタップを 1 つもしない（context は suspended のまま）: 曲の標本はできるが、音源 0・書き込み 0・波形は無音（止まっている context に積まない）。
// 音の状態（lib.mjs の環境変数）: 既定・AUDIO=1（autoplay を許す＝最初から running）・NOAUDIO=1（AudioContext なし＝エンジンが無い。同じ流れがページのエラー 0 で回ることだけ見る）。
// 門（✓/✗ を出し、✗ があれば終了コード 1）。数は回すたびに少し揺れる（実時間）。
// 実行: SITE=<site> [FLOW=title|notap] [W=1560] [ROW=<任務の行の題>] [AUDIO=1|NOAUDIO=1] [OUT=<json>] node scripts/headless/sfx-music-live.mjs
import { writeFileSync } from 'node:fs';
import { VIEWPORTS, chromium, envNum, serve } from './lib.mjs';

if (!process.env.SITE) throw new Error('SITE=<site> が要る');
const FLOW = process.env.FLOW ?? 'title';
const ROW = process.env.ROW ?? '東京急行を迎え撃て';
const NO_AUDIO = process.env.NOAUDIO === '1';
const AUDIO = process.env.AUDIO === '1';
const LIVE_MAX = 6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ページの中（init script）: 曲の音源の start・stop を数える（stop の予約の時刻も覚えて「鳴っている」を数える） */
function countMusic() {
  const P = window.AudioBufferSourceNode && window.AudioBufferSourceNode.prototype;
  if (!P) return;
  const c = (window.__musicSrc = { started: 0, stopped: 0, maxAlive: 0, maxUnstopped: 0, starts: [] });
  const all = [];
  const isMusic = (s) => s.loop && s.buffer && s.buffer.length > 100000;
  c.alive = () => { const now = all.length ? all[0].context.currentTime : 0; return all.filter((s) => s.__stopAt === undefined || s.__stopAt > now).length; };
  const start = P.start, stop = P.stop;
  P.start = function (...a) {
    if (isMusic(this)) {
      c.started++;
      all.push(this);
      c.starts.push({ when: a[0] ?? 0, now: this.context.currentTime, len: this.buffer.length });
      c.maxUnstopped = Math.max(c.maxUnstopped, c.started - c.stopped);
      c.maxAlive = Math.max(c.maxAlive, c.alive());
    }
    return start.apply(this, a);
  };
  P.stop = function (...a) {
    if (isMusic(this)) { c.stopped++; this.__stopAt = a[0] ?? 0; }
    return stop.apply(this, a);
  };
}

/** ページの中: 波形の頂（master → AnalyserNode。50 ms ごとに 8192 標本の窓の頂。win は測り直せる窓の頂）。context が無ければ何もしない */
function startMeter() {
  const sfx = window.__sfx;
  const s = window.__game.sound;
  const m = { peak: 0, win: 0, polls: 0 };
  window.__meter = m;
  if (!sfx || !('context' in s) || !s.context) return false;
  const an = s.context.createAnalyser();
  an.fftSize = 8192;
  sfx.master.connect(an);
  const buf = new Float32Array(an.fftSize);
  setInterval(() => {
    an.getFloatTimeDomainData(buf);
    let p = 0;
    for (let i = 0; i < buf.length; i++) { const v = Math.abs(buf[i]); if (v > p) p = v; }
    if (p > m.peak) m.peak = p;
    if (p > m.win) m.win = p;
    m.polls++;
    const c = window.__musicSrc;
    if (c) c.maxAlive = Math.max(c.maxAlive, c.alive());
  }, 50);
  return true;
}

/** ページの中: 今の状態（context・曲の数・ページの数え・シーン） */
function readState() {
  const g = window.__game;
  const s = g.sound;
  const sfx = window.__sfx;
  const c = window.__musicSrc ?? null;
  return {
    ctx: 'context' in s && s.context ? { state: s.context.state, t: s.context.currentTime } : null,
    music: sfx ? sfx.stats().music : null,
    page: c ? { started: c.started, stopped: c.stopped, unstopped: c.started - c.stopped, alive: c.alive(), maxAlive: c.maxAlive, maxUnstopped: c.maxUnstopped, lastStart: c.starts[c.starts.length - 1] ?? null } : null,
    scenes: ['Title', 'Briefing', 'Mission', 'Hud', 'Result', 'Pause', 'MusicLab'].filter((k) => g.scene.isActive(k)),
  };
}

/** ページの中: scene のボタン（題の文で探す）の中心の CSS px（sfx-live と同じ） */
function buttonCenter(o) {
  const g = window.__game;
  const sc = g.scene.getScene(o.scene);
  const t = sc.children.list.find((x) => x.type === 'Text' && x.text.startsWith(o.text));
  if (!t) return null;
  const b = t.getBounds();
  const r = g.canvas.getBoundingClientRect();
  const k = r.width / (g.scale.gameSize.width / sc.cameras.main.zoom);
  return { x: r.left + b.centerX * k, y: r.top + b.centerY * k };
}

const sv = await serve(process.env.SITE);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORTS[envNum('W', 1560)], deviceScaleFactor: 1, hasTouch: true, isMobile: false });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e && e.message ? e.message : e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
if (NO_AUDIO) await page.addInitScript(() => { delete window.AudioContext; delete window.webkitAudioContext; });
else await page.addInitScript(countMusic);
const rows = [];
const note = async (name) => { const st = await page.evaluate(readState); rows.push({ name, ...st }); return st; };
const tap = async (scene, text) => {
  const c = await page.evaluate(buttonCenter, { scene, text });
  if (!c) throw new Error(`${scene} に「${text}」のボタンが無い`);
  await page.touchscreen.tap(c.x, c.y);
};
const windowPeak = async (ms) => { await page.evaluate(() => { if (window.__meter) window.__meter.win = 0; }); await sleep(ms); return page.evaluate(() => (window.__meter ? window.__meter.win : 0)); };
const waitScene = (k) => page.waitForFunction((key) => window.__game.scene.isActive(key), k, { timeout: 15000 });
/** 曲の標本ができるまで（エンジンが無ければすぐ） */
const waitBuilt = () => page.waitForFunction(() => !window.__sfx || window.__sfx.stats().music.buffers >= 1, null, { timeout: 30000 });
const res = {};

await page.goto(`${sv.base}?debug&title&nosw&noraid&seed=1`);
await waitScene('Title');
await page.evaluate(startMeter);
// 遅らせの頼み（Result の鐘の後）の再生の時計を覚える（鐘を鳴らしたのと同じフレーム＝遅らせの数え始め）
await page.evaluate(() => {
  const sfx = window.__sfx;
  if (!sfx) return;
  const m = sfx.music, orig = m.request.bind(m);
  m.request = (c, d = 0) => { if (d > 0) window.__delayedAt = window.__game.sound.context.currentTime; return orig(c, d); };
});
await waitBuilt();
res.built = await note('Title（曲の標本ができた）');
if (FLOW === 'notap') {
  await sleep(3000);
  res.notap = await note('Title（タップなし 3 秒）');
  res.notapPeak = await windowPeak(1000);
} else {
  if (!AUDIO && !NO_AUDIO) {
    const c = await page.evaluate(() => { const r = window.__game.canvas.getBoundingClientRect(); return { x: r.left + r.width * 0.25, y: r.top + r.height * 0.08 }; });
    await page.touchscreen.tap(c.x, c.y); // 何も無い所（ロゴの左上）: context を起こすだけ
  }
  await sleep(2600); // 10 Hz の決め＋最初の音の 2 秒
  res.title = await note('Title（曲）');
  res.titlePeak = await windowPeak(1000);
  await tap('Title', '曲: オン');
  await sleep(700);
  res.off = await note('Title（曲: オフ）');
  res.offPeak = await windowPeak(600);
  await tap('Title', '曲: オフ');
  await sleep(600);
  res.on = await note('Title（曲: オン）');
  await tap('Title', ROW);
  await waitScene('Briefing');
  await sleep(1200);
  res.brief = await note('Briefing');
  await tap('Briefing', '出撃');
  await page.waitForFunction(() => { const g = window.__game; const m = g.scene.getScene('Mission'); return g.scene.isActive('Mission') && m.world && g.scene.isActive('Hud'); }, null, { timeout: 15000 });
  await sleep(2500); // メニューは 1.2 秒で消える
  res.mission = await note('Mission（S1 は曲なし）');
  await page.evaluate(() => window.__game.scene.getScene('Hud').pause.open());
  await waitScene('Pause');
  await sleep(900);
  res.pausePeak = await windowPeak(600);
  await tap('Pause', '曲: オン');
  await sleep(300);
  res.pauseTitle = await page.evaluate(() => window.__game.scene.getScene('Pause').children.list.some((x) => x.type === 'Text' && x.text === '曲: オフ'));
  await tap('Pause', '曲: オフ');
  await sleep(300);
  res.pause = await note('一時停止（「曲」を 1 往復）');
  await tap('Pause', '再開');
  await page.waitForFunction(() => !window.__game.scene.isActive('Pause'), null, { timeout: 5000 });
  res.results = [];
  for (let i = 0; i < 4; i++) {
    if (i > 0) {
      await tap('Result', 'もう一度');
      await waitScene('Briefing');
      await sleep(900);
      await tap('Briefing', '出撃');
      await page.waitForFunction(() => { const g = window.__game; const m = g.scene.getScene('Mission'); return g.scene.isActive('Mission') && m.world; }, null, { timeout: 15000 });
      await sleep(2000);
    }
    await page.evaluate(() => window.__game.scene.getScene('Mission').endMission('returned'));
    await waitScene('Result');
    await sleep(1500);
    const early = await page.evaluate(readState);
    await sleep(1600);
    const st = await note(`Result ${i + 1}（鐘の後）`);
    const ls = st.page && st.page.lastStart;
    const t0 = await page.evaluate(() => window.__delayedAt ?? null);
    res.results.push({ early: early.music ? early.music.sources : null, sources: st.music ? st.music.sources : null, delay: ls && t0 !== null ? ls.when - t0 : null });
    await sleep(1200);
  }
  await tap('Result', 'もう一度');
  await waitScene('Briefing');
  await sleep(900);
  await tap('Briefing', '出撃');
  await page.waitForFunction(() => { const g = window.__game; const m = g.scene.getScene('Mission'); return g.scene.isActive('Mission') && m.world && g.scene.isActive('Hud'); }, null, { timeout: 15000 });
  await sleep(1500);
  await page.evaluate(() => window.__game.scene.getScene('Hud').pause.open());
  await waitScene('Pause');
  await sleep(400);
  await page.evaluate(() => window.__game.scene.getScene('Pause').leave(true)); // 「任務をやめる」の長押しの後と同じ口
  await waitScene('Title');
  await sleep(2800);
  res.quit = await note('任務をやめる → Title');
}
const last = await note('終わり');
await ctx.close();
await browser.close();
await sv.close();

let bad = 0;
const check = (ok, text) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${text}`); };
const label = `${AUDIO ? 'AUDIO=1' : NO_AUDIO ? 'NOAUDIO=1' : '既定'} FLOW=${FLOW}`;
for (const r of rows) {
  const m = r.music;
  console.log(`  ${r.name}: ${r.scenes.join('+')} ・ context ${r.ctx ? `${r.ctx.state} t ${r.ctx.t.toFixed(2)}` : 'なし'}${m ? ` ・ 曲 場面 ${m.want}/${m.ctx} 鍵 ${m.key ?? '-'} 音源 ${m.sources} 作った ${m.starts} 止めた ${m.stops} 書いた ${m.writes} 標本 ${m.buffers}（常駐 ${m.resident}）作った曲 ${m.builds} 作る ${m.buildCalls} 回（中央値 ${m.buildMsMedian.toFixed(2)}・95% ${m.buildMsP95.toFixed(2)}・最大 ${m.buildMsMax.toFixed(2)} ms）作業用 ${m.work}` : ' ・ エンジンなし'}${r.page ? ` ・ ページの数え ${r.page.started}−${r.page.stopped}（鳴っている ${r.page.alive}・最大 ${r.page.maxAlive}）` : ''}`);
}
check(errors.length === 0, `${label}: ページのエラー 0${errors.length ? `（${errors.length} 件: ${errors[0]}）` : ''}`);
if (NO_AUDIO) {
  check(last.music === null && last.ctx === null, `${label}: エンジンなし（同じ流れが回る）`);
} else {
  const p = last.page;
  check(p.maxAlive <= LIVE_MAX && p.maxUnstopped <= LIVE_MAX, `${label}: 曲の音源はどの時点も ≤ ${LIVE_MAX}（鳴っている最大 ${p.maxAlive}・stop 前の最大 ${p.maxUnstopped}）`);
  check(res.built.music.buffers === 1 && res.built.music.resident === 672000 && res.built.music.builds === 1, `${label}: ゲームの列は既定のタイトルの曲 1 本（標本 ${res.built.music.buffers}・常駐 ${res.built.music.resident}）`);
  if (FLOW === 'notap') {
    const m = res.notap.music;
    check(res.notap.ctx.state === 'suspended', `${label}: context は止まったまま（${res.notap.ctx.state}）`);
    check(m.sources === 0 && m.starts === 0 && m.writes === 0 && p.started === 0, `${label}: 音源 0・書き込み 0（${m.starts}・${m.writes}・ページ ${p.started}）＝止まっている context に積まない`);
    check(res.notapPeak === 0, `${label}: 波形は無音（頂 ${res.notapPeak}）`);
  } else {
    check(res.title.ctx.state === 'running' && res.title.music.sources === 1 && res.title.page.unstopped === 1, `${label}: Title で曲の音源 1（${res.title.music.key}・context ${res.title.ctx.state}・ページ ${res.title.page.unstopped}）`);
    check(res.titlePeak > 0.005 && res.titlePeak < 1, `${label}: 単発の無い窓の頂 > 0（${res.titlePeak.toFixed(4)}）`);
    check(res.off.music.sources === 0 && res.off.page.unstopped === 0 && !res.off.music.enabled, `${label}: 「曲: オフ」で 0（${res.off.music.sources}・窓の頂 ${res.offPeak.toFixed(4)}）`);
    check(res.on.music.sources === 1 && res.on.music.enabled, `${label}: 「曲: オン」で 1（頭から: 作った ${res.on.music.starts}）`);
    check(res.brief.music.sources === 1 && res.brief.music.starts === res.on.music.starts && res.brief.music.builds === 1, `${label}: Briefing は作り直さない・始め直さない（作った ${res.brief.music.starts}・曲 ${res.brief.music.builds}）`);
    check(res.mission.music.sources === 0 && res.mission.page.alive === 0, `${label}: Mission は曲 0（S1。鳴っている ${res.mission.page.alive}）`);
    check(res.pausePeak < 0.002 && res.pauseTitle && res.pause.music.sources === 0, `${label}: 一時停止で頂 ≈ 0（${res.pausePeak.toFixed(5)}）・「曲」ボタンで題が変わる（${res.pauseTitle}）・曲 0`);
    res.results.forEach((r, i) => check(r.early === 0 && r.sources === 1 && r.delay !== null && r.delay >= 2.2 && r.delay < 2.5, `${label}: Result ${i + 1} 回目: 1.5 秒は 0・鐘の後 ${r.delay === null ? '-' : r.delay.toFixed(2)} 秒で 1（帰投 2.2 秒＋始めの 0.05 秒＋10 Hz）`));
    check(res.quit.music.sources === 1 && res.quit.scenes.includes('Title') && !res.quit.music.paused, `${label}: 一時停止 → 任務をやめる → Title で 1（一時停止は解けている）`);
    check(last.music.builds === 1 && !last.music.work && last.music.resident === 672000, `${label}: 最後まで曲は作り直さない（作った曲 ${last.music.builds}・作業用の配列 ${last.music.work}）`);
  }
}
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ label, errors, rows, res }, null, 1));
console.log(`sfx-music-live ${label} ${bad === 0 ? 'OK' : `NG ${bad}`}`);
process.exitCode = bad === 0 ? 0 : 1;
