import { describe, expect, it } from 'vitest';
import { gameData, getBargeParams, getPrototypeMission } from '../src/config/game-data';
import { bargeParamsFromData, isBargeDataRecord, type BargeDataRecord, type BargeMissionBlock } from '../src/core/barge-data';
import { BARGE_ALERT, BARGE_BEACHED, BARGE_CRUISE, BARGE_RUN, BARGE_SUNK, createFlotilla, hitBarge, nearestAfloat, stepFlotilla, type FlotillaCheck, type FlotillaEvents } from '../src/core/barges';
import { SeededRng } from '../src/core/rng';
import { createSmokeState, type SmokeParams } from '../src/core/smoke';
import { ktToMps } from '../src/core/units';

const DT = 1 / 60;
const TS = 5;
const P = getBargeParams(gameData, getPrototypeMission(gameData, 'us_03'))!;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const rec = (): BargeDataRecord => clone(gameData.enemies.enemies.find((e) => e.id === 'daihatsu_barge')) as unknown as BargeDataRecord;
const block = (): BargeMissionBlock => clone((gameData.missionsSeed.missions.find((m) => m.id === 'us_03') as unknown as { v0_1_prototype: { barges: BargeMissionBlock } }).v0_1_prototype.barges);
const W = { hitScale: 1, spriteScale: 2, timeScale: 5 };
const B = { width: 6000, height: 3000 };

function check(boat = { x: 0, y: 0, headingDeg: 0, speedMps: 0 }, over: Partial<FlotillaCheck> = {}): FlotillaCheck {
  return { boat, boatHalfLengthM: 12.2, boatHalfBeamM: 3.15, detectOpenM: 288, smokeFactor: 0.3, smoke: null, smokeParams: null, flashM: 0, boatAfloat: true, ...over };
}
function events(log: string[] = []): FlotillaEvents {
  return { onFire: () => log.push('fire'), onImpact: (_x, _y, hit) => log.push(hit ? 'hit' : 'miss'), onBeached: (i) => log.push(`beach${i}`) };
}

