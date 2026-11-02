// 模擬（core/landing-sim）の味方の駆逐艦 卯月（v0.6.10 S3a。spec-v0610 §6.1・§8 の G6・リードの決定 LD9・LD11）: 設定（world-setup の allyDestroyer のまま・allyOff は鍵ごと無い）、
// 卯月を切った夜（ALLY_OFF=1）は鍵を消した設定の夜と同じで卯月の欄はみな 0、I7〜I11（seed 1〜40・15 の遊び方・ノーマルとハード）、I9（卯月の効かない遊び方は同じ seed の
// 卯月の無い夜と記録が同じ・撃たない・照らさない）、結末と数えが合う（撃たずに去らせた・照らされた斉射）、卯月の船体の下を通る魚雷の数え方（表だけ）、I9 の比べ方、
// scripts の ALLY_OFF は見出しに出さない（LD9）。N 400 × 2 組の表と md5 は CHANGELOG v0.6.10 S3a（帯は S0b のまま。卯月のいる帯は S4）。
// v0.6.10 S3b: 卯月の欄に PT ごとの卯月の砲の結末と帰投の輪の呼びかけの秒（呼びかけの規則は tests/landing-sim-call）。卯月を切った夜はどの欄も作ったときのまま。
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { runLandingTrial, type LandingSimSetup } from '../src/core/landing-sim';
import { LANDING_POLICIES } from '../src/core/landing-sim-policy';
import { LANDING_TRIAL_ALLY_KEYS, LandingTrialTorpedoes, createLandingTrial, landingTrialBase } from '../src/core/landing-trial';
import { OUT_LIT_AWAY, OUT_LIT_HURRIED, PT_SALVO_CALM } from '../src/core/pt-torpedo';
import { LANDING_I9_POLICIES, landingCalibrationRun, landingInvariantMisses, landingSimSetup, type LandingRun } from '../src/systems/landing-sim-setup';
import { buildWorldSetup } from '../src/systems/world-setup';
import { LP, P, TP, bench } from './landing-kit';

const ON = landingSimSetup(gameData, 'jp_04');
const OFF = landingSimSetup(gameData, 'jp_04', { allyOff: true });
const SEEDS = 40;
/** 1 つの it の上限（seed 1〜40 × 15 の遊び方が 10 秒ほど。CI は遅いことがある） */
const SIM_TIMEOUT_MS = 120_000;
/** 1 夜の記録の文字列（型付き配列は中身の配列に。tests/landing-sim と同じ） */
const snap = (r: object): string => JSON.stringify(r, (_k, v: unknown) => (ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v));
const runs = new Map<boolean, LandingRun>();
const runOf = (hard: boolean): LandingRun => runs.get(hard) ?? runs.set(hard, landingCalibrationRun(gameData, 'jp_04', LANDING_POLICIES, SEEDS, 1, 1, { hard })).get(hard)!;

describe('組み立て', () => {
  it.each([false, true])('ハード %s: 卯月は world-setup の allyDestroyer のまま、allyOff は鍵ごと無く、ほかの値は同じ', (hard) => {
    const on = hard ? landingSimSetup(gameData, 'jp_04', { hard }) : ON;
    const off = hard ? landingSimSetup(gameData, 'jp_04', { hard, allyOff: true }) : OFF;
    expect(on.allyDestroyer).toEqual(buildWorldSetup(gameData, 'jp_04', { hard }).allyDestroyer);
    expect([on.allyDestroyer?.x, on.allyDestroyer?.y, on.allyDestroyer?.lookSlowM]).toEqual([3620, 2380, 350]);
    expect('allyDestroyer' in off).toBe(false);
    const { allyDestroyer: _a, ...rest } = on;
    expect(rest).toEqual(off);
  });
});

