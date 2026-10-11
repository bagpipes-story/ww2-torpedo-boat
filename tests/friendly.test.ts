import { describe, expect, it } from 'vitest';
import boats from '../data/boats.json';
import enemies from '../data/enemies.json';
import { gameData, getBoatRecord, getFriendlyParams, getGroundingParams, getPrototypeMission } from '../src/config/game-data';
import {
  FF_CHALLENGE,
  FF_DONE,
  FF_EV_STRIKE,
  FF_IDLE,
  FF_LEAVING,
  FF_OUT_CANCELLED,
  FF_OUT_GAVE_UP,
  FF_OUT_IDENTIFIED,
  FF_OUT_NONE,
  FF_STRAFE,
  aircraftPose,
  cancelFriendly,
  createFriendlyState,
  friendlyConditionsMet,
  friendlyParamsFromData,
  identifyFriendly,
  isFriendlyFireDataRecord,
  startChallenge,
  stepFriendly,
  stepFriendlyTrigger,
  type AircraftPose,
  type FriendlyCheck,
  type FriendlyFireDataRecord,
  type FriendlyParams,
  type FriendlyState,
} from '../src/core/friendly';
import { isBoatDamageDataRecord, isEnemyGunneryDataRecord } from '../src/core/gunnery';
import { distanceToShallowsM } from '../src/core/shallows';
import { ktToMps } from '../src/core/units';

const TS = gameData.hitRateModel.world.time_scale;
const MISSION = getPrototypeMission(gameData, 'us_02');
const P: FriendlyParams = getFriendlyParams(gameData, MISSION, TS)!;
const raw: unknown = gameData.riskEvents.events.find((e) => e.id === 'friendly_fire');
if (!isFriendlyFireDataRecord(raw)) throw new Error('friendly_fire params');
const REC: FriendlyFireDataRecord = raw;
const DT = 1 / 60;
/** 実機で測った目安: 初見の反応（気づく＋親指を動かす＋読む）と、構えているときの反応（秒） */
const FAIR_FIRST_REACTION_S = 2.3;
const FAIR_KNOWN_REACTION_S = 1.3;

function okCheck(): FriendlyCheck {
  // 帰投地点が真東 1,000 m、東向きに進んでいる
  return { fired: true, homeDx: 1000, homeDy: 0, headingDeg: 90, speedMps: 10, underFire: false, busy: false, shallow: false, blocked: false };
}
function started(): FriendlyState {
  const s = createFriendlyState();
  startChallenge(s, P, 1000, 0);
  return s;
}
/** dt 刻みで t 秒進める。発砲の回数を返す */
function run(s: FriendlyState, seconds: number, dt = DT): number {
  let strikes = 0;
  const n = Math.round(seconds / dt);
  for (let i = 0; i < n; i++) if (stepFriendly(s, P, dt) & FF_EV_STRIKE) strikes++;
  return strikes;
}
const pose = (s: FriendlyState): AircraftPose => aircraftPose(s, P, { dx: 0, dy: 0, headingDeg: 0, alpha: 0 });
const dist = (q: AircraftPose): number => Math.hypot(q.dx, q.dy);
const bearing = (q: AircraftPose): number => ((Math.atan2(q.dx, -q.dy) * 180) / Math.PI + 360) % 360;

describe('友軍誤射（docs/02 §6.8）: data と params', () => {
  it('us_02: 猶予 5 秒・再要求 4 秒・150 kt → 385.8 m/s・真上まで 0.648 秒・航過 1.296 秒・旋回 88.4°/s・範囲 2,850 m', () => {
    expect(P.windowS).toBe(5);
    expect(P.rechallengeS).toBe(4);
    expect(P.passesMax).toBe(2);
    expect(P.hit).toEqual({ damage: 25, fireChance: 0.25, engineDamageChance: 0 });
    expect(P.flightMps).toBeCloseTo(ktToMps(150) * 5, 6);
    expect(P.overpassS).toBeCloseTo(250 / P.flightMps, 9);
    expect(P.passS).toBeCloseTo(2 * P.overpassS, 9);
    expect(P.orbitDegPerS).toBeCloseTo((P.flightMps / 250) * (180 / Math.PI), 6);
    expect(P.zoneRadius2).toBe(2850 * 2850);
    expect(P.triggerEdgeM).toBe(2600);
  });
  it('壊れた設計値は例外', () => {
    const q = REC.params;
    const w = (patch: Partial<typeof q>): (() => FriendlyParams) => () => friendlyParamsFromData({ params: { ...q, ...patch } }, 2600, 250, TS);
    expect(w({ approach_s: 5 })).toThrow();
    expect(w({ rechallenge_s: 0 })).toThrow();
    expect(w({ passes_max: 1.5 })).toThrow();
    expect(w({ passes_max: 0 })).toThrow();
    expect(w({ damage_per_pass: -1 })).toThrow();
    expect(w({ fire_chance: 1.2 })).toThrow();
    expect(w({ aircraft_speed_kt: 0 })).toThrow();
    expect(w({ orbit_radius_m: 0 })).toThrow();
    expect(w({ leave_s: 0 })).toThrow();
    expect(w({ quiet_s: -1 })).toThrow();
    expect(() => friendlyParamsFromData(REC, 0, 250, TS)).toThrow();
    expect(isFriendlyFireDataRecord({ params: { ...q, window_s: 'x' } })).toBe(false);
  });
});

