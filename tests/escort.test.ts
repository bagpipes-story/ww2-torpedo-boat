import { describe, expect, it } from 'vitest';
import { gameData, getEscortParams, getPrototypeMission } from '../src/config/game-data';
import type { BoatState } from '../src/core/boat-motion';
import { createEscort, escortParamsFromData, hitEscort, isEscortMissionBlock, stepEscort, type EscortParams } from '../src/core/escort';
import { ktToMps } from '../src/core/units';

const DT = (1 / 60) * 5;
const BOUNDS = { width: 6000, height: 6000 };
const P: EscortParams = getEscortParams(gameData, getPrototypeMission(gameData, 'us_01'))!;

function player(over: Partial<BoatState> = {}): BoatState {
  return { x: 3000, y: 5500, headingDeg: 0, speedMps: 0, ...over };
}
/** 自艇を一定の針路・速力で進める（運動モデルは使わず直線） */
function advance(b: BoatState, dt: number): void {
  const h = (b.headingDeg * Math.PI) / 180;
  b.x += Math.sin(h) * b.speedMps * dt;
  b.y -= Math.cos(h) * b.speedMps * dt;
}

describe('僚艇（core/escort、v0.4.4）', () => {
  it('us_01 の数値: 定位置は 120 m 後ろ・左舷 50 m、遅れの警告 500 m、同型艇（Elco 77ft）の全速 39 kt・HP 90・半長 11.75 × hit_scale', () => {
    expect([P.stationAsternM, P.stationAbeamM, P.lagWarnM, P.catchUpGainPerS, P.headingDeadbandM, P.litNearLeaderM]).toEqual([120, -50, 500, 0.08, 15, 250]);
    expect(P.speedMaxMps).toBeCloseTo(ktToMps(39), 9);
    expect(P.maxHp).toBe(90);
    expect(P.halfLengthM).toBeCloseTo((23.5 * gameData.hitRateModel.world.hit_scale) / 2, 9);
    expect(P.boundsMarginM).toBeCloseTo((23.5 * gameData.hitRateModel.world.sprite_scale) / 2, 9);
  });
  it('壊れた block は例外（station_astern_m 0、lag_warn_m が定位置より近い、gain 0）。isEscortMissionBlock は boat が無ければ false', () => {
    const block = { boat: 'us_elco77', station_astern_m: 120, station_abeam_m: -50, lag_warn_m: 500, catch_up_gain_per_s: 0.08, heading_deadband_m: 15, lit_near_leader_m: 250 };
    const boat = { speedMaxMps: 20, accelMps2: 1.2, turnRateDegS: 24, lengthM: 23.5, beamM: 6, maxHp: 90 };
    expect(() => escortParamsFromData({ ...block, station_astern_m: 0 }, boat, 1, 1)).toThrow(/station_astern_m/);
    expect(() => escortParamsFromData({ ...block, lag_warn_m: 100 }, boat, 1, 1)).toThrow(/lag_warn_m/);
    expect(() => escortParamsFromData({ ...block, catch_up_gain_per_s: 0 }, boat, 1, 1)).toThrow(/catch_up_gain_per_s/);
    expect(isEscortMissionBlock({ station_astern_m: 120, station_abeam_m: 0, lag_warn_m: 500, catch_up_gain_per_s: 0.1, heading_deadband_m: 10, lit_near_leader_m: 250 })).toBe(false);
    expect(isEscortMissionBlock(block)).toBe(true);
  });
  it('出発時は自艇の 120 m 後ろ・左舷（西）50 m に停止。北向きなので y が +120、x が −50', () => {
    const s = createEscort(P, player());
    expect(s.boat.x).toBeCloseTo(2950, 6);
    expect(s.boat.y).toBeCloseTo(5620, 6);
    expect(s.boat.headingDeg).toBe(0);
    expect(s.boat.speedMps).toBe(0);
    expect(s.dist2).toBeCloseTo(120 * 120 + 50 * 50, 6);
  });
  it('自艇が巡航で北へ進むと付いてくる: 60 秒後も自艇から 200 m 以内で、速力は自艇とほぼ同じ', () => {
    const pl = player({ speedMps: ktToMps(23) });
    const s = createEscort(P, pl);
    for (let i = 0; i < 60 * 60; i++) {
      advance(pl, DT);
      stepEscort(s, P, pl, true, BOUNDS, DT);
    }
    expect(Math.sqrt(s.dist2)).toBeLessThan(200);
    expect(Math.abs(s.boat.speedMps - pl.speedMps)).toBeLessThan(1);
    expect(Math.sqrt(s.maxDist2)).toBeLessThan(400);
  });
  it('自艇が全速（僚艇の全速と同じ）で走ると 150〜400 m 遅れたまま（追いつけない。警告の 500 m 未満）。巡航に落とすと 20 秒で 150 m 以内に戻り（300 m の遅れを全速と巡航の差 8 m/s（画面上 40 m/秒）で詰める）、止まれば僚艇も止まる', () => {
    const pl = player({ speedMps: ktToMps(39) });
    const s = createEscort(P, pl);
    for (let i = 0; i < 60 * 15; i++) {
      advance(pl, DT);
      stepEscort(s, P, pl, true, BOUNDS, DT);
    }
    const lag = Math.sqrt(s.dist2);
    expect(lag).toBeGreaterThan(150);
    expect(lag).toBeLessThan(400);
    pl.speedMps = ktToMps(23);
    for (let i = 0; i < 60 * 20; i++) {
      advance(pl, DT);
      stepEscort(s, P, pl, true, BOUNDS, DT);
    }
    expect(Math.sqrt(s.dist2)).toBeLessThan(150);
    pl.speedMps = 0;
    for (let i = 0; i < 60 * 30; i++) stepEscort(s, P, pl, true, BOUNDS, DT);
    expect(s.boat.speedMps).toBe(0);
    expect(Math.sqrt(s.dist2)).toBeLessThan(150);
  });
  it('自艇が東へ転針すると定位置（後ろ・左舷＝北側）へ回り込む: 30 秒後に自艇の西側 100 m 以上・北側にいる', () => {
    const pl = player({ x: 3000, y: 3000, headingDeg: 90, speedMps: ktToMps(23) });
    const s = createEscort(P, player({ x: 3000, y: 3000, headingDeg: 0, speedMps: 0 }));
    for (let i = 0; i < 60 * 30; i++) {
      advance(pl, DT);
      stepEscort(s, P, pl, true, BOUNDS, DT);
    }
    expect(pl.x - s.boat.x).toBeGreaterThan(100);
    expect(s.boat.y).toBeLessThan(pl.y);
    expect(Math.abs(s.boat.headingDeg - 90)).toBeLessThan(10);
  });
  it('被弾: HP 90 → 50 → 10 → 0 で沈没（沈んだ瞬間だけ true）。沈んだ後は動かず、被弾も数えない', () => {
    const pl = player({ speedMps: ktToMps(23) });
    const s = createEscort(P, pl);
    expect(hitEscort(s, 40, 10)).toBe(false);
    expect(hitEscort(s, 40, 11)).toBe(false);
    expect(hitEscort(s, 40, 12)).toBe(true);
    expect(s.hp).toBe(0);
    expect(s.hits).toBe(3);
    expect(s.sunkAtS).toBe(12);
    expect(hitEscort(s, 40, 13)).toBe(false);
    expect(s.hits).toBe(3);
    const x = s.boat.x;
    for (let i = 0; i < 60; i++) {
      advance(pl, DT);
      stepEscort(s, P, pl, true, BOUNDS, DT);
    }
    expect(s.boat.x).toBe(x);
  });
  it('確保なし: 600 ステップ回しても boat の参照は同じ', () => {
    const pl = player({ speedMps: 10 });
    const s = createEscort(P, pl);
    const ref = s.boat;
    for (let i = 0; i < 600; i++) {
      advance(pl, DT);
      stepEscort(s, P, pl, true, BOUNDS, DT);
    }
    expect(s.boat).toBe(ref);
  });
});
