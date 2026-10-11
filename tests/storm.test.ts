import { describe, expect, it } from 'vitest';
import { gameData, getBoatRecord, getPrototypeMission, getStormParams } from '../src/config/game-data';
import { stepBoat, type BoatState } from '../src/core/boat-motion';
import { boatParamsFromData } from '../src/core/boat-motion';
import {
  STORM_AHEAD,
  STORM_INSIDE,
  STORM_NEAR,
  STORM_NONE,
  bandContainsY,
  createStormState,
  isStormDataRecord,
  isStormMissionBlock,
  losCrossesBand,
  meanInsideKt,
  overSafeSpeed,
  slamRateHz,
  stepStorm,
  stormParamsFromData,
  stormTurnRate,
  updateStormStatus,
  type StormDataRecord,
  type StormMissionBlock,
  type StormParams,
  type StormState,
  type StormStatus,
} from '../src/core/storm';
import { ktToMps } from '../src/core/units';

const TS = gameData.hitRateModel.world.time_scale;
const MISSION = getPrototypeMission(gameData, 'us_02');
const BOAT = getBoatRecord(gameData, MISSION.playerBoatId);
const HULL_HP = (gameData.boats.boats.find((b) => b.id === MISSION.playerBoatId) as { hull_hp: number }).hull_hp;
const P: StormParams = getStormParams(gameData, MISSION, TS)!;
const rawRec: unknown = gameData.riskEvents.events.find((e) => e.id === 'storm');
if (!isStormDataRecord(rawRec)) throw new Error('storm params');
const REC: StormDataRecord = rawRec;
const BLOCK: StormMissionBlock = MISSION.storm!;
const BOAT_LIM = { speedMaxKt: BOAT.speed_max_kt, seaStateLimit: 5 };
const DT = 1 / 60;
const SHIP_Y = 300;
const build = (rec: Partial<StormDataRecord['params']> = {}, blk: Partial<StormMissionBlock> = {}, boat = BOAT_LIM, startY = MISSION.playerStart.y): StormParams =>
  stormParamsFromData({ params: { ...REC.params, ...rec } }, { ...BLOCK, ...blk }, boat, TS, MISSION.bounds, startY);
const status = (): StormStatus => ({ state: STORM_NONE, gapM: 0, north: true, fast: false });

