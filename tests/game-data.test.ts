import { describe, expect, it } from 'vitest';
import { gameData, getBoatFuelCurve, getBoatRecord, getEnemyRecord, getEvasionMultiplier, getGroundingParams, getPrototypeMission, getScoringParams, getVisibilityParams } from '../src/config/game-data';
import { distanceToShallowsM } from '../src/core/shallows';
import { ktToMps } from '../src/core/units';
import { enemyDetectRangeM, playerVisRangeM } from '../src/core/visibility';

describe('game-data（data/*.json の読み出し）', () => {
  it('us_02 のプロトタイプは半月・夜明けまで 150 秒・駆逐艦 1 隻・燃料の割当 38 gal・北東の帰投地点', () => {
    const m = getPrototypeMission(gameData, 'us_02');
    expect(m.moon).toBe('half');
    expect(m.type).toBe('intercept_destroyer');
    expect(m.durationS).toBe(150);
    expect(m.enemyId).toBe('ijn_destroyer');
    expect(m.enemyHitsToSink).toBe(1);
    expect(m.fuelAllotmentGal).toBe(38);
    expect(m.returnPoint).toEqual({ x: 5400, y: 600, radiusM: 250, callMargin: 1.5, torpedoSettleMaxS: 10 });
    // 輪は海域の中、出発点は輪の外（約 3,538 m）
    const rp = m.returnPoint;
    expect(rp.x + rp.radiusM).toBeLessThanOrEqual(m.bounds.width);
    expect(rp.y - rp.radiusM).toBeGreaterThanOrEqual(0);
    expect(Math.hypot(m.playerStart.x - rp.x, m.playerStart.y - rp.y)).toBeCloseTo(3538, 0);
    const curve = getBoatFuelCurve(gameData, m.playerBoatId);
    expect(m.fuelAllotmentGal).toBeLessThanOrEqual(curve.capacityGal);
    // 呼びかけの余裕の不変条件: 全速/巡航の距離あたり消費比（1.47）と、巡航/静音上限の速力比（1.28）を上回る → 呼ばれた時点で全速でも静音でも帰れる
    const boat = getBoatRecord(gameData, m.playerBoatId);
    expect(rp.callMargin).toBeGreaterThanOrEqual(curve.galPerMFull / curve.galPerMCruise);
    expect(rp.callMargin).toBeGreaterThanOrEqual(ktToMps(boat.speed_cruise_kt) / ktToMps(boat.speed_bands_kt.silent_max));
  });
  it('浅瀬: us_02 に 1 つ（4300,900 700×800）。帰投地点への直線が横切る。grounding.params は 10 kt・6 秒', () => {
    const m = getPrototypeMission(gameData, 'us_02');
    expect(m.shallows).toEqual([{ x: 4300, y: 900, w: 700, h: 800, label: '浅瀬' }]);
    const hdg = (Math.atan2(m.returnPoint.x - 3000, -(m.returnPoint.y - 2100)) * 180) / Math.PI;
    expect(distanceToShallowsM(m.shallows, 3000, 2100, hdg)).toBeLessThan(Infinity);
    const g = getGroundingParams(gameData);
    expect(g.safeSpeedMps).toBeCloseTo(10 * 0.5144, 9);
    expect(g.warnLookaheadS).toBe(6);
  });
  it('scoring.json: 配点が読め、距離帯の名前が kpi_by_range と一致する。us_02 の type に達成点がある', () => {
    const p = getScoringParams(gameData);
    expect(p.returnedPoints).toBe(700);
    expect(p.objectiveByType['intercept_destroyer']).toBe(300);
    expect(p.hitBase).toBe(100);
    for (const b of gameData.hitRateModel.kpi_by_range) expect(p.hitRangeMultiplier[b.band]).toBeGreaterThan(0);
    expect(p.fuelMax).toBe(100);
    const broken = JSON.parse(JSON.stringify(gameData)) as typeof gameData;
    delete (broken.scoring.hit.range_multiplier as Record<string, unknown>)['400-800yd'];
    expect(() => getScoringParams(broken)).toThrow();
  });
  it('壊れた帰投地点・割当は起動時に例外', () => {
    type Proto = { v0_1_prototype: Record<string, unknown> };
    const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;
    const protoOf = (d: typeof gameData): Record<string, unknown> => (d.missionsSeed.missions.find((x) => x.id === 'us_02') as unknown as Proto).v0_1_prototype;
    const rp = protoOf(gameData)['return_point'] as Record<string, number>;
    const withRp = (patch: Record<string, number>): typeof gameData => {
      const d = clone();
      protoOf(d)['return_point'] = { ...rp, ...patch };
      return d;
    };
    expect(() => getPrototypeMission(withRp({ radius_m: 0 }), 'us_02')).toThrow();
    expect(() => getPrototypeMission(withRp({ x_m: 6000 }), 'us_02')).toThrow(); // 輪が海域の外
    expect(() => getPrototypeMission(withRp({ x_m: 3000, y_m: 3200 }), 'us_02')).toThrow(); // 出発点が輪の中
    expect(() => getPrototypeMission(withRp({ call_margin: 0.9 }), 'us_02')).toThrow();
    const noFuel = clone();
    protoOf(noFuel)['fuel_allotment_gal'] = 0;
    expect(() => getPrototypeMission(noFuel, 'us_02')).toThrow();
  });
  it('駆逐艦レコードに船体と AI の両方がある', () => {
    const e = getEnemyRecord(gameData, 'ijn_destroyer');
    expect(e.length_m).toBe(118);
    expect(e.detection.base_detect_m).toBe(2000);
    expect(e.detection.torpedo_wake_detect_m).toBe(700);
    expect(e.evasion.turn_toward_wakes).toBe(true);
    expect(e.ram.trigger_m).toBe(400);
    expect(e.patrol.edge_turn_margin_m).toBe(700);
    expect(() => getEnemyRecord(gameData, 'nope')).toThrow();
  });
  it('視界: 半月なら敵の発見距離は巡航で 2,000 m、自艇の視程は 1,500 m。史実モードは既定で無効なので倍率 1', () => {
    const v = getVisibilityParams(gameData, 'half');
    expect(v.moonFactor).toBe(1);
    expect(v.detectionMultiplier).toBe(1);
    expect(playerVisRangeM(v)).toBe(1500);
    expect(enemyDetectRangeM(2000, 1, v, false)).toBe(2000);
    expect(enemyDetectRangeM(2000, 0.5, v, false)).toBe(1000);
    expect(enemyDetectRangeM(2000, 1, v, true)).toBeCloseTo(600, 9);
    expect(getEvasionMultiplier(gameData)).toBe(1);
    const dark = getVisibilityParams(gameData, 'dark');
    expect(playerVisRangeM(dark)).toBe(900);
  });
});
