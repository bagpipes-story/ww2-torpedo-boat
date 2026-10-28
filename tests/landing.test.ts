// 停泊して揚陸する味方の輸送船（v0.6.9 S2。core/landing。spec-v069 §4.4・§9・R8/F14・F16）: 揚陸の時計（unload_s ちょうどで完了・夜明けが先でも数え続ける）、
// 被雷 1 は続く・2 で沈む（揚陸の割合で止まる）・完了の後の沈没（sunkAfterDone）・決着、見張りの報告の選び方（哨戒・斉射が残る・1,800 m・向かう ≤ 90°・最寄り・遠い／近い）、
// 走っている雷跡の数と最接近までの体感秒（平方根なし）、出来事の記録（そのときの被雷の数と揚陸の割合）。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createLanding, createLandingReport, createLandingWakes, hitLanding, landingEvent, landingReport, landingResolved, landingWakes, tickLanding,
  LANDING_DIST_STEP_M, LANDING_HIT, LANDING_REPORT_FAR, LANDING_REPORT_NEAR, LANDING_REPORT_NONE, LANDING_REPORT_TOWARD_DEG, LANDING_SUNK,
  LD_DONE, LD_SUNK, LD_UNLOADING, LE_DONE, LE_DUD, LE_NONE,
} from '../src/core/landing';
import type { LandingParams } from '../src/core/landing-data';
import { PT_ALERT, PT_LEAVE, PT_PATROL } from '../src/core/pt-boats';
import { createTorpedoState, launchTorpedo } from '../src/core/torpedo';
import { createCircles, fillHullCircles } from '../src/core/torpedo-solver';
import { LP, TP, TS, bench, place } from './landing-kit';

const MK13 = TP.torpedo.speedMps;

describe('輸送船の値（jp_04。data のまま）', () => {
  it('泊地 (3000, 2760) 艇首 135°・当たりの船体 240 × 32 m（5 円）・沈むまで 2 本・揚陸 140 秒・見張り 1,800 m・慌てる 1,300 m', () => {
    expect([LP.x, LP.y, LP.headingDeg, LP.hitLenM, LP.hitBeamM, LP.circles, LP.hitsToSink, LP.unloadS, LP.lookoutM]).toEqual([3000, 2760, 135, 240, 32, 5, 2, 140, 1800]);
    expect([LP.lookout2, LP.hurried2, LP.passRadius2]).toEqual([1800 ** 2, 1300 ** 2, 152 ** 2]);
  });
  it('createLanding: 船体の円は fillHullCircles のまま（1 回だけ）・泊地に浮いて揚陸中・出来事なし', () => {
    const ld = createLanding(LP);
    const want = createCircles(LP.circles);
    fillHullCircles(want, LP.x, LP.y, LP.headingDeg, LP.hitLenM, LP.hitBeamM);
    expect(ld.circles).toEqual(want);
    expect([ld.x, ld.y, ld.state.x, ld.state.y, ld.afloat, ld.out, ld.sinking, ld.sunk, ld.phase, ld.pct, ld.hits, ld.eventSeq, ld.eventKind]).toEqual([3000, 2760, 3000, 2760, true, false, false, false, LD_UNLOADING, 0, 0, 0, LE_NONE]);
    expect([ld.pctAtSink, ld.doneAtS, ld.sinkStartS]).toEqual([NaN, NaN, NaN]);
  });
});

describe('揚陸の時計（tickLanding）', () => {
  it('unload_s ちょうどで揚陸完了（その前は揚陸中・割合 = 時計 / unload_s）。完了は 1 回だけ（出来事 LE_DONE）', () => {
    const ld = createLanding(LP);
    expect(tickLanding(ld, LP, 70)).toBe(false);
    expect([ld.phase, ld.pct]).toEqual([LD_UNLOADING, 0.5]);
    expect(tickLanding(ld, LP, LP.unloadS - 1e-9)).toBe(false);
    expect(ld.phase).toBe(LD_UNLOADING);
    expect(landingResolved(ld)).toBe(false);
    expect(tickLanding(ld, LP, LP.unloadS)).toBe(true);
    expect([ld.phase, ld.pct, ld.doneAtS, ld.eventKind, ld.eventSeq, ld.eventBoat, landingResolved(ld)]).toEqual([LD_DONE, 1, LP.unloadS, LE_DONE, 1, -1, true]);
    expect(tickLanding(ld, LP, LP.unloadS + 10)).toBe(false);
    expect([ld.doneAtS, ld.eventSeq]).toEqual([LP.unloadS, 1]);
  });
  it('固定ステップ 1/60 で回すと unload_s 秒（±1 ステップ）で完了する', () => {
    const ld = createLanding(LP);
    let t = 0;
    let k = 0;
    while (!tickLanding(ld, LP, (t = ++k / 60))) if (k > 1e5) break;
    expect(Math.abs(t - LP.unloadS)).toBeLessThanOrEqual(1 / 60);
  });
  it('夜明けが先に来ても数え続ける（tickLanding に夜明けは入らない。R8/F14）: unload_s 250 なら 210 秒でも揚陸中、250 秒で完了', () => {
    const lp: LandingParams = { ...LP, unloadS: 250 };
    const ld = createLanding(lp);
    tickLanding(ld, lp, 210);
    expect([ld.phase, ld.pct]).toEqual([LD_UNLOADING, 210 / 250]);
    expect(tickLanding(ld, lp, 250)).toBe(true);
  });
});

