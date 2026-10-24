// 米PT の隊の標的スロット（v0.6.4。core/pt-target、spec §C.3〜C.6・§G.2）: (a) jp_05 の中立（targets＝自艇 1 隻・flashX/Y＝自艇でもビット同一）、(b) 選び方（手空きのときだけ・見つかる距離で割る・
// 閃光の記憶・keep と 1 秒のロック・沈んだ標的は即・候補なし・決定性・確保なし）、(c) applyPtTarget は捉えているときだけ lk*、(d) 着弾は船体の集合の最初の 1 つ、(e) 接触の閃光は閃光の位置で判定。
// 規則の値（keep 0.8²・1 秒・閃光の記憶 1 秒）は data と独立な固定値（spec §B.2 の写し。data の値の pin は tests/jp01-mission。実機後に data を変えてもここは変えない）。
import { describe, expect, it } from 'vitest';
import type { GunEvents } from '../src/core/gun-battery';
import { clampToBounds, nextSpeedBand, stepBoat, type BoatInput, type BoatState, type SpeedStep } from '../src/core/boat-motion';
import { rollNight } from '../src/core/night';
import {
  PT_CHASE, PT_GUN_SEED_OFFSET, PT_LEAVE, PT_PASS, PT_PATROL, PT_RUN_IN, PT_SEED_OFFSET,
  createPtSection, createPtTelemetry, stepPtSection, type PtHull, type PtSection,
} from '../src/core/pt-boats';
import { hitPt } from '../src/core/pt-damage';
import { ptParamsAtNight } from '../src/core/pt-data';
import { createPtGun, stepPtGun } from '../src/core/pt-gun';
import { applyPtTarget, createPtTargetSet, pickPtTarget, ptContactFlashM, ptHeldFlashM, type PtTargetRule, type PtTargetSet } from '../src/core/pt-target';
import { SeededRng } from '../src/core/rng';
import { bearingDeg } from '../src/core/ship-ai';
import { ktToMps } from '../src/core/units';
import { DT, G, HOME, MISSION, P, T14, TS, VIS2, check, detectM, events } from './pt-kit';

/** convoy の規則（target_keep_ratio 0.8 → 0.64・target_switch_hold_s 1・flash_hold_s 1。data と独立な固定値＝spec §B.2 の写し）と、順位だけを見る規則（余裕なし・ロックなし） */
const RULE: PtTargetRule = { keepRatio2: 0.64, lockS: 1, flashHoldS: 1 };
const RAW: PtTargetRule = { keepRatio2: 1, lockS: 0, flashHoldS: 1 };
const FLASH = G.flashRevealM;
/** 乱数の内部状態（private。中立の検査は replay.mjs と同じく内部状態そのものを比べる） */
const stateOf = (r: SeededRng): number => (r as unknown as { state: number }).state;
const STOP = detectM('stop');
const CRUISE = detectM('cruise');

function hull(x: number, y: number, headingDeg = 90, speedMps = 0, valid = true): PtHull {
  return { boat: { x, y, headingDeg, speedMps }, halfLengthM: 7.45, halfBeamM: 1.7, valid };
}

/** PT0 を (2000, 2200) に 1 隻だけ戦わせる隊（PT1 は去った）。手空き（owner −1・gap 0） */
function section(phase0 = PT_RUN_IN): PtSection {
  const q = createPtSection(P, 24);
  Object.assign(q.boats[0]!, { x: 2000, y: 2200, phase: phase0 });
  Object.assign(q.boats[1]!, { x: 0, y: 0, phase: PT_LEAVE });
  q.gapLeftS = 0;
  return q;
}

/** 自艇（[0]）と大発（[1]）の 2 船体。自艇は x が PT0 から distM、大発も同じ線上で bargeM */
function set(playerM: number, bargeM: number, playerBand: SpeedStep): PtTargetSet {
  const ts = createPtTargetSet([hull(2000 + playerM, 2200), hull(2000 + bargeM, 2200)]);
  ts.detectM.set([detectM(playerBand), STOP]);
  return ts;
}