describe('開始条件', () => {
  it('全部そろえば true。1 つでも欠ければ false', () => {
    expect(friendlyConditionsMet(okCheck(), P)).toBe(true);
    expect(friendlyConditionsMet({ ...okCheck(), fired: false }, P)).toBe(false);
    expect(friendlyConditionsMet({ ...okCheck(), underFire: true }, P)).toBe(false);
    expect(friendlyConditionsMet({ ...okCheck(), busy: true }, P)).toBe(false);
    expect(friendlyConditionsMet({ ...okCheck(), shallow: true }, P)).toBe(false);
    expect(friendlyConditionsMet({ ...okCheck(), blocked: true }, P)).toBe(false);
    expect(friendlyConditionsMet({ ...okCheck(), speedMps: 0 }, P)).toBe(false);
    expect(friendlyConditionsMet({ ...okCheck(), headingDeg: 270 }, P)).toBe(false); // 帰投地点に背を向けている
    expect(friendlyConditionsMet({ ...okCheck(), headingDeg: 0 }, P)).toBe(false); // 直角は「向かっていない」
  });
  it('範囲の境界: 輪の縁から 2,600 m は中、2,601 m は外', () => {
    expect(friendlyConditionsMet({ ...okCheck(), homeDx: 2850 }, P)).toBe(true);
    expect(friendlyConditionsMet({ ...okCheck(), homeDx: 2851 }, P)).toBe(false);
  });
  it('条件が quiet_s（2 秒）続いたら始まる。途切れたら数え直し。IDLE 以外は何もせず、終わった後は二度と始まらない', () => {
    const s = createFriendlyState();
    const c = okCheck();
    let t = 0;
    while (!stepFriendlyTrigger(s, c, P, DT)) t += DT;
    expect(t).toBeGreaterThan(2 - DT * 1.5);
    expect(t).toBeLessThan(2 + DT * 1.5);
    expect(s.phase).toBe(FF_CHALLENGE);
    expect(s.homeBearingDeg).toBeCloseTo(90, 9);
    const s2 = createFriendlyState();
    for (let i = 0; i < 90; i++) stepFriendlyTrigger(s2, c, P, DT); // 1.5 秒
    stepFriendlyTrigger(s2, { ...c, fired: false }, P, DT);
    expect(s2.quietS).toBe(0);
    for (let i = 0; i < 90; i++) expect(stepFriendlyTrigger(s2, c, P, DT)).toBe(false);
    expect(s2.phase).toBe(FF_IDLE);
    // 終わった後
    const s3 = started();
    identifyFriendly(s3, P);
    run(s3, P.leaveS + 1);
    expect(s3.phase).toBe(FF_DONE);
    for (let i = 0; i < 200; i++) expect(stepFriendlyTrigger(s3, c, P, DT)).toBe(false);
    expect(s3.phase).toBe(FF_DONE);
  });
});

describe('飛来と旋回の位置', () => {
  it('開始時は帰投地点の方角 635.8 m 先、1 秒で 250 m に着き、以後は半径 250 m を 88.4°/s で時計回り（機首は接線）', () => {
    const s = started();
    const q0 = pose(s);
    expect(dist(q0)).toBeCloseTo(250 + P.flightMps * P.approachS, 6);
    expect(bearing(q0)).toBeCloseTo(90, 6);
    expect(q0.headingDeg).toBeCloseTo(270, 6); // 向かってくる
    run(s, P.approachS);
    const q1 = pose(s);
    expect(dist(q1)).toBeCloseTo(250, 3);
    expect(bearing(q1)).toBeCloseTo(90, 1);
    run(s, 1);
    const q2 = pose(s);
    expect(dist(q2)).toBeCloseTo(250, 6);
    expect(bearing(q2)).toBeCloseTo(90 + P.orbitDegPerS, 1);
    expect(q2.headingDeg).toBeCloseTo((90 + P.orbitDegPerS + 90) % 360, 1);
    expect(q2.alpha).toBe(1);
  });
});

