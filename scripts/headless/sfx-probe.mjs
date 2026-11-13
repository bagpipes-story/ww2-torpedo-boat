// 音の probe（v0.7.1 S2。spec-v0710 §9.3「sfx-probe」）: 任務ごとに、絵の層の口（fx-bus・explosion-fx・sink-fx）から頼まれた単発の音を「間引きの前」で全部記録し、
// 鍵ごとの回数・落とした数（理由ごと）・同時の声の最大を出す。偽の時計（rAF を止めて固定ステップ）なので、再生の時計の代わりにゲームの時計で声の空きを数える:
//   ?debug の window.__sfx（エンジン）の確かめの口 tap に記録の関数を付け、同じページの中で本物の判断のクラス（__sfx.mixer.constructor＝core/sfx-mix の SfxMixer）を
//   声 16 本（決定）と声 64 本（声の上限が無ければ同時に何本鳴りたがるか）の 2 つ作って、頼まれた順に通す。ゲームは import しない（開発の道具だけ）。
// 記録は rate の揺れの後・消音／停止／標本の有無の前で取る＝音の状態に依らず同じ（既定＝context は止まったまま、で回す。エンジンは音源を 1 つも作らない）。
// 台本と件は sfx-probe-cases.mjs（CASES で名前を選ぶ。既定は全部＝9 任務＋ハード 7・ループの件 4・合図の件 7・混む窓 4＝31 件）。
// 門（✓/✗。✗ があれば終了コード 1）: ページのエラー 0・同時の声 ≤ 16・S2 の鍵（mg・gun_near・gun_far・splash_s・splash_l・blast_s・blast_l・torp_hit・sink）が、
//   その鍵の出る任務（下の EXPECT）で 1 回以上鳴る・どの鍵も全部の件を通して 1 回以上。
// S3（ループ）: 同じ回で、ループ 5 本（engine・sea・fire・rain・drone）の目標（Hud の MissionSfx が毎フレーム決める音量・rate）も記録する。systems/sfx-loop-player と同じ決め
//   （10 Hz・音量の差 > 0.01・rate の差 > 0.005・0 へは必ず）で「ノードへ書く」時だけ 1 行＝[時刻, 音量 5 本, engine の rate, drone の rate]。件ごとに、ループごとの
//   鳴っていた割合・一番大きい音量・変わった回数、engine の音量の段、一番混む 1 秒に書いた回数を出す。門: engine と sea はどの件でも鳴る・書くのは毎秒 10 回 × 項目の数まで・
//   その件で鳴るはずのループ（下の loops_expect。暴風の雨・火災・機の爆音＝この台本と seed で実際に起きる）が鳴る。
// S4（合図）: 件と台本は sfx-probe-cases.mjs（合図の台本 cue と件 7 本を足した）。位置なしの単発（core/sfx-cues の合図・Result の鐘）を件ごとに「鍵@速さ×音量」で数え、門: その件で鳴るはずの合図（cues）が鳴る・
//   25 本の鍵が全部の件を通して 1 回以上鳴る（spec §3.4 の表）。遅らせる合図は鳴り始める時刻で記録する。
// OUT=<json> に記録を書く（scripts/sfx-mix.ts の PROBE=<json> が波形に直して、リミッタ前の頂・1.0 超えの割合・RMS を出す）。
// 実行: SITE=<site> [CASES=us_03-burst,jp_03h-last] [JOBS=3] [OUT=<json>] node scripts/headless/sfx-probe.mjs
import { writeFileSync } from 'node:fs';
import { FRAME_MS, chromium, envNum, openGame, pool, serve } from './lib.mjs';
import { abRun } from './ab-replay.mjs';
import { CASES, cueRun, holdRun, homeRun } from './sfx-probe-cases.mjs';

if (!process.env.SITE) throw new Error('SITE=<site> が要る');
const VOICES = 16;
const S2_KEYS = ['mg', 'gun_near', 'gun_far', 'splash_s', 'splash_l', 'blast_s', 'blast_l', 'torp_hit', 'sink'];
const DROPS = ['', '間隔', '帯', '声'];

