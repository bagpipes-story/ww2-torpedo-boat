import { describe, expect, it } from 'vitest';
import hitRateModel from '../data/hit_rate_model.json';
import { fillSalvoHeadings, salvoCountForHold, salvoSpreadDeg, type SpreadConfig } from '../src/core/salvo';
import { bandIndexForRange, countHits, summarizeShots, type ShotRecord } from '../src/core/hit-rate';

const cfg: SpreadConfig = {
  spacingDeg: hitRateModel.torpedo_launch.salvo_spacing_deg,
  holdStartS: hitRateModel.torpedo_launch.salvo_hold_start_s,
  countStepS: hitRateModel.torpedo_launch.salvo_count_step_s,
};

describe('salvoCountForHold（v0.4.8。長押しの本数）', () => {
  it('data（実機 3 回目）: 1.0 秒未満はタップ 1 本、1.0〜2.0 秒で 2 本、2.0〜3.0 秒で 3 本、3.0 秒以上で 4 本。残弾が上限、残弾 1 なら 1、0 なら 0。刻み 0 以下なら長押しは残弾すべて', () => {
    expect([cfg.holdStartS, cfg.countStepS]).toEqual([1.0, 1.0]);
    expect([0, 0.3, 0.999, 1.0, 1.999, 2.0, 2.999, 3.0, 5].map((t) => salvoCountForHold(t, cfg, 4))).toEqual([1, 1, 1, 2, 2, 3, 3, 4, 4]);
    // 実時間の ms から（Phaser の time.now の差 / 1000）
    expect([999, 1000, 1999, 2000, 3000].map((ms) => salvoCountForHold(ms / 1000, cfg, 4))).toEqual([1, 2, 2, 3, 4]);
    expect(salvoCountForHold(5, cfg, 3)).toBe(3);
    expect(salvoCountForHold(5, cfg, 2)).toBe(2);
    expect(salvoCountForHold(5, cfg, 1)).toBe(1);
    expect(salvoCountForHold(0, cfg, 1)).toBe(1);
    expect(salvoCountForHold(5, cfg, 0)).toBe(0);
    expect(salvoCountForHold(Number.NaN, cfg, 4)).toBe(1);
    expect(salvoCountForHold(1.0, { ...cfg, countStepS: 0 }, 4)).toBe(4);
    expect(salvoCountForHold(0.5, { ...cfg, countStepS: 0 }, 4)).toBe(1);
  });
});

describe('salvoSpreadDeg（v0.4.8。角度は固定の間隔）', () => {
  it('間隔 4°（実機 3 回目で 3 → 4）: 1 本 0°、2 本 4°、3 本 8°、4 本 12°', () => {
    expect(cfg.spacingDeg).toBe(4);
    expect([0, 1, 2, 3, 4].map((n) => salvoSpreadDeg(n, cfg))).toEqual([0, 0, 4, 8, 12]);
    const out = [0, 0, 0, 0];
    fillSalvoHeadings(90, 3, salvoSpreadDeg(3, cfg), out);
    expect(out.slice(0, 3)).toEqual([86, 90, 94]);
    fillSalvoHeadings(90, 4, salvoSpreadDeg(4, cfg), out);
    expect(out).toEqual([84, 88, 92, 96]);
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
      { rangeM: 300, hit: true, dud: false, erratic: false, leadErrDeg: 0, kpiTarget: true },
      { rangeM: 350, hit: false, dud: false, erratic: true, leadErrDeg: 0, kpiTarget: true },
      { rangeM: 800, hit: true, dud: true, erratic: false, leadErrDeg: 0, kpiTarget: true },
      { rangeM: 2500, hit: false, dud: false, erratic: false, leadErrDeg: 0, kpiTarget: true },
    ];
    const s = summarizeShots(shots, bands);
    expect(s).toHaveLength(bands.length);
    expect(s[0]).toEqual({ band: bands[0]!.band, shots: 2, hits: 1, duds: 0 });
    expect(s[2]).toEqual({ band: bands[2]!.band, shots: 1, hits: 1, duds: 1 });
    expect(s[4]).toEqual({ band: bands[4]!.band, shots: 1, hits: 0, duds: 0 });
    expect(countHits(shots)).toEqual({ total: 4, hits: 2, duds: 1, misses: 2 });
  });
});
