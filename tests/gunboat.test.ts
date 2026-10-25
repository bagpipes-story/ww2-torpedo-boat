// 隼艇の AI（core/gunboat。v0.6.6「日本ハードモード⑤：隼艇」。spec-v066 §C.3・§G）: 値は data を読まない固定の fixture（v0.6.5 の tests/engine-trouble-kit の作法。
// data の値の pin は tests/gunboat-data）。米PT の隊は stepGunboat が読む欄（boats の x・y・phase と owner）だけの写し。
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boatParamsFromData, type BoatState } from '../src/core/boat-motion';
import { CV_ARRIVED, CV_SUNK, createConvoy, type ConvoyParams, type ConvoyState } from '../src/core/convoy';
import type { GunBatteryParams } from '../src/core/gun-battery';
import { createGunboat, createGunboatTelemetry, gunboatHeld, hitGunboat, stepGunboat, writeGunboatTelemetry, type GunboatCtx, type GunboatParams, type GunboatState } from '../src/core/gunboat';
import type { ReturnPoint } from '../src/core/mission-flow';
import { PT_BREAK, PT_CHASE, PT_LEAVE, PT_PASS, PT_RUN_IN, PT_SUNK, type PtSection } from '../src/core/pt-boats';
import { SeededRng } from '../src/core/rng';
import { bearingDeg } from '../src/core/ship-ai';
import { ktToMps, wrapDeg180 } from '../src/core/units';

/** 1 固定ステップの game 秒（1/60 秒 × time_scale 5。世界と同じ刻み） */
const DT = (1 / 60) * 5;
const BOAT = boatParamsFromData({ speed_max_kt: 27, speed_cruise_kt: 20, speed_silent_kt: 7, speed_bands_kt: { stop_max: 0.5, silent_max: 13, cruise_max: 20, hysteresis: 1 }, accel_mps2: 1.0, decel_mps2: 1.4, turn_rate_deg_s: 26, length_m: 18, beam_m: 4.3 });
const GUN: GunBatteryParams = {
  label: '25mm', groups: [{ id: 'g', roundsPerMin: 220, damage: 4, shellSpeedMps: 500, dispersionM: 56, splashRadiusM: 3 }], rangeM: 600, effectiveM: 300, deadConeDeg: 30, deadConeCos2: 0.75, flashRevealM: 1200,
  spreadFactor: { stop: 1, silent: 1, cruise: 1.6, full: 2.5 }, magazine: { rounds: 15, reloadS: 3.2 },
};
const P: GunboatParams = {
  boatId: 'test_h38', labelJa: '隼艇', boat: BOAT, hullHp: 60, gun: GUN, halfLengthM: 9, halfBeamM: 2.15, boundsMarginM: 18,
  stationAsternM: 150, stationAbeamM: 120, stationSlowM: 60, headingDeadbandM: 5, rejoinM: 450, fireM: 300, engageMps: ktToMps(10.5), beachStandoffM: 60, beachArriveM: 30, targetRangeFactor: 0.5,
};
const CP: ConvoyParams = {
  count: 3, hp: 12, halfLengthM: 7.5, halfBeamM: 1.7, boundsMarginM: 15, speedMps: ktToMps(7), turnRateDegS: 10, accelMps2: 0.5, leadX: 1200, leadY: 2550, headingDeg: 90, offsetsM: [0, 120, 240], landingX: 3600, quota: 3,
  beach: { x: [3660, 3600, 3540], y: 2988, shoreY: 3000, turnX: [3099, 3039, 2979], runInM: 711 },
};
const RING: ReturnPoint = { x: 4150, y: 2700, radiusM: 250, callMargin: 1.6, torpedoSettleMaxS: 10, torpedoEndSettleS: 5 };
const VIS2 = 900 * 900;

type FakePt = { x: number; y: number; phase: number; headingDeg: number; speedMps: number };
const pt = (x: number, y: number, phase: number = PT_RUN_IN): FakePt => ({ x, y, phase, headingDeg: 270, speedMps: 0 });

