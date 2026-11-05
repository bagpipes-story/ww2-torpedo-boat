// v0.6.11 S3b（data evac_raid.passes_max 2＝U7・hard.evac_passes_max）: もう一度来る編隊（core/evac-repass）の模擬の側。tests/evac-repass（段取りの rig）の続き（300 行の内に分けた）。
// passes_max 1（上書き）は S3 と同じ（模擬の 6 回の指紋が 333c8ec の木の core に S3b の data を入れたものと同じ。S8 の core の直しで 1 行だけ変わった・予告し直さない）。passes_max 2 の乱数（+29 は波ごとのまま・
// +30 は時計だけ・+31 と編隊の系列は投下の数）・終わり方は 1 回ごとに足し合う（closed）・模擬の表の監視の列・つまみ（PASSES・PASSESH）・確保は作る時だけ。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { EO_DONE } from '../src/core/evac-plan';
import { EVAC_NO_HOOKS } from '../src/core/evac-seat';
import { runEvacTrial, type EvacTrial } from '../src/core/evac-sim';
import { evacCellOf } from '../src/core/evac-sim-cell';
import type { EvacPolicy } from '../src/core/evac-sim-policy';
import { evacSimSetup } from '../src/systems/evac-sim-setup';
import { NEUTRAL } from './evac-kit';
import { HARD, NORMAL, countDraws, makeAirRig, runAir, type AirRig } from './evac-air-kit';

const RAID = NORMAL.evac!.raid;
const two = (seed: number, hard = false): AirRig => makeAirRig(seed, hard, {}, EVAC_NO_HOOKS, { passesMax: 2 });

describe('passes_max 1（上書き＝S3 の挙動）は S3 の木と同じ', () => {
  it('data は 2（ノーマル・ハード）。passes_max 1 の模擬の 6 回の指紋（終わり・残存・秒・+29/+30/+31/編隊の引く回数・来た・済み・命中・撃墜・発・切替）が 333c8ec（S3）の木の core に S3b の data（passes の鍵を除く）を入れたものと同じ', () => {
    expect([NORMAL.evac!.raid.passesMax, HARD.evac!.raid.passesMax]).toEqual([2, 2]);
    const N = evacSimSetup(gameData, false, { passesMax: 1 });
    const H = evacSimSetup(gameData, true, { passesMax: 1 });
    expect([N.raid.passesMax, H.raid.passesMax]).toEqual([1, 1]);
    const fp = ([[N, 'seq', 3], [N, 'stay', 4], [N, 'seq_shoot', 5], [N, 'dodge_only', 6], [H, 'seq', 7], [H, 'bot', 8]] as const).map(([s, pol, seed]) => {
      const t = runEvacTrial(s, pol as EvacPolicy, seed);
      return [t.end, t.survivors, t.survivorsAtSettle, Math.round(t.timeS * 1000), t.draws29, t.draws30, t.draws31, t.drawsFlights, t.came, t.done, t.boatHits, t.seatHits, t.downs, t.rounds, t.switches];
    });
    // 333c8ec の木の core/evac-sim に S3b の data（missions_seed・risk_events。evac_raid の passes_max・passes_max_source を除く）を入れ、同じ式（使い捨ての束）から取った値。
    // v0.6.11 S8 の core の直し 2 つ（core/evac-shelter: 入っている隊の交代で新しい隊長艇を止める・見つかった陰の操作中の隊は輪の外へ出れば出る）で、ハードの bot seed 8 の 1 行だけ
    // 変わった（残存 9 → 10・艇への命中 21 → 19・座席への命中 4 → 3。引く回数・来た・済みは同じ）。ほかの 5 行は S3 の木のまま
    expect(fp).toEqual([
      ['home', 8, 8, 240000, 4, 570, 41, 96, 8, 4, 24, 10, 0, 0, 12],
      ['home', 6, 6, 250600, 4, 570, 37, 90, 8, 5, 25, 16, 0, 0, 0],
      ['home', 11, 11, 249667, 4, 570, 28, 70, 8, 4, 21, 5, 2, 210, 19],
      ['home', 10, 10, 249983, 4, 570, 47, 110, 8, 6, 17, 12, 0, 0, 11],
      ['home', 7, 7, 240000, 4, 570, 43, 106, 10, 5, 27, 14, 0, 0, 10],
      ['home', 10, 10, 240000, 4, 570, 41, 94, 9, 5, 19, 3, 0, 0, 6],
    ]);
  }, 60_000);
  it('予告し直さない・どの編隊も 1 回まで・済みは済みのまま（ノーマル・ハード）', () => {
    for (const hard of [false, true]) {
      const r = makeAirRig(7, hard, {}, EVAC_NO_HOOKS, { passesMax: 1 });
      runAir(r, NEUTRAL, 240, () => void expect(r.air.repass.ev).toBe(0));
      expect(r.air.repass.again + r.air.repass.noFit + r.air.repass.noTarget).toBe(0);
      expect(r.air.plan.flights.every((f) => f.passes <= 1 && f.port.state.waves <= 1)).toBe(true);
      expect(r.air.plan.flights.some((f) => f.outcome === EO_DONE)).toBe(true);
    }
  }, 60_000);
});

