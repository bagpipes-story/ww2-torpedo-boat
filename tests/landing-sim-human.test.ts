// 人に近い遊び方の模擬の行（v0.6.9 実機 1 回目。spec-ip1 §4。core/landing-sim-policy の face・human・human_face と LANDING_HUMAN・人の 3 つの規則、core/landing-sim の「人の乱れ」の列、
// systems/landing-sim-setup の斉射の合わせ方）: 表だけ（帯なし）。台本と設定の値、人の規則（報告の遅れ・赤い線・射撃ボタン）、face の台本、同じ seed なら同じ夜（ハードも）・ハードの I1〜I6、
// 中立の設定なら human は lure・human_face は face と同じ夜（人の乱れはほかの列を動かさない）、較正の 12 は人の設定を読まない（極端な設定でも同じ夜）、斉射の数え・R2 の分布は較正の 12 だけ。
// ノーマルの 15 の遊び方の決まった結果・I1〜I6・魚雷の数えは tests/landing-sim の it.each（seed 1〜12）、N 400 × 2 組の表は scripts/landing-sim。
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import type { BoatState } from '../src/core/boat-motion';
import { LANDING_REPORT_FAR, createLandingReport } from '../src/core/landing';
import { runLandingTrial } from '../src/core/landing-sim';
import {
  LANDING_CALIBRATION_POLICIES, LANDING_HUMAN, LANDING_HUMAN_POLICIES, LANDING_HUMAN_SEED_ADD, LANDING_HUMAN_SEED_MUL, LANDING_POLICIES, LANDING_POLICY_SPECS,
  humanGunOn, humanReactAt, humanSeesReport, landingPlayPoints, landingSteer, type LandingHumanPlay, type LandingSteer, type LandingSteerCtx,
} from '../src/core/landing-sim-policy';
import { PT_LEAVE, PT_RUN_IN, type PtSection } from '../src/core/pt-boats';
import { SeededRng } from '../src/core/rng';
import { bearingDeg } from '../src/core/ship-ai';
import { LANDING_CALIBRATION_ALLY } from '../src/systems/ally-sim-bands';
import { LANDING_CALIBRATION_NO_ALLY, landingCalibrationRun, landingInvariantMisses, landingSimSetup } from '../src/systems/landing-sim-setup';

const S = landingSimSetup(gameData, 'jp_04');
const H = landingSimSetup(gameData, 'jp_04', { hard: true });
/** 1 夜の記録の文字列（型付き配列は中身の配列に。tests/landing-sim と同じ） */
const snap = (r: object): string => JSON.stringify(r, (_k, v: unknown) => (ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v));
/** 人の乱れを消した設定（遅れ 0・赤い線はみなかわす・足し 0・射撃ボタンはいつも） */
const NEUTRAL: LandingHumanPlay = { delayMinS: 0, delayMaxS: 0, dodgeP: 1, reactExtraS: 0, gunOnS: 4, gunCycleS: 4 };
/** 極端な設定（較正の 12 はこれでも同じ夜） */
const EXTREME: LandingHumanPlay = { delayMinS: 60, delayMaxS: 90, dodgeP: 0, reactExtraS: 5, gunOnS: 0, gunCycleS: 3 };
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

