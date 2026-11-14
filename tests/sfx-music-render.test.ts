// v0.7.2 S0（アートと音③：BGM と命中スローの音。spec-v0720 §2・§3.3・§3.4・§8.1・§10 R1〜R7）: 分けて描く曲（assets/sfx-music-render の MusicBuilder）を固定する。
// - 分けて描いた標本＝一度に描いた標本（ビット同一。予算 150,000・小さい予算・JIT の初回の上限の有無に依らない）・16 bit の指紋（FNV）・長さ・頂 0.9・直流なし。
// - 輪: 尾は頭へ続く（輪で描いた音符の和＝長い配列に描いて末尾を頭へ畳んだ和）・継ぎ目の標本の差は中のふつうの差（99%）の内・継ぎ目をまたぐ 50 ms の RMS は前後の幅 ±2 dB の内。
// - 大きさ（§3.4）: 鍵の音量 × 標本の RMS × master 0.8 が出口の目標（メニュー −24・静か −33・緊張 −30・戦闘 −27 dBFS）の ±1.5 dB。帯の割合（§3.3）: 400 Hz より上 ≥ 60%・
//   200 Hz より下 ≤ 12%。任務の層は L2 を 4 回で重ねる（R6）。
// - v0.7.2 IP1: 部屋の響き（D・E の room）も分けて描いて同じ標本（小さい予算で）・響きは継ぎ目で続く（上の継ぎ目の試験）・響きのない曲（A・任務の家族）は響きの段を通らない。
// - 予算（§2・R1）: どの stepBuild も予算を超えない・音 1 秒の費用は予算 5 フレームまで・進みは 0 → 1・作業用の配列は 1 本（R2）。
import { describe, expect, it } from 'vitest';
import {
  MUSIC_BUILD_BUDGET, MUSIC_BUILD_MIN_BUDGET, MUSIC_COST, MUSIC_GAIN, MUSIC_KEYS, MUSIC_LAYER_KEYS, MUSIC_LENGTHS, MUSIC_LEVEL_TOLERANCE_DB, MUSIC_MASTER_GAIN, MUSIC_MOOD_WEIGHTS, MUSIC_PEAK, MUSIC_SAMPLE_RATE,
  MUSIC_TARGET_DBFS, MUSIC_TITLE_KEYS, MUSIC_WORK_SAMPLES, type MusicKey,
} from '../src/config/sfx-music-config';
import { MusicBuilder, composeMusicKey, renderMusic } from '../src/assets/sfx-music-render';
import { MUSIC_INSTRUMENTS, MusicTables, musicNoteSamples, stepFm, stepNoise, stepTone } from '../src/assets/sfx-music-synth';
import { bandShares } from '../scripts/sfx-files';

const SR = MUSIC_SAMPLE_RATE;
const TB = new MusicTables();
const WORK = new Float32Array(MUSIC_WORK_SAMPLES);
const X = Object.fromEntries(MUSIC_KEYS.map((k) => [k, renderMusic(k, MUSIC_BUILD_BUDGET, TB, WORK)])) as Record<MusicKey, Float32Array>;
const rmsOf = (x: Float32Array, a = 0, b = x.length): number => { let s = 0; for (let i = a; i < b; i++) s += x[i]! * x[i]!; return Math.sqrt(s / (b - a)); };
const peakOf = (x: Float32Array): number => x.reduce((a, v) => Math.max(a, Math.abs(v)), 0);
const db = (v: number): number => 20 * Math.log10(v);
/** 16 bit に丸めた標本の FNV-1a（tests/sfx-synth と同じ） */
function fingerprint16(x: Float32Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < x.length; i++) {
    const v = Math.round(x[i]! * 32767) & 0xffff;
    h = Math.imul(h ^ (v & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ (v >>> 8), 0x01000193) >>> 0;
  }
  return h;
}
/** 鍵ごとの指紋（作り方・種・楽器を直したら直す。Node（V8）の Math.sin・exp・pow・log に依る＝tests/sfx-synth と同じ） */
const FINGERPRINTS: Readonly<Record<MusicKey, number>> = {
  title_a: 4284675595, title_d: 603232752, title_e: 1072575395, mission_l0: 900593930, mission_l1: 3400001408, mission_l2: 542741560,
};
/** 段の重ね（L2 は 4 回）× 鍵の音量 */
function moodMix(mood: number): Float32Array {
  const n = X.mission_l0.length, out = new Float32Array(n), w = MUSIC_MOOD_WEIGHTS[mood]!;
  MUSIC_LAYER_KEYS.forEach((k, li) => { const x = X[k], g = w[li]! * MUSIC_GAIN[k]; for (let i = 0; i < n; i++) out[i] = out[i]! + x[i % x.length]! * g; });
  return out;
}

