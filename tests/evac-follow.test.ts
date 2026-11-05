// v0.6.11 S1（spec-v0611-r2 §3.4・§3.5・§13 の S1）: 僚艇の航跡をたどる縦列（r2 M4）と操作していない隊（core/evac-follow）。
// 直進の間隔・180° 反転の最小間隔・交代と壕から出た後の航跡・+30 の引く回数が時計だけで決まる・pick の境のステップ（r2 M13）・+31 は投下ごとに 1・
// 縁の箱で中心へ・狙われたら全速・離岸・操作をやめた隊の指令・回避あり／なしの 1 発の命中率の差（r2 M2。本物の空襲の core）。
import { describe, expect, it } from 'vitest';
import { G_HIDDEN, G_MOORED, G_UNDERWAY } from '../src/core/evac-data';
import { evacAiPick, evacCruise01, evacOnRelease, evacReleaseControl } from '../src/core/evac-follow';
import { EVAC_NO_HOOKS, evacSwitch } from '../src/core/evac-seat';
import { evacMarkSunk, evacPromote } from '../src/core/evac-shelter';
import { evacLeader, type EvacGroup } from '../src/core/evac-squadron';
import { SeededRng } from '../src/core/rng';
import { NEUTRAL, P, SETUP, dist, input, lossMean, makeRig, stepRig, stepRigFor, type EvacRig } from './evac-kit';

const CRUISE = evacCruise01(SETUP.boatParams);
/** 決まった値を順に返す乱数（尽きれば 0.99） */
const queue = (vs: number[]): SeededRng => {
  let i = 0;
  return { next: () => vs[i++] ?? 0.99 } as unknown as SeededRng;
};
/** 隊 0〜3 の 8 回（隊 4 の 2 回の前） */
const SKIP4 = Array<number>(8).fill(0.99);

function minGap(g: EvacGroup): number {
  const [a, b, c] = g.boats.map((x) => x.state) as [typeof g.boats[0]['state'], typeof g.boats[0]['state'], typeof g.boats[0]['state']];
  return Math.min(dist(a, b), dist(b, c), dist(a, c));
}

/** 航跡の輪が隊長艇の艇尾方向の直線（trail_step_m 間隔）で満たされている */
function expectStraightTrail(g: EvacGroup): void {
  const lead = evacLeader(g)!.state;
  const h = (lead.headingDeg * Math.PI) / 180;
  const n = g.trailX.length;
  expect(g.trailCount).toBe(n);
  for (let i = 0; i < n; i++) {
    const idx = (g.trailHead - i + n) % n;
    expect(g.trailX[idx]).toBeCloseTo(lead.x - Math.sin(h) * i * P.trailStepM, 6);
    expect(g.trailY[idx]).toBeCloseTo(lead.y + Math.cos(h) * i * P.trailStepM, 6);
  }
}

describe('航跡をたどる縦列（r2 M4）', () => {
  it.each([['巡航', CRUISE], ['半速', 0.5], ['全速', 1]])('直進（%s）では隣の艇との間隔が follow.gap_m ±10%', (_l, sp) => {
    const r = makeRig();
    const g = r.sq.groups[0]!;
    stepRigFor(r, input(90, sp), 15);
    expect(g.phase).toBe(G_UNDERWAY);
    for (const [a, b] of [[0, 1], [1, 2]] as const) {
      const d = dist(g.boats[a]!.state, g.boats[b]!.state);
      expect(d).toBeGreaterThan(P.followGapM * 0.9);
      expect(d).toBeLessThan(P.followGapM * 1.1);
    }
  });
  it.each([['巡航', CRUISE], ['半速', 0.5], ['全速', 1]])('180° 反転（%s）でも 3 隻の最小間隔が gap_m × 0.5 を下回らない（隊長艇の通った跡を回る）', (_l, sp) => {
    const r = makeRig();
    const g = r.sq.groups[0]!;
    stepRigFor(r, input(90, sp), 15);
    let min = Infinity;
    stepRigFor(r, input(270, sp), 15, () => {
      min = Math.min(min, minGap(g));
    });
    expect(min).toBeGreaterThanOrEqual(P.followGapM * 0.5);
    // 反転の後も縦列に戻る
    expect(dist(g.boats[0]!.state, g.boats[1]!.state)).toBeCloseTo(P.followGapM, -1);
  });
  it('隊長艇の交代と壕から出た後は、航跡を新しい隊長艇の艇尾方向の直線で満たし直す', () => {
    const r = makeRig();
    const g = r.sq.groups[0]!;
    stepRigFor(r, input(90, 1), 5);
    stepRigFor(r, input(0, 1), 1.5);
    evacMarkSunk(g.boats[0]!, r.t);
    evacPromote(r.sq, g);
    expectStraightTrail(g);
    const home = P.shelters[P.homeShelter]!;
    g.phase = G_HIDDEN;
    g.shelter = P.homeShelter;
    stepRig(r, input(0, 1));
    expect(g.phase).toBe(G_UNDERWAY);
    expectStraightTrail(g);
    expect(evacLeader(g)!.state.y).toBeCloseTo(home.y, 9);
  });
});

