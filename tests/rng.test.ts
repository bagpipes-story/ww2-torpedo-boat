import { describe, expect, it } from 'vitest';
import { SeededRng } from '../src/core/rng';

describe('SeededRng', () => {
  it('同じシードなら同じ列、違うシードなら違う列', () => {
    const a = new SeededRng(12345);
    const b = new SeededRng(12345);
    const c = new SeededRng(54321);
    const sa = Array.from({ length: 8 }, () => a.next());
    const sb = Array.from({ length: 8 }, () => b.next());
    const sc = Array.from({ length: 8 }, () => c.next());
    expect(sa).toEqual(sb);
    expect(sa).not.toEqual(sc);
  });
  it('乱数列を固定する（Result に表示する seed で再現できるよう、実装変更を検知する）', () => {
    const r = new SeededRng(1);
    const vals = Array.from({ length: 4 }, () => r.next());
    expect(vals).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522, 0.9810509674716741]);
  });
  it('[0,1) に収まり、平均が 0.5 付近', () => {
    const r = new SeededRng(7);
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      sum += v;
    }
    expect(sum / 20000).toBeCloseTo(0.5, 1);
  });
  it('chance(0) は常に false、chance(1) は常に true、chance(0.07) はおよそ 7%', () => {
    const r = new SeededRng(99);
    for (let i = 0; i < 100; i++) {
      expect(r.chance(0)).toBe(false);
      expect(r.chance(1)).toBe(true);
    }
    let hits = 0;
    for (let i = 0; i < 20000; i++) if (r.chance(0.07)) hits++;
    expect(hits / 20000).toBeGreaterThan(0.06);
    expect(hits / 20000).toBeLessThan(0.08);
  });
  it('nextRange は [min, max)', () => {
    const r = new SeededRng(3);
    for (let i = 0; i < 1000; i++) {
      const v = r.nextRange(-3, 3);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(3);
    }
  });
});
