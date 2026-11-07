// v0.6.11 S2（spec-v0611-r2 §3.7 の着弾・§13 の S2）: 着弾ごとの全艇の走査（core/evac-hits の evacImpact）。
// 落下中に隠れた中心には当たらない（r1 H2）・走査の順（隊番号・艇番号）と乱数の順・隊長艇の火災と機関はその編隊の系列から（僚艇は引かない）・
// 沈んだ記録は飛ばす・上げた艇は当たらない・決着の後は水柱だけ・座席は世界の口（hitSeat）・同じ着弾で座席の隊長艇が沈めば次の艇は新しい座席として読む（r2 H5）・
// 凍結の core の hitPlayer は KPI だけ（中心でない艇への命中は数えない）。
import { describe, expect, it } from 'vitest';
import { bombInAir } from '../src/core/air-strike';
import { G_FOUND, G_HAULING, G_HIDDEN } from '../src/core/evac-data';
import { evacImpact } from '../src/core/evac-hits';
import { EF_FLYING, type EvacFlight } from '../src/core/evac-plan';
import { EVAC_NO_HOOKS, evacSinkLeader, evacStoreSeatDamage, type EvacSeatHooks } from '../src/core/evac-seat';
import { evacLeader, type EvacBoat } from '../src/core/evac-squadron';
import { applyShellHit, createDamageState, type HitOutcome } from '../src/core/gunnery';
import { SeededRng } from '../src/core/rng';
import { NEUTRAL } from './evac-kit';
import { NORMAL, countDraws, makeAirRig, runAir, runAirUntil, type AirRig } from './evac-air-kit';

const BOMB = NORMAL.evac!.sorties[0]!.bombHit;
const HP = NORMAL.damageParams.maxHp;
const place = (b: EvacBoat, x: number, y: number, headingDeg = 90): void => void Object.assign(b.state, { x, y, headingDeg, speedMps: 0 });
const boatOf = (r: AirRig, gi: number, k: number): EvacBoat => r.sq.groups[gi]!.boats[k]!;

describe('着弾の走査（evacImpact）', () => {
  it('当たった艇は隊番号・艇番号の順に読む。隊長艇は applyShellHit（その編隊の系列から火災・機関の 2 回）、僚艇は HP だけ（引かない）', () => {
    const r = makeAirRig(1);
    place(boatOf(r, 2, 0), 1000, 300);
    place(boatOf(r, 2, 1), 1010, 300);
    place(boatOf(r, 3, 0), 1005, 320);
    const fl = r.air.plan.flights[0]!;
    const draws = countDraws(fl.rng);
    const other = countDraws(r.air.plan.flights[1]!.rng);
    expect(evacImpact(r.air, 0, 1005, 305)).toBe(3);
    expect(r.log.recordHits).toEqual([6, 7, 9]);
    expect([boatOf(r, 2, 0).damage.hp, boatOf(r, 2, 1).damage.hp, boatOf(r, 3, 0).damage.hp, boatOf(r, 2, 2).damage.hp]).toEqual([HP - 35, HP - 35, HP - 35, HP]);
    expect([draws(), other(), r.log.splashes, r.log.seatHits]).toEqual([4, 0, 0, 0]);
    // 同じ系列（seed+32＝波 0・枠 0）を新しく作り、第3隊 → 第4隊の隊長艇の順に引けば同じ火災・機関になる
    const rng = new SeededRng(1 + 32);
    const out: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
    for (const gi of [2, 3]) {
      const d = createDamageState(NORMAL.damageParams);
      applyShellHit(d, BOMB, NORMAL.damageParams, rng, out);
      expect([boatOf(r, gi, 0).damage.fireLeftS, boatOf(r, gi, 0).damage.engineDamaged]).toEqual([d.fireLeftS, d.engineDamaged]);
    }
    // 2 つ目の編隊（波 0・枠 1＝seed+33）の着弾はその系列から引く
    const before = draws();
    place(boatOf(r, 4, 0), 2000, 200);
    evacImpact(r.air, 1, 2000, 200);
    expect([draws() - before, other()]).toEqual([0, 2]);
  });

  it('何にも当たらなければ水柱。沈んだ記録は飛ばす（交代した次の隊長艇が遠ければ水柱）', () => {
    const sunk: number[] = [];
    const inner: EvacSeatHooks = { ...EVAC_NO_HOOKS, onBoatSunk: (b) => void sunk.push(b.index) };
    const r = makeAirRig(1, false, {}, inner);
    const g = r.sq.groups[2]!;
    place(g.boats[0]!, 1000, 300);
    place(g.boats[1]!, 1200, 300);
    place(g.boats[2]!, 1300, 300);
    evacSinkLeader(r.sq, r.seat, 2, 1, r.air.hooks);
    expect([g.leader, sunk]).toEqual([1, [6]]);
    expect(evacImpact(r.air, 0, 1000, 300)).toBe(0);
    expect([r.log.recordHits, r.log.splashes, sunk, g.boats[1]!.damage.hp]).toEqual([[], 1, [6], HP]);
  });

  it('上げた艇（up）は当たらない。隊が隠れれば隊ごと当たらない。決着の後は水柱だけ', () => {
    const r = makeAirRig(1);
    const g = r.sq.groups[2]!;
    g.phase = G_HAULING;
    for (const b of g.boats) place(b, 1000, 300);
    g.boats[2]!.up = true;
    evacImpact(r.air, 0, 1000, 300);
    expect(r.log.recordHits).toEqual([6, 7]);
    g.phase = G_HIDDEN;
    evacImpact(r.air, 0, 1000, 300);
    expect([r.log.recordHits.length, r.log.splashes]).toEqual([2, 1]);
    g.phase = G_HAULING;
    r.sq.settled = true;
    expect(evacImpact(r.air, 0, 1000, 300)).toBe(0);
    expect([r.log.recordHits.length, r.log.splashes, g.boats[0]!.damage.hp]).toEqual([2, 2, HP - 35]);
  });

  it('座席（操作中の隊長艇）は世界の口 hitSeat（記録には書かない）。同じ着弾で座席の隊長艇が沈めば、次の艇は新しい座席として読む（r2 H5）', () => {
    const r = makeAirRig(1);
    const g = r.sq.groups[0]!;
    // 停泊の縦列（12 m 間隔）の隊長艇に真上から: 3 隻とも爆風の内
    const lead = g.boats[0]!.state;
    expect(evacImpact(r.air, 0, lead.x, lead.y)).toBe(3);
    expect([r.log.seatHits, r.log.recordHits, r.seat.damage.hp]).toEqual([1, [1, 2], HP - 35]);
    // 座席の HP 35 → 1 発で沈む: 振り替えで第1隊の 2 番艇が隊長艇＝座席になり、同じ着弾の 2 隻目は座席として当たる（3 隻目は僚艇）
    const s = makeAirRig(1);
    s.seat.damage.hp = 35;
    const p = s.sq.groups[0]!.boats[0]!.state;
    evacImpact(s.air, 0, p.x, p.y);
    expect([s.log.seatHits, s.log.recordHits, s.sq.groups[0]!.leader, s.sq.control, s.log.seatSinking, s.sq.promotions]).toEqual([2, [2], 1, 0, false, 1]);
    expect([s.sq.groups[0]!.boats[0]!.sunk, s.sq.groups[0]!.boats[1]!.sunk, s.seat.damage.hp, s.sq.groups[0]!.boats[2]!.damage.hp]).toEqual([true, false, HP - 35, HP - 35]);
    evacStoreSeatDamage(s.sq, s.seat);
    expect(s.sq.groups[0]!.boats[1]!.damage.hp).toBe(HP - 35);
  });
});

