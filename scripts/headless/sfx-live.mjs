// 音が本当に鳴る所の確かめ（v0.7.1 S1。spec-v0710 §9.3「sfx-live」）。ほかの道具と違い requestAnimationFrame を止めず、実時間で回す（再生の context は実時間でしか進まない）。
// ゲームは import しない（開発の道具だけ）。?debug の時だけ systems/sfx-boot が公開する window.__sfx（エンジン）の stats() と、master につないだ AnalyserNode の波形の頂を読む。
// 流れ（FLOW）:
//   title（既定）: ?debug&title で Title → 本物のタップ（touchscreen.tap）で us_02 の行 → Briefing の「出撃」をタップ → Mission を SECS 秒（下の台本）。
//     最初のタップの前後の context の状態も出す（AUDIO なしでも、ヘッドレスの Chromium は本物のタップで unlock する＝iOS の unlock の道に一番近い確かめ。iOS の規則そのものは
//     まねられない＝実機で見る）。「音」ボタンで消音 → 解く、も 1 往復する（MUTE=0 で省く）。
//   direct: ?debug で Mission へ直行し、タッチを 1 つもせずに同じ台本を回す（既定の状態＝context は suspended のまま: 音源を 1 つも作らず、捨てた数だけが増える＝積まない）。
// 台本（Mission）: 機銃を押しっぱなしにし（入力の欄に書く＝ユーザーの操作にならない。us_02 の機銃は射程に艦がいる時だけ撃つので、始めの海では撃たない）、
//   絵の層の口を直に呼ぶ: 1〜4 秒は自艇の位置に機銃の砲口の火花（world.splashes.muzzle。毎秒 10 発）、2 秒と 5 秒に大きい爆発（world.art.explosions.play。右 300 m と左 2,000 m）。
//   MUZZLE=0 で砲口の呼び出しを省く（本物の機銃の道だけを見る。例: FLOW=direct MISSION=us_03 Q=barges=near MUZZLE=0＝近くの大発を艇の砲が撃つ）。
// 音の状態（lib.mjs の環境変数）: 既定・AUDIO=1（autoplay を許す＝最初から running）・NOAUDIO=1（AudioContext なし＝エンジンが無い。ゲームがエラー 0 で動くことだけ見る）。
// 門（✓/✗ を出し、✗ があれば終了コード 1）:
//   鳴る場合（title、または AUDIO=1 の direct）: context は running・音源 > 0・mg と blast_l と（title は）ui_tap を鳴らした・波形の頂が 0 より大きく 1 未満・同時の声 ≤ 16・ページのエラー 0。
//   鳴らない場合（既定の direct）: context は suspended のまま・音源 0・捨てた数 > 0・ページのエラー 0。 NOAUDIO=1: __sfx なし・任務が進む・ページのエラー 0。
// S3（ループ。LOOPS=0 で省く）: 台本の後、鳴る場合は続けて ループ 5 本が鳴っているか（単発の無い窓の波形の頂 > 0）→ Hud の一時停止で無音になるか（音源は止めない）→
//   一時停止の「音」ボタンで消音 → 解く →「再開」で戻るか → 任務のやり直しを 3 回して、鳴っている繰り返しの音源が 5 個のままか（エンジンの数と、ページの中で
//   AudioBufferSourceNode の start・stop を数えた数の両方）→「任務をやめる」で Title へ戻ると 0 個・無音か。鳴らない場合（既定の direct）はループを 1 つも作らないこと。
// S4: ループの確かめの最後に、同じ出撃で Mission へ入り直して帰投で終え、Result の鐘（2 打）が鳴るか（鳴らした数と、Result の最初の 1.6 秒の波形の頂）。
// v0.7.2 S1: Title・Result でメニューの曲が鳴るので、ここでは保存の「曲: オフ」で開く（ループの数え・「任務をやめる → Title で無音」は効果音だけの確かめのまま。MUSIC=1 で曲も鳴らす）。
//   曲の確かめは scripts/headless/sfx-music-live。
// 実行: SITE=<site> [FLOW=title|direct] [SECS=10] [MISSION=us_02（direct）] [ROW=<任務の行の題>（title）] [W=1560] [MUTE=0] [MUZZLE=0] [LOOPS=0] [Q=<direct の追加の query>] [MUSIC=1] [AUDIO=1|NOAUDIO=1] [OUT=<json>] node scripts/headless/sfx-live.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { VIEWPORTS, chromium, envNum, serve } from './lib.mjs';

