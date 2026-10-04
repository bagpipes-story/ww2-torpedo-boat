import { describe, expect, it } from 'vitest';
import { applyDeadZone, createInputState, resetInput } from '../src/core/input-state';
import { wrapDeg360 } from '../src/core/units';

describe('applyDeadZone', () => {
  it('デッドゾーン内は 0、端は ±1、境界で連続', () => {
    expect(applyDeadZone(0.05, 0.12)).toBe(0);
    expect(applyDeadZone(-0.12, 0.12)).toBe(0);
    expect(applyDeadZone(1, 0.12)).toBe(1);
    expect(applyDeadZone(-1, 0.12)).toBe(-1);
    expect(applyDeadZone(0.1201, 0.12)).toBeCloseTo(0, 3);
    expect(applyDeadZone(0.56, 0.12)).toBeCloseTo(0.5, 9);
    expect(applyDeadZone(1.5, 0.12)).toBe(1);
  });
});

describe('InputState', () => {
  it('初期値とリセット', () => {
    const s = createInputState();
    expect(s).toEqual({ rudder: 0, throttle: 0, stickActive: false, fireTap: false, fireSalvoSpreadDeg: NaN });
    s.rudder = 1;
    s.throttle = -1;
    s.stickActive = true;
    s.fireTap = true;
    s.fireSalvoSpreadDeg = 8;
    resetInput(s);
    expect(s).toEqual({ rudder: 0, throttle: 0, stickActive: false, fireTap: false, fireSalvoSpreadDeg: NaN });
  });
});

describe('wrapDeg360', () => {
  it('[0, 360) に収める', () => {
    expect(wrapDeg360(0)).toBe(0);
    expect(wrapDeg360(360)).toBe(0);
    expect(wrapDeg360(-10)).toBe(350);
    expect(wrapDeg360(725)).toBe(5);
    expect(wrapDeg360(359.5)).toBe(359.5);
    expect(wrapDeg360(-1e-15)).toBe(0);
    expect(wrapDeg360(-1e-14)).toBeLessThan(360);
    expect(Object.is(wrapDeg360(-0), 0)).toBe(true);
  });
});
