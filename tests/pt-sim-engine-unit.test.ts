// 機関の不調の模擬のつなぎ（v0.6.5。core/pt-sim-engine。spec-v065 §F.1）の単体: 予告に従う台本（cool・cruise）の落とす時と戻す時・赤い線の間は落とさない、
// 不調の間の入力は世界と同じ engineInput、計測（1 段目から不調・回復から次の不調・最長の不調・線の最中の不調 0・不調の間と 1 秒以内の線・夜の終わり・不調の近くの沈没）、乱数 0 回。
// 機関の値は tests/engine-trouble-kit の固定の fixture（レビュー F6）。艇は jp_05 の T-14（静音の上限 14 kt・巡航）。
import { describe, expect, it, vi } from 'vitest';
import { gameData } from '../src/config/game-data';
import { FIXED_STEP_S } from '../src/config/step-config';
import type { BoatInput, SpeedStep } from '../src/core/boat-motion';
import { engineCap01 } from '../src/core/engine-trouble';
import {
  ENGINE_LINE_NEAR_S,
  ENGINE_SUNK_NEAR_S,
  createSimEngine,
  simEngineCommit,
  simEngineInput,
  simEngineOut,
  simEngineStep,
  simEngineWant,
  type PtEngineReact,
  type SimEngine,
} from '../src/core/pt-sim-engine';
import { PT_PLAY } from '../src/core/pt-sim-policy';
import { createPtTrial, type PtTrial } from '../src/core/pt-trial';
import { SeededRng } from '../src/core/rng';
import { ptSimSetup } from '../src/systems/pt-pass-sim-setup';
import { P } from './engine-trouble-kit';

const DT = FIXED_STEP_S;
const BOAT = ptSimSetup(gameData, 'jp_05').boat;

/** 模擬の 1 夜の機関だけ: ステップ i（1 始まり）の時刻 i × DT で simEngineStep を回す */
interface Sim { e: SimEngine; out: PtTrial; i: number }
const sim = (react: PtEngineReact = 'ignore'): Sim => ({ e: createSimEngine(P, react), out: createPtTrial(), i: 0 });
function run(x: Sim, n: number, band: SpeedStep, line = false, can = true): Sim {
  for (let k = 0; k < n; k++) {
    x.i++;
    simEngineStep(x.e, x.out, band, line, can, x.i * DT, DT);
  }
  return x;
}
const steps = (s: number): number => Math.round(s / DT);

