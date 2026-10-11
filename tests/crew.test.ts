import { describe, expect, it } from 'vitest';
import { gameData, getBoatCrewEffects, getBoatCrewParams } from '../src/config/game-data';
import { crewAccelFactor, crewAlive, crewEffectsFromData, crewExtinguishFactor, crewLost, crewParamsFromData, crewTurnFactor, isBoatCrewDataRecord } from '../src/core/crew';

const C = getBoatCrewParams(gameData, 'us_elco80');
const E = getBoatCrewEffects(gameData, 'us_elco80');

describe('乗員（docs/02 §6.6、v0.3.4）', () => {
  it('data: us_elco80 は 14 名・0.1/HP、hull_hp × 率 ≤ 定員', () => {
    expect(C).toEqual({ total: 14, casualtiesPerHp: 0.1 });
    expect(100 * C.casualtiesPerHp).toBeLessThanOrEqual(C.total);
  });
  it('HP から生存: 100→14、90→13、80→12、70→11、60→10、0.01→5、0→4', () => {
    for (const [hp, alive] of [
      [100, 14],
      [90, 13],
      [80, 12],
      [70, 11],
      [60, 10],
      [0.01, 5],
      [0, 4],
    ] as const) {
      expect(crewAlive(C, 100, hp)).toBe(alive);
      expect(crewLost(C, 100, hp)).toBe(14 - alive);
    }
    expect(crewAlive(C, 100, 120)).toBe(14);
  });
  it('率 0 なら常に全員', () => {
    expect(crewAlive({ total: 14, casualtiesPerHp: 0 }, 100, 0)).toBe(14);
  });
  it('検査: 定員 0・1.5、率 −0.1、率 0.2（20 > 14）は例外', () => {
    const fx = { extinguish_exponent: 1, turn_rate_per_loss: 0.04, accel_per_loss: 0.04, min_factor: 0.5 };
    const base = { crew: 14, hull_hp: 100, damage: { casualties_per_hp: 0.1, crew_effects: fx } };
    expect(isBoatCrewDataRecord(base)).toBe(true);
    expect(isBoatCrewDataRecord({ crew: 14, hull_hp: 100, damage: {} })).toBe(false);
    expect(isBoatCrewDataRecord({ crew: 14, hull_hp: 100, damage: { casualties_per_hp: 0.1 } })).toBe(false);
    expect(() => crewParamsFromData({ ...base, crew: 0 })).toThrow();
    expect(() => crewParamsFromData({ ...base, crew: 1.5 })).toThrow();
    expect(() => crewParamsFromData({ ...base, damage: { casualties_per_hp: -0.1, crew_effects: fx } })).toThrow();
    expect(() => crewParamsFromData({ ...base, damage: { casualties_per_hp: 0.2, crew_effects: fx } })).toThrow();
    // 境界（100 × 0.14 = 14.000000000000002）は許す
    expect(crewParamsFromData({ ...base, damage: { casualties_per_hp: 0.14, crew_effects: fx } }).casualtiesPerHp).toBe(0.14);
    expect(() => crewEffectsFromData({ ...base, damage: { casualties_per_hp: 0.1, crew_effects: { ...fx, min_factor: 0 } } })).toThrow();
    expect(() => crewEffectsFromData({ ...base, damage: { casualties_per_hp: 0.1, crew_effects: { ...fx, turn_rate_per_loss: -1 } } })).toThrow();
  });
  it('v0.3.5 乗員の減りが効く: 旋回・加速は 1 名 −4%（下限 0.5）、消火は 定員/生存 倍（11/14 で 1.27、7/14 で 2.0、4/14 で 3.5）', () => {
    expect(E).toEqual({ extinguishExponent: 1, turnRatePerLoss: 0.04, accelPerLoss: 0.04, minFactor: 0.5 });
    expect(crewTurnFactor(E, 0)).toBe(1);
    expect(crewTurnFactor(E, 3)).toBeCloseTo(0.88, 9);
    expect(crewAccelFactor(E, 7)).toBeCloseTo(0.72, 9);
    expect(crewTurnFactor(E, 20)).toBe(0.5);
    expect(crewExtinguishFactor(E, 14, 14)).toBe(1);
    expect(crewExtinguishFactor(E, 11, 14)).toBeCloseTo(14 / 11, 9);
    expect(crewExtinguishFactor(E, 7, 14)).toBeCloseTo(2, 9);
    expect(crewExtinguishFactor(E, 4, 14)).toBeCloseTo(3.5, 9);
    expect(crewExtinguishFactor(E, 0, 14)).toBe(14);
    expect(crewExtinguishFactor(E, 5, 0)).toBe(1);
  });
});
