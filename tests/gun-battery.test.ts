import { describe, expect, it } from 'vitest';
import { gameData, getBargeParams, getGunBatteryParams, getPrototypeMission } from '../src/config/game-data';
import type { SpeedStep } from '../src/core/boat-motion';
import { BARGE_SUNK, createFlotilla, hitBarge } from '../src/core/barges';
import { GUN_BLOCKED, GUN_FIRING, GUN_NO_TARGET, GUN_OUT_OF_ARC, GUN_OUT_OF_RANGE, GUN_SAFE, createGunBattery, gunBatteryParamsFromData, selectTarget, stepGunBattery, type GunBatteryDataRecord, type GunEvents } from '../src/core/gun-battery';
import { SeededRng } from '../src/core/rng';

const DT = 1 / 60;
const TS = 5;
const M = getPrototypeMission(gameData, 'us_03');
const G = getGunBatteryParams(gameData, M)!;
const P = getBargeParams(gameData, M)!;
const VIS2 = 900 * 900;
const raw = (): GunBatteryDataRecord => JSON.parse(JSON.stringify((gameData.boats.boats.find((b) => b.id === 'us_elco80') as unknown as { gun_battery: GunBatteryDataRecord }).gun_battery)) as GunBatteryDataRecord;
const quiet: GunEvents = { onFire: () => {}, onHit: () => {}, onMiss: () => {} };

/** 大発 1 隻だけを (x, y) に止めて置く（他は撃破済み） */
function oneBarge(x: number, y: number) {
  const f = createFlotilla(P, 16);
  for (let i = 1; i < f.barges.length; i++) f.barges[i]!.phase = BARGE_SUNK;
  Object.assign(f.barges[0]!, { x, y, speedMps: 0, headingDeg: 270 });
  return f;
}

/** 静止した大発を舷側 d m で撃ち続け、撃破までの秒（60 秒で打ち切り） */
function killTime(d: number, band: SpeedStep, seed: number): number {
  const f = oneBarge(0, d);
  const g = createGunBattery(G, 24);
  const boat = { x: 0, y: 0, headingDeg: 90, speedMps: 0 };
  const rng = new SeededRng(seed);
  const ev: GunEvents = { onFire: () => {}, onHit: (i, gr) => void hitBarge(f, P, i, G.groups[gr]!.damage), onMiss: () => {} };
  let t = 0;
  while (f.barges[0]!.phase !== BARGE_SUNK && t < 60) {
    stepGunBattery(g, G, boat, band, true, true, f.barges, P.halfLengthM, P.halfBeamM, VIS2, rng, DT, DT * TS, ev);
    t += DT;
  }
  return t;
}
const median = (a: number[]): number => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)]!;

