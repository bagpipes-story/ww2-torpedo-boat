// v0.7.1 S3（アートと音②：合成の効果音。spec-v0710 §4・§5・§9.1・§14 L6）: ループ 5 本（engine・sea・fire・rain・drone）の合成を固定する。
// 共通の検査（長さ・頂 0.9・直流・指紋・頭と末尾の標本の差 < 0.05・頭と末尾 10% の RMS の差 < 1.5 dB）は tests/sfx-synth。ここはループだけの検査:
// - 継ぎ目で飛ばない: 継ぎ目（末尾 → 頭）の標本の差が、ループの中の隣どうしの差のふつうの大きさ（中央値）より小さい。継ぎ目をまたぐ 20 ms の RMS が前後と変わらない。端の fade は掛かっていない。
// - 鳴り続ける音: 10 等分のどの区間も RMS が全体の ±6 dB の内（切れ目・一打が無い）。
// - 聞き分け: engine は毎秒 28 回の点火の拍・sea はうねり（真ん中が大きい）・fire はぱちぱち（鋭い粒）・rain は一番明るい・drone は毎秒 4 回のうなり。
// - 本体のスピーカー（約 400 Hz より下が出ない）でも聞こえる: 400 Hz より上のエネルギーの割合の下限。
// - 部品（assets/sfx-dsp の harmonics・loopSway・mixWrap・rotateToQuietSeam）。
import { describe, expect, it } from 'vitest';
import { SFX_SAMPLE_RATE, SFX_SEED_MG, SFX_TABLE, type SfxKey } from '../src/config/sfx-config';
import { renderSfx } from '../src/assets/sfx-bank';
import { harmonics, highPass, loopSway, lowPass, mixWrap, peakOf, rmsOf, rotateToQuietSeam, sfxSamples, whiteNoise, zeroCrossings } from '../src/assets/sfx-dsp';
import { SeededRng } from '../src/core/rng';
import { SFX_LOOP_IDS } from '../src/core/sfx-loops';
import { spectrum } from '../scripts/sfx-files';

const SR = SFX_SAMPLE_RATE;
const LOOPS: readonly SfxKey[] = SFX_LOOP_IDS;
const X = Object.fromEntries(LOOPS.map((k) => [k, renderSfx(k)])) as Record<SfxKey, Float32Array>;
const dB = (a: number, b: number): number => 20 * Math.log10(a / b);
/** hz より上のエネルギーの割合（1024 標本ごとの FFT。scripts/sfx-mix.ts の「小さいスピーカーの目安」と同じ数え方） */
function shareAbove(x: Float32Array, hz: number): number {
  const size = 1024;
  let hi = 0, all = 0;
  for (let from = 0; from < x.length; from += size) {
    const mag = spectrum(x, from, Math.min(size, x.length - from), size);
    for (let i = 1; i < mag.length; i++) { const p = mag[i]! * mag[i]!; all += p; if ((i * SR) / size >= hz) hi += p; }
  }
  return hi / all;
}
/** win 標本ごとの RMS の列 */
function envelopeOf(x: Float32Array, win: number): number[] {
  const out: number[] = [];
  for (let a = 0; a + win <= x.length; a += win) out.push(rmsOf(x, a, a + win));
  return out;
}
/** 列の中の周期 lag（区間の数）の自己相関（平均を引いて正規化） */
function autocorr(e: number[], lag: number): number {
  const m = e.reduce((a, b) => a + b, 0) / e.length;
  let num = 0, den = 0;
  for (let i = 0; i < e.length; i++) { den += (e[i]! - m) ** 2; if (i + lag < e.length) num += (e[i]! - m) * (e[i + lag]! - m); }
  return num / den;
}

