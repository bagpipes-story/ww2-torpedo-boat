// T-14 の 13mm が米PT に当たったとき（v0.6.3 実機 1 回目。core/pt-damage・pt-pass-end、spec §C.2・§H）: u（seed+20 の 1 回）を決めて、
// 引火で沈む（u < fire_chance）・死傷で撃退（その上の casualty_chance）・穴だらけで撃退（HP ≤ retreat_hp）・何もなし。航過中の撃沈は dropOwner（onPassEnd なし）、
// 航過中の撃退は黙って固めた針路のまま抜けてから去る（赤い線は消えない）、結末は 1 回、沈めた後も次の航過まで pass_gap_s、沈んだ PT は動かず撃たず脅威でない・夜明けも飛ばす。
// v0.6.3 実機 2 回目（spec r2 §D.2-8）: 制圧＝結末の無い命中を追撃中・連射中の PT だけ数え、chase.suppress_hits で追撃をやめる（結末が先・連射 1 回分を使う）。
import { describe, expect, it } from 'vitest';
import { gameData, getPrototypeMission } from '../src/config/game-data';
import { getPtParams } from '../src/config/pt-mission-data';
import {
  PT_BREAK, PT_CHASE, PT_FATE_CREW, PT_FATE_HULL, PT_FATE_NONE, PT_FATE_SUNK, PT_LEAVE, PT_OUT, PT_PASS, PT_RUN_IN, PT_SUNK,
  createPtSection, ptFighting, stepPtSection, threatIndex, type PtEvents, type PtSection,
} from '../src/core/pt-boats';
import { PT_GUN_EV_CREW, PT_GUN_EV_HULL, PT_GUN_EV_SUNK, PT_GUN_EV_SUPPRESS, hitPt, ptLive, ptNeverBlocked } from '../src/core/pt-damage';
import { SeededRng } from '../src/core/rng';
import { bearingDeg } from '../src/core/ship-ai';
import { ktToMps } from '../src/core/units';
import { CRUISE01, DT, HOME, P, TS, check, events, runPtSim } from './pt-kit';

const DMG = 2; // jp_t14.gun_battery の 13mm の 1 発

/** 知らせの記録: [種類, PT]（'end' は onPassEnd、'leave' は onLeave） */
function logged(): { log: [string, number][]; ev: PtEvents } {
  const log: [string, number][] = [];
  return { log, ev: events({ onPassEnd: (i) => void log.push(['end', i]), onLeave: (i) => void log.push(['leave', i]), onFire: (i) => void log.push(['fire', i]) }) };
}

/** PT0 が航過中（東へ、撃ち始め）、PT1 は突撃（待ち）。艇は PT0 の 200 m 南で止まっている（tests/pt-boats の 7 と同じ形） */
function passing(fired: number, timerS: number): PtSection {
  const q = createPtSection(P, 24);
  q.owner = 0;
  q.detected = true;
  q.holdLeftS = P.detectHoldS;
  q.commitAtS = 10 - timerS;
  Object.assign(q.boats[0]!, { x: 3000, y: 2000, headingDeg: 90, lockDeg: 90, passMps: P.passMinMps, speedMps: P.passMinMps, phase: PT_PASS, timerS, roundsLeft: P.roundsPerPass - fired, firedThisPass: fired });
  Object.assign(q.boats[1]!, { x: 2500, y: 2600, phase: PT_RUN_IN, speedMps: P.runInMps });
  return q;
}

