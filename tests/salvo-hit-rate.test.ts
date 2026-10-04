import { describe, expect, it } from 'vitest';
import hitRateModel from '../data/hit_rate_model.json';
import { fillSalvoHeadings, spreadAngleForHold, type SpreadConfig } from '../src/core/salvo';
import { bandIndexForRange, countHits, summarizeShots, type ShotRecord } from '../src/core/hit-rate';

const cfg: SpreadConfig = {
  spreadMinDeg: hitRateModel.torpedo_launch.spread_angle_deg_min,
  spreadMaxDeg: hitRateModel.torpedo_launch.spread_angle_deg_max,
  holdSecondsForMax: hitRateModel.torpedo_launch.spread_hold_seconds_for_max,
};

describe('spreadAngleForHold', () => {
  it('0 秒で最小、上限以上で最大、途中は線形', () => {
    expect(spreadAngleForHold(0, cfg)).toBe(cfg.spreadMinDeg);
    expect(spreadAngleForHold(cfg.holdSecondsForMax, cfg)).toBe(cfg.spreadMaxDeg);
    expect(spreadAngleForHold(cfg.holdSecondsForMax * 10, cfg)).toBe(cfg.spreadMaxDeg);
    expect(spreadAngleForHold(cfg.holdSecondsForMax / 2, cfg)).toBeCloseTo((cfg.spreadMinDeg + cfg.spreadMaxDeg) / 2, 9);
  });
});

describe('fillSalvoHeadings', () => {
  it('1 本は基準方位、複数は両端が ±spread/2 で等間隔', () => {
    const out = [0, 0, 0, 0];
    expect(fillSalvoHeadings(100, 1, 12, out)).toBe(1);
    expect(out[0]).toBe(100);
    expect(fillSalvoHeadings(100, 4, 12, out)).toBe(4);
    expect(out).toEqual([94, 98, 102, 106]);
    expect(fillSalvoHeadings(10, 3, 6, out)).toBe(3);
    expect(out.slice(0, 3)).toEqual([7, 10, 13]);
    expect(fillSalvoHeadings(10, 0, 6, out)).toBe(0);
  });
});

describe('hit-rate: 帯の判定と集計', () => {
  const bands = hitRateModel.kpi_by_range;
  it('距離帯の境界は下端含む・上端含まず', () => {
    expect(bandIndexForRange(0, bands)).toBe(0);
    expect(bandIndexForRange(365.9, bands)).toBe(0);
    expect(bandIndexForRange(366, bands)).toBe(1);
    expect(bandIndexForRange(1829, bands)).toBe(4);
    expect(bandIndexForRange(50000, bands)).toBe(4);
    expect(bandIndexForRange(-1, bands)).toBe(-1);
  });
  it('集計: 帯ごとの発射数・命中数・不発数', () => {
    const shots: ShotRecord[] = [
      { rangeM: 300, hit: true, dud: false, erratic: false },
      { rangeM: 350, hit: false, dud: false, erratic: true },
      { rangeM: 800, hit: true, dud: true, erratic: false },
      { rangeM: 2500, hit: false, dud: false, erratic: false },
    ];
    const s = summarizeShots(shots, bands);
    expect(s).toHaveLength(bands.length);
    expect(s[0]).toEqual({ band: bands[0]!.band, shots: 2, hits: 1, duds: 0 });
    expect(s[2]).toEqual({ band: bands[2]!.band, shots: 1, hits: 1, duds: 1 });
    expect(s[4]).toEqual({ band: bands[4]!.band, shots: 1, hits: 0, duds: 0 });
    expect(countHits(shots)).toEqual({ total: 4, hits: 2, duds: 1, misses: 2 });
  });
});
