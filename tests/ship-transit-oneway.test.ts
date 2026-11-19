// v0.8.2 S0（spec-v0820 §4.2 D-C4・D-C5）: 列の通過の片道（core/ship-transit の outbound null・艦ごとの入りの秒 enterAtS・道のずれ laneDyM）と、
// 往復の列（us_04）がこの枝で 1 つも変わらない証（揺らぎなし・seed 1〜4・命中スローあり／なし・ノーマル／ハードの 20 夜の段階と艦の位置の列の sha256 が main 0176202 と同じ）。
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import {
  TRANSIT_GONE,
  TRANSIT_IN,
  TRANSIT_WAIT,
  createShipTransit,
  stepShipTransit,
  transitAppearLeg,
  transitCount,
  transitEnterAtS,
  transitLaneDyM,
  transitOnMap,
  transitPending,
  type TransitShipView,
} from '../src/core/ship-transit';
import type { TransitSetup } from '../src/config/transit-mission-data';
import { buildWorldSetup } from '../src/systems/world-setup';
import { kitStep, kitWorld } from './transit-world-kit';

const STEP = 1 / 60;
const us05 = (hard = false): TransitSetup => buildWorldSetup(gameData, 'us_05', { hard }).transit!;
/** 素の艦（x と沈み始めだけ）を plan の速さで道に沿って動かす（入った艦は現れる点へ・IN の艦は道の向きへ） */
function run(p: TransitSetup, untilS: number, o: { dawnS?: number; slow?: (t: number) => boolean; sinkAt?: [number, number] } = {}) {
  const st = createShipTransit(p);
  const ships: { state: { x: number }; sinking: boolean }[] = Array.from({ length: p.ships }, () => ({ state: { x: NaN }, sinking: false }));
  const v = p.speedMps * gameData.hitRateModel.world.time_scale;
  const log = { enter: [] as number[], gone: [] as number[], y: [] as number[], arrived: 0, returned: 0, cover: 0, pending: [] as [number, number][] };
  let t = 0;
  for (let k = 0; t < untilS; k++) {
    t = (k + 1) * STEP;
    const feel = o.slow?.(t) ? STEP * 0.3 : STEP;
    for (let i = 0; i < p.ships; i++) if (st.phase[i] === TRANSIT_IN) ships[i]!.state.x += v * feel;
    if (o.sinkAt && t >= o.sinkAt[1]) ships[o.sinkAt[0]]!.sinking = true;
    stepShipTransit(st, p, feel, t, o.dawnS !== undefined && t >= o.dawnS, ships as readonly TransitShipView[]);
    for (let i = 0; i < p.ships; i++) {
      const bit = 1 << i;
      if (st.entered & bit) {
        const leg = transitAppearLeg(p, st.phase[i]!)!;
        ships[i]!.state.x = leg.appearX;
        log.enter[i] = t;
        log.y[i] = leg.laneY + transitLaneDyM(p, i);
      }
      if (st.gone & bit) log.gone[i] = t;
    }
    if (st.arrived) log.arrived++;
    if (st.returned) log.returned++;
    if (st.coverLeaves) log.cover++;
    log.pending.push([t, transitPending(st)]);
  }
  return { st, log };
}

