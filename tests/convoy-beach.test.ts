// 味方の大発の輸送隊の浜（v0.6.4 実機 1 回目「大発が浜に上陸っていうけど何もない海の真ん中で消えていくので意味不明です」。core/convoy の beach・core/convoy-data の convoyBeachFromData）:
// 航路を東へ進み、転舵の x から自分の上陸地点へ向かい、浜の線に着いたら上陸して止まる。浜までの道のり（HUD の「浜まで N m」の元）、data の検査、反転、乱数を引かない・確保なし。
// tests/convoy.test.ts（浜の無い隊＝v0.6.4 の上陸線。300 行に近いので浜はこのファイル）と同じく block は data と独立な固定値（spec-r1 §2.1 の写し。data の値の pin は tests/jp01-mission）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { isBargeDataRecord, type BargeDataRecord } from '../src/core/barge-data';
import { CV_ARRIVED, CV_SAILING, convoyLeftM, convoyResolved, createConvoy, hitConvoyBarge, stepConvoy, type ConvoyEvents, type ConvoyParams, type ConvoyState } from '../src/core/convoy';
import { CONVOY_RING_CLEAR_M, convoyParamsAtNight, convoyParamsFromData, type ConvoyMissionBlock, type ConvoyMissionContext } from '../src/core/convoy-data';
import { CountingRng } from './pt-kit';

const DT = 1 / 60;
const TS = gameData.hitRateModel.world.time_scale;
const W = { hitScale: gameData.hitRateModel.world.hit_scale, spriteScale: gameData.hitRateModel.world.sprite_scale };
const B = { width: 6000, height: 3000 };
/** jp_01 の convoy の block（v0.6.4 実機 1 回目: 上陸地点の中心 3600・HP 12・静音の帯・浜 60 m おき・12 m・38°） */
const BLOCK: ConvoyMissionBlock = {
  lead_start: { x_m: 1200, y_m: 2550, heading_deg: 90 }, offsets_m: [0, 120, 240], landing_x_m: 3600, arrive_quota: 2, barge_hp: 12,
  detect_band: 'silent', target_keep_ratio: 0.8, target_switch_hold_s: 1.0, flash_hold_s: 1.0, beach: { spacing_m: 60, margin_m: 12, run_in_deg: 38 }, source: 'design (tests/convoy-beach。spec-r1 §2.1 の写し)',
};
/** jp_01 の周り: 揺らぎ ±250・帰投の輪 (4150, 2700) r 250 */
const CTX: ConvoyMissionContext = { missionId: 'jp_01', leadJitterM: 250, ring: { x: 4150, y: 2700, radiusM: 250 } };
const recRaw = gameData.enemies.enemies.find((e) => e.id === 'daihatsu_barge');
if (!isBargeDataRecord(recRaw)) throw new Error('enemies.json の daihatsu_barge が大発の record でない');
const REC: BargeDataRecord = recRaw;
const P = convoyParamsFromData(REC, BLOCK, 3, W, B, CTX);
const BEACH = P.beach!;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const quiet: ConvoyEvents = { onArrived: () => {}, onSunk: () => {} };
const bad = (over: Partial<ConvoyMissionBlock>, beach: Partial<NonNullable<ConvoyMissionBlock['beach']>> = {}, ctx: ConvoyMissionContext = CTX): (() => void) => () =>
  convoyParamsFromData(REC, { ...clone(BLOCK), ...over, beach: { ...clone(BLOCK.beach!), ...beach } }, 3, W, B, ctx);

/** 邪魔をせずに 200 秒回し、隻ごとに転舵（leg 0 → 1）と上陸の実秒を返す */
function sail(p: ConvoyParams): { f: ConvoyState; turnS: number[]; arriveS: number[] } {
  const f = createConvoy(p);
  const turnS = [NaN, NaN, NaN];
  const arriveS = [NaN, NaN, NaN];
  let k = 0;
  const ev: ConvoyEvents = { onArrived: (i) => void (arriveS[i] = k * DT), onSunk: () => {} };
  for (k = 1; k <= 200 * 60; k++) {
    stepConvoy(f, p, DT * TS, ev);
    for (let i = 0; i < 3; i++) if (f.barges[i]!.leg === 1 && Number.isNaN(turnS[i]!)) turnS[i] = k * DT;
  }
  return { f, turnS, arriveS };
}

