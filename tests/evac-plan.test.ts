// v0.6.11 S2（spec-v0611-r2 §3.7・§8 の段 5・§13 の S2）: 空襲の段取り（core/evac-plan）と 1 ステップの空襲（core/evac-air）。
// 狙いの順（枠 0＝操作中の隊・段 B を先・現れる点に近い順・1 隊 1 編隊・候補が尽きた枠は来ない・2 つ目は操作中の隊に付けない＝r2 M6・M7-5）・方位の戻し（r2 L1）・
// 1 回だけ飛ぶ（B1）・始まる前に隠れたら始めない・試し直し・旋回率が跳ばない・隊を追う付け替えと全滅（r2 H2）・中断の後も爆弾は落ち、止めた後に絵が残らない（r2 M2）・
// 撃墜の後も済みになる（r2 H6）・決着のラッチ・「狙われている」（r2 M13）・乱数の引く回数（+29・+31）・決定性。
import { describe, expect, it } from 'vitest';
import { downStrikePlane } from '../src/core/air-down';
import { AS_DONE, AS_IDLE, AS_RUN, bombInAir, createAirStrike, stepAirStrike, type AirStrikeCheck } from '../src/core/air-strike';
import { airSortieComplete, createSortieBase, restartAirSortie } from '../src/core/air-sortie';
import { dawnReached } from '../src/core/dawn-air';
import { evacDrawPass } from '../src/core/evac-air';
import { G_GONE, G_HIDDEN, G_UNDERWAY } from '../src/core/evac-data';
import { EF_ANNOUNCED, EF_FLYING, EF_OFF, EO_DONE, EO_GONE, EO_LOST, EO_LOST_EARLY, EO_NO_TARGET, evacAnnounce, evacFlightLive, evacRefreshView, evacTryStart, type EvacFlight } from '../src/core/evac-plan';
import { evacSinkLeader } from '../src/core/evac-seat';
import { evacLeader, evacSurvivors } from '../src/core/evac-squadron';
import { wrapDeg180 } from '../src/core/units';
import { DT, NEUTRAL } from './evac-kit';
import { HARD, NORMAL, countDraws, forceHidden, makeAirRig, runAir, runAirUntil, type AirRig } from './evac-air-kit';

const RAID = NORMAL.evac!.raid;
const TURN = NORMAL.boatParams.turnRateDegS;
const targets = (r: AirRig, w: number): number[] => r.air.plan.flights.filter((f) => f.wave === w).map((f) => f.target);
const flight = (r: AirRig, i: number): EvacFlight => r.air.plan.flights[i]!;
/** 予告の後の最初の操作していない隊を狙う編隊（ノーマルの枠 1） */
const aiFlight = (r: AirRig, w = 0): EvacFlight => r.air.plan.flights.find((f) => f.wave === w && f.target >= 0 && f.target !== r.sq.control)!;