describe('落下中の爆弾（凍結の core を通して）', () => {
  /** 枠 1 の編隊（操作していない隊）が最初の爆弾を落とした直後まで回し、その隊を止めて爆弾の狙いを隊長艇の真上にする */
  function bombOnLeader(seed: number, phase: number): { r: AirRig; fl: EvacFlight; leader: EvacBoat } {
    const r = makeAirRig(seed);
    runAirUntil(r, NEUTRAL, 24);
    const fl = r.air.plan.flights[1]!;
    runAir(r, NEUTRAL, 30, () => fl.phase === EF_FLYING && bombInAir(fl.port.state));
    const g = r.sq.groups[fl.target]!;
    g.phase = phase;
    g.foundLeftS = 10;
    for (const b of g.boats) b.state.speedMps = 0;
    const leader = evacLeader(g)!;
    const b = fl.port.state.bombs[fl.port.state.lastRelease]!;
    b.aimX = leader.state.x;
    b.aimY = leader.state.y;
    return { r, fl, leader };
  }

  it('落下中に狙った隊が隠れれば、真上に落ちても当たらない。見えていれば当たる（core の hitPlayer は中心の真上の KPI で、被害は走査だけ）', () => {
    const hidden = bombOnLeader(1, G_HIDDEN);
    const hp0 = hidden.leader.damage.hp;
    runAir(hidden.r, NEUTRAL, 3, () => !bombInAir(hidden.fl.port.state));
    // 凍結の core の hitPlayer（KPI）は中心の真上なので隠れていても数える。当たり・被害は走査だけが決める
    expect([hidden.leader.damage.hp, hidden.fl.port.state.hitsPlayer, hidden.fl.port.state.cancelled]).toEqual([hp0, 1, true]);
    expect(hidden.r.log.recordHits).not.toContain(hidden.leader.index);
    const seen = bombOnLeader(1, G_FOUND);
    runAir(seen.r, NEUTRAL, 3, () => !bombInAir(seen.fl.port.state));
    expect([seen.fl.port.state.hitsPlayer, seen.fl.port.state.cancelled]).toEqual([1, false]);
    expect(seen.leader.damage.hp).toBeCloseTo(hp0 - 35, 0);
    expect(seen.r.log.recordHits).toContain(seen.leader.index);
  });
});
