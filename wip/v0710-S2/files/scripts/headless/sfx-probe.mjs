// 音の probe（v0.7.1 S2。spec-v0710 §9.3「sfx-probe」）: 任務ごとに、絵の層の口（fx-bus・explosion-fx・sink-fx）から頼まれた単発の音を「間引きの前」で全部記録し、
// 鍵ごとの回数・落とした数（理由ごと）・同時の声の最大を出す。偽の時計（rAF を止めて固定ステップ）なので、再生の時計の代わりにゲームの時計で声の空きを数える:
//   ?debug の window.__sfx（エンジン）の確かめの口 tap に記録の関数を付け、同じページの中で本物の判断のクラス（__sfx.mixer.constructor＝core/sfx-mix の SfxMixer）を
//   声 16 本（決定）と声 64 本（声の上限が無ければ同時に何本鳴りたがるか）の 2 つ作って、頼まれた順に通す。ゲームは import しない（開発の道具だけ）。
// 記録は rate の揺れの後・消音／停止／標本の有無の前で取る＝音の状態に依らず同じ（既定＝context は止まったまま、で回す。エンジンは音源を 1 つも作らない）。
// 台本: ab＝ab-replay の台本（最寄りの敵へ向かい、魚雷 12 秒ごと・機銃 8 秒のうち 3 秒。INPUT=both）・hold＝ab の操舵のまま機銃を押しっぱなし（連射の最悪）。
// 件（CASES で名前を選ぶ。既定は全部）: 9 任務＋ハード 7＝16 件（spec §3.4）と、混む窓 4 件（us_03 の連射＝大発が近い・jp_03 ハードの最後の波・jp_04 ハード・us_02 ハード）。
// 門（✓/✗。✗ があれば終了コード 1）: ページのエラー 0・同時の声 ≤ 16・S2 の鍵（mg・gun_near・gun_far・splash_s・splash_l・blast_s・blast_l・torp_hit・sink）が、
//   その鍵の出る任務（下の EXPECT）で 1 回以上鳴る・どの鍵も全部の件を通して 1 回以上。
// OUT=<json> に記録を書く（scripts/sfx-mix.ts の PROBE=<json> が波形に直して、リミッタ前の頂・1.0 超えの割合・RMS を出す）。
// 実行: SITE=<site> [CASES=us_03-burst,jp_03h-last] [JOBS=3] [OUT=<json>] node scripts/headless/sfx-probe.mjs
import { writeFileSync } from 'node:fs';
import { FRAME_MS, chromium, envNum, openGame, pool, serve } from './lib.mjs';
import { abRun } from './ab-replay.mjs';

if (!process.env.SITE) throw new Error('SITE=<site> が要る');
const VOICES = 16;
const S2_KEYS = ['mg', 'gun_near', 'gun_far', 'splash_s', 'splash_l', 'blast_s', 'blast_l', 'torp_hit', 'sink'];
const DROPS = ['', '間隔', '帯', '声'];

/**
 * 件: 名前・query・秒・台本（mode。無ければ ab）・その件で 1 回以上鳴るはずの鍵（spec §3.4 の表のうち、この台本と seed で実際に起きる出来事＝決定的。遊びを変えたら直す）。
 * 砲は駆逐艦（us_01・us_02・jp_06）・沿岸砲（us_03）・卯月（jp_04）、遠雷 gun_far は 1,500 m より遠い発砲（us_01 ハード）、魚雷の命中は us_02 と jp_04（輸送船の被雷）、
 * 機銃は自艇と米PT・対空、大きい水柱は命中・至近弾・爆弾、沈没は艦・輸送船・艇。us_03 は大発の近くで艇が沈むので短い（70 秒ほど）
 */