describe('jp_05 の中立（spec §C.9・§G.2 (a)）', () => {
  /** tests/pt-kit の runPtSim と同じ順の小さな模擬（T-14 の 13mm 込み）。targets を渡すなら自艇 1 隻の船体と閃光の位置＝自艇 */
  function run(seed: number, steps: number, withTargets: boolean): { q: PtSection; rng: number; gunRng: number; gunShots: number } {
    const n = rollNight(MISSION.night!, () => 0, seed, 1, 0);
    const p = ptParamsAtNight(P, n.enemyOffsets[0]!.dx, n.enemyOffsets[0]!.dy, n.mirrored);
    const st = MISSION.playerStart;
    const boat: BoatState = { x: st.x, y: st.y, headingDeg: st.headingDeg, speedMps: 0 };
    const q = createPtSection(p, 24);
    const c = check(boat, { timeS: 0 });
    const self: PtHull = { boat, halfLengthM: c.boatHalfLengthM, halfBeamM: c.boatHalfBeamM, valid: true };
    const hulls = [self];
    const rng = new SeededRng((seed + PT_SEED_OFFSET) >>> 0);
    const gunRng = new SeededRng((seed + PT_GUN_SEED_OFFSET) >>> 0);
    const gun = createPtGun(G, 8);
    const ev = events();
    const gunEv: GunEvents = { onFire: () => {}, onHit: (i, g) => hitPt(q, p, i, G.groups[g]!.damage, gunRng.next(), ev), onMiss: () => {} };
    const input: BoatInput = { headingDeg: 180, speed01: 1 };
    let band: SpeedStep = 'stop';
    let home = false;
    for (let k = 0; k < steps; k++) {
      const t = k * DT;
      input.headingDeg = t < 60 ? 180 : 90; // 南へ全速 60 秒 → 東へ逃げる（replay.mjs の PTRUN と同じ台本。発見・航過・追撃・連射・13mm を通る）
      input.speed01 = home ? 0 : 1;
      stepBoat(boat, input, T14, DT * TS);
      clampToBounds(boat, p.bounds, 15);
      band = nextSpeedBand(band, boat.speedMps, T14);
      home = home || (boat.x - HOME.x) ** 2 + (boat.y - HOME.y) ** 2 <= HOME.radiusM ** 2;
      c.detectOpenM = detectM(band);
      c.targetValid = !home;
      c.timeS = t;
      stepPtGun(gun, G, boat, band, (t >= 20 && t < 60) || (t >= 70 && t < 110), !home, q, p, VIS2, gunRng, DT, DT * TS, gunEv);
      c.flashM = gun.battery.fired ? G.flashRevealM : 0;
      if (withTargets) {
        self.valid = c.targetValid;
        c.targets = hulls;
        c.flashX = boat.x;
        c.flashY = boat.y;
      }
      stepPtSection(q, p, c, rng, DT, DT * TS, ev);
    }
    return { q, rng: stateOf(rng), gunRng: stateOf(gunRng), gunShots: gun.battery.shots };
  }

  it('400 ステップ × seed 3 つ: targets＝[自艇]・flashX/Y＝自艇でも、隊の状態（JSON）・seed+18・seed+20 の乱数の内部状態が targets 無しと同一', () => {
    for (const seed of [1, 2, 3]) {
      const a = run(seed, 400, false);
      const b = run(seed, 400, true);
      expect(JSON.stringify(b.q)).toBe(JSON.stringify(a.q));
      expect([b.rng, b.gunRng]).toEqual([a.rng, a.gunRng]);
    }
  });

  it('発見・航過・追撃・連射・13mm の閃光・自艇への命中を通る 110 秒でも同一（着弾は hulls の枝、閃光は flashX/Y の枝を通る）', () => {
    const a = run(1, 60 * 110, false);
    const b = run(1, 60 * 110, true);
    expect([a.q.passes > 0, a.q.hits > 0, a.q.bursts > 0, a.gunShots > 0, a.q.shots > 0]).toEqual([true, true, true, true, true]);
    expect(JSON.stringify(b.q)).toBe(JSON.stringify(a.q));
    expect([b.rng, b.gunRng, b.gunShots]).toEqual([a.rng, a.gunRng, a.gunShots]);
  });

  it('PtTelemetry の標的の欄は 0（自艇）で始まる。発見距離は spec の値（新月: 停止 480・静音 600・巡航 1200・全速 1920）', () => {
    const t = createPtTelemetry();
    expect([t.targetKind, t.lastPassTargetKind]).toEqual([0, 0]);
    expect([STOP, detectM('silent'), CRUISE, detectM('full'), FLASH]).toEqual([480, 600, 1200, 1920, 1200]);
  });
});