describe('ループ 5 本の継ぎ目（buffer 全体を繰り返す＝L6）', () => {
  it.each(LOOPS)('%s: 継ぎ目の標本の差は、中の隣どうしの差の中央値より小さい（飛ばない）。両端は fade していない（鳴り続ける）', (key) => {
    const x = X[key];
    const n = x.length;
    const jumps: number[] = [];
    for (let i = 1; i < n; i++) jumps.push(Math.abs(x[i]! - x[i - 1]!));
    jumps.sort((a, b) => a - b);
    const seam = Math.abs(x[0]! - x[n - 1]!);
    expect(seam).toBeLessThan(0.05);
    expect(seam).toBeLessThanOrEqual(jumps[jumps.length >> 1]! * 1.5);
    // 端の 2 ms が絞られていない（単発の fade を掛けると継ぎ目ごとに音が切れる）
    const edge = sfxSamples(0.02);
    expect(dB(rmsOf(x, 0, edge), rmsOf(x, edge, 3 * edge))).toBeGreaterThan(-6);
    expect(dB(rmsOf(x, n - edge), rmsOf(x, n - 3 * edge, n - edge))).toBeGreaterThan(-6);
  });
  it.each(LOOPS)('%s: 継ぎ目をまたぐ 40 ms（末尾 20 ms ＋ 頭 20 ms）の RMS は、その前後と 3 dB の内（継ぎ目で音が痩せない・膨らまない）', (key) => {
    const x = X[key];
    const n = x.length;
    const w = sfxSamples(0.02);
    const across = Math.sqrt((rmsOf(x, n - w) ** 2 + rmsOf(x, 0, w) ** 2) / 2);
    const around = Math.sqrt((rmsOf(x, n - 3 * w, n - w) ** 2 + rmsOf(x, w, 3 * w) ** 2) / 2);
    expect(Math.abs(dB(across, around))).toBeLessThan(3);
  });
  it.each(LOOPS)('%s: 10 等分のどの区間も RMS が全体の ±6 dB の内（切れ目も一打も無い）・全体の RMS は 0.15〜0.3', (key) => {
    const x = X[key];
    const all = rmsOf(x);
    for (const r of envelopeOf(x, Math.floor(x.length / 10))) expect(Math.abs(dB(r, all))).toBeLessThan(6);
    expect(all).toBeGreaterThan(0.15);
    expect(all).toBeLessThan(0.3);
  });
});

describe('ループの聞き分けと、本体のスピーカーで聞こえる帯', () => {
  it('400 Hz より上のエネルギー: engine ≥ 35%（点火の拍で刻んだ排気）・drone ≥ 40%・fire ≥ 45%・sea ≥ 65%・rain ≥ 80%', () => {
    const share = Object.fromEntries(LOOPS.map((k) => [k, shareAbove(X[k], 400)]));
    expect(share.engine).toBeGreaterThan(0.35);
    expect(share.engine).toBeLessThan(0.6); // 排気の層だけにしない（イヤホンで低いうなりが残る）
    expect(share.drone).toBeGreaterThan(0.4);
    expect(share.fire).toBeGreaterThan(0.45);
    expect(share.sea).toBeGreaterThan(0.65);
    expect(share.rain).toBeGreaterThan(0.8);
  });
  it('明るさの順（零交差）: drone < engine < sea < rain。rain が一番明るい', () => {
    const zc = (k: SfxKey): number => zeroCrossings(X[k]) / SFX_TABLE[k].seconds;
    expect(zc('drone')).toBeLessThan(zc('engine'));
    expect(zc('engine')).toBeLessThan(zc('sea'));
    expect(zc('fire')).toBeLessThan(zc('sea'));
    expect(zc('sea')).toBeLessThan(zc('rain'));
  });
  it('engine: 毎秒 28 回の点火の拍（1 秒に整数周期）＝包絡が 1/28 秒で繰り返す。4 発で 1 巡のむら（1/7 秒）も', () => {
    const win = 15; // 22050 ÷ 28 ÷ 15 ＝ 1 周期に 52.5 区間
    const e = envelopeOf(X.engine, win);
    const period = SR / 28 / win;
    expect(autocorr(e, Math.round(period * 2))).toBeGreaterThan(0.5); // 2 周期ずらすと重なる
    expect(autocorr(e, Math.round(period * 1.5))).toBeLessThan(0); // 半周期ずれると山と谷
    expect(autocorr(e, Math.round(period * 4))).toBeGreaterThan(autocorr(e, Math.round(period * 2)) - 0.1);
  });
  it('sea: うねり（継ぎ目が谷・真ん中が山）。真ん中の 1/5 は両端の 1/5 より 2 dB より大きい・両端どうしは 1.5 dB の内', () => {
    const x = X.sea;
    const n5 = Math.floor(x.length / 5);
    const head = rmsOf(x, 0, n5), mid = rmsOf(x, 2 * n5, 3 * n5), tail = rmsOf(x, 4 * n5);
    expect(dB(mid, head)).toBeGreaterThan(2);
    expect(dB(mid, tail)).toBeGreaterThan(2);
    expect(Math.abs(dB(head, tail))).toBeLessThan(1.5);
  });
  it('fire: ぱちぱち（高域の鋭い粒）がある＝高域通過 3k Hz の 5 ms ごとの頂が、その中央値の 4 倍を超える区間が 10 より多い。rain には無い', () => {
    const spikes = (k: SfxKey): number => {
      const hi = highPass(highPass(X[k], 3000), 3000);
      const win = sfxSamples(0.005);
      const peaks: number[] = [];
      for (let a = 0; a + win <= hi.length; a += win) peaks.push(peakOf(hi.subarray(a, a + win)));
      const med = [...peaks].sort((a, b) => a - b)[peaks.length >> 1]!;
      return peaks.filter((p) => p > med * 4).length;
    };
    expect(spikes('fire')).toBeGreaterThan(10);
    expect(spikes('rain')).toBe(0);
  });
  it('drone: 毎秒 4 回のうなり（96 Hz と 100 Hz の 2 本）＝低い所の包絡が 0.25 秒で繰り返し、0.125 秒ずらすと山と谷', () => {
    const win = sfxSamples(0.0125);
    const e = envelopeOf(lowPass(X.drone, 300, 300, 0, 2), win);
    expect(autocorr(e, 20)).toBeGreaterThan(0.5);
    expect(autocorr(e, 10)).toBeLessThan(-0.3);
  });
});

