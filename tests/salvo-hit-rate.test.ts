import { describe, expect, it } from 'vitest';
import hitRateModel from '../data/hit_rate_model.json';
import { fillSalvoHeadings, salvoCountForHold, salvoSpreadDeg, type SpreadConfig } from '../src/core/salvo';
import { bandIndexForRange, countHits, summarizeShots, type ShotRecord } from '../src/core/hit-rate';

const cfg: SpreadConfig = {
  spacingDeg: hitRateModel.torpedo_launch.salvo_spacing_deg,
  countStepS: hitRateModel.torpedo_launch.salvo_count_step_s,
};

describe('salvoCountForHold（v0.4.8。長押しの本数）', () => {
  it('data: 刻み 1.0 秒（実機で 0.5 → 1.0）。長押しに入った時点で 2 本、1.0 秒で 3 本、2.0 秒で 4 本。残弾が上限、残弾 1 なら 1、0 なら 0。刻み 0 以下なら残弾すべて', () => {
    expect(cfg.countStepS).toBe(1.0);
    expect(salvoCountForHold(0, cfg, 4)).toBe(2);
    expect(salvoCountForHold(0.99, cfg, 4)).toBe(2);
    expect(salvoCountForHold(1.0, cfg, 4)).toBe(3);
    expect(salvoCountForHold(2.0, cfg, 4)).toBe(4);
    expect(salvoCountForHold(5, cfg, 4)).toBe(4);
    expect(salvoCountForHold(5, cfg, 3)).toBe(3);
    expect(salvoCountForHold(0, cfg, 1)).toBe(1);
    expect(salvoCountForHold(0, cfg, 0)).toBe(0);
    expect(salvoCountForHold(0, { ...cfg, countStepS: 0 }, 4)).toBe(4);
  });
});

describe('salvoSpreadDeg（v0.4.8。角度は固定の間隔）', () => {
  it('間隔 3°: 1 本 0°、2 本 3°、3 本 6°、4 本 9°', () => {
    expect(cfg.spacingDeg).toBe(3);
    expect([0, 1, 2, 3, 4].map((n) => salvoSpreadDeg(n, cfg))).toEqual([0, 0, 3, 6, 9]);
    const out = [0, 0, 0, 0];
    fillSalvoHeadings(90, 3, salvoSpreadDeg(3, cfg), out);
    expect(out.slice(0, 3)).toEqual([87, 90, 93]);
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