describe('いつ替えるか（pickPtTarget。spec §C.3）', () => {
  it('手空きでなければ今のまま: 攻撃中（owner ≥ 0）・次の攻撃まで（gapLeftS > 0）・追撃中の PT がいる。手空きなら大発が近ければ大発', () => {
    const ts = set(1000, 100, 'stop');
    const q = section();
    expect(pickPtTarget(q, ts, 0, RULE, 10)).toBe(1);
    q.owner = 0;
    expect(pickPtTarget(q, ts, 0, RULE, 10)).toBe(0);
    q.owner = -1;
    q.gapLeftS = 0.5;
    expect(pickPtTarget(q, ts, 0, RULE, 10)).toBe(0);
    q.gapLeftS = 0;
    q.boats[1]!.phase = PT_CHASE;
    expect(pickPtTarget(q, ts, 0, RULE, 10)).toBe(0);
    q.boats[1]!.phase = PT_LEAVE;
    expect(pickPtTarget(q, ts, 0, RULE, 10)).toBe(1);
  });

  it('見つかる距離で割る: 巡航の自艇 1,000 m（÷1200）対 大発 420 m（÷480）は自艇、停止の自艇 500 m 対 大発 450 m は大発', () => {
    expect(pickPtTarget(section(), set(1000, 420, 'cruise'), 0, RAW, 10)).toBe(0);
    const ts = set(500, 450, 'stop');
    expect(pickPtTarget(section(), ts, 0, RAW, 10)).toBe(1);
    ts.current = 1; // 逆からでも同じ順位
    expect(pickPtTarget(section(), set(1000, 420, 'cruise'), 0, RAW, 10)).toBe(0);
  });

  it('閃光の記憶: 停止の自艇 1,100 m は閃光（1,200）があれば 500 m の大発より先に狙われ、無ければ大発。ptHeldFlashM は最後に撃ってから flash_hold_s の内だけ閃光', () => {
    const ts = set(1100, 500, 'stop');
    expect(pickPtTarget(section(), ts, FLASH, RAW, 10)).toBe(0);
    expect(pickPtTarget(section(), ts, 0, RAW, 10)).toBe(1);
    expect([ptHeldFlashM(10, 9.5, 1, FLASH), ptHeldFlashM(10, 9, 1, FLASH), ptHeldFlashM(10, 8.9, 1, FLASH), ptHeldFlashM(10, -Infinity, 1, FLASH)]).toEqual([FLASH, FLASH, 0, 0]);
    // 全速（1,920）の自艇には閃光の方が短いので帯の距離のまま
    const full = set(1100, 500, 'full');
    expect(pickPtTarget(section(), full, FLASH, RAW, 10)).toBe(0);
    full.detectM[0] = 2000;
    expect(pickPtTarget(section(), full, 1200, RAW, 10)).toBe(pickPtTarget(section(), full, 0, RAW, 10));
  });

  it('keep 0.8: 今の点数の 0.7 倍の候補では替えない、0.6 倍で替える（0.64 の境）', () => {
    const s0 = (1000 / CRUISE) ** 2; // 巡航の自艇 1,000 m の点数
    const at = (f: number): number => pickPtTarget(section(), set(1000, Math.sqrt(f * s0) * STOP, 'cruise'), 0, RULE, 10);
    expect([at(0.7), at(0.6)]).toEqual([0, 1]);
  });

  it('1 秒のロック: 替えてから 1 秒たつまでは、ずっと良い候補がいても替えない', () => {
    const ts = set(1000, 100, 'stop');
    ts.lastSwitchS = 10;
    expect([pickPtTarget(section(), ts, 0, RULE, 10.5), pickPtTarget(section(), ts, 0, RULE, 10.99), pickPtTarget(section(), ts, 0, RULE, 11)]).toEqual([0, 0, 1]);
  });

  it('今の標的が valid でなければ（沈んだ・上陸した・輪に入った）ロック中でも余裕の内でも即替える。valid な船体が無ければ今のまま。戦う PT がいなければ今のまま', () => {
    const ts = set(1000, 100, 'stop');
    ts.current = 1;
    ts.lastSwitchS = 10;
    ts.hulls[1]!.valid = false;
    expect(pickPtTarget(section(), ts, 0, RULE, 10.1)).toBe(0);
    ts.hulls[0]!.valid = false;
    expect(pickPtTarget(section(), ts, 0, RULE, 10.1)).toBe(1);
    const all = set(1000, 100, 'stop');
    expect(pickPtTarget(section(PT_LEAVE), all, 0, RULE, 10)).toBe(0);
  });

  it('決定的（同じ入力で同じ index）・確保なし（new・[]・{}・=> を書かない）', () => {
    const ts = set(700, 300, 'cruise');
    const a = pickPtTarget(section(), ts, 0, RULE, 10);
    for (let k = 0; k < 20; k++) expect(pickPtTarget(section(), ts, 0, RULE, 10)).toBe(a);
    const src = pickPtTarget.toString();
    expect([src.includes('new '), src.includes('[]'), src.includes('{}'), src.includes('=>')]).toEqual([false, false, false, false]);
  });
});