interface World { player: BoatState; f: ConvoyState; q: PtSection & { boats: FakePt[] }; c: GunboatCtx; g: GunboatState }
/** 自艇は (1200, 2400) 東向き（jp_01 の出発）。隼艇は定位置 (1050, 2520) に停止 */
function world(pts: FakePt[] = [], owner = -1, start = { x: 1200, y: 2400, headingDeg: 90 }): World {
  const player: BoatState = { ...start, speedMps: 0 };
  const f = createConvoy(CP);
  const q = { boats: pts, owner } as unknown as PtSection & { boats: FakePt[] };
  const c: GunboatCtx = { player, convoy: f, convoyParams: CP, pts: q, ring: RING, bounds: { width: 6000, height: 3000 }, visRange2: VIS2 };
  return { player, f, q, c, g: createGunboat(P, start) };
}
const place = (g: GunboatState, x: number, y: number, headingDeg = 90): void => {
  g.boat.x = x;
  g.boat.y = y;
  g.boat.headingDeg = headingDeg;
};
const wantMps = (g: GunboatState): number => g.input.speed01 * P.boat.speedMaxMps;

afterEach(() => vi.restoreAllMocks());

describe('定位置（自艇の針路で後ろ 150 m・右舷 120 m）と出発', () => {
  it('東向き (1200, 2400) → (1050, 2520)（岸の側）、西向き → (1350, 2280)、北向き → (1320, 2550)。出発は定位置に停止・HP 満タン・的になる', () => {
    const at = (x: number, y: number, h: number): [number, number] => {
      const g = createGunboat(P, { x, y, headingDeg: h });
      return [g.boat.x, g.boat.y];
    };
    const close = (a: [number, number], b: [number, number]): void => {
      expect(a[0]).toBeCloseTo(b[0], 9);
      expect(a[1]).toBeCloseTo(b[1], 9);
    };
    close(at(1200, 2400, 90), [1050, 2520]);
    close(at(1200, 2400, 270), [1350, 2280]);
    close(at(1200, 2400, 0), [1320, 2550]);
    const g = createGunboat(P, { x: 1200, y: 2400, headingDeg: 90 });
    expect([g.boat.speedMps, g.boat.headingDeg, g.hp, g.valid, g.sunk, g.resolved, g.held, g.threat, g.band]).toEqual([0, 90, 60, true, false, false, false, -1, 'stop']);
    // 決着の前の判断で毎ステップ自艇の今の位置・針路から取り直す
    const w = world();
    w.player.x = 2000;
    w.player.headingDeg = 0;
    stepGunboat(w.g, P, w.c, 0, false, DT);
    expect(w.g.stationX).toBeCloseTo(2120, 9);
    expect(w.g.stationY).toBeCloseTo(2550, 9);
  });
});

