// v0.7.1 S0（アートと音②：合成の効果音。spec-v0710 §9.1）: 音の合成を固定する。assets/sfx-bank の作り方のある鍵（S0 は ui_tap・mg・blast_l、S2 で砲・水柱・爆発・沈没の 7 本。S3〜S4 で増えると自動で入る）
// それぞれについて: 長さ＝表の秒 × 22,050・NaN なし・頂 0.9・直流 < 0.02・単発は両端 < 1e-3・2 回作って同じ・16 bit に丸めた指紋（FNV。最下位ビットの揺れに強く）を固定・
// 系統ごとの RMS の帯・零交差の高さの順・ループは継ぎ目・合成の壁時計。鍵を足す段は FINGERPRINTS に 1 行足す（無ければ落ちる）。音色を直した時は指紋を直す。
// S2: 7 本の聞き分け（近い砲は鋭く明るい・遠雷はゆっくり立って暗い・大きい水柱は低い一打つき・魚雷の命中は爆発の後に水の柱が立つ・沈没は続く泡）を数で固定する。
// S4: 合図 10 本も共通の検査に入る（聞き分け・本体のスピーカーで聞こえる帯は tests/sfx-synth-cues）。
// IP4: torp_launch は F（U-R2）＝IP3 で試聴した F の指紋 1125567461（tests/sfx-variants の F と同じ。IP2〜IP3 の A は 3234308985＝試聴の場の A のまま）。
// S3: ループ 5 本（engine・sea・fire・rain・drone）は上の共通の検査（長さ・頂・直流・指紋・継ぎ目）に自動で入る。ループだけの検査（継ぎ目の飛び・揺れ・聞こえる帯・部品）は tests/sfx-synth-loops。
// 下半分は部品（assets/sfx-dsp）の単体テスト。
import { describe, expect, it } from 'vitest';
import { SFX_EDGE_FADE_S, SFX_PEAK, SFX_SAMPLE_RATE, SFX_SEED_MG, SFX_TABLE, type SfxFamily, type SfxKey } from '../src/config/sfx-config';
import { renderSfx, sfxImplementedKeys } from '../src/assets/sfx-bank';
import { bandPass, crossfadeLoop, envelope, fadeEdges, fadeTail, fm, highPass, lowPass, meanOf, mixInto, modes, mul, normalizePeak, peakOf, ramp, removeDc, rmsOf, saturate, sfxSamples, sine, whiteNoise, zeroCrossings } from '../src/assets/sfx-dsp';
import { SeededRng } from '../src/core/rng';

const SR = SFX_SAMPLE_RATE;
const KEYS = sfxImplementedKeys();

/** 16 bit に丸めた標本の FNV-1a（下位・上位のバイトの順） */
function fingerprint16(x: Float32Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < x.length; i++) {
    const v = Math.round(x[i]! * 32767) & 0xffff;
    h = Math.imul(h ^ (v & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ (v >>> 8), 0x01000193) >>> 0;
  }
  return h;
}

/** 鍵ごとの指紋（作り方のある鍵は必ずここにある） */
const FINGERPRINTS: Partial<Record<SfxKey, number>> = {
  mg: 3539423712,
  gun_near: 3447032880,
  gun_far: 3904938802,
  splash_s: 3929341713,
  splash_l: 952053639,
  blast_s: 1318136149,
  blast_l: 1634950625,
  torp_hit: 2755808488,
  ui_tap: 274344421,
  sink: 3533209858,
  engine: 3778509553,
  sea: 1630341364,
  fire: 104566791,
  rain: 2630845142,
  drone: 1691882525,
  torp_launch: 1125567461,
  hull_hit: 2680124741,
  alarm: 1749539769,
  light_on: 2838731473,
  flare_pop: 235826790,
  bomb_fall: 3358791416,
  reload: 464075404,
  reload_end: 345574464,
  smoke: 449030864,
  bell: 88401544,
  engine_cough: 679273673,
};
/** 系統ごとの RMS の帯（頂 0.9 にそろえた標本。小さすぎる＝針のような音・大きすぎる＝べったりした音を止める。仮の帯＝S5 で詰める） */
const RMS_BAND: Readonly<Record<SfxFamily, readonly [number, number]>> = {
  ui: [0.12, 0.45], cue: [0.05, 0.5], blast: [0.12, 0.4], gun: [0.08, 0.35], splash: [0.05, 0.3], loop: [0.1, 0.6],
};
/** 零交差の高さ（1 秒あたり）の順: [低い方, 高い方]。両方に作り方がある組だけ比べる（S2 で遠雷 < 近い砲・大きい水柱 < 小さい水柱が効き始める） */
const ZC_ORDER: readonly (readonly [SfxKey, SfxKey])[] = [['blast_l', 'mg'], ['gun_far', 'gun_near'], ['splash_l', 'splash_s'], ['blast_l', 'blast_s']];
const zcRate = (x: Float32Array): number => (zeroCrossings(x) * SR) / x.length;
/** 頂の位置（標本） */
function peakAt(x: Float32Array): number {
  let at = 0;
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]!) > Math.abs(x[at]!)) at = i;
  return at;
}
/** |x| が 頂 × ratio を最後に超える位置（標本＝「−20 dB までの長さ」の目安） */
function lastAbove(x: Float32Array, ratio: number): number {
  const p = peakOf(x) * ratio;
  for (let i = x.length - 1; i >= 0; i--) if (Math.abs(x[i]!) >= p) return i;
  return 0;
}