if (!process.env.SITE) throw new Error('SITE=<site> が要る');
const FLOW = process.env.FLOW ?? 'title';
const SECS = envNum('SECS', 10);
const MISSION = process.env.MISSION ?? 'us_02';
/** title の流れで押す任務の行の題（既定は us_02。米PT のタブの行） */
const ROW = process.env.ROW ?? '東京急行を迎え撃て';
const NO_AUDIO = process.env.NOAUDIO === '1';
const AUDIO = process.env.AUDIO === '1';
const VOICES = 16;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 鍵の番号は config/sfx-config の SFX_KEYS の並びから引く（v0.7.2 S1: IP2 で reload_end が 15 番に入ってから ui_tap・bell の固定の番号が 1 つずれていた）
const SFX_KEY_LIST = [.../export const SFX_KEYS = \[([\s\S]*?)\] as const/.exec(readFileSync(new URL('../../src/config/sfx-config.ts', import.meta.url), 'utf8'))[1].matchAll(/'(\w+)'/g)].map((x) => x[1]);
const KEY_INDEX = { mg: SFX_KEY_LIST.indexOf('mg'), blast_l: SFX_KEY_LIST.indexOf('blast_l'), ui_tap: SFX_KEY_LIST.indexOf('ui_tap'), bell: SFX_KEY_LIST.indexOf('bell') };

/** ページの中: 波形の頂を測り始める（master → AnalyserNode。50 ms ごとに 8192 標本＝約 0.19 秒の窓の頂を取る＝描画で遅れても窓が重なる）。context が無ければ何もしない */
function startMeter() {
  const sfx = window.__sfx;
  const s = window.__game.sound;
  const m = { peak: 0, over: 0, polls: 0, timeline: [], win: 0 };
  window.__meter = m;
  if (!sfx || !('context' in s) || !s.context) return false;
  const an = s.context.createAnalyser();
  an.fftSize = 8192;
  sfx.master.connect(an);
  const buf = new Float32Array(an.fftSize);
  setInterval(() => {
    an.getFloatTimeDomainData(buf);
    let p = 0;
    for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > p) p = a; }
    if (p > m.peak) m.peak = p;
    if (p > m.win) m.win = p;
    if (p >= 1) m.over++;
    m.polls++;
    if (m.polls % 10 === 0) m.timeline.push(Math.round(p * 1000) / 1000);
  }, 50);
  return true;
}

/** ページの中: 今の状態（context・エンジンの数・波形の頂・任務の時計） */
function readState() {
  const g = window.__game;
  const s = g.sound;
  const sfx = window.__sfx;
  const mission = g.scene.getScene('Mission');
  const w = mission && mission.world ? mission.world : null;
  return {
    manager: 'context' in s ? 'WebAudio' : 'context なし',
    ctx: 'context' in s && s.context ? { state: s.context.state, t: Math.round(s.context.currentTime * 1000) / 1000, rate: s.context.sampleRate } : null,
    sfx: sfx ? sfx.stats() : null,
    meter: window.__meter ?? null,
    stepTimeS: w ? w.stepTimeS : null,
    scenes: ['Title', 'Briefing', 'Mission', 'Hud', 'Result'].filter((k) => g.scene.isActive(k)),
  };
}