describe('浜（beach。v0.6.4 実機 1 回目）: 上陸地点・転舵・浜への道', () => {
  it('上陸地点は 3600 を中心に 60 m おき（先頭が東: 3660／3600／3540）、浜の線は y 2,988（南の縁から 12 m）、転舵は 3099.39／3039.39／2979.39、浜への道 711.43 m（航路から 438 m を 38°）', () => {
    expect([BEACH.x, BEACH.y, BEACH.shoreY]).toEqual([[3660, 3600, 3540], 2988, 3000]);
    [3099.39, 3039.39, 2979.39].forEach((x, i) => expect(BEACH.turnX[i]).toBeCloseTo(x, 2));
    expect(BEACH.runInM).toBeCloseTo(438 / Math.sin((38 * Math.PI) / 180), 9);
    expect(BEACH.runInM).toBeCloseTo(711.43, 2);
    expect([P.landingX, P.hp]).toEqual([3600, 12]);
    // 浜の無い block は鍵ごと無い（v0.6.4 の上陸線のまま）
    const { beach: _b, ...noBeach } = clone(BLOCK);
    expect('beach' in convoyParamsFromData(REC, { ...noBeach, landing_x_m: 4000 }, 3, W, B, { ...CTX, ring: { x: 4500, y: 2250, radiusM: 250 } })).toBe(false);
  });
  it('邪魔をしなければ 3 隻とも上陸地点から 1 m 以内に上陸（針路 ≈128.4°・止まる・arrived 3）。転舵 105.5／108.8／112.2 秒、上陸 145.1／148.4／151.8 秒。leg は転舵の x で 0 → 1', () => {
    const { f, turnS, arriveS } = sail(P);
    [105.5, 108.8, 112.2].forEach((t, i) => expect(Math.abs(turnS[i]! - t), `転舵 ${i}`).toBeLessThanOrEqual(0.2));
    [145.1, 148.4, 151.8].forEach((t, i) => expect(Math.abs(arriveS[i]! - t), `上陸 ${i}`).toBeLessThanOrEqual(0.2));
    expect([f.arrived, f.sunk, convoyResolved(f)]).toEqual([3, 0, true]);
    for (let i = 0; i < 3; i++) {
      const b = f.barges[i]!;
      expect([b.phase, b.leg, b.speedMps], `${i}`).toEqual([CV_ARRIVED, 1, 0]);
      expect(Math.hypot(b.x - BEACH.x[i]!, b.y - BEACH.y), `${i}`).toBeLessThan(1);
      expect(b.y).toBeGreaterThanOrEqual(BEACH.y);
      expect(b.headingDeg).toBeCloseTo(128.4, 0);
    }
    // 転舵の直前は航路の上（leg 0・y 2550）、直後に leg 1
    const g = createConvoy(P);
    while (g.barges[0]!.x < BEACH.turnX[0]! - 1) stepConvoy(g, P, DT * TS, quiet);
    expect([g.barges[0]!.leg, g.barges[0]!.y]).toEqual([0, 2550]);
    for (let k = 0; k < 20; k++) stepConvoy(g, P, DT * TS, quiet);
    expect(g.barges[0]!.leg).toBe(1);
  });
  it('convoyLeftM: 出撃時は最後尾 960 → 転舵 2979.39 → 浜 711.43 で 2,730.8（HUD の「浜まで 2800 m」）。浜へ向かっている大発は上陸地点までの直線、最後尾が沈めば次の大発から。みな決着で 0', () => {
    const f = createConvoy(P);
    expect(convoyLeftM(f, P)).toBeCloseTo(BEACH.turnX[2]! - 960 + BEACH.runInM, 9);
    expect(convoyLeftM(f, P)).toBeCloseTo(2730.8, 1);
    for (let k = 0; k < 3; k++) hitConvoyBarge(f, 2, 4, 10 + k, quiet); // 最後尾が沈む（HP 12 で 3 発）
    expect(convoyLeftM(f, P)).toBeCloseTo(BEACH.turnX[1]! - 1080 + BEACH.runInM, 9);
    const b1 = f.barges[1]!;
    while (b1.leg === 0) stepConvoy(f, P, DT * TS, quiet);
    expect(convoyLeftM(f, P)).toBeCloseTo(Math.hypot(BEACH.x[1]! - b1.x, BEACH.y - b1.y), 9);
    while (!convoyResolved(f)) stepConvoy(f, P, DT * TS, quiet);
    expect(convoyLeftM(f, P)).toBe(0);
  });
  it('今夜の揺らぎ: 先頭のずれでは浜は動かない（同じ参照）。反転（6000 − x）では上陸地点と転舵も反転し、西向きで反転した上陸地点に上陸する', () => {
    expect(convoyParamsAtNight(P, 200, false, 6000).beach).toBe(BEACH);
    const m = convoyParamsAtNight(P, 0, true, 6000);
    expect(m.headingDeg).toBe(270);
    expect(m.beach!.x).toEqual(BEACH.x.map((x) => 6000 - x));
    expect(m.beach!.turnX).toEqual(BEACH.turnX.map((x) => 6000 - x));
    expect([m.beach!.y, m.beach!.shoreY, m.beach!.runInM]).toEqual([BEACH.y, BEACH.shoreY, BEACH.runInM]);
    const { f, arriveS } = sail(m);
    [145.1, 148.4, 151.8].forEach((t, i) => expect(Math.abs(arriveS[i]! - t), `上陸 ${i}`).toBeLessThanOrEqual(0.2));
    for (let i = 0; i < 3; i++) expect(Math.hypot(f.barges[i]!.x - m.beach!.x[i]!, f.barges[i]!.y - m.beach!.y), `${i}`).toBeLessThan(1);
    expect(convoyLeftM(createConvoy(m), m)).toBeCloseTo(2730.8, 1);
  });
});

