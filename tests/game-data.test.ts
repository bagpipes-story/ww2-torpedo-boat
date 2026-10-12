import { describe, expect, it } from 'vitest';
import { gameData, getBoatFuelCurve, getBoatRecord, getEnemyRecord, getEvasionMultiplier, getBoatCrewEffects, getBoatCrewParams, getFriendlyParams, getGroundingParams, getPrototypeMission, getScoringParams, getStormParams, getVisibilityParams } from '../src/config/game-data';
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
  it('浅瀬: us_02 に 1 つ（4300,900 700×800）。帰投地点への直線が横切る。grounding.params は 15 kt・6 秒', () => {
    const m = getPrototypeMission(gameData, 'us_02');
    expect(m.shallows).toEqual([{ x: 4300, y: 900, w: 700, h: 800, label: '浅瀬' }]);
    const hdg = (Math.atan2(m.returnPoint.x - 3000, -(m.returnPoint.y - 2100)) * 180) / Math.PI;
    expect(distanceToShallowsM(m.shallows, 3000, 2100, hdg)).toBeLessThan(Infinity);
    const g = getGroundingParams(gameData);
    expect(g.safeSpeedMps).toBeCloseTo(15 * 0.5144, 9);
    expect(g.warnLookaheadS).toBe(6);
  });
  it('味方機: us_02 は輪の縁から 2,600 m 以内で開始。0 以下、出発点が内側（4,000）は例外。block が無い任務は null', () => {
    const m = getPrototypeMission(gameData, 'us_02');
    expect(m.friendlyAircraft).toEqual({ triggerEdgeM: 2600 });
    const p = getFriendlyParams(gameData, m, 5)!;
    expect(p.windowS).toBe(5);
    expect(p.zoneRadius2).toBe((2600 + 250) ** 2);
    type Proto = { v0_1_prototype: Record<string, unknown> };
    const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;
    const protoOf = (d: typeof gameData): Record<string, unknown> => (d.missionsSeed.missions.find((x) => x.id === 'us_02') as unknown as Proto).v0_1_prototype;
    const zero = clone();
    protoOf(zero)['friendly_aircraft'] = { trigger_edge_m: 0 };
    expect(() => getPrototypeMission(zero, 'us_02')).toThrow();
    const inside = clone();
    protoOf(inside)['friendly_aircraft'] = { trigger_edge_m: 4000 };
    expect(() => getPrototypeMission(inside, 'us_02')).toThrow();
    const none = clone();
    delete protoOf(none)['friendly_aircraft'];
    const mNone = getPrototypeMission(none, 'us_02');
    expect(mNone.friendlyAircraft).toBeNull();
    expect(getFriendlyParams(none, mNone, 5)).toBeNull();
    const noParams = clone();
    delete (noParams.riskEvents.events.find((e) => e.id === 'friendly_fire') as Record<string, unknown>)['params'];
    expect(() => getFriendlyParams(noParams, m, 5)).toThrow();
  });
  it('暴風と乗員（v0.3.4）: us_02 の storm（6/800/15/1200/2200）、block の無い複製では getStormParams が null、max 2500 の複製は例外、sea_state_limit 欠けは例外、乗員は 14/0.1', () => {
    const m = getPrototypeMission(gameData, 'us_02');
    expect(m.storm).toMatchObject({ sea_state: 6, depth_m: 800, drift_kt: 15, start_south_y_min_m: 1200, start_south_y_max_m: 2200 });
    const p = getStormParams(gameData, m, 5)!;
    expect(p.safeSpeedKt).toBe(18);
    expect(p.slamEnabled).toBe(true);
    type Proto = { v0_1_prototype: Record<string, unknown> };
    const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;
    const protoOf = (d: typeof gameData): Record<string, unknown> => (d.missionsSeed.missions.find((x) => x.id === 'us_02') as unknown as Proto).v0_1_prototype;
    const none = clone();
    delete protoOf(none)['storm'];
    const mNone = getPrototypeMission(none, 'us_02');
    expect(mNone.storm).toBeNull();
    expect(getStormParams(none, mNone, 5)).toBeNull();
    const near = clone();
    (protoOf(near)['storm'] as Record<string, unknown>)['start_south_y_max_m'] = 2500;
    expect(() => getStormParams(near, getPrototypeMission(near, 'us_02'), 5)).toThrow();
    const broken = clone();
    (protoOf(broken)['storm'] as Record<string, unknown>)['depth_m'] = 'x';
    expect(() => getPrototypeMission(broken, 'us_02')).toThrow();
    const noLimit = clone();
    delete (noLimit.boats.boats.find((b) => b.id === 'us_elco80') as Record<string, unknown>)['sea_state_limit'];
    expect(() => getStormParams(noLimit, m, 5)).toThrow();
    expect(getBoatCrewParams(gameData, 'us_elco80')).toEqual({ total: 14, casualtiesPerHp: 0.1 });
    expect(getBoatCrewEffects(gameData, 'us_elco80').minFactor).toBe(0.5);
  });
  it('hazards（v0.4.0）: us_02 は storm・enemy_ship_gunfire_or_ram・grounding・friendly_fire（港内空襲は実機で外した）。消した複製は []、数値を入れた複製は例外', () => {
    expect(getPrototypeMission(gameData, 'us_02').hazards).toEqual(['storm', 'enemy_ship_gunfire_or_ram', 'grounding', 'friendly_fire']);
    type Proto = { v0_1_prototype: Record<string, unknown> };
    const clone = (): typeof gameData => JSON.parse(JSON.stringify(gameData)) as typeof gameData;
    const protoOf = (d: typeof gameData): Record<string, unknown> => (d.missionsSeed.missions.find((x) => x.id === 'us_02') as unknown as Proto).v0_1_prototype;
    const none = clone();
    delete protoOf(none)['hazards'];
    expect(getPrototypeMission(none, 'us_02').hazards).toEqual([]);
    const bad = clone();
    protoOf(bad)['hazards'] = ['storm', 3];
    expect(() => getPrototypeMission(bad, 'us_02')).toThrow();
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