describe('音の合成（v0.7.1 S0。作り方のある鍵）', () => {
  it('26 本全部がある（S0 の 3 本・S2 の 7 本・S3 のループ 5 本・S4 の合図 10 本・IP2 の弾倉の終わり。空の検査にしない）・どの鍵にも指紋がある', () => {
    expect(KEYS.length).toBe(26);
    expect(Object.keys(FINGERPRINTS).sort()).toEqual([...KEYS].sort());
  });
  it.each(KEYS)('%s: 長さ・NaN なし・頂 0.9・直流・両端・系統の RMS の帯', (key) => {
    const d = SFX_TABLE[key];
    const x = renderSfx(key);
    expect(x).toBeInstanceOf(Float32Array);
    expect(x.length).toBe(Math.round(d.seconds * SR));
    for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i]!)) throw new Error(`${key}: 標本 ${i} が有限でない`);
    expect(peakOf(x)).toBeGreaterThanOrEqual(0.5);
    expect(peakOf(x)).toBeLessThanOrEqual(1.0);
    expect(peakOf(x)).toBeCloseTo(SFX_PEAK, 5);
    expect(Math.abs(meanOf(x))).toBeLessThan(0.02);
    if (!d.loop) {
      expect(Math.abs(x[0]!)).toBeLessThan(1e-3);
      expect(Math.abs(x[x.length - 1]!)).toBeLessThan(1e-3);
    }
    const [lo, hi] = RMS_BAND[d.family];
    expect(rmsOf(x), `${key} の RMS`).toBeGreaterThanOrEqual(lo);
    expect(rmsOf(x), `${key} の RMS`).toBeLessThanOrEqual(hi);
  });
  it.each(KEYS)('%s: 2 回作って同じ標本・16 bit の指紋が固定の値', (key) => {
    const a = renderSfx(key);
    const b = renderSfx(key);
    expect(a).not.toBe(b);
    expect(Buffer.from(a.buffer).equals(Buffer.from(b.buffer))).toBe(true);
    expect(fingerprint16(a), `${key} の指紋（音色を直したなら FINGERPRINTS を直す）`).toBe(FINGERPRINTS[key]);
  });
  it('零交差の高さの順（爆発は機銃より低い・遠雷 < 近い砲・大きい水柱 < 小さい水柱・大きい爆発 < 小さい爆発）', () => {
    const active = ZC_ORDER.filter(([lo, hi]) => KEYS.includes(lo) && KEYS.includes(hi));
    expect(active.length).toBe(4);
    for (const [lo, hi] of active) expect(zcRate(renderSfx(lo)), `${lo} < ${hi}`).toBeLessThan(zcRate(renderSfx(hi)));
  });
  it('S2 の聞き分け: 近い砲は鋭く立って明るい・遠雷はゆっくり立って暗く長い', () => {
    const near = renderSfx('gun_near');
    const far = renderSfx('gun_far');
    expect(peakAt(near)).toBeLessThan(0.015 * SR);
    expect(peakAt(far)).toBeGreaterThan(0.03 * SR);
    // 頭 0.1 秒の零交差: 近い砲は遠雷の 2 倍より高い（鋭い頭）。−20 dB までの長さは遠雷の方が長い
    expect(zeroCrossings(near, 0, SR / 10)).toBeGreaterThan(zeroCrossings(far, 0, SR / 10) * 2);
    expect(lastAbove(far, 0.1)).toBeGreaterThan(lastAbove(near, 0.1) * 2);
  });
  it('S2 の聞き分け: 小さい水柱は軽く短い・大きい水柱は頭に低い一打があって長い', () => {
    const s = renderSfx('splash_s');
    const l = renderSfx('splash_l');
    expect(zeroCrossings(l, 0, SR / 20)).toBeLessThan(zeroCrossings(s, 0, SR / 20) * 0.6);
    expect(lastAbove(l, 0.1)).toBeGreaterThan(lastAbove(s, 0.1) * 2);
    expect(rmsOf(l)).toBeGreaterThan(rmsOf(s));
  });
  it('S2 の聞き分け: 小さい爆発は大きい爆発より短い・魚雷の命中は一番長く、爆発の頭の後（0.25 秒から）に水の柱が立つ（明るくなる）', () => {
    const small = renderSfx('blast_s');
    const big = renderSfx('blast_l');
    const torp = renderSfx('torp_hit');
    expect(lastAbove(small, 0.1)).toBeLessThan(lastAbove(big, 0.1) * 0.5);
    expect(lastAbove(torp, 0.1)).toBeGreaterThan(lastAbove(big, 0.1) * 1.5);
    // 頭（爆発）が一番大きい: 頂は 0.1 秒の内。頭 0.2 秒の RMS は水の柱（0.5〜0.9 秒）より大きい
    expect(peakAt(torp)).toBeLessThan(0.1 * SR);
    expect(rmsOf(torp, 0, 0.2 * SR)).toBeGreaterThan(rmsOf(torp, 0.5 * SR, 0.9 * SR));
    // 水の柱: 0.5〜0.9 秒は、爆発だけの大きい爆発の同じ区間より明るく（零交差が 2 倍より多い）大きい
    expect(zeroCrossings(torp, 0.5 * SR, 0.9 * SR)).toBeGreaterThan(zeroCrossings(big, 0.5 * SR, 0.9 * SR) * 2);
    expect(rmsOf(torp, 0.5 * SR, 0.9 * SR)).toBeGreaterThan(rmsOf(big, 0.5 * SR, 0.9 * SR));
    // 柱は立ち上がる: 0.25 秒からの 0.1 秒より、0.5 秒からの 0.1 秒の方が明るい
    expect(zeroCrossings(torp, 0.5 * SR, 0.6 * SR)).toBeGreaterThan(zeroCrossings(torp, 0.25 * SR, 0.35 * SR));
  });
  it('S2 の聞き分け: 沈没は一打ではなく続く音（泡の拍）で、終わりは消え切る', () => {
    const x = renderSfx('sink');
    const n3 = Math.round(x.length / 3);
    expect(Math.abs(20 * Math.log10(rmsOf(x, n3, 2 * n3) / rmsOf(x, 0, n3)))).toBeLessThan(6);
    expect(rmsOf(x, x.length - Math.round(SR / 20))).toBeLessThan(rmsOf(x) * 0.15);
    // 泡の拍: 20 ms ごとの RMS が大きく揺れる（山と谷の比が 3 倍より大きい。1 秒〜1.5 秒）
    const win = Math.round(0.02 * SR);
    let lo = Infinity, hi = 0;
    for (let a = SR; a + win <= Math.round(1.5 * SR); a += win) { const r = rmsOf(x, a, a + win); lo = Math.min(lo, r); hi = Math.max(hi, r); }
    expect(hi / lo).toBeGreaterThan(3);
  });
  it('ループは継ぎ目が合う（頭と末尾の標本の差 < 0.05・頭と末尾 10% の RMS の差 < 1.5 dB。S3 で 5 本に効く）', () => {
    const loops = KEYS.filter((k) => SFX_TABLE[k].loop);
    expect(loops).toEqual(['engine', 'sea', 'fire', 'rain', 'drone']);
    for (const key of loops) {
      const x = renderSfx(key);
      const n10 = Math.round(x.length / 10);
      expect(Math.abs(x[0]! - x[x.length - 1]!), key).toBeLessThan(0.05);
      expect(Math.abs(20 * Math.log10(rmsOf(x, 0, n10) / rmsOf(x, x.length - n10))), key).toBeLessThan(1.5);
    }
  });
  it('作り方のある鍵を全部作って 400 ms 以内（起動時に 1 回。3 回のうち一番速い回）', () => {
    let best = Infinity;
    for (let r = 0; r < 3; r++) {
      const t0 = performance.now();
      for (const k of KEYS) renderSfx(k);
      best = Math.min(best, performance.now() - t0);
    }
    expect(best).toBeLessThan(400);
  });
});