describe('大発の隊（core/barges・barge-data、v0.4.2）', () => {
  it('us_03 の数値: 4 隻・HP 20・半長 7.45・半幅 1.7・7 kt で巡航、8 kt で逃げる・旋回 8°/s・発見 1,200 m・反応 5 秒・警戒 8 秒・13mm（600 m・200 発/分・2・500 m/s・50 m・1.5）・先頭 (4300, 2800) から 0/100/1,500/1,600 m・岸の線 2,960・扇 15°・ノルマ 3', () => {
    expect(P.count).toBe(4);
    expect(P.hp).toBe(20);
    expect(P.halfLengthM).toBeCloseTo(7.45, 9);
    expect(P.halfBeamM).toBeCloseTo(1.7, 9);
    expect(P.boundsMarginM).toBeCloseTo(14.9, 9);
    expect(P.cruiseSpeedMps).toBeCloseTo(ktToMps(7), 9);
    expect(P.runSpeedMps).toBeCloseTo(ktToMps(8), 9);
    expect([P.turnRateDegS, P.accelMps2, P.baseDetectM, P.reactionDelayS, P.detectHoldS]).toEqual([8, 0.4, 1200, 5, 8]);
    expect([P.gun.effectiveM, P.gun.roundsPerMinPerGun, P.gun.damage, P.gun.shellSpeedMps, P.gun.dispersionM, P.gun.splashRadiusM]).toEqual([600, 200, 2, 500, 50, 1.5]);
    expect(P.gunHit).toEqual({ damage: 2, fireChance: 0.03, engineDamageChance: 0.02 });
    expect([P.leadX, P.leadY, P.headingDeg, P.beachY, P.fanDeg, P.quota, P.timeScale]).toEqual([4300, 2800, 270, 2960, 15, 3, 5]);
    expect(P.offsetsM).toEqual([0, 100, 1500, 1600]);
  });
  it('隊の並びと逃げる向き: 2 隻ずつ 2 組（4300/4400 と 5800/5900、y 2,800）、扇 157.5/172.5/187.5/202.5°', () => {
    const f = createFlotilla(P, 16);
    expect(f.barges.map((b) => [Math.round(b.x), Math.round(b.y), b.headingDeg, b.phase, b.hp])).toEqual([[4300, 2800, 270, BARGE_CRUISE, 20], [4400, 2800, 270, 0, 20], [5800, 2800, 270, 0, 20], [5900, 2800, 270, 0, 20]]);
    expect(f.barges.map((b) => b.runHeadingDeg)).toEqual([157.5, 172.5, 187.5, 202.5]);
  });
  it('壊れた data は例外: ノルマ 5 > 4、7 + 2 kt > 8 kt、先頭が海域の外、航跡が岸の線より陸側、offsets_m の数・順、機銃が 2 種', () => {
    expect(() => bargeParamsFromData(rec(), { ...block(), kill_quota: 5 }, 4, W, B, 8)).toThrow(/kill_quota/);
    const fast = rec();
    fast.evasion.speed_boost_kt = 2;
    expect(() => bargeParamsFromData(fast, block(), 4, W, B, 8)).toThrow(/speed_max_kt/);
    expect(() => bargeParamsFromData(rec(), { ...block(), lead_start: { x_m: 6100, y_m: 2800, heading_deg: 270 } }, 4, W, B, 8)).toThrow(/海域/);
    expect(() => bargeParamsFromData(rec(), { ...block(), lead_start: { x_m: 4300, y_m: 2970, heading_deg: 270 } }, 4, W, B, 8)).toThrow(/岸の線/);
    expect(() => bargeParamsFromData(rec(), { ...block(), offsets_m: [0, 100, 1500] }, 4, W, B, 8)).toThrow(/offsets_m/);
    expect(() => bargeParamsFromData(rec(), { ...block(), offsets_m: [0, 100, 50, 1600] }, 4, W, B, 8)).toThrow(/offsets_m/);
    const two = rec();
    two.guns = [two.guns[0]!, two.guns[0]!];
    expect(isBargeDataRecord(two)).toBe(false);
  });
  it('巡航: 艇が遠ければ 10 秒で 180.04 m 西へ（7 kt × 50 game 秒。4300 → 4119.96）、気づかない', () => {
    const f = createFlotilla(P, 16);
    const c = check({ x: 0, y: 0, headingDeg: 0, speedMps: 0 });
    for (let i = 0; i < 600; i++) stepFlotilla(f, P, c, new SeededRng(1), DT, DT * TS, events());
    expect(f.barges[0]!.x).toBeCloseTo(4300 - ktToMps(7) * 50, 6);
    expect(f.barges[0]!.y).toBeCloseTo(2800, 9);
    expect(f.anyDetected).toBe(false);
    expect(f.barges[0]!.phase).toBe(BARGE_CRUISE);
  });
  it('目で気づく → 5 秒は進路のまま（撃ち返す）→ 岸へ。上陸は気づいてから 13.7〜14.2 秒（#1・#2 8.65 秒、#0 9.08 秒、#3 9.15 秒の走り）。逃げている間の「上陸まで」は (2960 − y) / (8 kt × 5)', () => {
    const f = createFlotilla(P, 16);
    const boat = { x: 4300, y: 2800 - 280, headingDeg: 90, speedMps: 0 };
    const log: string[] = [];
    const rng = new SeededRng(2);
    stepFlotilla(f, P, check(boat), rng, DT, DT * TS, events(log));
    expect(f.barges[0]!.phase).toBe(BARGE_ALERT);
    expect(f.firstDetectM).toBeCloseTo(280, 6);
    expect(f.flashFirst).toBe(false);
    expect(log[0]).toBe('fire'); // 気づいた瞬間から撃つ
    let t = DT;
    while (f.barges[0]!.phase === BARGE_ALERT) {
      stepFlotilla(f, P, check(boat), rng, DT, DT * TS, events(log));
      t += DT;
    }
    expect(t).toBeCloseTo(5, 1);
    expect(f.barges[0]!.phase).toBe(BARGE_RUN);
    expect(f.escapeLeftS).toBeCloseTo((2960 - f.barges[0]!.y) / (ktToMps(8) * 5), 6);
    while (f.barges[0]!.phase === BARGE_RUN) {
      stepFlotilla(f, P, check(boat), rng, DT, DT * TS, events(log));
      t += DT;
    }
    expect(f.barges[0]!.phase).toBe(BARGE_BEACHED);
    expect(t).toBeGreaterThan(13.9);
    expect(t).toBeLessThan(14.2);
    expect(log).toContain('beach0');
    expect(f.beached).toBe(1);
  });
  it('射撃の閃光: 1,000 m 先の艇が撃つと（flashM 1,200）1 組目の 2 隻だけ気づき、2 組目（1,803 / 1,887 m）は巡航のまま。最初の気づきは閃光（firstDetectM は NaN のまま）', () => {
    const f = createFlotilla(P, 16);
    stepFlotilla(f, P, check({ x: 4300, y: 1800, headingDeg: 90, speedMps: 0 }, { flashM: 1200 }), new SeededRng(3), DT, DT * TS, events());
    expect(f.barges.map((b) => [b.detected, b.phase])).toEqual([[true, BARGE_ALERT], [true, BARGE_ALERT], [false, BARGE_CRUISE], [false, BARGE_CRUISE]]);
    expect(f.flashFirst).toBe(true);
    expect(Number.isNaN(f.firstDetectM)).toBe(true);
  });
  it('煙幕: 艇との線が煙に遮られた大発は見つける距離 × 0.3（288 → 86.4 m）、気づいても撃たない。全員から隠れれば allBlocked', () => {
    const f = createFlotilla(P, 16);
    for (let i = 1; i < 4; i++) f.barges[i]!.phase = BARGE_SUNK;
    const sp: SmokeParams = { durationS: 5, cooldownS: 20, puffIntervalS: 0.5, puffRadiusM: 60, puffLifetimeS: 25, extinguishHoldS: 1 };
    const smoke = createSmokeState(4);
    Object.assign(smoke.puffs[0]!, { active: true, x: 4300, y: 2650, leftS: 20 });
    const log: string[] = [];
    stepFlotilla(f, P, check({ x: 4300, y: 2550, headingDeg: 90, speedMps: 0 }, { smoke, smokeParams: sp }), new SeededRng(4), DT, DT * TS, events(log));
    expect(f.barges[0]!.blocked).toBe(true);
    expect(f.barges[0]!.detected).toBe(false); // 250 m > 86.4 m
    expect(f.allBlocked).toBe(true);
    // 発見距離が 1,000 m（煙越し 300 m）なら 250 m で気づくが、線が遮られているので撃たない
    stepFlotilla(f, P, check({ x: 4300, y: 2550, headingDeg: 90, speedMps: 0 }, { smoke, smokeParams: sp, detectOpenM: 1000 }), new SeededRng(4), DT, DT * TS, events(log));
    expect(f.barges[0]!.detected).toBe(true);
    expect(log.includes('fire')).toBe(false);
  });
  it('艇の砲の命中: 8 + 8 で浮き、3 発目で撃破（sunk 1）。撃破・上陸した大発には当たらない。最も近い浮いている大発', () => {
    const f = createFlotilla(P, 16);
    expect(hitBarge(f, P, 1, 8)).toBe(false);
    expect(hitBarge(f, P, 1, 8)).toBe(false);
    expect(f.barges[1]!.detected).toBe(true);
    expect(hitBarge(f, P, 1, 8)).toBe(true);
    expect(f.barges[1]!.phase).toBe(BARGE_SUNK);
    expect(f.sunk).toBe(1);
    expect(hitBarge(f, P, 1, 8)).toBe(false);
    expect(nearestAfloat(f, 5200, 2800)).toBe(2);
  });
  it('13mm の命中率（静止した艇に 300 m、20,000 発）: 1 発 約 14.9%（1 隻 1.0 HP/秒）', () => {
    const f = createFlotilla(P, 64);
    for (let i = 1; i < 4; i++) f.barges[i]!.phase = BARGE_SUNK;
    const b = f.barges[0]!;
    const boat = { x: 4300, y: 2500, headingDeg: 90, speedMps: 0 };
    const rng = new SeededRng(5);
    let hits = 0;
    const ev: FlotillaEvents = { onFire: () => {}, onImpact: (_x, _y, h) => (hits += h ? 1 : 0), onBeached: () => {} };
    const p = { ...P, reactionDelayS: 1e9, cruiseSpeedMps: 0 };
    b.speedMps = 0;
    for (let i = 0; i < 400000 && f.shotsFired < 20000; i++) {
      b.x = 4300;
      stepFlotilla(f, p, check(boat, { detectOpenM: 400 }), rng, DT, DT * TS, ev);
    }
    expect(f.shotsFired).toBe(20000);
    expect(hits / f.shotsFired).toBeGreaterThan(0.139);
    expect(hits / f.shotsFired).toBeLessThan(0.159);
  });
  it('確保なし: 600 ステップ回しても隊・弾の配列と各要素の参照は同じ', () => {
    const f = createFlotilla(P, 16);
    const barges = f.barges;
    const first = f.barges[0];
    const shells = f.shells;
    for (let i = 0; i < 600; i++) stepFlotilla(f, P, check({ x: 4200, y: 2600, headingDeg: 90, speedMps: 0 }), new SeededRng(6), DT, DT * TS, events());
    expect(f.barges).toBe(barges);
    expect(f.barges[0]).toBe(first);
    expect(f.shells).toBe(shells);
  });
});