describe('被雷と沈没（hitLanding）', () => {
  it('1 本目は被雷（揚陸は続く）、2 本目で沈み始める（揚陸はそのときの割合で止まる・LD_SUNK・決着）', () => {
    const ld = createLanding(LP);
    tickLanding(ld, LP, 42);
    expect(hitLanding(ld, LP, 42)).toBe(LANDING_HIT);
    expect([ld.hits, ld.afloat, ld.sinking, ld.phase]).toEqual([1, true, false, LD_UNLOADING]);
    tickLanding(ld, LP, 84);
    expect(ld.pct).toBeCloseTo(0.6, 12);
    expect(hitLanding(ld, LP, 84.5)).toBe(LANDING_SUNK);
    expect([ld.hits, ld.afloat, ld.out, ld.sinking, ld.sunk, ld.sinkStartS, ld.phase, ld.sunkAfterDone, landingResolved(ld)]).toEqual([2, false, true, true, true, 84.5, LD_SUNK, false, true]);
    expect(ld.pctAtSink).toBeCloseTo(0.6, 12);
    tickLanding(ld, LP, 140);
    expect([ld.phase, ld.pct]).toEqual([LD_SUNK, ld.pctAtSink]);
    // 沈み始めた後の命中は何も変えない
    expect(hitLanding(ld, LP, 90)).toBe(LANDING_SUNK);
    expect([ld.hits, ld.sinkStartS]).toEqual([2, 84.5]);
  });
  it('揚陸完了の後の沈没: LD_DONE のまま sunkAfterDone（目的には響かない）', () => {
    const ld = createLanding(LP);
    tickLanding(ld, LP, LP.unloadS);
    hitLanding(ld, LP, 150);
    hitLanding(ld, LP, 151);
    expect([ld.phase, ld.sunkAfterDone, ld.sinking, ld.afloat, ld.pct, ld.pctAtSink, landingResolved(ld)]).toEqual([LD_DONE, true, true, false, 1, NaN, true]);
  });
  it('torpedo_hits_to_sink 1 なら 1 本で沈む', () => {
    const lp: LandingParams = { ...LP, hitsToSink: 1 };
    const ld = createLanding(lp);
    expect(hitLanding(ld, lp, 10)).toBe(LANDING_SUNK);
    expect(ld.phase).toBe(LD_SUNK);
  });
});

describe('出来事（landingEvent。HUD のモード 35 の材料。F16）', () => {
  it('種類・PT・距離・本数と、そのときの被雷の数・揚陸の割合（沈んでいれば沈んだときの割合）を記して通し番号を増やす', () => {
    const ld = createLanding(LP);
    tickLanding(ld, LP, 35);
    landingEvent(ld, LE_DUD, 1, NaN, 0);
    expect([ld.eventSeq, ld.eventKind, ld.eventBoat, ld.eventCount, ld.eventHits, ld.eventPct]).toEqual([1, LE_DUD, 1, 0, 0, 0.25]);
    hitLanding(ld, LP, 36);
    landingEvent(ld, LE_DUD, 0, NaN, 0);
    expect([ld.eventSeq, ld.eventHits]).toEqual([2, 1]); // 被雷の後の不発（「不発！ 被雷 1 のまま」）
    tickLanding(ld, LP, 70);
    hitLanding(ld, LP, 70);
    tickLanding(ld, LP, 100);
    landingEvent(ld, LE_DUD, 0, NaN, 0);
    expect(ld.eventPct).toBe(0.5);
  });
});