describe('暴風（docs/02 §6.8、v0.3.4）', () => {
  it('data: us_02 の params（安全 18 kt・旋回 0.5・視程 0.5・発見 0.5・全速 1.5 回/秒・3 HP・6 秒・帯 800 m・38.58 m/秒・始まり 1200〜2200・海況 6 > 5 で叩きつけ有効）', () => {
    expect(P.safeSpeedKt).toBe(18);
    expect(P.safeSpeedMps).toBeCloseTo(ktToMps(18), 9);
    expect(P.turnRateFactor).toBe(0.5);
    expect(P.visFactor).toBe(0.5);
    expect(P.detectFactor).toBe(0.5);
    expect(P.slamRateFullHz).toBe(1.5);
    expect(P.slamDamage).toBe(3);
    expect(P.warnLookaheadS).toBe(6);
    expect(P.depthM).toBe(800);
    expect(P.driftMps).toBeCloseTo(ktToMps(15) * 5, 6);
    expect(P.startSouthMinY).toBe(1200);
    expect(P.startSouthMaxY).toBe(2200);
    expect(P.seaState).toBe(6);
    expect(P.seaStateLimit).toBe(5);
    expect(P.slamEnabled).toBe(true);
    expect(P.speedFullMps).toBeCloseTo(ktToMps(39), 9);
    expect(P.boundsHeight).toBe(4000);
  });
  it('data の検査: 範囲外の値は例外', () => {
    expect(() => build({ safe_speed_kt: 0 })).toThrow();
    expect(() => build({ safe_speed_kt: 39 })).toThrow();
    expect(() => build({ turn_rate_factor: 0 })).toThrow();
    expect(() => build({ turn_rate_factor: 1.2 })).toThrow();
    expect(() => build({ vis_factor: 0 })).toThrow();
    expect(() => build({ vis_factor: 1.5 })).toThrow();
    expect(() => build({ detect_factor: 0 })).toThrow();
    expect(() => build({ slam_rate_full_hz: -1 })).toThrow();
    expect(() => build({ slam_damage: -1 })).toThrow();
    expect(() => build({ warn_lookahead_s: -1 })).toThrow();
    expect(() => build({}, { depth_m: 0 })).toThrow();
    expect(() => build({}, { drift_kt: 0 })).toThrow();
    expect(() => build({}, { start_south_y_min_m: 2300 })).toThrow();
    expect(() => build({}, { start_south_y_max_m: 2500 })).toThrow(); // 出発点 3200 − 2500 < 800
    expect(() => build({}, { sea_state: 6.5 })).toThrow();
    expect(() => build({}, {}, { speedMaxKt: 39, seaStateLimit: 10 })).toThrow();
    expect(isStormDataRecord({ params: { ...REC.params, safe_speed_kt: 'x' } })).toBe(false);
    expect(isStormMissionBlock({ ...BLOCK, depth_m: undefined })).toBe(false);
  });
  it('海況が限界以下なら叩きつけは無い（全速でも 0）', () => {
    const calm = build({}, { sea_state: 5 });
    expect(calm.slamEnabled).toBe(false);
    expect(slamRateHz(calm, ktToMps(39))).toBe(0);
  });
  it('始まりの位置: u=0 で 1200、u=0.5 で 1700。KPI は 0', () => {
    expect(createStormState(P, 0).southY).toBe(1200);
    const s = createStormState(P, 0.5);
    expect(s.southY).toBe(1700);
    expect(s.slams + s.slamDamage + s.insideS + s.overS + s.insideSpeedSum).toBe(0);
  });
  it('帯は active=false でも進む（10 秒で 385.8 m）', () => {
    const s = createStormState(P, 0.5);
    for (let i = 0; i < 600; i++) stepStorm(s, P, 3200, 0, SHIP_Y, true, DT, false);
    expect(s.southY).toBeCloseTo(1700 + P.driftMps * 10, 3);
  });
  it('中の判定は両端を含む: S と S−800 は中、±0.01 外は外', () => {
    const s = createStormState(P, 0.5);
    expect(bandContainsY(s, P, 1700)).toBe(true);
    expect(bandContainsY(s, P, 900)).toBe(true);
    expect(bandContainsY(s, P, 1700.01)).toBe(false);
    expect(bandContainsY(s, P, 899.99)).toBe(false);
  });
  it('視線: 両方北・両方南は false、帯をはさむ・片方が中なら true、駆逐艦が沈没中は false', () => {
    const s = createStormState(P, 0.5); // 900〜1700
    expect(losCrossesBand(s, P, 300, 800)).toBe(false);
    expect(losCrossesBand(s, P, 1800, 3200)).toBe(false);
    expect(losCrossesBand(s, P, 300, 3200)).toBe(true);
    expect(losCrossesBand(s, P, 1000, 3200)).toBe(true);
    stepStorm(s, P, 3200, 0, 300, false, 0, true);
    expect(s.los).toBe(false);
    stepStorm(s, P, 3200, 0, 300, true, 0, true);
    expect(s.los).toBe(true);
  });
  it('旋回率: 中 12、外 24', () => {
    expect(stormTurnRate(P, 24, true)).toBe(12);
    expect(stormTurnRate(P, 24, false)).toBe(24);
  });
  it('安全速力の判定は表示の kt: 18.4 kt は超えない、18.5 kt は超える', () => {
    expect(overSafeSpeed(P, ktToMps(18.4))).toBe(false);
    expect(overSafeSpeed(P, ktToMps(18.5))).toBe(true);
  });
  it('叩きつけの頻度は速力に比例: 18.4 kt 0、28.5 kt 0.75、39 kt 1.5、45 kt 1.5（頭打ち）', () => {
    expect(slamRateHz(P, ktToMps(18.4))).toBe(0);
    expect(slamRateHz(P, ktToMps(28.5))).toBeCloseTo(0.75, 6);
    expect(slamRateHz(P, ktToMps(39))).toBeCloseTo(1.5, 9);
    expect(slamRateHz(P, ktToMps(45))).toBeCloseTo(1.5, 9);
  });
  it('全速で中 2.1 秒（1/60 刻み）→ 3 回・9 HP・insideS 2.1・overS 2.1・平均 39 kt', () => {
    const s = createStormState(P, 0.5);
    let n = 0;
    for (let i = 0; i < 126; i++) n += stepStorm(s, P, 1300, ktToMps(39), SHIP_Y, true, DT, true);
    expect(n).toBe(3);
    expect(s.slams).toBe(3);
    expect(s.slamDamage).toBe(9);
    expect(s.insideS).toBeCloseTo(2.1, 6);
    expect(s.overS).toBeCloseTo(2.1, 6);
    expect(meanInsideKt(s)).toBeCloseTo(39, 6);
  });
  it('刻み幅に依らない: 1/60 刻み 4.1 秒と 0.25 刻み 4.25 秒でどちらも 6 回', () => {
    const a = createStormState(P, 0.5);
    let na = 0;
    for (let i = 0; i < 246; i++) na += stepStorm(a, P, 1300, ktToMps(39), SHIP_Y, true, DT, true);
    const b = createStormState(P, 0.5);
    let nb = 0;
    for (let i = 0; i < 17; i++) nb += stepStorm(b, P, 1300, ktToMps(39), SHIP_Y, true, 0.25, true);
    expect(na).toBe(6);
    expect(nb).toBe(6);
  });
  it('外に出ると溜めは 0（acc 0.9 で出て再び入っても直後には叩かれない）', () => {
    const s = createStormState(P, 0.5);
    for (let i = 0; i < 36; i++) stepStorm(s, P, 1300, ktToMps(39), SHIP_Y, true, DT, true); // 0.6 秒 → acc 0.9
    expect(s.slamAcc).toBeCloseTo(0.9, 6);
    stepStorm(s, P, 3000, ktToMps(39), SHIP_Y, true, DT, true);
    expect(s.slamAcc).toBe(0);
    expect(stepStorm(s, P, 1300, ktToMps(39), SHIP_Y, true, DT, true)).toBe(0);
  });
  it('沈没中（active=false）は inside=false で 0 回、KPI も増えない', () => {
    const s = createStormState(P, 0.5);
    for (let i = 0; i < 120; i++) expect(stepStorm(s, P, 1300, ktToMps(39), SHIP_Y, true, DT, false)).toBe(0);
    expect(s.inside).toBe(false);
    expect(s.insideS).toBe(0);
  });
  it('横切り（stepBoat と組み合わせ）: 全速 5.75±0.05 秒・8 回・HP −24、18 kt は 9.42±0.05 秒・0 回', () => {
    const bp = boatParamsFromData(BOAT);
    const cross = (speed01: number): { seconds: number; slams: number; damage: number } => {
      const b: BoatState = { x: 3000, y: 3200, headingDeg: 0, speedMps: bp.speedMaxMps * speed01 };
      const s = createStormState(P, 0);
      s.southY = 3190;
      let t = 0;
      let slams = 0;
      let inside = false;
      let entered = false;
      while (t < 60) {
        slams += stepStorm(s, P, b.y, b.speedMps, SHIP_Y, true, DT, true);
        if (s.inside) {
          entered = true;
          inside = true;
        } else if (entered) break;
        stepBoat(b, { headingDeg: 0, speed01 }, bp, DT * TS);
        t += DT;
      }
      expect(inside).toBe(true);
      return { seconds: s.insideS, slams, damage: s.slamDamage };
    };
    const full = cross(1);
    expect(full.seconds).toBeCloseTo(5.75, 1);
    expect(full.slams).toBe(8);
    expect(full.damage).toBe(24);
    const slow = cross(18 / 39);
    expect(slow.seconds).toBeCloseTo(9.42, 1);
    expect(slow.slams).toBe(0);
  });
  it('HUD の状態: 停止で gap 1000 は AHEAD、全速で 1000 は AHEAD・800 は NEAR、中は INSIDE、北にいて北向きは NONE、北にいて南向き全速は north=false、N > 4000 は NONE', () => {
    const s = createStormState(P, 0.5); // 900〜1700
    const o = status();
    updateStormStatus(o, s, P, 2700, 0, 0);
    expect(o.state).toBe(STORM_AHEAD);
    expect(o.gapM).toBe(1000);
    expect(o.north).toBe(true);
    expect(o.fast).toBe(false);
    updateStormStatus(o, s, P, 2700, 0, ktToMps(39));
    expect(o.state).toBe(STORM_AHEAD);
    expect(o.fast).toBe(true);
    updateStormStatus(o, s, P, 2500, 0, ktToMps(39));
    expect(o.state).toBe(STORM_NEAR);
    expect(o.gapM).toBe(800);
    updateStormStatus(o, s, P, 1300, 0, ktToMps(10));
    expect(o.state).toBe(STORM_INSIDE);
    updateStormStatus(o, s, P, 500, 0, ktToMps(39)); // 北にいて北へ逃げる
    expect(o.state).toBe(STORM_NONE);
    updateStormStatus(o, s, P, 500, 180, ktToMps(39)); // 北にいて南へ向かう（gap 400 > 接近 61.7 m/s × 6 秒 = 370 なので AHEAD）
    expect(o.north).toBe(false);
    expect(o.state).toBe(STORM_AHEAD);
    updateStormStatus(o, s, P, 600, 180, ktToMps(39));
    expect(o.state).toBe(STORM_NEAR);
    expect(o.gapM).toBe(300);
    const gone = createStormState(P, 0.5);
    gone.southY = 4000 + 800 + 1;
    updateStormStatus(o, gone, P, 3200, 0, 0);
    expect(o.state).toBe(STORM_NONE);
    // 海域を抜けた帯は、南へ全速で追いかけても出ない（抜けた判定の分岐）
    updateStormStatus(o, gone, P, 3200, 180, ktToMps(39));
    expect(o.state).toBe(STORM_NONE);
  });
  it('NEAR は近づいている限り保つ: 全速で 800 m で NEAR → 18 kt に落として閾値が 509 m に縮んでも NEAR（白の「進め」）。向きを変えて遠ざかれば NONE', () => {
    const s = createStormState(P, 0.5);
    const o = status();
    updateStormStatus(o, s, P, 2500, 0, ktToMps(39));
    expect(o.state).toBe(STORM_NEAR);
    expect(o.fast).toBe(true);
    updateStormStatus(o, s, P, 2400, 0, ktToMps(18));
    expect(o.state).toBe(STORM_NEAR);
    expect(o.fast).toBe(false);
    updateStormStatus(o, s, P, 2400, 180, ktToMps(39));
    expect(o.state).toBe(STORM_NONE);
    updateStormStatus(o, s, P, 2400, 0, ktToMps(18)); // 700 > 509 なので AHEAD から数え直し
    expect(o.state).toBe(STORM_AHEAD);
  });
  it('海況が限界以下の任務では fast が立たない（警告・赤い速力を出さない）', () => {
    const calm = build({}, { sea_state: 5 });
    const s = createStormState(calm, 0.5);
    const o = status();
    updateStormStatus(o, s, calm, 1300, 0, ktToMps(39));
    expect(o.state).toBe(STORM_INSIDE);
    expect(o.fast).toBe(false);
  });
  it('設計値の不変条件（data から）', () => {
    expect(P.safeSpeedKt).toBe(BOAT.speed_bands_kt.silent_max);
    // 全速の横切りの被害 < hull_hp / 2、減速の実秒 < warn_lookahead_s、停止でも接触まで 20 秒以上、帯は夜明け前に抜ける
    const bp = boatParamsFromData(BOAT);
    const crossS = P.depthM / (bp.speedMaxMps * TS + P.driftMps);
    expect(P.slamRateFullHz * crossS * P.slamDamage).toBeLessThan(HULL_HP / 2);
    expect((bp.speedMaxMps - P.safeSpeedMps) / bp.decelMps2 / TS).toBeLessThan(P.warnLookaheadS);
    expect((MISSION.playerStart.y - P.startSouthMaxY) / P.driftMps).toBeGreaterThanOrEqual(20);
    expect((P.boundsHeight + P.depthM - P.startSouthMinY) / P.driftMps).toBeLessThan(MISSION.durationS);
  });
});
