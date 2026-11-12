// 音の合成の確かめ（v0.7.1 S0。spec-v0710 §9.3 の scripts/sfx-mix の初めの形）: assets/sfx-bank の作り方のある鍵を合成し、鍵ごとに 長さ・頂・RMS・直流・零交差と、
// 時間を 3 つに分けた区間ごとの RMS・零交差の高さ・スペクトルの重心、そこから読める音色の一言（立ち上がり・−20 dB までの秒・明るさの動き）を出す
// ＝耳の代わりの数（ヘッドレスの偽の時計では AnalyserNode が意味を持たない）。WAV=1 で <出力先>/<鍵>.wav（16 bit・モノ・22,050 Hz）、PNG=1 で波形と声紋の帯
// <出力先>/sfx-strip.png を書く（聴く・見る用。出力先は scratchpad。repo には音・画像のファイルを入れない）。
// S2 でヘッドレスの probe の記録（時刻・鍵・音量・パン・rate）を core/sfx-mix の判断で波形に直し、リミッタ前の頂・1.0 超えの割合・RMS を報告する形に広げる。
// 実行: npx esbuild scripts/sfx-mix.ts --bundle --platform=node --format=esm --outfile=<scratch>/sfx-mix.mjs && [WAV=1] [PNG=1] [ONLY=mg,ui_tap] node <scratch>/sfx-mix.mjs [<出力先>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SFX_KEYS, SFX_MAX_TOTAL_SAMPLES, SFX_SAMPLE_RATE, SFX_TABLE, type SfxKey } from '../src/config/sfx-config';
import { renderSfx, sfxImplementedKeys } from '../src/assets/sfx-bank';
import { meanOf, peakOf, rmsOf, zeroCrossings } from '../src/assets/sfx-dsp';
import { STRIP_H, STRIP_W, centroidHz, drawStrip, pngBytes, wavBytes } from './sfx-files';

const SR = SFX_SAMPLE_RATE;
const db = (v: number): string => (v > 0 ? `${(20 * Math.log10(v)).toFixed(1)} dB` : '-inf dB');
const hz = (v: number): string => (v >= 1000 ? `${(v / 1000).toFixed(2)} kHz` : `${v.toFixed(0)} Hz`);
const ms = (samples: number): string => `${((samples / SR) * 1000).toFixed(1)} ms`;

/** 包絡（5 ms の窓の頂）が頂の ratio を最後に下回る位置（標本。下回らなければ長さ） */
function fallsBelow(x: Float32Array, ratio: number): number {
  const win = Math.round(0.005 * SR);
  const peak = peakOf(x);
  for (let end = x.length; end > 0; end -= win) {
    let p = 0;
    for (let i = Math.max(0, end - win); i < end; i++) p = Math.max(p, Math.abs(x[i]!));
    if (p >= peak * ratio) return Math.min(x.length, end);
  }
  return 0;
}

function describe(key: SfxKey, x: Float32Array): string[] {
  const d = SFX_TABLE[key];
  const n = x.length;
  let peakAt = 0;
  for (let i = 0; i < n; i++) if (Math.abs(x[i]!) > Math.abs(x[peakAt]!)) peakAt = i;
  const cuts = [0, Math.round(n / 3), Math.round((2 * n) / 3), n];
  const slices = [0, 1, 2].map((s) => {
    const a = cuts[s]!, b = cuts[s + 1]!;
    return { rms: rmsOf(x, a, b), zcHz: (zeroCrossings(x, a, b) * SR) / (2 * (b - a)), cen: centroidHz(x, a, b, SR) };
  });
  const to20 = fallsBelow(x, 0.1);
  const bright = (c: number): string => (c >= 3000 ? '明るい' : c >= 1200 ? '中くらい' : c >= 400 ? '低い' : 'とても低い');
  const move = slices[2]!.cen < slices[0]!.cen * 0.6 ? '暗くなっていく' : slices[2]!.cen > slices[0]!.cen * 1.6 ? '明るくなっていく' : '音色はほぼ同じ';
  return [
    `${key.padEnd(13)} ${d.family.padEnd(6)} ${(n / SR).toFixed(3)} 秒 (${n})  頂 ${peakOf(x).toFixed(3)}  RMS ${rmsOf(x).toFixed(4)} (${db(rmsOf(x))})  直流 ${meanOf(x).toExponential(1)}  零交差 ${hz((zeroCrossings(x) * SR) / (2 * n))}  端 ${Math.abs(x[0]!).toExponential(1)}/${Math.abs(x[n - 1]!).toExponential(1)}`,
    ...slices.map((s, i) => `    区間 ${i + 1}/3: RMS ${db(s.rms).padStart(9)}  零交差 ${hz(s.zcHz).padStart(9)}  重心 ${hz(s.cen).padStart(9)}`),
    `    読み: 頂は頭から ${ms(peakAt)}（${peakAt < 0.005 * SR ? '鋭い立ち上がり' : peakAt < 0.03 * SR ? '速い立ち上がり' : 'ゆっくり立つ'}）・−20 dB を最後に下回るのは ${ms(to20)}・頭は${bright(slices[0]!.cen)}（重心 ${hz(slices[0]!.cen)}）→ 終わり ${hz(slices[2]!.cen)}＝${move}・終わりの区間は頭より ${(20 * Math.log10((slices[2]!.rms + 1e-9) / (slices[0]!.rms + 1e-9))).toFixed(1)} dB`,
  ];
}

const outDir = process.argv[2] ?? '';
const wav = process.env.WAV === '1';
const png = process.env.PNG === '1';
if ((wav || png) && !outDir) throw new Error('WAV=1・PNG=1 は出力先（scratchpad のディレクトリ）が要る: node sfx-mix.mjs <出力先>');
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const keys = sfxImplementedKeys().filter((k) => !only || only.includes(k));
if (outDir) mkdirSync(outDir, { recursive: true });

const t0 = performance.now();
const sounds = keys.map((k) => ({ key: k, x: renderSfx(k) }));
const synthMs = performance.now() - t0;
let total = 0;
for (const s of sounds) {
  total += s.x.length;
  for (const line of describe(s.key, s.x)) console.log(line);
  if (wav) writeFileSync(join(outDir, `${s.key}.wav`), wavBytes(s.x, SR));
}
if (png && sounds.length > 0) {
  const rgb = new Uint8Array(STRIP_W * STRIP_H * sounds.length * 3);
  sounds.forEach((s, i) => drawStrip(rgb, i * STRIP_H, s.x));
  writeFileSync(join(outDir, 'sfx-strip.png'), pngBytes(rgb, STRIP_W, STRIP_H * sounds.length));
}
const planned = SFX_KEYS.reduce((a, k) => a + Math.round(SFX_TABLE[k].seconds * SR), 0);
console.log(`鍵 ${sounds.length}/${SFX_KEYS.length} 本（作り方のある分。上から ${keys.join('・')}）  合成 ${synthMs.toFixed(1)} ms  標本 ${total}（${(total / SR).toFixed(2)} 秒）  表の 25 本ぶん ${planned}（上限 ${SFX_MAX_TOTAL_SAMPLES}）`);
if (wav || png) console.log(`書いた先: ${outDir}${wav ? ' （<鍵>.wav）' : ''}${png ? ' （sfx-strip.png: 上から鍵の順。各帯は上が波形・下が声紋 0〜11 kHz）' : ''}`);
