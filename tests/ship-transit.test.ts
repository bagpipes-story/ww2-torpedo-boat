// v0.8.0 S1（spec-v0800 §4.4・§4.5・§6 の S1）: core/ship-transit の列の通過（WAIT → IN → AWAY → OUT → GONE・沈めば SUNK）を、us_04 の setup の時刻表（TransitSetup）と
// 理想の直線の動き（世界の写し: 艦は dt＝feelDt × time_scale でまっすぐ進む・現れたステップのうちに現れる点へ置く）で回す。時刻・間隔・戻りの順・沈んだ艦は戻らない・
// 夜明けにビラの艦は戻らない・ハード 4 隻・V-T3 の式（transitLastGoneS）・命中スロー（入りは体感の時計＝間隔が縮まない、揚陸は固定ステップの時計＝スローで延びない）・
// 来た縁から出た艦・護衛の退き・残りの戻り・今夜の揺らぎは足さない・決定性・step の本体に確保なし。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { getPrototypeMission } from '../src/config/mission-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import { TRANSIT_CHECK_DAWN_MARGIN_S, getTransitParams, type TransitSetup } from '../src/config/transit-mission-data';
import {
  TRANSIT_AWAY, TRANSIT_GONE, TRANSIT_IN, TRANSIT_OUT, TRANSIT_SUNK, TRANSIT_WAIT,
  createShipTransit, stepShipTransit, transitAppearLeg, transitCount, transitEnterAtS, transitOnMap, transitPending, type ShipTransitState,
} from '../src/core/ship-transit';
import { directSortie } from '../src/core/sortie';
import { TRANSIT_MAX_SHIPS, transitLastGoneS } from '../src/core/transit-data';
import { buildWorldSetup } from '../src/systems/world-setup';
import { code, imports, scanAllocations } from './core-rules-kit';

const STEP = FIXED_STEP_S;
const TS = gameData.hitRateModel.world.time_scale;
const { hit_slowmo_factor: SLOW_F, hit_slowmo_seconds: SLOW_S } = gameData.hitRateModel.feel;
const LOST_S = SLOW_S * (1 - SLOW_F); // 命中スロー 1 回で体感の時計が固定ステップの時計から遅れる秒（0.84）
const plan = (hard = false): TransitSetup => getTransitParams(gameData, getPrototypeMission(gameData, 'us_04', hard), null, false)!;
const DURATION = getPrototypeMission(gameData, 'us_04').durationS;

interface Ship { state: { x: number }; sinking: boolean; dir: number }
interface Opts { untilS?: number; slow?: readonly (readonly [number, number])[]; dawnS?: number; sinkAt?: Readonly<Record<number, number>>; turnAt?: Readonly<Record<number, number>> }
type Log = Record<'enter' | 'arrive' | 'ret' | 'gone' | 'sunk' | 'cover', number[]>;

/** 理想の世界の 1 夜: 動かす → stepShipTransit → 現れた艦を現れる点へ。slow は命中スローの [始め, 終わり) 実秒。夜明けの後は IN の艦を来た縁へ（世界の退き）。turnAt はその秒に向きを逆に */
function run(p: TransitSetup, o: Opts = {}): { s: ShipTransitState; log: Log; gapAtEnter: number[] } {
  const s = createShipTransit(p);
  const ships: Ship[] = Array.from({ length: p.ships }, () => ({ state: { x: NaN }, sinking: false, dir: 0 }));
  const log: Log = { enter: [], arrive: [], ret: [], gone: [], sunk: [], cover: [] };
  const gapAtEnter: number[] = [];
  const v = p.speedMps * TS;
  const inDir = Math.sign(p.inbound.goneX - p.inbound.appearX);
  const outDir = Math.sign(p.outbound.goneX - p.outbound.appearX);
  let now = 0;
  while (now < (o.untilS ?? DURATION + 30)) {
    const feel = STEP * ((o.slow ?? []).some(([a, b]) => now >= a - 1e-9 && now < b - 1e-9) ? SLOW_F : 1);
    now += STEP;
    for (let i = 0; i < p.ships; i++) if (transitOnMap(s, i)) ships[i]!.state.x += ships[i]!.dir * v * feel;
    const dawn = o.dawnS !== undefined && now >= o.dawnS;
    for (let i = 0; i < p.ships; i++) {
      if (dawn && s.phase[i] === TRANSIT_IN) ships[i]!.dir = -inDir;
      if (o.turnAt?.[i] !== undefined && Math.abs(now - o.turnAt[i]!) < STEP / 2) ships[i]!.dir *= -1;
      if (o.sinkAt?.[i] !== undefined && now >= o.sinkAt[i]!) ships[i]!.sinking = true;
    }
    stepShipTransit(s, p, feel, now, dawn, ships);
    if (s.coverLeaves) log.cover.push(now);
    for (let i = 0; i < p.ships; i++) {
      const bit = 1 << i;
      const sh = ships[i]!;
      if (s.entered & bit) {
        if (i > 0) gapAtEnter[i] = (ships[i - 1]!.state.x - p.inbound.appearX) * inDir;
        sh.dir = inDir;
        sh.state.x = p.inbound.appearX;
        log.enter[i] = now;
      }
      if (s.returned & bit) {
        sh.dir = outDir;
        sh.state.x = p.outbound.appearX;
        log.ret[i] = now;
      }
      if (s.arrived & bit) log.arrive[i] = now;
      if (s.gone & bit) log.gone[i] = now;
      if (s.sunk & bit) log.sunk[i] = now;
    }
  }
  return { s, log, gapAtEnter };
}
const near = (a: number | undefined, b: number, steps: number): void => {
  expect(a, `${a} vs ${b}`).toBeDefined();
  expect(Math.abs(a! - b), `${a} vs ${b}`).toBeLessThanOrEqual(steps * STEP + 1e-9);
};
const counts = (s: ShipTransitState): number[] => [s.inCount, s.arrivedCount, s.outCount, s.goneCount, s.sunkCount];

