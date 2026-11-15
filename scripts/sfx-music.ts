// 曲の確かめ（v0.7.2 S0。spec-v0720 §3・§8.2）: assets/sfx-music-* の曲 4 本（タイトルの曲 D＝IP2 で A・E・S4 で聞き比べの D（前）を消した、任務の層 L0・L1・L2）を作曲・合成し、耳の代わりの数を出す。
// ゲームは import しない。
// - SEARCH=1（v0.7.2 IP2）: D は MUSIC_SEED_SEARCH_D の区間の種を全部作曲して旋律の点（assets/sfx-music-score）を比べ、点の上位 5 つ（点の内訳と決まりの破れ）と一番の種を出す
//   （config/sfx-music-config の SFX_SEED_MUSIC_D に書く数。tests/sfx-music-score が同じ区間で確かめ直す）。L0〜L2 は種を動かさない（IP1 の標本のまま）: 「決まりを全部通る最初の種」
//   の鎖（L0 は 7628 から＝消した A 7603・E 7627 の次。D（前）の 7604 からの鎖は S4 で D（前）と一緒に消した）を確かめて出す。
// - 既定: 鍵ごとに 長さ・頂・RMS（dBFS）・400 Hz より上と 200 Hz より下のエネルギーの割合（§3.3: 上 ≥ 60%・下 ≤ 12%）・2.5 kHz より上の割合（IP1: 尖った倍音の目安）・継ぎ目（末尾 → 頭の標本の差と、ふつうの差の
//   中央値・99%。継ぎ目をまたぐ 50 ms の RMS とその前後）・重心・作る費用（単位・予算 MUSIC_BUILD_BUDGET で何フレーム）と node の時間（1 回の stepBuild の中央値・95%・最大）・
//   旋律の数（強拍の和音の音の割合・順次の割合・跳躍の戻り・音域・句の終わりの音・決まりの破れ）と旋律の点。任務の段（静か・緊張・戦闘）の重ね（L2 は 4 回）と、出口（× 音量 × master 0.8）の
//   RMS を目標（§3.4）と比べ、音量の案（目標 ÷（RMS × 0.8）。緊張・戦闘は重ねて二分法）を出す。IP1: 緊張と戦闘の違い（発音の密度・2〜5 kHz の帯の出口・RMS。tests/sfx-music-contrast と同じ数え方）。
// - WAV=1: <出力先>/<鍵>.wav（16 bit・モノ・22,050 Hz。LOOP=<回数> で輪を続けて書く＝継ぎ目を聴く）と段の重ね mix-tense.wav・mix-battle.wav（頂 0.9 にそろえる）。
//   PNG=1: <出力先>/music-strip.png（鍵の順に波形と声紋の帯）。出力先は scratchpad（repo には音・画像のファイルを入れない）。
// - RAW=1（v0.7.2 S1）: メニューの mix の材料 <出力先>/raw-menu-<鍵>.json（タイトルの曲ごとに 12 秒: 曲の頭から × MUSIC_GAIN と、1 秒目から 1.5 秒おきのボタンの音 ui_tap
//   ＝表の音量 × 中央のパン 0.707 の左右）。scripts/headless/sfx-offline.mjs が本物のリミッタ（ボタンの音）と master へ直の曲の束で出口を作り、ボタンの音の頂と曲の RMS の差を出す。
// 実行: npx esbuild scripts/sfx-music.ts --bundle --platform=node --format=esm --outfile=<scratch>/sfx-music.mjs && [SEARCH=1] [WAV=1] [PNG=1] node <scratch>/sfx-music.mjs [<出力先>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MUSIC_BUILD_BUDGET, MUSIC_GAIN, MUSIC_KEYS, MUSIC_LAYER_KEYS, MUSIC_MASTER_GAIN, MUSIC_MOOD_WEIGHTS, MUSIC_SAMPLE_RATE, MUSIC_SEED_SEARCH_D, MUSIC_TARGET_DBFS, MUSIC_TITLE_KEYS, MUSIC_WORK_SAMPLES,
  type MusicKey,
} from '../src/config/sfx-music-config';
import { SFX_MAX_TOTAL_SAMPLES, SFX_TABLE } from '../src/config/sfx-config';
import { renderSfx } from '../src/assets/sfx-bank';
import { composeMusic, melodyCheck, type MusicScore } from '../src/assets/sfx-music-compose';
import { MusicBuilder, composeMusicKey } from '../src/assets/sfx-music-render';
import { MusicTables } from '../src/assets/sfx-music-synth';
import { musicality } from '../src/assets/sfx-music-score';
import { MUSIC_SEEDS, MUSIC_THEMES, MUSIC_TITLE_DEFAULT_ID } from '../src/assets/sfx-music-themes';
import { SeededRng } from '../src/core/rng';
import { STRIP_H, STRIP_W, bandShare, bandShares, centroidHz, drawStrip, onsetRate, pngBytes, wavBytes } from './sfx-files';

