import { describe, expect, it } from 'vitest';
import torpedoes from '../data/torpedoes.json';
import hitRateModel from '../data/hit_rate_model.json';
import {
  consumeWakeMark,
  createTorpedoState,
  isArmed,
  isTorpedoDataRecord,
  launchTorpedo,
  stepTorpedo,
  torpedoParamsFromData,
  torpedoReliabilityFromData,
  type TorpedoParams,
} from '../src/core/torpedo';
import { ktToMps } from '../src/core/units';

const mk8 = torpedoes.torpedoes.find((t) => t.id === 'us_mk8');
if (!mk8 || !isTorpedoDataRecord(mk8)) throw new Error('us_mk8 が無い');
const ARMING = hitRateModel.torpedo_launch.arming_distance_m;
const PERIOD = hitRateModel.torpedo_launch.erratic_period_s;
const P: TorpedoParams = torpedoParamsFromData(mk8, ARMING, PERIOD);

describe('torpedoParamsFromData（Mk 8）', () => {
  it('data の既定設定を m/s と m に変換する', () => {
    const setting = mk8.settings[mk8.default_setting]!;
    expect(P.speedMps).toBeCloseTo(ktToMps(setting.speed_kt), 9);
    expect(P.rangeM).toBe(setting.range_m);
    expect(P.armingM).toBe(ARMING);
    expect(P.jitterDeg).toBe(mk8.reliability.jitter_deg);
    expect(mk8.length_m).toBeGreaterThan(0);
    expect(torpedoReliabilityFromData(mk8)).toEqual({ dud: mk8.reliability.dud, erratic: mk8.reliability.erratic });
  });
  it('data の全魚雷がレコードの形を満たす', () => {
    for (const t of torpedoes.torpedoes) expect(isTorpedoDataRecord(t), t.id).toBe(true);
  });
});

describe('stepTorpedo', () => {
  it('直進: 方位 0 は -y、走行距離が積み上がる', () => {
    const s = createTorpedoState();
    launchTorpedo(s, 100, 100, 0, false, false, 0, 800, 25);
    stepTorpedo(s, P, 1, 0.2);
    expect(s.x).toBeCloseTo(100, 9);
    expect(s.y).toBeCloseTo(100 - P.speedMps, 9);
    expect(s.runM).toBeCloseTo(P.speedMps, 9);
    expect(s.active).toBe(true);
  });
  it('安全距離までは非武装、超えると武装', () => {
    const s = createTorpedoState();
    launchTorpedo(s, 0, 0, 90, false, false, 0, 800, 25);
    expect(isArmed(s, P)).toBe(false);
    const dtToArm = (ARMING - 1) / P.speedMps;
    stepTorpedo(s, P, dtToArm, dtToArm);
    expect(isArmed(s, P)).toBe(false);
    stepTorpedo(s, P, 2 / P.speedMps, 0.01);
    expect(isArmed(s, P)).toBe(true);
  });
  it('射程に達すると非アクティブになり true を返す', () => {
    const s = createTorpedoState();
    launchTorpedo(s, 0, 0, 45, false, false, 0, 800, 25);
    const dt = P.rangeM / P.speedMps;
    expect(stepTorpedo(s, P, dt * 0.99, 1)).toBe(false);
    expect(s.active).toBe(true);
    expect(stepTorpedo(s, P, dt * 0.02, 1)).toBe(true);
    expect(s.active).toBe(false);
    expect(stepTorpedo(s, P, 1, 1)).toBe(false); // 非アクティブは何もしない
  });
  it('蛇行: 進路は基準 ±jitter 内で往復し、半周期で符号が変わる', () => {
    const s = createTorpedoState();
    launchTorpedo(s, 0, 0, 180, false, true, 0, 800, 25);
    let maxDev = 0;
    for (let i = 0; i < 600; i++) {
      stepTorpedo(s, P, 0.01, 0.01);
      const dev = ((s.headingDeg - 180 + 540) % 360) - 180;
      maxDev = Math.max(maxDev, Math.abs(dev));
      expect(Math.abs(dev)).toBeLessThanOrEqual(P.jitterDeg + 1e-9);
    }
    expect(maxDev).toBeGreaterThan(P.jitterDeg * 0.9);
    const q = createTorpedoState();
    launchTorpedo(q, 0, 0, 180, false, true, 0, 800, 25);
    stepTorpedo(q, P, 0.01, PERIOD / 4);
    expect(q.headingDeg).toBeCloseTo(180 + P.jitterDeg, 6);
    stepTorpedo(q, P, 0.01, PERIOD / 2);
    expect(q.headingDeg).toBeCloseTo(180 - P.jitterDeg, 6);
  });
  it('蛇行の一定偏差: 発射方位 + bias が基準になり、非蛇行では bias を無視する', () => {
    const e = createTorpedoState();
    launchTorpedo(e, 0, 0, 100, false, true, -2.5, 800, 25);
    expect(e.baseHeadingDeg).toBeCloseTo(97.5, 9);
    expect(e.erraticBiasDeg).toBe(-2.5);
    const n = createTorpedoState();
    launchTorpedo(n, 0, 0, 100, false, false, -2.5, 800, 25);
    expect(n.baseHeadingDeg).toBe(100);
    expect(n.erraticBiasDeg).toBe(0);
  });
  it('非蛇行は進路が変わらない', () => {
    const s = createTorpedoState();
    launchTorpedo(s, 0, 0, 33, false, false, 0, 800, 25);
    for (let i = 0; i < 100; i++) stepTorpedo(s, P, 0.05, 0.05);
    expect(s.headingDeg).toBe(33);
  });
  it('雷跡の点は spacing ごとに 1 回だけ', () => {
    const s = createTorpedoState();
    launchTorpedo(s, 0, 0, 0, false, false, 0, 800, 25);
    expect(consumeWakeMark(s, 25)).toBe(false);
    stepTorpedo(s, P, 60 / P.speedMps, 0.1); // 60 m 走行
    expect(consumeWakeMark(s, 25)).toBe(true); // 25
    expect(consumeWakeMark(s, 25)).toBe(true); // 50
    expect(consumeWakeMark(s, 25)).toBe(false); // 75 はまだ
  });
});
