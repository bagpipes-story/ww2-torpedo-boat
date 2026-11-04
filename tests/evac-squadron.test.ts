// v0.6.11 S1（spec-v0611-r2 §3.2・§3.6・§13 の S1）: 隊の記録と隠れ場所の段（core/evac-squadron・core/evac-shelter・core/evac-boats）。
// 入る境（輪の縁ちょうど・2 kt ちょうど・枠が 1 足りない）・取りやめで枠を返す・上げる順と 18 秒・隠れる前は全員が見えている・上げた艇は安全・
// 交代で番号最小・残存・隠れ場所の中の交代（r2 M12）・上げている隊を下ろす・見つかった陰（r2 M14）・壕から出る縦列（r2 L2）・上げている間の座席（r2 L14）・確保なし。
import { describe, expect, it } from 'vitest';
import { G_ENTERING, G_FOUND, G_GONE, G_HAULING, G_HIDDEN, G_MOORED, G_UNDERWAY, SW_FREE, SW_WAIT_NEUTRAL } from '../src/core/evac-data';
import { evacSlotPoint, type EvacTrailPoint } from '../src/core/evac-follow';
import { evacStoreSeatPose } from '../src/core/evac-seat';
import { evacLaunch, evacPromote, evacRevealCovers, evacSinkWingman, evacStepShelters, evacTryEnter, evacMarkSunk } from '../src/core/evac-shelter';
import { EVAC_HINT_FOUND, EVAC_HINT_FULL, createEvacSquadron, evacExposed, evacLeader, evacSurvivors, type EvacSquadron } from '../src/core/evac-squadron';
import { SeededRng } from '../src/core/rng';
import { DT, NEUTRAL, P, SETUP, evacConfig, input, makeRig, stepRig, stepRigFor, type EvacRig } from './evac-kit';

const HOME = P.homeShelter;
const WEST_COVER = P.shelters.findIndex((s) => s.id === 'west_cover');
const pt: EvacTrailPoint = { x: 0, y: 0, ux: 0, uy: 0 };

/** 操作中の隊の隊長艇（座席と記録）を点 (x, y) に置き、速さ speed で走っている隊にする */
function placeLeader(r: EvacRig, x: number, y: number, speed: number, headingDeg = 90): void {
  const g = r.sq.groups[r.sq.control]!;
  g.phase = G_UNDERWAY;
  Object.assign(r.seat.state, { x, y, headingDeg, speedMps: speed });
  evacStoreSeatPose(r.sq, r.seat);
}

/** 隊 gi の浮いている僚艇を枠の点に止めて置く（入った後に着いた形） */
function wingmenToSlots(sq: EvacSquadron, gi: number): void {
  const g = sq.groups[gi]!;
  let k = 0;
  for (const b of g.boats) {
    if (b.slot === g.leader || b.sunk || b.up) continue;
    evacSlotPoint(sq, g, ++k, pt);
    Object.assign(b.state, { x: pt.x, y: pt.y, speedMps: 0 });
  }
}

/** 操作中の隊を隠れ場所 s の中心で止め、僚艇を枠の点に置いて 1 ステップ（壕は G_HAULING・陰は G_HIDDEN になる） */
function park(r: EvacRig, s: number): void {
  const sh = r.sq.p.shelters[s]!;
  placeLeader(r, sh.x, sh.y, 0);
  wingmenToSlots(r.sq, r.sq.control);
  stepRig(r, NEUTRAL);
}

