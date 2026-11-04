// v0.6.11 S3b（data evac_raid.passes_max・hard.evac_passes_max。既定 1＝ユーザーの答えを待つ間は今の挙動）: もう一度来る編隊（core/evac-repass）の段取り（rig）。
// passes_max 2 は済みのステップにだけ同じ枠で予告し直し（狙いは最初の予告と同じ枠の決め・「狙われている」）、新しい回は次の波の始まり（最後の波は duration_s）までに済み、
// 収まらない編隊は来ない。始める前に隠れたら見失い、決着の後は来ない。撃墜した機は戻らない。passes_max 1・乱数・模擬の表・確保は tests/evac-repass-sim。
import { describe, expect, it } from 'vitest';
import { AS_DONE } from '../src/core/air-strike';
import { airSortieComplete } from '../src/core/air-sortie';
import { dawnReached } from '../src/core/dawn-air';
import { G_UNDERWAY } from '../src/core/evac-data';
import { EF_ANNOUNCED, EF_FLYING, EF_OFF, EO_DONE, EO_LOST_EARLY, EO_SETTLED, candidate, evacFlightLive, type EvacFlight, type EvacPlan } from '../src/core/evac-plan';
import { evacDownPlane, evacPassS, evacRepassOnComplete } from '../src/core/evac-repass';
import { evacSettle, EVAC_NO_HOOKS } from '../src/core/evac-seat';
import { evacLeader, evacSurvivors } from '../src/core/evac-squadron';
import { degToRad } from '../src/core/units';
import { DT, NEUTRAL } from './evac-kit';
import { NORMAL, forceHidden, makeAirRig, runAir, runAirUntil, stepAirRig, type AirRig } from './evac-air-kit';

const two = (seed: number, hard = false): AirRig => makeAirRig(seed, hard, {}, EVAC_NO_HOOKS, { passesMax: 2 });

/** 枠 slot の現れる点に近い順・段 B を先の、テスト側の書き直し（a は隊ごとのいま狙っている編隊の数。exclude は外す隊） */
function expectedTarget(plan: EvacPlan, slot: number, a: Int32Array, exclude: number): number {
  const { sq, raid } = plan;
  const b = degToRad(raid.fromBearingDeg + raid.flightOffsetsDeg[slot]!);
  const sx = raid.centerX + Math.sin(b) * raid.spawnM;
  const sy = raid.centerY - Math.cos(b) * raid.spawnM;
  let best = -1;
  let key = Infinity;
  for (let gi = 0; gi < sq.groups.length; gi++) {
    if (!candidate(sq, gi) || a[gi]! > 0 || gi === exclude) continue;
    const l = evacLeader(sq.groups[gi]!)!.state;
    const k = (sq.groups[gi]!.phase === G_UNDERWAY ? 0 : 1e12) + (l.x - sx) ** 2 + (l.y - sy) ** 2;
    if (k < key) {
      key = k;
      best = gi;
    }
  }
  return best;
}

/** この波でいま狙っている（予告した・飛んでいて中断していない）ほかの編隊の隊ごとの数 */
function activeOn(plan: EvacPlan, fl: EvacFlight): Int32Array {
  const a = new Int32Array(plan.sq.groups.length);
  for (const o of plan.flights) if (o !== fl && o.wave === fl.wave && o.target >= 0 && (o.phase === EF_ANNOUNCED || (evacFlightLive(o) && !o.port.state.cancelled))) a[o.target]!++;
  return a;
}

