// v0.6.11 S1（spec-v0611-r2 §3.3・§3.8・§13 の S1）: 座席（core/evac-seat）。写しの往復・［切替］の並び（r2 H3）・スティックの latch（r2 M3）・
// 沈没の振り替えは同期に完結（r2 H5。同じステップの 2 発・火災で沈んだステップの爆弾・乱数の数が模擬と同じ）・全滅の後の自動の切替・決着の後は灰色。
// 世界の座席の被弾は systems/boat-damage の applyHit・sink（divert）と同じ形の WorldSeat（Phaser なし）で回す。
import { describe, expect, it } from 'vitest';
import { G_GONE, G_HAULING, G_HIDDEN, G_UNDERWAY, SW_FREE, SW_WAIT_INPUT, SW_WAIT_NEUTRAL } from '../src/core/evac-data';
import {
  EVAC_LOAD_AUTO, EVAC_LOAD_PROMOTE, EVAC_LOAD_SWITCH, EVAC_NO_HOOKS, evacFrameInput, evacHitRecord, evacHitSeat, evacLoadSeat, evacNextSwitch, evacSeatHome, evacSettle,
  evacSinkLeader, evacStoreSeatDamage, evacStoreSeatPose, evacSwitchOrder, type EvacSeat, type EvacSeatHooks,
} from '../src/core/evac-seat';
import { evacLeader, evacSurvivors, type EvacSquadron } from '../src/core/evac-squadron';
import { applyShellHit, stepDamage, type HitOutcome, type HitSpec } from '../src/core/gunnery';
import { SeededRng } from '../src/core/rng';
import { DT, NEUTRAL, P, SETUP, input, makeRig, makeSeat, stepRig, stepRigFor, type EvacRig } from './evac-kit';

const BOMB: HitSpec = SETUP.evac!.sorties[0]!.bombHit;

/** 世界の座席の被弾と沈没（systems/boat-damage の applyHit・sink の写し。sink に jp_03 の divert＝evacSinkLeader） */
class WorldSeat {
  sinking = false;
  private readonly out: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
  constructor(private readonly sq: EvacSquadron, private readonly seat: EvacSeat, private readonly hooks: EvacSeatHooks = EVAC_NO_HOOKS) {}
  applyHit(spec: HitSpec, rng: SeededRng, nowS: number): boolean {
    if (this.sinking) return false;
    const o = applyShellHit(this.seat.damage, spec, this.sq.cfg.damage, rng, this.out);
    if (o.engineHit) {
      this.seat.params.speedMaxMps = SETUP.boatParams.speedMaxMps * this.sq.cfg.damage.engineSpeedFactor;
      if (this.seat.params.speedCruiseMps > this.seat.params.speedMaxMps) this.seat.params.speedCruiseMps = this.seat.params.speedMaxMps;
    }
    return o.destroyed && this.sink(nowS);
  }
  sink(nowS: number): boolean {
    if (this.sinking) return false;
    if (evacSinkLeader(this.sq, this.seat, this.sq.control, nowS, this.hooks)) return false;
    this.seat.damage.hp = 0;
    this.seat.damage.fireLeftS = 0;
    this.sinking = true;
    return true;
  }
}

/** 引いた回数を数える乱数 */
function counting(seed: number): { rng: SeededRng; n: () => number } {
  const rng = new SeededRng(seed);
  let n = 0;
  const next = rng.next.bind(rng);
  rng.next = () => (n++, next());
  return { rng, n: () => n };
}

/** 隊 gi を壕に隠した形にする（全員が上がっている） */
function hide(r: EvacRig, gi: number, s = P.homeShelter): void {
  const g = r.sq.groups[gi]!;
  const sh = P.shelters[s]!;
  g.phase = G_HIDDEN;
  g.shelter = s;
  g.slotsHeld = 3;
  r.sq.shelterUsed[s] = r.sq.shelterUsed[s]! + 3;
  for (const b of g.boats) Object.assign(b.state, { x: sh.x, y: sh.y, speedMps: 0 }), (b.up = true);
  g.holdX = sh.x;
  g.holdY = sh.y;
  g.holdHeadingDeg = 90;
}

