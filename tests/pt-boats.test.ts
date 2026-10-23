// 敵の米PT の隊（v0.6.3。core/pt-boats・pt-state、spec §C.5〜C.9・§G.1）: 暗さ・段階と時間・撃たない条件・航過は同時に 1 隻・転舵で減る・見失う・夜明け・
// 的でない艇・決定性・乱数の数・止まらない・1 回の航過の上限・確保なし。v0.6.3 の直し: 航過は本当に向かってくるときだけ・2 番手は距離を取る。数値は jp_05 の getPtParams（data のまま）。
import { describe, expect, it } from 'vitest';
import { gameData, getBoatDamageParams, getBoatRecord, getPrototypeMission, getVisibilityParams } from '../src/config/game-data';
import { getPtParams } from '../src/config/pt-mission-data';
import { boatParamsFromData, clampToBounds, nextSpeedBand, stepBoat, type BoatInput, type BoatState, type SpeedStep } from '../src/core/boat-motion';
import { applyShellHit, createDamageState, type HitOutcome } from '../src/core/gunnery';
import { rollNight } from '../src/core/night';
import {
  PT_ALERT, PT_BREAK, PT_CHASE, PT_LEAVE, PT_OUT, PT_PASS, PT_PATROL, PT_RUN_IN, PT_SEED_OFFSET,
  createPtSection, createPtTelemetry, stepPtSection, threatIndex, type PtCheck, type PtEvents, type PtSection,
} from '../src/core/pt-boats';
import { ptParamsAtNight, type PtParams } from '../src/core/pt-data';
import { inDeadCone, tcpaFeltS } from '../src/core/pt-pass';
import { SeededRng } from '../src/core/rng';
import { bearingDeg } from '../src/core/ship-ai';
import { degToRad, ktToMps, wrapDeg180, wrapDeg360 } from '../src/core/units';
import { enemyDetectRangeM, playerVisRangeM } from '../src/core/visibility';

const DT = 1 / 60;
const TS = gameData.hitRateModel.world.time_scale;
const MISSION = getPrototypeMission(gameData, 'jp_05');
const P = getPtParams(gameData, MISSION, TS)!;
const VIS = getVisibilityParams(gameData, MISSION.moon, false);
const detectM = (band: SpeedStep): number => enemyDetectRangeM(P.baseDetectM, VIS.speedFactor[band], VIS, false);
const VIS2 = playerVisRangeM(VIS) ** 2;
const T14 = boatParamsFromData(getBoatRecord(gameData, MISSION.playerBoatId));
const HOME = MISSION.returnPoint;
const CRUISE01 = 20 / 31;
const FULL01 = 1;

function check(boat: BoatState, over: Partial<PtCheck> = {}): PtCheck {
  return { boat, boatHalfLengthM: T14.lengthM / 2, boatHalfBeamM: T14.beamM / 2, detectOpenM: detectM('cruise'), smokeFactor: 1, smoke: null, smokeParams: null, targetValid: true, visRange2: VIS2, dawn: false, timeS: 10, ...over };
}
function events(over: Partial<PtEvents> = {}): PtEvents {
  const none = (): void => {};
  return { onContact: none, onCommit: none, onFire: none, onImpact: none, onPassEnd: none, onLeave: none, onOut: none, ...over };
}

/** next() を数える乱数（乱数の消費の検査。air-strike.test と同じ） */
class CountingRng extends SeededRng {
  draws = 0;
  override next(): number {
    this.draws++;
    return super.next();
  }
}

/** 艇（T-14 の運動・速力帯で発見距離）と隊を固定ステップで回す。policy は入力を書く。帰投の輪に入ったら的でなくなり止まる */
interface Sim {
  q: PtSection;
  p: PtParams;
  c: PtCheck;
  boat: BoatState;
  input: BoatInput;
  band: SpeedStep;
  t: number;
  /** 方針の乱数（PT の系列とは別） */
  pol: SeededRng;
  rng: SeededRng;
  home: boolean;
  /** 方針の覚え（転舵の残り秒・針路） */
  turnLeftS: number;
  turnDeg: number;
}
interface SimOpts {
  seed: number;
  steps: number;
  policy: (s: Sim) => void;
  start?: { x: number; y: number; headingDeg: number };
  night?: boolean;
  visRange2?: number;
  dawnAtS?: number;
  ev?: (s: Sim) => Partial<PtEvents>;
  onStep?: (s: Sim) => void;
  rng?: SeededRng;
  /** 帰投の輪に入ったら止める（それ以上は何も起きない） */
  stopAtHome?: boolean;
}
function simulate(o: SimOpts): Sim {
  let p = P;
  if (o.night) {
    const n = rollNight(MISSION.night!, () => 0, o.seed, 1, 0);
    p = ptParamsAtNight(P, n.enemyOffsets[0]!.dx, n.enemyOffsets[0]!.dy, n.mirrored);
  }
  const st = o.start ?? MISSION.playerStart;
  const boat: BoatState = { x: st.x, y: st.y, headingDeg: st.headingDeg, speedMps: 0 };
  const s: Sim = { q: createPtSection(p, 24), p, c: check(boat, { visRange2: o.visRange2 ?? VIS2, timeS: 0 }), boat, input: { headingDeg: NaN, speed01: 0 }, band: 'stop', t: 0, pol: new SeededRng((o.seed * 7919 + 1000) >>> 0), rng: o.rng ?? new SeededRng((o.seed + PT_SEED_OFFSET) >>> 0), home: false, turnLeftS: 0, turnDeg: 0 };
  const ev = events(o.ev ? o.ev(s) : {});
  for (let k = 0; k < o.steps; k++) {
    if (!s.home) o.policy(s);
    else s.input.speed01 = 0;
    stepBoat(boat, s.input, T14, DT * TS);
    clampToBounds(boat, p.bounds, 15);
    s.band = nextSpeedBand(s.band, boat.speedMps, T14);
    s.home = s.home || (boat.x - HOME.x) ** 2 + (boat.y - HOME.y) ** 2 <= HOME.radiusM ** 2;
    s.c.detectOpenM = detectM(s.band);
    s.c.targetValid = !s.home;
    s.c.timeS = s.t;
    s.c.dawn = o.dawnAtS !== undefined && s.t >= o.dawnAtS;
    stepPtSection(s.q, p, s.c, s.rng, DT, DT * TS, ev);
    o.onStep?.(s);
    s.t += DT;
    if (o.stopAtHome && s.home) break;
  }
  return s;
}

/**
 * 航過を固めた瞬間の幾何（onCommit の中で。v0.6.3 の直し）: 今の針路と固めた針路の差 deg・艇が線の前か（> 0）・航過の速さで線を進むときの最接近までの体感秒とその距離 m・
 * 今の距離 m、直す前の判定（PT の今の速度どうし）の最接近までの体感秒
 */
