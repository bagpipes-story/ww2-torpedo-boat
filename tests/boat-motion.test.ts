import { describe, expect, it } from 'vitest';
import boats from '../data/boats.json';
import missions from '../data/missions_seed.json';
import hitRateModel from '../data/hit_rate_model.json';
import {
  boatParamsFromData,
  clampToBounds,
  isBoatDataRecord,
  nearestSpeedStep,
  stepBoat,
  THROTTLE_SILENT,
  throttleToTargetSpeed,
  type BoatInput,
  type BoatParams,
  type BoatState,
} from '../src/core/boat-motion';
import { ktToMps } from '../src/core/units';

const elcoRecord = boats.boats.find((b) => b.id === 'us_elco80');
if (!elcoRecord || !isBoatDataRecord(elcoRecord)) throw new Error('us_elco80 が boats.json に無い');
const P: BoatParams = boatParamsFromData(elcoRecord);

function state(partial: Partial<BoatState> = {}): BoatState {
  return { x: 0, y: 0, headingDeg: 0, speedMps: 0, ...partial };
}
const input = (rudder: number, throttle: number): BoatInput => ({ rudder, throttle });

describe('boatParamsFromData（Elco 80ft）', () => {
  it('kt を m/s に変換し、加速・旋回はそのまま持つ（design 値はレコードと比較、historical 値は固定値）', () => {
    expect(P.speedMaxMps).toBeCloseTo(ktToMps(elcoRecord.speed_max_kt), 9);
    expect(P.speedCruiseMps).toBeCloseTo(ktToMps(23), 9); // historical
    expect(P.speedSilentMps).toBeCloseTo(ktToMps(elcoRecord.speed_silent_kt), 9);
    expect(P.accelMps2).toBe(elcoRecord.accel_mps2);
    expect(P.decelMps2).toBe(elcoRecord.decel_mps2);
    expect(P.turnRateDegS).toBe(elcoRecord.turn_rate_deg_s);
    expect(P.lengthM).toBe(24.4); // historical
    expect(P.turnRateDegS).toBeGreaterThan(0);
    expect(P.accelMps2).toBeGreaterThan(0);
    expect(P.decelMps2).toBeGreaterThan(0);
    expect(P.speedSilentMps).toBeLessThan(P.speedCruiseMps);
    expect(P.speedCruiseMps).toBeLessThan(P.speedMaxMps);
  });

  it('data の全艇が運動に必要なフィールドを持つ', () => {
    for (const b of boats.boats) expect(isBoatDataRecord(b), b.id).toBe(true);
  });
});

describe('throttleToTargetSpeed（docs/02 §5: 上=全速、中立=巡航、下=静音→停止）', () => {
  it('区分点', () => {
    expect(THROTTLE_SILENT).toBeGreaterThan(-1);
    expect(THROTTLE_SILENT).toBeLessThan(0);
    expect(throttleToTargetSpeed(1, P)).toBeCloseTo(P.speedMaxMps, 9);
    expect(throttleToTargetSpeed(0, P)).toBeCloseTo(P.speedCruiseMps, 9);
    expect(throttleToTargetSpeed(THROTTLE_SILENT, P)).toBeCloseTo(P.speedSilentMps, 9);
    expect(throttleToTargetSpeed(-1, P)).toBeCloseTo(0, 9);
  });
  it('区分の間は線形、範囲外はクランプ', () => {
    expect(throttleToTargetSpeed(0.5, P)).toBeCloseTo((P.speedCruiseMps + P.speedMaxMps) / 2, 9);
    expect(throttleToTargetSpeed(THROTTLE_SILENT / 2, P)).toBeCloseTo((P.speedSilentMps + P.speedCruiseMps) / 2, 9);
    expect(throttleToTargetSpeed((THROTTLE_SILENT - 1) / 2, P)).toBeCloseTo(P.speedSilentMps / 2, 9);
    expect(throttleToTargetSpeed(5, P)).toBeCloseTo(P.speedMaxMps, 9);
    expect(throttleToTargetSpeed(-5, P)).toBeCloseTo(0, 9);
  });
  it('単調非減少', () => {
    let prev = -1;
    for (let t = -1; t <= 1.0001; t += 0.05) {
      const v = throttleToTargetSpeed(t, P);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = v;
    }
  });
});

