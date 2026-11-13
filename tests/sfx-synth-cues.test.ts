// v0.7.1 S4（spec-v0710 §4・§3.2）: 合図 10 本（torp_launch・hull_hit・alarm・light_on・flare_pop・bomb_fall・reload・smoke・bell・engine_cough）の聞き分けを数で固定する
// （共通の検査＝長さ・頂・直流・両端・指紋・RMS の帯は tests/sfx-synth）。
// - 本体のスピーカー（約 400 Hz より下が出ない）でも聞こえる: 400 Hz より上のエネルギーの割合の下限。合図で低く鳴らす速さ（鐘 0.5・サイレン 0.7・咳 0.7）でも。
// - 単発 20 本のどの 2 本も、重心・零交差・頭 50 ms の重心・−20 dB までの長さ・頂の位置・RMS（log2 の差の和）が 2 より離れる（scripts の表と同じ数え方）。
// - 鍵ごとの形: 警報は甲高くない（2 kHz より上 < 3%）2 音・爆弾は高さが下がり大きさが上がる・弾倉は 3 打・機関の咳は 3 打・鐘は長く澄む・煙幕は頭が無く星弾より暗い・
//   魚雷の発射は 0.37 秒の後に水音・探照灯は続くうなり。
// - IP1（実機 1 回目「弾倉交換の音がまぬけ」「魚雷の発射音をもう少しカッコよく」）: 弾倉は鋼の音（400 Hz より下がほぼ無い・1 kHz より上が主）、魚雷の発射は頭に衝撃・
//   着水の後にスクリューのうなり（中の高さ 0.6〜1.4 kHz）。
// - IP2（実機 2 回目「弾倉交換はやはりまぬけ…」「魚雷発射音も…ポンっ」）: 弾倉は始め reload・終わり reload_end の 2 本で、どちらも雑音の金属（高さが目立たない＝平均スペクトルの
//   局所の頂 < 8 dB。IP1 は 14.6 dB）。魚雷の発射は高さの無い雑音の「どん」（180〜700 Hz に 40% 以上・頂 < 6 dB）。スクリューのうなりはやめた。案の表は tests/sfx-variants。
import { describe, expect, it } from 'vitest';
import { SFX_KEYS, SFX_SAMPLE_RATE, SFX_TABLE, type SfxKey } from '../src/config/sfx-config';
import { renderSfx } from '../src/assets/sfx-bank';
import { peakOf, rmsOf, zeroCrossings } from '../src/assets/sfx-dsp';
import { centroidHz, spectrum } from '../scripts/sfx-files';

const SR = SFX_SAMPLE_RATE;
const S4: readonly SfxKey[] = ['torp_launch', 'hull_hit', 'alarm', 'light_on', 'flare_pop', 'bomb_fall', 'reload', 'reload_end', 'smoke', 'bell', 'engine_cough'];
const memo = new Map<SfxKey, Float32Array>();
const x = (k: SfxKey): Float32Array => { if (!memo.has(k)) memo.set(k, renderSfx(k)); return memo.get(k)!; };
const at = (s: number): number => Math.round(s * SR);