function frame(r: EvacRig, stick = NEUTRAL, tap = false): boolean {
  return evacFrameInput(r.sq, r.seat, stick, tap, EVAC_NO_HOOKS);
}

describe('座席の写し（spec §3.3）', () => {
  it('座席 → 記録 → 新しい座席の往復で BoatState 4 値・DamageState 3 値・帯・機関の最高速が同じ', () => {
    const r = makeRig();
    Object.assign(r.seat.state, { x: 1234.5, y: 876.25, headingDeg: 33.3, speedMps: 7.5 });
    Object.assign(r.seat.damage, { hp: 25, engineDamaged: true, fireLeftS: 3.25 });
    r.seat.band = 'cruise';
    evacStoreSeatPose(r.sq, r.seat);
    evacStoreSeatDamage(r.sq, r.seat);
    const rec = evacLeader(r.sq.groups[0]!)!;
    expect([rec.state, rec.damage, rec.band]).toEqual([r.seat.state, r.seat.damage, 'cruise']);
    expect(rec.params.speedMaxMps).toBeCloseTo(SETUP.boatParams.speedMaxMps * SETUP.damageParams.engineSpeedFactor, 12);
    const again = makeSeat(r.sq);
    expect([again.state, again.damage, again.band]).toEqual([r.seat.state, r.seat.damage, 'cruise']);
    expect(again.params.speedMaxMps).toBe(rec.params.speedMaxMps);
    expect(again.params.speedCruiseMps).toBe(Math.min(SETUP.boatParams.speedCruiseMps, rec.params.speedMaxMps));
    evacLoadSeat(r.sq, again);
    expect(again.state).toEqual(r.seat.state);
  });
});

describe('［切替］の並び（r2 H3: 狙われている隊 → 外の隊 → 上げている隊 → 隠れている隊。乱数なし）', () => {
  it('狙われた 2 隊があっても（操作中の隊も狙われている）3 回目でほかの隊へ。5 回で全部の隊に届く', () => {
    const r = makeRig();
    for (const gi of [0, 2, 4]) r.sq.targeted[gi] = 1;
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      frame(r, NEUTRAL, true);
      seen.push(r.sq.control);
    }
    expect(seen).toEqual([2, 4, 1, 3, 5, 0]);
    expect(r.sq.switches).toBe(6);
  });
  it('外の隊があっても隠れている隊に届く・上げている隊は外の隊の後ろ・全滅は入らない', () => {
    const r = makeRig();
    hide(r, 1);
    hide(r, 3, 1);
    r.sq.groups[2]!.phase = G_HAULING;
    r.sq.groups[5]!.phase = G_GONE;
    r.sq.groups[5]!.leader = -1;
    expect(evacSwitchOrder(r.sq)).toBe(5);
    expect([...r.sq.order.slice(0, 5)]).toEqual([0, 4, 2, 1, 3]);
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      frame(r, NEUTRAL, true);
      seen.push(r.sq.control);
    }
    expect(seen).toEqual([4, 2, 1, 3, 0]);
  });
  it('239 秒に隠れた隊へ切り替えれば、240 秒の決着のラッチで帰投（atHome）になる。切り替えなければ外', () => {
    for (const doSwitch of [true, false]) {
      const r = makeRig(9);
      hide(r, 3);
      stepRigFor(r, input(20, 0.6), 30);
      stepRigFor(r, NEUTRAL, 209);
      if (doSwitch) for (let i = 0; i < 5 && r.sq.control !== 3; i++) frame(r, NEUTRAL, true);
      expect(r.sq.control).toBe(doSwitch ? 3 : 0);
      let home = false;
      for (let i = 0; i < 2 / DT; i++) {
        stepRig(r, NEUTRAL);
        if (SETUP.durationS - r.t <= 0) {
          evacSettle(r.sq);
          home = evacSeatHome(r.sq, r.seat, true);
          break;
        }
      }
      expect(home).toBe(doSwitch);
      // 決着の後は切り替えられない（灰色）
      expect(evacNextSwitch(r.sq)).toBe(-1);
      expect(frame(r, NEUTRAL, true)).toBe(false);
    }
  });
});

