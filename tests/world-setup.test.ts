import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { ktToMps } from '../src/core/units';
import { directSortie } from '../src/core/sortie';
import { briefingNumbers, buildWorldSetup } from '../src/systems/world-setup';

describe('world-setup（data から世界の数値を組み立てる。Phaser 非依存）', () => {
  it('us_02: 夜明け 150 秒・割当 38 gal・魚雷 4 本・駆逐艦 1 本で沈没・半月の視程 1,500 m・停止の発見距離 800 m', () => {
    const s = buildWorldSetup(gameData, 'us_02', NaN, NaN);
    expect(s.mission.id).toBe('us_02');
    expect(s.durationS).toBe(150);
    expect(s.fuelAllotmentGal).toBe(38);
    expect(s.torpedoCapacity).toBe(4);
    expect(s.destroyer!.spec.hitsToSink).toBe(1);
    expect(s.destroyer!.spec.lengthM).toBe(118);
    expect(s.barges).toBeNull();
    expect(s.guns).toBeNull();
    expect(s.mainWeapon).toBe('torpedo');
    expect(s.visRange2).toBe(1500 * 1500);
    expect(s.detectRangeAtStartM).toBe(800);
    expect(s.timeScale).toBe(5);
    expect(s.boatParams.speedMaxMps).toBeCloseTo(ktToMps(39), 9);
    // 表示上の半長（境界の余白）は hit_scale の半長の sprite_scale 倍
    expect(s.boundsMarginM).toBeCloseTo(s.boatHalfLengthM * 2, 9);
    expect(s.launchOffsetM).toBeCloseTo(6.3 / 2, 9);
    expect(s.smokeParams).not.toBeNull();
    expect(s.grounding.safeSpeedMps).toBeCloseTo(ktToMps(15), 9);
    expect(s.destroyer!.passRadius2).toBeCloseTo((118 / 2 + 10.8) ** 2, 6);
    expect(s.friendly).not.toBeNull();
    expect(s.friendly!.windowS).toBe(5);
    expect(s.friendly!.triggerEdgeM).toBe(2600);
  });
  it('暴風と乗員: s.storm は 18 kt・800 m・発見 0.5、s.crew は 14 名。第 5 引数 true（?debug&nostorm）なら storm は null', () => {
    const s = buildWorldSetup(gameData, 'us_02', NaN, NaN);
    expect(s.storm).not.toBeNull();
    expect(s.storm!.safeSpeedKt).toBe(18);
    expect(s.storm!.depthM).toBe(800);
    expect(s.storm!.detectFactor).toBe(0.5);
    expect(s.crew.total).toBe(14);
    expect(s.crewEffects.turnRatePerLoss).toBe(0.04);
    expect(buildWorldSetup(gameData, 'us_02', NaN, NaN, true).storm).toBeNull();
  });
  it('出撃前の空襲（v0.4.0）: us_02 本体は空襲なし（raid null、hit の Sortie でも効果なし）。hazards に足した複製では、第 6 引数なしは燃料 38・効果なし、分散は 34.2、至近弾は HP −20・火災、無傷は効果なし。違う任務の出撃は例外。Briefing の数値', () => {
    const plain = buildWorldSetup(gameData, 'us_02', NaN, NaN, false, directSortie('us_02', 1, 'hit'));
    expect(plain.raid).toBeNull();
    expect(plain.start).toEqual({ fuelFactor: 1, hpLoss: 0, fireAtStart: false });
    expect(plain.fuelStartGal).toBe(38);
    const raidData = JSON.parse(JSON.stringify(gameData)) as typeof gameData;
    const proto = (raidData.missionsSeed.missions.find((x) => x.id === 'us_02') as unknown as { v0_1_prototype: Record<string, unknown> }).v0_1_prototype;
    proto['hazards'] = [...(proto['hazards'] as string[]), 'harbor_fire_explosion'];
    const base = buildWorldSetup(raidData, 'us_02', NaN, NaN);
    expect(base.fuelStartGal).toBe(38);
    expect(base.start).toEqual({ fuelFactor: 1, hpLoss: 0, fireAtStart: false });
    expect(base.raid!.chance).toBe(0.5);
    const dis = buildWorldSetup(raidData, 'us_02', NaN, NaN, false, directSortie('us_02', 1, 'disperse'));
    expect(dis.fuelStartGal).toBeCloseTo(34.2, 9);
    expect(dis.fuelAllotmentGal).toBe(38);
    const hit = buildWorldSetup(raidData, 'us_02', NaN, NaN, false, directSortie('us_02', 1, 'hit'));
    expect(hit.start).toEqual({ fuelFactor: 1, hpLoss: 20, fireAtStart: true });
    expect(hit.fuelStartGal).toBe(38);
    expect(buildWorldSetup(raidData, 'us_02', NaN, NaN, false, directSortie('us_02', 1, 'stay')).start).toEqual({ fuelFactor: 1, hpLoss: 0, fireAtStart: false });
    expect(() => buildWorldSetup(gameData, 'us_02', NaN, NaN, false, directSortie('us_03', 1, 'none'))).toThrow();
    expect(briefingNumbers(base)).toEqual({ visM: 1500, detectCruiseM: 2000, detectSilentM: 1000, durationS: 150, fuelGal: 38, torpedoes: 4, gunsLabel: '', homeX: 5400, homeY: 600, boundsW: 6000, boundsH: 4000 });
  });
  it('敵の水上機（v0.4.1）: us_02 は 308.64 m/s。?debug&noplane（第 7 引数）は null、enemy_aircraft を消した複製は null、enemy_id が無い機体なら例外', () => {
    const base = buildWorldSetup(gameData, 'us_02', NaN, NaN);
    expect(base.seaplane!.flightMps).toBeCloseTo(308.64, 2);
    expect(buildWorldSetup(gameData, 'us_02', NaN, NaN, false, null, true).seaplane).toBeNull();
    const d = JSON.parse(JSON.stringify(gameData)) as typeof gameData;
    const proto = (d.missionsSeed.missions.find((x) => x.id === 'us_02') as unknown as { v0_1_prototype: Record<string, unknown> }).v0_1_prototype;
    delete proto['enemy_aircraft'];
    expect(buildWorldSetup(d, 'us_02', NaN, NaN).seaplane).toBeNull();
    proto['enemy_aircraft'] = { enemy_id: 'nope' };
    expect(() => buildWorldSetup(d, 'us_02', NaN, NaN)).toThrow();
  });
  it('friendly_aircraft が無い任務なら friendly は null', () => {
    const d = JSON.parse(JSON.stringify(gameData)) as typeof gameData;
    const proto = (d.missionsSeed.missions.find((x) => x.id === 'us_02') as unknown as { v0_1_prototype: Record<string, unknown> }).v0_1_prototype;
    delete proto['friendly_aircraft'];
    expect(buildWorldSetup(d, 'us_02', NaN, NaN).friendly).toBeNull();
  });
  it('?debug の上書き: 割当は艇の容量で頭打ち、夜明けはそのまま。無ければ data の値', () => {
    expect(buildWorldSetup(gameData, 'us_02', 20, 60).fuelAllotmentGal).toBe(20);
    expect(buildWorldSetup(gameData, 'us_02', 20, 60).durationS).toBe(60);
    expect(buildWorldSetup(gameData, 'us_02', 5000, NaN).fuelAllotmentGal).toBe(3000);
    expect(buildWorldSetup(gameData, 'us_02', NaN, NaN).durationS).toBe(150);
    expect(() => buildWorldSetup(gameData, 'nope', NaN, NaN)).toThrow();
  });
});