/** ページの中: scene のボタン（題の文で探す）の中心の CSS px */
function buttonCenter(o) {
  const g = window.__game;
  const sc = g.scene.getScene(o.scene);
  const t = sc.children.list.find((x) => x.type === 'Text' && x.text.startsWith(o.text));
  if (!t) return null;
  const b = t.getBounds();
  const cam = sc.cameras.main;
  const r = g.canvas.getBoundingClientRect();
  const k = r.width / (g.scale.gameSize.width / cam.zoom); // 論理 px → CSS px
  return { x: r.left + (b.centerX) * k, y: r.top + (b.centerY) * k };
}

const sv = await serve(process.env.SITE);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: VIEWPORTS[envNum('W', 1560)], deviceScaleFactor: 1, hasTouch: true, isMobile: false });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e && e.message ? e.message : e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
if (process.env.MUSIC !== '1') await page.addInitScript(() => { try { localStorage.setItem('night-hunters.music', '0'); } catch { /* 保存が無い */ } });
if (NO_AUDIO) await page.addInitScript(() => { delete window.AudioContext; delete window.webkitAudioContext; });
// S3: 繰り返す音源（ループ）の start・stop をページの中で数える（エンジンの数とは別の証）
else await page.addInitScript(() => {
  const P = window.AudioBufferSourceNode && window.AudioBufferSourceNode.prototype;
  if (!P) return;
  const c = (window.__loopSrc = { started: 0, stopped: 0 });
  const start = P.start, stop = P.stop;
  P.start = function (...a) { if (this.loop) c.started++; return start.apply(this, a); };
  P.stop = function (...a) { if (this.loop) c.stopped++; return stop.apply(this, a); };
});
const log = [];
const note = (name, st) => { log.push({ name, ...st }); return st; };
const tap = async (scene, text) => {
  const c = await page.evaluate(buttonCenter, { scene, text });
  if (!c) throw new Error(`${scene} に「${text}」のボタンが無い`);
  await page.touchscreen.tap(c.x, c.y);
};