describe('passes_max 2: 済みのステップにだけ予告し直し、次の波の始まりまでに済む', () => {
  it('見積もり（evacPassS）は V-E6 の長さ ＋ 濃さの秒で、実際の 1 回（始めてから済みまで）より長い（2・3・4 機）', () => {
    for (const p of NORMAL.evac!.sorties) {
      expect(evacPassS(p)).toBeCloseTo(p.firstRunS + p.runS + (p.planes * p.bombsPerPlane - 1) * p.runGapS + p.fallFeelS + p.leaveS + 0.5, 12);
    }
    const r = makeAirRig(3);
    const startAt = new Float64Array(r.air.plan.flights.length).fill(NaN);
    const doneAt = new Float64Array(r.air.plan.flights.length).fill(NaN);
    runAir(r, NEUTRAL, 240, () => {
      r.air.plan.flights.forEach((f, i) => {
        if (r.air.plan.evStart & (1 << i)) startAt[i] = r.t;
        if (Number.isNaN(doneAt[i]!) && airSortieComplete(f.port.state)) doneAt[i] = r.t;
      });
    });
    let n = 0;
    r.air.plan.flights.forEach((f, i) => {
      if (Number.isNaN(doneAt[i]!)) return;
      n++;
      expect(doneAt[i]! - startAt[i]! + DT).toBeLessThanOrEqual(r.air.repass.passS[i]!);
    });
    expect(n).toBeGreaterThan(0);
  });

  it('予告し直すのは済みのステップだけ・始めるのは予告の announce_lead_s 後・新しい回は波の終わりまでに済み、次の波の始まりに動いていない。収まらない・狙いの無い済みは来ない（ノーマル・ハード × seed 1〜6）', () => {
    let again = 0;
    const againWave = [0, 0, 0, 0];
    for (const hard of [false, true]) {
      for (let seed = 1; seed <= 6; seed++) {
        const r = two(seed, hard);
        const { plan, repass } = r.air;
        const n = plan.flights.length;
        const seen = new Uint8Array(n); // 1 回目の済みを見た
        const reAt = new Float64Array(n).fill(NaN);
        const done2 = new Uint8Array(n); // 2 回目の済みを見た
        let completions = 0;
        let overlap = 0;
        runAir(r, NEUTRAL, 240, () => {
          for (let i = 0; i < n; i++) {
            const f = plan.flights[i]!;
            if (repass.ev & (1 << i)) {
              // 済みは前のステップの終わりに立ち、このステップの頭で見た（evacRefreshView）
              expect(seen[i]).toBe(1);
              expect(f.phase).toBe(EF_ANNOUNCED);
              expect(f.passes).toBe(1);
              expect(f.startS).toBeCloseTo(r.t + plan.raid.announceLeadS, 9);
              expect(f.startS + repass.passS[i]!).toBeLessThanOrEqual(repass.untilS[i]! + 1e-9);
              expect(r.sq.targeted[f.target]).toBe(1);
              reAt[i] = r.t;
              again++;
              againWave[f.wave]!++;
            }
            if (f.passes === 1 && seen[i] === 0 && f.phase === EF_FLYING && airSortieComplete(f.port.state)) {
              seen[i] = 1;
              completions++;
            }
            if (plan.evStart & (1 << i) && f.passes === 2) {
              expect(dawnReached(f.startS, r.t)).toBe(true);
              expect(dawnReached(f.startS, r.t - DT)).toBe(false);
            }
            if (f.passes === 2 && done2[i] === 0 && f.phase === EF_FLYING && airSortieComplete(f.port.state)) {
              done2[i] = 1;
              expect(r.t + DT).toBeLessThanOrEqual(f.startS + repass.passS[i]! + 1e-9);
              expect(r.t).toBeLessThan(repass.untilS[i]!);
            }
            // 波の終わりの後に予告したまま・2 回目で動いている（中断していない）編隊は無い（毎ステップの expect は遅いので数える）
            if (r.t >= repass.untilS[i]! - 1e-9 && (f.phase === EF_ANNOUNCED || (f.passes === 2 && evacFlightLive(f) && !f.port.state.cancelled))) overlap++;
          }
        });
        // 1 回目の済み（全機撃墜でない）は、予告し直したか、収まらないか、狙いが無いかのどれか 1 つ
        expect(overlap).toBe(0);
        expect(repass.again + repass.noFit + repass.noTarget).toBe(completions);
        expect(plan.flights.every((f) => f.passes <= 2)).toBe(true);
        for (let i = 0; i < n; i++) if (plan.flights[i]!.passes === 2) expect(reAt[i]).not.toBeNaN();
      }
    }
    expect(again).toBeGreaterThan(0);
    // data の時間（予告 15・70・125・180 秒・先 10 秒）では、2 回目が収まるのは第 1 波（2 機）だけ
    expect(againWave.slice(1)).toEqual([0, 0, 0]);
  });

  it('狙いは波の最初の予告と同じ枠の決め（枠 0＝操作中の隊、枠 ≥ 1 は操作中の隊を外して段 B を先・枠の点に近い順・いま狙われている隊を外す）', () => {
    let checked = 0;
    let slot0Control = 0;
    for (const hard of [false, true]) {
      for (let seed = 1; seed <= 8; seed++) {
        const r = two(seed, hard);
        const { plan, repass } = r.air;
        for (let k = 0; k < 240 / DT; k++) {
          const before = evacSurvivors(r.sq);
          const ctl = r.sq.control;
          stepAirRig(r, NEUTRAL);
          if (repass.ev === 0 || evacSurvivors(r.sq) !== before || r.sq.control !== ctl) continue;
          for (let i = 0; i < plan.flights.length; i++) {
            if ((repass.ev & (1 << i)) === 0) continue;
            const f = plan.flights[i]!;
            const a = activeOn(plan, f);
            const want = f.slot === 0 && candidate(r.sq, ctl) && a[ctl] === 0 ? ctl : expectedTarget(plan, f.slot, a, f.slot > 0 ? ctl : -1);
            expect(f.target).toBe(want);
            expect(a[f.target]).toBe(0);
            if (f.slot > 0) expect(f.target).not.toBe(ctl);
            if (f.slot === 0 && f.target === ctl) slot0Control++;
            expect(f.view.boat.state).toBe(evacLeader(r.sq.groups[f.target]!)!.state);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(slot0Control).toBeGreaterThan(0);
  });

  it('始める前に狙った隊が隠れたら見失う（EO_LOST_EARLY・evLost）。決着の後は予告し直さず、予告し直した編隊も始めない（EO_SETTLED）', () => {
    const find = (r: AirRig): EvacFlight => {
      let f: EvacFlight | undefined;
      runAir(r, NEUTRAL, 240, () => {
        f = r.air.plan.flights.find((x, i) => (r.air.repass.ev & (1 << i)) !== 0);
        return f !== undefined;
      });
      return f!;
    };
    const r = two(2);
    const f = find(r);
    forceHidden(r, f.target);
    let lost = false;
    runAirUntil(r, NEUTRAL, f.startS + DT, () => void (lost ||= (r.air.plan.evLost & (1 << f.index)) !== 0));
    expect([f.phase, f.outcome, lost, f.passes]).toEqual([EF_OFF, EO_LOST_EARLY, true, 1]);
    expect(r.sq.targeted[f.target]).toBe(0);
    const s = two(2);
    const g = find(s);
    evacSettle(s.sq);
    const came = s.air.plan.came;
    runAirUntil(s, NEUTRAL, g.startS + DT);
    expect([g.phase, g.outcome, g.passes, s.air.plan.came]).toEqual([EF_OFF, EO_SETTLED, 1, came]);
    // 決着の後に済みになっても予告し直さない（直に呼ぶ）
    const u = two(2);
    const h = u.air.plan.flights[0]!;
    runAirUntil(u, NEUTRAL, h.startS + 1);
    evacSettle(u.sq);
    const before = [h.phase, h.target, h.startS, u.air.repass.again];
    evacRepassOnComplete(u.air.plan, u.air.repass, h);
    expect([h.phase, h.target, h.startS, u.air.repass.again]).toEqual(before);
  });

  it('撃墜した機は次の回に戻らない（落とし直して順番を飛ばす＝残りの機の爆弾だけ落ち、済みになる）。全機を落とした編隊は来ない', () => {
    const r = two(4);
    const f = r.air.plan.flights[1]!;
    runAirUntil(r, NEUTRAL, f.startS + 3);
    expect(evacDownPlane(f, 1)).toBe(true);
    expect(f.downed).toBe(2);
    expect(evacDownPlane(f, 1)).toBe(false);
    let bombs1 = NaN;
    let started = NaN;
    runAir(r, NEUTRAL, 120, () => {
      if (f.passes === 2 && Number.isNaN(started)) {
        started = r.t;
        bombs1 = f.port.state.bombsDropped;
        expect(f.port.state.planes[1]!.phase).toBe(AS_DONE);
        expect(f.port.state.planes[0]!.phase).not.toBe(AS_DONE);
      }
      return f.passes === 2 && airSortieComplete(f.port.state);
    });
    expect(started).not.toBeNaN();
    expect(airSortieComplete(f.port.state)).toBe(true);
    expect(f.port.state.bombsDropped - bombs1).toBe((f.p.planes - 1) * f.p.bombsPerPlane);
    const s = two(4);
    const g = s.air.plan.flights[1]!;
    runAirUntil(s, NEUTRAL, g.startS + 3);
    for (let i = 0; i < g.p.planes; i++) evacDownPlane(g, i);
    runAir(s, NEUTRAL, 80);
    expect([g.passes, g.outcome, s.air.repass.ev & 2]).toEqual([1, EO_DONE, 0]);
  });
});