describe('揺らぎのない夜の時刻表（us_04 の setup）と V-T3 の式', () => {
  it.each([false, true])('ハード %s: 入り 18 ＋ 8 秒おき → 渡り 77.76 秒でビラ → 揚陸 40 秒 → 着いた順に復路 → 渡りで去る。最後の艦は transitLastGoneS（夜明けの 20 秒前まで）', (hard) => {
    const p = plan(hard);
    expect(p.ships).toBe(hard ? 4 : 3);
    const { s, log } = run(p);
    for (let i = 0; i < p.ships; i++) {
      near(log.enter[i], transitEnterAtS(p, i), 1);
      near(log.arrive[i], log.enter[i]! + p.crossS, 2);
      near(log.ret[i], log.arrive[i]! + p.unloadS, 1);
      near(log.gone[i], log.ret[i]! + p.crossS, 2);
    }
    expect(log.ret).toEqual([...log.ret].sort((a, b) => a - b));
    const last = transitLastGoneS(p.enterS, p.ships, p.spacingS, p.crossS, p.unloadS);
    near(log.gone[p.ships - 1], last, 4);
    expect(last).toBeCloseTo(hard ? 237.52 : 229.52, 1);
    expect(log.gone[p.ships - 1]!).toBeLessThanOrEqual(DURATION - TRANSIT_CHECK_DAWN_MARGIN_S);
    expect([...counts(s), transitPending(s), transitCount(s, TRANSIT_GONE)]).toEqual([p.ships, p.ships, p.ships, p.ships, 0, 0, p.ships]);
  });
  it('入りの時刻・現れる道・作る時の数の検査（1〜6 隻）', () => {
    const p = plan();
    expect([0, 1, 2].map((i) => transitEnterAtS(p, i))).toEqual([18, 26, 34]);
    expect([TRANSIT_IN, TRANSIT_OUT, TRANSIT_WAIT, TRANSIT_AWAY].map((ph) => transitAppearLeg(p, ph))).toEqual([p.inbound, p.outbound, null, null]);
    expect([p.inbound.appearX, p.inbound.laneY, p.inbound.headingDeg, p.outbound.appearX, p.outbound.laneY, p.outbound.headingDeg]).toEqual([150, 1500, 90, 5850, 2300, 270]);
    for (const n of [0, 7, 2.5]) expect(() => createShipTransit({ ...p, ships: n }), String(n)).toThrow(/列の艦の数/);
    expect(createShipTransit({ ...p, ships: TRANSIT_MAX_SHIPS }).phase.length).toBe(TRANSIT_MAX_SHIPS);
  });
  it('残りの戻り（WAIT と AWAY）は入りで減り、揚陸で増え、戻ると減る', () => {
    const at = (t: number): number[] => {
      const { s } = run(plan(), { untilS: t });
      return [transitPending(s), transitCount(s, TRANSIT_IN), transitCount(s, TRANSIT_AWAY), transitCount(s, TRANSIT_OUT)];
    };
    expect([at(10), at(30), at(100), at(120), at(147), at(240)]).toEqual([[3, 0, 0, 0], [1, 2, 0, 0], [1, 2, 1, 0], [3, 0, 3, 0], [1, 0, 1, 2], [0, 0, 0, 0]]);
  });
  it('今夜の揺らぎは setup に入ったまま使う（足さない）: seed 12345 の夜の入りは setup の enterS、道は setup の y', () => {
    const t = buildWorldSetup(gameData, 'us_04', { sortie: directSortie('us_04', 12345, 'none', false, false) }).transit!;
    expect(t.enterS).not.toBe(18);
    const { log } = run(t, { untilS: 60 });
    near(log.enter[0], t.enterS, 1);
    near(log.enter[1], t.enterS + t.spacingS, 1);
  });
  it('同じ入力で同じ段階と時刻（決定性）', () => {
    const o: Opts = { slow: [[40, 41.2], [130, 131.2]], sinkAt: { 1: 150 }, dawnS: 230 };
    expect(JSON.stringify(run(plan(true), o))).toBe(JSON.stringify(run(plan(true), o)));
  });
});

