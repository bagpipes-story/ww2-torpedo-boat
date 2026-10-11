import { describe, expect, it } from 'vitest';
import { gameData, getBoatCrewParams } from '../src/config/game-data';
import { crewAlive, crewLost, crewParamsFromData, isBoatCrewDataRecord } from '../src/core/crew';

const C = getBoatCrewParams(gameData, 'us_elco80');

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
    const base = { crew: 14, hull_hp: 100, damage: { casualties_per_hp: 0.1 } };
    expect(isBoatCrewDataRecord(base)).toBe(true);
    expect(isBoatCrewDataRecord({ crew: 14, hull_hp: 100, damage: {} })).toBe(false);
    expect(() => crewParamsFromData({ ...base, crew: 0 })).toThrow();
    expect(() => crewParamsFromData({ ...base, crew: 1.5 })).toThrow();
    expect(() => crewParamsFromData({ ...base, damage: { casualties_per_hp: -0.1 } })).toThrow();
    expect(() => crewParamsFromData({ ...base, damage: { casualties_per_hp: 0.2 } })).toThrow();
  });
});
