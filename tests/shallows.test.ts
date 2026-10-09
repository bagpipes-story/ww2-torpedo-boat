import { describe, expect, it } from 'vitest';
import riskEvents from '../data/risk_events.json';
import {
  SHALLOW_APPROACHING,
  SHALLOW_GROUNDED,
  SHALLOW_INSIDE,
  SHALLOW_NONE,
  distanceToShallowsM,
  groundingParamsFromData,
  isGroundingDataRecord,
  isShallowRectDataRecord,
  shallowIndexAt,
  shallowsFromData,
  updateShallowStatus,
  type ShallowRect,
  type ShallowStatus,
} from '../src/core/shallows';
import { ktToMps } from '../src/core/units';

const R: ShallowRect[] = [{ x: 4300, y: 900, w: 700, h: 800, label: '浅瀬' }];
const rawG: unknown = riskEvents.events.find((e) => e.id === 'grounding');
if (!isGroundingDataRecord(rawG)) throw new Error('grounding data');
const G = groundingParamsFromData(rawG);
const TS = 5;

describe('浅瀬と座礁（docs/02 §6.8）', () => {
  it('data: 安全速力 10 kt、警告 6 秒', () => {
    expect(G.safeSpeedMps).toBeCloseTo(ktToMps(10), 9);
    expect(G.warnLookaheadS).toBe(6);
    expect(isGroundingDataRecord({ params: { safe_speed_kt: 0, warn_lookahead_s: 6 } })).toBe(false);
  });
  it('中か外か: 縁は中', () => {
    expect(shallowIndexAt(R, 4300, 900)).toBe(0);
    expect(shallowIndexAt(R, 5000, 1700)).toBe(0);
    expect(shallowIndexAt(R, 4299.9, 1000)).toBe(-1);
    expect(shallowIndexAt(R, 4500, 1700.1)).toBe(-1);
  });
  it('進行方向の距離: 真東から 300 m、北向きは外れる、中なら 0、斜めは交戦点→帰投地点の直線が横切る', () => {
    expect(distanceToShallowsM(R, 4000, 1300, 90)).toBeCloseTo(300, 6);
    expect(distanceToShallowsM(R, 4000, 1300, 0)).toBe(Infinity);
    expect(distanceToShallowsM(R, 4000, 1300, 270)).toBe(Infinity);
    expect(distanceToShallowsM(R, 4500, 1300, 0)).toBe(0);
    // 南から真北へ: 下端まで 300 m
    expect(distanceToShallowsM(R, 4500, 2000, 0)).toBeCloseTo(300, 6);
    // 遠ざかる向きは当たらない
    expect(distanceToShallowsM(R, 4500, 2000, 180)).toBe(Infinity);
    // 典型的な交戦点 (3000,2100) から帰投地点 (5400,600) へ向かう方位
    const hdg = (Math.atan2(5400 - 3000, -(600 - 2100)) * 180) / Math.PI;
    const d = distanceToShallowsM(R, 3000, 2100, hdg);
    expect(d).toBeGreaterThan(1400);
    expect(d).toBeLessThan(1600);
  });
  it('HUD の状態: 外で速ければ 6 秒以内に入るときだけ警告、中は INSIDE、座礁は GROUNDED、遅ければ警告なし', () => {
    const out: ShallowStatus = { state: 0, aheadM: 0 };
    const full = ktToMps(39); // 画面上 100 m/s → 6 秒で 600 m
    updateShallowStatus(out, R, 4000, 1300, 90, full, G, TS, false);
    expect(out.state).toBe(SHALLOW_APPROACHING);
    expect(out.aheadM).toBeCloseTo(300, 6);
    updateShallowStatus(out, R, 3500, 1300, 90, full, G, TS, false); // 800 m 先 > 602 m
    expect(out.state).toBe(SHALLOW_NONE);
    expect(out.aheadM).toBe(0);
    updateShallowStatus(out, R, 4000, 1300, 90, ktToMps(10), G, TS, false); // 安全速力ちょうどは警告なし
    expect(out.state).toBe(SHALLOW_NONE);
    updateShallowStatus(out, R, 4500, 1300, 90, ktToMps(8), G, TS, false);
    expect(out.state).toBe(SHALLOW_INSIDE);
    updateShallowStatus(out, R, 4500, 1300, 90, 0, G, TS, true);
    expect(out.state).toBe(SHALLOW_GROUNDED);
  });
  it('data の読み出し: 幅・高さは正、海域の中', () => {
    const b = { width: 6000, height: 4000 };
    const rec = { x_m: 4300, y_m: 900, width_m: 700, height_m: 800, label_ja: '浅瀬' };
    expect(isShallowRectDataRecord(rec)).toBe(true);
    expect(isShallowRectDataRecord({ ...rec, width_m: 'x' })).toBe(false);
    expect(shallowsFromData([rec], b)).toEqual(R);
    expect(shallowsFromData([{ x_m: 0, y_m: 0, width_m: 10, height_m: 10 }], b)[0]!.label).toBe('浅瀬');
    expect(() => shallowsFromData([{ ...rec, width_m: 0 }], b)).toThrow();
    expect(() => shallowsFromData([{ ...rec, x_m: 5500 }], b)).toThrow();
  });
});