if (FLOW === 'title') {
  await page.goto(`${sv.base}?debug&title&nosw&noraid&seed=1`);
  await page.waitForFunction(() => window.__game && window.__game.scene.isActive('Title'), null, { timeout: 60000 });
  await page.evaluate(startMeter);
  await sleep(600); // ボタンは画面ができてから 300 ms 押下を受けない
  note('Title（タップの前）', await page.evaluate(readState));
  if (process.env.MUTE !== '0') {
    // 「音」ボタン: 消音（音: オフ）→ 解く（音: オン。ボタンの音が鳴る）
    await tap('Title', '音: オン');
    await sleep(300);
    note('Title（音: オフ）', await page.evaluate(readState));
    await tap('Title', '音: オフ');
    await sleep(400);
    note('Title（音: オン に戻した）', await page.evaluate(readState));
  }
  await tap('Title', ROW);
  await page.waitForFunction(() => window.__game.scene.isActive('Briefing'), null, { timeout: 10000 });
  await sleep(600);
  note('Briefing（最初の行のタップの後）', await page.evaluate(readState));
  await tap('Briefing', '出撃');
} else {
  await page.goto(`${sv.base}?debug&nosw&mission=${MISSION}&seed=1${process.env.Q ? `&${process.env.Q}` : ''}`);
}
await page.waitForFunction(() => { const g = window.__game; const m = g && g.scene.getScene('Mission'); return m && g.scene.isActive('Mission') && m.world; }, null, { timeout: 60000 });
if (FLOW !== 'title') await page.evaluate(startMeter);
note('Mission（始め）', await page.evaluate(readState));
// 台本（頭の注）: 機銃の入力は毎フレーム書く。砲口の火花は 1〜4 秒の間 0.1 秒ごと（1 フレームに 1 回まで。ヘッドレスは描画が遅く 毎秒 15 フレームほど）
await page.evaluate((muzzle) => {
  const g = window.__game;
  let next = 1;
  let t0 = -1;
  g.events.on('prestep', (time) => {
    const m = g.scene.getScene('Mission');
    if (!m || !m.world || !g.scene.isActive('Mission')) return;
    const w = m.world;
    w.input.gunHeld = true;
    if (t0 < 0) t0 = time;
    const t = (time - t0) / 1000;
    if (muzzle && t >= next && t < 4) { next = Math.max(next + 0.1, t); w.splashes.muzzle(w.boat.state.x, w.boat.state.y, false); }
  });
}, process.env.MUZZLE !== '0');
const boom = (dx) => page.evaluate((d) => { const w = window.__game.scene.getScene('Mission').world; if (!w) return; const b = w.boat.state; w.art.explosions.play(b.x + d, b.y, false, false); }, dx);
await sleep(Math.min(2000, SECS * 200));
await boom(300);
note('Mission（1 回目の爆発の後）', await page.evaluate(readState));
await sleep(Math.min(3000, SECS * 300));
await boom(-2000);
await sleep(Math.max(0, SECS * 1000 - Math.min(2000, SECS * 200) - Math.min(3000, SECS * 300)));
const end = note('Mission（終わり）', await page.evaluate(readState));
// S3: ループの確かめ（頭の注）。window はその間の波形の頂（測り始めを 0 に戻してから ms 待つ）
const loops = { ran: false, rows: [] };
const windowPeak = async (ms) => { await page.evaluate(() => { window.__meter.win = 0; }); await sleep(ms); return page.evaluate(() => window.__meter.win); };
const loopState = async (name, ms = 500) => { const peak = await windowPeak(ms); const st = await page.evaluate(readState); const src = await page.evaluate(() => window.__loopSrc ?? null); const row = { name, peak, loops: st.sfx.loops, starts: st.sfx.loopStarts, stops: st.sfx.loopStops, writes: st.sfx.loopWrites, live: src ? src.started - src.stopped : null, scenes: st.scenes }; loops.rows.push(row); return row; };
if (process.env.LOOPS !== '0' && !NO_AUDIO && (FLOW === 'title' || AUDIO)) {
  loops.ran = true;
  await page.evaluate(() => { const g = window.__game; g.events.off('prestep'); g.scene.getScene('Mission').world.input.gunHeld = false; }); // 台本を外す（単発を止める）
  await sleep(3000); // 最後の爆発（1.6 秒）と砲声が鳴り終わるまで
  loops.playing = await loopState('任務の中（単発なし）');
  await page.evaluate(() => window.__game.scene.getScene('Hud').pause.open());
  await page.waitForFunction(() => window.__game.scene.isActive('Pause'), null, { timeout: 5000 });
  await sleep(900); // 開いた合図の音と、束を絞る 0.15 秒
  loops.paused = await loopState('一時停止');
  await tap('Pause', '音: オン');
  await sleep(300);
  loops.mutedTitle = await page.evaluate(() => window.__game.scene.getScene('Pause').children.list.some((x) => x.type === 'Text' && x.text === '音: オフ'));
  loops.muted = (await page.evaluate(readState)).sfx.muted;
  await tap('Pause', '音: オフ');
  await sleep(500);
  await tap('Pause', '再開');
  await page.waitForFunction(() => window.__game.scene.isActive('Hud') && !window.__game.scene.isActive('Pause'), null, { timeout: 5000 });
  await sleep(700);
  loops.resumed = await loopState('再開の後');
  for (let i = 1; i <= 3; i++) {
    await page.evaluate(() => { const m = window.__game.scene.getScene('Mission'); m.scene.restart(m.sortie); });
    await sleep(1200);
    loops.retry = await loopState(`やり直し ${i} 回目`, 300);
  }
  await page.evaluate(() => window.__game.scene.getScene('Hud').pause.open());
  await page.waitForFunction(() => window.__game.scene.isActive('Pause'), null, { timeout: 5000 });
  await sleep(400);
  await page.evaluate(() => { window.__lastSortie = window.__game.scene.getScene('Mission').sortie; window.__game.scene.getScene('Pause').leave(true); }); // 「任務をやめる」の長押しの後と同じ口
  await page.waitForFunction(() => window.__game.scene.isActive('Title'), null, { timeout: 5000 });
  await sleep(900);
  loops.quit = await loopState('任務をやめる → Title');
  // S4: Result の鐘（Title から同じ出撃で Mission へ入り直し、帰投で終える＝Result の create が鐘を 2 打。2 打目は 0.5 秒の予約）
  await page.evaluate(() => window.__game.scene.getScene('Title').scene.start('Mission', window.__lastSortie));
  await page.waitForFunction(() => { const g = window.__game; const m = g.scene.getScene('Mission'); return g.scene.isActive('Mission') && m.world; }, null, { timeout: 10000 });
  await sleep(1500);
  const bellBefore = (await page.evaluate(readState)).sfx.played[KEY_INDEX.bell];
  await page.evaluate(() => window.__game.scene.getScene('Mission').endMission('returned'));
  await page.waitForFunction(() => window.__game.scene.isActive('Result'), null, { timeout: 5000 });
  const resultPeak = await windowPeak(1600);
  loops.result = { ...(await loopState('Result（鐘の後）', 600)), bells: (await page.evaluate(readState)).sfx.played[KEY_INDEX.bell] - bellBefore, ringPeak: resultPeak };
}
await ctx.close();
await browser.close();
await sv.close();

