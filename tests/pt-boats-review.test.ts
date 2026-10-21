// 米PT の隊（core/pt-boats）の v0.6.3 レビューの直し: 縁へ逃げても航過は撃つ（縁は絵の半長で終え、撃つか open_fire_s 経った航過だけ数える）・
// みな去れば捉えるのをやめる（見失わせたに数えない）・待つ PT は海域の外を回らない・突撃の打ち切りの離脱は離れる・夜明けで切れた撃った航過も数える・
// 航過の通し番号は撃った弾がみな落ちてから。数値は jp_05 の getPtParams（data のまま）。tests/pt-boats.test.ts の続き（1 ファイルが長くなりすぎないよう分けた）。
import { describe, expect, it } from 'vitest';
import { gameData, getBoatRecord, getPrototypeMission, getVisibilityParams } from '../src/config/game-data';
import { getPtParams } from '../src/config/pt-mission-data';
import { boatParamsFromData, clampToBounds, nextSpeedBand, stepBoat, type BoatInput, type BoatState, type SpeedStep } from '../src/core/boat-motion';
import { rollNight } from '../src/core/night';
import {
  PT_BREAK, PT_LEAVE, PT_OUT, PT_PASS, PT_PATROL, PT_RUN_IN, PT_SEED_OFFSET,
  createPtSection, ptFighting, stepPtSection, type PtCheck, type PtEvents, type PtSection,
} from '../src/core/pt-boats';
import { ptParamsAtNight, type PtParams } from '../src/core/pt-data';
import { SeededRng } from '../src/core/rng';
import { bearingDeg } from '../src/core/ship-ai';
import { degToRad, wrapDeg180 } from '../src/core/units';
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
const W = P.bounds.width;
const H = P.bounds.height;
/** 突撃の速さの旋回半径 m（約 43 m）。向き直る間の膨らみの上限に使う */
const TURN_R = P.runInMps / degToRad(P.turnRateDegS);

function check(boat: BoatState, over: Partial<PtCheck> = {}): PtCheck {
  return { boat, boatHalfLengthM: T14.lengthM / 2, boatHalfBeamM: T14.beamM / 2, detectOpenM: detectM('cruise'), smokeFactor: 1, smoke: null, smokeParams: null, targetValid: true, visRange2: VIS2, dawn: false, timeS: 10, ...over };
}
function events(over: Partial<PtEvents> = {}): PtEvents {
  const none = (): void => {};
  return { onContact: none, onCommit: none, onFire: none, onImpact: none, onPassEnd: none, onLeave: none, onOut: none, ...over };
}
/** 艇の外へ（海域の縁からの距離。内なら 0） */
const outside = (x: number, y: number): number => Math.max(0, -x, -y, x - W, y - H);