describe('脅威・守りの砲・速さ（決着の前）', () => {
  it('脅威は自艇の視程（900 m）の内の、まだ戦う PT の最寄り（去る・沈んだ PT と視程の外は数えない）', () => {
    const w = world([pt(1550, 2520), pt(1250, 2520, PT_LEAVE), pt(2000, 2520), pt(1450, 2520, PT_SUNK), pt(1700, 2520, PT_BREAK)]);
    stepGunboat(w.g, P, w.c, 0, false, DT);
    expect(w.g.threat).toBe(0); // 500 m（200 m は去る・400 m は沈んだ・950 m は視程の外）
    const far = world([pt(2000, 2520)]);
    stepGunboat(far.g, P, far.c, 0, false, DT);
    expect(far.g.threat).toBe(-1);
  });
  it('撃つ規則（gunboatHeld）: 脅威が fire_m 以内で、隊が攻撃中で標的が大発か隼艇、またはその PT が追撃中。自艇だけが狙われている航過・攻撃なしでは撃たない', () => {
    const q = (owner: number, phase: number): PtSection => ({ boats: [pt(0, 0, phase)], owner }) as unknown as PtSection;
    const in2 = 299 * 299;
    expect(gunboatHeld(q(0, PT_PASS), 0, in2, 300, 1)).toBe(true); // 大発への航過
    expect(gunboatHeld(q(0, PT_PASS), 0, in2, 300, 4)).toBe(true); // 隼艇（船体 nb+1）への航過
    expect(gunboatHeld(q(0, PT_PASS), 0, in2, 300, 0)).toBe(false); // 自艇だけが狙われている
    expect(gunboatHeld(q(-1, PT_RUN_IN), 0, in2, 300, 1)).toBe(false); // 攻撃なし（標的が大発でも）
    expect(gunboatHeld(q(-1, PT_CHASE), 0, in2, 300, 0)).toBe(true); // 追撃の PT（自艇を追っていても）
    expect(gunboatHeld(q(0, PT_PASS), 0, 300 * 300, 300, 1)).toBe(true); // 境は含む
    expect(gunboatHeld(q(0, PT_PASS), 0, 301 * 301, 300, 1)).toBe(false); // 射程の外
    expect(gunboatHeld(q(-1, PT_CHASE), -1, 0, 300, 1)).toBe(false); // 脅威なし
  });
  it('脅威が 300 m 以内: 舷側（±90° の近い方）を向けて 10.5 kt。撃つのは規則のときだけ（自艇への航過では向けるが撃たない）', () => {
    const w = world([pt(1050, 2320, PT_PASS)], 0); // 隼艇の北 200 m
    stepGunboat(w.g, P, w.c, 1, false, DT);
    expect(w.g.held).toBe(true);
    expect(wantMps(w.g)).toBeCloseTo(ktToMps(10.5), 9);
    expect(Math.abs(Math.abs(wrapDeg180(w.g.input.headingDeg - bearingDeg(1050, 2520, 1050, 2320))) - 90)).toBeLessThan(1e-9);
    expect(w.g.input.headingDeg).toBeCloseTo(90, 9); // 東向きの艇は 90°（270° より近い）
    const v = world([pt(1050, 2320, PT_PASS)], 0);
    stepGunboat(v.g, P, v.c, 0, false, DT);
    expect([v.g.held, v.g.threat]).toEqual([false, 0]);
    expect(wantMps(v.g)).toBeCloseTo(ktToMps(10.5), 9);
  });
  it('脅威が 300〜900 m: 定位置へ静音の上限 13 kt（撃たない）', () => {
    const w = world([pt(1050, 1920)], 0);
    place(w.g, 1150, 2520);
    stepGunboat(w.g, P, w.c, 1, false, DT);
    expect([w.g.threat, w.g.held]).toEqual([0, false]);
    expect(wantMps(w.g)).toBeCloseTo(P.boat.silentMaxMps, 9);
    expect(w.g.input.headingDeg).toBeCloseTo(270, 9);
  });
  it('脅威なし: 定位置まで 60 m より遠ければ 13 kt、60 m の内は大発の 7 kt で定位置へ、5 m の内は輸送隊の針路', () => {
    const w = world();
    place(w.g, 1150, 2520); // 100 m
    stepGunboat(w.g, P, w.c, 0, false, DT);
    expect(wantMps(w.g)).toBeCloseTo(P.boat.silentMaxMps, 9);
    place(w.g, 1080, 2520, 0); // 30 m
    stepGunboat(w.g, P, w.c, 0, false, DT);
    expect(wantMps(w.g)).toBeCloseTo(CP.speedMps, 9);
    expect(w.g.input.headingDeg).toBeCloseTo(270, 9);
    place(w.g, 1053, 2520, 0); // 3 m
    stepGunboat(w.g, P, w.c, 0, false, DT);
    expect(wantMps(w.g)).toBeCloseTo(CP.speedMps, 9);
    expect(w.g.input.headingDeg).toBe(CP.headingDeg);
  });
  it('戻り（rejoin_m 450）: 撃っていない間に最寄りの航行中の大発から 450 m より遠ければ定位置へ 13 kt（舷側の判断を上書き）。撃っている間は戻らない', () => {
    const w = world([pt(400, 2320, PT_PASS)], 0); // 隼艇 (400, 2520) から北 200 m・大発 (960, 2550) から 560 m
    place(w.g, 400, 2520);
    stepGunboat(w.g, P, w.c, 0, false, DT); // 自艇への航過＝撃たない → 戻る
    expect(w.g.held).toBe(false);
    expect(wantMps(w.g)).toBeCloseTo(P.boat.silentMaxMps, 9);
    expect(w.g.input.headingDeg).toBeCloseTo(bearingDeg(400, 2520, 1050, 2520), 9);
    place(w.g, 400, 2520);
    stepGunboat(w.g, P, w.c, 2, false, DT); // 大発への航過＝撃つ → 戻らず舷側
    expect(w.g.held).toBe(true);
    expect(wantMps(w.g)).toBeCloseTo(ktToMps(10.5), 9);
    // 沈んだ・上陸した大発は数えない（航行中の最寄り）: 30 m 先の大発が航行中なら戻らず舷側、沈んだ・上陸したなら 960 から 540 m で戻る
    const v = world([pt(1500, 2320, PT_PASS)], 0);
    v.f.barges[0]!.x = v.f.barges[1]!.x = 1500;
    place(v.g, 1500, 2520);
    stepGunboat(v.g, P, v.c, 0, false, DT);
    expect(wantMps(v.g)).toBeCloseTo(ktToMps(10.5), 9);
    v.f.barges[0]!.phase = CV_SUNK;
    v.f.barges[1]!.phase = CV_ARRIVED;
    place(v.g, 1500, 2520);
    stepGunboat(v.g, P, v.c, 0, false, DT);
    expect(wantMps(v.g)).toBeCloseTo(P.boat.silentMaxMps, 9);
    expect(v.g.input.headingDeg).toBeCloseTo(bearingDeg(1500, 2520, v.g.stationX, v.g.stationY), 9);
  });
  it('決着の前は静音の上限を超えない（自艇が全速 27.5 kt で東へ走り去っても）: 速力帯は静音か停止（見つかる距離 600 m）', () => {
    const w = world();
    let maxMps = 0;
    for (let i = 0; i < 60 * 40; i++) {
      w.player.x += ktToMps(27.5) * DT;
      stepGunboat(w.g, P, w.c, 0, false, DT);
      maxMps = Math.max(maxMps, w.g.boat.speedMps);
      expect(['stop', 'silent']).toContain(w.g.band);
    }
    expect(maxMps).toBeCloseTo(P.boat.silentMaxMps, 9);
  });
});