describe('分けて描く曲（v0.7.2 S0）', () => {
  it.each([...MUSIC_KEYS])('%s: 長さは表のとおり・頂 0.9・直流なし・NaN なし・16 bit の指紋', (k) => {
    const x = X[k];
    expect(x.length).toBe(MUSIC_LENGTHS[k]);
    expect(x.every((v) => Number.isFinite(v))).toBe(true);
    expect(peakOf(x)).toBeCloseTo(MUSIC_PEAK, 5);
    // 打楽器の層（glue）は頂の 3 次の丸めが直流を引いた後に来る＝心音・拍の打ちの減る波の形の偏りで 1e-4 を少し越える（v0.7.2 IP1。−60 dBFS 未満＝聞こえない・頂 0.9 を保つ）
    expect(Math.abs(x.reduce((a, v) => a + v, 0) / x.length)).toBeLessThan(composeMusicKey(k).theme.glue ? 1e-3 : 1e-4);
    expect(fingerprint16(x), k).toBe(FINGERPRINTS[k]);
  });
  it.each([...MUSIC_KEYS])('%s: 分けて描いた標本＝一度に描いた標本（ビット同一。予算 150,000・小さい予算 9,973・表も作り直して）', (k) => {
    const one = renderMusic(k, Infinity, TB, WORK);
    expect(Buffer.from(one.buffer).equals(Buffer.from(X[k].buffer))).toBe(true);
    if (k === 'title_e' || k === 'mission_l2') {
      const small = renderMusic(k, 9973, new MusicTables(), new Float32Array(MUSIC_LENGTHS[k]));
      expect(Buffer.from(small.buffer).equals(Buffer.from(X[k].buffer))).toBe(true);
    }
  });
  it('IP1: 部屋の響きは D・E だけ（A と任務の家族は通らない＝A の標本は S0 のまま）・響きの段の費用は (ならし ＋ 輪) × room 単位', () => {
    expect(MUSIC_KEYS.filter((k) => composeMusicKey(k).theme.room !== undefined)).toEqual(['title_d', 'title_e']);
    for (const k of MUSIC_KEYS) {
      const sc = composeMusicKey(k), dry = new MusicBuilder(TB, WORK, { ...sc, theme: { ...sc.theme, room: undefined } }), wet = new MusicBuilder(TB, WORK, sc);
      const room = sc.theme.room;
      expect(wet.totalUnits - dry.totalUnits, k).toBeCloseTo(room ? (Math.round(1.5 * room[1] * SR) + sc.n) * MUSIC_COST.room - sc.n * MUSIC_COST.pass : 0, 6);
    }
  });
  it.each([...MUSIC_KEYS])('%s: 輪の尾は頭へ続く（輪で描いた音符の和＝長い配列に描いて末尾を頭へ畳んだ和）', (k) => {
    const sc = composeMusicKey(k), n = sc.n, tail = Math.max(...sc.notes.map((x) => x.start + musicNoteSamples(x))) - n;
    const ring = new Float32Array(n), long = new Float32Array(n + Math.max(0, tail)), st = new Float64Array(8);
    for (const nt of sc.notes) {
      for (const [dst, len] of [[ring, n], [long, long.length]] as const) {
        st.fill(0);
        const T = musicNoteSamples(nt), kind = MUSIC_INSTRUMENTS[nt.inst].kind;
        if (kind === 'tone') stepTone(dst, len, nt, 0, T, st, TB);
        else if (kind === 'fm') stepFm(dst, len, nt, 0, T, st, TB);
        else stepNoise(dst, len, nt, 0, T, st, TB);
      }
    }
    let worst = 0;
    for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(ring[i]! - (long[i]! + (i < tail ? long[n + i]! : 0))));
    expect(worst, k).toBeLessThan(1e-5 * Math.max(1, peakOf(ring)));
    expect(tail).toBeGreaterThan(0); // 輪をまたぐ尾がある（空の検査にしない）
  });
  it.each([...MUSIC_KEYS])('%s: 継ぎ目（末尾 → 頭）の標本の差は中の差の 99% の内・継ぎ目をまたぐ 50 ms の RMS は前後の 50 ms の幅 ±2 dB の内', (k) => {
    const x = X[k], n = x.length, jumps: number[] = [];
    for (let i = 1; i < n; i++) jumps.push(Math.abs(x[i]! - x[i - 1]!));
    jumps.sort((a, b) => a - b);
    expect(Math.abs(x[0]! - x[n - 1]!)).toBeLessThanOrEqual(jumps[Math.floor(jumps.length * 0.99)]!);
    const w = Math.round(0.025 * SR), seam = new Float32Array([...x.subarray(n - w), ...x.subarray(0, w)]);
    const before = db(rmsOf(x, n - 3 * w, n - w)), after = db(rmsOf(x, w, 3 * w)), across = db(rmsOf(seam));
    expect(across).toBeGreaterThanOrEqual(Math.min(before, after) - 2);
    expect(across).toBeLessThanOrEqual(Math.max(before, after) + 2);
  });
  it.each([...MUSIC_KEYS])('%s: 帯の割合（§3.3）: 400 Hz より上 ≥ 60%・200 Hz より下 ≤ 12%・RMS は −22〜−12 dBFS（頂 0.9 で）', (k) => {
    const [hi, lo] = bandShares(X[k], SR);
    expect(hi, k).toBeGreaterThanOrEqual(0.6);
    expect(lo, k).toBeLessThanOrEqual(0.12);
    const r = db(rmsOf(X[k]));
    expect(r > -22 && r < -12, `${k} ${r.toFixed(1)} dBFS`).toBe(true);
  });
  it('出口の RMS（§3.4）: タイトルの候補はどれもメニュー −24、任務の段は静か −33・緊張 −30・戦闘 −27 dBFS（±1.5 dB）。重ねた段も帯の割合を守る', () => {
    for (const k of MUSIC_TITLE_KEYS) expect(Math.abs(db(rmsOf(X[k]) * MUSIC_GAIN[k] * MUSIC_MASTER_GAIN) - MUSIC_TARGET_DBFS.menu), k).toBeLessThanOrEqual(MUSIC_LEVEL_TOLERANCE_DB);
    [MUSIC_TARGET_DBFS.quiet, MUSIC_TARGET_DBFS.tense, MUSIC_TARGET_DBFS.battle].forEach((t, m) => {
      const x = moodMix(m), [hi, lo] = bandShares(x, SR);
      expect(Math.abs(db(rmsOf(x) * MUSIC_MASTER_GAIN) - t), `段 ${m}`).toBeLessThanOrEqual(MUSIC_LEVEL_TOLERANCE_DB);
      expect(hi).toBeGreaterThanOrEqual(0.6);
      expect(lo).toBeLessThanOrEqual(0.12);
      expect(peakOf(x) * MUSIC_MASTER_GAIN).toBeLessThan(0.4); // 出口の頂の余り（§4.5）
    });
  });
  it('予算（§2・R1）: どの stepBuild も予算を超えない（表も）・小さい予算でも進む・音 1 秒の費用は予算 5 フレームまで・進みは 0 から 1 へ増える', () => {
    for (const k of MUSIC_KEYS) {
      const b = new MusicBuilder(TB, WORK, composeMusicKey(k));
      expect(b.progress).toBe(0);
      expect(() => b.result()).toThrow();
      let last = 0, calls = 0;
      while (!b.done) {
        const u = b.stepBuild(MUSIC_BUILD_BUDGET);
        expect(u).toBeLessThanOrEqual(MUSIC_BUILD_BUDGET);
        expect(b.progress).toBeGreaterThanOrEqual(last);
        last = b.progress;
        calls++;
      }
      expect(b.progress).toBe(1);
      expect(calls).toBeLessThanOrEqual(Math.ceil(b.totalUnits / MUSIC_BUILD_BUDGET) * 3);
      expect(b.totalUnits / (b.n / SR), k).toBeLessThanOrEqual(5 * MUSIC_BUILD_BUDGET);
    }
    const t = new MusicTables();
    let units = 0;
    while (!t.ready) { const u = t.stepTables(MUSIC_BUILD_BUDGET); expect(u).toBeLessThanOrEqual(MUSIC_BUILD_BUDGET); units += u; }
    expect(units).toBeGreaterThan(MUSIC_BUILD_BUDGET); // 表は 1 フレームで作り切らない（JIT の前の初回を分ける）
    const small = new MusicBuilder(TB, WORK, composeMusicKey('mission_l2'));
    for (let i = 0; i < 1e6 && !small.done; i++) expect(small.stepBuild(MUSIC_BUILD_MIN_BUDGET)).toBeGreaterThan(0);
    expect(small.done).toBe(true);
  });
  it('作業用の配列は 1 本（一番長い鍵の長さ）を使い回す・短い配列では作らない・出来た標本は作業用の配列の中（次に作る前に写す）', () => {
    expect(MUSIC_WORK_SAMPLES).toBe(Math.max(...MUSIC_KEYS.map((k) => MUSIC_LENGTHS[k])));
    expect(() => new MusicBuilder(TB, new Float32Array(1000), composeMusicKey('mission_l2'))).toThrow();
    const b = new MusicBuilder(TB, WORK, composeMusicKey('mission_l2'));
    while (!b.done) b.stepBuild(1e12);
    expect(b.result().buffer).toBe(WORK.buffer);
    expect(b.result().length).toBe(MUSIC_LENGTHS.mission_l2);
  });
});