describe('見張りの報告（landingReport）', () => {
  it('哨戒中・斉射が残る・1,800 m の内・輸送船へ向かう PT の最寄り。遠い（> 1,300 m）・近い（≤ 1,300 m）、距離は 100 m 刻みの切り上げ、方角は輸送船から PT', () => {
    const b = bench();
    const r = createLandingReport();
    place(b, 0, 1750, 0, 0, PT_PATROL); // 北・遠い
    landingReport(b.ld, LP, b.q, b.st, r);
    expect([r.sub, r.i, r.distStep, r.dirIdx]).toEqual([LANDING_REPORT_FAR, 0, 18, 0]);
    place(b, 1, 1250, 90, 20, PT_PATROL); // 東・近い・最寄り
    landingReport(b.ld, LP, b.q, b.st, r);
    expect([r.sub, r.i, r.distStep, r.dirIdx]).toEqual([LANDING_REPORT_NEAR, 1, 13, 2]);
    place(b, 1, 1301, 45, 0, PT_PATROL); // 北東 1,301 m は遠い
    landingReport(b.ld, LP, b.q, b.st, r);
    expect([r.sub, r.i, r.distStep, r.dirIdx]).toEqual([LANDING_REPORT_FAR, 1, 14, 1]);
    expect(LANDING_DIST_STEP_M).toBe(100);
  });
  it('報告しない: 1,800 m の外・警戒・去る・斉射を撃った PT・輸送船から離れる向き（> 90°）・決着の後', () => {
    const r = createLandingReport();
    const none = (setup: (b: ReturnType<typeof bench>) => void): number[] => {
      const b = bench();
      setup(b);
      landingReport(b.ld, LP, b.q, b.st, r);
      return [r.sub, r.i];
    };
    const NONE = [LANDING_REPORT_NONE, -1];
    expect(none((b) => place(b, 0, 1801, 0, 0, PT_PATROL))).toEqual(NONE);
    expect(none((b) => place(b, 0, 1200, 0, 0, PT_ALERT))).toEqual(NONE);
    expect(none((b) => place(b, 0, 1200, 0, 0, PT_LEAVE))).toEqual(NONE);
    expect(none((b) => { place(b, 0, 1200, 0, 0, PT_PATROL); b.st.left[0] = 0; })).toEqual(NONE);
    expect(none((b) => place(b, 0, 1200, 0, LANDING_REPORT_TOWARD_DEG + 1, PT_PATROL))).toEqual(NONE);
    expect(none((b) => place(b, 0, 1200, 0, 180, PT_PATROL))).toEqual(NONE);
    expect(none((b) => { place(b, 0, 1200, 0, 0, PT_PATROL); tickLanding(b.ld, LP, LP.unloadS); })).toEqual(NONE);
    expect(none((b) => { place(b, 0, 1200, 0, 0, PT_PATROL); hitLanding(b.ld, LP, 1); hitLanding(b.ld, LP, 2); })).toEqual(NONE);
    // 向かう角の境目（90° は報告する）
    expect(none((b) => place(b, 0, 1200, 0, LANDING_REPORT_TOWARD_DEG - 0.01, PT_PATROL))).toEqual([LANDING_REPORT_NEAR, 0]);
  });
  it('慌てた斉射なし（hurried_max_m 0）ならいつも遠い', () => {
    const b = bench();
    const r = createLandingReport();
    place(b, 0, 950, 200, 0, PT_PATROL);
    landingReport(b.ld, { ...LP, hurried2: 0 }, b.q, b.st, r);
    expect([r.sub, r.i, r.dirIdx]).toEqual([LANDING_REPORT_FAR, 0, 4]);
  });
});

describe('走っている雷跡（landingWakes）', () => {
  it('決着していない魚雷の本数と、輸送船の中心への最接近までの最短の体感秒（遠ざかるのは 0・無ければ NaN）', () => {
    const ld = createLanding(LP);
    const w = createLandingWakes();
    const s = [createTorpedoState(), createTorpedoState(), createTorpedoState(), createTorpedoState()];
    landingWakes(s, MK13, TS, ld, w);
    expect([w.count, w.cpaS]).toEqual([0, NaN]);
    launchTorpedo(s[0]!, LP.x - 860, LP.y, 90, false, false, 0, 860, 25); // 西 860 m から東へ: 860 / (17.23 × 5) ≈ 9.98 秒
    launchTorpedo(s[1]!, LP.x, LP.y - 1200, 180, false, false, 0, 1200, 25); // 北 1,200 m から南へ: ≈ 13.9 秒
    landingWakes(s, MK13, TS, ld, w);
    expect(w.count).toBe(2);
    expect(w.cpaS).toBeCloseTo(860 / (MK13 * TS), 9);
    launchTorpedo(s[2]!, LP.x + 100, LP.y, 90, false, false, 0, 100, 25); // 東へ遠ざかる: 0
    landingWakes(s, MK13, TS, ld, w);
    expect([w.count, w.cpaS]).toEqual([3, 0]);
    s[2]!.resolved = true; // 決着（外れ）した魚雷は数えない（走り続けても）
    s[0]!.active = false;
    landingWakes(s, MK13, TS, ld, w);
    expect(w.count).toBe(1);
    expect(w.cpaS).toBeCloseTo(1200 / (MK13 * TS), 9);
  });
  it('平方根を使わない（spec §4.4・§10）', () => {
    const src = readFileSync(new URL('../src/core/landing.ts', import.meta.url), 'utf8');
    const fn = src.slice(src.indexOf('export function landingWakes'));
    expect(fn).not.toMatch(/Math\.(sqrt|hypot)/);
  });
});