describe('passes_max 2: 乱数・模擬の表・確保', () => {
  const S2 = evacSimSetup(gameData, false, { passesMax: 2 });
  const H2 = evacSimSetup(gameData, true, { passesMax: 2 });
  const drawsOk = (t: EvacTrial): void => {
    expect(t.draws29).toBe(t.exp29);
    expect(t.draws30).toBe(t.exp30);
    expect(t.draws31).toBe(t.exp31);
    expect(t.drawsFlights).toBeGreaterThanOrEqual(2 * t.exp31);
    expect(t.drawsFlights).toBeLessThanOrEqual(2 * t.exp31 + 2 * t.boatHits + 2 * t.seatHits);
  };

  it('+29 は予告し直しで引かない（波ごとに陰の数＝1 回のまま）・+30 は passes_max 1 と同じ・+31 は投下ごとに 1 回・編隊の系列は投下ごとに 2 回 ＋ 命中の分（模擬・ノーマル／ハード）', () => {
    expect([S2.raid.passesMax, H2.raid.passesMax]).toEqual([2, 2]);
    let again = 0;
    for (const [s, s1] of [[S2, evacSimSetup(gameData, false, { passesMax: 1 })], [H2, evacSimSetup(gameData, true, { passesMax: 1 })]] as const) {
      for (const p of ['seq', 'stay', 'seq_shoot'] as EvacPolicy[]) {
        for (const seed of [1, 2, 3]) {
          const t = runEvacTrial(s, p, seed);
          drawsOk(t);
          if (t.timeS >= s.durationS) expect(t.exp29).toBe(1 * RAID.waves.length); // 陰は 1 か所（S3b）。18 隻が決着の前に沈めば途中で終わる
          const t1 = runEvacTrial(s1, p, seed);
          if (t.timeS >= s.durationS && t1.timeS >= s.durationS) expect(t.draws30).toBe(t1.draws30);
          again += t.again;
          expect(t.passes).toBe(t.flew + t.again);
        }
      }
    }
    expect(again).toBeGreaterThan(0);
    expect(runEvacTrial(S2, 'seq', 9)).toEqual(runEvacTrial(S2, 'seq', 9));
    const c = evacCellOf([1, 2, 3, 4].map((seed) => runEvacTrial(S2, 'stay', seed)));
    expect(c.drawBad).toBe(0);
    expect(c.passesPerFlight).toBeGreaterThan(1);
    expect(c.againPct).toBeCloseTo(100 * (c.passesPerFlight - 1), 9);
    expect([c.againByWavePct[1]! > 0, c.againByWavePct[3]]).toEqual([true, 0]); // 第 4 波は duration_s に近く 2 回目が来ない
    // 段取りの直の系列（rig）: 陰の発見は 2 × 波の数、逃げる乱数は投下の数（2 回目の投下を含む）
    const r = two(7);
    const reveal = countDraws(r.air.plan.reveal);
    const dodge = countDraws(r.air.dodge);
    runAir(r, NEUTRAL, 240);
    expect(r.air.repass.again).toBeGreaterThan(0);
    expect([reveal(), dodge()]).toEqual([1 * RAID.waves.length, r.air.plan.releases]);
    expect(r.air.plan.releases).toBe(r.air.plan.flights.reduce((a, f) => a + f.port.state.bombsDropped, 0));
  }, 60_000);

  it('終わり方は 1 回ごとに足し合う: 予告した（予告し直しを含む）＝ 目標なし ＋ 見失い（前・途中）＋ 全滅 ＋ 決着 ＋ 済み（閉じた回は closed から＝telemetry だけ。決着まで来た回）', () => {
    let again = 0;
    let n = 0;
    for (const s of [S2, H2]) {
      for (const p of ['seq', 'stay', 'dodge_only', 'bot'] as EvacPolicy[]) {
        for (const seed of [1, 2, 3]) {
          const t = runEvacTrial(s, p, seed);
          // 18 隻が決着の前に沈んだ回は途中で終わり、飛んでいた編隊の終わり方が決まらない（数えない）
          if (Number.isNaN(t.survivorsAtSettle)) continue;
          n++;
          expect(t.announced).toBe(t.noTarget + t.lostEarly + t.lostMid + t.gone + t.settledFl + t.done);
          expect(t.came).toBeLessThanOrEqual(t.announced - t.noTarget - t.lostEarly);
          expect(t.came).toBeGreaterThanOrEqual(t.lostMid + t.done);
          again += t.again;
        }
      }
    }
    expect([n >= 16, again > 0]).toEqual([true, true]);
  }, 60_000);

  it('PASSESH（hard.evac_passes_max）はハードだけに効く。ハードの鍵が無ければノーマルの値', () => {
    expect([evacSimSetup(gameData, false, { passesMaxHard: 1 }).raid.passesMax, evacSimSetup(gameData, true, { passesMaxHard: 1 }).raid.passesMax]).toEqual([2, 1]);
    expect(evacSimSetup(gameData, true, { passesMax: 1, passesMaxHard: 2 }).raid.passesMax).toBe(2);
    expect(evacSimSetup(gameData, true, { passesMax: 1 }).raid.passesMax).toBe(1);
    expect(() => evacSimSetup(gameData, false, { passesMax: 4 })).toThrow(/passes_max は 1〜3 の整数.*V-E13/);
  }, 60_000);

  it('確保は作る時だけ（編隊・view・状態・爆弾のプール・見積もりの配列の物が 240 秒で同じ。ハード）', () => {
    const r = two(5, true);
    const { passS, untilS } = r.air.repass;
    const before = r.air.plan.flights.map((f) => [f, f.view, f.view.boat, f.port, f.port.state, f.port.state.planes, f.port.state.bombs, f.rng, f.base] as const);
    runAir(r, NEUTRAL, 240);
    r.air.plan.flights.forEach((f, i) => [f, f.view, f.view.boat, f.port, f.port.state, f.port.state.planes, f.port.state.bombs, f.rng, f.base].forEach((x, k) => expect(x).toBe(before[i]![k])));
    expect([r.air.repass.passS, r.air.repass.untilS]).toEqual([passS, untilS]);
    expect(r.air.repass.passS).toBe(passS);
    expect(r.air.plan.flights.length).toBe(RAID.waves.length * r.air.plan.raid.flights);
    expect(r.air.plan.flights.some((f) => f.passes === 2)).toBe(true);
  }, 60_000);
});