describe('決着の後・輪・沈没（的でなくなる・撃たない）', () => {
  it('上陸した大発があれば浜の点（先頭の上陸地点 3,660・浜の線 2,988 から 60 m 沖）へ巡航 20 kt、30 m の内で止まる。的でなく撃たない', () => {
    const w = world([pt(3300, 2400, PT_PASS)], 0);
    for (const b of w.f.barges) b.phase = CV_ARRIVED;
    w.f.arrived = 3;
    place(w.g, 3300, 2500);
    stepGunboat(w.g, P, w.c, 1, false, DT);
    expect([w.g.resolved, w.g.toBeach, w.g.atBeach, w.g.valid, w.g.held, w.g.threat]).toEqual([true, true, false, false, false, -1]);
    expect(wantMps(w.g)).toBeCloseTo(P.boat.speedCruiseMps, 9);
    expect(w.g.input.headingDeg).toBeCloseTo(bearingDeg(3300, 2500, 3660, 2928), 9);
    for (let i = 0; i < 60 * 60 && !(w.g.atBeach && w.g.boat.speedMps === 0); i++) {
      stepGunboat(w.g, P, w.c, 1, false, DT);
      expect([w.g.valid, w.g.held]).toEqual([false, false]);
    }
    expect([w.g.atBeach, w.g.boat.speedMps]).toEqual([true, 0]);
    expect(Math.hypot(w.g.boat.x - 3660, w.g.boat.y - 2928)).toBeLessThanOrEqual(P.beachArriveM);
    const x = w.g.boat.x;
    for (let i = 0; i < 600; i++) stepGunboat(w.g, P, w.c, 1, false, DT);
    expect(w.g.boat.x).toBe(x); // 止まったまま（ラッチ）
  });
  it('全滅（上陸 0）ならその場で止まる（空の浜へ行かない・ラベルは「隼艇」のまま＝toBeach false）', () => {
    const w = world();
    for (const b of w.f.barges) b.phase = CV_SUNK;
    w.f.sunk = 3;
    place(w.g, 2000, 2500);
    w.g.boat.speedMps = P.boat.silentMaxMps;
    stepGunboat(w.g, P, w.c, 0, false, DT);
    expect([w.g.resolved, w.g.toBeach, w.g.valid, w.g.held, w.g.input.speed01]).toEqual([true, false, false, false, 0]);
    expect(Number.isNaN(w.g.input.headingDeg)).toBe(true);
  });
  it('帰投の輪の中は的でない（輪を出れば的に戻る）。自艇が沈み始めたら止まり撃たない', () => {
    const w = world();
    place(w.g, RING.x, RING.y);
    stepGunboat(w.g, P, w.c, 0, false, DT);
    expect([w.g.home, w.g.valid]).toEqual([true, false]);
    place(w.g, RING.x, RING.y - 400);
    stepGunboat(w.g, P, w.c, 0, false, DT);
    expect([w.g.home, w.g.valid]).toEqual([false, true]);
    const s = world([pt(1050, 2320, PT_PASS)], 0);
    stepGunboat(s.g, P, s.c, 1, true, DT);
    expect([s.g.held, s.g.input.speed01, s.g.valid]).toEqual([false, 0, true]);
  });
  it('被弾は HP だけ（乱数を引かない）: 4 × 15 発で沈没（その 1 発だけ true）・止まる・的でなくなる。沈んだ後の弾は当たらない', () => {
    const spy = vi.spyOn(SeededRng.prototype, 'next');
    const w = world([pt(1050, 2320, PT_PASS)], 0);
    stepGunboat(w.g, P, w.c, 1, false, DT);
    const sunkBy: boolean[] = [];
    for (let i = 0; i < 16; i++) sunkBy.push(hitGunboat(w.g, 4, 100 + i));
    expect(sunkBy.indexOf(true)).toBe(14);
    expect(sunkBy.filter((b) => b).length).toBe(1);
    expect([w.g.hp, w.g.hitsTaken, w.g.sunk, w.g.sunkS, w.g.valid, w.g.held]).toEqual([0, 15, true, 114, false, false]);
    stepGunboat(w.g, P, w.c, 1, false, DT);
    expect([w.g.input.speed01, w.g.valid, w.g.held]).toEqual([0, false, false]);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('§7・乱数・atan2', () => {
  it('動きは乱数を引かない（脅威・撃つ・戻り・決着・浜の 2,400 ステップ）', () => {
    const spy = vi.spyOn(SeededRng.prototype, 'next');
    const w = world([pt(1500, 2300, PT_PASS), pt(3000, 2000, PT_CHASE)], 0);
    for (let i = 0; i < 2400; i++) {
      w.player.x += ktToMps(13) * DT;
      w.q.boats[0]!.x -= 5 * DT;
      if (i === 1600) {
        for (const b of w.f.barges) b.phase = CV_ARRIVED;
        w.f.arrived = 3;
      }
      stepGunboat(w.g, P, w.c, i % 3, false, DT);
    }
    expect(spy).not.toHaveBeenCalled();
  });
  it('atan2 は 1 ステップ 1 回まで（どの枝でも）', () => {
    const atan = vi.spyOn(Math, 'atan2');
    const cases: [World, number][] = [];
    cases.push([world([pt(1050, 2320, PT_PASS)], 0), 1]); // 舷側
    cases.push([world([pt(1050, 1920)], 0), 1]); // 定位置へ
    const r = world([pt(400, 2320, PT_PASS)], 0);
    place(r.g, 400, 2520);
    cases.push([r, 0]); // 戻り
    const n = world();
    place(n.g, 1053, 2520);
    cases.push([n, 0]); // 5 m の内（atan2 なし）
    const b = world();
    for (const x of b.f.barges) x.phase = CV_ARRIVED;
    b.f.arrived = 3;
    cases.push([b, 0]); // 浜へ
    for (const [w, target] of cases) {
      for (let i = 0; i < 30; i++) {
        atan.mockClear();
        stepGunboat(w.g, P, w.c, target, false, DT);
        expect(atan.mock.calls.length).toBeLessThanOrEqual(1);
      }
    }
  });
  it('step・被弾・テレメトリの本文に確保を書かない（new・[]・{}・=>）。平方根はテレメトリの 1 回だけ', () => {
    const src = readFileSync('src/core/gunboat.ts', 'utf8');
    const strip = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const step = strip(src.slice(src.indexOf('export function stepGunboat'), src.indexOf('/** HUD に渡す隼艇の状態')));
    const tele = strip(src.slice(src.indexOf('export function writeGunboatTelemetry')));
    for (const code of [step, tele]) {
      expect(code.length).toBeGreaterThan(100);
      expect(code).not.toMatch(/\bnew\s/);
      expect(code).not.toContain('[]');
      expect(code).not.toContain('{}');
      expect(code).not.toContain('=>');
    }
    expect(step).not.toMatch(/Math\.(sqrt|hypot)/);
    const sqrt = vi.spyOn(Math, 'sqrt');
    const w = world();
    w.g.boat.x += 300;
    const t = createGunboatTelemetry();
    expect(t.enabled).toBe(false);
    writeGunboatTelemetry(t, w.g, P, w.player);
    expect(sqrt.mock.calls.length).toBe(1);
    expect([t.enabled, t.hp, t.maxHp, t.sunk, t.resolved, t.toBeach, t.held]).toEqual([true, 60, 60, false, false, false, false]);
    expect(t.distM).toBeCloseTo(Math.hypot(150, 120), 9);
  });
});