describe('追撃中は替えない（spec §C.5。レビューの指摘 3）', () => {
  /** 東へ 20 kt で逃げる自艇の艇尾側 (2800, 2300) に追撃の PT0。隊は捉えている・手空き（gap が切れた）。70 m 先に大発 */
  function chase(): { q: PtSection; ts: PtTargetSet } {
    const q = section(PT_CHASE);
    Object.assign(q.boats[0]!, { x: 2800, y: 2300, headingDeg: 90, speedMps: ktToMps(20) });
    const player = hull(3000, 2200, 90, ktToMps(20));
    const barge = hull(2850, 2250, 90, ktToMps(7));
    const ts = createPtTargetSet([player, barge]);
    ts.detectM.set([CRUISE, STOP]);
    Object.assign(q, { detected: true, holdLeftS: 10, lkX: 3000, lkY: 2200, lkVx: ktToMps(20), lkVy: 0, lkHeadingDeg: 90 });
    return { q, ts };
  }
  const step = (q: PtSection, ts: PtTargetSet, i: number): { q: PtSection; lockDeg: number } => {
    const c = check(ts.hulls[0]!.boat, { timeS: 30 });
    applyPtTarget(q, c, ts, i, 30);
    let committed = -1;
    stepPtSection(q, P, c, new SeededRng(1), DT, DT * TS, events({ onCommit: (k) => (committed = k) }));
    expect([committed, q.owner, q.boats[0]!.burst]).toEqual([0, 0, true]);
    return { q, lockDeg: q.boats[0]!.lockDeg };
  };

  it('追撃 → 合間に大発が 70 m（自艇は 224 m）でも自艇のまま → 固めた連射の赤い線は自艇へ（大発への連射 0）', () => {
    const { q, ts } = chase();
    expect(pickPtTarget(q, ts, 0, RULE, 30)).toBe(0);
    const r = step(q, ts, 0);
    expect(r.lockDeg).toBeCloseTo(bearingDeg(2800, 2300, 3000, 2200), 6);
  });

  it('（守りが無ければ）標的を大発に差し替えると追撃の PT は slow_exit_s の内に大発へ連射を固める＝だから追撃中は替えない', () => {
    const { q, ts } = chase();
    const r = step(q, ts, 1);
    expect(r.lockDeg).toBeCloseTo(bearingDeg(2800, 2300, 2850, 2250), 6);
  });
});

describe('差し替え（applyPtTarget。spec §C.4）', () => {
  it('PtCheck に boat の参照・半長・半幅・valid・帯の発見距離を書く。替わったときだけ switches・lastSwitchS。捉えているときだけ lk* を新しい標的の位置・速度・艇首に（lkAgeS 0）', () => {
    const q = section();
    const ts = set(1000, 100, 'cruise');
    const barge = ts.hulls[1]!;
    Object.assign(barge.boat, { headingDeg: 90, speedMps: ktToMps(7) });
    const c = check(ts.hulls[0]!.boat, { timeS: 10 });
    Object.assign(q, { detected: false, lkX: 1, lkY: 2, lkVx: 3, lkVy: 4, lkAgeS: 5, lkHeadingDeg: 6 });
    applyPtTarget(q, c, ts, 1, 10);
    expect([ts.current, ts.switches, ts.lastSwitchS, c.boat === barge.boat, c.boatHalfLengthM, c.boatHalfBeamM, c.targetValid, c.detectOpenM]).toEqual([1, 1, 10, true, 7.45, 1.7, true, STOP]);
    expect([q.lkX, q.lkY, q.lkVx, q.lkVy, q.lkAgeS, q.lkHeadingDeg]).toEqual([1, 2, 3, 4, 5, 6]); // 捉えていない: lk* はそのまま
    applyPtTarget(q, c, ts, 1, 11);
    expect([ts.switches, ts.lastSwitchS]).toEqual([1, 10]); // 同じ標的: 替わっていない
    Object.assign(q, { detected: true, holdLeftS: 3, lkAgeS: 5 });
    applyPtTarget(q, c, ts, 0, 12);
    const v = ktToMps(20);
    Object.assign(ts.hulls[0]!.boat, { headingDeg: 90, speedMps: v });
    applyPtTarget(q, c, ts, 1, 13);
    expect([ts.current, ts.switches, ts.lastSwitchS, q.lkX, q.lkY, q.lkAgeS, q.lkHeadingDeg, q.detected, q.holdLeftS]).toEqual([1, 3, 13, 2100, 2200, 0, 90, true, 3]);
    expect(q.lkVx).toBeCloseTo(ktToMps(7), 9);
    expect(q.lkVy).toBeCloseTo(0, 9);
    barge.valid = false;
    applyPtTarget(q, c, ts, 1, 14);
    expect(c.targetValid).toBe(false);
  });
});