describe('片道の列（us_05 の第三部隊。揺らぎなし）', () => {
  it('plan: 復路なし（outbound null）・艦ごとの入りの秒の表と道のずれ・揚陸なし・護衛は退かない', () => {
    const p = us05();
    expect([p.ships, p.outbound, p.unloadS, p.spacingS, p.coverLeavesWithOutbound]).toEqual([7, null, 0, 0, false]);
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => transitEnterAtS(p, i))).toEqual([5, 20, 35, 50, 80, 85, 101]);
    expect([0, 1, 2, 3, 4, 5, 6].map((i) => transitLaneDyM(p, i))).toEqual([400, 400, 400, 400, -560, 0, 0]); // 時雨の道は v0.8.2 S3 の探りの帯 N1 で −600 → −560
    expect([TRANSIT_IN, TRANSIT_WAIT].map((ph) => transitAppearLeg(p, ph))).toEqual([p.inbound, null]);
    expect(transitAppearLeg(p, 3)).toBeNull(); // OUT（復路）は無い
    expect([p.inbound.appearX, p.inbound.goneX, p.inbound.laneY, p.inbound.headingDeg]).toEqual([150, 6650, 2400, 90]);
  });
  it('入りは表の秒（体感の時計）・道は艦ごと・向こうの縁の外で GONE（AWAY にならない＝揚陸の地も復路も無い）。去るのは入りの 140.4 秒後', () => {
    const { st, log } = run(us05(), 270);
    expect(log.enter.map((t) => Math.round(t * 60) / 60)).toEqual([5, 20, 35, 50, 80, 85, 101].map((t) => Math.round(t * 60) / 60));
    expect(log.y).toEqual([2800, 2800, 2800, 2800, 1840, 2400, 2400]);
    const cross = 6500 / (us05().speedMps * gameData.hitRateModel.world.time_scale); // 140.40 秒
    log.gone.forEach((g, i) => expect(Math.abs(g - log.enter[i]! - cross), String(i)).toBeLessThanOrEqual(2 * STEP));
    expect([log.arrived, log.returned, log.cover, st.arrivedCount, st.outCount, st.goneCount, st.inCount]).toEqual([0, 0, 0, 0, 0, 7, 7]);
    expect([transitCount(st, TRANSIT_GONE), transitPending(st)]).toEqual([7, 0]);
    expect(Math.max(...log.gone)).toBeLessThan(270 - 20); // V-C5（241.4 秒）
  });
  it('戻りの残り（transitPending）は WAIT の艦だけ: 入るたびに 1 減り、最後の艦が入った後は 0（去っても増えない）', () => {
    const { log } = run(us05(), 270);
    const at = (s: number): number => log.pending.find(([t]) => t >= s)![1];
    expect([at(1), at(5.5), at(20.5), at(50.5), at(80.5), at(85.5), at(100.9), at(101.1), at(250)]).toEqual([7, 6, 5, 3, 2, 1, 1, 0, 0]);
  });
  it('命中スローの間は入りが体感の時計で遅れる（列の間隔 m は縮まない）。沈み始めた艦は SUNK（戻らない）', () => {
    const plain = run(us05(), 270).log;
    const slow = run(us05(), 270, { slow: (t) => t > 10 && t < 13 }).log;
    expect(slow.enter[0]! - plain.enter[0]!).toBeCloseTo(0, 6);
    expect(slow.enter[1]! - plain.enter[1]!).toBeCloseTo(3 * 0.7, 1); // 3 秒のスロー（0.3 倍）で 2.1 秒遅れる
    const sunk = run(us05(), 270, { sinkAt: [5, 120] }).st;
    expect([sunk.sunkCount, sunk.goneCount, transitOnMap(sunk, 5)]).toEqual([1, 6, false]);
  });
  it('夜明け: まだ来ない艦は入らず、海域の艦は向こうの縁の外へ去る（戻りの残りは 0）', () => {
    const { st, log } = run(us05(), 270, { dawnS: 60 });
    expect([st.inCount, transitCount(st, TRANSIT_WAIT), transitPending(st), st.goneCount]).toEqual([4, 3, 0, 4]);
    expect(log.enter.length).toBe(4);
  });
  it('ハード: 8 隻目（見張りの駆逐艦）は 109 秒・北の道（y 1,825。v0.8.2 S3 の帯 H1 で −600 → −575）', () => {
    const p = us05(true);
    expect([p.ships, transitEnterAtS(p, 7), p.inbound.laneY + transitLaneDyM(p, 7)]).toEqual([8, 109, 1825]);
    expect(run(p, 270).st.goneCount).toBe(8);
  });
});

