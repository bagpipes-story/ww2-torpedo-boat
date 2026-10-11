import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { ktToMps } from '../src/core/units';
import { buildWorldSetup } from '../src/systems/world-setup';

describe('world-setup（data から世界の数値を組み立てる。Phaser 非依存）', () => {
  it('us_02: 夜明け 150 秒・割当 38 gal・魚雷 4 本・駆逐艦 1 本で沈没・半月の視程 1,500 m・停止の発見距離 800 m', () => {
    const s = buildWorldSetup(gameData, 'us_02', NaN, NaN);
    expect(s.mission.id).toBe('us_02');
    expect(s.durationS).toBe(150);
    expect(s.fuelAllotmentGal).toBe(38);
    expect(s.torpedoCapacity).toBe(4);
    expect(s.destroyerSpec.hitsToSink).toBe(1);
    expect(s.destroyerSpec.lengthM).toBe(118);
    expect(s.visRange2).toBe(1500 * 1500);
    expect(s.detectRangeAtStartM).toBe(800);
    expect(s.timeScale).toBe(5);
    expect(s.boatParams.speedMaxMps).toBeCloseTo(ktToMps(39), 9);
    // 表示上の半長（境界の余白）は hit_scale の半長の sprite_scale 倍
    expect(s.boundsMarginM).toBeCloseTo(s.boatHalfLengthM * 2, 9);
    expect(s.launchOffsetM).toBeCloseTo(6.3 / 2, 9);
    expect(s.smokeParams).not.toBeNull();
    expect(s.grounding.safeSpeedMps).toBeCloseTo(ktToMps(15), 9);
    expect(s.passRadius2).toBeCloseTo((118 / 2 + 10.8) ** 2, 6);
  });
  it('?debug の上書き: 割当は艇の容量で頭打ち、夜明けはそのまま。無ければ data の値', () => {
    expect(buildWorldSetup(gameData, 'us_02', 20, 60).fuelAllotmentGal).toBe(20);
    expect(buildWorldSetup(gameData, 'us_02', 20, 60).durationS).toBe(60);
    expect(buildWorldSetup(gameData, 'us_02', 5000, NaN).fuelAllotmentGal).toBe(3000);
    expect(buildWorldSetup(gameData, 'us_02', NaN, NaN).durationS).toBe(150);
    expect(() => buildWorldSetup(gameData, 'nope', NaN, NaN)).toThrow();
  });
});