describe('着弾（stepPtSection の 5。spec §C.6）', () => {
  /** 弾 1 発を impact 点に落とす（leftS が 1 ステップの内）。onImpact の引数と隊の命中を返す */
  function land(impactX: number, impactY: number, targets: readonly PtHull[] | undefined, boat: BoatState): { args: unknown[]; hits: number } {
    const q = section(PT_PATROL);
    const s = q.shells[0]!;
    Object.assign(s, { active: true, x: impactX, y: impactY, vx: 0, vy: 0, leftS: DT * TS * 0.5, impactX, impactY, gunIndex: 0 });
    const c = check(boat, { timeS: 10, ...(targets ? { targets } : {}) });
    let args: unknown[] = [];
    stepPtSection(q, P, c, new SeededRng(1), DT, DT * TS, events({ onImpact(x, y, hit, hull) { args = [x, y, hit, hull, arguments.length]; } }));
    return { args, hits: q.hits };
  }
  const far = hull(5000, 3500);

  it('targets あり: valid な船体を index 順に見て最初に当たった 1 つ（2 番目の船体なら hull 1）。隊の hits はどの船体への命中も数える。沈んだ（valid false）船体には当たらない', () => {
    const barge = hull(3000, 2800, 90);
    expect(land(3000, 2800, [far, barge], far.boat)).toEqual({ args: [3000, 2800, true, 1, 4], hits: 1 });
    expect(land(3000, 2800, [hull(3000, 2800), barge], far.boat).args).toEqual([3000, 2800, true, 0, 4]); // 重なれば index の小さい方
    barge.valid = false;
    expect(land(3000, 2800, [far, barge], far.boat)).toEqual({ args: [3000, 2800, false, 0, 4], hits: 0 });
    expect(land(3000, 2900, [far, hull(3000, 2800, 90)], far.boat).args).toEqual([3000, 2900, false, 0, 4]); // 外れ（100 m 横）
  });

  it('targets なし（jp_05）: 標的の 1 隻に v0.6.3 の式で当て、onImpact は 3 引数', () => {
    expect(land(5000, 3500, undefined, far.boat)).toEqual({ args: [5000, 3500, true, undefined, 3], hits: 1 });
    expect(land(5000, 3600, undefined, far.boat).args).toEqual([5000, 3600, false, undefined, 3]);
  });
});

describe('接触の閃光の位置（core/pt-contact の flashX/Y。spec §C.4・§G.2 (e)）', () => {
  /** PT0 (2000, 2200) 停止。標的は大発 (2500, 2200)＝500 m（帯 480 の外）。閃光の位置は自艇 */
  function contact(flashM: number, flashX: number): PtSection {
    const q = section(PT_PATROL);
    const c = check({ x: 2500, y: 2200, headingDeg: 90, speedMps: 0 }, { detectOpenM: STOP, timeS: 10, flashM, flashX, flashY: 2200 });
    stepPtSection(q, P, c, new SeededRng(1), DT, DT * TS, events());
    return q;
  }

  it('core 単体: 1,100 m の自艇の閃光 1,200 を渡すと帯の外の大発が seen になる（lk* は大発）。1,300 m なら見えない。閃光の位置が無ければ標的の位置（v0.6.3 と同じ式）', () => {
    const q = contact(FLASH, 3100);
    expect([q.seen[0], q.detected, q.flashFirst, q.lkX]).toEqual([1, true, true, 2500]);
    expect(contact(FLASH, 3300).detected).toBe(false);
    expect(contact(0, 3100).detected).toBe(false);
    const q2 = section(PT_PATROL);
    stepPtSection(q2, P, check({ x: 3100, y: 2200, headingDeg: 90, speedMps: 0 }, { detectOpenM: STOP, timeS: 10, flashM: FLASH }), new SeededRng(1), DT, DT * TS, events());
    expect([q2.detected, q2.firstDetectM]).toEqual([true, 1100]);
  });

  it('だから世界は標的で切る（ptContactFlashM）: 自艇が標的のときだけ閃光、標的が大発なら 0 → 大発は seen にならない', () => {
    expect([ptContactFlashM(0, FLASH), ptContactFlashM(1, FLASH), ptContactFlashM(3, FLASH), ptContactFlashM(0, 0)]).toEqual([FLASH, 0, 0, 0]);
    expect(contact(ptContactFlashM(1, FLASH), 3100).detected).toBe(false);
  });
});
