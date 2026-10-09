import { describe, expect, it } from 'vitest';
import { applyDeadZone, createInputState, resetInput, stickToCommand } from '../src/core/input-state';
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

describe('stickToCommand（スティック → 目標方位・速度）', () => {
  const R = 110;
  const DZ = 0.12;
  const out = { speed01: 0, headingDeg: NaN };
  it('触れた点（差 0）は中立: 速度 0、方位 NaN', () => {
    stickToCommand(0, 0, R, DZ, out);
    expect(out.speed01).toBe(0);
    expect(Number.isNaN(out.headingDeg)).toBe(true);
  });
  it('画面上へ倒すと方位 0、右で 90、下で 180、左で 270。倒し量は半径で正規化しデッドゾーンを再スケール', () => {
    stickToCommand(0, -R, R, DZ, out);
    expect(out.headingDeg).toBeCloseTo(0, 9);
    expect(out.speed01).toBe(1);
    stickToCommand(R, 0, R, DZ, out);
    expect(out.headingDeg).toBeCloseTo(90, 9);
    stickToCommand(0, R, R, DZ, out);
    expect(out.headingDeg).toBeCloseTo(180, 9);
    stickToCommand(-R, 0, R, DZ, out);
    expect(out.headingDeg).toBeCloseTo(270, 9);
    stickToCommand(0, -R * 0.56, R, DZ, out);
    expect(out.speed01).toBeCloseTo(0.5, 9);
    stickToCommand(0, -R * 2, R, DZ, out); // 半径を越えても 1
    expect(out.speed01).toBe(1);
  });
  it('デッドゾーン内は中立', () => {
    stickToCommand(5, 5, R, DZ, out);
    expect(out.speed01).toBe(0);
    expect(Number.isNaN(out.headingDeg)).toBe(true);
  });
});

describe('InputState', () => {
  it('初期値とリセット', () => {
    const s = createInputState();
    const initial = { headingDeg: NaN, speed01: 0, stickActive: false, fireTap: false, fireSalvoSpreadDeg: NaN, smokeTap: false, extinguishHeld: false, lookout: false, zoomRequest: NaN };
    expect(s).toEqual(initial);
    s.headingDeg = 90;
    s.speed01 = 1;
    s.stickActive = true;
    s.fireTap = true;
    s.fireSalvoSpreadDeg = 8;
    s.smokeTap = true;
    s.extinguishHeld = true;
    s.lookout = true;
    resetInput(s);
    expect(s).toEqual(initial);
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
