import { describe, expect, it } from 'vitest';
import boats from '../data/boats.json';
import missions from '../data/missions_seed.json';
import hitRateModel from '../data/hit_rate_model.json';
import {
  boatParamsFromData,
  clampToBounds,
  isBoatDataRecord,
  speedBandFor,
  stepBoat,
  turnCommand,
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
/** 入力: 目標方位（NaN=保つ）と目標速度（全速比） */
const input = (headingDeg: number, speed01: number): BoatInput => ({ headingDeg, speed01 });
const HOLD = NaN;

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

describe('speedBandFor（速力帯。境界は data の speed_bands_kt）', () => {
  it('停止 ≤0.5kt、静音 ≤18kt、巡航 ≤30kt、それ以上は全速（us_elco80）', () => {
    expect(speedBandFor(0, P)).toBe('stop');
    expect(speedBandFor(ktToMps(0.5), P)).toBe('stop');
    expect(speedBandFor(ktToMps(0.6), P)).toBe('silent');
    expect(speedBandFor(ktToMps(8), P)).toBe('silent');
    expect(speedBandFor(ktToMps(18), P)).toBe('silent');
    expect(speedBandFor(ktToMps(18.1), P)).toBe('cruise');
    expect(speedBandFor(ktToMps(23), P)).toBe('cruise');
    expect(speedBandFor(ktToMps(30), P)).toBe('cruise');
    expect(speedBandFor(ktToMps(30.1), P)).toBe('full');
    expect(speedBandFor(P.speedMaxMps, P)).toBe('full');
  });
  it('帯の境界は単調（stop < silent < cruise < max）', () => {
    expect(P.stopMaxMps).toBeLessThan(P.silentMaxMps);
    expect(P.silentMaxMps).toBeLessThan(P.cruiseMaxMps);
    expect(P.cruiseMaxMps).toBeLessThan(P.speedMaxMps);
  });
});

describe('turnCommand（舵バー表示用）', () => {
  it('目標が無ければ 0。残り角を fullDeg で正規化し ±1 に収める。右回りが正', () => {
    const s = state({ headingDeg: 0 });
    expect(turnCommand(input(HOLD, 0), s, 45)).toBe(0);
    expect(turnCommand(input(22.5, 1), s, 45)).toBeCloseTo(0.5, 9);
    expect(turnCommand(input(315, 1), s, 45)).toBeCloseTo(-1, 9);
    expect(turnCommand(input(180, 1), s, 45)).toBe(1);
  });
});

describe('stepBoat', () => {
  it('停止から半分倒す: 目標 = 0.5 × 全速 に加速度で頭打ち、途中も目標を超えない', () => {
    const s = state();
    stepBoat(s, input(0, 0.5), P, 1);
    expect(s.speedMps).toBeCloseTo(P.accelMps2 * 1, 9);
    for (let i = 0; i < 100; i++) {
      stepBoat(s, input(0, 0.5), P, 1);
      expect(s.speedMps).toBeLessThanOrEqual(P.speedMaxMps * 0.5 + 1e-12);
    }
    expect(s.speedMps).toBeCloseTo(P.speedMaxMps * 0.5, 9);
    // いっぱいに倒せば全速、中立（0）なら停止へ
    const f = state();
    for (let i = 0; i < 200; i++) stepBoat(f, input(0, 1), P, 1);
    expect(f.speedMps).toBeCloseTo(P.speedMaxMps, 9);
  });
  it('全速から中立: 減速度で下がり、負にならず 0 で止まる。針路は保つ', () => {
    const s = state({ headingDeg: 123, speedMps: P.speedMaxMps });
    stepBoat(s, input(HOLD, 0), P, 1);
    expect(s.speedMps).toBeCloseTo(P.speedMaxMps - P.decelMps2, 9);
    for (let i = 0; i < 100; i++) {
      stepBoat(s, input(HOLD, 0), P, 1);
      expect(s.speedMps).toBeGreaterThanOrEqual(0);
    }
    expect(s.speedMps).toBe(0);
    expect(s.headingDeg).toBe(123);
  });
  it('旋回: 目標方位へ旋回率×dt を上限に最短側で回り、方位は [0,360) に収まる。達したら止まる', () => {
    const s = state({ headingDeg: 350 });
    stepBoat(s, input(90, 0), P, 0.25); // 右回り（+100° が最短）
    expect(s.headingDeg).toBeCloseTo((350 + 0.25 * P.turnRateDegS) % 360, 9);
    const w = state({ headingDeg: 350 });
    stepBoat(w, input(90, 0), P, 1);
    expect(w.headingDeg).toBeCloseTo((350 + P.turnRateDegS) % 360, 9);
    const l = state({ headingDeg: 10 });
    stepBoat(l, input(300, 0), P, 0.5); // 左回り（-70° が最短）
    expect(l.headingDeg).toBeCloseTo((360 + 10 - 0.5 * P.turnRateDegS) % 360, 9);
    const near = state({ headingDeg: 10 });
    stepBoat(near, input(13, 0), P, 1); // 残り 3° < 旋回率 → ぴったり止まる
    expect(near.headingDeg).toBeCloseTo(13, 9);
    const held = state({ headingDeg: 77 });
    stepBoat(held, input(HOLD, 0.5), P, 1);
    expect(held.headingDeg).toBe(77);
  });
  it('方位 0 は北（画面上 = -y）、90 は東（+x）。変位 = 更新後の速度 × dt', () => {
    const n = state({ speedMps: 10 });
    stepBoat(n, input(HOLD, 0), P, 0.1);
    const v = 10 - P.decelMps2 * 0.1;
    expect(n.x).toBeCloseTo(0, 9);
    expect(n.y).toBeCloseTo(-v * 0.1, 9);
    const e = state({ headingDeg: 90, speedMps: 10 });
    stepBoat(e, input(HOLD, 0), P, 0.1);
    expect(e.x).toBeCloseTo(v * 0.1, 9);
    expect(e.y).toBeCloseTo(0, 9);
  });
  it('横滑りなし: 変位ベクトルはステップ後の船首方向と平行', () => {
    const s = state({ headingDeg: 37, speedMps: 12 });
    const x0 = s.x;
    const y0 = s.y;
    stepBoat(s, input(60, 0.3), P, 0.05);
    const dx = s.x - x0;
    const dy = s.y - y0;
    const h = (s.headingDeg * Math.PI) / 180;
    // 変位と (sin h, -cos h) の外積が 0
    expect(dx * -Math.cos(h) - dy * Math.sin(h)).toBeCloseTo(0, 9);
  });
  it('dt を半分にして 2 回進めても速度と方位は 1 回と同じ（旋回中、線形区間）', () => {
    const a = state({ headingDeg: 10, speedMps: 5 });
    const b = state({ headingDeg: 10, speedMps: 5 });
    stepBoat(a, input(120, 1), P, 0.2);
    stepBoat(b, input(120, 1), P, 0.1);
    stepBoat(b, input(120, 1), P, 0.1);
    expect(a.speedMps).toBeCloseTo(b.speedMps, 9);
    expect(a.headingDeg).toBeCloseTo(b.headingDeg, 9);
  });
  it('dt=0 は何も変えない', () => {
    const s = state({ x: 5, y: 6, headingDeg: 77, speedMps: 3 });
    stepBoat(s, input(200, 1), P, 0);
    expect(s).toEqual({ x: 5, y: 6, headingDeg: 77, speedMps: 3 });
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
