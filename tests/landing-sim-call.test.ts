// 夜明け近しの帰投の輪の呼びかけを模擬の台本が聞く（v0.6.10 S3b。core/landing-sim-call・core/landing-sim-policy の ringCall・core/landing-sim。spec-v0610 R-U9・D8・§9 S3、
// リードの決定 LD3、レビュー H1・L3）: 世界と同じ呼びかけの関数（core/mission-flow の updateReturnCalls・dawnCallNeedS。Scene も同じ関数）、見えるのは決着の前で接触・報告・
// 輸送船へ走る雷跡が無い間だけ、人は最初に見えてから delayMinS 秒の後、聞くのは卯月がいて ring_call_before_dawn が true の夜の lure の動きの遊び方だけ、人の乱れの列は動かない。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import type { BoatState } from '../src/core/boat-motion';
import { createLandingReport } from '../src/core/landing';
import { runLandingTrial, type LandingSimSetup } from '../src/core/landing-sim';
import { createLandingRingCall, stepLandingRingCall } from '../src/core/landing-sim-call';
import { LANDING_HUMAN, LANDING_PLAY, LANDING_POLICIES, LANDING_POLICY_SPECS, landingPlayPoints, landingSteer, type LandingHumanPlay, type LandingSteer, type LandingSteerCtx } from '../src/core/landing-sim-policy';
import { CALL_DAWN, CALL_FUEL, dawnCallNeedS, ringEdgeDistM, updateReturnCalls } from '../src/core/mission-flow';
import type { PtSection } from '../src/core/pt-boats';
import { bearingDeg } from '../src/core/ship-ai';
import { landingSimSetup } from '../src/systems/landing-sim-setup';

// v0.6.10 実機 2 回目（揚陸 140 → 110 秒）: 110 秒では揚陸が夜明け近しの前にほとんど決着して呼びかけがまれ（seed 1〜40 の lure で 3 夜）なので、
// 呼びかけの仕組みはここだけ揚陸 140 秒の上書き（UNLOAD。data は変えない）で確かめる
const UNLOAD_CALL = { unloadS: 140 } as const;
const ON = landingSimSetup(gameData, 'jp_04', UNLOAD_CALL);
const HARD = landingSimSetup(gameData, 'jp_04', { ...UNLOAD_CALL, hard: true });
const OFF = landingSimSetup(gameData, 'jp_04', { ...UNLOAD_CALL, allyOff: true });
const NO_FLAG: LandingSimSetup = { ...ON, allyDestroyer: { ...ON.allyDestroyer!, ringCallBeforeDawn: false } };
const SEEDS = 12;
/** 人の乱れを消した設定（tests/landing-sim-human と同じ） */
const NEUTRAL: LandingHumanPlay = { delayMinS: 0, delayMaxS: 0, dodgeP: 1, reactExtraS: 0, gunOnS: 4, gunCycleS: 4 };
const snap = (r: object): string => JSON.stringify(r, (_k, v: unknown) => (ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v));
/** コメントを除いたソース */
const code = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const LURE_MOVE = LANDING_POLICIES.filter((p) => LANDING_POLICY_SPECS[p].move === 'lure');

