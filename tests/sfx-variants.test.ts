// v0.7.1 IP2（実機 2 回目「弾倉交換はやはりまぬけ…」「魚雷発射音もどんっではなくポンっ」）: 試聴の場（?sfxlab）の案の表（assets/sfx-variants）を固定する。
// - 3 つの音（弾倉の始め reload・弾倉の終わり reload_end・魚雷の発射 torp_launch）に案 A〜D。D は IP1 の音（IP1 の指紋のまま）・既定は A（ゲームで鳴る renderSfx の標本とビット同一）。
// - どの案も: 長さ＝案の秒 × 22,050・有限・頂 0.9・両端 0・直流 < 0.02・2 回作って同じ。同じ音の案どうしは 6 つの数（tests/sfx-synth-cues と同じ数え方）で 1.5 より離れる＝聞き分けられる。
// - 既定の案の秒は表の秒（config/sfx-config）。弾倉の終わりの D だけ IP1 の終わりの速さ 1.06 で鳴らす（ほかは 1）。
// - IP3（実機 3 回目「弾倉はBでいきましょう。魚雷はんーもう何案か出してください」）: 弾倉の既定は始め・終わりとも B（U-R1。IP2 で試聴した B と同じ標本＝指紋が IP2 のまま）。
//   魚雷の発射は新しい案 E〜I を足して 9 案（既定は A のまま）。E〜I は 1.6 秒以内・本体のスピーカー向け（400 Hz より上 ≥ 60%・局所の頂 < 6 dB）・指紋を固定。9 案のどの 2 つも 1.5 より離れる。
import { describe, expect, it } from 'vitest';
import { SFX_SAMPLE_RATE, SFX_TABLE } from '../src/config/sfx-config';
import { renderSfx } from '../src/assets/sfx-bank';
import { meanOf, peakOf, rmsOf, zeroCrossings } from '../src/assets/sfx-dsp';
import { SFX_VARIANT_GROUPS, renderSfxVariant } from '../src/assets/sfx-variants';
import { centroidHz, spectrum } from '../scripts/sfx-files';

