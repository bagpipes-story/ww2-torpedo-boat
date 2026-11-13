// v0.7.1 IP2（実機 2 回目「弾倉交換はやはりまぬけ…」「魚雷発射音もどんっではなくポンっ」）: 試聴の場（?sfxlab）の案の表（assets/sfx-variants）を固定する。
// - 3 つの音（弾倉の始め reload・弾倉の終わり reload_end・魚雷の発射 torp_launch）に案 A〜D。D は IP1 の音（IP1 の指紋のまま）・既定は A（ゲームで鳴る renderSfx の標本とビット同一）。
// - どの案も: 長さ＝案の秒 × 22,050・有限・頂 0.9・両端 0・直流 < 0.02・2 回作って同じ。同じ音の案どうしは 6 つの数（tests/sfx-synth-cues と同じ数え方）で 1.5 より離れる＝聞き分けられる。
// - 既定の案の秒は表の秒（config/sfx-config）。弾倉の終わりの D だけ IP1 の終わりの速さ 1.06 で鳴らす（ほかは 1）。
import { describe, expect, it } from 'vitest';
import { SFX_SAMPLE_RATE, SFX_TABLE } from '../src/config/sfx-config';
import { renderSfx } from '../src/assets/sfx-bank';
import { meanOf, peakOf, rmsOf, zeroCrossings } from '../src/assets/sfx-dsp';
import { SFX_VARIANT_GROUPS, renderSfxVariant } from '../src/assets/sfx-variants';
import { centroidHz } from '../scripts/sfx-files';

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
/** IP1 の reload・torp_launch の指紋（tests/sfx-synth の IP1 の値。D はこのまま） */
const IP1_FP: Readonly<Record<string, number>> = { reload: 3382733306, reload_end: 3382733306, torp_launch: 1786366453 };
const memo = new Map<string, Float32Array>();
const render = (gi: number, vi: number): Float32Array => {
  const k = `${gi}:${vi}`;
  if (!memo.has(k)) memo.set(k, renderSfxVariant(SFX_VARIANT_GROUPS[gi]!.variants[vi]!));
  return memo.get(k)!;
};
const CASES = SFX_VARIANT_GROUPS.flatMap((g, gi) => g.variants.map((v, vi) => [`${g.key} ${v.id}`, gi, vi] as const));

describe('試聴の案の表（v0.7.1 IP2）', () => {
  it('3 つの音（弾倉の始め・終わり・魚雷の発射）に A〜D の 4 案。既定は A・D は IP1 の音。一言は案ごとに 1 つ', () => {
    expect(SFX_VARIANT_GROUPS.map((g) => g.key)).toEqual(['reload', 'reload_end', 'torp_launch']);
    for (const g of SFX_VARIANT_GROUPS) {
      expect(g.variants.map((v) => v.id)).toEqual(['A', 'B', 'C', 'D']);
      expect(g.defaultId).toBe('A');
      expect(g.notesJa.length).toBe(4);
      expect(g.notesJa[3]).toBe('IP1 の音');
      for (const v of g.variants) expect(v.rate).toBe(g.key === 'reload_end' && v.id === 'D' ? 1.06 : 1);
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
  it('案を作る時間は小さい（全部で 12 本・1 本あたり 60 ms 未満。試聴の場は押した時に 1 回だけ作る）', () => {
    for (const g of SFX_VARIANT_GROUPS) for (const v of g.variants) {
      const t0 = performance.now();
      renderSfxVariant(v);
      expect(performance.now() - t0, `${g.key} ${v.id}`).toBeLessThan(60);
    }
  });
});