/** aiRng の next を数え、引いたステップの番号（1 始まり）を返す（世界と同じ時計の足し方: t += 1/60） */
function drawSteps(r: EvacRig, steps: number, each: (i: number) => void): number[] {
  const at: number[] = [];
  const next = r.ai.next.bind(r.ai);
  let i = 0;
  r.ai.next = () => (at.push(i), next());
  for (i = 1; i <= steps; i++) {
    each(i);
    stepRig(r, NEUTRAL);
  }
  return at;
}

describe('操作していない隊の乱数（seed+30・+31。M3・r2 M13）', () => {
  it('pick の境は stepTimeS ≥ nextPickS（t += 1/60 の丸めで 5 秒の境は 301 ステップ目）。決着（14400 ステップ目＝240 秒）の前の 47 回だけ、毎回 6 隊 × 2 回', () => {
    const at = drawSteps(makeRig(), 14400, () => {});
    const steps = [...new Set(at)];
    expect(steps.slice(0, 5)).toEqual([301, 600, 900, 1200, 1501]);
    expect(steps.length).toBe(47);
    expect(steps[46]).toBe(14100);
    for (const s of steps) expect(at.filter((x) => x === s).length).toBe(12);
  });
  it('+30 の引く回数とステップは時計だけで決まる（隠れ・沈没・全滅・操作中・切替でも同じ）', () => {
    const plain = drawSteps(makeRig(5), 6000, () => {});
    const r = makeRig(5);
    const busy = drawSteps(r, 6000, (i) => {
      if (i === 100) r.sq.groups[2]!.phase = G_HIDDEN;
      if (i === 1000) for (const b of r.sq.groups[3]!.boats) evacMarkSunk(b, r.t);
      if (i === 1001) evacPromote(r.sq, r.sq.groups[3]!);
      if (i === 2000) evacSwitch(r.sq, r.seat, EVAC_NO_HOOKS);
      if (i === 3000) r.sq.groups[4]!.dodgeLeftS = 5;
    });
    expect(busy).toEqual(plain);
  });
  it('+31 は投下ごとに必ず 1 回（中心なし・座席・隠れた隊・走る隊のどれでも）。転舵は操作していない走る隊長艇で u < dodge.success の時だけ', () => {
    const r = makeRig();
    stepRigFor(r, NEUTRAL, 25);
    let n = 0;
    const rng = { next: () => (n++, P.dodgeSuccess - 0.01) } as unknown as SeededRng; // u < success（S3b の 0.2 で 0.19）
    r.sq.groups[2]!.phase = G_HIDDEN;
    expect([evacOnRelease(r.sq, rng, -1), evacOnRelease(r.sq, rng, 0), evacOnRelease(r.sq, rng, 2), evacOnRelease(r.sq, rng, 1)]).toEqual([false, false, false, true]);
    expect(n).toBe(4);
    const g = r.sq.groups[1]!;
    expect([g.aiSpeed01, g.dodgeLeftS]).toEqual([1, P.dodgeHoldS]);
    // 今の旋回の逆へ dodge.turn_deg（右へ回っている → 左へ）
    const lead = evacLeader(g)!.state;
    expect(((lead.headingDeg - g.aiHeadingDeg + 540) % 360) - 180).toBeCloseTo(P.dodgeTurnDeg, 6);
    const hi = { next: () => P.dodgeSuccess } as unknown as SeededRng;
    expect(evacOnRelease(r.sq, hi, 3)).toBe(false);
  });
  it('縁の箱の外を向く選びは港の中心への方位 ± wall_turn_deg、狙われていれば全速・それ以外は u₂ < full_p で全速', () => {
    const r = makeRig();
    const g = r.sq.groups[4]!;
    const lead = evacLeader(g)!.state;
    g.phase = G_UNDERWAY;
    // 西の縁の近くで西向き: 今の針路のまま（u₁ 0.5）だと look_m 先が箱の外 → 港の中心（東）への方位 + (2u₁ − 1) × wall_turn_deg
    Object.assign(lead, { x: 250, y: 625, headingDeg: 270 });
    r.sq.nextPickS = 0;
    evacAiPick(r.sq, queue([...SKIP4, 0.5, 0.9]), 1);
    expect(g.aiHeadingDeg).toBeCloseTo(90, 9);
    expect(g.aiSpeed01).toBeCloseTo(evacCruise01(evacLeader(g)!.params), 9);
    evacAiPick(r.sq, queue([...SKIP4, 0.6, 0.9]), r.sq.nextPickS);
    expect(g.aiHeadingDeg).toBeCloseTo(90 + 0.2 * P.wallTurnDeg, 9);
    // 回して箱の内を向くなら今の針路 ± turn_max_deg のまま（270 + 120 = 30°。400 m 先は箱の内）
    evacAiPick(r.sq, queue([...SKIP4, 1, 0.9]), r.sq.nextPickS);
    expect(g.aiHeadingDeg).toBeCloseTo(30, 9);
    // 港の中ほどでは今の針路 + (2u₁ − 1) × turn_max_deg。狙われていれば u₂ によらず全速
    Object.assign(lead, { x: 1600, y: 625, headingDeg: 90 });
    r.sq.targeted[4] = 1;
    evacAiPick(r.sq, queue([...SKIP4, 0.75, 0.99]), r.sq.nextPickS);
    expect(g.aiHeadingDeg).toBeCloseTo(90 + 0.5 * P.turnMaxDeg, 9);
    expect(g.aiSpeed01).toBe(1);
    r.sq.targeted[4] = 0;
    evacAiPick(r.sq, queue([...SKIP4, 0.5, P.fullP - 0.01]), r.sq.nextPickS);
    expect(g.aiSpeed01).toBe(1);
  });
  it('離岸: 操作していない停泊の隊は生成の時に引いた秒で巡航で走り出す。操作中の停泊の隊は離岸しない', () => {
    const r = makeRig(3);
    const last = Math.max(...r.sq.groups.map((g) => g.castOffS));
    stepRigFor(r, NEUTRAL, last + 0.1);
    expect(r.sq.groups[0]!.phase).toBe(G_MOORED);
    for (const g of r.sq.groups.slice(1)) expect(g.phase).toBe(G_UNDERWAY);
  });
  it('操作をやめた隊は今の針路・今の速さから回避を始める（次の pick の境で選ぶ）', () => {
    const r = makeRig();
    stepRigFor(r, input(120, 0.6), 4);
    const g = r.sq.groups[0]!;
    const lead = evacLeader(g)!;
    evacReleaseControl(g);
    expect(g.aiHeadingDeg).toBe(lead.state.headingDeg);
    expect(g.aiSpeed01).toBeCloseTo(lead.state.speedMps / lead.params.speedMaxMps, 12);
  });
});

describe('回避あり／なしの 1 発の命中率（r2 M2。本物の stepAirStrike・pointNearBoat・applyShellHit。5 点未満なら回避をつまみから外す）', () => {
  it('走る隊長艇への 1 発の命中率は、必ず避けると避けないより 5 点以上低い（data の dodge.success はその間）', () => {
    const rows: string[] = [];
    for (const planes of [2, 3, 4]) {
      const none = lossMean('running', planes, true, 0, 150).centerHitRate;
      const half = lossMean('running', planes, true, P.dodgeSuccess, 150).centerHitRate;
      const all = lossMean('running', planes, true, 1, 150).centerHitRate;
      rows.push(`${planes} 機: 避けない ${none.toFixed(3)} ・ dodge.success ${P.dodgeSuccess} ${half.toFixed(3)} ・ 必ず ${all.toFixed(3)}`);
      expect(none - all).toBeGreaterThanOrEqual(0.05);
      expect(half).toBeLessThan(none);
      expect(half).toBeGreaterThan(all);
    }
    console.log(`[evac M2] 1 発の命中率（中心の隊長艇・走る・追う・N 150）\n${rows.join('\n')}`);
  }, 60_000);
});