function commitGeom(s: Sim, i: number, lockDeg: number): { headingErr: number; ahead: number; tcpa: number; missM: number; dM: number; oldTcpa: number } {
  const b = s.q.boats[i]!;
  const dx = s.boat.x - b.x;
  const dy = s.boat.y - b.y;
  const ph = degToRad(s.boat.headingDeg);
  const vpx = Math.sin(ph) * s.boat.speedMps;
  const vpy = -Math.cos(ph) * s.boat.speedMps;
  const r = degToRad(lockDeg);
  const rvx = vpx - Math.sin(r) * b.passMps;
  const rvy = vpy + Math.cos(r) * b.passMps;
  const tg = -(dx * rvx + dy * rvy) / (rvx * rvx + rvy * rvy);
  const h = degToRad(b.headingDeg);
  return {
    headingErr: Math.abs(wrapDeg180(b.headingDeg - lockDeg)), ahead: Math.sin(r) * dx - Math.cos(r) * dy, tcpa: tcpaFeltS(dx, dy, rvx, rvy, TS), missM: Math.hypot(dx + rvx * tg, dy + rvy * tg), dM: Math.hypot(dx, dy),
    oldTcpa: tcpaFeltS(dx, dy, vpx - Math.sin(h) * b.speedMps, vpy + Math.cos(h) * b.speedMps, TS),
  };
}
/** その幾何が直しの規則（向きの許容・艇が線の前・航過の速さで最接近まで commit_tcpa_s・その距離が有効射程の内・commit_max_m の内）を満たす */
const commitOk = (g: ReturnType<typeof commitGeom>): boolean => g.headingErr <= P.commitHeadingTolDeg + 1e-9 && g.ahead > 0 && g.tcpa <= P.commitTcpaS && g.missM <= P.gun.effectiveM && g.dM ** 2 <= P.commitMax2;

const toHome = (s: Sim): number => bearingDeg(s.boat.x, s.boat.y, HOME.x, HOME.y);
/** まっすぐ帰る（速さ speed01） */
const straight = (speed01: number) => (s: Sim): void => {
  s.input.headingDeg = toHome(s);
  s.input.speed01 = s.t < 1 ? 0 : speed01;
};
/** 赤い線（航過を固めた）で線から離れる直角へ 4 秒、その後は帰る（HUD の教え） */
const turnAway = (speed01: number) => (s: Sim): void => {
  straight(speed01)(s);
  if (s.turnLeftS > 0) {
    s.turnLeftS -= DT;
    s.input.headingDeg = s.turnDeg;
  }
};
const onCommitTurn = (s: Sim): Partial<PtEvents> => ({
  onCommit: (i, lockDeg) => {
    const b = s.q.boats[i]!;
    if (b.burst) return; // 追撃の連射は針路そのまま（HUD の教え。v0.6.3 実機 2 回目）
    const r = degToRad(lockDeg);
    const cross = Math.sin(r) * (s.boat.y - b.y) + Math.cos(r) * (s.boat.x - b.x);
    s.turnDeg = wrapDeg360(lockDeg + (cross >= 0 ? 90 : -90));
    s.turnLeftS = 4;
  },
});
/** 気まぐれ: 2 秒ごとに針路と速さ（停止〜全速）を変える */
const randomWalk = (s: Sim): void => {
  if (Number.isNaN(s.input.headingDeg) || s.pol.next() < DT / 2) {
    s.input.headingDeg = s.pol.next() * 360;
    s.input.speed01 = [0, 0.4, CRUISE01, FULL01][Math.floor(s.pol.next() * 4)]!;
  }
};
/** 全速で東へ逃げる（追いつけない突撃の打ち切りを通る） */
const fleeEast = (s: Sim): void => {
  s.input.headingDeg = 90;
  s.input.speed01 = FULL01;
};
/** 円を描いて PT の線の近くに居続ける（中心 (3000, 2100)・半径 700・速さ speed01） */
const circleAt = (speed01: number) => (s: Sim): void => {
  const out = bearingDeg(3000, 2100, s.boat.x, s.boat.y);
  const r = Math.hypot(s.boat.x - 3000, s.boat.y - 2100);
  s.input.headingDeg = wrapDeg360(out + 90 + (r > 700 ? 20 : -20));
  s.input.speed01 = speed01;
};
/** 巡航（20 kt）で円を描く */
const circle = circleAt(CRUISE01);
/** 追撃に入らない遅い艇（8 kt。chase.min_target_kt 10 kt 未満。v0.6.3 実機 2 回目） */
const SLOW01 = 8 / 31;