describe('卯月を切った夜（ALLY_OFF=1・LD9）', () => {
  it.each(LANDING_POLICIES)('%s: 鍵を消した設定の夜と同じ（配列の中身まで）で、卯月の欄はみな作ったときのまま（数は 0・秒は NaN・I11 も）', (pol) => {
    const bare: LandingSimSetup = { ...ON };
    delete bare.allyDestroyer;
    const fresh = snap(Object.fromEntries(LANDING_TRIAL_ALLY_KEYS.map((k) => [k, createLandingTrial(OFF.pt.count)[k]])));
    for (let seed = 1; seed <= 3; seed++) {
      const r = runLandingTrial(OFF, pol, seed);
      expect(snap(r)).toBe(snap(runLandingTrial(bare, pol, seed)));
      expect(snap(Object.fromEntries(LANDING_TRIAL_ALLY_KEYS.map((k) => [k, r[k]]))), `${pol} ${seed}`).toBe(fresh);
    }
    expect(fresh).toContain('"ownerViol":0');
  });
  it('scripts/landing-sim は ALLY_OFF を上書きの o の外で読む（見出しの set に出さない＝表のバイトが S0b と同じ。レビュー M5）', () => {
    const src = readFileSync(new URL('../scripts/landing-sim.ts', import.meta.url), 'utf8');
    expect(src).toContain("const allyOff = process.env['ALLY_OFF'] === '1';");
    expect(src).toContain('landingCalibrationRun(gameData, mission, pols, n, seed, blocks, allyOff ? { ...o, allyOff: true } : o)');
    const o = src.slice(src.indexOf('const o: LandingSimOverrides = {'), src.indexOf('};', src.indexOf('const o: LandingSimOverrides = {')));
    expect(o.length).toBeGreaterThan(100);
    expect(o).not.toContain('allyOff');
    expect(src).toContain("const set = Object.entries(o).filter(([, v]) => v !== undefined)");
  });
});

describe(`卯月のいる夜の不変（seed 1〜${SEEDS}・15 の遊び方）`, () => {
  it.each([false, true])('ハード %s: I1〜I6 と I7（seed+27 = 候補のステップ）・I8（照らされた斉射の条件）・I10（seed+28 = 2 × 弾 + 命中）・I11（owner は航過）', (hard) => {
    const run = runOf(hard);
    expect(run.setup.allyDestroyer).toBeDefined();
    const miss = LANDING_POLICIES.flatMap((pol) => landingInvariantMisses(run.cell(pol, 0), run.setup).map((m) => `${pol}: ${m}`));
    expect(miss).toEqual([]);
  }, SIM_TIMEOUT_MS);
  it.each([false, true])('ハード %s: 卯月は働く（照らす・撃たずに去らせる・撃つ・当てる夜がある）、結末の数え（OUT_LIT_AWAY = litAways・OUT_LIT_HURRIED = litSalvos）、1 隻に 1 回だけ反応', (hard) => {
    const run = runOf(hard);
    const tot = { lit: 0, away: 0, shells: 0, hits: 0, cand: 0 };
    for (const pol of LANDING_POLICIES) {
      for (const r of run.trials(pol, 0)) {
        const outs = Array.from(r.outcome);
        expect(outs.filter((x) => x === OUT_LIT_AWAY).length, pol).toBe(r.litAways);
        expect(outs.filter((x) => x === OUT_LIT_HURRIED).length, pol).toBe(r.litSalvos);
        expect(r.litAways + r.litSalvos, pol).toBeLessThanOrEqual(r.allyLitPts);
        expect(r.allyLitPts, pol).toBeLessThanOrEqual(r.allySpotted);
        expect(r.chaseShells, pol).toBeLessThanOrEqual(r.allyShells);
        expect(r.allyRetired + r.allySunk, pol).toBeLessThanOrEqual(r.ptRetired + r.ptSunk);
        tot.lit += r.allyLitPts;
        tot.away += r.litAways;
        tot.shells += r.allyShells;
        tot.hits += r.allyHits;
        tot.cand += r.candSteps;
      }
    }
    for (const [k, v] of Object.entries(tot)) expect(v, k).toBeGreaterThan(0);
  }, SIM_TIMEOUT_MS);
  it.each([false, true])('ハード %s: 気づかれていない斉射の魚雷は卯月の船体の下を通らない（V-A4・V-A5。LD16: 0%）', (hard) => {
    const run = runOf(hard);
    let calm = 0;
    for (const pol of LANDING_POLICIES) {
      for (const r of run.trials(pol, 0)) {
        for (let i = 0; i < r.kind.length; i++) {
          if (r.kind[i] !== PT_SALVO_CALM) continue;
          calm++;
          expect(r.torpThroughAlly[i], `${pol} PT${i}`).toBe(0);
        }
      }
    }
    expect(calm).toBeGreaterThan(100);
  }, SIM_TIMEOUT_MS);
});