const SR = MUSIC_SAMPLE_RATE;
const dbfs = (v: number): string => (v > 0 ? `${(20 * Math.log10(v)).toFixed(1)}` : '-inf');
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const noteName = (p: number): string => `${NAMES[((Math.round(p) % 12) + 12) % 12]}${Math.floor(Math.round(p) / 12) - 1}`;
const pct = (v: number): string => `${(v * 100).toFixed(0)}%`;
const peakOf = (x: Float32Array): number => x.reduce((a, v) => Math.max(a, Math.abs(v)), 0);
const rmsOf = (x: Float32Array, a = 0, b = x.length): number => { let s = 0; for (let i = a; i < b; i++) s += x[i]! * x[i]!; return Math.sqrt(s / Math.max(1, b - a)); };
const quant = (a: number[], q: number): number => a[Math.min(a.length - 1, Math.floor(a.length * q))]!;

/** L2 を L0 の長さへ繰り返して、段の重さで足す（音量 gains × 重さ） */
function moodMix(xs: Readonly<Record<MusicKey, Float32Array>>, mood: number, gains: readonly number[]): Float32Array {
  const n = xs.mission_l0.length, out = new Float32Array(n), w = MUSIC_MOOD_WEIGHTS[mood]!;
  MUSIC_LAYER_KEYS.forEach((k, li) => { const x = xs[k], g = w[li]! * gains[li]!; if (g !== 0) for (let i = 0; i < n; i++) out[i] = out[i]! + x[i % x.length]! * g; });
  return out;
}

/** 種の鎖の始まり（決まりを全部通る最初の種。IP1 の標本のまま動かさない＝消した A 7603・E 7627 の次から） */
export const SEED_CHAIN_FROM: Readonly<Partial<Record<MusicKey, number>>> = { mission_l0: 7628, mission_l1: 7629, mission_l2: 7630 };