describe('機関の不調の模擬のつなぎ（v0.6.5、core/pt-sim-engine）', () => {
  it('ignore は want を変えない。cool は 1 段目に入って coolDelayS 3 秒後から熱 0.4 を下回るまで静音の上限、cruise は巡航。赤い線の間は落とさない', () => {
    expect([PT_PLAY.coolDelayS, PT_PLAY.coolToHeat]).toEqual([3, 0.4]);
    const [silent, cruise] = [BOAT.silentMaxMps, BOAT.speedCruiseMps];
    const ign = run(sim('ignore'), steps(25), 'full');
    expect(simEngineWant(ign.e, Infinity, ign.i * DT, false, silent, cruise)).toBe(Infinity);
    const c = run(sim('cool'), steps(18) + 1, 'full'); // 18 秒で 1 段目（過熱）
    const warnAt = c.e.warnSinceS;
    expect(warnAt).toBeCloseTo(18, 1);
    expect(simEngineWant(c.e, Infinity, warnAt + 2.9, false, silent, cruise)).toBe(Infinity);
    expect(simEngineWant(c.e, Infinity, warnAt + 3, true, silent, cruise)).toBe(Infinity); // 線の間は落とさない（落とす気はもう決めた）
    expect(c.e.cooling).toBe(true);
    expect(simEngineWant(c.e, Infinity, warnAt + 3, false, silent, cruise)).toBe(silent);
    expect(simEngineWant(c.e, 3, warnAt + 3, false, silent, cruise)).toBe(3); // もっと遅い指令はそのまま
    // 静音で 0.4 を割るまで落とし続ける（1 段目を外れても）
    run(c, steps((c.e.st.heat - 0.45) * P.silentCoolS), 'silent');
    expect(c.e.st.heat).toBeLessThan(P.warnHeat);
    expect(simEngineWant(c.e, Infinity, c.i * DT, false, silent, cruise)).toBe(silent);
    run(c, steps(2), 'silent');
    expect(c.e.st.heat).toBeLessThan(PT_PLAY.coolToHeat);
    expect(simEngineWant(c.e, Infinity, c.i * DT, false, silent, cruise)).toBe(Infinity);
    expect(c.e.cooling).toBe(false);
    const r = run(sim('cruise'), steps(22), 'full');
    expect(simEngineWant(r.e, Infinity, r.i * DT, false, silent, cruise)).toBe(cruise);
  });

  it('不調の間の入力は世界と同じ engineInput: 不調でなければ元の input、不調なら静音の上限 / 今の全速まで（針路は写す）', () => {
    const input: BoatInput = { headingDeg: 123, speed01: 1 };
    const x = run(sim(), steps(29), 'full');
    expect(simEngineInput(x.e, input, BOAT)).toBe(input);
    run(x, steps(1) + 1, 'full');
    expect(x.e.st.limp).toBe(true);
    const got = simEngineInput(x.e, input, BOAT);
    expect(got).toBe(x.e.capInput);
    expect([got.headingDeg, got.speed01]).toEqual([123, engineCap01(BOAT)]);
    expect(input).toEqual({ headingDeg: 123, speed01: 1 }); // 元の input は書き換えない
  });

  it('計測: ずっと全速なら 30 秒で不調（1 段目から 12 秒）・8 秒で戻り・12 秒後にまた不調（回復から 12 秒）。赤い線の間は不調が始まらず線の最中の不調は 0', () => {
    const x = run(sim(), steps(30) + 2, 'full');
    expect(x.out.engWarned).toBe(true);
    expect(x.e.st.limps).toBe(1);
    expect(x.out.engMinLeadS).toBeCloseTo(12, 1);
    run(x, steps(8) + 2, 'full');
    expect(x.e.st.limp).toBe(false);
    expect(x.out.engMaxLimpS).toBeCloseTo(8, 6);
    run(x, steps(12) + 2, 'full');
    expect(x.e.st.limps).toBe(2);
    expect(x.out.engMinRecoverLeadS).toBeCloseTo(12, 1);
    // 赤い線がずっと出ている間は熱 1.0 で待つ（線の最中に始まった不調は 0）
    const y = run(sim(), steps(40), 'full', true);
    expect([y.e.st.limps, y.e.st.heat, y.out.engLimpsInLine]).toEqual([0, 1, 0]);
    run(y, 1, 'full', false);
    expect([y.e.st.limps, y.out.engLimpsInLine]).toEqual([1, 0]);
  });

  it('線の数え（onCommit）: 不調の間の線と、不調から 1 秒以内の線。不調でなければ数えない', () => {
    const x = run(sim(), steps(30) + 1, 'full');
    const t0 = x.e.st.limpStartS;
    simEngineCommit(x.e, x.out, t0 + 0.5);
    simEngineCommit(x.e, x.out, t0 + ENGINE_LINE_NEAR_S + 0.5);
    expect([x.out.engLinesInLimp, x.out.engLinesNearLimp, x.out.engLimpsInLine]).toEqual([2, 1, 0]);
    const y = run(sim(), steps(20), 'full');
    simEngineCommit(y.e, y.out, 20);
    expect([y.out.engLinesInLimp, y.out.engLinesNearLimp]).toEqual([0, 0]);
  });

  it('赤い線の最中に始まった不調（E1。レビュー fair-2・F1）は onCommit で数える: 不調が始まった同じステップに固めた線は、機関の段が米PT の段より先に回った回帰', () => {
    // 正しい順（米PT の段 → 機関）: 線を固めたステップは lineOn なので不調は始まらず、線は次のステップ以降の不調の間に来る＝数えない
    const ok = run(sim(), steps(30) + 1, 'full');
    simEngineCommit(ok.e, ok.out, ok.e.st.limpStartS + DT);
    expect(ok.out.engLimpsInLine).toBe(0);
    // 逆の順（機関 → 米PT の段）: このステップの線を見ずに不調が始まり、同じステップに線が固まる
    const bad = sim();
    for (let k = 0; k < steps(30); k++) {
      bad.i++;
      simEngineStep(bad.e, bad.out, 'full', false, true, bad.i * DT, DT); // 線はまだ見えない
    }
    expect(bad.e.st.limp).toBe(true);
    simEngineCommit(bad.e, bad.out, bad.i * DT); // 同じステップの onCommit
    expect(bad.out.engLimpsInLine).toBe(1);
    // simEngineStep は lineOn の線の最中を数えない（stepEngine の条件と同じ旗で、いつも 0 だった）
    const y = run(sim(), steps(40), 'full', true);
    expect([y.e.st.limps, y.out.engLimpsInLine]).toEqual([0, 0]);
  });

  it('夜の終わり: 不調の回数と秒の和、夜の終わりで切れた不調の長さ、不調の間か回復から 10 秒以内に沈んだ', () => {
    const x = run(sim(), steps(30) + 1 + steps(3), 'full'); // 不調の 3 秒目で夜が終わる
    simEngineOut(x.e, x.out, x.i * DT, true);
    expect([x.out.engLimps, x.out.engSunkNearLimp]).toEqual([1, true]);
    expect(x.out.engLimpS).toBeCloseTo(3, 1);
    expect(x.out.engMaxLimpS).toBeCloseTo(3, 1);
    const y = run(sim(), steps(30) + 1 + steps(8) + 1, 'full');
    run(y, steps(ENGINE_SUNK_NEAR_S) + 1, 'silent'); // 回復から 10 秒より後
    simEngineOut(y.e, y.out, y.i * DT, true);
    expect([y.out.engLimps, y.out.engSunkNearLimp]).toEqual([1, false]);
    const z = run(sim(), steps(10), 'full');
    simEngineOut(z.e, z.out, z.i * DT, true);
    expect([z.out.engLimps, z.out.engSunkNearLimp, z.out.engLimpS]).toEqual([0, false, 0]);
  });

  it('乱数を引かない（SeededRng.prototype.next 0 回）', () => {
    const spy = vi.spyOn(SeededRng.prototype, 'next');
    const x = run(sim('cool'), steps(60), 'full');
    simEngineWant(x.e, Infinity, x.i * DT, false, BOAT.silentMaxMps, BOAT.speedCruiseMps);
    simEngineCommit(x.e, x.out, x.i * DT);
    simEngineOut(x.e, x.out, x.i * DT, false);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