describe('押さなかったとき（1/60 秒刻み）', () => {
  it('5.648 秒と 10.944 秒に撃たれ（計 2 回）、真上では自艇のそば、航過の終点は反対側 250 m。再要求の旋回は終点から。14.09 秒で去り終える', () => {
    const s = started();
    let t = 0;
    const strikeTimes: number[] = [];
    let strafeDegAtFirst = NaN;
    let passEndChecked = false;
    while (s.phase !== FF_DONE && t < 20) {
      const before = s.phase;
      const ev = stepFriendly(s, P, DT);
      t += DT;
      if (ev & FF_EV_STRIKE) {
        strikeTimes.push(t);
        expect(dist(pose(s))).toBeLessThanOrEqual(6.5);
      }
      if (before === FF_CHALLENGE && s.phase === FF_STRAFE && Number.isNaN(strafeDegAtFirst)) strafeDegAtFirst = s.strafeDeg;
      if (before === FF_STRAFE && s.phase === FF_CHALLENGE && !passEndChecked) {
        passEndChecked = true;
        const q = pose(s);
        expect(dist(q)).toBeCloseTo(250, 0);
        expect(bearing(q)).toBeCloseTo((strafeDegAtFirst + 180) % 360, 0);
        expect(s.periodS).toBe(P.rechallengeS);
      }
    }
    expect(strikeTimes.length).toBe(2);
    expect(strikeTimes[0]).toBeCloseTo(5 + P.overpassS, 1);
    expect(strikeTimes[1]).toBeCloseTo(5 + P.passS + P.rechallengeS + P.overpassS, 1);
    expect(s.outcome).toBe(FF_OUT_GAVE_UP);
    expect(s.passes).toBe(2);
    expect(t).toBeCloseTo(5 + P.passS * 2 + P.rechallengeS + P.leaveS, 1);
    expect(Number.isNaN(s.reactS)).toBe(true);
  });
  it('0.25 秒刻みでも航過 1 回につき 1 発', () => {
    const s = started();
    expect(run(s, 20, 0.25)).toBe(2);
    expect(s.phase).toBe(FF_DONE);
  });
  it('去る間は帰投地点の向きに飛んで薄くなる', () => {
    const s = started();
    run(s, 20);
    const s2 = started();
    run(s2, 5 + P.passS * 2 + P.rechallengeS + 0.5);
    expect(s2.phase).toBe(FF_LEAVING);
    const q = pose(s2);
    expect(q.headingDeg).toBeCloseTo(90, 6);
    expect(q.alpha).toBeCloseTo(1 - s2.timerS / P.leaveS, 6);
    expect(q.dx).toBeGreaterThan(s2.leaveFromDx);
  });
});