describe('沈んだ艦・護衛の退き・来た縁から出た艦', () => {
  it('往路で沈んだ艦は着かず戻らない（ほかの艦はそのまま）。護衛は復路の最初の艦と一緒に 1 回だけ退く', () => {
    const p = plan();
    const base = run(p).log;
    const { s, log } = run(p, { sinkAt: { 1: 60 } });
    near(log.sunk[1], 60, 1);
    expect([log.arrive[1], log.ret[1], log.gone[1], s.phase[1]]).toEqual([undefined, undefined, undefined, TRANSIT_SUNK]);
    expect([log.ret[0], log.ret[2], log.gone[2]]).toEqual([base.ret[0], base.ret[2], base.gone[2]]);
    expect(counts(s)).toEqual([3, 2, 2, 2, 1]);
    expect([log.cover, base.cover]).toEqual([[base.ret[0]], [base.ret[0]]]);
    expect(s.firstOutS).toBe(base.ret[0]);
  });
  it('先頭が往路で沈めば護衛は 2 隻目の戻りで退く。coverLeavesWithOutbound が偽なら退かない（最初の戻りの秒は残す）', () => {
    const p = plan();
    const a = run(p, { sinkAt: { 0: 40 } });
    expect(a.log.cover).toEqual([a.log.ret[1]]);
    const b = run({ ...p, coverLeavesWithOutbound: false });
    expect([b.log.cover, b.s.firstOutS]).toEqual([[], b.log.ret[0]]);
  });
  it('復路で沈んだ艦は SUNK（去ったに数えない）。WAIT・AWAY の艦の sinking は読まない（海域に戻ったステップの次から）', () => {
    const p = plan();
    const { s, log } = run(p, { sinkAt: { 2: 180 } });
    near(log.sunk[2], 180, 1);
    expect(counts(s)).toEqual([3, 3, 3, 2, 1]);
    const away = run(p, { sinkAt: { 0: 100 } }); // 艦 0 は 95.8 秒にビラへ着いた（AWAY）。印が立っていても揚陸の地では段階は変わらない
    expect([away.log.arrive[0]! < 100, away.log.ret[0] !== undefined, away.s.phase[0]]).toEqual([true, true, TRANSIT_SUNK]);
    near(away.log.sunk[0], away.log.ret[0]! + STEP, 0);
  });
  it('往路の艦が来た縁（西）の外へ戻れば GONE（着かない・戻らない）、復路の艦がビラの側（東）の外へ戻っても GONE', () => {
    const p = plan();
    const v = p.speedMps * TS;
    const back = run(p, { turnAt: { 0: 19 } }); // 18 秒に入り、19 秒に向きを逆に（東へ約 77 m 進んだ所から西の縁の外 −150 m まで）
    near(back.log.gone[0], 19 + (v * (19 - back.log.enter[0]!) + p.inbound.appearX - p.outbound.goneX) / v, 2);
    expect([back.log.arrive[0], back.log.ret[0], back.s.phase[0]]).toEqual([undefined, undefined, TRANSIT_GONE]);
    const east = run(p, { turnAt: { 0: 137 } }); // 復路に戻って約 1.2 秒で東へ
    const xTurn = p.outbound.appearX - v * (137 - east.log.ret[0]!);
    near(east.log.gone[0], 137 + (p.inbound.goneX - xTurn) / v, 2);
    expect([east.s.phase[0], east.s.goneCount, east.s.arrivedCount]).toEqual([TRANSIT_GONE, 3, 3]);
  });
});