function shareAbove(v: Float32Array, hz: number): number {
  const size = 1024;
  let hi = 0, all = 0;
  for (let f = 0; f < v.length; f += size) {
    const m = spectrum(v, f, Math.min(size, v.length - f), size);
    for (let i = 1; i < m.length; i++) { const p = m[i]! * m[i]!; all += p; if ((i * SR) / size >= hz) hi += p; }
  }
  return all > 0 ? hi / all : 0;
}
function peakAt(v: Float32Array): number {
  let a = 0;
  for (let i = 0; i < v.length; i++) if (Math.abs(v[i]!) > Math.abs(v[a]!)) a = i;
  return a / SR;
}
function len20(v: Float32Array): number {
  const p = peakOf(v) * 0.1;
  for (let i = v.length - 1; i >= 0; i--) if (Math.abs(v[i]!) >= p) return i / SR;
  return 0;
}
/** 帯 [lo, hi) Hz のエネルギーの割合 */
function shareIn(v: Float32Array, lo: number, hi: number): number {
  return shareAbove(v, lo) - shareAbove(v, hi);
}
/** 平均スペクトル（窓 1024・半分ずつ重ねる）の局所の頂: 各 bin ÷ 前後 ±150 Hz の中央値の最大（dB。200 Hz〜6 kHz）＝高さ（音程）の目立ち。白色雑音は 4 dB 前後 */
function peakinessDb(v: Float32Array): number {
  const size = 1024;
  const avg = new Float64Array(size / 2);
  for (let f = 0; f < v.length; f += size / 2) {
    const m = spectrum(v, f, Math.min(size, v.length - f), size);
    for (let i = 0; i < m.length; i++) avg[i] = avg[i]! + m[i]! * m[i]!;
  }
  const w = Math.round((150 * size) / SR);
  let best = 0;
  for (let i = w; i < avg.length - w; i++) {
    const hz = (i * SR) / size;
    if (hz < 200 || hz > 6000) continue;
    const nb: number[] = [];
    for (let j = -w; j <= w; j++) if (j !== 0) nb.push(avg[i + j]!);
    nb.sort((a, b) => a - b);
    best = Math.max(best, avg[i]! / (nb[nb.length >> 1]! + 1e-20));
  }
  return 10 * Math.log10(best);
}
/** 20 ms ごとの RMS が前後より大きく、頂の 40% を超える山の数（打の数） */
function bursts(v: Float32Array): number {
  const w = at(0.02);
  const r: number[] = [];
  for (let a = 0; a + w <= v.length; a += w) r.push(rmsOf(v, a, a + w));
  const top = Math.max(...r);
  let n = 0;
  for (let i = 0; i < r.length; i++) if (r[i]! > top * 0.4 && (i === 0 || r[i]! > r[i - 1]!) && (i === r.length - 1 || r[i]! >= r[i + 1]!)) n++;
  return n;
}

