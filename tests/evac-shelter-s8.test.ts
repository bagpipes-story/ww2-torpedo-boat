// v0.6.11 S8（レビュー code-game の 2 件。core/evac-shelter）: (1) 入っている隊で隊長艇が沈み、新しい隊長艇（枠の点へ寄っていた僚艇）が輪の中なら速さ 0 にして入るのを続ける
// （速さを持ち越すと、操作中の隊は次のステップに hide_max 超えで取りやめ、操作していない隊は止まった艇の 2.6 m/s 先を爆弾が狙った）。
// (2) 見つかった陰の操作中の隊は、hide_max を超えるか輪の外へ出れば陰を出る（2 kt 以下で這い出ると G_FOUND のまま僚艇を陰に残して離れた）。
import { describe, expect, it } from 'vitest';
import { G_ENTERING, G_FOUND, G_HAULING, G_UNDERWAY } from '../src/core/evac-data';
import { evacSlotPoint, type EvacTrailPoint } from '../src/core/evac-follow';
import { EVAC_NO_HOOKS, evacSinkLeader, evacStoreSeatPose, evacSwitch } from '../src/core/evac-seat';
import { evacRevealCovers } from '../src/core/evac-shelter';
import { evacLeader } from '../src/core/evac-squadron';
import type { SeededRng } from '../src/core/rng';
import { bearingDeg } from '../src/core/ship-ai';
import { NEUTRAL, P, input, makeRig, stepRig, stepRigFor, type EvacRig } from './evac-kit';

const HOME = P.homeShelter;
const COVER = P.shelters.findIndex((s) => s.id === 'east_cover');
const pt: EvacTrailPoint = { x: 0, y: 0, ux: 0, uy: 0 };

/** 操作中の隊を隠れ場所 s へ半分の速さで走らせ、30 m 内でスティックを離して入り始めるまで（僚艇はまだ枠の点へ寄っている） */
function driveIn(r: EvacRig, s: number): void {
  const g = r.sq.groups[r.sq.control]!;
  const sh = P.shelters[s]!;
  for (let i = 0; i < 3600 && g.phase !== G_ENTERING; i++) {
    const st = r.seat.state;
    stepRig(r, Math.hypot(sh.x - st.x, sh.y - st.y) > 30 ? input(bearingDeg(st.x, st.y, sh.x, sh.y), 0.5) : NEUTRAL);
  }
  expect(g.phase).toBe(G_ENTERING);
}

describe('入っている隊の交代は止めて続ける（v0.6.11 S8・r2 M12 (b)）', () => {
  it('操作中: 新しい隊長艇は速さ 0 で座席へ入り、次のステップも入るのを続けて枠を持つ', () => {
    const r = makeRig(1);
    const g = r.sq.groups[r.sq.control]!;
    driveIn(r, HOME);
    // 僚艇は枠の点へ静音の速さで寄っている（hide_max より速い）
    expect(Math.max(g.boats[1]!.state.speedMps, g.boats[2]!.state.speedMps)).toBeGreaterThan(P.hideMaxMps);
    evacSinkLeader(r.sq, r.seat, r.sq.control, r.t, EVAC_NO_HOOKS);
    expect([g.leader, g.phase, r.seat.state.speedMps, evacLeader(g)!.state.speedMps]).toEqual([1, G_ENTERING, 0, 0]);
    stepRig(r, NEUTRAL);
    expect([g.phase, g.slotsHeld, r.sq.shelterUsed[HOME]]).toEqual([G_ENTERING, 2, 2]);
  });
  it('操作していない: 新しい隊長艇の記録は速さ 0（誰も動かさない艇に古い速さを残さない）。僚艇が着けば上げ始める', () => {
    const r = makeRig(1);
    const gi = r.sq.control;
    const g = r.sq.groups[gi]!;
    driveIn(r, HOME);
    expect(evacSwitch(r.sq, r.seat, EVAC_NO_HOOKS)).toBe(true);
    evacSinkLeader(r.sq, r.seat, gi, r.t, EVAC_NO_HOOKS);
    const lead = evacLeader(g)!;
    const x0 = lead.state.x;
    const y0 = lead.state.y;
    expect([g.leader, g.phase, lead.state.speedMps]).toEqual([1, G_ENTERING, 0]);
    for (let k = 0; k < 60 * 30 && g.phase === G_ENTERING; k++) {
      stepRig(r, NEUTRAL);
      expect(lead.state.speedMps).toBe(0);
    }
    expect(g.phase).toBe(G_HAULING);
    expect([lead.state.x, lead.state.y]).toEqual([x0, y0]);
  });
});

describe('見つかった陰の操作中の隊（v0.6.11 S8）', () => {
  it('2 kt 以下で這っても、輪の外へ出た時に陰を出て走る隊になり、僚艇は航跡をたどって続く', () => {
    const r = makeRig(1);
    const g = r.sq.groups[r.sq.control]!;
    const c = P.shelters[COVER]!;
    // 陰の中心に止めて僚艇を枠の点に置き、隠れてから見つかる
    g.phase = G_UNDERWAY;
    Object.assign(r.seat.state, { x: c.x, y: c.y, headingDeg: 90, speedMps: 0 });
    evacStoreSeatPose(r.sq, r.seat);
    let k = 0;
    for (const b of g.boats) {
      if (b.slot === g.leader) continue;
      evacSlotPoint(r.sq, g, ++k, pt);
      Object.assign(b.state, { x: pt.x, y: pt.y, speedMps: 0 });
    }
    stepRig(r, NEUTRAL);
    evacRevealCovers(r.sq, { next: () => 0 } as unknown as SeededRng, 1);
    expect(g.phase).toBe(G_FOUND);
    // スティックを少しだけ倒して南へ這う（hide_max より遅い）
    let left = -1;
    for (let i = 0; i < 60 * 120 && left < 0; i++) {
      stepRig(r, input(180, 0.06));
      expect(r.seat.state.speedMps).toBeLessThanOrEqual(P.hideMaxMps);
      if (g.phase !== G_FOUND) left = Math.hypot(r.seat.state.x - c.x, r.seat.state.y - c.y);
    }
    expect(g.phase).toBe(G_UNDERWAY);
    expect(left).toBeGreaterThan(P.shelterRingM);
    expect(left).toBeLessThan(P.shelterRingM + 1);
    expect(r.sq.shelterUsed[COVER]).toBe(0);
    stepRigFor(r, input(180, 0.06), 40);
    const lead = evacLeader(g)!.state;
    for (const b of g.boats) if (b.slot !== g.leader) expect(Math.hypot(b.state.x - lead.x, b.state.y - lead.y)).toBeLessThan(b.slot * P.followGapM + 15);
  });
});