describe('ループの部品（assets/sfx-dsp）', () => {
  it('harmonics: 整数周期＝頭は 0 で、終わりの次が頭に続く。倍音の大きさは amps のとおり', () => {
    const n = 2000;
    const one = harmonics(n, 10, [1]);
    expect(one[0]).toBe(0);
    expect(Math.abs(zeroCrossings(one) - 20)).toBeLessThanOrEqual(1);
    expect(rmsOf(one)).toBeCloseTo(Math.SQRT1_2, 3);
    // 終わりの標本の次（＝周期の頭）は 0: 最後の標本は −sin(1 歩)
    expect(one[n - 1]).toBeCloseTo(-Math.sin((2 * Math.PI * 10) / n), 6);
    const two = harmonics(n, 10, [0, 0.5]);
    expect(Math.abs(zeroCrossings(two) - 40)).toBeLessThanOrEqual(1);
    expect(rmsOf(two)).toBeCloseTo(0.5 * Math.SQRT1_2, 3);
  });
  it('loopSway: 整数周期の cos で揺らす（継ぎ目の前後で対称。depth が負なら継ぎ目が谷）', () => {
    const x = loopSway(new Float32Array(1000).fill(1), 1, -0.3);
    expect(x[0]).toBeCloseTo(0.7, 6);
    expect(x[500]).toBeCloseTo(1.3, 6);
    expect(x[250]).toBeCloseTo(1, 2);
    expect(x[1]).toBeCloseTo(x[999]!, 6); // 対称
  });
  it('mixWrap: はみ出す分は頭へ回す（ループの中の粒が継ぎ目で切れない）', () => {
    const dst = mixWrap(new Float32Array(10), new Float32Array([1, 2, 3, 4]), 0.5, 8);
    expect(Array.from(dst)).toEqual([1.5, 2, 0, 0, 0, 0, 0, 0, 0.5, 1]);
  });
  it('rotateToQuietSeam: 中身は同じ輪のまま、近く（前後 windowS 秒）の一番静かな所を頭にする', () => {
    const n = SR;
    const src = whiteNoise(new SeededRng(SFX_SEED_MG), n);
    const out = rotateToQuietSeam(src, 0.05);
    expect(out.length).toBe(n);
    expect(out).not.toBe(src);
    // 回した量 k を見つける: out[i] = src[(i + k) % n]
    const w = sfxSamples(0.05);
    let k = -1;
    for (let c = -w; c <= w && k < 0; c++) { const cc = (c + n) % n; if (out[0] === src[cc] && out[1] === src[(cc + 1) % n] && out[2] === src[(cc + 2) % n]) k = cc; }
    expect(k).toBeGreaterThanOrEqual(0);
    for (let i = 0; i < n; i += 97) expect(out[i]).toBe(src[(i + k) % n]);
    expect(Math.abs(out[0]!) + Math.abs(out[n - 1]!)).toBeLessThan(0.05);
    expect(Math.abs(src[0]!) + Math.abs(src[n - 1]!)).toBeGreaterThan(Math.abs(out[0]!) + Math.abs(out[n - 1]!));
  });
});
