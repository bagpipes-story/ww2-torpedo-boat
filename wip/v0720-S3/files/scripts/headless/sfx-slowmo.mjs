// 命中スローの音の確かめ（v0.7.2 S3。spec-v0720 §6.4・§8.2）: 本物の context（AUDIO=1＝autoplay を許す＝running）で、ゲームと同じ道の命中スロー（?debug の世界の slowMoLeftS に
// data の秒を入れる＝命中の代わり。単発は鳴らさない＝ベッドだけを測る）が、master の後で 2 kHz より上の強さを下げて戻すかを測る。ゲームは import しない（開発の道具だけ）。
// 時計: lib.mjs の openGame（rAF を止める）で開き、ページの中の 60 Hz のタイマーが実時間の delta で 1 フレームずつ進める（描かない＝主の糸が軽く、20 ms ごとの測りが遅れない。
//   再生の context は実時間。世界の残り秒も実時間で減る＝ゲームと同じ）。?debug の時だけ systems/sfx-boot が公開する window.__sfx（エンジン）の stats() と slow.setVariant（試聴の場と同じ口）を使う。
// 流れ: ?debug の直行（MISSION・seed 1。艇は動かさない）→ ループ 5 本と任務の曲の 3 層が鳴るまで → 組（ループだけ＝曲オフ／曲あり）ごとに 4 秒待って、案ごとに（VARIANTS を REPEAT 回）:
//   setVariant(案) → 1.5 秒 → slowMoLeftS ＝ 1.2 → 4 秒。master につないだ AnalyserNode（fftSize 2048・smoothing 0）と、濾波器の前のベッド（ループの束と曲の下げる音量の出口を同じ
//   もう 1 つの AnalyserNode へも分けてつなぐ＝ゲームの音は変わらない）を 10 ms ごとに読み、帯（2 kHz より上・下）の電力の和を context の時刻つきで記録する。
// 数（スローを入れた時刻 t0 から。dB）: 前＝[t0 − 1, t0) の平均・0.2 秒＝[t0 + 0.2, t0 + 0.3] の中央値・下がり＝[t0 + 0.2, t0 + 1.1] の平均・戻り＝[t0 + 1.2 + 1.5, t0 + 1.2 + 2.3] の平均。
//   出口＝master の 2 kHz より上の強さそのもの（spec §6.4 の数。海の波のうねり・曲の音符で窓ごとに ±3 dB ほど揺れる）。濾波＝master ÷ 濾波器の前のベッド（同じ時刻の比＝中身の揺れが消え、
//   濾波器の効きだけが残る。案 A の rate の下げは両方に入る）。
// 門: 曲ありの組（ゲームの状態）の出口で、案 A の 0.2 秒と下がりが ≥ 12 dB（spec §6.4）。濾波で、案 A・B の下がりが ≥ 12 dB（0.2 秒は記録。1,100 Hz の 2 次の低域通過は 2 kHz より上を
//   定常で約 13.5 dB 下げる）・どの案も戻りが前の ±0.5 dB・案 C の 0.2 秒と下がりが ±0.5 dB（下がらない）。
//   ループだけの組の出口の数は記録だけ（案 A は rate の下げで海の高い音が濾波器の弱く効く所へ下がるので、出口の下がりが B より小さい）。どの回も stats().slow の立ち上がりが 1 つ増え、
//   終わりは書いた形が素通し（shown null）・濾波器の Hz が素通し・曲の rate 1・窓の間に単発が鳴っていない。ページのエラー 0。
// 実行: SITE=<site> AUDIO=1 [MISSION=us_03] [VARIANTS=A,B,C] [REPEAT=2] [SETS=loops,music] [OUT=<json>] node scripts/headless/sfx-slowmo.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium, envNum, openGame, serve } from './lib.mjs';

if (!process.env.SITE) throw new Error('SITE=<site> が要る');
if (process.env.AUDIO !== '1') throw new Error('AUDIO=1 で回す（context が running でないと測れない）');
const MISSION = process.env.MISSION ?? 'us_03';
const VARIANTS = (process.env.VARIANTS ?? 'A,B,C').split(',');
const REPEAT = envNum('REPEAT', 2);
const SETS = (process.env.SETS ?? 'loops,music').split(',');
const SPLIT_HZ = 2000;
/** 命中スローの秒（世界と同じ data）と、ベッドの濾波器の素通しの Hz（config/sfx-music-config の SFX_SLOW_SHAPE.idleHz の写し＝ゲームは import しない） */
const SLOW_S = JSON.parse(readFileSync(new URL('../../data/hit_rate_model.json', import.meta.url), 'utf8')).feel.hit_slowmo_seconds;
const IDLE_HZ = 20000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ページの中: 実時間の 60 Hz で 1 フレームずつ進め（描かない）、master と濾波器の前のベッドの AnalyserNode を 10 ms ごとに
 * [context の時刻, master の 2 kHz より上・下の電力, ベッドの 2 kHz より上・下の電力]（線形）
 */
