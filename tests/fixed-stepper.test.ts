import { describe, expect, it } from 'vitest';
import { FixedStepper } from '../src/core/fixed-stepper';

describe('FixedStepper', () => {
  it('経過時間を貯めて固定幅で step を呼ぶ', () => {
    const st = new FixedStepper(1 / 60, 4);
    const dts: number[] = [];
    const fn = (dt: number) => dts.push(dt);
    expect(st.advance(1 / 120, fn)).toBe(0);
    expect(st.advance(1 / 120, fn)).toBe(1);
    expect(st.advance(1 / 30, fn)).toBe(2);
    expect(dts.every((d) => d === 1 / 60)).toBe(true);
    expect(st.pending).toBeLessThan(1 / 60);
  });
  it('巨大な delta は最大回数で打ち切り、残りを捨てる', () => {
    const st = new FixedStepper(1 / 60, 4);
    let n = 0;
    expect(st.advance(2.0, () => n++)).toBe(4);
    expect(n).toBe(4);
    expect(st.pending).toBeLessThan(1e-9);
  });
  it('上限ちょうどで足りる低フレームレート（16fps）でも、シミュレーション時間は遅れない', () => {
    const st = new FixedStepper(1 / 60, 4);
    let n = 0;
    for (let i = 0; i < 160; i++) n += st.advance(1 / 16, () => undefined);
    // 10 秒 × 60 ステップ/秒 = 600（端数の持ち越しで ±1）
    expect(Math.abs(n - 600)).toBeLessThanOrEqual(1);
  });
  it('30fps でも 60fps でも合計ステップ数は同じ', () => {
    const a = new FixedStepper(1 / 60, 4);
    const b = new FixedStepper(1 / 60, 4);
    let na = 0;
    let nb = 0;
    for (let i = 0; i < 60; i++) na += a.advance(1 / 60, () => undefined);
    for (let i = 0; i < 30; i++) nb += b.advance(1 / 30, () => undefined);
    expect(na).toBe(60);
    expect(nb).toBe(60);
  });
  it('不正な引数は例外', () => {
    expect(() => new FixedStepper(0, 4)).toThrow();
    expect(() => new FixedStepper(1 / 60, 0)).toThrow();
  });
});
