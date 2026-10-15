import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission, getShoreBatteryParams } from '../src/config/game-data';
import { SeededRng } from '../src/core/rng';
import { createShoreBattery, isShoreBatteryDataRecord, shoreBatteryParamsFromData, stepShoreBattery, type ShoreBatteryCheck, type ShoreBatteryDataRecord, type ShoreBatteryEvents } from '../src/core/shore-battery';
import { createSmokeState, type SmokeParams } from '../src/core/smoke';

const DT = 1 / 60;
const TS = 5;
const P = getShoreBatteryParams(gameData, getPrototypeMission(gameData, 'us_03'))!;
const rec = (): ShoreBatteryDataRecord => JSON.parse(JSON.stringify((gameData.riskEvents.events.find((e) => e.id === 'shore_battery') as unknown as { params: ShoreBatteryDataRecord }).params)) as ShoreBatteryDataRecord;

function check(boat = { x: 4600, y: 2170, headingDeg: 90, speedMps: 0 }, over: Partial<ShoreBatteryCheck> = {}): ShoreBatteryCheck {
  return { boat, boatHalfLengthM: 12.2, boatHalfBeamM: 3.15, boatAfloat: true, detectOpenM: 288, smokeFactor: 0.3, smoke: null, smokeParams: null, bargesAlerted: false, flashM: 0, ...over };
}
function events(log: string[] = []): ShoreBatteryEvents {
  return { onFire: () => log.push('fire'), onImpact: (_x, _y, hit) => log.push(hit ? 'hit' : 'miss') };
}