const CASES = [
  { name: 'us_01', q: 'mission=us_01&seed=1', secs: 200, expect: ['gun_near', 'splash_s', 'splash_l', 'blast_s'] },
  { name: 'us_01h', q: 'mission=us_01&seed=1&hard', secs: 200, expect: ['gun_near', 'gun_far', 'splash_s', 'splash_l', 'blast_s'] },
  { name: 'us_02', q: 'mission=us_02&seed=1', secs: 200, expect: ['mg', 'gun_near', 'splash_s', 'splash_l', 'blast_s', 'torp_hit', 'sink'] },
  { name: 'us_02h', q: 'mission=us_02&seed=1&hard', secs: 200, expect: ['gun_near', 'splash_s', 'splash_l', 'blast_s', 'blast_l'] },
  { name: 'us_03', q: 'mission=us_03&seed=1', secs: 200, expect: ['mg', 'gun_near', 'splash_s', 'blast_s', 'blast_l'] },
  { name: 'us_03h', q: 'mission=us_03&seed=1&hard', secs: 200, expect: ['mg', 'gun_near', 'splash_s', 'blast_s', 'blast_l'] },
  { name: 'jp_01', q: 'mission=jp_01&seed=1', secs: 200, expect: ['mg', 'splash_s', 'blast_s'] },
  { name: 'jp_01h', q: 'mission=jp_01&seed=1&hard', secs: 200, expect: ['mg', 'splash_s', 'splash_l', 'blast_s', 'blast_l', 'sink'] },
  { name: 'jp_02', q: 'mission=jp_02&seed=1', secs: 200, expect: ['blast_l'] },
  { name: 'jp_03', q: 'mission=jp_03&seed=1', secs: 260, expect: ['splash_l', 'blast_l', 'sink'] },
  { name: 'jp_03h', q: 'mission=jp_03&seed=1&hard', secs: 260, expect: ['splash_l', 'blast_l', 'sink'] },
  { name: 'jp_04', q: 'mission=jp_04&seed=1', secs: 170, expect: ['mg', 'gun_near', 'splash_s', 'blast_s', 'torp_hit', 'sink'] },
  { name: 'jp_04h', q: 'mission=jp_04&seed=1&hard', secs: 170, expect: ['mg', 'gun_near', 'splash_s', 'blast_s', 'torp_hit', 'sink'] },
  { name: 'jp_05', q: 'mission=jp_05&seed=1', secs: 200, expect: ['mg', 'splash_s', 'blast_s'] },
  { name: 'jp_06', q: 'mission=jp_06&seed=1', secs: 200, expect: ['gun_near', 'splash_s', 'splash_l', 'blast_s'] },
  { name: 'jp_06h', q: 'mission=jp_06&seed=1&hard', secs: 200, expect: ['gun_near', 'splash_s', 'splash_l', 'blast_s'] },
  // 混む窓（mix の門の 4 件。記録の全部ではなく一番混む 10 秒を scripts/sfx-mix が切り出す）
  { name: 'us_03-burst', q: 'mission=us_03&seed=1&barges=near', secs: 90, mode: 'hold', expect: ['mg', 'splash_s', 'blast_l'] },
  { name: 'jp_03h-last', q: 'mission=jp_03&seed=2&hard', secs: 260, mode: 'hold', expect: ['mg', 'splash_l', 'blast_l'] },
  { name: 'jp_04h-busy', q: 'mission=jp_04&seed=2&hard', secs: 170, mode: 'hold', expect: ['mg', 'gun_near', 'torp_hit', 'sink'] },
  { name: 'us_02h-busy', q: 'mission=us_02&seed=2&hard', secs: 200, mode: 'hold', expect: ['gun_near', 'splash_s', 'blast_s'] },
];

/** ページの中: 確かめの口に記録を付ける（頭の注）。行は [時刻, 鍵, dx, dy, rate, 倍率, 声（落としたら −1）, 落とした理由, 音量, パン, 帯, 奪ったか, 位置なしか] */
function install(voices) {
  const e = window.__sfx;
  if (!e) return false;
  const Mixer = e.mixer.constructor;
  const sim = new Mixer(voices);
  const wide = new Mixer(64);
  const log = [];
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  e.tap = (key, dx, dy, rate, mul, minS, flat) => {
    const t = e.clockS;
    const v = flat ? sim.playFlat(key, t, t, rate, mul) : sim.playAt(key, dx, dy, t, t, rate, mul, minS);
    if (flat) wide.playFlat(key, t, t, rate, mul); else wide.playAt(key, dx, dy, t, t, rate, mul, minS);
    log.push([r4(t), key, Math.round(dx), Math.round(dy), r4(rate), mul, v, sim.lastDrop, v >= 0 ? r4(sim.gain) : 0, v >= 0 ? r4(sim.pan) : 0, sim.band, v >= 0 && sim.stole ? 1 : 0, flat ? 1 : 0]);
  };
  window.__probe = { sim, wide, log, t0: e.clockS };
  return true;
}

/** ページの中: hold の台本（ab の操舵のまま、機銃を押しっぱなし・魚雷は 12 秒ごと） */
function holdRun(o) {
  const hl = window.__hl;
  const w = hl.world();
  let lastTorp = -1;
  for (let k = 0; k < Math.round(o.secs * 60); k++) {
    if (!hl.active('Mission')) break;
    const t = w.stepTimeS;
    const b = w.boat.state;
    const f = w.enemy.focus(b.x, b.y);
    const dist = f ? Math.hypot(f.x - b.x, f.y - b.y) : Infinity;
    if (t < 2) hl.steer(NaN, 0);
    else if (f && dist < o.near) hl.steer(hl.bearing(f.x, f.y, b.x, b.y), 0.6);
    else if (f) hl.steer(hl.bearing(b.x, b.y, f.x, f.y), dist > 1800 ? 0.6 : 0.4);
    else hl.steer((90 + t * 2) % 360, 0.5);
    const slot = Math.floor(t / 12);
    if (t > 8 && slot !== lastTorp && dist < 2500) { w.input.fireTap = true; lastTorp = slot; }
    w.input.gunHeld = true;
    hl.frame(o.frameMs);
  }
}

/** ページの中: 記録とまとめを取り出す */
function collect() {
  const p = window.__probe;
  const e = window.__sfx;
  const st = e.stats();
  return { log: p.log, t0: p.t0, t1: e.clockS, steals: p.sim.stolen, maxVoices: p.sim.maxBusy, demand: p.wide.maxBusy, dropped: Array.from(p.sim.dropped), engine: { state: st.state, sources: st.sources, idleDrops: st.idleDrops, noBuffer: st.noBuffer, buffers: st.buffers } };
}