describe('隊の記録（生成）', () => {
  it('6 隊 × 3 隻を停泊地の縦列（艇尾方向に moored_gap_m）に置き、全隊が停泊・隊長艇は番号 0・離岸の秒は 6 回だけ引く', () => {
    const ai = new SeededRng(31);
    let draws = 0;
    const next = ai.next.bind(ai);
    ai.next = () => (draws++, next());
    const sq = createEvacSquadron(evacConfig(), ai);
    expect(draws).toBe(6);
    expect(sq.boats.length).toBe(18);
    expect(sq.groups.map((g) => [g.phase, g.leader, g.boats.length])).toEqual(Array(6).fill([G_MOORED, 0, 3]));
    for (const g of sq.groups) {
      const gp = P.groups[g.index]!;
      expect(g.castOffS).toBeGreaterThanOrEqual(P.castOffMinS);
      expect(g.castOffS).toBeLessThan(P.castOffMaxS);
      for (const b of g.boats) {
        const h = (gp.headingDeg * Math.PI) / 180;
        expect(b.state.x).toBeCloseTo(gp.x - Math.sin(h) * b.slot * P.mooredGapM, 9);
        expect(b.state.y).toBeCloseTo(gp.y + Math.cos(h) * b.slot * P.mooredGapM, 9);
        expect([b.state.headingDeg, b.state.speedMps, b.damage.hp, b.sunk, b.up]).toEqual([gp.headingDeg, 0, SETUP.damageParams.maxHp, false, false]);
      }
      expect(g.trailX.length).toBe(P.trailLen);
    }
    expect(sq.control).toBe(P.startGroup);
    expect(sq.latch).toBe(SW_FREE);
    // 座席は setup.boatParams を写す（setup は書き換えない）
    expect(sq.boats[0]!.params).not.toBe(SETUP.boatParams);
  });
});

describe('入る（操作中の隊。spec §3.6）', () => {
  const ring = P.shelterRingM;
  const home = P.shelters[HOME]!;
  it('輪の縁ちょうどは中・1 cm 外は入らない', () => {
    const r = makeRig();
    placeLeader(r, home.x, home.y - ring, P.hideMaxMps);
    evacTryEnter(r.sq);
    expect(r.sq.groups[0]!.phase).toBe(G_ENTERING);
    const r2 = makeRig();
    placeLeader(r2, home.x, home.y - ring - 0.01, 0);
    evacTryEnter(r2.sq);
    expect(r2.sq.groups[0]!.phase).toBe(G_UNDERWAY);
  });
  it('hide_max_kt（2 kt）ちょうどは入る・わずかに速ければ入らない', () => {
    const r = makeRig();
    placeLeader(r, home.x, home.y, P.hideMaxMps);
    evacTryEnter(r.sq);
    expect(r.sq.groups[0]!.phase).toBe(G_ENTERING);
    const r2 = makeRig();
    placeLeader(r2, home.x, home.y, P.hideMaxMps + 1e-9);
    evacTryEnter(r2.sq);
    expect(r2.sq.groups[0]!.phase).toBe(G_UNDERWAY);
  });
  it('枠が 1 足りなければ「満杯」で何も起きない。浮いている隻数が減れば入れる。入れば枠を取っておく', () => {
    const r = makeRig();
    r.sq.shelterUsed[HOME] = home.slots - 2;
    placeLeader(r, home.x, home.y, 0);
    evacTryEnter(r.sq);
    expect([r.sq.groups[0]!.phase, r.sq.hint, r.sq.hintShelter]).toEqual([G_UNDERWAY, EVAC_HINT_FULL, HOME]);
    evacSinkWingman(r.sq, r.sq.groups[0]!.boats[2]!, 1);
    evacTryEnter(r.sq);
    expect([r.sq.groups[0]!.phase, r.sq.shelterUsed[HOME], r.sq.groups[0]!.slotsHeld]).toEqual([G_ENTERING, home.slots, 2]);
  });
  it('入っている途中に hide_max を超えれば取りやめ、枠を返す', () => {
    const r = makeRig();
    placeLeader(r, home.x, home.y, 0);
    stepRig(r, NEUTRAL);
    expect([r.sq.groups[0]!.phase, r.sq.shelterUsed[HOME]]).toEqual([G_ENTERING, 3]);
    stepRigFor(r, input(0, 1), 0.5);
    expect([r.sq.groups[0]!.phase, r.sq.shelterUsed[HOME], r.sq.groups[0]!.shelter]).toEqual([G_UNDERWAY, 0, -1]);
  });
  it('決着の後は枠を数えない（入り始めない）', () => {
    const r = makeRig();
    r.sq.settled = true;
    placeLeader(r, home.x, home.y, 0);
    evacTryEnter(r.sq);
    expect(r.sq.groups[0]!.phase).toBe(G_UNDERWAY);
  });
});

