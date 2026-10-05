import { describe, expect, it } from 'vitest';
import enemies from '../data/enemies.json';
import { boatTouchesHull, createCircles, fillHullCircles, interceptHeadingDeg, pointHitsCircles, pointHitsHull, velocityFromHeading } from '../src/core/torpedo-solver';
import { createTorpedoState, launchTorpedo, stepTorpedo, type TorpedoParams } from '../src/core/torpedo';
import { stepStraight, type BoatState } from '../src/core/boat-motion';
import { ktToMps, ydToM } from '../src/core/units';

const raw = enemies.enemies.find((e) => e.id === 'ijn_destroyer') as Record<string, unknown> | undefined;
if (!raw) throw new Error('ijn_destroyer が無い');
const dd = { length_m: raw['length_m'] as number, beam_m: raw['beam_m'] as number, hull_circles: raw['hull_circles'] as number };

describe('fillHullCircles', () => {
  it('円は船体軸上に等間隔、半径は船幅の半分、両端は船首尾から半径分内側', () => {
    const c = createCircles(dd.hull_circles);
    fillHullCircles(c, 1000, 2000, 90, dd.length_m, dd.beam_m);
    expect(c).toHaveLength(dd.hull_circles);
    for (const k of c) {
      expect(k.r).toBeCloseTo(dd.beam_m / 2, 9);
      expect(k.y).toBeCloseTo(2000, 9); // 東向きなので y は一定
    }
    const xs = c.map((k) => k.x);
    expect(Math.min(...xs)).toBeCloseTo(1000 - dd.length_m / 2 + dd.beam_m / 2, 9);
    expect(Math.max(...xs)).toBeCloseTo(1000 + dd.length_m / 2 - dd.beam_m / 2, 9);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeCloseTo(xs[1]! - xs[0]!, 9);
  });
  it('北向きの船は x が一定', () => {
    const c = createCircles(3);
    fillHullCircles(c, 50, 60, 0, 100, 10);
    for (const k of c) expect(k.x).toBeCloseTo(50, 9);
    expect(c[0]!.y).toBeGreaterThan(c[2]!.y); // 先頭要素は船尾側（-span/2 → +y）
  });
});

describe('pointHitsCircles', () => {
  it('円の内側と外側', () => {
    const c = createCircles(5);
    fillHullCircles(c, 0, 0, 90, dd.length_m, dd.beam_m);
    expect(pointHitsCircles(0, 0, c)).toBe(true); // 中央
    expect(pointHitsCircles(dd.length_m / 2 - dd.beam_m / 2, 0, c)).toBe(true); // 船首側の円の中心
    expect(pointHitsCircles(0, dd.beam_m / 2 + 0.01, c)).toBe(false); // 舷側の外
    expect(pointHitsCircles(dd.length_m / 2 + 0.01, 0, c)).toBe(false); // 船首の先
    expect(pointHitsCircles(500, 500, c)).toBe(false);
  });
});

describe('pointHitsHull（カプセル: 円の間をすり抜けない）', () => {
  it('船体軸上はどこでも命中、舷側の外・船首尾の先は外れ', () => {
    const c = createCircles(5);
    fillHullCircles(c, 0, 0, 90, dd.length_m, dd.beam_m);
    const halfLen = dd.length_m / 2 - dd.beam_m / 2; // 端の円の中心まで
    for (let x = -halfLen; x <= halfLen; x += 7) expect(pointHitsHull(x, 0, c), `x=${x}`).toBe(true);
    // 円と円のちょうど中間（従来の円判定では外れる）
    const mid = (c[0]!.x + c[1]!.x) / 2;
    expect(pointHitsCircles(mid, 0, c)).toBe(false);
    expect(pointHitsHull(mid, 0, c)).toBe(true);
    expect(pointHitsHull(mid, dd.beam_m / 2 - 0.01, c)).toBe(true);
    expect(pointHitsHull(mid, dd.beam_m / 2 + 0.01, c)).toBe(false);
    expect(pointHitsHull(dd.length_m / 2 + 0.01, 0, c)).toBe(false);
    expect(pointHitsHull(0, 300, c)).toBe(false);
  });
  it('円が 1 個なら円判定と同じ', () => {
    const c = createCircles(1);
    fillHullCircles(c, 10, 10, 0, 30, 10);
    expect(pointHitsHull(10, 10, c)).toBe(true);
    expect(pointHitsHull(16, 10, c)).toBe(false);
    expect(pointHitsHull(10, 10, [])).toBe(false);
  });
});

describe('stepStraight / velocityFromHeading の符号（全方位）', () => {
  it('0=北(-y)、90=東(+x)、180=南(+y)、270=西(-x)', () => {
    const cases: Array<[number, number, number]> = [
      [0, 0, -1],
      [90, 1, 0],
      [180, 0, 1],
      [270, -1, 0],
    ];
    for (const [h, ex, ey] of cases) {
      const v = { x: 0, y: 0 };
      velocityFromHeading(h, 10, v);
      expect(v.x).toBeCloseTo(ex * 10, 9);
      expect(v.y).toBeCloseTo(ey * 10, 9);
      const s: BoatState = { x: 100, y: 100, headingDeg: h, speedMps: 10 };
      stepStraight(s, 2);
      expect(s.x).toBeCloseTo(100 + ex * 20, 9);
      expect(s.y).toBeCloseTo(100 + ey * 20, 9);
    }
  });
});