describe('遊び方の一覧と設定', () => {
  it('15 = 較正の 12（LANDING_CALIBRATION_NO_ALLY の順）の後に人に近い 3 つ（卯月のいる帯 LANDING_CALIBRATION_ALLY は 15 の順。v0.6.10 S4）', () => {
    expect(LANDING_POLICIES.length).toBe(15);
    expect(LANDING_HUMAN_POLICIES).toEqual(['face', 'human', 'human_face']);
    expect(LANDING_POLICIES.slice(12)).toEqual(LANDING_HUMAN_POLICIES);
    expect(LANDING_CALIBRATION_POLICIES).toEqual(LANDING_POLICIES.slice(0, 12));
    expect(LANDING_CALIBRATION_POLICIES).toEqual(LANDING_CALIBRATION_NO_ALLY.map((r) => r.policy));
    expect(LANDING_CALIBRATION_ALLY.map((r) => r.policy)).toEqual([...LANDING_POLICIES]);
  });
  it('台本: face は lure の戦い方を face に、human は lure に人の遅れと乱れ、human_face は両方。較正の 12 に人の鍵は無い', () => {
    const { lure, face, human, human_face: humanFace } = LANDING_POLICY_SPECS;
    expect({ ...face, fight: 'flee' }).toEqual(lure);
    expect(face.fight).toBe('face');
    expect(human).toEqual({ ...lure, human: true });
    expect(humanFace).toEqual({ ...face, human: true });
    for (const pol of LANDING_CALIBRATION_POLICIES) expect('human' in LANDING_POLICY_SPECS[pol], pol).toBe(false);
  });
  it('設定（模擬の仮定）: 遅れ 5〜12 秒・赤い線は 50%・反応 +0〜1 秒・機銃は 4 秒ごとの初め 2 秒、人の乱れの列は seed × 7907 + 31337', () => {
    expect(LANDING_HUMAN).toEqual({ delayMinS: 5, delayMaxS: 12, dodgeP: 0.5, reactExtraS: 1, gunOnS: 2, gunCycleS: 4 });
    expect([LANDING_HUMAN_SEED_MUL, LANDING_HUMAN_SEED_ADD]).toEqual([7907, 31337]);
  });
});

describe('人の 3 つの規則', () => {
  it('報告: 最初の報告から delayS 秒の後だけ見る（報告が無い間＝NaN も見ない）', () => {
    expect(humanSeesReport(10, NaN, 0)).toBe(false);
    expect(humanSeesReport(10, 10, 0)).toBe(true);
    expect(humanSeesReport(14.9, 10, 5)).toBe(false);
    expect(humanSeesReport(15, 10, 5)).toBe(true);
  });
  it('赤い線: 足し U(0, reactExtraS) → かわすか（next < dodgeP）の順にいつも 2 回引き、かわさない線は NaN', () => {
    const hp = { ...LANDING_HUMAN, reactExtraS: 1, dodgeP: 0.5 };
    let dodged = 0;
    const n = 4000;
    const a = new SeededRng(99);
    const b = new SeededRng(99);
    for (let k = 0; k < n; k++) {
      const extra = b.nextRange(0, 1);
      const want = b.next() < 0.5 ? 3 + extra : NaN;
      const got = humanReactAt(3, hp, a);
      expect(Object.is(got, want), `line ${k}`).toBe(true);
      if (!Number.isNaN(got)) {
        dodged++;
        expect(got - 3).toBeGreaterThanOrEqual(0);
        expect(got - 3).toBeLessThan(1);
      }
    }
    expect(a.next()).toBe(b.next()); // 引いた回数が同じ
    expect(dodged / n).toBeGreaterThan(0.45);
    expect(dodged / n).toBeLessThan(0.55);
    const r = new SeededRng(5);
    for (let k = 0; k < 50; k++) expect(Number.isNaN(humanReactAt(1, { ...hp, dodgeP: 1 }, r))).toBe(false);
    for (let k = 0; k < 50; k++) expect(Number.isNaN(humanReactAt(1, { ...hp, dodgeP: 0 }, r))).toBe(true);
    expect(humanReactAt(2, { ...hp, reactExtraS: 0, dodgeP: 1 }, r)).toBe(2);
  });
  it('射撃ボタン: 出撃からの秒の 4 秒ごとの初めの 2 秒だけ（乱数なし）', () => {
    const on = (t0: number): boolean => humanGunOn(t0, LANDING_HUMAN);
    expect([0, 1.99, 2, 3.99, 4, 5.5, 6, 10, 13].map(on)).toEqual([true, true, false, false, true, true, false, false, true]);
    expect(humanGunOn(123.4, NEUTRAL)).toBe(true);
    expect(humanGunOn(0, EXTREME)).toBe(false);
  });
});