describe('狙い（予告の瞬間。乱数なし）', () => {
  it('枠 0 は操作中の隊、ほかの枠は走っている隊（段 B）を先・その枠の現れる点に近い順、尽きたら止まっている隊（段 A）', () => {
    const r = makeAirRig(1, true);
    for (const gi of [1, 2, 3, 4, 5]) r.sq.groups[gi]!.phase = G_UNDERWAY;
    evacAnnounce(r.air.plan, 0);
    // 枠 1 の点（70°）に近い走る隊は第4隊、枠 2（100°）は第3隊（第4隊は狙い済み）
    expect(targets(r, 0)).toEqual([0, 3, 2]);
    const s = makeAirRig(1, true);
    s.sq.groups[5]!.phase = G_UNDERWAY;
    s.sq.groups[1]!.phase = G_UNDERWAY;
    evacAnnounce(s.air.plan, 0);
    // 第4隊（止まっている）は枠 1 の点にいちばん近いが、走っている第6隊・第2隊が先（r2 M6）
    expect(targets(s, 0)).toEqual([0, 5, 1]);
    expect([s.air.plan.tierB, s.air.plan.tierA]).toEqual([2, 0]);
    const u = makeAirRig(1, true);
    u.sq.groups[5]!.phase = G_UNDERWAY;
    evacAnnounce(u.air.plan, 0);
    expect(targets(u, 0)).toEqual([0, 5, 3]);
    expect([u.air.plan.tierB, u.air.plan.tierA]).toEqual([1, 1]);
  });

  it('同じ隊を 2 編隊が狙わない（1 隊 1 編隊は段をまたぐ）。予告の全部で（ハード・seed 1〜12）', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const r = makeAirRig(seed, true);
      runAir(r, NEUTRAL, 200);
      for (let w = 0; w < RAID.waves.length; w++) {
        const t = targets(r, w).filter((g) => g >= 0);
        expect(new Set(t).size).toBe(t.length);
      }
    }
  });

  it('候補が尽きた枠の編隊は来ない。flights_per_group_max 2 でも 2 つ目は候補が尽きた枠だけ・操作中の隊には付けない（r2 M7-5）', () => {
    const r = makeAirRig(1);
    for (const gi of [1, 2, 3, 4, 5]) forceHidden(r, gi);
    evacAnnounce(r.air.plan, 0);
    expect(targets(r, 0)).toEqual([0, -1]);
    expect([flight(r, 1).phase, flight(r, 1).outcome]).toEqual([EF_OFF, EO_NO_TARGET]);
    const h = makeAirRig(1, true, {}, undefined, { flightsPerGroupMax: 2 });
    for (const gi of [1, 2, 4, 5]) forceHidden(h, gi);
    h.sq.groups[3]!.phase = G_UNDERWAY;
    evacAnnounce(h.air.plan, 0);
    expect(targets(h, 0)).toEqual([0, 3, 3]);
    const c = makeAirRig(1, true, {}, undefined, { flightsPerGroupMax: 2 });
    for (const gi of [1, 2, 3, 4, 5]) forceHidden(c, gi);
    evacAnnounce(c.air.plan, 0);
    expect(targets(c, 0)).toEqual([0, -1, -1]);
  });

  it('操作中の隊が隠れていれば、枠 0 もほかの枠と同じ選び方（段 B を先・枠 0 の点に近い順）', () => {
    const r = makeAirRig(1);
    forceHidden(r, 0);
    r.sq.groups[2]!.phase = G_UNDERWAY;
    r.sq.groups[4]!.phase = G_UNDERWAY;
    evacAnnounce(r.air.plan, 0);
    expect(targets(r, 0)).toEqual([2, 4]);
  });

  it('始めると機の平均の方位が枠の方位 ±1°（bearing_fix_deg が凍結の spawn_offsets_deg の偏りを戻す。r2 L1）・距離は spawn_m', () => {
    for (const w of [0, 1, 3]) {
      const r = makeAirRig(1, true);
      evacAnnounce(r.air.plan, w);
      for (const fl of r.air.plan.flights.filter((f) => f.wave === w)) {
        evacTryStart(r.air.plan, fl);
        const st = fl.port.state;
        expect(fl.phase).toBe(EF_FLYING);
        const want = RAID.fromBearingDeg + RAID.flightOffsetsDeg[fl.slot]!;
        const mean = st.planes.reduce((a, pl) => a + wrapDeg180(pl.bearingDeg - want), 0) / st.planes.length;
        expect(st.planes.length).toBe(RAID.waves[w]!.planes);
        expect(Math.abs(mean)).toBeLessThanOrEqual(1);
        for (const pl of st.planes) expect(pl.r).toBe(RAID.spawnM);
        expect(fl.view.boat.state).toBe(evacLeader(r.sq.groups[fl.target]!)!.state);
      }
    }
  });
});