describe('合図 11 本の聞き分け（v0.7.1 S4。IP2 で弾倉の終わり）', () => {
  it.each(S4)('%s: 本体のスピーカーで聞こえる（400 Hz より上のエネルギー ≥ 30%）', (k) => {
    expect(shareAbove(x(k), 400)).toBeGreaterThanOrEqual(0.3);
  });
  it('低く鳴らす合図も聞こえる: 鐘 rate 0.5（Result の未帰投）・サイレン rate 0.7（空襲の予告）・咳 rate 0.7（燃料切れ）・座礁 blast_s rate 0.6', () => {
    expect(shareAbove(x('bell'), 400 / 0.5)).toBeGreaterThan(0.4);
    expect(shareAbove(x('alarm'), 400 / 0.7)).toBeGreaterThan(0.15);
    expect(shareAbove(x('engine_cough'), 400 / 0.7)).toBeGreaterThan(0.25);
    expect(shareAbove(x('blast_s'), 400 / 0.6)).toBeGreaterThan(0.3);
  });
  it('単発 21 本のどの 2 本も 6 つの数（log2 の差の和）で 2 より離れる（IP2: 弾倉の始めと終わりも）', () => {
    const shots = SFX_KEYS.filter((k) => !SFX_TABLE[k].loop);
    expect(shots.length).toBe(21);
    const f = shots.map((k) => {
      const v = x(k);
      return { k, cen: centroidHz(v, 0, v.length, SR), zc: zeroCrossings(v) / v.length, head: centroidHz(v, 0, Math.min(v.length, at(0.05)), SR), l20: len20(v) + 0.05, pk: peakAt(v) + 0.02, rms: rmsOf(v) };
    });
    const l = (a: number, b: number): number => Math.abs(Math.log2(a / b));
    let worst = Infinity, pair = '';
    for (let i = 0; i < f.length; i++) for (let j = i + 1; j < f.length; j++) {
      const a = f[i]!, b = f[j]!;
      const d = l(a.cen, b.cen) + l(a.zc, b.zc) + l(a.head, b.head) + l(a.l20, b.l20) + l(a.pk, b.pk) + l(a.rms, b.rms);
      if (d < worst) { worst = d; pair = `${a.k} ~ ${b.k}`; }
    }
    expect(worst, pair).toBeGreaterThan(2);
  });
  it('警報: 2 音（前半 400 Hz・後半 520 Hz）で甲高くない（2 kHz より上 < 3%・重心 < 1 kHz）。3 回続けて鳴っても冷却 4 秒＝1 回', () => {
    const v = x('alarm');
    expect(shareAbove(v, 2000)).toBeLessThan(0.03);
    expect(centroidHz(v, 0, v.length, SR)).toBeLessThan(1000);
    expect(zeroCrossings(v, at(0.35), at(0.55))).toBeGreaterThan(zeroCrossings(v, at(0.05), at(0.25)) * 1.15);
  });
  it('爆弾: 高さが下がり（終わりの 1/3 の零交差は頭の 1/3 の 0.7 倍より少ない）大きさは上がる（終わりの 1/3 は頭より 9 dB 以上大きい）', () => {
    const v = x('bomb_fall');
    const n3 = Math.round(v.length / 3);
    expect(zeroCrossings(v, 2 * n3, v.length)).toBeLessThan(zeroCrossings(v, 0, n3) * 0.7);
    expect(20 * Math.log10(rmsOf(v, 2 * n3, v.length) / rmsOf(v, 0, n3))).toBeGreaterThan(9);
  });
  it('打の数: 弾倉の始めは 2 打（止め金・抜けた）・終わりは 3 打（差す・槓桿を引く・放す。IP2）・機関の咳は 3 打・被弾は 1 打で短い（−20 dB まで 0.2 秒未満）', () => {
    expect(bursts(x('reload'))).toBe(2);
    expect(bursts(x('reload_end'))).toBe(3);
    expect(bursts(x('engine_cough'))).toBe(3);
    expect(len20(x('hull_hit'))).toBeLessThan(0.2);
  });
  it('鐘は長く澄む（−20 dB まで 0.8 秒より長い・終わりの重心は 660 Hz の近く）。探照灯のうなりは続く（終わりの 1/3 は頭の −6 dB より大きい）', () => {
    const b = x('bell');
    expect(len20(b)).toBeGreaterThan(0.8);
    expect(Math.abs(centroidHz(b, at(1.0), at(1.25), SR) - 660)).toBeLessThan(60);
    const l = x('light_on');
    const n3 = Math.round(l.length / 3);
    expect(20 * Math.log10(rmsOf(l, 2 * n3, l.length) / rmsOf(l, 0, n3))).toBeGreaterThan(-6);
  });
  it('煙幕は頭が無く（頂は 0.1 秒より後）星弾（頭の「ぽん」＝頂は 10 ms の内）より暗い。魚雷の発射は 0.37 秒の後に水音（0.37〜0.47 秒は直前より大きい。IP1）', () => {
    const sm = x('smoke'), fl = x('flare_pop'), tl = x('torp_launch');
    expect(peakAt(sm)).toBeGreaterThan(0.1);
    expect(peakAt(fl)).toBeLessThan(0.01);
    expect(centroidHz(sm, 0, sm.length, SR)).toBeLessThan(centroidHz(fl, 0, fl.length, SR) * 0.85);
    expect(rmsOf(tl, at(0.37), at(0.47))).toBeGreaterThan(rmsOf(tl, at(0.27), at(0.37)));
  });
  it('IP2: 弾倉の始め・終わりは雑音の金属（400 Hz より上 ≥ 95%・局所の頂 < 8 dB＝長く鳴る高さが無い）。始めは短く（−20 dB まで 0.2 秒未満）、終わりは差してから槓桿まで続く（0.25 秒より長い）', () => {
    for (const k of ['reload', 'reload_end'] as const) {
      expect(shareAbove(x(k), 400), k).toBeGreaterThanOrEqual(0.95);
      expect(peakinessDb(x(k)), k).toBeLessThan(8);
    }
    expect(len20(x('reload'))).toBeLessThan(0.2);
    expect(len20(x('reload_end'))).toBeGreaterThan(0.25);
  });
  it('IP2: 魚雷の発射は高さの無い「どん」（180〜700 Hz に 40% 以上・局所の頂 < 6 dB）で本体のスピーカーにも届く（400 Hz より上 ≥ 60%）。一番大きい 0.1 秒は頭（0〜0.1 秒）', () => {
    const tl = x('torp_launch');
    expect(shareIn(tl, 180, 700)).toBeGreaterThanOrEqual(0.4);
    expect(peakinessDb(tl)).toBeLessThan(6);
    expect(shareAbove(tl, 400)).toBeGreaterThanOrEqual(0.6);
    const head = rmsOf(tl, 0, at(0.1));
    for (let t = 0.1; t + 0.1 <= 1; t += 0.1) expect(rmsOf(tl, at(t), at(t + 0.1)), `${t.toFixed(1)} 秒`).toBeLessThan(head);
  });
});