describe('僚艇が着いて隠れる・レールで上げる（spec §3.6）', () => {
  it('壕: 僚艇の番号の大きい順に 1 隻 haul_s ずつ、隊長艇は最後。3 隻で 18 秒で隠れる。それまで上げていない艇は見えている', () => {
    const r = makeRig();
    const g = r.sq.groups[0]!;
    park(r, HOME);
    expect([g.phase, g.hauling]).toEqual([G_HAULING, 2]);
    const upAt: number[] = [NaN, NaN, NaN];
    const t0 = r.t;
    for (let i = 0; i < 20 / DT && g.phase !== G_HIDDEN; i++) {
      for (const b of g.boats) expect(evacExposed(r.sq, b)).toBe(!b.up);
      stepRig(r, NEUTRAL);
      for (const b of g.boats) if (b.up && Number.isNaN(upAt[b.slot]!)) upAt[b.slot] = r.t - t0;
    }
    expect(g.phase).toBe(G_HIDDEN);
    expect(upAt[2]).toBeCloseTo(P.haulS, 1);
    expect(upAt[1]).toBeCloseTo(2 * P.haulS, 1);
    expect(upAt[0]).toBeCloseTo(3 * P.haulS, 1);
    expect(upAt[0]).toBeCloseTo(18, 1);
    for (const b of g.boats) expect(evacExposed(r.sq, b)).toBe(false);
  });
  it('陰: 僚艇が枠の点に着いて止まればすぐ隠れる（上げない）', () => {
    const r = makeRig();
    park(r, WEST_COVER);
    expect(r.sq.groups[0]!.phase).toBe(G_HIDDEN);
    expect(r.sq.groups[0]!.boats.every((b) => !b.up)).toBe(true);
  });
  it('僚艇は入る時に縦列から枠の点（隊長艇の左右 slot_abeam_m）へ寄って止まる（slot_arrive_m 内）', () => {
    const r = makeRig();
    const g = r.sq.groups[0]!;
    const home = P.shelters[HOME]!;
    // 北から南へ隊長艇の壕へ向かい（僚艇は航跡の縦列）、輪の手前でスティックを離して輪の中で止まる
    placeLeader(r, home.x, home.y - 600, 0, 180);
    let enteredAt = NaN;
    for (let i = 0; i < 40 / DT && g.phase !== G_HAULING; i++) {
      stepRig(r, home.y - r.seat.state.y > 40 ? input(180, 0.5) : NEUTRAL);
      if (g.phase === G_ENTERING && Number.isNaN(enteredAt)) enteredAt = r.t;
    }
    expect(g.phase).toBe(G_HAULING);
    expect(r.sq.shelterUsed[HOME]).toBe(3);
    // 僚艇 2 隻が縦列から枠の点へ寄って止まるまで（入り始めてから）10 秒未満
    expect(r.t - enteredAt).toBeLessThan(10);
    for (const b of g.boats.slice(1)) {
      expect(b.state.speedMps).toBe(0);
      expect(Math.abs(Math.hypot(b.state.x - g.holdX, b.state.y - g.holdY) - P.slotAbeamM)).toBeLessThanOrEqual(P.slotArriveM);
    }
  });
});