/** ループの並び（core/sfx-loops の SFX_LOOP_IDS）と、書く時の決め（config/sfx-config の SFX_LOOP_*。ゲームは import しないのでここに写す） */
const LOOP_IDS = ['engine', 'sea', 'fire', 'rain', 'drone'];
const LOOP_RULE = { tickS: 0.1, gainEps: 0.01, rateEps: 0.005 };

/** ページの中: 確かめの口に記録を付ける（頭の注）。行は [時刻, 鍵, dx, dy, rate, 倍率, 声（落としたら −1）, 落とした理由, 音量, パン, 帯, 奪ったか, 位置なしか] */
function install({ voices, rule }) {
  const e = window.__sfx;
  if (!e) return false;
  // S3: ループの目標（Hud の MissionSfx の loopTargets を読むだけ）。フレームを進める口を包み、進めた後に 10 Hz で見る
  const loops = [];
  const last = [0, 0, 0, 0, 0, 1, 1];
  let acc = 0;
  const hl = window.__hl;
  const frame0 = hl.frame;
  hl.frame = (d) => {
    frame0(d);
    acc += d / 1000;
    if (acc < rule.tickS) return;
    acc = acc < 2 * rule.tickS ? acc - rule.tickS : 0;
    const hud = window.__game.scene.getScene('Hud');
    const t = hud && hud.sfx && hl.active('Hud') ? hud.sfx.loopTargets : null;
    if (!t) return;
    const now = [t.gain[0], t.gain[1], t.gain[2], t.gain[3], t.gain[4], t.rate[0], t.rate[4]];
    let writes = 0;
    for (let i = 0; i < 7; i++) {
      const d2 = Math.abs(now[i] - last[i]);
      if (i < 5 ? d2 > rule.gainEps || (now[i] === 0 && d2 !== 0) : d2 > rule.rateEps) { last[i] = now[i]; writes++; }
    }
    if (writes > 0) loops.push([Math.round(e.clockS * 1e3) / 1e3, ...last.map((v) => Math.round(v * 1e4) / 1e4), writes]);
  };
  const Mixer = e.mixer.constructor;
  const sim = new Mixer(voices);
  const wide = new Mixer(64);
  const log = [];
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  e.tap = (key, dx, dy, rate, mul, minS, flat, delay) => {
    const t = e.clockS;
    const d = delay > 0 ? delay : 0; // S4: 遅らせる合図（座礁・Result の鐘の 2 打目）は鳴り始める時刻で記録する
    const v = flat ? sim.playFlat(key, t, t, rate, mul, d) : sim.playAt(key, dx, dy, t, t, rate, mul, minS);
    if (flat) wide.playFlat(key, t, t, rate, mul, d); else wide.playAt(key, dx, dy, t, t, rate, mul, minS);
    log.push([r4(t + d), key, Math.round(dx), Math.round(dy), r4(rate), mul, v, sim.lastDrop, v >= 0 ? r4(sim.gain) : 0, v >= 0 ? r4(sim.pan) : 0, sim.band, v >= 0 && sim.stole ? 1 : 0, flat ? 1 : 0]);
  };
  window.__probe = { sim, wide, log, loops, t0: e.clockS };
  return true;
}

/** ページの中: 記録とまとめを取り出す */
function collect() {
  const p = window.__probe;
  const e = window.__sfx;
  const st = e.stats();
  return { log: p.log, loops: p.loops, t0: p.t0, t1: e.clockS, steals: p.sim.stolen, maxVoices: p.sim.maxBusy, demand: p.wide.maxBusy, dropped: Array.from(p.sim.dropped), engine: { state: st.state, sources: st.sources, idleDrops: st.idleDrops, noBuffer: st.noBuffer, buffers: st.buffers } };
}