describe('13mm の命中の結末（core/pt-damage の hitPt。u は seed+20 の 1 回）', () => {
  it(`u < fire_chance（${P.fireChance}）: 航過中の PT は沈む（PT_SUNK・止まる）。航過は dropOwner で閉じ（撃ったか open_fire_s 経っていれば数える）、onPassEnd・onLeave は呼ばない、次の航過まで pass_gap_s`, () => {
    for (const [fired, timerS, counts] of [[2, 3, true], [0, 1, false], [0, P.openFireS, true]] as const) {
      const q = passing(fired, timerS);
      const { log, ev } = logged();
      const gap = q.gapLeftS;
      expect(hitPt(q, P, 0, DMG, P.fireChance - 1e-6, ev)).toBe(PT_FATE_SUNK);
      const b = q.boats[0]!;
      expect([b.phase, b.speedMps, b.fate, b.hp, b.hitsTaken, q.gunHits, q.sunk, q.retired]).toEqual([PT_SUNK, 0, PT_FATE_SUNK, P.hullHp - DMG, 1, 1, 1, 0]);
      expect([q.owner, q.seqPending, q.gapLeftS, q.passes, b.passes, q.firedPasses, q.lastPassBoat]).toEqual([-1, true, P.passGapS, counts ? 1 : 0, counts ? 1 : 0, fired > 0 ? 1 : 0, 0]);
      expect(gap).not.toBe(P.passGapS);
      expect(log).toEqual([]);
      expect([q.gunEventSeq, q.gunEvent, q.gunEventBoat]).toEqual([1, PT_GUN_EV_SUNK, 0]);
    }
    // 航過中でない PT が沈んでも、航過中の PT の航過はそのまま
    const q = passing(2, 3);
    expect(hitPt(q, P, 1, DMG, 0, logged().ev)).toBe(PT_FATE_SUNK);
    expect([q.owner, q.seqPending, q.passes, q.boats[1]!.phase, q.boats[0]!.phase]).toEqual([0, false, 0, PT_SUNK, PT_PASS]);
  });

  it(`fire_chance ≤ u < fire_chance + casualty_chance（${P.fireChance + P.casualtyChance}）: 死傷で撃退。航過中でない PT はすぐ去る（onLeave）。その上は何もなし（HP が ${P.retreatHp} より上なら）`, () => {
    const at = (u: number): { q: PtSection; f: number; log: [string, number][] } => {
      const q = passing(2, 3);
      const { log, ev } = logged();
      return { q, f: hitPt(q, P, 1, DMG, u, ev), log };
    };
    for (const u of [P.fireChance, 0.01, P.fireChance + P.casualtyChance - 1e-9]) {
      const { q, f, log } = at(u);
      const b = q.boats[1]!;
      expect(f).toBe(PT_FATE_CREW);
      expect([b.phase, b.timerS, b.fate, q.retired, q.sunk, q.gunEventSeq, q.gunEvent, q.gunEventBoat]).toEqual([PT_LEAVE, 0, PT_FATE_CREW, 1, 0, 1, PT_GUN_EV_CREW, 1]);
      expect(log).toEqual([['leave', 1]]);
      expect(q.owner).toBe(0); // 航過中の PT0 はそのまま
    }
    for (const u of [P.fireChance + P.casualtyChance, 0.5, 0.999]) {
      const { q, f, log } = at(u);
      const b = q.boats[1]!;
      expect(f).toBe(PT_FATE_NONE);
      expect([b.phase, b.fate, b.hp, b.hitsTaken, q.gunHits, q.retired, q.gunEventSeq]).toEqual([PT_RUN_IN, PT_FATE_NONE, P.hullHp - DMG, 1, 1, 0, 0]);
      expect(log).toEqual([]);
    }
  });

  it(`HP が retreat_hp（${P.retreatHp}）以下で穴だらけの撃退: 100 から 2 ずつ ${(P.hullHp - P.retreatHp) / DMG} 発目で去る（HP だけでは沈まない）`, () => {
    const q = createPtSection(P, 24);
    q.boats[1]!.phase = PT_RUN_IN;
    const { log, ev } = logged();
    const n = (P.hullHp - P.retreatHp) / DMG;
    const fates: number[] = [];
    for (let k = 0; k < n; k++) fates.push(hitPt(q, P, 1, DMG, 0.5, ev));
    expect(fates.slice(0, n - 1).every((f) => f === PT_FATE_NONE)).toBe(true);
    expect(fates[n - 1]).toBe(PT_FATE_HULL);
    expect([q.boats[1]!.hp, q.boats[1]!.phase, q.retired, q.gunEvent, q.gunEventSeq, q.sunk]).toEqual([P.retreatHp, PT_LEAVE, 1, PT_GUN_EV_HULL, 1, 0]);
    expect(log).toEqual([['leave', 1]]);
    expect(P.retreatHp).toBeGreaterThan(0); // HP 0 に届く前に去る（data の検査 retreat_hp < hull_hp）
  });

  it('航過中の PT の撃退: 航過（赤い線）は続くが黙る（弾 0・もう撃たない）。固めた針路のまま抜け、終わりで去る（onPassEnd → onLeave）。結末は 1 回、黙った PT にも引火はある', () => {
    const q = passing(2, 3);
    const { log, ev } = logged();
    expect(hitPt(q, P, 0, DMG, 0.01, ev)).toBe(PT_FATE_CREW);
    const b = q.boats[0]!;
    expect([b.phase, q.owner, b.roundsLeft, b.fate, q.retired]).toEqual([PT_PASS, 0, 0, PT_FATE_CREW, 1]);
    expect(log).toEqual([]);
    // 2 度目の結末は無い（HP が低くても・死傷の u でも）
    b.hp = P.retreatHp - 10;
    expect(hitPt(q, P, 0, DMG, 0.01, ev)).toBe(PT_FATE_CREW);
    expect(hitPt(q, P, 0, DMG, 0.5, ev)).toBe(PT_FATE_CREW);
    expect([q.retired, q.gunEventSeq, b.hitsTaken]).toEqual([1, 1, 3]);
    // 航過を最後まで: 撃たず、針路は固めたまま、owner は終わりまで 0
    const c = check({ x: 3000, y: 2200, headingDeg: 0, speedMps: 0 });
    let steps = 0;
    while (b.phase === PT_PASS && steps < 60 * 10) {
      c.timeS += DT;
      stepPtSection(q, P, c, new SeededRng(1), DT, DT * TS, ev);
      if (b.phase === PT_PASS) {
        expect(q.owner).toBe(0);
        expect(b.headingDeg).toBeCloseTo(b.lockDeg, 9);
      }
      steps++;
    }
    expect(log).toEqual([['end', 0], ['leave', 0]]);
    expect([b.phase, q.owner, q.passes, q.shots]).toEqual([PT_LEAVE, -1, 1, 0]);
    // 黙った PT は航過の終わりまで生きている（ptLive）＝引火なら沈む。撃退の数はそのまま
    const q2 = passing(2, 3);
    hitPt(q2, P, 0, DMG, 0.01, ev);
    expect(hitPt(q2, P, 0, DMG, 0, ev)).toBe(PT_FATE_SUNK);
    expect([q2.retired, q2.sunk, q2.owner, q2.gunEventSeq, q2.gunEvent]).toEqual([1, 1, -1, 2, PT_GUN_EV_SUNK]);
  });

  it('沈めた後も次の航過まで pass_gap_s（航過は同時に 1 隻・間隔の公平さ F2）: 40 夜、航過の 1 秒目で沈めると、次に固めるのは pass_gap_s より後。沈めた航過で onPassEnd は呼ばれない', () => {
    let sinks = 0;
    let nextCommits = 0;
    let minGap = Infinity;
    for (let seed = 1; seed <= 40; seed++) {
      let sunkAt = NaN;
      let ends = 0;
      runPtSim({
        seed, steps: 60 * 170, night: true, stopAtHome: true,
        policy: (s) => {
          s.input.headingDeg = bearingDeg(s.boat.x, s.boat.y, HOME.x, HOME.y);
          s.input.speed01 = s.t < 1 ? 0 : CRUISE01;
        },
        ev: (s) => ({
          onCommit: () => {
            if (Number.isNaN(sunkAt) || s.m['counted'] === 1) return;
            s.m['counted'] = 1;
            nextCommits++;
            minGap = Math.min(minGap, s.t - sunkAt);
          },
          onPassEnd: (i) => {
            if (s.q.boats[i]!.phase === PT_SUNK) ends++;
          },
        }),
        onStep: (s) => {
          if (!Number.isNaN(sunkAt) || s.q.owner < 0) return;
          const b = s.q.boats[s.q.owner]!;
          if (b.timerS < 1) return;
          hitPt(s.q, s.p, s.q.owner, DMG, 0, events());
          sunkAt = s.t;
          sinks++;
        },
      });
      expect(ends).toBe(0);
    }
    expect(sinks).toBeGreaterThan(30);
    expect(nextCommits).toBeGreaterThan(20);
    expect(minGap).toBeGreaterThanOrEqual(P.passGapS - DT);
  });

  it('沈んだ PT は動かず・撃たず・脅威の PT（threatIndex）にならず・標的でない（ptLive）。夜明けでも去らず（onLeave なし）、残りの PT だけが去る', () => {
    const q = createPtSection(P, 24);
    hitPt(q, P, 0, DMG, 0, events());
    const b = q.boats[0]!;
    const x0 = b.x;
    const y0 = b.y;
    const { log, ev } = logged();
    // 艇は沈んだ PT の 200 m 南・PT1 の近く（PT1 は見つけて突撃する）
    const c = check({ x: 2000, y: 2400, headingDeg: 0, speedMps: 0 });
    for (let k = 0; k < 60 * 30; k++) {
      c.timeS += DT;
      stepPtSection(q, P, c, new SeededRng(3), DT, DT * TS, ev);
      expect([b.x, b.y, b.phase]).toEqual([x0, y0, PT_SUNK]);
      expect(threatIndex(q, c.boat.x, c.boat.y)).not.toBe(0);
      if (q.owner >= 0) expect(q.owner).toBe(1);
    }
    expect(log.some(([k, i]) => k === 'fire' && i === 1)).toBe(true); // PT1 は撃つ
    expect(log.filter(([, i]) => i === 0)).toEqual([]);
    expect([ptLive(b), ptNeverBlocked(b), ptLive(q.boats[1]!)]).toEqual([false, false, ptFighting(q.boats[1]!.phase)]);
    c.dawn = true;
    log.length = 0;
    stepPtSection(q, P, c, new SeededRng(3), DT, DT * TS, ev);
    expect(log).toEqual([['leave', 1]]);
    expect([b.phase, q.boats[1]!.phase, q.leftAtDawn]).toEqual([PT_SUNK, PT_LEAVE, true]);
    for (let k = 0; k < 60 * 60; k++) stepPtSection(q, P, c, new SeededRng(3), DT, DT * TS, ev);
    expect([b.phase, q.boats[1]!.phase, q.out, q.detected]).toEqual([PT_SUNK, PT_OUT, 1, false]);
  });
});