interface Run {
  q: PtSection;
  p: PtParams;
  c: PtCheck;
  boat: BoatState;
  input: BoatInput;
  band: SpeedStep;
  t: number;
  home: boolean;
  /** 方針の覚え（見つかった・転舵の残り秒） */
  fled: boolean;
}
/** 艇（T-14）と隊を今夜の揺らぎ込みで固定ステップで回す（tests/pt-boats.test の simulate と同じ順）。帰投の輪に入ったら止める */
function run(seed: number, steps: number, policy: (r: Run) => void, ev: (r: Run) => Partial<PtEvents> = () => ({}), onStep?: (r: Run) => void, dawnAtS = Infinity): Run {
  const n = rollNight(MISSION.night!, () => 0, seed, 1, 0);
  const p = ptParamsAtNight(P, n.enemyOffsets[0]!.dx, n.enemyOffsets[0]!.dy, n.mirrored);
  const st = MISSION.playerStart;
  const boat: BoatState = { x: st.x, y: st.y, headingDeg: st.headingDeg, speedMps: 0 };
  const r: Run = { q: createPtSection(p, 24), p, c: check(boat, { timeS: 0 }), boat, input: { headingDeg: NaN, speed01: 0 }, band: 'stop', t: 0, home: false, fled: false };
  const rng = new SeededRng((seed + PT_SEED_OFFSET) >>> 0);
  const e = events(ev(r));
  for (let k = 0; k < steps && !r.home; k++) {
    policy(r);
    stepBoat(boat, r.input, T14, DT * TS);
    clampToBounds(boat, p.bounds, 15);
    r.band = nextSpeedBand(r.band, boat.speedMps, T14);
    r.home = (boat.x - HOME.x) ** 2 + (boat.y - HOME.y) ** 2 <= HOME.radiusM ** 2;
    r.c.detectOpenM = detectM(r.band);
    r.c.targetValid = !r.home;
    r.c.timeS = r.t;
    r.c.dawn = r.t >= dawnAtS;
    stepPtSection(r.q, p, r.c, rng, DT, DT * TS, e);
    onStep?.(r);
    r.t += DT;
  }
  return r;
}
const toHome = (r: Run): number => bearingDeg(r.boat.x, r.boat.y, HOME.x, HOME.y);
const allLeft = (q: PtSection): boolean => q.boats.every((b) => b.phase >= PT_LEAVE);
/** 縁へ逃げる（レビューの再現）: 巡航で帰り、見つかったら全速で北の縁へ走って止まり、PT がみな去ったら巡航で帰る */
const edgeFlee = (r: Run): void => {
  r.fled = r.fled || r.q.detected;
  if (r.fled && !allLeft(r.q)) {
    r.input.headingDeg = 0;
    r.input.speed01 = r.boat.y > 30 ? 1 : 0;
  } else {
    r.input.headingDeg = toHome(r);
    r.input.speed01 = r.t < 1 ? 0 : 20 / 31;
  }
};
const cruiseHome = (r: Run): void => {
  r.input.headingDeg = toHome(r);
  r.input.speed01 = r.t < 1 ? 0 : 20 / 31;
};

/** 航過中で撃てる形（PT0 は東へ・艇は真横 200 m・予告から 3 秒）、PT1 は海域の外（数えない） */
function passing(over: Partial<PtCheck> = {}): { q: PtSection; c: PtCheck } {
  const q = createPtSection(P, 24);
  Object.assign(q, { detected: true, holdLeftS: P.detectHoldS, lkX: 3000, lkY: 2200, owner: 0, commitAtS: 7 });
  Object.assign(q.boats[0]!, { x: 3000, y: 2000, headingDeg: 90, lockDeg: 90, passMps: P.passMinMps, speedMps: P.passMinMps, phase: PT_PASS, timerS: 3, roundsLeft: P.roundsPerPass });
  q.boats[1]!.phase = PT_OUT;
  return { q, c: check({ x: 3000, y: 2200, headingDeg: 0, speedMps: 0 }, over) };
}