describe('face の台本（見つかっている間）', () => {
  const pts = landingPlayPoints(S.landing, S.start);
  const boat = { x: S.landing.x, y: S.landing.y - 1000, headingDeg: 0 } as BoatState; // 泊地の北 1,000 m
  const near = { x: boat.x + 300, y: boat.y, phase: PT_RUN_IN };
  const far = { x: boat.x, y: boat.y - 800, phase: PT_RUN_IN };
  const steer = (pol: 'face' | 'lure', boats: object[], detected: boolean, resolved = false): LandingSteer => {
    const report = createLandingReport();
    const ctx: LandingSteerCtx = { boat, q: { detected, boats } as unknown as PtSection, report, start: S.start, anchor: S.landing, station: pts.station, picket: pts.picket, ring: S.ring, silentMps: 7, cruiseMps: 12, cue: false };
    const out: LandingSteer = { headingDeg: NaN, wantMps: NaN };
    landingSteer(LANDING_POLICY_SPECS[pol], ctx, resolved, { lured: false }, out);
    return out;
  };
  it('見つかっていて決着の前は、去っていない PT のうち最も近い 1 隻へ巡航（割って入る）', () => {
    expect(steer('face', [far, near], true)).toEqual({ headingDeg: bearingDeg(boat.x, boat.y, near.x, near.y), wantMps: 12 });
    expect(steer('face', [{ ...near, phase: PT_LEAVE }, far], true)).toEqual({ headingDeg: bearingDeg(boat.x, boat.y, far.x, far.y), wantMps: 12 });
    expect(steer('lure', [far, near], true)).toEqual({ headingDeg: 0, wantMps: 7 }); // lure は輸送船から離れる向き（北）へ静音
  });
  it('去っていない PT が無い・見つかっていない・決着の後は lure と同じ', () => {
    const left = [{ ...near, phase: PT_LEAVE }];
    expect(steer('face', left, true)).toEqual(steer('lure', left, true));
    expect(steer('face', [far, near], false)).toEqual(steer('lure', [far, near], false));
    expect(steer('face', [far, near], true, true)).toEqual(steer('lure', [far, near], true, true));
    expect(LANDING_POLICY_SPECS.face.react).toBe(LANDING_REPORT_FAR);
  });
});