function search(): void {
  // D: 区間の種を全部作曲して点を比べる（上位 5 つと決まりの破れの数）
  const th = MUSIC_THEMES.title_d, rows: { seed: number; r: ReturnType<typeof musicality> }[] = [], tally = new Map<string, number>();
  for (let s = MUSIC_SEED_SEARCH_D.from; s < MUSIC_SEED_SEARCH_D.from + MUSIC_SEED_SEARCH_D.count; s++) {
    const r = musicality(composeMusic(th, new SeededRng(s)));
    for (const x of r.violations) tally.set(x.replace(/@\d+/, ''), (tally.get(x.replace(/@\d+/, '')) ?? 0) + 1);
    rows.push({ seed: s, r });
  }
  rows.sort((a, b) => b.r.total - a.r.total || a.seed - b.seed);
  const ok = rows.filter((x) => x.r.total > 0).length;
  console.log(`title_d: ${MUSIC_SEED_SEARCH_D.count} 個の種（${MUSIC_SEED_SEARCH_D.from}〜${MUSIC_SEED_SEARCH_D.from + MUSIC_SEED_SEARCH_D.count - 1}）・決まりを全部通る ${ok} 個・破れ ${[...tally].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k} ${c}`).join('・')}`);
  for (const [k, x] of rows.slice(0, 5).entries()) {
    const r = x.r;
    console.log(`  ${k + 1}. 種 ${x.seed}  点 ${r.total.toFixed(3)}  ${Object.entries(r.parts).map(([n, v]) => `${n} ${v.toFixed(2)}`).join(' ')}  （戻り ${r.returns}・山 ${(r.climaxAt * 100).toFixed(1)}%・音域 ${r.span} 半音・順次 ${(r.stepShare * 100).toFixed(0)}%・跳躍 ${r.leaps}）`);
  }
  console.log(`  一番の種 ${rows[0]!.seed}（今の SFX_SEED_MUSIC_D ${MUSIC_SEEDS.title_d}${rows[0]!.seed === MUSIC_SEEDS.title_d ? '＝同じ' : '＝直す'}）`);
  // 任務の層: 種の鎖を確かめる（決まりを全部通る最初の種のまま）
  for (const [key, from] of Object.entries(SEED_CHAIN_FROM) as [MusicKey, number][]) {
    let seed = from;
    while (melodyCheck(composeMusic(MUSIC_THEMES[key], new SeededRng(seed))).violations.length > 0) seed++;
    console.log(`${key.padEnd(12)} 種 ${seed}（${from} から・今 ${MUSIC_SEEDS[key]}${seed === MUSIC_SEEDS[key] ? '＝同じ' : '＝違う'}）`);
  }
}

function report(outDir: string): void {
  const wav = process.env.WAV === '1', png = process.env.PNG === '1', loops = Number(process.env.LOOP ?? 1);
  if ((wav || png) && !outDir) throw new Error('WAV=1・PNG=1 は出力先（scratchpad のディレクトリ）が要る');
  if (outDir) mkdirSync(outDir, { recursive: true });
  const tables = new MusicTables(), work = new Float32Array(MUSIC_WORK_SAMPLES);
  const t0 = performance.now();
  let tableUnits = 0, tableCalls = 0;
  while (!tables.ready) { tableUnits += tables.stepTables(MUSIC_BUILD_BUDGET); tableCalls++; }
  console.log(`表（波形 3 × オクターブ 6・雑音 32,768）: ${tableUnits.toFixed(0)} 単位・${tableCalls} 回・${(performance.now() - t0).toFixed(1)} ms`);
  const xs = {} as Record<MusicKey, Float32Array>;
  let total = 0;
  for (const key of MUSIC_KEYS) {
    const sc: MusicScore = composeMusicKey(key), b = new MusicBuilder(tables, work, sc), times: number[] = [];
    let units = 0;
    while (!b.done) { const a = performance.now(); units += b.stepBuild(MUSIC_BUILD_BUDGET); times.push(performance.now() - a); }
    const x = b.result().slice(), n = x.length;
    xs[key] = x;
    total += n;
    const jumps: number[] = [];
    for (let i = 1; i < n; i++) jumps.push(Math.abs(x[i]! - x[i - 1]!));
    jumps.sort((p, q) => p - q);
    times.sort((p, q) => p - q);
    const w = Math.round(0.025 * SR), seam = new Float32Array([...x.subarray(n - w), ...x.subarray(0, w)]);
    const [hi, lo] = bandShares(x, SR);
    console.log(`${key.padEnd(11)} ${(n / SR).toFixed(2)} 秒（${n}）  頂 ${peakOf(x).toFixed(3)}  RMS ${dbfs(rmsOf(x))} dBFS  >400 Hz ${pct(hi)}・<200 Hz ${pct(lo)}・>2.5 kHz ${(bandShare(x, SR, 2500, SR) * 100).toFixed(1)}%  重心 ${centroidHz(x, 0, Math.min(n, 65536), SR).toFixed(0)} Hz  音符 ${sc.notes.length}${sc.theme.room ? `  響き ${sc.theme.room.join('・')} 秒` : ''}`);
    console.log(`${''.padEnd(11)} 継ぎ目: 差 ${Math.abs(x[0]! - x[n - 1]!).toFixed(4)}（中の差の中央値 ${quant(jumps, 0.5).toFixed(4)}・99% ${quant(jumps, 0.99).toFixed(4)}）・50 ms の RMS 前 ${dbfs(rmsOf(x, n - 3 * w, n - w))}／またぐ ${dbfs(rmsOf(seam))}／後 ${dbfs(rmsOf(x, w, 3 * w))} dBFS`);
    console.log(`${''.padEnd(11)} 作る: ${units.toFixed(0)} 単位＝${times.length} フレーム（予算 ${MUSIC_BUILD_BUDGET}）・node ${times.reduce((p, q) => p + q, 0).toFixed(1)} ms（1 回の中央値 ${quant(times, 0.5).toFixed(2)}・95% ${quant(times, 0.95).toFixed(2)}・最大 ${times[times.length - 1]!.toFixed(2)} ms）・${((units / (n / SR)) / 1000).toFixed(0)} k 単位／音 1 秒`);
    const c = melodyCheck(sc);
    if (c.count > 0) console.log(`${''.padEnd(11)} 旋律 ${c.count} 音: 強拍の和音の音 ${pct(c.strongChord)}・順次 ${pct(c.stepShare)}（跳躍 ${pct(1 - c.stepShare)}）・跳躍の戻り ${pct(c.recovered)}・音域 ${noteName(c.low)}〜${noteName(c.high)}・句の終わり ${MUSIC_THEMES[key].melody!.cadences.map(([bar, k], i) => `${bar} 小節 ${k} ${noteName(c.cadences[i]!)}`).join('・')}・決まりの破れ ${c.violations.length ? c.violations.join(',') : 'なし'}`);
    if (c.count > 0) console.log(`${''.padEnd(11)} 旋律の音: ${sc.melody.map((m) => noteName(m.pitch)).join(' ')}`);
    if (c.count >= 8) { const r = musicality(sc); console.log(`${''.padEnd(11)} 旋律の点 ${r.total.toFixed(3)}（${Object.entries(r.parts).map(([n, v]) => `${n} ${v.toFixed(2)}`).join(' ')}・破れ ${r.violations.join(',') || 'なし'}）`); }
    if (wav) {
      const rep = new Float32Array(n * loops);
      for (let k = 0; k < loops; k++) rep.set(x, k * n);
      writeFileSync(join(outDir, `${key}.wav`), wavBytes(rep, SR));
    }
  }
  console.log(`標本の合計 ${total}（${((total * 4) / 1e6).toFixed(2)} MB）・ゲームの常駐（既定のタイトル 1 本＋家族）${MUSIC_LENGTHS_SUM()}・効果音の上限 ${SFX_MAX_TOTAL_SAMPLES}`);
  // 出口の RMS（今の音量）と音量の案
  const db = (v: number): number => 20 * Math.log10(v), target = (t: number): number => 10 ** (t / 20) / MUSIC_MASTER_GAIN;
  for (const k of MUSIC_TITLE_KEYS) console.log(`メニュー ${k}: 出口 ${db(rmsOf(xs[k]) * MUSIC_GAIN[k] * MUSIC_MASTER_GAIN).toFixed(1)} dBFS（目標 ${MUSIC_TARGET_DBFS.menu}）  音量の案 ${(target(MUSIC_TARGET_DBFS.menu) / rmsOf(xs[k])).toFixed(3)}`);
  const cur = MUSIC_LAYER_KEYS.map((k) => MUSIC_GAIN[k]);
  const moods = [MUSIC_TARGET_DBFS.quiet, MUSIC_TARGET_DBFS.tense, MUSIC_TARGET_DBFS.battle];
  const sug = [target(moods[0]!) / rmsOf(xs.mission_l0), 0, 0];
  for (const li of [1, 2]) {
    let a = 0, b = 4;
    for (let it = 0; it < 40; it++) { const m = (a + b) / 2; sug[li] = m; if (rmsOf(moodMix(xs, li, sug)) > target(moods[li]!)) b = m; else a = m; }
  }
  const cmp: number[][] = [];
  moods.forEach((t, m) => {
    const x = moodMix(xs, m, cur), r = db(rmsOf(x) * MUSIC_MASTER_GAIN), band = r + 10 * Math.log10(bandShare(x, SR, 2000, 5000)), on = onsetRate(x, SR);
    cmp.push([r, band, on]);
    console.log(`任務 段 ${['静か', '緊張', '戦闘'][m]}: 出口 ${r.toFixed(1)} dBFS（目標 ${t}）・頂 ${(peakOf(x) * MUSIC_MASTER_GAIN).toFixed(3)}・>400 Hz ${pct(bandShares(x, SR)[0])}・<200 Hz ${pct(bandShares(x, SR)[1])}・2〜5 kHz の帯 ${band.toFixed(1)} dBFS・発音 ${on.toFixed(2)}/秒`);
    if (wav && m > 0) { const pk = peakOf(x), y = x.map((v) => (v * 0.9) / pk); writeFileSync(join(outDir, `mix-${m === 1 ? 'tense' : 'battle'}.wav`), wavBytes(y, SR)); }
  });
  console.log(`任務の層の音量の案（L0・L1・L2）: ${sug.map((g) => g.toFixed(3)).join('・')}（今 ${cur.join('・')}）`);
  console.log(`緊張と戦闘の違い（IP1）: 発音 ×${(cmp[2]![2]! / cmp[1]![2]!).toFixed(2)}（門 ≥ 2）・2〜5 kHz の帯 ${(cmp[2]![1]! - cmp[1]![1]!).toFixed(1)} dB（門 ≥ 4）・RMS ${(cmp[2]![0]! - cmp[1]![0]!).toFixed(1)} dB`);
  if (png) {
    const keys = [...MUSIC_KEYS], rgb = new Uint8Array(STRIP_W * STRIP_H * (keys.length + 2) * 3);
    keys.forEach((k, i) => drawStrip(rgb, i * STRIP_H, xs[k]));
    [1, 2].forEach((m, i) => { const x = moodMix(xs, m, cur), p = peakOf(x); drawStrip(rgb, (keys.length + i) * STRIP_H, x.map((v) => (v * 0.9) / p)); });
    writeFileSync(join(outDir, 'music-strip.png'), pngBytes(rgb, STRIP_W, STRIP_H * (keys.length + 2)));
  }
  if (wav || png) console.log(`書いた先: ${outDir}${wav ? '（<鍵>.wav・mix-tense.wav・mix-battle.wav）' : ''}${png ? '（music-strip.png: 上から鍵の順・緊張の重ね・戦闘の重ね）' : ''}`);
  if (process.env.RAW === '1') rawMenu(xs, outDir);
}

/** メニューの mix の材料（RAW=1。v0.7.2 S1）: 曲（× MUSIC_GAIN）と 1.5 秒おきのボタンの音（左右。リミッタへ行く単発の束） */
function rawMenu(xs: Readonly<Record<MusicKey, Float32Array>>, outDir: string): void {
  if (!outDir) throw new Error('RAW=1 は出力先（scratchpad のディレクトリ）が要る');
  const n = 12 * SR, tap = renderSfx('ui_tap'), pan = Math.SQRT1_2, g = SFX_TABLE.ui_tap.gain * pan, uiAt: number[] = [];
  const shots = new Float32Array(n);
  for (let at = SR; at + tap.length < n; at += Math.round(1.5 * SR)) { uiAt.push(at); for (let i = 0; i < tap.length; i++) shots[at + i] = shots[at + i]! + tap[i]! * g; }
  const b64 = (x: Float32Array): string => Buffer.from(x.buffer, x.byteOffset, x.byteLength).toString('base64');
  for (const k of MUSIC_TITLE_KEYS) {
    const music = new Float32Array(n);
    for (let i = 0; i < n; i++) music[i] = xs[k][i % xs[k].length]!;
    writeFileSync(join(outDir, `raw-menu-${k}.json`), JSON.stringify({ name: `menu-${k}`, sr: SR, pre: 0, blastAt: [], uiAt, left: b64(shots), right: b64(shots), loops: b64(new Float32Array(n)), music: b64(music), musicGain: MUSIC_GAIN[k] }));
  }
  console.log(`メニューの mix の材料: ${outDir}/raw-menu-<鍵>.json（${MUSIC_TITLE_KEYS.join('・')}。ボタンの音 ${uiAt.length} 回）`);
}
const MUSIC_LENGTHS_SUM = (): number => MUSIC_KEYS.filter((k) => k === MUSIC_TITLE_DEFAULT_ID || MUSIC_LAYER_KEYS.includes(k)).reduce((a, k) => a + MUSIC_THEMES[k].bars * MUSIC_THEMES[k].beats * 4 * ((SR * 60) / (MUSIC_THEMES[k].bpm * 4)), 0);

if (process.env.SEARCH === '1') search();
else report(process.argv[2] ?? '');
