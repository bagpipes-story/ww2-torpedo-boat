// 曲の確かめ（v0.7.2 S0。spec-v0720 §3・§8.2）: assets/sfx-music-* の曲 6 本（タイトルの候補 A・B・C と任務の層 L0・L1・L2）を作曲・合成し、耳の代わりの数を出す。ゲームは import しない。
// - SEARCH=1: 鍵の順に（前の鍵の種の次から）「作曲の決まり（assets/sfx-music-compose の melodyCheck＝§3.1・§3.2）を全部通る最初の種」を探して出す
//   （config/sfx-music-config の SFX_SEED_MUSIC_* に書く数。FROM=<数> で探し始め。既定 7601）。
// - 既定: 鍵ごとに 長さ・頂・RMS（dBFS）・400 Hz より上と 200 Hz より下のエネルギーの割合（§3.3: 上 ≥ 60%（B は ≥ 55%）・下 ≤ 12%）・継ぎ目（末尾 → 頭の標本の差と、ふつうの差の
//   中央値・99%。継ぎ目をまたぐ 50 ms の RMS とその前後）・重心・作る費用（単位・予算 MUSIC_BUILD_BUDGET で何フレーム）と node の時間（1 回の stepBuild の中央値・95%・最大）・
//   旋律の数（強拍の和音の音の割合・順次の割合・跳躍の戻り・音域・句の終わりの音・決まりの破れ）。任務の段（静か・緊張・戦闘）の重ね（L2 は 4 回）と、出口（× 音量 × master 0.8）の
//   RMS を目標（§3.4）と比べ、音量の案（目標 ÷（RMS × 0.8）。緊張・戦闘は重ねて二分法）を出す。
// - WAV=1: <出力先>/<鍵>.wav（16 bit・モノ・22,050 Hz。LOOP=<回数> で輪を続けて書く＝継ぎ目を聴く）と段の重ね mix-tense.wav・mix-battle.wav（頂 0.9 にそろえる）。
//   PNG=1: <出力先>/music-strip.png（鍵の順に波形と声紋の帯）。出力先は scratchpad（repo には音・画像のファイルを入れない）。
// 実行: npx esbuild scripts/sfx-music.ts --bundle --platform=node --format=esm --outfile=<scratch>/sfx-music.mjs && [SEARCH=1] [WAV=1] [PNG=1] node <scratch>/sfx-music.mjs [<出力先>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MUSIC_BUILD_BUDGET, MUSIC_GAIN, MUSIC_KEYS, MUSIC_LAYER_KEYS, MUSIC_MASTER_GAIN, MUSIC_MOOD_WEIGHTS, MUSIC_SAMPLE_RATE, MUSIC_TARGET_DBFS, MUSIC_TITLE_KEYS, MUSIC_WORK_SAMPLES, type MusicKey,
} from '../src/config/sfx-music-config';
import { SFX_MAX_TOTAL_SAMPLES } from '../src/config/sfx-config';
import { composeMusic, melodyCheck, type MusicScore } from '../src/assets/sfx-music-compose';
import { MusicBuilder, composeMusicKey } from '../src/assets/sfx-music-render';
import { MusicTables } from '../src/assets/sfx-music-synth';
import { MUSIC_THEMES } from '../src/assets/sfx-music-themes';
import { SeededRng } from '../src/core/rng';
import { STRIP_H, STRIP_W, bandShares, centroidHz, drawStrip, pngBytes, wavBytes } from './sfx-files';

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