describe('1 夜', () => {
  it.each(LANDING_HUMAN_POLICIES)('%s: 同じ seed なら同じ夜（ノーマルとハード）', (pol) => {
    for (const s of [S, H]) expect(snap(runLandingTrial(s, pol, 3))).toBe(snap(runLandingTrial(s, pol, 3)));
  });
  it('ハード（PT 3 隻）でも回り、I1〜I6・斉射は 1 隻 1 回・seed+26 の回数が合う（seed 1〜6）。人に近い遊び方だけを回せば斉射はそれを合わせる', () => {
    const run = landingCalibrationRun(gameData, 'jp_04', LANDING_HUMAN_POLICIES, 6, 1, 1, { hard: true });
    expect(run.setup.pt.count).toBe(3);
    expect(run.salvoPolicies).toEqual(LANDING_HUMAN_POLICIES);
    for (const pol of LANDING_HUMAN_POLICIES) {
      expect(landingInvariantMisses(run.cell(pol, 0), run.setup), pol).toEqual([]);
      for (const r of run.trials(pol, 0)) {
        expect(r.kind.length).toBe(3);
        expect(r.maxSalvosPerPt).toBeLessThanOrEqual(1);
        expect(r.draws26).toBe(r.drawsWant);
      }
    }
  });
  it('中立の設定なら human は lure・human_face は face と同じ夜（人の乱れはほかの乱数の列を動かさない。ノーマル seed 1〜4・ハード seed 1〜2）', () => {
    for (const [s, seeds] of [[S, [1, 2, 3, 4]], [H, [1, 2]]] as const) {
      for (const seed of seeds) {
        expect(snap(runLandingTrial(s, 'human', seed, NEUTRAL)), `human ${seed}`).toBe(snap(runLandingTrial(s, 'lure', seed)));
        expect(snap(runLandingTrial(s, 'human_face', seed, NEUTRAL)), `human_face ${seed}`).toBe(snap(runLandingTrial(s, 'face', seed)));
      }
    }
  });
  it('較正の 12 は人の設定を読まない（極端な設定でも同じ夜。seed 1〜2）', () => {
    for (const pol of LANDING_CALIBRATION_POLICIES) {
      for (const seed of [1, 2]) expect(snap(runLandingTrial(S, pol, seed, EXTREME)), `${pol} ${seed}`).toBe(snap(runLandingTrial(S, pol, seed)));
    }
  });
  it('規則が効く（seed 1〜8）: 射撃ボタンを押せなければ 25mm を撃たない・報告に 8 秒遅れれば lure より遅く見つかり、報告を見なければ寄らない（見つかるのは撃った後）・赤い線をかわさない夜は lure と違う', () => {
    for (const seed of SEEDS) {
      const lure = runLandingTrial(S, 'lure', seed);
      expect(lure.gunShots, `${seed}`).toBeGreaterThan(0);
      expect(runLandingTrial(S, 'human', seed, { ...NEUTRAL, gunOnS: 0 }).gunShots, `${seed}`).toBe(0);
      expect(runLandingTrial(S, 'human', seed, { ...NEUTRAL, delayMinS: 8, delayMaxS: 8 }).detectS, `${seed}`).toBeGreaterThan(lure.detectS);
      // 報告を見なければ自分からは寄らない: 見つからないか、lure より遅い（v0.6.10 実機 1 回目から撃っても去らない PT が哨戒を続け、止まった自艇に後で行き当たる夜がある。前は NaN だけ）
      const blind = runLandingTrial(S, 'human', seed, { ...NEUTRAL, delayMinS: 1000, delayMaxS: 1000 });
      expect(Number.isNaN(blind.detectS) || blind.detectS > lure.detectS, `${seed} ${blind.detectS}`).toBe(true);
      expect(blind.kind.every((k) => k === 1), `${seed}`).toBe(true); // 斉射は気づかれていない斉射だけ（見つかるのは撃った後）
      expect(snap(runLandingTrial(S, 'human', seed, { ...NEUTRAL, dodgeP: 0 })), `${seed}`).not.toBe(snap(lure));
    }
  });
  it('既定の設定の human・human_face と face は、lure・face・lure と違う夜になる（seed 1〜4）', () => {
    for (const seed of [1, 2, 3, 4]) {
      const [lure, face] = [runLandingTrial(S, 'lure', seed), runLandingTrial(S, 'face', seed)];
      expect(snap(face), `${seed}`).not.toBe(snap(lure));
      expect(snap(runLandingTrial(S, 'human', seed)), `${seed}`).not.toBe(snap(lure));
      expect(snap(runLandingTrial(S, 'human_face', seed)), `${seed}`).not.toBe(snap(face));
    }
  });
});

describe('斉射の数えと R2 の分布は較正の 12 だけ', () => {
  it('人に近い 3 つを足しても、斉射の数え・期待値の分布・較正の 12 の表の数は同じ（seed 1〜4）', () => {
    const all = landingCalibrationRun(gameData, 'jp_04', LANDING_POLICIES, 4, 1, 1);
    const cal = landingCalibrationRun(gameData, 'jp_04', LANDING_CALIBRATION_POLICIES, 4, 1, 1);
    expect(all.salvoPolicies).toEqual(LANDING_CALIBRATION_POLICIES);
    expect(cal.salvoPolicies).toEqual(LANDING_CALIBRATION_POLICIES);
    expect(all.salvo(0)).toEqual(cal.salvo(0));
    expect(all.pooledSalvo).toEqual(cal.pooledSalvo);
    for (const pol of LANDING_CALIBRATION_POLICIES) expect(all.cell(pol, 0), pol).toEqual(cal.cell(pol, 0));
    for (const pol of LANDING_HUMAN_POLICIES) expect(all.cell(pol, 0).trials, pol).toBe(4);
  });
});