describe('interceptHeadingDeg（見越し角）', () => {
  it('目標が魚雷より速くても向かってくるなら解があり、先に会う方の根を選ぶ', () => {
    // 目標は (0,-1000) から南へ 20 m/s、魚雷 10 m/s。1000 - 20t = 10t → t = 33.3 s、会合点 (0,-333) → 真北
    const h = interceptHeadingDeg(0, 0, 10, 0, -1000, 0, 20);
    expect(h).not.toBeNull();
    expect(h!).toBeCloseTo(0, 6);
  });
  it('速さが等しい（a≈0）場合は線形解。遠ざかる配置は null', () => {
    const h2 = interceptHeadingDeg(0, 0, 10, -500, -1000, 10, 0);
    expect(h2).not.toBeNull();
    expect(interceptHeadingDeg(0, 0, 10, 500, -1000, 10, 0)).toBeNull();
  });
  it('静止目標なら目標の方位そのもの', () => {
    expect(interceptHeadingDeg(0, 0, 14, 0, -1000, 0, 0)).toBeCloseTo(0, 9); // 真北
    expect(interceptHeadingDeg(0, 0, 14, 1000, 0, 0, 0)).toBeCloseTo(90, 9); // 真東
  });
  it('目標より遅い魚雷が追いつけない配置では null', () => {
    // 目標が魚雷より速く遠ざかる
    expect(interceptHeadingDeg(0, 0, 10, 1000, 0, 20, 0)).toBeNull();
  });
  it('見越し角で撃った魚雷は直進する駆逐艦の中央に到達する（幾何の整合）', () => {
    const torpedo: TorpedoParams = { speedMps: ktToMps(27), rangeM: 12344, armingM: 100, jitterDeg: 3, erraticPeriodS: 6 };
    const target: BoatState = { x: 1200, y: 1700, headingDeg: 90, speedMps: ktToMps(25) };
    const v = { x: 0, y: 0 };
    velocityFromHeading(target.headingDeg, target.speedMps, v);
    const shooter = { x: 2400, y: 1700 + ydToM(800) }; // 艦の進路の先、横距離 800yd
    const h = interceptHeadingDeg(shooter.x, shooter.y, torpedo.speedMps, target.x, target.y, v.x, v.y);
    expect(h).not.toBeNull();
    const s = createTorpedoState();
    launchTorpedo(s, shooter.x, shooter.y, h!, false, false, 0, 0, 25);
    const circles = createCircles(dd.hull_circles);
    let hit = false;
    for (let i = 0; i < 40000 && !hit; i++) {
      stepStraight(target, 0.01);
      stepTorpedo(s, torpedo, 0.01, 0.01);
      fillHullCircles(circles, target.x, target.y, target.headingDeg, dd.length_m, dd.beam_m);
      hit = pointHitsHull(s.x, s.y, circles);
    }
    expect(hit).toBe(true);
    // 命中点は船体中央付近（見越し角は中心を狙うので、船長の 1/4 以内）
    expect(Math.hypot(s.x - target.x, s.y - target.y)).toBeLessThan(dd.length_m / 4);
  });
  it('3,000yd から見越し角を 2° 外して撃つと外れる（遠距離ほど誤差に弱い）', () => {
    const torpedo: TorpedoParams = { speedMps: ktToMps(27), rangeM: 12344, armingM: 100, jitterDeg: 3, erraticPeriodS: 6 };
    const target: BoatState = { x: 1200, y: 1700, headingDeg: 90, speedMps: ktToMps(25) };
    const v = { x: 0, y: 0 };
    velocityFromHeading(target.headingDeg, target.speedMps, v);
    const shooter = { x: 2400, y: 1700 + ydToM(3000) };
    const h = interceptHeadingDeg(shooter.x, shooter.y, torpedo.speedMps, target.x, target.y, v.x, v.y)!;
    const s = createTorpedoState();
    launchTorpedo(s, shooter.x, shooter.y, h + 2, false, false, 0, 0, 25);
    const circles = createCircles(dd.hull_circles);
    let hit = false;
    for (let i = 0; i < 40000 && !hit && s.active; i++) {
      stepStraight(target, 0.01);
      stepTorpedo(s, torpedo, 0.01, 0.01);
      fillHullCircles(circles, target.x, target.y, target.headingDeg, dd.length_m, dd.beam_m);
      hit = pointHitsHull(s.x, s.y, circles);
    }
    expect(hit).toBe(false);
  });
});

describe('boatTouchesHull（体当たり）', () => {
  it('艇の中心が離れていても船首が船体に触れれば接触。離れていれば接触しない', () => {
    const hull = createCircles(5);
    fillHullCircles(hull, 0, 0, 90, 118, 10.8); // 東西に 118 m、半幅 5.4 m
    // 艇（全長 24.4 m、半長 12.2）が北から船体へ向いて、中心が 15 m 北: 船首は 2.8 m 北 → 半幅 5.4 内
    expect(boatTouchesHull(0, -15, 180, 12.2, hull)).toBe(true);
    // 同じ位置で横向き（船首が東西）なら 15 m 離れたまま → 接触しない
    expect(boatTouchesHull(0, -15, 90, 12.2, hull)).toBe(false);
    // 船尾側でも触れる
    expect(boatTouchesHull(0, 15, 180, 12.2, hull)).toBe(true);
    // 艦の端（x=59）の少し外側: 船首が触れる
    expect(boatTouchesHull(70, 0, 270, 12.2, hull)).toBe(true);
    expect(boatTouchesHull(75, 0, 270, 12.2, hull)).toBe(false);
  });
});