async function oneCase(browser, base, c) {
  const { page, ctx, errors } = await openGame(browser, base, c.q, { width: envNum('W', 1560) });
  try {
    if (!(await page.evaluate(install, { voices: VOICES, rule: LOOP_RULE }))) return { ...c, errors: [...errors, 'window.__sfx が無い（NOAUDIO では probe は回らない）'], log: [] };
    if (c.mode === 'home') await page.evaluate(homeRun, { secs: c.secs, frameMs: FRAME_MS });
    else if (c.mode === 'hold') await page.evaluate(holdRun, { secs: c.secs, frameMs: FRAME_MS, near: c.near ?? 400 });
    else if (c.mode === 'cue') await page.evaluate(cueRun, { ...c, frameMs: FRAME_MS });
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
  return { per, peakSec, loops: summarizeLoops(r) };
}

/** S3: ループの記録のまとめ: ループごとの 鳴っていた割合・一番大きい音量・変わった回数、engine の音量の段、一番混む 1 秒に書いた回数 */
function summarizeLoops(r) {
  const rows = r.loops ?? [];
  const span = Math.max(1e-9, r.t1 - r.t0);
  const per = LOOP_IDS.map(() => ({ onS: 0, max: 0, changes: 0 }));
  const steps = new Set();
  const perSec = new Map();
  let prev = [0, 0, 0, 0, 0];
  let prevT = r.t0;
  for (const row of rows) {
    for (let i = 0; i < 5; i++) {
      if (prev[i] > 0) per[i].onS += row[0] - prevT;
      if (row[1 + i] !== prev[i]) per[i].changes++;
      if (row[1 + i] > per[i].max) per[i].max = row[1 + i];
    }
    steps.add(row[1]);
    const s = Math.floor(row[0]);
    perSec.set(s, (perSec.get(s) ?? 0) + row[8]);
    prev = row.slice(1, 6);
    prevT = row[0];
  }
  for (let i = 0; i < 5; i++) if (prev[i] > 0) per[i].onS += r.t1 - prevT;
  let peakWrites = 0;
  for (const n of perSec.values()) if (n > peakWrites) peakWrites = n;
  return { per: per.map((p) => ({ share: p.onS / span, max: p.max, changes: p.changes })), engineSteps: [...steps].sort((a, b) => a - b), peakWrites, rows: rows.length, writes: rows.reduce((a, row) => a + row[8], 0) };
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
const everyKey = {}; // S4: 25 本の鍵ごとに、全部の件を通して鳴った数（単発は鳴らした数・ループは鳴っていた件の数）
for (const r of results) {
  const s = summarize(r);
  r.summary = s;
  const cells = Object.entries(s.per).map(([k, v]) => `${k} ${v.played}/${v.req}${v.drop[1] + v.drop[2] + v.drop[3] > 0 ? `（${[1, 2, 3].filter((i) => v.drop[i] > 0).map((i) => `${DROPS[i]} ${v.drop[i]}`).join('・')}）` : ''}`);
  console.log(`${r.name.padEnd(12)} ${(r.t1 - r.t0).toFixed(0).padStart(3)} 秒  頼まれた ${String(r.log.length).padStart(5)}  声の最大 ${r.maxVoices}（上限なしなら ${r.demand}）  奪った ${r.steals}  一番混む 1 秒 ${s.peakSec} 発  ${cells.join('  ')}`);
  if (r.engine) console.log(`${''.padEnd(12)} エンジン（既定の状態）: ${r.engine.state}・音源 ${r.engine.sources}・捨てた（消音・停止）${r.engine.idleDrops}・標本がまだ無い ${r.engine.noBuffer}・標本 ${r.engine.buffers} 本`);
  for (const k of S2_KEYS) total[k] += s.per[k] ? s.per[k].played : 0;
  for (const [k, v] of Object.entries(s.per)) everyKey[k] = (everyKey[k] ?? 0) + v.played;
  // S4: 状態の合図（位置なしの単発＝core/sfx-cues と Result の鐘）の鍵ごとの鳴らした数
  const cues = {};
  const byRate = {}; // 表示は「鍵@速さ」（速さ 1 以外。音量 1 以外は ×音量）
  for (const row of r.log) {
    if (row[12] !== 1 || row[6] < 0) continue;
    cues[row[1]] = (cues[row[1]] ?? 0) + 1;
    const label = `${row[1]}${row[4] !== 1 ? `@${row[4]}` : ''}${row[5] !== 1 ? `×${row[5]}` : ''}`;
    byRate[label] = (byRate[label] ?? 0) + 1;
  }
  r.cueCounts = byRate;
  console.log(`${''.padEnd(12)} 合図: ${Object.keys(byRate).length ? Object.entries(byRate).map(([k, n]) => `${k} ${n}`).join('  ') : '（なし）'}`);
  const noCue = (r.cues ?? []).filter((k) => !cues[k]);
  if ((r.cues ?? []).length > 0) check(noCue.length === 0, `${r.name}: この件で鳴るはずの合図が鳴る（${r.cues.join('・')}${noCue.length ? ` ＝鳴らない: ${noCue.join('・')}` : ''}）`);
  check(r.errors.length === 0, `${r.name}: ページのエラー 0${r.errors.length ? `（${r.errors[0]}）` : ''}`);
  check(r.maxVoices <= VOICES, `${r.name}: 同時の声 ≤ ${VOICES}（${r.maxVoices}）`);
  const L = s.loops;
  LOOP_IDS.forEach((id, i) => { if (L.per[i].max > 0) everyKey[id] = (everyKey[id] ?? 0) + 1; });
  console.log(`${''.padEnd(12)} ループ: ${LOOP_IDS.map((id, i) => `${id} ${(L.per[i].share * 100).toFixed(0)}% 最大 ${L.per[i].max.toFixed(2)} 変化 ${L.per[i].changes}`).join('  ')}  engine の段 ${L.engineSteps.join('/')}  書いた ${L.writes} 回（一番混む 1 秒 ${L.peakWrites}）`);
  check(L.per[0].max > 0 && L.per[1].max > 0, `${r.name}: エンジンと海のループが鳴る（最大 ${L.per[0].max}・${L.per[1].max}）`);
  check(L.peakWrites <= 10 * 7, `${r.name}: ループの書き込みは毎秒 10 回 × 7 項目まで（一番混む 1 秒 ${L.peakWrites}）`);
  const wantLoops = r.loops_expect ?? [];
  const noLoop = wantLoops.filter((id) => L.per[LOOP_IDS.indexOf(id)].max === 0);
  if (wantLoops.length > 0) check(noLoop.length === 0, `${r.name}: この任務で鳴るはずのループが鳴る（${wantLoops.join('・')}${noLoop.length ? ` ＝鳴らない: ${noLoop.join('・')}` : ''}）`);
  const missing = r.expect.filter((k) => !s.per[k] || s.per[k].played === 0);
  if (r.expect.length > 0) check(missing.length === 0, `${r.name}: この任務で鳴るはずの鍵が鳴る（${r.expect.join('・')}${missing.length ? ` ＝鳴らない: ${missing.join('・')}` : ''}）`);
}
if (!only) for (const k of S2_KEYS) check(total[k] > 0, `${k}: 全部の件を通して 1 回以上鳴る（${total[k]}）`);
console.log(`全部の件の合計（鳴らした数）: ${S2_KEYS.map((k) => `${k} ${total[k]}`).join('  ')}`);
// S4（spec §3.4 の表を埋める）: 25 本の鍵がどれも全部の件を通して 1 回以上鳴る（ループは鳴っていた件の数）
const ALL_KEYS = [...S2_KEYS, 'torp_launch', 'hull_hit', 'alarm', 'light_on', 'flare_pop', 'bomb_fall', 'reload', 'smoke', 'ui_tap', 'bell', 'engine_cough', ...LOOP_IDS];
console.log(`25 本の鍵（全部の件を通して）: ${ALL_KEYS.map((k) => `${k} ${everyKey[k] ?? 0}`).join('  ')}`);
if (!only) check(ALL_KEYS.every((k) => (everyKey[k] ?? 0) > 0), `25 本の鍵がどれも 1 回以上鳴る${ALL_KEYS.some((k) => !everyKey[k]) ? `（鳴らない: ${ALL_KEYS.filter((k) => !everyKey[k]).join('・')}）` : ''}`);
if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify({ voices: VOICES, cases: results.map((r) => ({ name: r.name, q: r.q, secs: r.secs, mode: r.mode ?? 'ab', t0: r.t0, t1: r.t1, steals: r.steals, maxVoices: r.maxVoices, demand: r.demand, engine: r.engine, errors: r.errors, log: r.log, loops: r.loops ?? [], cueCounts: r.cueCounts })) }));
console.log(`sfx-probe ${bad === 0 ? 'OK' : `NG ${bad}`}（${results.length} 件）`);
process.exitCode = bad === 0 ? 0 : 1;