describe('スティックの latch（r2 M3）', () => {
  it('倒したままの切替で隠れた隊が出ない。一度デッドゾーンに戻して倒すと出る', () => {
    const r = makeRig();
    hide(r, 1);
    const g = r.sq.groups[1]!;
    const push = input(0, 0.8);
    for (let i = 0; i < 5 && r.sq.control !== 1; i++) frame(r, push, true);
    expect([r.sq.control, r.sq.latch]).toEqual([1, SW_WAIT_NEUTRAL]);
    for (let i = 0; i < 60; i++) frame(r, push), stepRig(r, push);
    expect([g.phase, r.sq.latch]).toEqual([G_HIDDEN, SW_WAIT_NEUTRAL]);
    frame(r, NEUTRAL);
    stepRig(r, NEUTRAL);
    expect([g.phase, r.sq.latch]).toEqual([G_HIDDEN, SW_WAIT_INPUT]);
    frame(r, push);
    expect(r.sq.latch).toBe(SW_FREE);
    stepRig(r, push);
    expect(g.phase).toBe(G_UNDERWAY);
  });
  it('親指が離れていても、引き継いだ走る隊は AI の最後の指令（針路・速さ）のまま止まらない。倒すと操る', () => {
    const r = makeRig();
    stepRigFor(r, NEUTRAL, 25);
    const g = r.sq.groups[1]!;
    expect(g.phase).toBe(G_UNDERWAY);
    g.aiSpeed01 = 1;
    frame(r, NEUTRAL, true);
    expect([r.sq.control, r.sq.latch]).toEqual([1, SW_WAIT_INPUT]);
    const hd = g.aiHeadingDeg;
    for (let i = 0; i < 3 / DT; i++) frame(r), stepRig(r, NEUTRAL);
    expect(r.seat.state.speedMps).toBeGreaterThan(SETUP.boatParams.speedMaxMps * 0.95);
    expect(Math.abs(((r.seat.state.headingDeg - hd + 540) % 360) - 180)).toBeLessThan(1);
    frame(r, input(hd, 0.2));
    expect(r.sq.latch).toBe(SW_FREE);
    stepRigFor(r, input(hd, 0.2), 3, () => frame(r, input(hd, 0.2)));
    expect(r.seat.state.speedMps).toBeLessThan(SETUP.boatParams.speedMaxMps * 0.3);
  });
});

