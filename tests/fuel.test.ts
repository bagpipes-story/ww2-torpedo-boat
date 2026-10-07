import { describe, expect, it } from 'vitest';
import boats from '../data/boats.json';
import { burnGph, createFuelState, economySpeedMps, fuelCurveFromData, fuelForDistanceGal, isBoatFuelDataRecord, stepFuel, type BoatFuelDataRecord } from '../src/core/fuel';
import { ktToMps, mpsToKt } from '../src/core/units';

const raw: unknown = boats.boats.find((b) => b.id === 'us_elco80');
if (!isBoatFuelDataRecord(raw)) throw new Error('fuel data');
const C = fuelCurveFromData(raw);
const GAME_DT = (1 / 60) * 5;

describe('燃料（docs/02 §6.7）', () => {
  it('data の us_elco80: アイドル 20・巡航 200・全速 500 gal/h、指数 1.857', () => {
    expect(C.capacityGal).toBe(3000);
    expect(C.idleGph).toBeCloseTo(20, 9);
    expect(C.cruiseGph).toBeCloseTo(200, 9);
    expect(C.fullGph).toBeCloseTo(500, 9);
    expect(C.exponent).toBeCloseTo(1.857, 3);
  });
  it('消費率は速度で単調に増え、史実の 2 点を通る。負は NaN にならずアイドル、全速超は頭打ち', () => {
    expect(burnGph(C, 0)).toBeCloseTo(20, 9);
    expect(burnGph(C, -1)).toBeCloseTo(20, 9);
    expect(burnGph(C, ktToMps(8))).toBeCloseTo(45.3, 1);
    expect(burnGph(C, ktToMps(18))).toBeCloseTo(134.2, 1);
    expect(burnGph(C, ktToMps(23))).toBeCloseTo(200, 6);
    expect(burnGph(C, ktToMps(30))).toBeCloseTo(314.85, 1);
    expect(burnGph(C, ktToMps(39))).toBeCloseTo(500, 6);
    expect(burnGph(C, ktToMps(60))).toBeCloseTo(500, 6);
    let prev = -1;
    for (let kt = 0; kt <= 39; kt += 0.5) {
      const g = burnGph(C, ktToMps(kt));
      expect(g).toBeGreaterThan(prev);
      prev = g;
    }
  });
  it('距離あたり: 全速は巡航の 1.474 倍。最も燃費が良いのは 7.66 kt（3.06 gal/km）', () => {
    expect(C.galPerMFull / C.galPerMCruise).toBeCloseTo(1.474, 3);
    const eco = economySpeedMps(C);
    expect(mpsToKt(eco)).toBeCloseTo(7.66, 1);
    expect(fuelForDistanceGal(C, 1000, eco)).toBeCloseTo(3.06, 2);
    // 極小である: 前後の速度より少ない
    expect(fuelForDistanceGal(C, 1000, eco * 0.8)).toBeGreaterThan(fuelForDistanceGal(C, 1000, eco));
    expect(fuelForDistanceGal(C, 1000, eco * 1.2)).toBeGreaterThan(fuelForDistanceGal(C, 1000, eco));
    expect(fuelForDistanceGal(C, 2580.2, C.cruiseMps)).toBeCloseTo(12.12, 2);
    expect(fuelForDistanceGal(C, 3288.4, C.cruiseMps)).toBeCloseTo(15.44, 2);
    expect(fuelForDistanceGal(C, 100, 0)).toBe(Infinity);
    expect(fuelForDistanceGal(C, 0, 0)).toBe(0);
  });
  it('積分: 巡航 1 game 時間で 200 gal、50 gal は全速で 72 実秒（360 game 秒）で空、負にならない、dt=0 は変化なし', () => {
    const s = createFuelState(3000);
    for (let i = 0; i < 3600 / GAME_DT; i++) stepFuel(s, C, C.cruiseMps, GAME_DT);
    expect(3000 - s.gal).toBeCloseTo(200, 1);
    const f = createFuelState(50);
    let steps = 0;
    while (!f.empty && steps < 100000) {
      stepFuel(f, C, C.fullMps, GAME_DT);
      steps++;
    }
    expect(f.empty).toBe(true);
    expect(f.gal).toBe(0);
    expect(steps * GAME_DT).toBeCloseTo(360, 0);
    expect((steps * GAME_DT) / 5).toBeCloseTo(72, 0);
    stepFuel(f, C, C.fullMps, GAME_DT);
    expect(f.gal).toBe(0);
    const z = createFuelState(10);
    stepFuel(z, C, C.fullMps, 0);
    expect(z.gal).toBe(10);
    expect(createFuelState(0).empty).toBe(true);
  });
  it('距離との比例: 命中スロー（dt × 0.3）で積分しても 1 m あたりの消費は同じ', () => {
    const a = createFuelState(50);
    const b = createFuelState(50);
    const v = ktToMps(30);
    let distA = 0;
    let distB = 0;
    for (let i = 0; i < 600; i++) {
      stepFuel(a, C, v, GAME_DT);
      distA += v * GAME_DT;
    }
    for (let i = 0; i < 2000; i++) {
      stepFuel(b, C, v, GAME_DT * 0.3);
      distB += v * GAME_DT * 0.3;
    }
    expect((50 - a.gal) / distA).toBeCloseTo((50 - b.gal) / distB, 9);
  });
  it('data ガード: 欠け・大小関係の崩れは例外', () => {
    const base: BoatFuelDataRecord = { fuel_capacity_gal: 3000, fuel_hours_cruise: 15, fuel_hours_full: 6, fuel_idle_ratio: 0.1, speed_cruise_kt: 23, speed_max_kt: 39 };
    expect(isBoatFuelDataRecord(base)).toBe(true);
    expect(isBoatFuelDataRecord({ ...base, fuel_idle_ratio: undefined })).toBe(false);
    expect(() => fuelCurveFromData({ ...base, fuel_capacity_gal: 0 })).toThrow();
    expect(() => fuelCurveFromData({ ...base, fuel_hours_full: 15 })).toThrow();
    expect(() => fuelCurveFromData({ ...base, fuel_hours_full: 0 })).toThrow();
    expect(() => fuelCurveFromData({ ...base, fuel_idle_ratio: -0.1 })).toThrow();
    expect(() => fuelCurveFromData({ ...base, fuel_idle_ratio: 1 })).toThrow();
    expect(() => fuelCurveFromData({ ...base, speed_max_kt: 23 })).toThrow();
    expect(() => fuelCurveFromData({ ...base, speed_cruise_kt: 0 })).toThrow();
  });
});
