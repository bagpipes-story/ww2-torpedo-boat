import { describe, expect, it } from 'vitest';
import boats from '../data/boats.json';
import hitRateModel from '../data/hit_rate_model.json';
import { boatParamsFromData, isBoatDataRecord } from '../src/core/boat-motion';
import { enemyDetectRangeM, isMoonPhase, playerVisRangeM, speedFactorFor, type VisibilityParams } from '../src/core/visibility';
import { ktToMps } from '../src/core/units';

const elco = boats.boats.find((b) => b.id === 'us_elco80');
if (!elco || !isBoatDataRecord(elco)) throw new Error('us_elco80');
const P = boatParamsFromData(elco);
const V = hitRateModel.visibility;
const vis: VisibilityParams = {
  visPlayerBaseM: V.vis_player_base_m,
  moonFactor: V.moon_factor.half,
  speedFactor: V.speed_factor,
  smokeFactor: V.smoke_factor,
  detectHoldS: V.detect_hold_s,
  detectionMultiplier: 1,
};

describe('visibility data', () => {
  it('data の visibility ブロックがそろっている', () => {
    expect(V.vis_player_base_m).toBeGreaterThan(0);
    for (const k of ['dark', 'half', 'full'] as const) expect(V.moon_factor[k]).toBeGreaterThan(0);
    expect(V.speed_factor.stop).toBeLessThan(V.speed_factor.silent);
    expect(V.speed_factor.silent).toBeLessThan(V.speed_factor.cruise);
    expect(V.speed_factor.cruise).toBeLessThan(V.speed_factor.full);
    expect(V.smoke_factor).toBeGreaterThan(0);
    expect(V.smoke_factor).toBeLessThan(1);
    expect(isMoonPhase('half')).toBe(true);
    expect(isMoonPhase('new')).toBe(false);
  });
});

describe('speedFactorFor', () => {
  it('速力帯の値。18 kt までは静音、30 kt までは巡航、それ以上は全速（境界は data の speed_bands_kt）', () => {
    expect(speedFactorFor(0, P, V.speed_factor)).toBeCloseTo(V.speed_factor.stop, 9);
    expect(speedFactorFor(P.speedSilentMps, P, V.speed_factor)).toBeCloseTo(V.speed_factor.silent, 9);
    expect(speedFactorFor(ktToMps(18), P, V.speed_factor)).toBeCloseTo(V.speed_factor.silent, 9);
    expect(speedFactorFor(ktToMps(18.6), P, V.speed_factor)).toBeCloseTo(V.speed_factor.cruise, 9); // 表示 19 kt
    expect(speedFactorFor(P.speedCruiseMps, P, V.speed_factor)).toBeCloseTo(V.speed_factor.cruise, 9);
    expect(speedFactorFor(ktToMps(30), P, V.speed_factor)).toBeCloseTo(V.speed_factor.cruise, 9);
    expect(speedFactorFor(ktToMps(31), P, V.speed_factor)).toBeCloseTo(V.speed_factor.full, 9);
    expect(speedFactorFor(P.speedMaxMps, P, V.speed_factor)).toBeCloseTo(V.speed_factor.full, 9);
    expect(speedFactorFor(P.speedMaxMps * 2, P, V.speed_factor)).toBeCloseTo(V.speed_factor.full, 9);
  });
  it('単調非減少', () => {
    let prev = -1;
    for (let v = 0; v <= P.speedMaxMps; v += 0.25) {
      const f = speedFactorFor(v, P, V.speed_factor);
      expect(f).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = f;
    }
  });
});

describe('発見距離と視程', () => {
  it('静音 8kt なら巡航の半分、全速なら 1.6 倍（半月、煙幕なし）。基準 2,000 m で 1,000 / 2,000 / 3,200', () => {
    const base = 2000;
    const silent = enemyDetectRangeM(base, speedFactorFor(ktToMps(8), P, V.speed_factor), vis, false);
    const cruise = enemyDetectRangeM(base, speedFactorFor(ktToMps(23), P, V.speed_factor), vis, false);
    const full = enemyDetectRangeM(base, speedFactorFor(ktToMps(39), P, V.speed_factor), vis, false);
    expect(cruise).toBeCloseTo(2000, 6);
    expect(silent).toBeCloseTo(1000, 6);
    expect(full).toBeCloseTo(3200, 6);
  });
  it('煙幕と史実モード倍率が掛かる', () => {
    const f = speedFactorFor(P.speedCruiseMps, P, V.speed_factor);
    expect(enemyDetectRangeM(2500, f, vis, true)).toBeCloseTo(2500 * V.smoke_factor, 6);
    expect(enemyDetectRangeM(2500, f, { ...vis, detectionMultiplier: 1.3 }, false)).toBeCloseTo(3250, 6);
  });
  it('視程は基準 × 月明', () => {
    expect(playerVisRangeM(vis)).toBeCloseTo(1500, 6);
    expect(playerVisRangeM({ ...vis, moonFactor: V.moon_factor.dark })).toBeCloseTo(900, 6);
  });
});