function startDrive(splitHz) {
  let last = performance.now();
  setInterval(() => { const n = performance.now(); window.__hl.frame(Math.min(100, n - last)); last = n; }, 1000 / 60);
  const ctx = window.__game.sound.context;
  const sfx = window.__sfx;
  const mk = () => { const a = ctx.createAnalyser(); a.fftSize = 2048; a.smoothingTimeConstant = 0; return a; };
  const post = mk(), pre = mk();
  sfx.master.connect(post);
  sfx.loopBus.connect(pre); // 濾波器の前（ループの束と曲の下げる音量の出口＝濾波器の入り口と同じ和）
  sfx.music.duck.connect(pre);
  const buf = new Float32Array(post.frequencyBinCount);
  const k0 = Math.ceil(splitHz / (ctx.sampleRate / post.fftSize));
  const bands = (an) => { an.getFloatFrequencyData(buf); let hi = 0, lo = 0; for (let i = 1; i < buf.length; i++) { const p = 10 ** (buf[i] / 10); if (i >= k0) hi += p; else lo += p; } return [hi, lo]; };
  const rows = (window.__spec = []);
  setInterval(() => rows.push([ctx.currentTime, ...bands(post), ...bands(pre)]), 10);
  return { sr: ctx.sampleRate, k0 };
}

const sv = await serve(process.env.SITE);
const browser = await chromium.launch();
const { page, ctx, errors } = await openGame(browser, sv.base, `mission=${MISSION}&seed=1`, { width: envNum('W', 1560) });
const info = await page.evaluate(startDrive, SPLIT_HZ);
await page.waitForFunction(() => { const st = window.__sfx.stats(); return st.state === 'running' && st.music.sources === 3 && st.loops === 5; }, null, { timeout: 90000, polling: 100 }); // rAF は止めてある＝時間で見る
const stat = () => page.evaluate(() => { const st = window.__sfx.stats(); return { slow: st.slow, shots: st.sources, mood: st.music.mood, music: st.music.sources, loops: st.loops, t: window.__game.sound.context.currentTime }; });
const wins = [];
for (const set of SETS) {
  await page.evaluate((on) => window.__sfx.music.setEnabled(on), set === 'music');
  await sleep(4000); // 曲を止める・頭から上げる（任務の曲は 3 秒）
  for (let r = 0; r < REPEAT; r++) {
    for (const v of VARIANTS) {
      await page.evaluate((id) => window.__sfx.slow.setVariant(id), v);
      await sleep(1500);
      const before = await stat();
      const t0 = await page.evaluate((s) => { window.__game.scene.getScene('Mission').world.slowMoLeftS = s; return window.__game.sound.context.currentTime; }, SLOW_S);
      await sleep(600);
      const mid = await stat();
      await sleep(3400);
      wins.push({ set, v, r, t0, before, mid, after: await stat() });
    }
  }
}
const rows = await page.evaluate(() => window.__spec);
await ctx.close();
await browser.close();
await sv.close();