describe('始める・1 回だけ飛ぶ（B1）', () => {
  it('1 予告で state.waves が 1 だけ増え、済みの後 60 秒ステップし続けても 2 波目が出ない（atHome を真のまま。外せば出る）', () => {
    let checked = 0;
    for (let seed = 1; seed <= 8 && checked < 3; seed++) {
      const r = makeAirRig(seed);
      runAirUntil(r, NEUTRAL, 65);
      for (const fl of r.air.plan.flights.filter((f) => f.wave === 0 && f.outcome === EO_DONE)) {
        checked++;
        const st = fl.port.state;
        expect([st.waves, fl.complete, fl.view.atHome, evacFlightLive(fl)]).toEqual([1, true, true, false]);
        for (let i = 0; i < 60 / DT; i++) {
          evacRefreshView(r.air.plan, fl);
          fl.port.step(DT, fl.view);
        }
        expect([st.waves, airSortieComplete(st), st.planes.every((p) => p.phase === AS_DONE)]).toEqual([1, true, true]);
        // 歯: 済みの印を外した view なら、凍結の core は wave_rest_s 後に同じ中心へ 2 波目を出す（その時は cancelled も下ろす＝新しい編隊の状態の時と同じ）
        st.cancelled = false;
        fl.port.step(DT, { ...fl.view, atHome: false });
        expect(st.waves).toBe(2);
      }
      for (const fl of r.air.plan.flights) expect(fl.port.state.waves).toBeLessThanOrEqual(fl.wave === 0 && fl.outcome === EO_DONE ? 2 : 1);
    }
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it('予告から始まる前に狙った隊が隠れたら始めない（見失った・引き返す）。「狙われている」は予告から始まりまで真で、見失えば偽', () => {
    const r = makeAirRig(1);
    runAirUntil(r, NEUTRAL, 16);
    const fl = aiFlight(r);
    expect([fl.phase, r.sq.targeted[fl.target]]).toEqual([EF_ANNOUNCED, 1]);
    forceHidden(r, fl.target);
    let lostAt = -1;
    runAirUntil(r, NEUTRAL, 26, () => void (r.air.plan.evLost & (1 << fl.index) && (lostAt = r.t)));
    expect([fl.phase, fl.outcome, fl.port.state.started, r.sq.targeted[fl.target]]).toEqual([EF_OFF, EO_LOST_EARLY, false, 0]);
    expect(dawnReached(RAID.waves[0]!.announceS + RAID.announceLeadS, lostAt) && !dawnReached(RAID.waves[0]!.announceS + RAID.announceLeadS, lostAt - DT)).toBe(true);
  });

  it('restartAirSortie が false（空中に爆弾）なら次のステップで試し直す。その間も「狙われている」', () => {
    const r = makeAirRig(1);
    runAirUntil(r, NEUTRAL, 16);
    const fl = aiFlight(r);
    fl.port.state.bombs[0]!.active = true;
    runAir(r, NEUTRAL, 15, () => r.air.plan.restartDelayed > 0);
    expect([fl.phase, fl.port.state.started, r.sq.targeted[fl.target]]).toEqual([EF_ANNOUNCED, false, 1]);
    runAir(r, NEUTRAL, 0.5);
    expect(fl.phase).toBe(EF_ANNOUNCED);
    fl.port.state.bombs[0]!.active = false;
    const came = r.air.plan.came;
    runAir(r, NEUTRAL, DT);
    expect([fl.phase, fl.port.state.started, r.air.plan.came]).toEqual([EF_FLYING, true, came + 1]);
  });

  it('始め直しの最初のステップから旋回率が跳ばない（restartAirSortie が中心の針路を前の針路に書く）', () => {
    const r = makeAirRig(2);
    runAirUntil(r, NEUTRAL, 24.9);
    const fl = aiFlight(r);
    const g = r.sq.groups[fl.target]!;
    const lead = evacLeader(g)!;
    expect(g.phase).toBe(G_UNDERWAY);
    g.aiHeadingDeg = lead.state.headingDeg + 150;
    g.dodgeLeftS = 5;
    const yaw: number[] = [];
    runAir(r, NEUTRAL, 3, () => void (fl.phase === EF_FLYING && yaw.length < 30 && yaw.push(fl.port.state.yawDegS)));
    expect(yaw.length).toBe(30);
    for (const y of yaw) expect(Math.abs(y)).toBeLessThanOrEqual(TURN + 1e-6);
    expect(Math.max(...yaw.map(Math.abs))).toBeGreaterThan(5);
  });
});

describe('隊を追う（r2 H2）・全滅で去る', () => {
  it('隊長艇が沈むと編隊の中心は次の隊長艇へ（次の投下はその艇の上から）・付け替えの次のステップの旋回率は跳ばない・全滅で cancel', () => {
    const r = makeAirRig(1);
    for (const b of r.sq.boats) b.damage.hp = 1e9;
    r.seat.damage.hp = 1e9;
    runAirUntil(r, NEUTRAL, 24);
    const fl = aiFlight(r);
    const g = r.sq.groups[fl.target]!;
    const st = fl.port.state;
    runAir(r, NEUTRAL, 30, () => st.bombsDropped >= 1 && !bombInAir(st));
    // 隊長艇が曲がり、僚艇の針路と隊長艇の針路が離れた所で沈める（付け替えで prevHeadingDeg を書かなければ旋回率は 60°/秒を超える）
    g.aiHeadingDeg = evacLeader(g)!.state.headingDeg + 120;
    g.dodgeLeftS = 3;
    runAir(r, NEUTRAL, 0.7);
    const old = evacLeader(g)!;
    const yawBefore = st.yawDegS;
    evacSinkLeader(r.sq, r.seat, g.index, r.t, r.air.hooks);
    const next = evacLeader(g)!;
    expect(next).not.toBe(old);
    expect(Math.abs(wrapDeg180(next.state.headingDeg - old.state.headingDeg))).toBeGreaterThan(5);
    expect([fl.view.boat.state === next.state, st.prevHeadingDeg]).toEqual([true, next.state.headingDeg]);
    runAir(r, NEUTRAL, DT);
    expect(Math.abs(st.yawDegS)).toBeLessThanOrEqual(TURN + 1e-6);
    expect(Math.abs(yawBefore)).toBeLessThanOrEqual(TURN + 1e-6);
    const dropped = st.bombsDropped;
    runAir(r, NEUTRAL, 20, () => st.bombsDropped > dropped);
    const b = st.bombs[st.lastRelease]!;
    expect([b.fromX, b.fromY, st.cancelled]).toEqual([next.state.x, next.state.y, false]);
    // 全滅: 残りの 2 隻を沈める → 次のステップで凍結の core が cancel（空中の爆弾は落ちる）
    evacSinkLeader(r.sq, r.seat, g.index, r.t, r.air.hooks);
    evacSinkLeader(r.sq, r.seat, g.index, r.t, r.air.hooks);
    expect([g.phase, fl.view.boat.sinking]).toEqual([G_GONE, true]);
    const inAir = bombInAir(st);
    const imp = r.air.plan.impacts;
    runAir(r, NEUTRAL, DT);
    expect([st.cancelled, fl.outcome, r.sq.targeted[g.index]]).toEqual([true, EO_GONE, 0]);
    runAir(r, NEUTRAL, 5);
    expect(r.air.plan.impacts).toBeGreaterThanOrEqual(imp + (inAir ? 1 : 0));
    expect(evacFlightLive(fl)).toBe(false);
  });
});

describe('動く編隊（r2 M2）と撃墜の後（r2 H6）', () => {
  it('中断の後も空中の爆弾は着弾まで step され、止まったフレームに 1 回だけ描いて機・線・爆弾が見えなくなる（Phaser なしの偽物）', () => {
    const r = makeAirRig(1);
    const shown = new Map<number, { calls: number; planes: number; line: boolean; bombs: number }>();
    const draw = (i: number): void => {
      const st = r.air.plan.flights[i]!.port.state;
      const v = shown.get(i) ?? { calls: 0, planes: 0, line: false, bombs: 0 };
      v.calls++;
      v.planes = st.planes.filter((p) => p.phase !== AS_IDLE && p.phase !== AS_DONE).length;
      v.line = st.planes.some((p) => p.phase === AS_RUN);
      v.bombs = st.bombs.filter((b) => b.active).length;
      shown.set(i, v);
    };
    runAirUntil(r, NEUTRAL, 24, () => evacDrawPass(r.air.plan, draw));
    const fl = aiFlight(r);
    const st = fl.port.state;
    runAir(r, NEUTRAL, 30, () => (evacDrawPass(r.air.plan, draw), bombInAir(st)));
    expect(bombInAir(st)).toBe(true);
    forceHidden(r, fl.target);
    const g = r.sq.groups[fl.target]!;
    const hp = g.boats.map((b) => b.damage.hp);
    const imp = r.air.plan.impacts;
    runAir(r, NEUTRAL, DT, () => evacDrawPass(r.air.plan, draw));
    expect([st.cancelled, fl.outcome, bombInAir(st), evacFlightLive(fl)]).toEqual([true, EO_LOST, true, true]);
    runAir(r, NEUTRAL, 3, () => (evacDrawPass(r.air.plan, draw), !bombInAir(st)));
    // 中断の後も step したので空中の爆弾は落ちた（止めていれば active のまま残る）。隠れた隊には当たらない
    expect([bombInAir(st), r.air.plan.impacts >= imp + 1]).toEqual([false, true]);
    expect(g.boats.map((b) => b.damage.hp)).toEqual(hp);
    runAir(r, NEUTRAL, 10, () => (evacDrawPass(r.air.plan, draw), !evacFlightLive(fl)));
    expect(evacFlightLive(fl)).toBe(false);
    const calls = shown.get(fl.index)!.calls;
    evacDrawPass(r.air.plan, draw);
    runAir(r, NEUTRAL, 2, () => evacDrawPass(r.air.plan, draw));
    const last = shown.get(fl.index)!;
    expect([last.calls - calls, last.planes, last.line, last.bombs]).toEqual([0, 0, false, 0]);
  });

  it('evac の編隊の機を 1 機落としても残りの爆弾が落ちて済みになる（skipDownedRuns）。落とさない編隊は全部落とす', () => {
    const r = makeAirRig(1);
    for (const b of r.sq.boats) b.damage.hp = 1e9;
    r.seat.damage.hp = 1e9;
    const w1 = r.air.plan.flights.filter((f) => f.wave === 1);
    runAirUntil(r, NEUTRAL, 70 + 10 + 0.5);
    expect(w1.map((f) => f.phase)).toEqual([EF_FLYING, EF_FLYING]);
    expect(downStrikePlane(w1[1]!.port.state, 1)).toBe(true);
    runAirUntil(r, NEUTRAL, 124);
    expect(w1.map((f) => [f.complete, f.outcome, f.port.state.bombsDropped])).toEqual([[true, EO_DONE, 6], [true, EO_DONE, 4]]);
    // 歯: skipDownedRuns なしの凍結の core だけでは、撃墜した機の順番で止まり済みにならない
    const p = w1[1]!.p;
    const raw = createAirStrike(p);
    const boat = { x: 1600, y: 600, headingDeg: 0, speedMps: 0 };
    restartAirSortie(raw, p, boat, 70, RAID.spawnM, createSortieBase());
    downStrikePlane(raw, 1);
    const c: AirStrikeCheck = { player: boat, playerSinking: false, escort: null, escortAfloat: false, cancel: false };
    for (let i = 0; i < 40 / DT; i++) stepAirStrike(raw, p, c, w1[1]!.rng, DT);
    expect(airSortieComplete(raw)).toBe(false);
  });
});

describe('決着・「狙われている」・乱数・決定性', () => {
  it('決着のラッチは dawnReached(duration_s) と同じステップ。決着の後は予告しない', () => {
    const r = makeAirRig(3);
    let at = -1;
    runAir(r, NEUTRAL, 241, () => {
      expect(r.sq.settled).toBe(dawnReached(NORMAL.durationS, r.t));
      if (r.air.plan.evSettle) at = r.t;
    });
    expect(dawnReached(NORMAL.durationS, at) && !dawnReached(NORMAL.durationS, at - DT)).toBe(true);
  });

  it('「狙われている」は予告から（始まる前も）、始まった後は動いていて中断していない間だけ', () => {
    const r = makeAirRig(4);
    runAir(r, NEUTRAL, 240, () => {
      const p = r.air.plan;
      for (let gi = 0; gi < r.sq.groups.length; gi++) {
        const want = p.flights.some((f) => f.target === gi && (f.phase === EF_ANNOUNCED || (evacFlightLive(f) && !f.port.state.cancelled)));
        expect(r.sq.targeted[gi]).toBe(want ? 1 : 0);
      }
      if (r.t < RAID.waves[0]!.announceS - DT) expect(Array.from(r.sq.targeted)).toEqual([0, 0, 0, 0, 0, 0]);
    });
  });

  it('+29 は予告ごとに 2 回（陰 2 か所）、+31 は投下ごとに 1 回。同じ seed なら同じ結果（ノーマル・ハード）', () => {
    for (const hard of [false, true]) {
      const r = makeAirRig(7, hard);
      const reveal = countDraws(r.air.plan.reveal);
      const dodge = countDraws(r.air.dodge);
      runAir(r, NEUTRAL, 240);
      expect(reveal()).toBe(2 * RAID.waves.length);
      expect(dodge()).toBe(r.air.plan.releases);
      expect(r.air.plan.releases).toBe(r.air.plan.flights.reduce((a, f) => a + f.port.state.bombsDropped, 0));
      const s = makeAirRig(7, hard);
      runAir(s, NEUTRAL, 240);
      const key = (x: AirRig): string => `${evacSurvivors(x.sq)}|${x.air.plan.flights.map((f) => `${f.outcome}${f.target}${f.port.state.bombsDropped}`).join(',')}|${x.log.recordHits.join(',')}`;
      expect(key(s)).toBe(key(r));
      expect(r.air.plan.flights.length).toBe(RAID.waves.length * (hard ? HARD.evac!.raid.flights : RAID.flights));
      expect(r.air.plan.flights.every((f) => f.port.state.waves <= 1)).toBe(true);
    }
  });

  it('確保は作る時だけ（編隊・view・状態・爆弾のプールの物が 240 秒で同じ）', () => {
    const r = makeAirRig(5, true);
    const before = r.air.plan.flights.map((f) => [f, f.view, f.view.boat, f.port, f.port.state, f.port.state.planes, f.port.state.bombs, f.rng, f.base] as const);
    runAir(r, NEUTRAL, 240);
    r.air.plan.flights.forEach((f, i) => [f, f.view, f.view.boat, f.port, f.port.state, f.port.state.planes, f.port.state.bombs, f.rng, f.base].forEach((x, k) => expect(x).toBe(before[i]![k])));
    expect(r.sq.groups.filter((g) => g.phase === G_HIDDEN).length).toBe(0);
  });
});