describe('夜明け（世界のラッチを dawn で渡す）', () => {
  it('ビラにいる艦は戻らない（ビラに残った）。残りの戻りは 0', () => {
    const { s, log } = run(plan(), { dawnS: 120 }); // 3 隻とも揚陸の地（着いたのは 95.8・103.8・111.8 秒）
    expect([log.ret, transitCount(s, TRANSIT_AWAY), transitPending(s), s.outCount, log.cover]).toEqual([[], 3, 0, 0, []]);
  });
  it('戻った艦はそのまま去り、まだビラの艦は残る（140 秒: 先頭だけ戻っていた）', () => {
    const { s, log } = run(plan(), { dawnS: 140 });
    expect([log.ret.length, s.goneCount, transitCount(s, TRANSIT_AWAY), transitPending(s)]).toEqual([1, 1, 2, 0]);
  });
  it('往路の艦は来た縁（西）へ退いて GONE、まだ来ない艦は入らない（20 秒: 先頭だけ入っていた）', () => {
    const { s, log } = run(plan(), { dawnS: 20 });
    expect([log.enter.length, log.arrive.length, s.goneCount, transitCount(s, TRANSIT_WAIT), transitPending(s)]).toEqual([1, 0, 1, 2, 0]);
    const mid = run(plan(), { dawnS: 50 }); // 3 隻とも往路の途中
    expect([mid.s.goneCount, mid.s.arrivedCount, transitCount(mid.s, TRANSIT_GONE)]).toEqual([3, 0, 3]);
  });
});

describe('命中スロー（艦は dt＝feelDt × time_scale で進む）', () => {
  it('入りの間のスロー: 後ろの艦の入りはスローの分だけ遅れ、入った時の列の間隔（m）は変わらない（固定ステップの時計で入れたら約 65 m 縮む）', () => {
    const p = plan();
    const v = p.speedMps * TS;
    const none = run(p, { untilS: 60 });
    const slow = run(p, { untilS: 60, slow: [[20, 20 + SLOW_S]] });
    near(slow.log.enter[1], none.log.enter[1]! + LOST_S, 2);
    for (const i of [1, 2]) {
      expect(Math.abs(slow.gapAtEnter[i]! - none.gapAtEnter[i]!), String(i)).toBeLessThanOrEqual(v * STEP + 1e-6);
      expect(slow.gapAtEnter[i]!).toBeCloseTo(v * p.spacingS, -1);
    }
    expect(slow.gapAtEnter[1]! - v * (p.spacingS - LOST_S)).toBeGreaterThan(60);
  });
  it('揚陸の間のスロー（3 隻とも海域の外）: 戻りの時刻は同じ（固定ステップの時計）', () => {
    const p = plan();
    const none = run(p).log;
    const slow = run(p, { slow: [[118, 118 + SLOW_S]] }).log;
    expect([slow.arrive, slow.ret]).toEqual([none.arrive, none.ret]);
  });
  it('海域の内と外に分かれている時のスロー: 着いていた先頭の戻りは同じ、往路の 2・3 隻目はスローの分だけ遅れて着き遅れて戻る（復路の間隔は縮まない）', () => {
    const p = plan();
    const none = run(p).log;
    const slow = run(p, { slow: [[100, 100 + SLOW_S]] }).log; // 先頭は 95.8 秒に着いた・2 隻目は 103.8・3 隻目は 111.8 秒に着く
    expect(slow.ret[0]).toBe(none.ret[0]);
    for (const i of [1, 2]) near(slow.ret[i], none.ret[i]! + LOST_S, 2);
    expect(slow.ret[1]! - slow.ret[0]!).toBeGreaterThanOrEqual(none.ret[1]! - none.ret[0]! - STEP);
  });
  it('一晩にスロー 6 回（沈む艦 5・自艇 1 の上限）でも、ハードの最後の艦は夜明けの前に去る（遅れはスローの分だけ）', () => {
    const p = plan(true);
    const wins = [30, 60, 90, 125, 160, 200].map((t) => [t, t + SLOW_S] as const);
    const none = run(p).log;
    const slow = run(p, { slow: wins }).log;
    const lag = slow.gone[3]! - none.gone[3]!;
    expect(lag).toBeGreaterThan(0);
    expect(lag).toBeLessThanOrEqual(6 * LOST_S + 2 * STEP);
    expect(slow.gone[3]!).toBeLessThan(DURATION);
  });
});

describe('source（step と読み出しは確保しない・乱数なし）', () => {
  it('作る関数（createShipTransit）のほかは本体に確保の形が無い。import は core/transit-data だけ', () => {
    const f = 'src/core/ship-transit.ts';
    const { names, bad } = scanAllocations(f, ['createShipTransit']);
    expect(names).toEqual(['createShipTransit', 'stepShipTransit', 'transitAppearLeg', 'transitCount', 'transitEnterAtS', 'transitOnMap', 'transitPending']);
    expect(bad).toEqual([]);
    expect(imports(code(f))).toEqual(['./transit-data']);
    expect(code(f)).not.toMatch(/Math\.random|SeededRng|\brng\b/);
  });
});