describe('沿岸砲（core/shore-battery、v0.4.3）', () => {
  it('us_03 の数値: 砲台 (4600, 2560)、射界 900 m（半円）、75mm 20 発/分・20・400 m/s・散り 45・splash 6・火災 20%・機関 15%、発見 1,200 m・解除 8 秒', () => {
    expect([P.x, P.y, P.gun.effectiveM, P.arc2, P.baseDetectM, P.detectHoldS]).toEqual([4600, 2560, 900, 810000, 1200, 8]);
    expect([P.gun.roundsPerMinPerGun, P.gun.count, P.gun.damage, P.gun.shellSpeedMps, P.gun.dispersionM, P.gun.splashRadiusM]).toEqual([20, 1, 20, 400, 45, 6]);
    expect(P.hit).toEqual({ damage: 20, fireChance: 0.2, engineDamageChance: 0.15 });
  });
  it('壊れた data は例外: x_m が海域の外、inland_m が負、gun の rof 0。gun が欠ければ isShoreBatteryDataRecord が false', () => {
    expect(() => shoreBatteryParamsFromData(rec(), 6100, 2500, 6000, 8)).toThrow(/x_m/);
    const r = rec();
    r.inland_m = -1;
    expect(() => shoreBatteryParamsFromData(r, 5000, 2500, 6000, 8)).toThrow(/inland_m/);
    const z = rec();
    z.gun.rof_per_min = 0;
    expect(() => shoreBatteryParamsFromData(z, 5000, 2500, 6000, 8)).toThrow(/rof_per_min/);
    expect(isShoreBatteryDataRecord({ base_detect_m: 1200, inland_m: 60 })).toBe(false);
  });
  it('射界: 浅瀬の縁（砲から 390 m 北）は中、1,000 m 北は外。中でも気づかれていなければ撃たない（停止 288 m の目には届かない）', () => {
    const s = createShoreBattery(6);
    const log: string[] = [];
    stepShoreBattery(s, P, check(), new SeededRng(1), DT, DT * TS, events(log));
    expect(s.inArc).toBe(true);
    expect(s.alerted).toBe(false);
    expect(log).toEqual([]);
    stepShoreBattery(s, P, check({ x: 4600, y: 1560, headingDeg: 90, speedMps: 0 }), new SeededRng(1), DT, DT * TS, events(log));
    expect(s.inArc).toBe(false);
  });
  it('大発が気づいている・閃光・自分の目のどれかで撃ち始め、3 秒に 1 発。見失って 8 秒で解ける（射界を出ても弾は飛ぶ）', () => {
    const s = createShoreBattery(6);
    const log: string[] = [];
    const rng = new SeededRng(2);
    stepShoreBattery(s, P, check(undefined, { bargesAlerted: true }), rng, DT, DT * TS, events(log));
    expect(s.alerted).toBe(true);
    expect(log[0]).toBe('fire');
    let t = DT;
    for (let i = 0; i < 60 * 10; i++) {
      stepShoreBattery(s, P, check(undefined, { bargesAlerted: true }), rng, DT, DT * TS, events(log));
      t += DT;
    }
    expect(s.shots).toBe(4); // 0・3・6・9 秒
    expect(s.inArcS).toBeCloseTo(t, 6);
    // 閃光だけでも気づく
    const f = createShoreBattery(6);
    stepShoreBattery(f, P, check(undefined, { flashM: 1200 }), new SeededRng(3), DT, DT * TS, events());
    expect(f.alerted).toBe(true);
    // 自分の目: 巡航で見つかる距離 720 m の中
    const e = createShoreBattery(6);
    stepShoreBattery(e, P, check(undefined, { detectOpenM: 720 }), new SeededRng(3), DT, DT * TS, events());
    expect(e.alerted).toBe(true);
    // 解除: 気づく条件が消えて 8 秒
    let left = 0;
    while (e.alerted) {
      stepShoreBattery(e, P, check(), new SeededRng(3), DT, DT * TS, events());
      left += DT;
    }
    expect(left).toBeCloseTo(8, 1);
  });
  it('煙幕で砲台との線が遮られると撃たない。艇が沈んでいれば射界に数えない', () => {
    const s = createShoreBattery(6);
    const sp: SmokeParams = { durationS: 5, cooldownS: 20, puffIntervalS: 0.5, puffRadiusM: 60, puffLifetimeS: 25, extinguishHoldS: 1 };
    const smoke = createSmokeState(4);
    Object.assign(smoke.puffs[0]!, { active: true, x: 4600, y: 2400, leftS: 20 });
    const log: string[] = [];
    stepShoreBattery(s, P, check(undefined, { bargesAlerted: true, smoke, smokeParams: sp }), new SeededRng(4), DT, DT * TS, events(log));
    expect(s.alerted).toBe(true);
    expect(log).toEqual([]);
    const d = createShoreBattery(6);
    stepShoreBattery(d, P, check(undefined, { bargesAlerted: true, boatAfloat: false }), new SeededRng(4), DT, DT * TS, events(log));
    expect(d.inArc).toBe(false);
    expect(d.inArcS).toBe(0);
  });
  it('命中率（止まった艇、砲から 400 m、2,000 発、SeededRng(5)）: 5〜6 割（動く艇は見越しの誤差で下がる。模擬で 2〜3 割）', () => {
    const s = createShoreBattery(64);
    const boat = { x: 4600, y: 2160, headingDeg: 90, speedMps: 0 };
    const rng = new SeededRng(5);
    let hits = 0;
    const p = { ...P, gun: { ...P.gun, roundsPerMinPerGun: 6000 } };
    const ev: ShoreBatteryEvents = { onFire: () => {}, onImpact: (_x, _y, h) => (hits += h ? 1 : 0) };
    for (let i = 0; i < 100000 && s.shots < 2000; i++) stepShoreBattery(s, p, check(boat, { bargesAlerted: true }), rng, DT, DT * TS, ev);
    for (let i = 0; i < 120; i++) stepShoreBattery(s, p, check(boat, { bargesAlerted: true, boatAfloat: true }), rng, DT, 0.5, ev);
    expect(s.shots).toBeGreaterThanOrEqual(2000);
    expect(hits / s.shots).toBeGreaterThan(0.45);
    expect(hits / s.shots).toBeLessThan(0.65);
  });
  it('確保なし: 600 ステップ回しても弾の配列と要素の参照は同じ', () => {
    const s = createShoreBattery(6);
    const shells = s.shells;
    const first = s.shells[0];
    for (let i = 0; i < 600; i++) stepShoreBattery(s, P, check(undefined, { bargesAlerted: true }), new SeededRng(6), DT, DT * TS, events());
    expect(s.shells).toBe(shells);
    expect(s.shells[0]).toBe(first);
  });
});