let bad = 0;
const check = (ok, text) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${text}`); };
const label = `${AUDIO ? 'AUDIO=1' : NO_AUDIO ? 'NOAUDIO=1' : '既定'} FLOW=${FLOW}`;
for (const l of log) {
  const s = l.sfx;
  console.log(`  ${l.name}: ${l.manager} context ${l.ctx ? `${l.ctx.state} t ${l.ctx.t} s ${l.ctx.rate} Hz` : 'なし'}${s ? ` ・ 音源 ${s.sources} 今 ${s.busy} 最大 ${s.maxBusy} 捨てた（消音・停止）${s.idleDrops} 最初のタップ ${s.pendingPlayed} resume ${s.kicks} 見張り ${s.watchdogKicks} 消音 ${s.muted} mg ${s.played[KEY_INDEX.mg]} blast_l ${s.played[KEY_INDEX.blast_l]} ui_tap ${s.played[KEY_INDEX.ui_tap]} 落とした（間隔・遠い・声）${s.dropped.slice(1).join('/')}` : ' ・ エンジンなし'}${l.meter ? ` ・ 頂 ${l.meter.peak.toFixed(3)}` : ''}`);
}
check(errors.length === 0, `${label}: ページのエラー 0${errors.length ? `（${errors.length} 件: ${errors[0]}）` : ''}`);
// ヘッドレスは描画が遅く（SwiftShader）、任務の時計は実時間より遅れる（1 フレーム 4 ステップまで）＝進んでいることだけ見る
check(end.stepTimeS !== null && end.stepTimeS > 1, `${label}: 任務が進む（実時間 ${SECS} 秒で任務の時計 ${end.stepTimeS === null ? 'なし' : end.stepTimeS.toFixed(1)} 秒）`);
if (NO_AUDIO) {
  check(end.sfx === null && end.ctx === null, `${label}: エンジンなし（${end.manager}）`);
} else if (FLOW === 'direct' && !AUDIO) {
  const s = end.sfx;
  check(end.ctx.state === 'suspended', `${label}: context は止まったまま（${end.ctx.state}）`);
  check(s.sources === 0 && s.busy === 0, `${label}: 音源を 1 つも作らない（${s.sources}）`);
  check(s.idleDrops > 0, `${label}: 捨てた数だけ増える（${s.idleDrops}）＝積まない`);
  check(end.meter.peak === 0, `${label}: 波形は無音（頂 ${end.meter.peak}）`);
} else {
  const s = end.sfx;
  check(end.ctx.state === 'running', `${label}: context は running（${end.ctx.state}・${end.ctx.rate} Hz）`);
  check(s.sources > 0 && s.played[KEY_INDEX.mg] > 0 && s.played[KEY_INDEX.blast_l] >= 2, `${label}: 機銃と爆発を鳴らした（音源 ${s.sources}・mg ${s.played[KEY_INDEX.mg]}・blast_l ${s.played[KEY_INDEX.blast_l]}）`);
  if (FLOW === 'title') check(s.played[KEY_INDEX.ui_tap] >= 2, `${label}: ボタンの音を鳴らした（ui_tap ${s.played[KEY_INDEX.ui_tap]}・最初のタップを後から ${s.pendingPlayed}）`);
  check(end.meter.peak > 0 && end.meter.peak < 1 && end.meter.over === 0, `${label}: 波形の頂は 0 より大きく 1 未満（頂 ${end.meter.peak.toFixed(3)}・1 以上の窓 ${end.meter.over}／${end.meter.polls}）`);
  check(s.maxBusy <= VOICES && s.busy <= VOICES, `${label}: 同時の声は ${VOICES} 以下（最大 ${s.maxBusy}・今 ${s.busy}）`);
  check(s.watchdogKicks === 0, `${label}: 見張りは動かない（${s.watchdogKicks}）`);
}
if (loops.ran) {
  for (const r of loops.rows) console.log(`  ループ ${r.name}: 窓の頂 ${r.peak.toFixed(4)} ・ 鳴っている音源 ${r.loops}（ページの数え ${r.live}）・ 作った ${r.starts} 止めた ${r.stops} ・ 書いた ${r.writes} ・ ${r.scenes.join('+')}`);
  const { playing, paused, resumed, retry, quit } = loops;
  check(playing.loops === 5 && playing.live === 5, `${label}: ループ 5 本が鳴っている（エンジン ${playing.loops}・ページの数え ${playing.live}）`);
  check(playing.peak > 0.002 && playing.peak < 1, `${label}: 単発の無い窓でも波形がある＝ループの音（頂 ${playing.peak.toFixed(4)}）`);
  check(paused.peak < playing.peak * 0.05 && paused.loops === 5, `${label}: 一時停止で無音（頂 ${paused.peak.toFixed(5)}。音源は止めない＝${paused.loops}）`);
  check(loops.muted === true && loops.mutedTitle === true, `${label}: 一時停止の「音」ボタンで消音（消音 ${loops.muted}・題「音: オフ」${loops.mutedTitle}）`);
  check(resumed.peak > playing.peak * 0.3 && resumed.loops === 5 && resumed.live === 5, `${label}: 「音: オン」に戻して再開するとループが戻る（頂 ${resumed.peak.toFixed(4)}・音源 ${resumed.loops}）`);
  check(retry.loops === 5 && retry.live === 5 && retry.starts - retry.stops === 5, `${label}: やり直し 3 回の後も鳴っている音源は 5 個（エンジン ${retry.loops}・ページの数え ${retry.live}・作った ${retry.starts} − 止めた ${retry.stops}）`);
  check(quit.loops === 0 && quit.live === 0 && quit.peak < playing.peak * 0.05, `${label}: 任務をやめると 0 個・無音（エンジン ${quit.loops}・ページの数え ${quit.live}・頂 ${quit.peak.toFixed(5)}）`);
  const rs = loops.result;
  check(rs.bells === 2 && rs.ringPeak > 0.01 && rs.ringPeak < 1 && rs.loops === 0, `${label}: Result の鐘（帰投＝2 打）が鳴る（鐘 ${rs.bells} 打・Result の最初の 1.6 秒の頂 ${rs.ringPeak.toFixed(4)}・ループ ${rs.loops}・その後の窓の頂 ${rs.peak.toFixed(5)}）`);
} else if (!NO_AUDIO && end.sfx) {
  check(end.sfx.loops === 0 && end.sfx.loopStarts === 0, `${label}: 止まっている context ではループを 1 つも作らない（${end.sfx.loopStarts}）`);
}
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ label, errors, log, loops }, null, 1));
console.log(`sfx-live ${label} ${bad === 0 ? 'OK' : `NG ${bad}`}`);
process.exitCode = bad === 0 ? 0 : 1;