describe('浜の data の検査（壊れた data は jp_01 の id 付きで例外＝Boot で止まる）', () => {
  const ID = /^jp_01\.v0_1_prototype\.convoy: /;
  it('spacing_m −1・margin_m 0・run_in_deg 0／91 は例外。90（真南へ）は通る', () => {
    expect(bad({}, { spacing_m: -1 })).toThrow(/spacing_m/);
    expect(bad({}, { margin_m: 0 })).toThrow(/margin_m/);
    for (const a of [0, 91]) expect(bad({}, { run_in_deg: a })).toThrow(/run_in_deg/);
    expect(bad({}, { run_in_deg: 90 }, { ...CTX, ring: { x: 5500, y: 1000, radiusM: 250 } })).not.toThrow();
    expect(bad({}, { spacing_m: -1 })).toThrow(ID);
  });
  it('浜の線が航路＋絵の半長より沖・上陸地点が海域の外・転舵が出発（揺らぎ込み）より手前は例外', () => {
    expect(bad({}, { margin_m: 3000 - 2550 - 14 })).toThrow(/浜の線/); // y 2,564 ≤ 航路 2,550 + 14.9
    expect(bad({ landing_x_m: 5980 }, {}, { ...CTX, ring: { x: 6000, y: 1000, radiusM: 250 } })).toThrow(/上陸地点は海域の中/); // 先頭の上陸地点 6,040
    expect(bad({ landing_x_m: 1700 })).toThrow(/転舵の x/); // 先頭の転舵 1,199.4 ≤ 出発 1,200 + 250
  });
  it(`各隻の航路と浜への道から帰投の輪の縁まで ${CONVOY_RING_CLEAR_M} m 以上: (3900, 2750) は先頭の浜への道から 338 m（縁まで 88 m）で落ちる。jp_01 の (4150, 2700) は先頭の上陸地点から縁まで 318 m`, () => {
    expect(bad({}, {}, { ...CTX, ring: { x: 3900, y: 2750, radiusM: 250 } })).toThrow(/輪の縁まで 300 m 以上/);
    expect(bad({}, {}, { ...CTX, ring: { x: 3900, y: 2750, radiusM: 250 } })).toThrow(ID);
    expect(bad({})).not.toThrow();
    expect(Math.hypot(4150 - 3660, 2700 - 2988) - 250).toBeCloseTo(318.4, 1);
  });
});

describe('浜の経路も乱数を引かない・確保なし（CLAUDE.md §7）', () => {
  const stripComments = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const noAlloc = (src: string): boolean[] => [src.includes('new '), src.includes('[]'), src.includes('{}'), src.includes('=>')];
  it('出撃から上陸まで回しても CountingRng は 0 回。stepConvoyBeach・convoyBeachLeftM に new・[]・{}・=> が無い', () => {
    const rng = new CountingRng(16);
    const { f } = sail(P);
    expect([f.arrived, rng.draws]).toEqual([3, 0]);
    expect(f.barges.every((b) => b.phase !== CV_SAILING)).toBe(true);
    const src = stripComments(readFileSync(join(__dirname, '..', 'src', 'core', 'convoy.ts'), 'utf8'));
    for (const name of ['stepConvoyBeach', 'convoyBeachLeftM']) {
      const body = new RegExp(`function ${name}[\\s\\S]*?\\n}`).exec(src)?.[0] ?? 'missing';
      expect(body, name).not.toBe('missing');
      expect(noAlloc(body), name).toEqual([false, false, false, false]);
    }
  });
});