describe('識別', () => {
  it('要求中 1.8 秒で押す → 識別、反応 1.8 秒（猶予 5）、撃たれず、去って終了', () => {
    const s = started();
    run(s, 1.8);
    expect(identifyFriendly(s, P)).toBe(true);
    expect(s.phase).toBe(FF_LEAVING);
    expect(s.outcome).toBe(FF_OUT_IDENTIFIED);
    expect(s.reactS).toBeCloseTo(1.8, 1);
    expect(s.reactPeriodS).toBe(5);
    expect(run(s, P.leaveS + 0.1)).toBe(0);
    expect(s.phase).toBe(FF_DONE);
    expect(s.passes).toBe(0);
  });
  it('航過の途中、真上に来る前（+0.3 秒）に押す → 撃たれない、反応 5.3 秒', () => {
    const s = started();
    expect(run(s, 5.3)).toBe(0);
    expect(s.phase).toBe(FF_STRAFE);
    expect(identifyFriendly(s, P)).toBe(true);
    expect(s.phase).toBe(FF_LEAVING);
    expect(s.outcome).toBe(FF_OUT_IDENTIFIED);
    expect(s.passes).toBe(0);
    expect(s.reactS).toBeCloseTo(5.3, 1);
    expect(run(s, 5)).toBe(0);
  });
  it('真上を過ぎてから（+0.7 秒）押す → 1 回撃たれるが 2 回目の要求は無く、航過を終えて去る', () => {
    const s = started();
    expect(run(s, 5.7)).toBe(1);
    expect(s.phase).toBe(FF_STRAFE);
    expect(identifyFriendly(s, P)).toBe(true);
    expect(s.pending).toBe(true);
    expect(s.phase).toBe(FF_STRAFE);
    expect(identifyFriendly(s, P)).toBe(false); // 二度目は無視
    expect(run(s, 10)).toBe(0);
    expect(s.outcome).toBe(FF_OUT_IDENTIFIED);
    expect(s.passes).toBe(1);
    expect(s.reactS).toBeCloseTo(5.7, 1);
    expect(s.phase).toBe(FF_DONE);
  });
  it('再要求（撃たれた後）の 2.0 秒で押す → 反応 2.0 秒（猶予 4）、撃たれたのは 1 回', () => {
    const s = started();
    expect(run(s, 5 + P.passS + 2.0)).toBe(1);
    expect(s.phase).toBe(FF_CHALLENGE);
    expect(identifyFriendly(s, P)).toBe(true);
    expect(s.reactS).toBeCloseTo(2.0, 1);
    expect(s.reactPeriodS).toBe(4);
    expect(s.passes).toBe(1);
    expect(s.outcome).toBe(FF_OUT_IDENTIFIED);
  });
  it('待機・去る途中・終了では何も起きない（false、状態そのまま）', () => {
    const idle = createFriendlyState();
    expect(identifyFriendly(idle, P)).toBe(false);
    expect(idle).toEqual(createFriendlyState());
    const s = started();
    identifyFriendly(s, P);
    const snap = { ...s };
    expect(identifyFriendly(s, P)).toBe(false);
    expect(s).toEqual(snap);
    run(s, 10);
    expect(s.phase).toBe(FF_DONE);
    expect(identifyFriendly(s, P)).toBe(false);
  });
  it('中断: 要求中なら撃たずに去る（CANCELLED）。待機中は何もしない', () => {
    const s = started();
    run(s, 3);
    cancelFriendly(s, P);
    expect(s.phase).toBe(FF_LEAVING);
    expect(s.outcome).toBe(FF_OUT_CANCELLED);
    expect(run(s, 10)).toBe(0);
    const idle = createFriendlyState();
    cancelFriendly(idle, P);
    expect(idle.phase).toBe(FF_IDLE);
    expect(idle.outcome).toBe(FF_OUT_NONE);
  });
});

describe('設計値の不変条件（data から）', () => {
  it('猶予は初見の反応の 2 倍以上、再要求は構えた反応の 2 倍以上', () => {
    expect(P.windowS).toBeGreaterThanOrEqual(2 * FAIR_FIRST_REACTION_S);
    expect(P.rechallengeS).toBeGreaterThanOrEqual(2 * FAIR_KNOWN_REACTION_S);
  });
  it('無傷なら撃たれ切っても沈まないが、127mm を 1 発受けた後に火災を放置すると沈む（「HP減、最悪撃沈」）', () => {
    const rawBoat: unknown = boats.boats.find((b) => b.id === 'us_elco80');
    if (!isBoatDamageDataRecord(rawBoat)) throw new Error('boat damage');
    const rawEnemy: unknown = enemies.enemies.find((e) => e.id === 'ijn_destroyer');
    if (!isEnemyGunneryDataRecord(rawEnemy)) throw new Error('enemy gunnery');
    const hp = rawBoat.hull_hp;
    const main = rawEnemy.guns[0]!.damage;
    expect(P.passesMax * P.hit.damage).toBeLessThan(hp);
    expect(hp - main - P.passesMax * P.hit.damage - rawBoat.damage.fire_dps * rawBoat.damage.fire_duration_s).toBeLessThanOrEqual(0);
  });
  it('交戦点 (3000,2100) から全速で直線で帰ると、最初の猶予は浅瀬の警告より前に終わる', () => {
    const m = MISSION;
    const boat = getBoatRecord(gameData, m.playerBoatId);
    const g = getGroundingParams(gameData);
    const vFull = ktToMps(boat.speed_max_kt) * TS;
    const rp = m.returnPoint;
    const dx = rp.x - 3000;
    const dy = rp.y - 2100;
    const distC = Math.hypot(dx, dy);
    const edge = distC - rp.radiusM;
    const hdg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    const toShallow = distanceToShallowsM(m.shallows, 3000, 2100, hdg);
    expect(toShallow).toBeLessThan(Infinity);
    // 猶予が終わる位置（縁からの距離）と、警告が始まる位置（浅瀬の縁 + 6 秒分）
    const windowEndEdge = Math.min(edge, P.triggerEdgeM) - P.quietS * vFull - P.windowS * vFull;
    const warnEdge = edge - toShallow + g.warnLookaheadS * vFull;
    expect(windowEndEdge).toBeGreaterThan(warnEdge);
  });
});
