import { describe, expect, it } from 'vitest';
import hitRateModel from '../data/hit_rate_model.json';
import { isAimedShot, type ShotRecord } from '../src/core/hit-rate';
import { addAimedShots, emptyTally, parseTally, serializeTally, tallyEntriesJa } from '../src/core/kpi-record';

const bands = hitRateModel.kpi_by_range;
const MAX = hitRateModel.kpi_measurement.aimed_lead_error_deg_max;
const shot = (rangeM: number, hit: boolean, leadErrDeg: number, o: Partial<ShotRecord> = {}): ShotRecord => ({ rangeM, hit, dud: false, erratic: false, leadErrDeg, kpiTarget: true, ...o });

describe('通算の命中率 KPI（v0.5.0。core/kpi-record）', () => {
  it('正しく狙った 1 本: 駆逐艦を狙い、蛇行せず、見越し角のずれが ±3° 以内（data）。解けなかった（NaN）・輸送船・蛇行は数えない', () => {
    expect(MAX).toBe(3);
    expect(isAimedShot(shot(500, true, 3), MAX)).toBe(true);
    expect(isAimedShot(shot(500, true, -3), MAX)).toBe(true);
    expect(isAimedShot(shot(500, true, 3.01), MAX)).toBe(false);
    expect(isAimedShot(shot(500, true, Number.NaN), MAX)).toBe(false);
    expect(isAimedShot(shot(500, true, 0, { kpiTarget: false }), MAX)).toBe(false);
    expect(isAimedShot(shot(500, true, 0, { erratic: true }), MAX)).toBe(false);
    expect(isAimedShot(shot(500, true, 0, { dud: true }), MAX)).toBe(true); // 不発も幾何の命中として数える（模擬と同じ）
  });
  it('足す: 帯ごとに発射と命中。正しく狙っていない本は数えず、足した本数を返す', () => {
    const t = emptyTally(bands.length);
    const n = addAimedShots(t, [shot(300, true, 0), shot(500, true, 1), shot(600, false, -2), shot(600, true, 6), shot(900, false, 0, { kpiTarget: false }), shot(1500, false, 0.5)], bands, MAX);
    expect(n).toBe(4);
    expect(t.shots).toEqual([1, 2, 0, 1, 0]);
    expect(t.hits).toEqual([1, 1, 0, 0, 0]);
    addAimedShots(t, [shot(500, true, 0)], bands, MAX);
    expect([t.shots[1], t.hits[1]]).toEqual([3, 2]);
  });
  it('保存の形: 書いて読めば同じ。無い・壊れた JSON・帯の並びが違う・命中 > 発射・負・小数は空から', () => {
    const t = emptyTally(bands.length);
    addAimedShots(t, [shot(500, true, 0), shot(500, false, 0), shot(1000, true, 0)], bands, MAX);
    const text = serializeTally(t, bands);
    expect(parseTally(text, bands)).toEqual(t);
    const empty = emptyTally(bands.length);
    expect(parseTally(null, bands)).toEqual(empty);
    expect(parseTally('{', bands)).toEqual(empty);
    expect(parseTally('[]', bands)).toEqual(empty);
    const o = JSON.parse(text) as { bands: string[]; shots: number[]; hits: number[] };
    expect(parseTally(JSON.stringify({ ...o, bands: [...o.bands].reverse() }), bands)).toEqual(empty);
    expect(parseTally(JSON.stringify({ ...o, hits: [9, 0, 0, 0, 0] }), bands)).toEqual(empty);
    expect(parseTally(JSON.stringify({ ...o, shots: [-1, 2, 1, 0, 0] }), bands)).toEqual(empty);
    expect(parseTally(JSON.stringify({ ...o, shots: [0.5, 2, 1, 0, 0] }), bands)).toEqual(empty);
    expect(parseTally(JSON.stringify({ ...o, shots: [0, 2, 1, 0] }), bands)).toEqual(empty);
  });
  it('Result の帯の行に足す通算: 帯ごとに 命中/発射 = %（目標帯）、まだ無い帯は「通算 0 本」', () => {
    const t = emptyTally(bands.length);
    t.shots[1] = 5;
    t.hits[1] = 3;
    t.shots[2] = 20;
    t.hits[2] = 7;
    expect(tallyEntriesJa(t, bands)).toEqual(['通算 0 本', '通算 3/5 = 60%（目標 45〜55%）', '通算 7/20 = 35%（目標 30〜35%）', '通算 0 本', '通算 0 本']);
  });
});