describe('交代・残存・隠れ場所の中の交代（r2 M12）', () => {
  it('隊長艇は浮いている最小の番号。残存は 18 中', () => {
    const r = makeRig();
    const g = r.sq.groups[3]!;
    evacMarkSunk(g.boats[0]!, 1);
    expect(evacPromote(r.sq, g)).toBe(1);
    evacSinkWingman(r.sq, g.boats[2]!, 2);
    expect([g.leader, evacSurvivors(r.sq)]).toEqual([1, 16]);
    evacMarkSunk(g.boats[1]!, 3);
    expect([evacPromote(r.sq, g), g.phase, evacSurvivors(r.sq)]).toEqual([-1, G_GONE, 15]);
    expect(evacLeader(g)).toBeNull();
  });
  it('上げている隊で隊長艇が沈み、残りがみな上がっていればその場で隠れる（新しい隊長艇は壕の中）', () => {
    const r = makeRig();
    const g = r.sq.groups[0]!;
    park(r, HOME);
    stepRigFor(r, NEUTRAL, 2 * P.haulS + 0.1);
    expect([g.boats[2]!.up, g.boats[1]!.up, g.boats[0]!.up, g.phase]).toEqual([true, true, false, G_HAULING]);
    evacMarkSunk(g.boats[0]!, r.t);
    evacPromote(r.sq, g);
    expect([g.leader, g.phase, r.sq.shelterUsed[HOME], g.slotsHeld]).toEqual([1, G_HIDDEN, 2, 2]);
  });
  it('入っている隊で隊長艇が沈めば枠を浮いている隻数に取り直し、新しい隊長艇が輪の中なら続け・外なら取りやめる', () => {
    const r = makeRig();
    const g = r.sq.groups[0]!;
    const home = P.shelters[HOME]!;
    placeLeader(r, home.x, home.y, 0);
    stepRig(r, NEUTRAL);
    expect(g.phase).toBe(G_ENTERING);
    Object.assign(g.boats[1]!.state, { x: home.x + 10, y: home.y });
    evacMarkSunk(g.boats[0]!, r.t);
    evacPromote(r.sq, g);
    expect([g.leader, g.phase, g.slotsHeld, r.sq.shelterUsed[HOME]]).toEqual([1, G_ENTERING, 2, 2]);
    Object.assign(g.boats[2]!.state, { x: home.x, y: home.y - P.shelterRingM - 30 });
    evacMarkSunk(g.boats[1]!, r.t);
    evacPromote(r.sq, g);
    expect([g.leader, g.phase, g.slotsHeld, r.sq.shelterUsed[HOME]]).toEqual([2, G_UNDERWAY, 0, 0]);
  });
});

describe('出る・下ろす（r2 L2・M12 (c)）・上げている間の座席（r2 L14）', () => {
  it('上げている間、座席は止めた点と針路に戻る（stepPlayerBoat が動かした分を消す）', () => {
    const r = makeRig();
    const g = r.sq.groups[0]!;
    park(r, HOME);
    const hold = [g.holdX, g.holdY, g.holdHeadingDeg];
    r.sq.latch = SW_WAIT_NEUTRAL; // 倒しても出ない（座席は動くが戻る）
    stepRigFor(r, input(200, 1), 1);
    expect([r.seat.state.x, r.seat.state.y, r.seat.state.headingDeg, r.seat.state.speedMps]).toEqual([...hold, 0]);
    expect(g.phase).toBe(G_HAULING);
  });
  it('上げている隊でスティックを launch_stick 以上倒すと、上げた艇も入口の縦列に下ろして走る隊になる（枠は空く）', () => {
    const r = makeRig();
    const g = r.sq.groups[0]!;
    park(r, HOME);
    stepRigFor(r, NEUTRAL, P.haulS + 0.1);
    expect(g.boats[2]!.up).toBe(true);
    stepRig(r, input(0, P.launchStick - 0.01));
    expect(g.phase).toBe(G_HAULING);
    stepRig(r, input(0, P.launchStick));
    expect([g.phase, r.sq.shelterUsed[HOME], g.boats.some((b) => b.up)]).toEqual([G_UNDERWAY, 0, false]);
  });
  it('壕から出ると隊長艇が入口（壕の中心）から縦列（moored_gap_m）、艇首は data の exit_heading_deg。すぐには入り直さない', () => {
    const r = makeRig();
    const g = r.sq.groups[0]!;
    const home = P.shelters[HOME]!;
    park(r, HOME);
    stepRigFor(r, NEUTRAL, 3 * P.haulS + 0.1);
    expect(g.phase).toBe(G_HIDDEN);
    stepRig(r, input(0, 1));
    expect(g.phase).toBe(G_UNDERWAY);
    for (const b of g.boats) {
      expect(b.state.x).toBeCloseTo(home.x, 9);
      expect(b.state.y).toBeCloseTo(home.y + b.slot * P.mooredGapM, 9);
      expect([b.state.headingDeg, b.up]).toEqual([home.exitHeadingDeg, false]);
    }
    expect([r.seat.state.x, r.seat.state.y, r.seat.state.headingDeg]).toEqual([home.x, home.y, home.exitHeadingDeg]);
    // 止まり直しても、一度 hide_max を超えるまで入らない
    stepRigFor(r, NEUTRAL, 0.5);
    expect(g.phase).toBe(G_UNDERWAY);
  });
  it('陰から出るとその場から走る（枠は空く）', () => {
    const r = makeRig();
    const g = r.sq.groups[0]!;
    park(r, WEST_COVER);
    evacLaunch(r.sq, g);
    expect([g.phase, r.sq.shelterUsed[WEST_COVER], g.launched]).toEqual([G_UNDERWAY, 0, true]);
  });
});