const SR = SFX_SAMPLE_RATE;
const at = (s: number): number => Math.round(s * SR);
function fingerprint16(x: Float32Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < x.length; i++) {
    const v = Math.round(x[i]! * 32767) & 0xffff;
    h = Math.imul(h ^ (v & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ (v >>> 8), 0x01000193) >>> 0;
  }
  return h;
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
/** tests/sfx-synth-cues の 6 つの数（重心・零交差・頭 50 ms の重心・−20 dB までの長さ・頂の位置・RMS）の log2 の差の和 */
function dist(a: Float32Array, b: Float32Array): number {
  const f = (v: Float32Array): number[] => [centroidHz(v, 0, v.length, SR), zeroCrossings(v) / v.length, centroidHz(v, 0, Math.min(v.length, at(0.05)), SR), len20(v) + 0.05, peakAt(v) + 0.02, rmsOf(v)];
  const fa = f(a), fb = f(b);
  return fa.reduce((s, x, i) => s + Math.abs(Math.log2(x / fb[i]!)), 0);
}
/** 帯 [lo, ∞) Hz のエネルギーの割合（tests/sfx-synth-cues と同じ数え方） */
function shareAbove(v: Float32Array, hz: number): number {
  const size = 1024;
  let hi = 0, all = 0;
  for (let f = 0; f < v.length; f += size) {
    const m = spectrum(v, f, Math.min(size, v.length - f), size);
    for (let i = 1; i < m.length; i++) { const p = m[i]! * m[i]!; all += p; if ((i * SR) / size >= hz) hi += p; }
  }
  return all > 0 ? hi / all : 0;
}
/** 平均スペクトルの局所の頂（dB。tests/sfx-synth-cues と同じ＝高さ（音程）の目立ち。白色雑音は約 4 dB） */
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
/** IP2 で試聴した弾倉の B（IP3 から既定）と、IP3 の魚雷の発射の新しい案 E〜I の指紋 */
const B_FP: Readonly<Record<string, number>> = { reload: 464075404, reload_end: 345574464 };
const NEW_FP: Readonly<Record<string, number>> = { E: 2172940326, F: 1125567461, G: 1433634797, H: 2336520830, I: 872527779 };
/** IP1 の reload・torp_launch の指紋（tests/sfx-synth の IP1 の値。D はこのまま） */
const IP1_FP: Readonly<Record<string, number>> = { reload: 3382733306, reload_end: 3382733306, torp_launch: 1786366453 };
const memo = new Map<string, Float32Array>();
const render = (gi: number, vi: number): Float32Array => {
  const k = `${gi}:${vi}`;
  if (!memo.has(k)) memo.set(k, renderSfxVariant(SFX_VARIANT_GROUPS[gi]!.variants[vi]!));
  return memo.get(k)!;
};
const CASES = SFX_VARIANT_GROUPS.flatMap((g, gi) => g.variants.map((v, vi) => [`${g.key} ${v.id}`, gi, vi] as const));

describe('試聴の案の表（v0.7.1 IP2・IP3）', () => {
  it('弾倉の始め・終わりに A〜D（既定は B＝U-R1）、魚雷の発射に A〜I（既定は A のまま）。D は IP1 の音。一言は案ごとに 1 つ・型は新しい案だけ', () => {
    expect(SFX_VARIANT_GROUPS.map((g) => g.key)).toEqual(['reload', 'reload_end', 'torp_launch']);
    for (const g of SFX_VARIANT_GROUPS) {
      const torp = g.key === 'torp_launch';
      expect(g.variants.map((v) => v.id).join('')).toBe(torp ? 'ABCDEFGHI' : 'ABCD');
      expect(g.defaultId).toBe(torp ? 'A' : 'B');
      expect(g.notesJa.length).toBe(g.variants.length);
      expect(g.notesJa[3]).toBe('IP1 の音');
      for (const v of g.variants) expect(v.rate).toBe(g.key === 'reload_end' && v.id === 'D' ? 1.06 : 1);
      if (torp) expect(g.kindsJa).toEqual(['', '', '', '', '大砲', '落とす', '映画', '走り去る', 'Aを重く']);
      else expect(g.kindsJa).toBeUndefined();
    }
  });
  it('IP3: 弾倉の既定 B は IP2 で試聴した B と同じ標本（指紋）。魚雷の新しい案 E〜I は 1.6 秒以内・指紋が固定・本体のスピーカー向け（400 Hz より上 ≥ 60%・局所の頂 < 6 dB）', () => {
    for (const gi of [0, 1]) expect(fingerprint16(render(gi, 1)), SFX_VARIANT_GROUPS[gi]!.key).toBe(B_FP[SFX_VARIANT_GROUPS[gi]!.key]);
    const g = SFX_VARIANT_GROUPS[2]!;
    for (let vi = 4; vi < g.variants.length; vi++) {
      const v = g.variants[vi]!, x = render(2, vi);
      expect(v.seconds, v.id).toBeLessThanOrEqual(1.6);
      expect(fingerprint16(x), v.id).toBe(NEW_FP[v.id]);
      expect(shareAbove(x, 400), v.id).toBeGreaterThanOrEqual(0.6);
      expect(peakinessDb(x), v.id).toBeLessThan(6);
    }
  });
  it.each(CASES)('%s: 長さ・有限・頂 0.9・両端 0・直流・2 回作って同じ', (_name, gi, vi) => {
    const v = SFX_VARIANT_GROUPS[gi]!.variants[vi]!;
    const x = render(gi, vi);
    expect(x.length).toBe(at(v.seconds));
    for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i]!)) throw new Error(`標本 ${i} が有限でない`);
    expect(peakOf(x)).toBeCloseTo(0.9, 5);
    expect(Math.abs(x[0]!)).toBeLessThan(1e-3);
    expect(Math.abs(x[x.length - 1]!)).toBeLessThan(1e-3);
    expect(Math.abs(meanOf(x))).toBeLessThan(0.02);
    expect(Buffer.from(renderSfxVariant(v).buffer).equals(Buffer.from(x.buffer))).toBe(true);
  });
  it('既定の案はゲームの標本（renderSfx）とビット同一で、秒は表の秒。D は IP1 の指紋のまま', () => {
    SFX_VARIANT_GROUPS.forEach((g, gi) => {
      const di = g.variants.findIndex((v) => v.id === g.defaultId);
      expect(g.variants[di]!.seconds, g.key).toBe(SFX_TABLE[g.key].seconds);
      expect(Buffer.from(render(gi, di).buffer).equals(Buffer.from(renderSfx(g.key).buffer)), g.key).toBe(true);
      expect(fingerprint16(render(gi, 3)), `${g.key} D`).toBe(IP1_FP[g.key]);
    });
  });
  it('同じ音の案どうしは 6 つの数で 1.5 より離れる（聞き分けられる）', () => {
    SFX_VARIANT_GROUPS.forEach((g, gi) => {
      for (let i = 0; i < g.variants.length; i++) for (let j = i + 1; j < g.variants.length; j++) {
        expect(dist(render(gi, i), render(gi, j)), `${g.key} ${g.variants[i]!.id}${g.variants[j]!.id}`).toBeGreaterThan(1.5);
      }
    });
  });
  it('案を作る時間は小さい（全部で 17 本・1 本あたり 60 ms 未満。試聴の場は押した時に 1 回だけ作る）', () => {
    for (const g of SFX_VARIANT_GROUPS) for (const v of g.variants) {
      const t0 = performance.now();
      renderSfxVariant(v);
      expect(performance.now() - t0, `${g.key} ${v.id}`).toBeLessThan(60);
    }
  });
});