async function oneCase(browser, base, c) {
  const { page, ctx, errors } = await openGame(browser, base, c.q, { width: envNum('W', 1560) });
  try {
    if (!(await page.evaluate(install, VOICES))) return { ...c, errors: [...errors, 'window.__sfx が無い（NOAUDIO では probe は回らない）'], log: [] };
    if (c.mode === 'hold') await page.evaluate(holdRun, { secs: c.secs, frameMs: FRAME_MS, near: c.near ?? 400 });
    else await page.evaluate(abRun, { secs: c.secs, frameMs: FRAME_MS, input: 'both', cam: false, ptrun: false, result: false });
    return { ...c, ...(await page.evaluate(collect)), errors };
  } finally {
    await ctx.close();
  }
}

/** 1 件のまとめ: 鍵ごとの 頼まれた数・鳴らした数・落とした数（間隔・帯・声）、一番混む 1 秒に鳴らした数 */
function summarize(r) {
  const per = {};
  const perSec = new Map();
  for (const row of r.log) {
    const k = (per[row[1]] ??= { req: 0, played: 0, drop: [0, 0, 0, 0], bands: [0, 0, 0, 0, 0] });
    k.req++;
    k.bands[row[10] < 0 ? 4 : row[10]]++;
    if (row[6] >= 0) { k.played++; const s = Math.floor(row[0]); perSec.set(s, (perSec.get(s) ?? 0) + 1); }
    else k.drop[row[7]]++;
  }
  let peakSec = 0;
  for (const n of perSec.values()) if (n > peakSec) peakSec = n;
  return { per, peakSec };
}

const only = process.env.CASES ? process.env.CASES.split(',') : null;
const cases = CASES.filter((c) => !only || only.includes(c.name));
const sv = await serve(process.env.SITE);
const browser = await chromium.launch();
const results = await pool(cases, envNum('JOBS', 3), (c) => oneCase(browser, sv.base, c));
await browser.close();
await sv.close();

let bad = 0;
const check = (ok, text) => { if (!ok) bad++; console.log(`${ok ? '✓' : '✗'} ${text}`); };
const total = Object.fromEntries(S2_KEYS.map((k) => [k, 0]));
for (const r of results) {
  const s = summarize(r);
  r.summary = s;
  const cells = Object.entries(s.per).map(([k, v]) => `${k} ${v.played}/${v.req}${v.drop[1] + v.drop[2] + v.drop[3] > 0 ? `（${[1, 2, 3].filter((i) => v.drop[i] > 0).map((i) => `${DROPS[i]} ${v.drop[i]}`).join('・')}）` : ''}`);
  console.log(`${r.name.padEnd(12)} ${(r.t1 - r.t0).toFixed(0).padStart(3)} 秒  頼まれた ${String(r.log.length).padStart(5)}  声の最大 ${r.maxVoices}（上限なしなら ${r.demand}）  奪った ${r.steals}  一番混む 1 秒 ${s.peakSec} 発  ${cells.join('  ')}`);
  if (r.engine) console.log(`${''.padEnd(12)} エンジン（既定の状態）: ${r.engine.state}・音源 ${r.engine.sources}・捨てた（消音・停止）${r.engine.idleDrops}・標本がまだ無い ${r.engine.noBuffer}・標本 ${r.engine.buffers} 本`);
  for (const k of S2_KEYS) total[k] += s.per[k] ? s.per[k].played : 0;
  check(r.errors.length === 0, `${r.name}: ページのエラー 0${r.errors.length ? `（${r.errors[0]}）` : ''}`);
  check(r.maxVoices <= VOICES, `${r.name}: 同時の声 ≤ ${VOICES}（${r.maxVoices}）`);
  const missing = r.expect.filter((k) => !s.per[k] || s.per[k].played === 0);
  if (r.expect.length > 0) check(missing.length === 0, `${r.name}: この任務で鳴るはずの鍵が鳴る（${r.expect.join('・')}${missing.length ? ` ＝鳴らない: ${missing.join('・')}` : ''}）`);
}
if (!only) for (const k of S2_KEYS) check(total[k] > 0, `${k}: 全部の件を通して 1 回以上鳴る（${total[k]}）`);
console.log(`全部の件の合計（鳴らした数）: ${S2_KEYS.map((k) => `${k} ${total[k]}`).join('  ')}`);
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ voices: VOICES, cases: results.map((r) => ({ name: r.name, q: r.q, secs: r.secs, mode: r.mode ?? 'ab', t0: r.t0, t1: r.t1, steals: r.steals, maxVoices: r.maxVoices, demand: r.demand, engine: r.engine, errors: r.errors, log: r.log })) }));
console.log(`sfx-probe ${bad === 0 ? 'OK' : `NG ${bad}`}（${results.length} 件）`);
process.exitCode = bad === 0 ? 0 : 1;
