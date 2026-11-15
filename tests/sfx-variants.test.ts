// v0.7.1 IP2（実機 2 回目「弾倉交換はやはりまぬけ…」「魚雷発射音もどんっではなくポンっ」）: 試聴の場（?sfxlab の「効果音の試聴へ」）の案の表（assets/sfx-variants）を固定する。
// - v0.7.1 IP2〜IP4 の聞き比べ（弾倉の A〜D・魚雷の発射の A〜I）で、弾倉は B（U-R1）・魚雷の発射は F（U-R2）に決まった。v0.7.2 S4: 使われなくなった案を片づけ（ユーザーの OK 2026-11-15）、
//   表は 3 つの音（弾倉の始め reload・弾倉の終わり reload_end・魚雷の発射 torp_launch）にゲームの案 1 つずつ。
// - どの案も: 長さ＝案の秒 × 22,050・有限・頂 0.9・両端 0・直流 < 0.02・2 回作って同じ。既定の案はゲームの標本（renderSfx）とビット同一で、秒は表の秒（config/sfx-config）。
// - 弾倉の B は IP2 で試聴した B の指紋のまま。ゲームの torp_launch は IP3 で試聴した F とビット同一（作り方・種 SFX_SEED_LAB_LAUNCH_F・秒 1.4 が同じ＝指紋 1125567461）で、
//   本体のスピーカー向け（400 Hz より上 ≥ 60%・局所の頂 < 6 dB）。
import { describe, expect, it } from 'vitest';
import { SFX_SAMPLE_RATE, SFX_TABLE } from '../src/config/sfx-config';
import { renderSfx } from '../src/assets/sfx-bank';
import { meanOf, peakOf } from '../src/assets/sfx-dsp';
import { SFX_VARIANT_GROUPS, renderSfxVariant } from '../src/assets/sfx-variants';
import { spectrum } from '../scripts/sfx-files';

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
/** IP2 で試聴した弾倉の B（IP3 から既定）と、IP3 で試聴した魚雷の発射の F（IP4 から既定）の指紋 */
const B_FP: Readonly<Record<string, number>> = { reload: 464075404, reload_end: 345574464 };
const F_FP = 1125567461;
const memo = new Map<string, Float32Array>();
const render = (gi: number, vi: number): Float32Array => {
  const k = `${gi}:${vi}`;
  if (!memo.has(k)) memo.set(k, renderSfxVariant(SFX_VARIANT_GROUPS[gi]!.variants[vi]!));
  return memo.get(k)!;
};
const CASES = SFX_VARIANT_GROUPS.flatMap((g, gi) => g.variants.map((v, vi) => [`${g.key} ${v.id}`, gi, vi] as const));

describe('試聴の案の表（v0.7.1 IP2〜IP4・v0.7.2 S4）', () => {
  it('弾倉の始め・終わりは B（U-R1）・魚雷の発射は F（U-R2）の 1 つずつ（v0.7.2 S4 でほかの案を片づけた）。一言は案ごとに 1 つ・型なし・速さは 1', () => {
    expect(SFX_VARIANT_GROUPS.map((g) => g.key)).toEqual(['reload', 'reload_end', 'torp_launch']);
    for (const g of SFX_VARIANT_GROUPS) {
      const torp = g.key === 'torp_launch';
      expect(g.variants.map((v) => v.id).join('')).toBe(torp ? 'F' : 'B');
      expect(g.defaultId).toBe(torp ? 'F' : 'B');
      expect(g.notesJa.length).toBe(g.variants.length);
      for (const v of g.variants) expect(v.rate).toBe(1);
      expect(g.kindsJa).toBeUndefined();
    }
  });
  it('弾倉の B は IP2 で試聴した B と同じ標本（指紋）。魚雷の発射の F は 1.6 秒以内・指紋が固定・本体のスピーカー向け（400 Hz より上 ≥ 60%・局所の頂 < 6 dB）', () => {
    for (const gi of [0, 1]) expect(fingerprint16(render(gi, 0)), SFX_VARIANT_GROUPS[gi]!.key).toBe(B_FP[SFX_VARIANT_GROUPS[gi]!.key]);
    const v = SFX_VARIANT_GROUPS[2]!.variants[0]!, x = render(2, 0);
    expect(v.seconds).toBeLessThanOrEqual(1.6);
    expect(fingerprint16(x)).toBe(F_FP);
    expect(shareAbove(x, 400)).toBeGreaterThanOrEqual(0.6);
    expect(peakinessDb(x)).toBeLessThan(6);
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
  it('既定の案はゲームの標本（renderSfx）とビット同一で、秒は表の秒（torp_launch は 1.4 秒）', () => {
    SFX_VARIANT_GROUPS.forEach((g, gi) => {
      const di = g.variants.findIndex((v) => v.id === g.defaultId);
      expect(g.variants[di]!.seconds, g.key).toBe(SFX_TABLE[g.key].seconds);
      expect(Buffer.from(render(gi, di).buffer).equals(Buffer.from(renderSfx(g.key).buffer)), g.key).toBe(true);
    });
    expect(SFX_TABLE.torp_launch.seconds).toBe(1.4);
    expect(fingerprint16(renderSfx('torp_launch'))).toBe(F_FP);
  });
  it('案を作る時間は小さい（1 本あたり 60 ms 未満。試聴の場は押した時に 1 回だけ作る）', () => {
    for (const g of SFX_VARIANT_GROUPS) for (const v of g.variants) {
      const t0 = performance.now();
      renderSfxVariant(v);
      expect(performance.now() - t0, `${g.key} ${v.id}`).toBeLessThan(60);
    }
  });
});