describe('陰の発見（予告ごとに陰の順に seed+29 から 1 回ずつ。r2 M14）', () => {
  it('予告ごとに陰の数だけ引き（隠れている隊がいなくても）、見つかった陰には輪の外へ出るまで入れない', () => {
    const r = makeRig();
    const g = r.sq.groups[0]!;
    let draws = 0;
    const always = { next: () => (draws++, 0) } as unknown as SeededRng;
    expect(evacRevealCovers(r.sq, always, 0.25)).toBe(0);
    expect(draws).toBe(2);
    park(r, WEST_COVER);
    expect(evacRevealCovers(r.sq, always, 0.25)).toBe(1);
    expect([g.phase, g.foundCover]).toEqual([G_FOUND, WEST_COVER]);
    for (const b of g.boats) expect(evacExposed(r.sq, b)).toBe(true);
    // 操作中: 動かせば陰を出る。止まっても同じ陰には入れない（札「見つかった」）
    stepRigFor(r, input(180, 0.5), 0.6);
    expect(g.phase).toBe(G_UNDERWAY);
    stepRigFor(r, NEUTRAL, 3);
    expect([g.phase, r.sq.hint, r.sq.hintShelter]).toEqual([G_UNDERWAY, EVAC_HINT_FOUND, WEST_COVER]);
    // 輪の外へ出れば印が消え、戻って止まれば入れる
    stepRigFor(r, input(180, 1), 3);
    expect(g.foundCover).toBe(-1);
    const c = P.shelters[WEST_COVER]!;
    placeLeader(r, c.x, c.y, 0);
    stepRig(r, NEUTRAL);
    expect(g.phase).toBe(G_ENTERING);
  });
  it('操作していない見つかった隊は found_react_s で陰を出て走る（枠は空く）', () => {
    const r = makeRig();
    park(r, WEST_COVER);
    r.sq.control = 1;
    const g = r.sq.groups[0]!;
    evacRevealCovers(r.sq, { next: () => 0 } as unknown as SeededRng, 1);
    stepRigFor(r, NEUTRAL, P.foundReactS - 0.1);
    expect(g.phase).toBe(G_FOUND);
    stepRigFor(r, NEUTRAL, 0.2);
    expect([g.phase, r.sq.shelterUsed[WEST_COVER], g.aiSpeed01]).toEqual([G_UNDERWAY, 0, 1]);
  });
});

describe('確保なし（§7）', () => {
  it('240 秒のステップの前後で記録・配列・輪の物と長さが同じ', () => {
    const r = makeRig(7);
    const before = { boats: r.sq.boats, groups: r.sq.groups, states: r.sq.boats.map((b) => b.state), trails: r.sq.groups.map((g) => [g.trailX, g.trailY, g.trailSeg]), used: r.sq.shelterUsed, order: r.sq.order };
    stepRigFor(r, input(160, 0.8), 30);
    stepRigFor(r, NEUTRAL, 210);
    expect(r.sq.boats).toBe(before.boats);
    expect(r.sq.groups).toBe(before.groups);
    expect(r.sq.boats.map((b) => b.state)).toEqual(before.states);
    r.sq.boats.forEach((b, i) => expect(b.state).toBe(before.states[i]));
    r.sq.groups.forEach((g, i) => {
      expect([g.trailX, g.trailY, g.trailSeg]).toEqual(before.trails[i]);
      expect(g.trailX).toBe(before.trails[i]![0]);
      expect(g.trailX.length).toBe(P.trailLen);
    });
    expect([r.sq.shelterUsed, r.sq.order, r.sq.boats.length, r.sq.groups.length]).toEqual([before.used, before.order, 18, 6]);
    expect(r.sq.shelterUsed).toBe(before.used);
    // 操作していない隊は離岸して走っている（隠れ場所には自分で入らない）
    expect(r.sq.groups.slice(1).every((g) => g.phase === G_UNDERWAY)).toBe(true);
  });
});