function search(from: number): void {
  let seed = from;
  for (const key of MUSIC_KEYS) {
    const tally = new Map<string, number>();
    for (let tries = 0; ; tries++, seed++) {
      const v = melodyCheck(composeMusic(MUSIC_THEMES[key], new SeededRng(seed))).violations;
      if (v.length === 0) { console.log(`${key.padEnd(11)} 種 ${seed}（${tries} 個を落とした${tries ? `: ${[...tally].map(([k, c]) => `${k} ${c}`).join('・')}` : ''}）`); seed++; break; }
      for (const r of v) tally.set(r.replace(/@\d+/, ''), (tally.get(r.replace(/@\d+/, '')) ?? 0) + 1);
      if (tries > 5000) throw new Error(`${key}: 5,000 個の種で決まりを通らない`);
    }
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
  console.log(`表（波形 6 × オクターブ 6・雑音 32,768）: ${tableUnits.toFixed(0)} 単位・${tableCalls} 回・${(performance.now() - t0).toFixed(1)} ms`);
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
    console.log(`${key.padEnd(11)} ${(n / SR).toFixed(2)} 秒（${n}）  頂 ${peakOf(x).toFixed(3)}  RMS ${dbfs(rmsOf(x))} dBFS  >400 Hz ${pct(hi)}・<200 Hz ${pct(lo)}  重心 ${centroidHz(x, 0, Math.min(n, 65536), SR).toFixed(0)} Hz  音符 ${sc.notes.length}`);
    console.log(`${''.padEnd(11)} 継ぎ目: 差 ${Math.abs(x[0]! - x[n - 1]!).toFixed(4)}（中の差の中央値 ${quant(jumps, 0.5).toFixed(4)}・99% ${quant(jumps, 0.99).toFixed(4)}）・50 ms の RMS 前 ${dbfs(rmsOf(x, n - 3 * w, n - w))}／またぐ ${dbfs(rmsOf(seam))}／後 ${dbfs(rmsOf(x, w, 3 * w))} dBFS`);
    console.log(`${''.padEnd(11)} 作る: ${units.toFixed(0)} 単位＝${times.length} フレーム（予算 ${MUSIC_BUILD_BUDGET}）・node ${times.reduce((p, q) => p + q, 0).toFixed(1)} ms（1 回の中央値 ${quant(times, 0.5).toFixed(2)}・95% ${quant(times, 0.95).toFixed(2)}・最大 ${times[times.length - 1]!.toFixed(2)} ms）・${((units / (n / SR)) / 1000).toFixed(0)} k 単位／音 1 秒`);
    const c = melodyCheck(sc);
    if (c.count > 0) console.log(`${''.padEnd(11)} 旋律 ${c.count} 音: 強拍の和音の音 ${pct(c.strongChord)}・順次 ${pct(c.stepShare)}（跳躍 ${pct(1 - c.stepShare)}）・跳躍の戻り ${pct(c.recovered)}・音域 ${noteName(c.low)}〜${noteName(c.high)}・句の終わり ${MUSIC_THEMES[key].melody!.cadences.map(([bar, k], i) => `${bar} 小節 ${k} ${noteName(c.cadences[i]!)}`).join('・')}・決まりの破れ ${c.violations.length ? c.violations.join(',') : 'なし'}`);
    if (c.count > 0) console.log(`${''.padEnd(11)} 旋律の音: ${sc.melody.map((m) => noteName(m.pitch)).join(' ')}`);
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
  moods.forEach((t, m) => {
    const x = moodMix(xs, m, cur);
    console.log(`任務 段 ${['静か', '緊張', '戦闘'][m]}: 出口 ${db(rmsOf(x) * MUSIC_MASTER_GAIN).toFixed(1)} dBFS（目標 ${t}）・頂 ${(peakOf(x) * MUSIC_MASTER_GAIN).toFixed(3)}・>400 Hz ${pct(bandShares(x, SR)[0])}・<200 Hz ${pct(bandShares(x, SR)[1])}`);
    if (wav && m > 0) { const pk = peakOf(x), y = x.map((v) => (v * 0.9) / pk); writeFileSync(join(outDir, `mix-${m === 1 ? 'tense' : 'battle'}.wav`), wavBytes(y, SR)); }
  });
  console.log(`任務の層の音量の案（L0・L1・L2）: ${sug.map((g) => g.toFixed(3)).join('・')}（今 ${cur.join('・')}）`);
  if (png) {
    const keys = [...MUSIC_KEYS], rgb = new Uint8Array(STRIP_W * STRIP_H * (keys.length + 2) * 3);
    keys.forEach((k, i) => drawStrip(rgb, i * STRIP_H, xs[k]));
    [1, 2].forEach((m, i) => { const x = moodMix(xs, m, cur), p = peakOf(x); drawStrip(rgb, (keys.length + i) * STRIP_H, x.map((v) => (v * 0.9) / p)); });
    writeFileSync(join(outDir, 'music-strip.png'), pngBytes(rgb, STRIP_W, STRIP_H * (keys.length + 2)));
  }
  if (wav || png) console.log(`書いた先: ${outDir}${wav ? '（<鍵>.wav・mix-tense.wav・mix-battle.wav）' : ''}${png ? '（music-strip.png: 上から鍵の順・緊張の重ね・戦闘の重ね）' : ''}`);
}
const MUSIC_LENGTHS_SUM = (): number => MUSIC_KEYS.filter((k) => k === 'title_a' || MUSIC_LAYER_KEYS.includes(k)).reduce((a, k) => a + MUSIC_THEMES[k].bars * MUSIC_THEMES[k].beats * 4 * ((SR * 60) / (MUSIC_THEMES[k].bpm * 4)), 0);

if (process.env.SEARCH === '1') search(Number(process.env.FROM ?? 7601));
else report(process.argv[2] ?? '');