describe('stepBoat', () => {
  it('停止から巡航目標: 加速度で頭打ち、途中も目標を超えない', () => {
    const s = state();
    stepBoat(s, input(0, 0), P, 1);
    expect(s.speedMps).toBeCloseTo(P.accelMps2 * 1, 9);
    for (let i = 0; i < 100; i++) {
      stepBoat(s, input(0, 0), P, 1);
      expect(s.speedMps).toBeLessThanOrEqual(P.speedCruiseMps + 1e-12);
    }
    expect(s.speedMps).toBeCloseTo(P.speedCruiseMps, 9);
  });
  it('全速から停止目標: 減速度で下がり、負にならず 0 で止まる', () => {
    const s = state({ speedMps: P.speedMaxMps });
    stepBoat(s, input(0, -1), P, 1);
    expect(s.speedMps).toBeCloseTo(P.speedMaxMps - P.decelMps2, 9);
    for (let i = 0; i < 100; i++) {
      stepBoat(s, input(0, -1), P, 1);
      expect(s.speedMps).toBeGreaterThanOrEqual(0);
    }
    expect(s.speedMps).toBe(0);
  });
  it('旋回: 舵×旋回率×dt（dt≠1 でも）、方位は [0,360) に収まる', () => {
    const s = state({ headingDeg: 350 });
    stepBoat(s, input(1, -1), P, 0.25);
    expect(s.headingDeg).toBeCloseTo((350 + 0.25 * P.turnRateDegS) % 360, 9);
    const w = state({ headingDeg: 350 });
    stepBoat(w, input(1, -1), P, 1);
    expect(w.headingDeg).toBeCloseTo((350 + P.turnRateDegS) % 360, 9);
    const l = state({ headingDeg: 10 });
    stepBoat(l, input(-0.5, -1), P, 0.5);
    expect(l.headingDeg).toBeCloseTo((360 + 10 - 0.5 * 0.5 * P.turnRateDegS) % 360, 9);
  });
  it('方位 0 は北（画面上 = -y）、90 は東（+x）。変位 = 更新後の速度 × dt', () => {
    const n = state({ speedMps: 10 });
    stepBoat(n, input(0, -1), P, 0.1);
    const v = 10 - P.decelMps2 * 0.1;
    expect(n.x).toBeCloseTo(0, 9);
    expect(n.y).toBeCloseTo(-v * 0.1, 9);
    const e = state({ headingDeg: 90, speedMps: 10 });
    stepBoat(e, input(0, -1), P, 0.1);
    expect(e.x).toBeCloseTo(v * 0.1, 9);
    expect(e.y).toBeCloseTo(0, 9);
  });
  it('横滑りなし: 変位ベクトルはステップ後の船首方向と平行', () => {
    const s = state({ headingDeg: 37, speedMps: 12 });
    const x0 = s.x;
    const y0 = s.y;
    stepBoat(s, input(0.3, 0), P, 0.05);
    const dx = s.x - x0;
    const dy = s.y - y0;
    const h = (s.headingDeg * Math.PI) / 180;
    // 変位と (sin h, -cos h) の外積が 0
    expect(dx * -Math.cos(h) - dy * Math.sin(h)).toBeCloseTo(0, 9);
  });
  it('dt を半分にして 2 回進めても速度と方位は 1 回と同じ（舵あり、線形区間）', () => {
    const a = state({ headingDeg: 10, speedMps: 5 });
    const b = state({ headingDeg: 10, speedMps: 5 });
    stepBoat(a, input(0.5, 1), P, 0.2);
    stepBoat(b, input(0.5, 1), P, 0.1);
    stepBoat(b, input(0.5, 1), P, 0.1);
    expect(a.speedMps).toBeCloseTo(b.speedMps, 9);
    expect(a.headingDeg).toBeCloseTo(b.headingDeg, 9);
  });
  it('dt=0 は何も変えない', () => {
    const s = state({ x: 5, y: 6, headingDeg: 77, speedMps: 3 });
    stepBoat(s, input(1, 1), P, 0);
    expect(s).toEqual({ x: 5, y: 6, headingDeg: 77, speedMps: 3 });
  });
});

describe('nearestSpeedStep', () => {
  it('最も近い速力段を返す', () => {
    expect(nearestSpeedStep(0, P)).toBe('stop');
    expect(nearestSpeedStep(P.speedSilentMps + 0.1, P)).toBe('silent');
    expect(nearestSpeedStep(P.speedCruiseMps - 0.5, P)).toBe('cruise');
    expect(nearestSpeedStep(P.speedMaxMps, P)).toBe('full');
  });
});

describe('clampToBounds と data の海域', () => {
  const proto = missions.missions.find((m) => m.id === 'us_02');
  const prototype = proto && 'v0_1_prototype' in proto ? proto.v0_1_prototype : undefined;
  const bounds = prototype?.bounds_m;
  const start = prototype?.player_start;

  it('us_02.v0_1_prototype に bounds_m と player_start がある（design 値）', () => {
    expect(bounds?.width).toBeGreaterThan(0);
    expect(bounds?.height).toBeGreaterThan(0);
    expect(start?.x_m).toBeGreaterThan(0);
    expect(start?.heading_deg).toBe(0);
  });
  it('海域は 60 秒の全速航走（time_scale 込み）で端に届く広さ', () => {
    const run = P.speedMaxMps * hitRateModel.world.time_scale * 60;
    expect(run).toBeGreaterThan((bounds?.height ?? 0) / 2);
    expect(run).toBeLessThan((bounds?.width ?? 0) * 2);
  });
  it('境界の外に出た位置は余白まで押し戻される', () => {
    const b = { width: 6000, height: 4000 };
    const s = state({ x: -50, y: 4500 });
    clampToBounds(s, b, 20);
    expect(s.x).toBe(20);
    expect(s.y).toBe(4000 - 20);
    const inside = state({ x: 100, y: 100 });
    clampToBounds(inside, b, 20);
    expect(inside.x).toBe(100);
    expect(inside.y).toBe(100);
  });
});