describe('往復の列（us_04）はこの版の枝で 1 つも変わらない（spec-v0820 §8 S0・lead の L4）', () => {
  it('plan に片道の鍵（enterAtS・laneDyM・rejoinS・column）は無く、表の読みは今の式（enterS ＋ 間隔 × i・ずれ 0）', () => {
    for (const hard of [false, true]) {
      const t = buildWorldSetup(gameData, 'us_04', { hard }).transit!;
      for (const k of ['enterAtS', 'laneDyM', 'rejoinS', 'column']) expect(k in t, k).toBe(false);
      expect(t.outbound).not.toBeNull();
      for (let i = 0; i < t.ships; i++) expect([transitEnterAtS(t, i), transitLaneDyM(t, i)]).toEqual([18 + 8 * i, 0]);
    }
  });
  it('段階と艦の位置の列（tests/transit-world-kit の小さな世界・262 秒）の sha256 は main 0176202 の木と同じ（基準の木で同じ式を回した値）', () => {
    const trace = (hard: boolean, seed: number | undefined, slowEvery: number): string => {
      const w = kitWorld({ hard, seed, radar: false, detect: true });
      const h = createHash('sha256');
      for (let k = 0; k < 262 * 60; k++) {
        kitStep(w, slowEvery > 0 && k % slowEvery < 30);
        const st = w.transit.state;
        h.update(`${k}|${Array.from(st.phase.slice(0, st.ships)).join('')}|${st.entered},${st.arrived},${st.returned},${st.gone},${st.sunk},${st.coverLeaves ? 1 : 0}|`);
        for (const s of w.ships) h.update(`${s.state.x},${s.state.y},${s.state.headingDeg},${s.state.speedMps},${s.out ? 1 : 0};`);
      }
      return h.digest('hex');
    };
    const BASE: Record<string, string> = {
      'normal - 0': '5b53d892eaf601218ed689e229cd0afe4e6903ad5510f78ceb95c63abf0acecb', 'normal - 900': '6fbb03d6f136e78ab293bdc8b4384a41d2540df58d35f7f8f5f67f7594e22b5b',
      'normal 1 0': '55028bb97af3850f09cc4a0a8929dcd02641f2642cc3c4d54d024ad30d6f0671', 'normal 1 900': '89ad018e243bf97dd356aec25c7adbfd42d02db80aaab1c5945e72c0f9258fde',
      'normal 2 0': '71160756929aefbf13866ac86cbfe5b2e98bb42fdb8b4f004b096e3d27e134b0', 'normal 2 900': 'edadae4387e035d221a3e67fecdd813797ca7a1641bacb6d3c73e0fa9f45bc1a',
      'normal 3 0': '8535e72f8903c5ab8a6c9de684d749b552ae93fbf58c91ff03e90b60c5fa0f84', 'normal 3 900': '34796171632320a54679d144dfed391aad63db9c3d733d283a3428206401c392',
      'normal 4 0': '99c0918aa03339888e06403f80f225fad6f1d8e210119496d03a13c5141f620b', 'normal 4 900': '2a2f9644fe84ab0d40062d021c2d21bfd5bff6a9c357babbee1b465d6f3ffdab',
      'hard - 0': 'e1315430eecae3fb5ff78505e7ce0d99d52e78d9d566922591dfa3555f60934e', 'hard - 900': '95a6666e8e14ceed059201a7d56ac073bed9b659a1695ac4d9bdbec2622af335',
      'hard 1 0': '5433f521c0d41d37435848d0108d81e5b8d42135bfb2be3a044d7a7e5f218ba0', 'hard 1 900': '6b2c90cdb6ea900c67903e2648a1018488f5e79d18ac32ea263cd5396b04fe51',
      'hard 2 0': '56ff1bd72c9a38468b91a6f67512c33ba4dbd5dc15a2afcf968d4bb5076375f7', 'hard 2 900': '04cdbd71c4dcd7589129b0e44b37dd46eb9bc24bdf88f4485922f9361e87034d',
      'hard 3 0': '91823781de231221b2474c54d68ef3b0a4772053ef3b0233d4e493bf2847d3a4', 'hard 3 900': '26a7454e4f0652fa439fa3f7b6b6653b8205f79fd3fb3442e5a0213773b72d7b',
      'hard 4 0': '7dbf1be5c2db08b4456be70f4275ebb8236e226dbf1ecd93dc8c08e7b6def8ee', 'hard 4 900': 'ddf72a6d40f31d828999da62c53fb1063590f2a1810b9c0367f7636616450efa',
    };
    for (const hard of [false, true]) for (const seed of [undefined, 1, 2, 3, 4]) for (const slow of [0, 900]) {
      const key = `${hard ? 'hard' : 'normal'} ${seed ?? '-'} ${slow}`;
      expect(trace(hard, seed, slow), key).toBe(BASE[key]);
    }
  });
});