describe('米PT の隊（core/pt-boats、spec §G.1）', () => {
  it('作る: 出発点に哨戒で並ぶ（揺らぎなし (2000, 2200)/(2000, 2400) を東へ 8 kt）、確保は作るときだけ', () => {
    const q = createPtSection(P, 24);
    expect(q.boats.map((b) => [b.x, b.y, b.headingDeg, b.phase, b.wp])).toEqual([
      [2000, 2200, 90, PT_PATROL, 1],
      [2000, 2400, 90, PT_PATROL, 1],
    ]);
    expect(q.boats[0]!.speedMps).toBeCloseTo(ktToMps(8), 9);
    expect([q.shells.length, q.seen.length, q.owner, q.detected, q.firstDetectM, q.minWarnS]).toEqual([24, 2, -1, false, NaN, Infinity]);
    const t = createPtTelemetry();
    expect([t.enabled, t.threatPhase, t.dx, t.leaveDirJa]).toEqual([false, -1, NaN, '']);
  });

  it('1 暗さ（新月）: 静音 600 m → 610 m では見つからず 590 m で見つかる、巡航 1,200 m → 1,190 m で見つかる、出撃から 5 秒は見つけない', () => {
    expect(detectM('silent')).toBeCloseTo(600, 9);
    expect(detectM('cruise')).toBeCloseTo(1200, 9);
    const seen = (dist: number, band: SpeedStep, timeS: number): boolean => {
      const q = createPtSection(P, 24);
      const boat = { x: 2000 + dist, y: 2200, headingDeg: 0, speedMps: 0 };
      let gained = 0;
      stepPtSection(q, P, check(boat, { detectOpenM: detectM(band), timeS }), new SeededRng(1), DT, DT * TS, events({ onContact: (g) => (gained += g ? 1 : 0) }));
      expect(gained).toBe(q.detected ? 1 : 0);
      return q.detected;
    };
    expect([seen(610, 'silent', 10), seen(590, 'silent', 10), seen(1190, 'cruise', 10), seen(1210, 'cruise', 10)]).toEqual([false, true, true, false]);
    expect([seen(100, 'cruise', P.detectFromS - 0.01), seen(100, 'cruise', P.detectFromS)]).toEqual([false, true]);
    // 最初に見つけた距離（KPI）は 1 回だけ、生きている PT の最寄り
    const q = createPtSection(P, 24);
    stepPtSection(q, P, check({ x: 2590, y: 2200, headingDeg: 0, speedMps: 0 }, { detectOpenM: 600 }), new SeededRng(1), DT, DT * TS, events());
    expect(q.firstDetectM).toBeCloseTo(590, 6);
  });

  it(`2 段階と時間（遅い艇 8 kt）: 哨戒 → 警戒 → 1.5 秒で突撃（2 隻目は 4.5 秒）→ 見えていて最接近 5 秒前に航過 → 2.5 秒は撃たない → 離脱 → 突撃 → 航過 …（1 隻 ${P.maxPasses} 回。v0.6.3 実機 1 回目で 2 → 4）で去る → 東の縁の外`, () => {
    const seq: number[][] = [[], []];
    const at: number[][] = [[], []];
    const commits: { i: number; t: number; first: number }[] = [];
    const outX: number[] = [];
    let badCommit = 0;
    const s = simulate({
      seed: 1,
      // 1 隻 4 回（v0.6.3 実機 1 回目）で突撃の打ち切り（run_in_max_s）の無い道筋になる出発（前は 200 秒・東向き。東向きだと 1 隻目の突撃が 1 回打ち切られる）。
      // v0.6.3 実機 2 回目: 10 kt 以上で逃げる艇には離脱せず追撃する（2b）ので、この歩みは追撃に入らない 8 kt の艇で見る
      steps: 60 * 300,
      policy: circleAt(SLOW01),
      start: { x: 3000, y: 1400, headingDeg: 270 },
      ev: (s) => ({
        onCommit: (i, lockDeg) => {
          if (s.q.seen[i] !== 1 || !commitOk(commitGeom(s, i, lockDeg))) badCommit++;
          commits.push({ i, t: s.t, first: NaN });
        },
        onFire: () => {
          const c = commits[commits.length - 1]!;
          if (Number.isNaN(c.first)) c.first = s.t;
        },
        onOut: (i) => outX.push(s.q.boats[i]!.x),
      }),
      onStep: (s) => {
        for (let i = 0; i < 2; i++) {
          const l = seq[i]!;
          if (l[l.length - 1] !== s.q.boats[i]!.phase) {
            l.push(s.q.boats[i]!.phase);
            at[i]!.push(s.t);
          }
        }
      },
    });
    const walk = [PT_PATROL, PT_ALERT, PT_RUN_IN, PT_PASS, ...Array.from({ length: P.maxPasses - 1 }, () => [PT_BREAK, PT_RUN_IN, PT_PASS]).flat(), PT_LEAVE, PT_OUT];
    expect(seq).toEqual([walk, walk]);
    expect(at[0]![1]).toBe(at[1]![1]); // 隊で 1 つの発見 → 2 隻とも同じステップに警戒
    const alertS = [at[0]![2]! - at[0]![1]!, at[1]![2]! - at[1]![1]!];
    expect(alertS[0]).toBeGreaterThanOrEqual(P.reactionDelayS - 1e-9);
    expect(alertS[0]).toBeLessThanOrEqual(P.reactionDelayS + 2 * DT);
    expect(alertS[1]).toBeGreaterThanOrEqual(P.reactionDelayS + P.wingmanDelayS - 1e-9);
    expect(alertS[1]).toBeLessThanOrEqual(P.reactionDelayS + P.wingmanDelayS + 2 * DT);
    expect(commits.length).toBe(2 * P.maxPasses);
    expect(badCommit).toBe(0);
    for (const c of commits) if (!Number.isNaN(c.first)) expect(c.first - c.t).toBeGreaterThanOrEqual(P.openFireS - 1e-9);
    expect(commits.filter((c) => !Number.isNaN(c.first)).length).toBeGreaterThan(0);
    expect(s.q.minWarnS).toBeGreaterThanOrEqual(P.openFireS - 1e-9);
    expect([s.q.passes, s.q.out, ...s.q.boats.map((b) => b.passes)]).toEqual([2 * P.maxPasses, 2, P.maxPasses, P.maxPasses]);
    for (const x of outX) expect(x).toBeGreaterThan(P.bounds.width + P.boundsMarginM);
    expect(s.q.leftAtDawn).toBe(false);
  });

  it(`2b 段階と時間（逃げる艇 20 kt。v0.6.3 実機 2 回目）: 航過 → 離脱せずに追撃 → 予告つきの連射 → 追撃 …（1 隻 連射 ${P.maxBursts} 回）で去る → 東の縁の外。連射は 2 隻が代わる代わる・予告から 2.5 秒は撃たない・1 回 ${P.burstRounds} 発まで`, () => {
    const seq: number[][] = [[], []];
    const commits: { i: number; t: number; first: number; burst: boolean; rounds: number; end: number; otherLeft: boolean }[] = [];
    let badCommit = 0;
    const s = simulate({
      seed: 1,
      steps: 60 * 300,
      policy: circle,
      start: { x: 3000, y: 1400, headingDeg: 270 },
      ev: (s) => ({
        onCommit: (i, lockDeg) => {
          const b = s.q.boats[i]!;
          // 連射は追撃の位置から: この PT が見ていて commit_m の内、赤い線は PT → 艇
          const d2 = (b.x - s.boat.x) ** 2 + (b.y - s.boat.y) ** 2;
          if (s.q.seen[i] !== 1 || (b.burst ? d2 > P.chaseCommit2 || Math.abs(wrapDeg180(lockDeg - bearingDeg(b.x, b.y, s.boat.x, s.boat.y))) > 1e-9 : !commitOk(commitGeom(s, i, lockDeg)))) badCommit++;
          commits.push({ i, t: s.t, first: NaN, burst: b.burst, rounds: 0, end: NaN, otherLeft: s.q.boats[1 - i]!.phase >= PT_LEAVE });
        },
        onFire: () => {
          const c = commits[commits.length - 1]!;
          if (Number.isNaN(c.first)) c.first = s.t;
          c.rounds++;
        },
        onPassEnd: () => (commits[commits.length - 1]!.end = s.t),
      }),
      onStep: (s) => {
        for (let i = 0; i < 2; i++) {
          const b = s.q.boats[i]!;
          const l = seq[i]!;
          const ph = b.phase === PT_PASS && b.burst ? -PT_PASS : b.phase; // 連射は −PT_PASS
          if (l[l.length - 1] !== ph) l.push(ph);
        }
      },
    });
    const walk = [PT_PATROL, PT_ALERT, PT_RUN_IN, PT_PASS, PT_CHASE, ...Array.from({ length: P.maxBursts - 1 }, () => [-PT_PASS, PT_CHASE]).flat(), -PT_PASS, PT_LEAVE, PT_OUT];
    expect(seq).toEqual([walk, walk]);
    expect(badCommit).toBe(0);
    const bursts = commits.filter((c) => c.burst);
    expect([commits.length, bursts.length]).toEqual([2 + 2 * P.maxBursts, 2 * P.maxBursts]);
    for (const c of commits) if (!Number.isNaN(c.first)) expect(c.first - c.t).toBeGreaterThanOrEqual(P.openFireS - 1e-9);
    for (const c of bursts) expect(c.rounds).toBeLessThanOrEqual(P.burstRounds);
    expect(bursts.filter((c) => c.rounds > 0).length).toBe(2 * P.maxBursts); // 撃った連射だけ回数に数える
    // 代わる代わる: 同じ PT が続けて連射するのは、前の連射の終わりから gap_s + self_gap_s 経ったか相方が去った後だけ（seed 1 は相方の航過の間と、相方が去った後の 2 回）
    let alternations = 0;
    for (let k = 1; k < bursts.length; k++) {
      const a = bursts[k - 1]!;
      const b = bursts[k]!;
      if (b.i !== a.i) alternations++;
      else expect(b.otherLeft || b.t - a.end >= P.chaseGapS + P.chaseSelfGapS - 1e-9, `連射 ${k}`).toBe(true);
    }
    expect(alternations).toBeGreaterThanOrEqual(bursts.length - 3);
    expect([s.q.passes, s.q.bursts, s.q.firedBursts, s.q.out, ...s.q.boats.map((b) => b.passes), ...s.q.boats.map((b) => b.bursts)]).toEqual([2, 2 * P.maxBursts, 2 * P.maxBursts, 2, 1, 1, P.maxBursts, P.maxBursts]);
    expect(s.q.firedPasses - s.q.firedBursts).toBe(2);
    expect(s.q.leftAtDawn).toBe(false);
  });

  it(`3 撃たない: 航過・連射の外・予告から 2.5 秒の内・艇首尾の円錐（連射だけは艇首の円錐へも撃つ。艇尾へは撃たない）・60 m 以内・${P.gun.effectiveM} m より遠く・艇の視程の外からは撃たない。1 回の航過は ${P.roundsPerPass} 発・連射は ${P.burstRounds} 発まで`, () => {
    const fired = [0, 0];
    let bad = 0;
    let bowShots = 0;
    [VIS2, 300 ** 2].forEach((vis, v) => {
      for (let seed = 1; seed <= 12; seed++) {
        simulate({
          seed,
          steps: 3000,
          policy: randomWalk,
          start: { x: 2900, y: 1500, headingDeg: 180 },
          visRange2: vis,
          ev: (s) => ({
            onFire: (i, x, y) => {
              const b = s.q.boats[i]!;
              const dx = s.boat.x - x;
              const dy = s.boat.y - y;
              const d2 = dx * dx + dy * dy;
              const r = degToRad(b.headingDeg);
              const cone = inDeadCone(Math.sin(r), -Math.cos(r), dx, dy, d2, P.cosDead2);
              const bow = Math.sin(r) * dx - Math.cos(r) * dy > 0;
              const ok = b.phase === PT_PASS && s.q.owner === i && b.timerS >= P.openFireS && d2 >= P.minRange2 && d2 <= P.gun.effectiveM ** 2 && d2 <= vis && (!cone || (b.burst && bow)) && b.firedThisPass <= (b.burst ? P.burstRounds : P.roundsPerPass) && b.roundsLeft >= 0;
              if (!ok) bad++;
              if (b.burst && cone) bowShots++;
              fired[v]!++;
            },
          }),
        });
      }
    });
    expect(bad).toBe(0);
    expect(fired[0]).toBeGreaterThan(50);
    expect(fired[1]).toBeGreaterThan(10);
    expect(bowShots).toBeGreaterThan(0); // 連射の艇首の円錐への射撃も通る（seed 1〜12 で 69 発）
  });

  it('4 航過・連射は同時に 1 隻: 2 隻・気まぐれな艇・20 夜 × 3,000 ステップで、航過中（連射中）は owner の 1 隻だけ、航過の終わりから次の固めまで pass_gap_s 以上（連射の終わりからは chase.gap_s 以上）', () => {
    let commitsTotal = 0;
    let burstsTotal = 0;
    let bad = 0;
    let shortGap = 0;
    for (let seed = 1; seed <= 20; seed++) {
      let lastEnd = -Infinity;
      let lastGap = 0;
      simulate({
        seed,
        steps: 3000,
        policy: randomWalk,
        start: { x: 2900, y: 1500, headingDeg: 180 },
        ev: (s) => ({
          onCommit: (i) => {
            if (s.t - lastEnd < lastGap - 1e-6) shortGap++;
            commitsTotal++;
            if (s.q.boats[i]!.burst) burstsTotal++;
          },
          onPassEnd: (i) => {
            lastEnd = s.t;
            lastGap = s.q.boats[i]!.burst ? P.chaseGapS : P.passGapS; // 連射の終わりでは burst がまだ立っている
          },
        }),
        onStep: (s) => {
          let n = 0;
          for (const b of s.q.boats) if (b.phase === PT_PASS) n++;
          if (n > 1 || (n === 1 && s.q.boats[s.q.owner]?.phase !== PT_PASS) || (n === 0 && s.q.owner !== -1)) bad++;
        },
      });
    }
    expect([bad, shortGap]).toEqual([0, 0]);
    expect(commitsTotal).toBeGreaterThan(20);
    expect(burstsTotal).toBeGreaterThan(5);
  });

  // v0.6.3 実機 2 回目（有効射程 450 m・航過は危ない間だけ・機関損傷 0.15）: 巡航のまま 4 秒の転舵は 0.64 倍（前は 0.5 倍未満）。HUD は「全速で転舵」に戻した（全速で 4 秒・その後も全速は 0.1 倍）。
  // 追撃（逃げる艇に離脱せず、後ろから予告つきの連射。連射は針路そのまま）を入れて、航過の転舵だけでは 0.81 倍・全速で 0.51 倍（seed 1〜200。「逃げるだけなら簡単」への答え）
  it('5 転舵で被弾が減る: 200 夜（今夜の揺らぎ込み）、赤い線（航過）で線から離れる直角へ 4 秒の命中は、まっすぐ巡航で帰るより少ない（巡航で 0.9 倍未満・全速で 0.6 倍未満）', () => {
    let straightHits = 0;
    let turnHits = 0;
    let fullHits = 0;
    for (let seed = 1; seed <= 200; seed++) {
      straightHits += simulate({ seed, steps: 60 * 170, night: true, policy: straight(CRUISE01), stopAtHome: true }).q.hits;
      turnHits += simulate({ seed, steps: 60 * 170, night: true, policy: turnAway(CRUISE01), ev: onCommitTurn, stopAtHome: true }).q.hits;
      fullHits += simulate({ seed, steps: 60 * 170, night: true, policy: turnAway(FULL01), ev: onCommitTurn, stopAtHome: true }).q.hits;
    }
    expect(straightHits).toBeGreaterThan(200);
    expect(turnHits).toBeLessThan(0.9 * straightHits);
    expect(fullHits).toBeLessThan(0.6 * straightHits);
    // 1 ファイルずつなら約 4.8 秒で、vitest の既定 5 秒の際（v0.6.4 の模擬の帯 7 ファイルと並ぶ npm test で 5,166 ms の打ち切りが出た）。ほかの模擬の it と同じ 60 秒に
  }, 60_000);

  it('6 見失う: 航過の後に艇が止まり 700 m 先（停止 480 m では見つからない）→ 8 秒で隊は見失って哨戒へ。航過の数は変わらない。見えない間の突撃は推した位置（全速で北へ）へ向かい、本当の位置には寄らない', () => {
    const L = { x: 3000, y: 2000 };
    const q = createPtSection(P, 24);
    Object.assign(q, { detected: true, holdLeftS: P.detectHoldS, lkX: L.x, lkY: L.y, lkVx: 0, lkVy: -ktToMps(31), lkAgeS: 0 });
    Object.assign(q.boats[0]!, { x: L.x + 700, y: L.y, headingDeg: 90, lockDeg: 90, speedMps: P.runInMps, phase: PT_BREAK, passes: 1, timerS: 0 });
    Object.assign(q.boats[1]!, { x: L.x - 700, y: L.y, headingDeg: 270, lockDeg: 270, speedMps: P.runInMps, phase: PT_BREAK, passes: 1, timerS: 0 });
    const c = check({ x: L.x, y: L.y, headingDeg: 0, speedMps: 0 }, { detectOpenM: detectM('stop') });
    const rng = new CountingRng(18);
    const contacts: boolean[] = [];
    let lostAt = NaN;
    let minD2 = Infinity;
    let sawRunIn = 0;
    let y4 = NaN;
    for (let k = 0; k < 60 * 9; k++) {
      c.timeS = 10 + k * DT;
      stepPtSection(q, P, c, rng, DT, DT * TS, events({ onContact: (g) => { contacts.push(g); if (!g) lostAt = (k + 1) * DT; } }));
      for (const b of q.boats) {
        minD2 = Math.min(minD2, (b.x - L.x) ** 2 + (b.y - L.y) ** 2);
        if (b.phase === PT_RUN_IN) sawRunIn++;
      }
      if (k === 60 * 4) y4 = Math.max(q.boats[0]!.y, q.boats[1]!.y);
    }
    expect(contacts).toEqual([false]);
    expect(lostAt).toBeCloseTo(P.detectHoldS, 1);
    expect([q.detected, q.lostContacts, q.passes, ...q.boats.map((b) => b.passes)]).toEqual([false, 1, 0, 1, 1]);
    expect(q.boats.map((b) => b.phase)).toEqual([PT_PATROL, PT_PATROL]);
    expect(sawRunIn).toBeGreaterThan(0);
    expect(y4).toBeLessThan(L.y - 150);
    expect(Math.sqrt(minD2)).toBeGreaterThan(detectM('stop'));
    expect(rng.draws).toBe(0);
  });

  /** 航過中で撃てる形（PT0 は東へ・艇は真横 200 m・予告から 3 秒）、PT1 は突撃中 */
  function passing(over: Partial<PtCheck> = {}): { q: PtSection; c: PtCheck } {
    const q = createPtSection(P, 24);
    Object.assign(q, { detected: true, holdLeftS: P.detectHoldS, lkX: 3000, lkY: 2200, owner: 0, commitAtS: 7 });
    Object.assign(q.boats[0]!, { x: 3000, y: 2000, headingDeg: 90, lockDeg: 90, passMps: P.passMinMps, speedMps: P.passMinMps, phase: PT_PASS, timerS: 3, roundsLeft: P.roundsPerPass });
    Object.assign(q.boats[1]!, { x: 2500, y: 2600, phase: PT_RUN_IN, speedMps: P.runInMps });
    return { q, c: check({ x: 3000, y: 2200, headingDeg: 0, speedMps: 0 }, over) };
  }

  it('7 夜明け: 去っていない PT はそのステップで去る（航過中は数えず owner −1）。乱数は引かず、その後も撃たずに東の縁の外へ', () => {
    const a = passing();
    const ra = new CountingRng(18);
    stepPtSection(a.q, P, a.c, ra, DT, DT * TS, events());
    expect([a.q.shots, ra.draws]).toEqual([1, 2]); // 夜明け前なら同じ形で撃つ
    const b = passing({ dawn: true });
    const rb = new CountingRng(18);
    const log: number[] = [];
    const ev = events({ onLeave: (i) => log.push(i), onFire: () => log.push(-1), onPassEnd: () => log.push(-2) });
    stepPtSection(b.q, P, b.c, rb, DT, DT * TS, ev);
    expect(log).toEqual([0, 1]);
    expect(b.q.boats.map((x) => x.phase)).toEqual([PT_LEAVE, PT_LEAVE]);
    expect([b.q.owner, b.q.passes, b.q.passSeq, b.q.shots, rb.draws, b.q.leftAtDawn]).toEqual([-1, 0, 0, 0, 0, true]);
    for (let k = 0; k < 60 * 60; k++) stepPtSection(b.q, P, b.c, rb, DT, DT * TS, ev);
    expect(log).toEqual([0, 1]);
    expect([rb.draws, b.q.out, ...b.q.boats.map((x) => x.phase)]).toEqual([0, 2, PT_OUT, PT_OUT]);
    for (const x of b.q.boats) expect(x.x).toBeGreaterThan(P.bounds.width);
  });

  it('8 的でない艇（沈み始め・帰投の輪の中）: 見つけない・撃たない・当たらない（PT は動き続ける）', () => {
    const q = createPtSection(P, 24);
    const c = check({ x: 2100, y: 2000, headingDeg: 0, speedMps: 0 }, { targetValid: false });
    const rng = new CountingRng(18);
    for (let k = 0; k < 600; k++) stepPtSection(q, P, c, rng, DT, DT * TS, events());
    expect([q.detected, q.shots, q.hits, rng.draws, q.closest2, q.firstDetectM]).toEqual([false, 0, 0, 0, Infinity, NaN]);
    expect(q.boats[0]!.x).toBeGreaterThan(2100);
    const b = passing({ targetValid: false });
    Object.assign(b.q.shells[0]!, { active: true, x: 3000, y: 2200, vx: 0, vy: 0, leftS: 0.001, impactX: 3000, impactY: 2200, gunIndex: 0 });
    const impacts: boolean[] = [];
    for (let k = 0; k < 60; k++) stepPtSection(b.q, P, b.c, rng, DT, DT * TS, events({ onImpact: (_x, _y, hit) => impacts.push(hit) }));
    expect(impacts).toEqual([false]);
    expect([b.q.shots, b.q.hits, rng.draws]).toEqual([0, 0, 0]);
  });

  it('9 決定性: 同じ seed は同じ発射と着弾の列、違う seed は違う', () => {
    const log = (rngSeed: number): number[] => {
      const out: number[] = [];
      simulate({ seed: 5, steps: 60 * 120, night: true, policy: straight(CRUISE01), stopAtHome: true, rng: new SeededRng(rngSeed), ev: () => ({ onFire: (i, x, y) => out.push(i, x, y), onImpact: (x, y, hit) => out.push(x, y, hit ? 1 : 0) }) });
      return out;
    };
    const a = log(23);
    expect(a.length).toBeGreaterThan(0);
    expect(log(23)).toEqual(a);
    expect(log(24)).not.toEqual(a);
  });

  it('10 乱数の数 = 2 × 発射 + 命中の火災・機関（呼ぶ側が同じ seed+18 の系列で引く）。AI は引かない', () => {
    const dp = getBoatDamageParams(gameData, MISSION.playerBoatId);
    for (const seed of [1, 2, 3, 4]) {
      const rng = new CountingRng((seed + PT_SEED_OFFSET) >>> 0);
      const dmg = createDamageState(dp);
      const out: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
      let hitDraws = 0;
      let hits = 0;
      const s = simulate({
        seed,
        steps: 60 * 120,
        night: true,
        policy: straight(CRUISE01),
        rng,
        ev: () => ({
          onImpact: (_x, _y, hit) => {
            if (!hit) return;
            hits++;
            const before = rng.draws;
            applyShellHit(dmg, P.hit, dp, rng, out);
            hitDraws += rng.draws - before;
            if (dmg.hp <= 0) dmg.hp = dp.maxHp; // 沈めずに続ける（引く数の形だけを見る）
          },
        }),
      });
      expect(s.q.shots).toBeGreaterThan(0);
      expect(hits).toBe(s.q.hits);
      expect(rng.draws).toBe(2 * s.q.shots + hitDraws);
    }
  });

  it('11 止まらない: 各段階は上限の中で抜ける（警戒 ≤ 1.5 + 3 秒・突撃 ≤ 25 秒（他の PT の航過を待つ間は数えない）・航過 ≤ 8 秒・離脱 ≤ 8 秒）。逃げる艇には突撃を打ち切る', () => {
    const maxS = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    let runInCut = 0;
    let maxRunInTimer = 0;
    let heldS = 0;
    const runs: SimOpts[] = [{ seed: 1, steps: 60 * 90, policy: fleeEast, start: { x: 3000, y: 1500, headingDeg: 90 } }];
    for (let seed = 1; seed <= 10; seed++) runs.push({ seed, steps: 60 * 60, policy: randomWalk, start: { x: 2900, y: 1500, headingDeg: 180 } });
    for (let seed = 1; seed <= 10; seed++) runs.push({ seed, steps: 60 * 120, night: true, policy: straight(CRUISE01) });
    for (const o of runs) {
      const since = [0, 0];
      const held = [0, 0];
      const phase = [PT_PATROL, PT_PATROL];
      simulate({
        ...o,
        onStep: (s) => {
          for (let i = 0; i < 2; i++) {
            const ph = s.q.boats[i]!.phase;
            if (ph === PT_RUN_IN) {
              maxRunInTimer = Math.max(maxRunInTimer, s.q.boats[i]!.timerS);
              if (s.q.owner >= 0 || s.q.gapLeftS > 0) held[i]! += DT;
            }
            if (ph === phase[i]) continue;
            // 突撃は待った秒を除いて数える（待つ秒は他の PT の航過 ≤ 8 秒 + 間隔 2.5 秒で尽きる）
            const waited = phase[i] === PT_RUN_IN ? held[i]! : 0;
            heldS = Math.max(heldS, waited);
            held[i] = 0;
            maxS[phase[i]!] = Math.max(maxS[phase[i]!]!, s.t - since[i]! - waited);
            if (phase[i] === PT_RUN_IN && ph === PT_BREAK) runInCut++;
            phase[i] = ph;
            since[i] = s.t;
          }
        },
      });
    }
    expect(maxS[PT_ALERT]).toBeLessThanOrEqual(P.reactionDelayS + P.wingmanDelayS + 2 * DT);
    expect(maxS[PT_RUN_IN]).toBeLessThanOrEqual(P.runInMaxS + 4 * DT);
    expect(maxRunInTimer).toBeLessThanOrEqual(P.runInMaxS + DT);
    expect(heldS).toBeGreaterThan(0);
    expect(maxS[PT_PASS]).toBeLessThanOrEqual(P.passMaxS + 2 * DT);
    expect(maxS[PT_BREAK]).toBeLessThanOrEqual(P.breakMaxS + 2 * DT);
    expect(runInCut).toBeGreaterThan(0);
  });

  it(`12 1 回の航過の砲の被害は ${P.roundsPerPass * P.hit.damage} 以下（${P.roundsPerPass} 発 × ${P.hit.damage} < T-14 の HP 50）: 500 回以上の航過で、後から落ちた弾も含めて`, () => {
    let passes = 0;
    let worstHits = 0;
    let worstRounds = 0;
    for (let seed = 1; passes < 500 && seed <= 400; seed++) {
      let seq = 0;
      const rounds = [0, 0];
      const s = simulate({
        seed,
        steps: 60 * 100,
        night: true,
        policy: seed % 3 === 0 ? straight(CRUISE01) : circle,
        start: seed % 3 === 0 ? undefined : { x: 3000, y: 1400, headingDeg: 90 },
        ev: () => ({
          onCommit: (i) => (rounds[i] = 0),
          onFire: (i) => (worstRounds = Math.max(worstRounds, ++rounds[i]!)),
        }),
        onStep: (s) => {
          // 通し番号はその航過の弾がみな落ちてから増える（v0.6.3 レビュー）ので、増えたときの命中がその航過の確定の値
          if (s.q.passSeq !== seq) {
            seq = s.q.passSeq;
            worstHits = Math.max(worstHits, s.q.lastPassHits);
          }
        },
      });
      if (seq > 0) worstHits = Math.max(worstHits, s.q.lastPassHits);
      passes += s.q.passes;
    }
    expect(passes).toBeGreaterThanOrEqual(500);
    expect(worstRounds).toBeLessThanOrEqual(P.roundsPerPass);
    expect(worstHits).toBeGreaterThan(0);
    expect(worstHits * P.hit.damage).toBeLessThanOrEqual(P.roundsPerPass * P.hit.damage);
    expect(P.roundsPerPass * P.hit.damage).toBeLessThan(getBoatDamageParams(gameData, MISSION.playerBoatId).maxHp);
  });

  it('13 確保なし: 10,000 ステップ回しても隊・弾・見た印・待つ印（v0.6.3 実機 1 回目）・狙いの点の配列と各要素の参照は同じ', () => {
    let refs: unknown[] = [];
    const s = simulate({
      seed: 4,
      steps: 10000,
      policy: randomWalk,
      start: { x: 2900, y: 1500, headingDeg: 180 },
      onStep: (s) => {
        if (refs.length === 0) refs = [s.q.boats, s.q.boats[0], s.q.boats[1], s.q.shells, ...s.q.shells, s.q.seen, s.q.held, s.q.aim];
      },
    });
    const now = [s.q.boats, s.q.boats[0], s.q.boats[1], s.q.shells, ...s.q.shells, s.q.seen, s.q.held, s.q.aim];
    expect(now.length).toBe(refs.length);
    for (let i = 0; i < now.length; i++) expect(now[i]).toBe(refs[i]);
    expect(s.q.shots).toBeGreaterThan(0);
  });

  it('14 航過は本当に向かってくるときだけ（v0.6.3 の直し）: 固めた瞬間はいつも 針路の差 ≤ 30°・艇が線の前・航過の速さで最接近まで 5 秒以内・その距離 ≤ 有効射程（450 m）。連射は追撃から commit_m の内で PT → 艇の線。2 ステップで終わる航過は無く、まっすぐ帰る艇への航過はほとんど撃つ', () => {
    let commits = 0;
    let burstCommits = 0;
    let bad = 0;
    let instant = 0;
    let straightPasses = 0;
    let straightUnfired = 0;
    const runs: [SimOpts['policy'], boolean, ((s: Sim) => Partial<PtEvents>) | undefined][] = [[straight(CRUISE01), true, undefined], [straight(14 / 31), true, undefined], [turnAway(CRUISE01), true, onCommitTurn], [randomWalk, false, undefined], [circle, false, undefined]];
    runs.forEach(([policy, night, extra], k) => {
      for (let seed = 1; seed <= 30; seed++) {
        const commitAt = [0, 0];
        simulate({
          seed, steps: night ? 60 * 170 : 3000, night, policy, stopAtHome: night, start: night ? undefined : { x: 2900, y: 1500, headingDeg: 180 },
          ev: (s) => {
            const turn = extra?.(s);
            return {
              onCommit: (i, lockDeg, dodge) => {
                turn?.onCommit?.(i, lockDeg, dodge);
                commits++;
                commitAt[i] = s.t;
                const b = s.q.boats[i]!;
                if (b.burst) {
                  // 連射（v0.6.3 実機 2 回目）: 追撃中にこの PT が見ていて commit_m の内、赤い線は PT → 艇
                  burstCommits++;
                  if (s.q.seen[i] !== 1 || (b.x - s.boat.x) ** 2 + (b.y - s.boat.y) ** 2 > P.chaseCommit2 || Math.abs(wrapDeg180(lockDeg - bearingDeg(b.x, b.y, s.boat.x, s.boat.y))) > 1e-9) bad++;
                } else if (s.q.seen[i] !== 1 || !commitOk(commitGeom(s, i, lockDeg))) bad++;
              },
              onPassEnd: (i, fired) => {
                if (s.t - commitAt[i]! <= 2 * DT + 1e-9) instant++;
                if (k < 2 && !s.q.boats[i]!.burst) {
                  straightPasses++;
                  if (!fired) straightUnfired++;
                }
              },
            };
          },
        });
      }
    });
    // まっすぐ帰る艇への航過はみな撃つ（v0.6.3 レビューの直し）。実機 2 回目のレビュー F6: 追撃の前の作りで seed 26 に 1 回あった撃たない反航の航過は、追撃が入ってもう起きない
    // （速い艇は追われる）ので 2% の許しを外して厳しく戻した。また起きたら許しではなく spec r2 §J.1-7 の外れとして書く
    expect([bad, instant, straightUnfired]).toEqual([0, 0, 0]);
    expect(commits - burstCommits).toBeGreaterThan(250); // 航過 330・連射 511（まっすぐ帰る艇への航過 100）
    expect(burstCommits).toBeGreaterThan(300);
    expect(straightPasses).toBeGreaterThan(80);
  });

  it('15 離脱の直後に背を向けたままの PT は固めない: 東へ 35 kt で走る PT に艇が北から寄る（直す前は今の速度どうしの最接近 2.4 秒・500 m で固め、1 ステップで航過が終わった）→ 向き直ってから固め、撃つ', () => {
    const q = createPtSection(P, 24);
    const boat: BoatState = { x: 3000, y: 1500, headingDeg: 180, speedMps: ktToMps(20) };
    Object.assign(q, { detected: true, holdLeftS: P.detectHoldS, lkX: boat.x, lkY: boat.y, lkVx: 0, lkVy: boat.speedMps });
    Object.assign(q.boats[0]!, { x: 3000, y: 2000, headingDeg: 90, speedMps: P.runInMps, phase: PT_RUN_IN, side: 1, timerS: 0 });
    q.boats[1]!.phase = PT_OUT;
    const c = check(boat, { detectOpenM: detectM('cruise') });
    // 直す前の規則なら固めていた形（PT の今の速度で最接近まで 5 秒以内・900 m 以内）
    expect(tcpaFeltS(0, -500, -P.runInMps, boat.speedMps, TS)).toBeLessThan(P.commitTcpaS);
    let k = 0;
    let commitK = -1;
    let commitErr = NaN;
    let endK = -1;
    let fired = 0;
    const ev = events({
      onCommit: (_i, lockDeg) => {
        commitErr = Math.abs(wrapDeg180(q.boats[0]!.headingDeg - lockDeg));
      },
      onPassEnd: () => {
        if (endK < 0) endK = k;
      },
      onFire: () => fired++,
    });
    for (; k < 60 * 12; k++) {
      boat.y += boat.speedMps * DT * TS;
      c.timeS = 10 + k * DT;
      stepPtSection(q, P, c, new SeededRng(1), DT, DT * TS, ev);
      if (commitK < 0 && q.boats[0]!.phase === PT_PASS) commitK = k;
      if (k === 0) expect(q.boats[0]!.phase).toBe(PT_RUN_IN); // 最初のステップでは固めない（針路の差 約 90°）
      if (endK >= 0) break;
    }
    expect(commitK).toBeGreaterThan(0);
    expect(commitErr).toBeLessThanOrEqual(P.commitHeadingTolDeg);
    expect((endK - commitK) * DT).toBeGreaterThan(P.openFireS);
    expect(fired).toBeGreaterThan(0);
  });

  it('16 2 番手は距離を取る（v0.6.3 の直し）: 他の PT の航過中と次の航過までの間、待ち始めに hold_off_m の外にいた PT は（旋回半径 × 2 の惰性を除いて）その内へ入らず、内にいた PT は向き直るまでに離れ始める。直す前は艇の 16〜27 m まで寄った', () => {
    const holdM = Math.sqrt(P.holdOff2);
    const turnR = P.runInMps / degToRad(P.turnRateDegS); // 突撃の速さの旋回半径 m（約 43 m）
    const turnAroundS = 180 / P.turnRateDegS / TS; // 180° 向き直る体感秒（1.5 秒）
    const r = { outside: 0, outsideMin: Infinity, inside: 0, insideWorstDrop: 0, insideOpenS: 0, overallMin: Infinity };
    let fromChase = 0;
    const runs: [SimOpts['policy'], ((s: Sim) => Partial<PtEvents>) | undefined][] = [[straight(CRUISE01), undefined], [straight(14 / 31), undefined], [turnAway(CRUISE01), onCommitTurn]];
    for (const [policy, extra] of runs) {
      for (let seed = 1; seed <= 40; seed++) {
        const ep: ({ d0: number; min: number; t0: number; openAt: number; prev: number; from: number } | null)[] = [null, null];
        const was = [PT_PATROL, PT_PATROL];
        simulate({
          seed, steps: 60 * 170, night: true, policy, stopAtHome: true, ev: extra,
          onStep: (s) => {
            for (let i = 0; i < 2; i++) {
              const b = s.q.boats[i]!;
              const d = Math.hypot(b.x - s.boat.x, b.y - s.boat.y);
              const from = was[i]!;
              was[i] = b.phase;
              if (b.phase === PT_RUN_IN && (s.q.owner >= 0 || s.q.gapLeftS > 0) && s.c.targetValid) {
                const e = (ep[i] ??= { d0: d, min: d, t0: s.t, openAt: NaN, prev: d, from });
                e.min = Math.min(e.min, d);
                if (Number.isNaN(e.openAt) && d > e.prev) e.openAt = s.t;
                e.prev = d;
                continue;
              }
              const e = ep[i];
              if (!e) continue;
              // 追撃から突撃へ戻ってすぐ待つ PT（逃げる艇への航過の終わりに艇首の前にいて、追撃を 1 ステップで抜けた。v0.6.3 実機 2 回目）は待ち始めがもう近い（約 65 m）。
              // 内・外の規則（寄らない・向き直るまでに離れ始める）は同じに見て、最接近の下限だけは見ない
              if (e.from === PT_CHASE) fromChase++;
              else r.overallMin = Math.min(r.overallMin, e.min);
              if (e.d0 >= holdM) {
                r.outside++;
                r.outsideMin = Math.min(r.outsideMin, e.min);
              } else {
                r.inside++;
                r.insideWorstDrop = Math.max(r.insideWorstDrop, e.d0 - e.min);
                // 向き直る秒より早く待ちが解けた（離れ始める前に終わった）のは数えない
                r.insideOpenS = Math.max(r.insideOpenS, Number.isNaN(e.openAt) ? (s.t - e.t0 <= turnAroundS + DT ? 0 : Infinity) : e.openAt - e.t0);
              }
              ep[i] = null;
            }
          },
        });
      }
    }
    expect(r.outside).toBeGreaterThan(100);
    expect(r.inside).toBeGreaterThan(10);
    expect(fromChase).toBeGreaterThan(0);
    expect(r.outsideMin).toBeGreaterThanOrEqual(holdM - 2 * turnR);
    expect(r.insideWorstDrop).toBeLessThanOrEqual(2 * turnR);
    expect(r.insideOpenS).toBeLessThanOrEqual(turnAroundS + DT);
    expect(r.overallMin).toBeGreaterThan(2 * P.spriteLengthUnits); // PT の絵 2 隻ぶん（約 98 m）より遠い＝艇の絵に重ならない（直す前は 16〜27 m。追撃から戻った PT は除く）
  });

  it('航過の後に落ちた弾は撃った PT の最後の航過に数える（無傷の航過から外す。通し番号はその弾が落ちてから増えるので、HUD の「かわした！」は後から変わらない。tests/pt-boats-review）', () => {
    const q = createPtSection(P, 24);
    Object.assign(q, { lastPassBoat: 0, lastPassFired: true, lastPassHits: 0, cleanPasses: 1, firedPasses: 1, passes: 1, passSeq: 1 });
    Object.assign(q.shells[0]!, { active: true, x: 3000, y: 2200, vx: 0, vy: 0, leftS: 0.001, impactX: 3000, impactY: 2200, gunIndex: 0 });
    Object.assign(q.shells[1]!, { active: true, x: 3000, y: 2200, vx: 0, vy: 0, leftS: 0.001, impactX: 3000, impactY: 2200, gunIndex: 1 });
    stepPtSection(q, P, check({ x: 3000, y: 2200, headingDeg: 0, speedMps: 0 }, { detectOpenM: 0 }), new SeededRng(1), DT, DT * TS, events());
    expect([q.hits, q.lastPassHits, q.cleanPasses, q.passHits]).toEqual([2, 1, 0, 0]); // PT1 の弾は PT0 の航過に数えない
  });

  it('脅威の PT（threatIndex）: 航過中 → 警戒・突撃の最寄り → 離脱の最寄り → 哨戒の最寄り。去っていない PT が無ければ −1', () => {
    const q = createPtSection(P, 24); // PT0 (2000, 2200)・PT1 (2000, 2400)
    expect(threatIndex(q, 2000, 2450)).toBe(1);
    q.boats[0]!.phase = PT_BREAK;
    expect(threatIndex(q, 2000, 2450)).toBe(0);
    q.boats[1]!.phase = PT_RUN_IN;
    expect(threatIndex(q, 2000, 2100)).toBe(1);
    q.boats[0]!.phase = PT_ALERT;
    expect(threatIndex(q, 2000, 2100)).toBe(0);
    q.boats[1]!.phase = PT_PASS;
    q.owner = 1;
    expect(threatIndex(q, 2000, 2100)).toBe(1);
    q.owner = -1;
    q.boats[0]!.phase = PT_LEAVE;
    q.boats[1]!.phase = PT_OUT;
    expect(threatIndex(q, 0, 0)).toBe(-1);
  });
});