describe('米PT の隊: v0.6.3 レビューの直し（core/pt-boats）', () => {
  it('縁の艇への航過（北の縁で止まった艇へ北向きに固めた航過）は edge_margin_m の帯で終わらず、絵の半長の手前まで走って open_fire_s 後に撃つ', () => {
    const q = createPtSection(P, 24);
    const boat: BoatState = { x: 3100, y: 30, headingDeg: 0, speedMps: 0 };
    Object.assign(q, { detected: true, holdLeftS: P.detectHoldS, lkX: boat.x, lkY: boat.y, owner: 0, commitAtS: 10 });
    Object.assign(q.boats[0]!, { x: 3000, y: 260, headingDeg: 0, lockDeg: 0, passMps: P.passMinMps, speedMps: P.passMinMps, phase: PT_PASS, timerS: 0, roundsLeft: P.roundsPerPass });
    q.boats[1]!.phase = PT_OUT;
    const c = check(boat);
    let fired = 0;
    let endAt = NaN;
    let endY = NaN;
    let minY = Infinity;
    for (let k = 0; k < 60 * 10 && Number.isNaN(endAt); k++) {
      c.timeS = 10 + k * DT;
      stepPtSection(q, P, c, new SeededRng(1), DT, DT * TS, events({ onFire: () => fired++, onPassEnd: () => ((endAt = (k + 1) * DT), (endY = q.boats[0]!.y)) }));
      minY = Math.min(minY, q.boats[0]!.y);
    }
    expect(minY).toBeLessThan(P.edgeMarginM); // 前はここ（y 200）で撃たずに終わった
    expect(endAt).toBeGreaterThan(P.openFireS);
    expect(endY).toBeLessThan(P.edgeMarginM);
    expect(endY).toBeGreaterThan(0); // 海域の外へ出る手前で終える
    expect(fired).toBeGreaterThan(0);
    expect([q.passes, q.firedPasses, q.boats[0]!.passes, q.boats[0]!.phase]).toEqual([1, 1, 1, PT_BREAK]);
  });

  it('回数に数えるのは撃ったか open_fire_s 経った航過だけ: 撃つ前に後ろへ抜けた航過は数えず（max_passes の 1 つ前でも去らない）、open_fire_s 経って撃てずに抜けた航過は数える', () => {
    // 予告から 1 秒、艇は PT の後ろ 500 m（有効射程の外）→ このステップで終わる
    const early = passing();
    Object.assign(early.q.boats[0]!, { timerS: 1, passes: P.maxPasses - 1 });
    early.c.boat.x = 2500;
    early.c.boat.y = 2000;
    let ended = 0;
    stepPtSection(early.q, P, early.c, new SeededRng(1), DT, DT * TS, events({ onPassEnd: () => ended++ }));
    expect(ended).toBe(1);
    expect([early.q.owner, early.q.passes, early.q.firedPasses, early.q.boats[0]!.passes, early.q.boats[0]!.phase]).toEqual([-1, 0, 0, P.maxPasses - 1, PT_BREAK]);
    expect([early.q.passSeq, early.q.lastPassFired, early.q.lastPassBoat]).toEqual([1, false, 0]); // HUD は「撃たせなかった！」を出せる
    // 予告から 3 秒（open_fire_s の後）、撃てないまま後ろへ抜けた → 数える（max_passes に達して去る）
    const late = passing();
    Object.assign(late.q.boats[0]!, { timerS: 3, passes: P.maxPasses - 1 });
    late.c.boat.x = 2500;
    late.c.boat.y = 2000;
    stepPtSection(late.q, P, late.c, new SeededRng(1), DT, DT * TS, events());
    expect([late.q.passes, late.q.firedPasses, late.q.boats[0]!.passes, late.q.boats[0]!.phase]).toEqual([1, 0, P.maxPasses, PT_LEAVE]);
  });

  it('縁へ逃げる（見つかったら北の縁へ全速で走って止まる）: PT は撃たずに去らない（航過の 9 割以上で撃つ・1 夜の命中の平均 4 発以上）。撃つ前に終わった航過は回数に入らない', () => {
    let passes = 0;
    let fired = 0;
    let hits = 0;
    let badCount = 0;
    let uncounted = 0;
    const N = 60;
    for (let seed = 1; seed <= N; seed++) {
      const before = [0, 0];
      const timer = [0, 0];
      const r = run(
        seed,
        60 * 170,
        edgeFlee,
        (r) => ({
          onCommit: (i) => (before[i] = r.q.boats[i]!.passes),
          onPassEnd: (i, f) => {
            const counted = r.q.boats[i]!.passes - before[i]!;
            const endS = timer[i]! + DT; // 終わったステップの航過の秒（endPass が 0 に戻す前）
            if (!f && Math.abs(endS - P.openFireS) < 2 * DT) return; // 境目のステップは見ない
            if (counted !== (f || endS >= P.openFireS ? 1 : 0)) badCount++;
            if (counted === 0) uncounted++;
          },
        }),
        (r) => {
          for (let i = 0; i < 2; i++) if (r.q.boats[i]!.phase === PT_PASS) timer[i] = r.q.boats[i]!.timerS;
        },
      );
      passes += r.q.passes;
      fired += r.q.firedPasses;
      hits += r.q.hits;
    }
    void uncounted;
    expect(badCount).toBe(0);
    expect(passes).toBeGreaterThan(2 * N);
    // 前は 800 回の航過のうち撃ったのは 220 回。v0.6.3 実機 2 回目: open_fire_s の後に有効射程の外へ離れていく航過は撃たずに終わる（回数に数える）ので 0.9 → 0.8（60 夜で 0.87）
    expect(fired).toBeGreaterThanOrEqual(0.8 * passes);
    expect(hits / N).toBeGreaterThan(4); // 前は 1 夜 0.56 発
  });

  it('みな去れば（max_passes・夜明け）捉えるのをやめ、見失わせたには数えない。生きている PT が見失ったときだけ数える。沈み始め・輪の中で切れたのも数えない', () => {
    const q = createPtSection(P, 24);
    Object.assign(q, { detected: true, holdLeftS: P.detectHoldS, lkX: 3000, lkY: 2000 });
    q.boats[0]!.phase = PT_LEAVE;
    q.boats[1]!.phase = PT_OUT;
    const contacts: boolean[] = [];
    const c = check({ x: 3000, y: 2000, headingDeg: 0, speedMps: 0 });
    stepPtSection(q, P, c, new SeededRng(1), DT, DT * TS, events({ onContact: (g) => contacts.push(g) }));
    expect([q.detected, q.lostContacts, contacts]).toEqual([false, 0, [false]]);
    // 夜明けのラッチ: 次のステップで捉えるのをやめる（数えない）
    const d = createPtSection(P, 24);
    Object.assign(d, { detected: true, holdLeftS: P.detectHoldS, lkX: 3000, lkY: 2000 });
    const far = check({ x: 300, y: 300, headingDeg: 0, speedMps: 0 }, { dawn: true });
    stepPtSection(d, P, far, new SeededRng(1), DT, DT * TS, events());
    stepPtSection(d, P, far, new SeededRng(1), DT, DT * TS, events());
    expect([d.detected, d.lostContacts, d.leftAtDawn]).toEqual([false, 0, true]);
    // 艇が的でない（沈み始め・輪の中）間に保持が切れても数えない
    const s = createPtSection(P, 24);
    Object.assign(s, { detected: true, holdLeftS: 0.01, lkX: 3000, lkY: 2000 });
    stepPtSection(s, P, check({ x: 3000, y: 2000, headingDeg: 0, speedMps: 0 }, { targetValid: false }), new SeededRng(1), DT, DT * TS, events());
    expect([s.detected, s.lostContacts]).toEqual([false, 0]);
    // まっすぐ帰る 100 夜: 数えた「見失わせた」はどれも、生きている（離脱まで）PT がいるときだけ（前は 2 隻とも去った後の 8 秒で数えた）
    let lost = 0;
    let bad = 0;
    for (let seed = 1; seed <= 100; seed++) {
      let prev = 0;
      run(seed, 60 * 170, cruiseHome, () => ({}), (r) => {
        if (r.q.lostContacts > prev) {
          lost++;
          if (!r.q.boats.some((b) => ptFighting(b.phase))) bad++;
          prev = r.q.lostContacts;
        }
      });
    }
    expect(bad).toBe(0);
    expect(lost).toBeLessThan(10); // まっすぐ帰る艇は見失わせない（前は 200 夜で 77〜160 回）
  });

  it('待つ PT（他の PT の航過中・次の航過まで）は縁の帯では内へ向く: 北の縁で止まった艇を 500〜600 m で回っても、海域の外へ旋回半径 × 2 より出ない（前は 500 m 以上出た）', () => {
    const q = createPtSection(P, 24);
    const boat: BoatState = { x: 3000, y: 30, headingDeg: 0, speedMps: 0 };
    Object.assign(q, { detected: true, holdLeftS: P.detectHoldS, lkX: boat.x, lkY: boat.y, gapLeftS: 1e9 }); // 次の航過まで待たせ続ける
    Object.assign(q.boats[1]!, { x: 3000, y: 560, headingDeg: 0, speedMps: P.runInMps, phase: PT_RUN_IN, side: 1, timerS: 0 });
    q.boats[0]!.phase = PT_OUT;
    const c = check(boat, { detectOpenM: 1500 }); // 見続ける（保持が切れない）
    let worst = 0;
    let minD = Infinity;
    for (let k = 0; k < 60 * 20; k++) {
      c.timeS = 10 + k * DT;
      stepPtSection(q, P, c, new SeededRng(1), DT, DT * TS, events());
      const b = q.boats[1]!;
      expect(b.phase).toBe(PT_RUN_IN);
      worst = Math.max(worst, outside(b.x, b.y));
      minD = Math.min(minD, Math.hypot(b.x - boat.x, b.y - boat.y));
    }
    expect(worst).toBeLessThanOrEqual(2 * TURN_R);
    expect(minD).toBeGreaterThan(Math.sqrt(P.holdOff2) - 2 * TURN_R); // 待つ距離は守る
    // 縁へ逃げる 60 夜でも、待つ（突撃中の）PT が海域の外へ出るのは旋回半径 × 2 まで
    let worstRunIn = 0;
    for (let seed = 1; seed <= 60; seed++) {
      run(seed, 60 * 170, edgeFlee, () => ({}), (r) => {
        for (const b of r.q.boats) if (b.phase === PT_RUN_IN && (r.q.owner >= 0 || r.q.gapLeftS > 0)) worstRunIn = Math.max(worstRunIn, outside(b.x, b.y));
      });
    }
    expect(worstRunIn).toBeLessThanOrEqual(2 * TURN_R);
  });

  it('追いつけない突撃の打ち切り（run_in_max_s）の離脱は目標から離れる向き: 全速で東へ逃げる艇に、離脱中の PT は旋回の膨らみより寄らない（前は追う針路のまま 50 m 以上寄り 100 m 以内まで来た）', () => {
    let cuts = 0;
    let worstClose = -Infinity;
    for (let seed = 1; seed <= 20; seed++) {
      const prev = [PT_PATROL, PT_PATROL];
      const ep: ({ d0: number; min: number } | null)[] = [null, null];
      run(seed, 60 * 90, (r) => {
        r.input.headingDeg = 90;
        r.input.speed01 = r.t < 1 ? 0 : 1;
      }, () => ({}), (r) => {
        for (let i = 0; i < 2; i++) {
          const b = r.q.boats[i]!;
          const d = Math.hypot(b.x - r.boat.x, b.y - r.boat.y);
          if (prev[i] === PT_RUN_IN && b.phase === PT_BREAK && b.passes === 0 && r.q.owner !== i) {
            // 航過の終わりでない離脱（打ち切り）。固めた針路は目標から PT への方位
            const away = bearingDeg(r.q.lkX + r.q.lkVx * r.q.lkAgeS * TS, r.q.lkY + r.q.lkVy * r.q.lkAgeS * TS, b.x, b.y);
            expect(Math.abs(wrapDeg180(b.lockDeg - away))).toBeLessThan(1);
            ep[i] = { d0: d, min: d };
            cuts++;
          }
          const e = ep[i];
          if (e && b.phase === PT_BREAK) e.min = Math.min(e.min, d);
          else if (e) {
            worstClose = Math.max(worstClose, e.d0 - e.min);
            ep[i] = null;
          }
          prev[i] = b.phase;
        }
      });
    }
    expect(cuts).toBeGreaterThan(5);
    expect(worstClose).toBeLessThanOrEqual(2 * TURN_R);
  });

  it('夜明けで切れた航過: 撃っていれば航過・撃った航過・無傷に数え（その命中は被弾に入っている）、後から落ちた弾はその航過に数える。HUD の結果は出さない（通し番号は変えない）', () => {
    const a = passing({ dawn: true });
    a.q.boats[0]!.firedThisPass = 3;
    a.q.passHits = 0;
    stepPtSection(a.q, P, a.c, new SeededRng(1), DT, DT * TS, events());
    expect([a.q.owner, a.q.passes, a.q.firedPasses, a.q.cleanPasses, a.q.boats[0]!.passes, a.q.passSeq, a.q.lastPassBoat, a.q.lastPassFired]).toEqual([-1, 1, 1, 1, 1, 0, 0, true]);
    Object.assign(a.q.shells[0]!, { active: true, x: 3000, y: 2200, vx: 0, vy: 0, leftS: 0.001, impactX: 3000, impactY: 2200, gunIndex: 0 });
    stepPtSection(a.q, P, a.c, new SeededRng(1), DT, DT * TS, events());
    expect([a.q.hits, a.q.lastPassHits, a.q.cleanPasses, a.q.passSeq]).toEqual([1, 1, 0, 0]);
    // 命中のあった航過は無傷に数えない
    const b = passing({ dawn: true });
    b.q.boats[0]!.firedThisPass = 5;
    b.q.passHits = 2;
    stepPtSection(b.q, P, b.c, new SeededRng(1), DT, DT * TS, events());
    expect([b.q.passes, b.q.firedPasses, b.q.cleanPasses, b.q.lastPassHits]).toEqual([1, 1, 0, 2]);
  });

  it('航過の通し番号（HUD の結果）は、その PT の撃った弾がみな落ちてから増える（「かわした！」が後から「被弾」に変わらない）', () => {
    const p = passing();
    p.q.boats[0]!.timerS = P.passMaxS; // このステップで終わる
    p.q.boats[0]!.roundsLeft = 0;
    p.q.boats[0]!.firedThisPass = 4;
    // 艇へ向かって飛んでいる弾（3 ステップ後に艇の位置に落ちる）
    Object.assign(p.q.shells[0]!, { active: true, x: 3000, y: 2100, vx: 0, vy: 0, leftS: 3.5 * DT * TS, impactX: 3000, impactY: 2200, gunIndex: 0 });
    const seq: number[] = [];
    for (let k = 0; k < 6; k++) {
      stepPtSection(p.q, P, p.c, new SeededRng(1), DT, DT * TS, events());
      seq.push(p.q.passSeq);
      if (p.q.passSeq === 0) expect(p.q.owner).toBe(-1);
    }
    expect(seq).toEqual([0, 0, 0, 1, 1, 1]);
    expect([p.q.lastPassHits, p.q.cleanPasses, p.q.firedPasses]).toEqual([1, 0, 1]); // 増えたときにはもう被弾 1 発（無傷に数えていない）
    // 何夜回しても、通し番号が増えた後にその航過の命中が変わることは無い
    let flips = 0;
    let shown = 0;
    for (let seed = 1; seed <= 80; seed++) {
      let seqNow = 0;
      let hitsAt = 0;
      let open = false;
      run(seed, 60 * 170, cruiseHome, (r) => ({ onPassEnd: () => (open = false) }), (r) => {
        if (r.q.passSeq !== seqNow) {
          seqNow = r.q.passSeq;
          hitsAt = r.q.lastPassHits;
          open = true;
          shown++;
        } else if (open && r.q.lastPassHits !== hitsAt) flips++;
      });
    }
    expect(shown).toBeGreaterThan(100);
    expect(flips).toBe(0);
  });
});