/** PT0 が追撃中（艇の左後ろ 170 m・北へ 20 kt）か連射中（予告から 3 秒・2 発撃った）、PT1 は突撃。艇は (3000, 2000) を北へ 20 kt（最後に見た位置と速度） */
function chasing(burst: boolean): PtSection {
  const q = createPtSection(P, 24);
  Object.assign(q, { detected: true, holdLeftS: P.detectHoldS, lkX: 3000, lkY: 2000, lkVx: 0, lkVy: -ktToMps(20), lkHeadingDeg: 0 });
  Object.assign(q.boats[0]!, { x: 2880, y: 2120, headingDeg: 0, speedMps: ktToMps(20), phase: PT_CHASE, side: -1 });
  if (burst) {
    Object.assign(q.boats[0]!, { phase: PT_PASS, burst: true, timerS: 3, roundsLeft: P.burstRounds - 2, firedThisPass: 2, lockDeg: 45 });
    Object.assign(q, { owner: 0, commitAtS: 7 });
  }
  Object.assign(q.boats[1]!, { x: 2500, y: 2600, phase: PT_RUN_IN, speedMps: P.runInMps });
  return q;
}

describe(`制圧（v0.6.3 実機 2 回目。hitPt の結末の無い命中を追撃中・連射中の PT だけ数え、${P.chaseSuppressHits} 発で追撃をやめる）`, () => {
  const U_NONE = 0.5; // 結末の無い u（引火・死傷の外）

  it(`待っている追撃の PT: ${P.chaseSuppressHits} 発目で制圧（離脱。最後に見た艇から離れる向き・連射 1 回分を使う・HUD の出来事）。去らない（onLeave なし）`, () => {
    const q = chasing(false);
    const b = q.boats[0]!;
    const { log, ev } = logged();
    for (let k = 1; k < P.chaseSuppressHits; k++) {
      expect(hitPt(q, P, 0, DMG, U_NONE, ev)).toBe(PT_FATE_NONE);
      expect([b.phase, b.chaseHits, b.suppressed, q.suppressions, q.gunEventSeq]).toEqual([PT_CHASE, k, false, 0, 0]);
    }
    expect(hitPt(q, P, 0, DMG, U_NONE, ev)).toBe(PT_FATE_NONE);
    expect([b.phase, b.suppressed, b.chaseHits, b.bursts, b.timerS, b.fate, q.suppressions, q.suppressSeq, q.retired]).toEqual([PT_BREAK, true, 0, 1, 0, PT_FATE_NONE, 1, 1, 0]);
    expect(b.lockDeg).toBeCloseTo(bearingDeg(q.lkX, q.lkY, b.x, b.y), 9);
    expect([q.gunEventSeq, q.gunEvent, q.gunEventBoat]).toEqual([1, PT_GUN_EV_SUPPRESS, 0]);
    expect(log).toEqual([]);
    // 制圧された PT にもう制圧は無い（離脱中は数えない）。追撃に入り直すと数え直す（core/pt-chase の startChase）
    for (let k = 0; k < 5; k++) hitPt(q, P, 0, DMG, U_NONE, ev);
    expect([q.suppressions, b.bursts, b.chaseHits]).toEqual([1, 1, 0]);
  });

  it('連射中の PT: 3 発目で黙る（弾 0・赤い線は窓の終わりまで残る）→ 連射の終わり（open_fire_s + burst_max_s）で離脱。撃った連射と制圧で 2 回分を使う', () => {
    const q = chasing(true);
    const b = q.boats[0]!;
    const { log, ev } = logged();
    for (let k = 0; k < P.chaseSuppressHits; k++) hitPt(q, P, 0, DMG, U_NONE, ev);
    expect([b.phase, b.burst, q.owner, b.roundsLeft, b.suppressed, b.bursts, q.suppressions, q.gunEvent]).toEqual([PT_PASS, true, 0, 0, true, 1, 1, PT_GUN_EV_SUPPRESS]);
    const c = check({ x: 3000, y: 2000, headingDeg: 0, speedMps: ktToMps(20) }, { detectOpenM: 5000 });
    let endAt = NaN;
    for (let k = 0; k < 60 * 5 && b.phase === PT_PASS; k++) {
      c.timeS += DT;
      stepPtSection(q, P, c, new SeededRng(1), DT, DT * TS, ev);
      if (b.phase !== PT_PASS) endAt = b.timerS === 0 ? 3 + (k + 1) * DT : NaN;
    }
    expect(endAt).toBeGreaterThanOrEqual(P.openFireS + P.burstMaxS - 1e-9); // 黙っても窓の終わりまで線を残す
    expect(endAt).toBeLessThanOrEqual(P.openFireS + P.burstMaxS + 2 * DT);
    expect(log.filter(([k]) => k === 'fire')).toEqual([]);
    expect(log).toEqual([['end', 0]]);
    expect([b.phase, b.burst, q.owner, b.bursts, q.bursts, q.firedBursts]).toEqual([PT_BREAK, false, -1, 2, 1, 1]);
  });

  it('結末が先: 引火・死傷・HP の結末になる命中は制圧に数えない（追撃の PT は撃退なら去り、沈めば沈む）。突撃・航過中の PT の命中は数えない', () => {
    for (const [u, hp, fate, phase] of [[0, P.hullHp, PT_FATE_SUNK, PT_SUNK], [P.fireChance, P.hullHp, PT_FATE_CREW, PT_LEAVE], [U_NONE, P.retreatHp + DMG, PT_FATE_HULL, PT_LEAVE]] as const) {
      const q = chasing(false);
      const b = q.boats[0]!;
      Object.assign(b, { hp, chaseHits: P.chaseSuppressHits - 1 });
      expect(hitPt(q, P, 0, DMG, u, logged().ev)).toBe(fate);
      expect([b.phase, b.suppressed, b.chaseHits, q.suppressions, b.bursts]).toEqual([phase, false, P.chaseSuppressHits - 1, 0, 0]);
    }
    const q = passing(2, 3); // PT0 は航過中（連射でない）、PT1 は突撃
    for (let k = 0; k < 5; k++) {
      hitPt(q, P, 0, DMG, U_NONE, logged().ev);
      hitPt(q, P, 1, DMG, U_NONE, logged().ev);
    }
    expect([q.boats[0]!.chaseHits, q.boats[1]!.chaseHits, q.suppressions, q.boats[0]!.roundsLeft]).toEqual([0, 0, 0, P.roundsPerPass - 2]);
  });
});

describe('13mm を受けたときの検査（core/pt-data の under_fire。崩れたら jp_05 を付けて例外）', () => {
  type Rec = Record<string, unknown>;
  const fire = (k: string, v: number): (() => unknown) => () => {
    const d = JSON.parse(JSON.stringify(gameData)) as typeof gameData;
    ((d.enemies.enemies as unknown as Rec[]).find((e) => e['id'] === 'us_pt_enemy')!['under_fire'] as Rec)[k] = v;
    return getPtParams(d, getPrototypeMission(d, 'jp_05'), TS);
  };
  it('retreat_hp ≥ HP 100（HP だけで沈む）・確率 > 0.2 は例外、境目 0.2 は通る', () => {
    for (const [k, v, re] of [['retreat_hp', 100, /retreat_hp/], ['retreat_hp', 120, /retreat_hp/], ['fire_chance', 0.21, /fire_chance/], ['casualty_chance', 0.2001, /casualty_chance/]] as const) {
      expect(fire(k, v), `${k} ${v}`).toThrow(/jp_05/);
      expect(fire(k, v), `${k} ${v}`).toThrow(re);
    }
    expect(fire('fire_chance', 0.2)).not.toThrow();
  });
});