describe('世界と同じ呼びかけの関数（レビュー L3）', () => {
  it('dawnCallNeedS は巡航で輪の縁まで帰る実秒（輪の縁 ÷ (巡航の速さ × time_scale)）', () => {
    expect(dawnCallNeedS(1000, 10, 4)).toBe(25);
    expect(dawnCallNeedS(0, 10, 4)).toBe(0);
  });
  it('Scene（refreshReturnState）と模擬（core/landing-sim-call）は同じ dawnCallNeedS・updateReturnCalls を使う（式の写しを持たない）', () => {
    const scene = code('scenes/mission-scene.ts');
    expect(scene).toContain('const needS = dawnCallNeedS(this.ringEdgeM, w.fuelCurve.cruiseMps, this.timeScale);');
    expect(scene).toContain('updateReturnCalls(before, w.returnCallDone, expended, w.fuel.gal, needGal, this.timeLeftS, needS, rp.callMargin)');
    const call = code('core/landing-sim-call.ts');
    expect(call).toContain('updateReturnCalls(c.flags, resolved, false, fuelGal, edge * fuel.galPerMCruise, Math.max(0, durationS - t), dawnCallNeedS(edge, fuel.cruiseMps, timeScale), ring.callMargin)');
    expect(call).toContain('const edge = ringEdgeDistM(ring, x, y);');
    expect(call).not.toMatch(/\/\s*\(\s*\w+\.cruiseMps/);
  });
});

describe('stepLandingRingCall（ステップの終わり）', () => {
  const ring = ON.ring;
  const fuel = ON.fuel;
  const ts = ON.timeScale;
  // 輪の縁の 1,000 m 外（北）。夜明けまで dawnCallNeedS × call_margin 秒の境目
  const x = ring.x;
  const y = ring.y - ring.radiusM - 1000;
  const callAt = ON.durationS - dawnCallNeedS(1000, fuel.cruiseMps, ts) * ring.callMargin;
  const step = (c: ReturnType<typeof createLandingRingCall>, t: number, o: { resolved?: boolean; contact?: boolean; report?: number; wakes?: number } = {}): void =>
    stepLandingRingCall(c, t, ON.durationS, ring, fuel, ts, x, y, 19, o.resolved ?? false, o.contact ?? false, o.report ?? 0, o.wakes ?? 0);
  it('on でなければ何もしない', () => {
    const c = createLandingRingCall(false, 0);
    step(c, ON.durationS);
    expect([c.flags, c.obey, c.raisedS]).toEqual([0, false, NaN]);
  });
  it('世界と同じビット（境目の前は立たず、境目で立ってラッチ）で、見えれば聞く', () => {
    expect(ringEdgeDistM(ring, x, y)).toBeCloseTo(1000, 6);
    const c = createLandingRingCall(true, 0);
    step(c, callAt - 0.1);
    expect([c.flags & CALL_DAWN, c.obey]).toEqual([0, false]);
    step(c, callAt + 1e-9);
    expect(c.flags).toBe(updateReturnCalls(0, false, false, 19, 1000 * fuel.galPerMCruise, ON.durationS - (callAt + 1e-9), dawnCallNeedS(1000, fuel.cruiseMps, ts), ring.callMargin));
    expect([c.flags & CALL_DAWN, c.obey, c.raisedHidden]).toEqual([CALL_DAWN, true, false]);
    expect([c.raisedS, c.shownS, c.obeyS]).toEqual([callAt + 1e-9, callAt + 1e-9, callAt + 1e-9]);
    expect(c.flags & CALL_FUEL).toBe(0);
  });
  it('見えないのは決着の後・接触・報告・輸送船へ走る雷跡の間（H1）。立ったときに見えなければ raisedHidden、見えたら聞く（ラッチは消えない）', () => {
    for (const o of [{ contact: true }, { report: 1 }, { report: 2 }, { wakes: 1 }]) {
      const c = createLandingRingCall(true, 0);
      step(c, callAt + 1, o);
      expect([c.flags & CALL_DAWN, c.obey, c.raisedHidden, Number.isNaN(c.shownS)], JSON.stringify(o)).toEqual([CALL_DAWN, false, true, true]);
      step(c, callAt + 2);
      expect([c.obey, c.shownS, c.raisedS], JSON.stringify(o)).toEqual([true, callAt + 2, callAt + 1]);
      step(c, callAt + 3, o);
      expect(c.obey, JSON.stringify(o)).toBe(false);
    }
    const r = createLandingRingCall(true, 0);
    step(r, callAt + 1, { resolved: true });
    expect([r.obey, Number.isNaN(r.raisedS)]).toEqual([false, true]);
  });
  it('人（delayS 5）: 最初に見えてから 5 秒の後に聞く（見えなくなれば聞かない）', () => {
    const c = createLandingRingCall(true, LANDING_HUMAN.delayMinS);
    step(c, callAt + 1);
    expect([c.obey, c.shownS]).toEqual([false, callAt + 1]);
    step(c, callAt + 5.9);
    expect(c.obey).toBe(false);
    step(c, callAt + 6);
    expect([c.obey, c.obeyS]).toEqual([true, callAt + 6]);
    step(c, callAt + 7, { contact: true });
    expect(c.obey).toBe(false);
    expect(LANDING_HUMAN.delayMinS).toBe(5);
  });
});

describe('台本（landingSteer の ringCall）', () => {
  const pts = landingPlayPoints(ON.landing, ON.start);
  const steer = (ringCall: boolean | undefined, x: number, y: number, detected = false): LandingSteer => {
    const boat = { x, y, headingDeg: 0 } as BoatState;
    const ctx: LandingSteerCtx = { boat, q: { detected, boats: [] } as unknown as PtSection, report: createLandingReport(), start: ON.start, anchor: ON.landing, station: pts.station, picket: pts.picket, ring: ON.ring, silentMps: 7, cruiseMps: 12, cue: false, ringCall };
    const out: LandingSteer = { headingDeg: NaN, wantMps: NaN };
    landingSteer(LANDING_POLICY_SPECS.lure, ctx, false, { lured: false }, out);
    return out;
  };
  it('聞く間は輪の中心へ巡航、着いたら（arriveM の内）止まる＝home_early と同じ。聞かなければ前のまま', () => {
    const far = { x: ON.landing.x, y: ON.landing.y - 1000 };
    const go = steer(true, far.x, far.y);
    expect(go.headingDeg).toBeCloseTo(bearingDeg(far.x, far.y, ON.ring.x, ON.ring.y), 9);
    expect(go.wantMps).toBe(12);
    expect(steer(true, ON.ring.x + LANDING_PLAY.arriveM / 2, ON.ring.y)).toEqual({ headingDeg: NaN, wantMps: 0 });
    expect(steer(false, far.x, far.y)).toEqual(steer(undefined, far.x, far.y));
    expect(steer(false, far.x, far.y).wantMps).toBe(7); // 輸送船のそばへ静音（lure の平常）
  });
});

describe('1 夜（seed 1〜12）', () => {
  it('卯月がいて旗が true の夜だけ、lure の動きの遊び方が聞く（ほかの動き・旗 false・卯月を切った夜は立てず聞かない）', () => {
    let obeyed = 0;
    for (const pol of LANDING_POLICIES) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const r = runLandingTrial(ON, pol, seed);
        if (LANDING_POLICY_SPECS[pol].move !== 'lure') expect([r.ringCallS, r.ringObeyS], `${pol} ${seed}`).toEqual([NaN, NaN]);
        else if (!Number.isNaN(r.ringObeyS)) obeyed++;
        for (const s of [NO_FLAG, OFF]) {
          const z = runLandingTrial(s, pol, seed);
          expect([z.ringCallS, z.ringShownS, z.ringObeyS, z.ringCallHidden], `${pol} ${seed}`).toEqual([NaN, NaN, NaN, false]);
        }
      }
    }
    expect(obeyed).toBeGreaterThan(SEEDS * 4);
    expect(LURE_MOVE).toEqual(['lure', 'lure_away', 'lure_near', 'lure_cue', 'lure_noshoot', 'lure_late', 'kite', 'face', 'human', 'human_face']);
    }, 60_000); // 遊び方 × 12 夜 × 3 設定＝重い（負荷のある機械で 5 秒の既定を超える）
  it('聞いた夜は旗 false の夜と違う夜になり、夜明けの前に帰る（lure）。立った秒 ≤ 見えた秒 ≤ 聞いた秒、決着の前', () => {
    let pre = 0;
    let changed = 0;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = runLandingTrial(ON, 'lure', seed);
      if (Number.isNaN(r.ringObeyS)) continue;
      expect(r.ringCallS, `${seed}`).toBeLessThanOrEqual(r.ringShownS);
      expect(r.ringShownS, `${seed}`).toBeLessThanOrEqual(r.ringObeyS);
      expect(r.ringObeyS, `${seed}`).toBeLessThan(r.resolvedS);
      if (r.end === 'home' && !r.dawn) pre++;
      if (snap(r) !== snap(runLandingTrial(NO_FLAG, 'lure', seed))) changed++;
    }
    expect(pre).toBeGreaterThan(SEEDS / 2);
    expect(changed).toBeGreaterThan(SEEDS / 2);
  });
  it('人（human・human_face）は最初に見えてから 5 秒の後に聞き、ほかの遊び方は見えたステップに聞く（ノーマルとハード）', () => {
    let humans = 0;
    for (const s of [ON, HARD]) {
      for (const pol of LURE_MOVE) {
        for (let seed = 1; seed <= SEEDS; seed++) {
          const r = runLandingTrial(s, pol, seed);
          if (Number.isNaN(r.ringObeyS)) continue;
          if (LANDING_POLICY_SPECS[pol].human === true) {
            humans++;
            expect(r.ringObeyS - r.ringShownS, `${pol} ${seed}`).toBeGreaterThanOrEqual(LANDING_HUMAN.delayMinS - 1e-6);
          } else expect(r.ringObeyS, `${pol} ${seed}`).toBe(r.ringShownS);
        }
      }
    }
    expect(humans).toBeGreaterThan(SEEDS);
    }, 60_000); // 2 設定 × 10 遊び方 × 12 夜
  it('人の乱れの列は動かない: 中立の設定（遅れ 0）なら呼びかけを聞く夜も human は lure・human_face は face と同じ夜', () => {
    let obeyed = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const h = runLandingTrial(ON, 'human', seed, NEUTRAL);
      expect(snap(h), `${seed}`).toBe(snap(runLandingTrial(ON, 'lure', seed)));
      expect(snap(runLandingTrial(ON, 'human_face', seed, NEUTRAL)), `${seed}`).toBe(snap(runLandingTrial(ON, 'face', seed)));
      if (!Number.isNaN(h.ringObeyS)) obeyed++;
    }
    expect(obeyed).toBeGreaterThan(0);
  });
});