describe('隊長艇の沈没の振り替え（r2 H5: divert の中で同期に完結）', () => {
  it('同じステップに 2 発（座席が中心の編隊と、別の編隊の巻き添え）→ 交代は 1 回、2 発目は新しい隊長艇に当たる。命中スローの sink は false', () => {
    const r = makeRig();
    const loads: number[] = [];
    const hooks: EvacSeatHooks = { ...EVAC_NO_HOOKS, onSeatLoaded: (_g, kind) => loads.push(kind) };
    const w = new WorldSeat(r.sq, r.seat, hooks);
    r.seat.damage.hp = BOMB.damage;
    const g = r.sq.groups[0]!;
    const rngA = new SeededRng(11);
    const rngB = new SeededRng(12);
    expect(w.applyHit(BOMB, rngA, 5)).toBe(false);
    expect([r.sq.promotions, g.leader, g.boats[0]!.sunk, r.seat.damage.hp, w.sinking]).toEqual([1, 1, true, SETUP.damageParams.maxHp, false]);
    expect([r.seat.state.x, r.seat.state.y]).toEqual([g.boats[1]!.state.x, g.boats[1]!.state.y]);
    expect(w.applyHit(BOMB, rngB, 5)).toBe(false);
    expect([r.sq.promotions, g.leader, r.seat.damage.hp]).toEqual([1, 1, SETUP.damageParams.maxHp - BOMB.damage]);
    expect(loads).toEqual([EVAC_LOAD_PROMOTE]);
    expect(evacSurvivors(r.sq)).toBe(17);
  });
  it('火災で沈んだステップに爆弾が来る → 交代の後の座席（新しい隊長艇）に当たる', () => {
    const r = makeRig();
    const w = new WorldSeat(r.sq, r.seat);
    Object.assign(r.seat.damage, { hp: 0.01, fireLeftS: 5 });
    if (stepDamage(r.seat.damage, SETUP.damageParams, DT)) w.sink(3);
    expect([r.sq.promotions, r.sq.groups[0]!.leader, r.seat.damage.fireLeftS]).toEqual([1, 1, 0]);
    w.applyHit(BOMB, new SeededRng(4), 3);
    expect([r.sq.promotions, r.seat.damage.hp]).toEqual([1, SETUP.damageParams.maxHp - BOMB.damage]);
  });
  it('交代の後の applyShellHit が引く乱数の数と結果が、世界（boat-damage の形）と模擬（evacHitSeat）で同じ', () => {
    const runs = [false, true].map((sim) => {
      const r = makeRig(21);
      const w = new WorldSeat(r.sq, r.seat);
      const c = counting(77);
      const out: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
      for (let i = 0; i < 7; i++) {
        if (sim) evacHitSeat(r.sq, r.seat, BOMB, c.rng, i, EVAC_NO_HOOKS, out);
        else w.applyHit(BOMB, c.rng, i);
      }
      evacStoreSeatDamage(r.sq, r.seat);
      return { draws: c.n(), boats: r.sq.boats.map((b) => [b.sunk, b.damage.hp, b.damage.engineDamaged, b.damage.fireLeftS, b.params.speedMaxMps]), seat: [r.seat.damage, r.seat.params.speedMaxMps, r.sq.control, r.sq.promotions, r.sq.autoSwitches] };
    });
    expect(runs[1]).toEqual(runs[0]);
    expect(runs[0]!.draws).toBeGreaterThan(0);
    expect(runs[0]!.seat[3]).toBe(2);
    expect(runs[0]!.seat[4]).toBe(1);
  });
  it('隊が全滅すれば並びの先頭の隊へ自動で切り替え（latch を置き直す）、ほかに浮いている艇が無い時・決着の後だけ座席が沈む', () => {
    const r = makeRig();
    const loads: number[] = [];
    const gone: number[] = [];
    const hooks: EvacSeatHooks = { ...EVAC_NO_HOOKS, onSeatLoaded: (_g, kind) => loads.push(kind), onGroupGone: (gi) => gone.push(gi) };
    const w = new WorldSeat(r.sq, r.seat, hooks);
    const out: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
    const g = r.sq.groups[0]!;
    r.sq.targeted[4] = 1;
    for (const b of g.boats.slice(1)) evacHitRecord(r.sq, r.seat, b, { ...BOMB, damage: 999 }, new SeededRng(1), 1, hooks, out);
    expect(evacLeader(g)!.slot).toBe(0);
    r.sq.stickOut = true;
    expect(w.sink(2)).toBe(false);
    expect([g.phase, r.sq.control, r.sq.latch, r.sq.autoSwitches, gone, loads]).toEqual([G_GONE, 4, SW_WAIT_NEUTRAL, 1, [0], [EVAC_LOAD_AUTO]]);
    // 決着の後は振り替えない（記録は沈む＝残存から 1 引く）
    evacSettle(r.sq);
    expect(w.sink(3)).toBe(true);
    expect([r.sq.groups[4]!.boats[0]!.sunk, evacSurvivors(r.sq), r.sq.promotions]).toEqual([true, 14, 0]);
  });
  it('［切替］で入れた座席は hooks に EVAC_LOAD_SWITCH を返す', () => {
    const r = makeRig();
    const loads: number[] = [];
    evacFrameInput(r.sq, r.seat, NEUTRAL, true, { ...EVAC_NO_HOOKS, onSeatLoaded: (_g, kind) => loads.push(kind) });
    expect(loads).toEqual([EVAC_LOAD_SWITCH]);
  });
});