describe('I9（卯月の効かない遊び方: hide・circle_start・home_early）', () => {
  it.each([false, true])(`ハード %s: seed 1〜${SEEDS} の夜はどれも同じ seed の卯月の無い夜と記録が同じ（卯月の欄を除く）で、卯月は撃たず照らさない`, (hard) => {
    const run = runOf(hard);
    const off = landingSimSetup(gameData, 'jp_04', { hard, allyOff: true });
    expect(LANDING_I9_POLICIES).toEqual(['hide', 'circle_start', 'home_early']);
    for (const pol of LANDING_I9_POLICIES) {
      expect(run.i9Misses(pol, 0), pol).toBe(0);
      run.trials(pol, 0).forEach((r, k) => {
        expect([r.allyShells, r.allyLitPts, r.litSalvos, r.litAways], `${pol} ${k + 1}`).toEqual([0, 0, 0, 0]);
        expect(landingTrialBase(r), `${pol} ${k + 1}`).toBe(landingTrialBase(runLandingTrial(off, pol, k + 1)));
      });
    }
    // ほかの遊び方と卯月のいない表は数えない（0）
    expect(run.i9Misses('lure', 0)).toBe(0);
    expect(landingCalibrationRun(gameData, 'jp_04', ['hide'], 2, 1, 1, { hard, allyOff: true }).i9Misses('hide', 0)).toBe(0);
  }, SIM_TIMEOUT_MS);
  it('比べ方 landingTrialBase: 卯月の欄だけを除く（卯月の欄が違っても同じ・ほかの欄が違えば違う）', () => {
    const a = createLandingTrial(2);
    const b = createLandingTrial(2);
    b.allyShells = 5;
    b.draws28 = 10;
    b.torpThroughAlly[1] = 2;
    expect(landingTrialBase(a)).toBe(landingTrialBase(b));
    b.hits = 1;
    expect(landingTrialBase(a)).not.toBe(landingTrialBase(b));
    const c = createLandingTrial(2);
    c.kind[0] = 1;
    expect(landingTrialBase(a)).not.toBe(landingTrialBase(c));
    expect(LANDING_TRIAL_ALLY_KEYS.length).toBe(20);
    expect(LANDING_TRIAL_ALLY_KEYS.slice(15)).toEqual(['allyFate', 'ringCallS', 'ringCallHidden', 'ringShownS', 'ringObeyS']);
    for (const k of LANDING_TRIAL_ALLY_KEYS) expect(k in a, k).toBe(true);
  });
});

describe('卯月の船体の下を通る魚雷の数え方（LandingTrialTorpedoes.watchAlly。表だけ）', () => {
  it('発射の針路のまっすぐな道（前方）が卯月の中心から半長の内なら数え、後ろ・外・卯月のいない夜は数えない', () => {
    const count = (ally: [number, number] | null, h: number): number => {
      const b = bench();
      const out = createLandingTrial(P.count);
      const tor = new LandingTrialTorpedoes(b.ld, LP, b.st, TP.torpedo, P.count * TP.n, P.bounds, out);
      if (ally) tor.watchAlly(ally[0], ally[1], 51.35);
      tor.fire(0, 1000, 1000, h, false, false, 0, 900);
      return out.torpThroughAlly[0]!;
    };
    expect(count([1500, 1030], 90)).toBe(1); // 東へ。中心の 30 m 南を通る
    expect(count([1500, 1060], 90)).toBe(0); // 60 m（半長 51 m の外）
    expect(count([500, 1000], 90)).toBe(0); // 後ろ
    expect(count([1000, 400], 0)).toBe(1); // 北へ（y が減る向き）
    expect(count([1000, 1600], 0)).toBe(0);
    expect(count(null, 90)).toBe(0);
  });
});
