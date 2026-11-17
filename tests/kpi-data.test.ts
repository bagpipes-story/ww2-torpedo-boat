// v0.8.1 S0（spec-v0810 §3.5 D-K1・D-K2・§4.2・§4.4 V-K1・lead の L12）: 命中率の KPI の発射の時の目標の速さの下限（hit_rate_model.json の kpi_measurement.min_target_speed_kt）。
// 既定は 5 kt・鍵が無ければ 0（今の規則）・壊れていれば V-K1 の文。S0 では鍵と検査だけ: ゲームの誰も config/kpi-data を import せず、ほかに鍵を読むファイルも無い（世界が読むのは S2）。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData, type GameData } from '../src/config/game-data';
import { getKpiMinTargetSpeedKt, getKpiMinTargetSpeedMps } from '../src/config/kpi-data';
import { ktToMps } from '../src/core/units';

type Rec = Record<string, unknown>;
const clone = (): GameData => JSON.parse(JSON.stringify(gameData)) as GameData;
const kpiOf = (d: GameData): Rec => d.hitRateModel.kpi_measurement as unknown as Rec;
const SRC = join(__dirname, '..', 'src');
const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith('.ts') ? [join(dir, f)] : []));

describe('kpi_measurement.min_target_speed_kt（V-K1）', () => {
  it('既定の data は 5 kt（2.572 m/s）。今の値（記録の版・帯・模擬）は 1 つも変えていない', () => {
    expect(getKpiMinTargetSpeedKt(gameData)).toBe(5);
    expect(getKpiMinTargetSpeedMps(gameData)).toBeCloseTo(ktToMps(5), 12);
    expect(getKpiMinTargetSpeedMps(gameData)).toBeCloseTo(2.572, 9);
    const k = kpiOf(gameData);
    expect([k['record_version'], k['aimed_lead_error_deg_max'], k['min_shots_per_band_before_tuning'], k['campaigns']]).toEqual(['v0.5.0', 3, 20, ['us_pt']]);
    expect(String(k['source'])).toContain('design (v0.8.1 S0・spec-v0810 §3.5 D-K1・D-K2。min_target_speed_kt');
  });
  it('鍵が無ければ 0（今の規則＝どの 1 本も外さない）。0 以上の有限の数でなければ例外', () => {
    const d = clone();
    delete kpiOf(d)['min_target_speed_kt'];
    expect([getKpiMinTargetSpeedKt(d), getKpiMinTargetSpeedMps(d)]).toEqual([0, 0]);
    const z = clone();
    kpiOf(z)['min_target_speed_kt'] = 0;
    expect(getKpiMinTargetSpeedKt(z)).toBe(0);
    for (const bad of [-1, '5', null, Infinity, NaN]) {
      const e = clone();
      kpiOf(e)['min_target_speed_kt'] = bad;
      expect(() => getKpiMinTargetSpeedKt(e), String(bad)).toThrow(/hit_rate_model\.json の kpi_measurement\.min_target_speed_kt は 0 以上の有限の数（.*）（V-K1・spec-v0810 §4\.4）/);
    }
  });
  it('S2 から読むのは MissionWorld だけ（data から 1 回。setup には入れない）: config/kpi-data を import するのは systems/mission-world だけ、min_target_speed_kt の字は kpi-data の中だけ', () => {
    const all = files(SRC);
    expect(all.length).toBeGreaterThan(300);
    const importers = all.filter((f) => /from '[./]+(config\/)?kpi-data'/.test(readFileSync(f, 'utf8'))).map((f) => f.slice(SRC.length + 1));
    expect(importers).toEqual(['systems/mission-world.ts']); // v0.8.1 S2（lead の L36）: S0・S1 は誰も import しなかった
    const readers = all.filter((f) => readFileSync(f, 'utf8').includes('min_target_speed_kt')).map((f) => f.slice(SRC.length + 1));
    expect(readers).toEqual(['config/kpi-data.ts']);
  });
});
