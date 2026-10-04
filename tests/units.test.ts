import { describe, expect, it } from 'vitest';
import {
  degToRad,
  ktToMps,
  METERS_PER_YARD,
  MPS_PER_KNOT,
  mpsToKt,
  mToNm,
  mToYd,
  nmToM,
  radToDeg,
  wrapDeg180,
  ydToM,
} from '../src/core/units';
import hitRateModel from '../data/hit_rate_model.json';

describe('units: 速度', () => {
  it('1 kt は 0.5144 m/s（docs/02 §6.1）', () => {
    expect(MPS_PER_KNOT).toBe(0.5144);
    expect(ktToMps(1)).toBeCloseTo(0.5144, 6);
  });

  it('27 kt（駆逐艦の典型速力）は約 13.9 m/s', () => {
    expect(ktToMps(27)).toBeCloseTo(13.889, 3);
  });

  it('kt ⇄ m/s は往復で元に戻る', () => {
    for (const kt of [0, 6, 12.5, 27, 41, 44]) {
      expect(mpsToKt(ktToMps(kt))).toBeCloseTo(kt, 9);
    }
  });
});

describe('units: 距離', () => {
  it('1 yd は 0.9144 m', () => {
    expect(METERS_PER_YARD).toBe(0.9144);
    expect(ydToM(1)).toBeCloseTo(0.9144, 6);
  });

  it('命中率KPIの距離帯境界（yd）は data/hit_rate_model.json の m 値と一致する', () => {
    // 400yd→366m, 800yd→732m, 1200yd→1097m, 2000yd→1829m（docs/02 §6.3）
    const expected: Array<[number, number]> = [
      [400, 366],
      [800, 732],
      [1200, 1097],
      [2000, 1829],
    ];
    for (const [yd, m] of expected) {
      expect(Math.round(ydToM(yd))).toBe(m);
    }
    const maxima = hitRateModel.kpi_by_range.map((b) => b.range_m_max).slice(0, 4);
    expect(maxima).toEqual(expected.map(([, m]) => m));
  });

  it('yd ⇄ m、海里 ⇄ m は往復で元に戻る', () => {
    expect(mToYd(ydToM(1500))).toBeCloseTo(1500, 9);
    expect(nmToM(1)).toBe(1852);
    expect(mToNm(nmToM(3.5))).toBeCloseTo(3.5, 9);
  });
});

describe('units: 角度', () => {
  it('度 ⇄ ラジアン', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI, 12);
    expect(radToDeg(Math.PI / 2)).toBeCloseTo(90, 12);
  });

  it('wrapDeg180 は (-180, 180] に正規化する', () => {
    expect(wrapDeg180(0)).toBe(0);
    expect(wrapDeg180(190)).toBe(-170);
    expect(wrapDeg180(-190)).toBe(170);
    expect(wrapDeg180(540)).toBe(180);
    expect(wrapDeg180(-180)).toBe(180);
    expect(wrapDeg180(180)).toBe(180);
    expect(wrapDeg180(359)).toBe(-1);
    expect(wrapDeg180(-540)).toBe(180);
    expect(wrapDeg180(360 * 1e6 + 90)).toBeCloseTo(90, 6);
    expect(wrapDeg180(-(360 * 1e6) - 90)).toBeCloseTo(-90, 6);
  });

  it('wrapDeg180 は範囲内の値（小数含む）をビット単位でそのまま返す', () => {
    for (const d of [0.1, -0.1, 179.99, -179.99, 180, 12.345678901234]) {
      expect(wrapDeg180(d)).toBe(d);
    }
    expect(wrapDeg180(180.5)).toBeCloseTo(-179.5, 9);
    expect(wrapDeg180(-179.5)).toBe(-179.5);
  });
});