describe('音の合成の部品（assets/sfx-dsp）', () => {
  const N = SR; // 1 秒
  const noise = (): Float32Array => whiteNoise(new SeededRng(SFX_SEED_MG), N);
  it('白色雑音: 同じ種は同じ列・−1〜1・平均ほぼ 0・RMS は一様の 1/√3', () => {
    const a = noise();
    expect(Buffer.from(a.buffer).equals(Buffer.from(noise().buffer))).toBe(true);
    expect(peakOf(a)).toBeLessThanOrEqual(1);
    expect(Math.abs(meanOf(a))).toBeLessThan(0.02);
    expect(rmsOf(a)).toBeCloseTo(1 / Math.sqrt(3), 1);
  });
  it('低域通過は零交差を減らし高域通過は増やす・掃引は後ろほど低い・重ねるほど低い', () => {
    const x = noise();
    const zc = zeroCrossings(x);
    expect(zeroCrossings(lowPass(x, 300))).toBeLessThan(zc * 0.3);
    expect(zeroCrossings(highPass(x, 3000))).toBeGreaterThan(zc);
    expect(zeroCrossings(lowPass(x, 300, 300, 0, 2))).toBeLessThan(zeroCrossings(lowPass(x, 300)));
    const sw = lowPass(x, 3000, 100, 1);
    expect(zeroCrossings(sw, N >> 1, N)).toBeLessThan(zeroCrossings(sw, 0, N >> 1) * 0.6);
  });
  it('低域通過は直流を通し、高域通過は直流を消す', () => {
    const dc = new Float32Array(N).fill(1);
    expect(lowPass(dc, 200)[N - 1]).toBeCloseTo(1, 3);
    expect(Math.abs(highPass(dc, 200)[N - 1]!)).toBeLessThan(1e-3);
  });
  it('帯域通過: 帯の中心の正弦はほぼそのまま・遠い高さは小さくなる・掃引は帯が動く', () => {
    const half = (x: Float32Array): number => rmsOf(x, N >> 1, N);
    const center = Math.sqrt(900 * 3000);
    expect(half(bandPass(sine(N, center), 900, 3000)) / half(sine(N, center))).toBeGreaterThan(0.9);
    expect(half(bandPass(sine(N, center), 900, 3000)) / half(sine(N, center))).toBeLessThan(1.1);
    expect(half(bandPass(sine(N, 100), 900, 3000)) / half(sine(N, 100))).toBeLessThan(0.15);
    expect(half(bandPass(sine(N, 9000), 900, 3000)) / half(sine(N, 9000))).toBeLessThan(0.3);
    const sw = bandPass(noise(), 2000, 3000, 300, 500, 1);
    expect(zeroCrossings(sw, N - 4000, N)).toBeLessThan(zeroCrossings(sw, 0, 4000) * 0.5);
  });
  it('正弦: 頭は 0・零交差は 2 × 高さ × 秒・下る掃引は後ろほど低く、掃引の後は終わりの高さ', () => {
    const s = sine(N, 440);
    expect(s[0]).toBe(0);
    expect(Math.abs(zeroCrossings(s) - 880)).toBeLessThanOrEqual(2);
    const sw = sine(N, 880, 220, 0.5);
    expect(zeroCrossings(sw, 0, N >> 2)).toBeGreaterThan(zeroCrossings(sw, N >> 2, N >> 1));
    expect(Math.abs(zeroCrossings(sw, N >> 1, N) - 220)).toBeLessThanOrEqual(2);
  });
  it('包絡: 始まりの前は 0・立ち上がりの終わりで 1・「減衰 D 秒」の D 秒後に 1/10', () => {
    const e = envelope(N, 0.01, 0.2, 0.1);
    const s0 = sfxSamples(0.1);
    const an = sfxSamples(0.01);
    expect(e[s0 - 1]).toBe(0);
    expect(e[s0]).toBe(0);
    expect(e[s0 + an]).toBeCloseTo(1, 6);
    expect(e[s0 + an + sfxSamples(0.2)]).toBeCloseTo(0.1, 3);
    expect(peakOf(e)).toBeLessThanOrEqual(1);
    const r = ramp(N, 0.5, 2);
    expect(r[0]).toBe(0);
    expect(r[sfxSamples(0.25)]).toBeCloseTo(0.25, 2);
    expect(r[N - 1]).toBe(1);
  });
  it('FM: 深さ 0 は正弦と同じ・−1〜1・深いほど零交差が増える', () => {
    const plain = fm(N, 320, 1.4, 0, 0.1);
    const s = sine(N, 320);
    for (let i = 0; i < 2000; i++) expect(Math.abs(plain[i]! - s[i]!)).toBeLessThan(1e-3);
    const deep = fm(N, 320, 1.4, 6, 5);
    expect(peakOf(deep)).toBeLessThanOrEqual(1);
    expect(zeroCrossings(deep)).toBeGreaterThan(zeroCrossings(plain));
  });
  it('モードの束（IP1）: 頭は 0・1 本なら零交差は 2 × 高さ × 秒・「減衰 D 秒」の D 秒後に 1/10・束は足し算', () => {
    const one = modes(N, [1000], [1], [0.2]);
    expect(one[0]).toBe(0);
    expect(Math.abs(zeroCrossings(one, 0, sfxSamples(0.1)) - 200)).toBeLessThanOrEqual(2);
    expect(rmsOf(one, sfxSamples(0.2), sfxSamples(0.21)) / rmsOf(one, 0, sfxSamples(0.01))).toBeCloseTo(0.1, 1);
    const two = modes(N, [1000, 2700], [1, 0.5], [0.2, 0.05]);
    const b = modes(N, [2700], [0.5], [0.05]);
    for (let i = 0; i < 2000; i++) expect(Math.abs(two[i]! - one[i]! - b[i]!)).toBeLessThan(1e-6);
  });
  it('掛け算・足し込み（ずらし・はみ出しは捨てる）・歪みは −1〜1', () => {
    expect(Array.from(mul(new Float32Array([1, 2, 3]), new Float32Array([2, 0.5])))).toEqual([2, 1, 0]);
    const dst = new Float32Array(SR / 10);
    mixInto(dst, new Float32Array(SR).fill(1), 0.5, 0.05);
    expect(dst[sfxSamples(0.05) - 1]).toBe(0);
    expect(dst[sfxSamples(0.05)]).toBe(0.5);
    expect(dst[dst.length - 1]).toBe(0.5);
    expect(peakOf(saturate(new Float32Array([-9, 0, 9]), 2))).toBeLessThanOrEqual(1);
  });
  it('仕上げ: 直流を引く・両端 2 ms の fade（端は 0・fade の内側は元のまま）・頂を 0.9 に（無音はそのまま）', () => {
    const x = removeDc(new Float32Array(N).fill(0.3).map((v, i) => v + Math.sin(i / 7)));
    expect(Math.abs(meanOf(x))).toBeLessThan(1e-6);
    const f = fadeEdges(new Float32Array(N).fill(1));
    const fn = sfxSamples(SFX_EDGE_FADE_S);
    expect(f[0]).toBe(0);
    expect(f[N - 1]).toBe(0);
    expect(f[fn]).toBe(1);
    expect(f[N - 1 - fn]).toBe(1);
    expect(f[fn >> 1]).toBeGreaterThan(0);
    expect(peakOf(normalizePeak(new Float32Array([0.1, -0.2, 0.05])))).toBeCloseTo(SFX_PEAK, 6);
    expect(peakOf(normalizePeak(new Float32Array(8)))).toBe(0);
    // 尾の fade（S2）: 終わりの fadeS 秒を直線で 0 へ（その前は元のまま・最後の標本は 0）
    const t = fadeTail(new Float32Array(N).fill(1), 0.1);
    expect(t[N - 1 - sfxSamples(0.1)]).toBe(1);
    expect(t[N - 1]).toBe(0);
    expect(t[N - 1 - (sfxSamples(0.1) >> 1)]).toBeCloseTo(0.5, 2);
  });
  it('ループの継ぎ目の重ね: 長さ n・終わりの次が頭につながる・頭と末尾の大きさが同じ・重ねの外は元のまま', () => {
    const n = SR * 2;
    const ovS = 0.3;
    const src = lowPass(whiteNoise(new SeededRng(SFX_SEED_MG), n + sfxSamples(ovS)), 800);
    const loop = crossfadeLoop(src, n, ovS);
    expect(loop.length).toBe(n);
    // 終わり（元の n − 1）の次の標本は元の n。頭はほぼそれ
    expect(Math.abs(loop[0]! - src[n]!)).toBeLessThan(0.01);
    expect(Math.abs(loop[0]! - loop[n - 1]!)).toBeLessThan(0.05 + Math.abs(src[n]! - src[n - 1]!));
    const n10 = n / 10;
    expect(Math.abs(20 * Math.log10(rmsOf(loop, 0, n10) / rmsOf(loop, n - n10)))).toBeLessThan(1.5);
    const ov = sfxSamples(ovS);
    expect(loop[ov + 5]).toBe(src[ov + 5]);
  });
});