describe('艇の砲（core/gun-battery、v0.4.2）', () => {
  it('us_elco80 の gun_battery: 射程 600・遠い 300・死角 ±30°（cos² 0.75）・閃光 1,500・散布の倍率 1/1/1.6/2.5・2 組（150 発/分 8・480 発/分 2）', () => {
    expect([G.label, G.rangeM, G.effectiveM, G.deadConeDeg, G.flashRevealM]).toEqual(['40mm・37mm・20mm・12.7mm', 600, 300, 30, 1500]);
    expect(G.deadConeCos2).toBeCloseTo(0.75, 12);
    expect(G.spreadFactor).toEqual({ stop: 1, silent: 1, cruise: 1.6, full: 2.5 });
    expect(G.groups.map((g) => [g.id, g.roundsPerMin, g.damage, g.shellSpeedMps, g.dispersionM, g.splashRadiusM])).toEqual([['40mm_37mm', 150, 8, 400, 30, 2.5], ['20mm_12.7mm', 480, 2, 500, 36, 1]]);
    expect(getGunBatteryParams(gameData, getPrototypeMission(gameData, 'us_02'))).toBeNull();
  });
  it('壊れた data は例外: effective > range、死角 90°、倍率 < 1、damage 0', () => {
    expect(() => gunBatteryParamsFromData({ ...raw(), effective_m: 700 })).toThrow();
    expect(() => gunBatteryParamsFromData({ ...raw(), dead_cone_deg: 90 })).toThrow();
    expect(() => gunBatteryParamsFromData({ ...raw(), spread_factor: { stop: 0.9, silent: 1, cruise: 1.6, full: 2.5 } })).toThrow();
    const r = raw();
    r.groups[0]!.damage = 0;
    expect(() => gunBatteryParamsFromData(r)).toThrow();
  });
  it('標的: 東向きの艇に、南 200 m は射界（撃つ）、東 300 m は艇首の死角、南 700 m は射程外、南 1,000 m は見えない、煙幕越しは撃てない。艇首から 31° は射界・29° は死角', () => {
    const g = createGunBattery(G, 24);
    const boat = { x: 0, y: 0, headingDeg: 90, speedMps: 0 };
    const at = (x: number, y: number, blocked = false): number => {
      const f = oneBarge(x, y);
      f.barges[0]!.blocked = blocked;
      const i = selectTarget(g, G, boat, f.barges, VIS2);
      return i >= 0 ? GUN_FIRING : g.status;
    };
    expect(at(0, 200)).toBe(GUN_FIRING);
    expect(at(300, 0)).toBe(GUN_OUT_OF_ARC);
    expect(at(-300, 0)).toBe(GUN_OUT_OF_ARC);
    expect(at(0, 700)).toBe(GUN_OUT_OF_RANGE);
    expect(at(0, 1000)).toBe(GUN_NO_TARGET);
    expect(at(0, 200, true)).toBe(GUN_BLOCKED);
    const deg = (a: number): [number, number] => [400 * Math.cos((a * Math.PI) / 180), 400 * Math.sin((a * Math.PI) / 180)];
    expect(at(...deg(31))).toBe(GUN_FIRING);
    expect(at(...deg(29))).toBe(GUN_OUT_OF_ARC);
  });
  it('発射: 押して 1 秒で 40mm・37mm 3 発（0・0.4・0.8 秒）＋ 20mm・12.7mm 8 発。押していない・艇が沈んでいれば撃たず SAFE。最初の射撃の距離と速力帯を 1 回だけ記録', () => {
    const f = oneBarge(0, 250);
    const g = createGunBattery(G, 24);
    const boat = { x: 0, y: 0, headingDeg: 90, speedMps: 0 };
    let fires = 0;
    const ev: GunEvents = { onFire: () => fires++, onHit: () => {}, onMiss: () => {} };
    stepGunBattery(g, G, boat, 'stop', false, true, f.barges, P.halfLengthM, P.halfBeamM, VIS2, new SeededRng(1), DT, DT * TS, ev);
    expect([g.status, g.shots]).toEqual([GUN_SAFE, 0]);
    stepGunBattery(g, G, boat, 'stop', true, false, f.barges, P.halfLengthM, P.halfBeamM, VIS2, new SeededRng(1), DT, DT * TS, ev);
    expect([g.status, g.shots]).toEqual([GUN_SAFE, 0]);
    const rng = new SeededRng(1);
    for (let i = 0; i < 60; i++) stepGunBattery(g, G, boat, 'silent', true, true, f.barges, P.halfLengthM, P.halfBeamM, VIS2, rng, DT, DT * TS, ev);
    expect(g.shots).toBe(11);
    expect(g.firstShotM).toBeCloseTo(250, 9);
    expect(g.firstShotBand).toBe('silent');
    expect(g.targetM).toBeCloseTo(250, 9);
    expect(fires).toBeGreaterThanOrEqual(8);
  });
  it('撃破までの秒（静止した大発を舷側から、200 seed の中央値）: 200 m 約 1.3 秒、300 m 約 3.0 秒、400 m 約 5 秒、全速の 300 m 約 18 秒', () => {
    const at = (d: number, band: SpeedStep): number => median(Array.from({ length: 200 }, (_, i) => killTime(d, band, i + 1)));
    const m200 = at(200, 'stop');
    const m300 = at(300, 'stop');
    const m400 = at(400, 'silent');
    expect(m200).toBeGreaterThan(1.0);
    expect(m200).toBeLessThan(1.7);
    expect(m300).toBeGreaterThan(2.5);
    expect(m300).toBeLessThan(3.5);
    expect(m400).toBeGreaterThan(4.2);
    expect(m400).toBeLessThan(5.8);
    const full = median(Array.from({ length: 60 }, (_, i) => killTime(300, 'full', i + 1)));
    expect(full).toBeGreaterThan(13);
    expect(full).toBeLessThan(24);
  });
  it('着弾点にいる大発に当たる（狙った 1 隻に限らない）: 標的の真後ろに重ねた 2 隻目は、標的が沈んだ後も弾が届けば当たる', () => {
    const f = createFlotilla(P, 16);
    for (let i = 2; i < f.barges.length; i++) f.barges[i]!.phase = BARGE_SUNK;
    Object.assign(f.barges[0]!, { x: 0, y: 150, speedMps: 0 });
    Object.assign(f.barges[1]!, { x: 0, y: 150, speedMps: 0 });
    const g = createGunBattery(G, 24);
    const hit = [0, 0];
    const ev: GunEvents = { onFire: () => {}, onHit: (i) => hit[i]!++, onMiss: () => {} };
    const rng = new SeededRng(9);
    for (let i = 0; i < 30; i++) stepGunBattery(g, G, { x: 0, y: 0, headingDeg: 90, speedMps: 0 }, 'stop', true, true, f.barges, P.halfLengthM, P.halfBeamM, VIS2, rng, DT, DT * TS, ev);
    expect(hit[0]).toBeGreaterThan(0);
    expect(hit[1]).toBe(0); // 同じ場所なら index の若い方
    f.barges[0]!.phase = BARGE_SUNK;
    for (let i = 0; i < 30; i++) stepGunBattery(g, G, { x: 0, y: 0, headingDeg: 90, speedMps: 0 }, 'stop', true, true, f.barges, P.halfLengthM, P.halfBeamM, VIS2, rng, DT, DT * TS, quiet);
    expect(g.target).toBe(1);
  });
});