const sel = (a, b) => rows.filter((w) => w[0] >= a && w[0] < b);
const dB = (v) => 10 * Math.log10(v + 1e-30);
/** 窓の出口（master の 2 kHz より上の平均の電力）と濾波（master ÷ ベッドの電力の和の比）・行ごとの中央値（dB） */
const outMean = (a, b) => { const x = sel(a, b); return x.length ? dB(x.reduce((p, w) => p + w[1], 0) / x.length) : NaN; };
const lowMean = (a, b, col) => { const x = sel(a, b); return x.length ? dB(x.reduce((p, w) => p + w[col], 0) / x.length) : NaN; };
const ratio = (a, b) => { const x = sel(a, b); return x.length ? dB(x.reduce((p, w) => p + w[1], 0) / Math.max(1e-30, x.reduce((p, w) => p + w[3], 0))) : NaN; };
const medianOf = (xs) => { const x = [...xs].sort((p, q) => p - q); return x.length ? x[x.length >> 1] : NaN; };
const outMedian = (a, b) => medianOf(sel(a, b).map((w) => dB(w[1])));
const ratioMedian = (a, b) => medianOf(sel(a, b).map((w) => dB(w[1]) - dB(w[3])));
let bad = 0;
const check = (ok, text) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${text}`); };
const span = rows.length > 1 ? rows[rows.length - 1][0] - rows[0][0] : 0;
console.log(`命中スローの音（${MISSION}・context ${info.sr} Hz・2 kHz より上＝${info.k0} 番目の帯から・記録 ${rows.length} 行／${span.toFixed(1)} 秒＝${(rows.length / Math.max(1e-9, span)).toFixed(0)} 回/秒・スロー ${SLOW_S} 秒）`);
for (const w of wins) {
  const t = w.t0, end = t + SLOW_S;
  const pre = outMean(t - 1, t), rPre = ratio(t - 1, t);
  const out = { at02: outMedian(t + 0.2, t + 0.3) - pre, dip: outMean(t + 0.2, t + 1.1) - pre, back: outMean(end + 1.5, end + 2.3) - pre };
  const filt = { at02: ratioMedian(t + 0.2, t + 0.3) - rPre, dip: ratio(t + 0.2, t + 1.1) - rPre, back: ratio(end + 1.5, end + 2.3) - rPre };
  const lo = [lowMean(t - 1, t, 2), lowMean(t + 0.2, t + 1.1, 2), lowMean(end + 1.5, end + 2.3, 2)];
  w.db = { pre, out, filt, lo };
  const f1 = (x) => x.toFixed(1);
  const name = `${w.set === 'music' ? '曲あり' : 'ループだけ'}・案 ${w.v}（${w.r + 1} 回目）`;
  console.log(`  ${name}: 出口の 2 kHz より上 ${f1(pre)} dB から 0.2 秒 ${f1(out.at02)}・下がり ${f1(out.dip)}・戻り ${f1(out.back)} ／ 濾波 0.2 秒 ${f1(filt.at02)}・下がり ${f1(filt.dip)}・戻り ${filt.back.toFixed(2)} dB（出口の下の帯 ${lo.map(f1).join(' → ')}）・最中の形 ${w.mid.slow.shown ?? '素通し'} ${w.mid.slow.filterHz} Hz・曲の rate ${w.mid.slow.musicRate}・段 ${w.mid.mood}`);
  if (w.v === 'A' && w.set === 'music') check(-out.at02 >= 12 && -out.dip >= 12, `${name}: 出口の 2 kHz より上が 0.2 秒の内に ≥ 12 dB 下がる（0.2 秒 ${f1(-out.at02)}・0.2〜1.1 秒 ${f1(-out.dip)} dB）`);
  if (w.v === 'C') check(Math.abs(filt.dip) <= 0.5 && Math.abs(filt.at02) <= 0.5, `${name}: 濾波は下がらない（0.2 秒 ${filt.at02.toFixed(2)}・0.2〜1.1 秒 ${filt.dip.toFixed(2)} dB・門 ±0.5。出口は ${f1(out.dip)} dB＝中身の揺れ）`);
  else check(-filt.dip >= 12, `${name}: 濾波が ≥ 12 dB 下がる（0.2〜1.1 秒 ${f1(-filt.dip)} dB・0.2 秒 ${f1(-filt.at02)} dB）`);
  check(Math.abs(filt.back) <= 0.5, `${name}: 終わりの 1.5 秒の後は濾波が前の ±0.5 dB に戻る（${filt.back.toFixed(2)} dB。出口は ${f1(out.back)} dB）`);
  const s = w.after.slow;
  check(s.rises === w.before.slow.rises + 1 && !s.on && s.shown === null && s.filterHz === IDLE_HZ && s.musicRate === 1 && w.after.shots === w.before.shots, `${name}: 立ち上がり 1・終わりは素通し（形 ${s.shown ?? 'null'}・${s.filterHz} Hz・曲の rate ${s.musicRate}）・窓の間の単発 ${w.after.shots - w.before.shots}`);
}
check(errors.length === 0, `ページのエラー 0${errors.length ? `（${errors.length} 件: ${errors[0]}）` : ''}`);
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ mission: MISSION, info, wins, rows }));
console.log(`sfx-slowmo ${bad === 0 ? 'OK' : `NG ${bad}`}`);
process.exitCode = bad === 0 ? 0 : 1;
