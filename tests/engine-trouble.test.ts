// 機関の不調の本体（v0.6.5。core/engine-trouble。spec-v065 §C.1・§G.1）の熱と段: 帯ごとの熱の傾き・段の境と出来事（下から越えたときだけ数える）・
// 回復の後の過熱の段の保ち（warn_rearm_heat。レビュー fair-1: 不調の 14 kt から加速し直す間に熱が 0.6 を少し割っても、平常に戻らず過熱の出来事を出し直さない）・
// startHeat・engine_reliability の読み。値は tests/engine-trouble-kit の固定の fixture（data の値は tests/engine-data）。
// 赤い線・回数の上限・canLimp・入力の差し替え・乱数・テレメトリ（E1〜E8）は tests/engine-trouble-rules。
import { describe, expect, it } from 'vitest';
import { DEBUG_ENGINE_HOT_HEAT } from '../src/config/engine-config';
import type { SpeedStep } from '../src/core/boat-motion';
import {
  ENGINE_EV_FINAL,
  ENGINE_EV_LIMP,
  ENGINE_EV_NONE,
  ENGINE_EV_RECOVER,
  ENGINE_EV_WARN,
  ENGINE_FINAL,
  ENGINE_LIMP,
  ENGINE_OK,
  ENGINE_WARN,
  createEngineState,
  engineLimpLeftS,
  engineStageOf,
} from '../src/core/engine-trouble';
import { engineParamsFromData } from '../src/core/engine-trouble-data';
import { DT, ENGINE_RAW_FIXTURE, P, nearLimp, run, start, steps, type Run } from './engine-trouble-kit';

describe('熱の傾き（spec §C.1 の 1。fixture＝全速 30 秒・巡航 30 秒・静音以下 20 秒）', () => {
  it('fixture は data の検査（engineParamsFromData）を通る形で、engine_reliability 0.7 なら T = 30 秒。作ったときの状態（熱 0・平常・回復の後の保ちなし）', () => {
    expect(engineParamsFromData(ENGINE_RAW_FIXTURE, 0.7, 'テスト')).toEqual(P);
    const s = createEngineState(P);
    expect(s).toEqual({ heat: 0, prevHeat: 0, limp: false, afterLimp: false, stage: ENGINE_OK, warns: 0, finals: 0, limps: 0, limpS: 0, limpStartS: NaN, eventSeq: 0, lastEvent: ENGINE_EV_NONE });
  });
  it('全速: 30 秒でちょうど熱 1.0 で不調（1 ステップ前は 1.0 の手前で平常のまま不調でない）', () => {
    const r = nearLimp();
    expect(r.s.heat).toBeCloseTo(1 - DT / 30, 12);
    expect(r.s.limp).toBe(false);
    run(r, 1, 'full');
    expect(r.s.heat).toBe(1);
    expect(r.s.limp).toBe(true);
    expect(r.s.limpStartS).toBeCloseTo(30, 9);
  });
  it('巡航は 30 秒・静音と停止は 20 秒で熱 1 → 0（startHeat 1 から。0 の下へは行かない）', () => {
    for (const [band, sec] of [['cruise', 30], ['silent', 20], ['stop', 20]] as const) {
      const r = start({ ...P, startHeat: 1 });
      run(r, steps(sec) - 1, band);
      expect(r.s.heat, band).toBeCloseTo(DT / sec, 9);
      run(r, 1, band);
      expect(r.s.heat, band).toBeLessThan(1e-9);
      run(r, 60, band);
      expect(r.s.heat, band).toBe(0);
      expect(r.s.limps, band).toBe(0);
    }
  });
  it('不調の間は帯に関わらず静音の傾き（20 秒）: 熱 1.0 → 0.6 にちょうど 8 秒（全速の指令のままでも・巡航でも・停止でも）', () => {
    for (const band of ['full', 'cruise', 'silent', 'stop'] as const) {
      const r = run(nearLimp(), 1, 'full');
      expect(r.s.limp).toBe(true);
      run(r, steps(4), band);
      expect(r.s.heat, band).toBeCloseTo(0.8, 9);
      expect(engineLimpLeftS(r.s, P), band).toBeCloseTo(4, 9);
      run(r, steps(4) - 1, band);
      expect(r.s.limp, band).toBe(true);
      run(r, 1, band);
      expect(r.s.limp, band).toBe(false);
      expect(r.s.limpS, band).toBeCloseTo(8, 9);
    }
  });
});

describe('段の境と出来事・数え（spec §C.1 の 4・R10）', () => {
  it('冷えた機関から全速: 18 秒で過熱（1）・25.5 秒で限界（2）・30 秒で不調（3）・38 秒で回復（4）。段は 0 → 1 → 2 → 3 → 1', () => {
    const r = start();
    const stages: number[] = [];
    for (let k = 0; k < steps(38); k++) {
      run(r, 1, 'full');
      if (stages[stages.length - 1] !== r.s.stage) stages.push(r.s.stage);
    }
    expect(r.events).toEqual([[steps(18), ENGINE_EV_WARN], [steps(25.5), ENGINE_EV_FINAL], [steps(30), ENGINE_EV_LIMP], [steps(38), ENGINE_EV_RECOVER]]);
    expect(stages).toEqual([ENGINE_OK, ENGINE_WARN, ENGINE_FINAL, ENGINE_LIMP, ENGINE_WARN]);
    expect([r.s.warns, r.s.finals, r.s.limps, r.s.eventSeq, r.s.lastEvent]).toEqual([1, 1, 1, 4, ENGINE_EV_RECOVER]);
  });
  it('回復は熱をちょうど recover_heat（0.6）に置き、段は 3 → 1 で過熱の出来事も数えも出ない。帯が全速のままなら限界だけ数え（7.5 秒）、12 秒で次の不調（加速し直す帯は下の describe）', () => {
    const r = run(run(nearLimp(), 1, 'full'), steps(8), 'full');
    expect(r.s.limp).toBe(false);
    expect(r.s.heat).toBe(P.recoverHeat);
    expect([r.s.stage, r.s.afterLimp]).toEqual([ENGINE_WARN, true]);
    expect(r.s.warns).toBe(1);
    const at = r.i;
    r.events.length = 0;
    run(r, steps(12), 'full');
    expect(r.events).toEqual([[at + steps(7.5), ENGINE_EV_FINAL], [at + steps(12), ENGINE_EV_LIMP]]);
    expect([r.s.warns, r.s.finals, r.s.limps]).toEqual([1, 2, 2]);
  });
  it('過熱の数えは 0.6 を下から越えたときだけ: 0.6 の上で巡航と全速を行き来しても増えず、0.6 の下へ冷えてから越えれば増える', () => {
    const r = run(start(), steps(21), 'full'); // 熱 0.7
    expect(r.s.warns).toBe(1);
    for (let k = 0; k < 5; k++) run(run(r, steps(2), 'cruise'), steps(2), 'full');
    expect(r.s.warns).toBe(1);
    run(r, steps(5), 'cruise'); // 0.7 − 5/30 ≈ 0.533
    expect(r.s.stage).toBe(ENGINE_OK);
    run(r, steps(3), 'full'); // 0.633
    expect(r.s.warns).toBe(2);
    expect(r.s.lastEvent).toBe(ENGINE_EV_WARN);
    expect(r.s.finals).toBe(0);
  });
  it('engineStageOf: 不調なら 3、熱 ≥ 0.85 で 2、≥ 0.6 で 1、ほかは 0（境はちょうどの値で上の段）。回復の後（afterLimp）は熱 ≥ 0.5 で少なくとも 1', () => {
    expect([0, 0.5999, 0.6, 0.8499, 0.85, 1].map((h) => engineStageOf(h, false, P))).toEqual([0, 0, 1, 1, 2, 2]);
    expect(engineStageOf(0.6, true, P)).toBe(ENGINE_LIMP);
    expect([0.3, 0.4999, 0.5, 0.55, 0.5999, 0.6, 0.85].map((h) => engineStageOf(h, false, P, true))).toEqual([0, 0, 1, 1, 1, 1, 2]);
  });
  it('startHeat（?debug&enghot の 0.75）: 作ったときから段 1、最初のステップで過熱の出来事と数えが 1 回だけ（前の熱を 0 として持つ）。出発の 2 秒の停止で 0.6 を割らない', () => {
    const p = { ...P, startHeat: DEBUG_ENGINE_HOT_HEAT };
    const r = start(p);
    expect([r.s.heat, r.s.prevHeat, r.s.stage, r.s.warns]).toEqual([0.75, 0, ENGINE_WARN, 0]);
    run(r, 1, 'stop');
    expect([r.s.warns, r.s.finals, r.s.eventSeq, r.s.lastEvent]).toEqual([1, 0, 1, ENGINE_EV_WARN]);
    run(r, steps(2) - 1, 'stop');
    expect(r.s.heat).toBeCloseTo(0.65, 9);
    expect(r.s.eventSeq).toBe(1);
    run(r, steps(6), 'full'); // 0.85 に 6 秒
    expect(r.s.lastEvent).toBe(ENGINE_EV_FINAL);
    run(r, steps(4.5), 'full'); // 1.0 に 10.5 秒
    expect(r.s.limp).toBe(true);
    expect([r.s.warns, r.s.finals, r.s.limps]).toEqual([1, 1, 1]);
  });
  it('自艇の engine_reliability が 0.85 なら T = 60 秒（36 秒で過熱・60 秒で不調）', () => {
    const p85 = engineParamsFromData(ENGINE_RAW_FIXTURE, 0.85, 'テスト');
    expect(p85.fullToLimpS).toBeCloseTo(60, 9);
    const r = run(start(p85), steps(60) - 1, 'full');
    expect(r.events).toEqual([[steps(36), ENGINE_EV_WARN], [steps(51), ENGINE_EV_FINAL]]);
    expect(r.s.limp).toBe(false);
    run(r, 1, 'full');
    expect(r.s.limp).toBe(true);
  });
});

describe('回復の後の過熱の段の保ち（warn_rearm_heat 0.5。レビュー fair-1）', () => {
  /** n ステップ進め、その間の段の移り（同じ段が続けば 1 つ）と熱の最小を記録する */
  function watch(r: Run, n: number, band: SpeedStep, seen: { stages: number[]; minHeat: number }): void {
    for (let k = 0; k < n; k++) {
      run(r, 1, band);
      if (seen.stages[seen.stages.length - 1] !== r.s.stage) seen.stages.push(r.s.stage);
      if (r.s.heat < seen.minHeat) seen.minHeat = r.s.heat;
    }
  }
  /** 冷えた機関から全速で不調 → 不調の 8 秒は静音の帯（上限の 14 kt）で回復した直後 */
  const recovered = (): Run => run(run(nearLimp(), 1, 'full'), steps(8), 'silent');

  it('不調の 14 kt から加速し直す（帯が静音 1.5 秒 → 巡航 0.5 秒 → 全速。ゲームの帯）: 熱は 0.6 を割るが段は過熱のまま（平常に戻らない）、過熱の出来事も数えも出ず、次は限界 → 不調', () => {
    const r = recovered();
    expect([r.s.limp, r.s.heat, r.s.stage, r.s.afterLimp, r.s.warns]).toEqual([false, P.recoverHeat, ENGINE_WARN, true, 1]);
    const recAt = r.i;
    r.events.length = 0;
    const seen = { stages: [r.s.stage] as number[], minHeat: 1 };
    watch(r, steps(1.5), 'silent', seen);
    watch(r, steps(0.5), 'cruise', seen);
    expect(seen.minHeat).toBeLessThan(P.warnHeat); // 前はここで段が平常に戻り、全速で 0.6 を下から越えた所で過熱の出来事と数えが出直した
    expect(seen.minHeat).toBeGreaterThan(P.warnRearmHeat);
    expect(seen.stages).toEqual([ENGINE_WARN]);
    while (r.s.limps < 2) watch(r, 1, 'full', seen);
    expect(seen.stages).toEqual([ENGINE_WARN, ENGINE_FINAL, ENGINE_LIMP]);
    expect(r.events.map((e) => e[1])).toEqual([ENGINE_EV_FINAL, ENGINE_EV_LIMP]);
    expect([r.s.warns, r.s.finals, r.s.limps]).toEqual([1, 2, 2]);
    // 回復から次の不調まで ≥ 12 秒（(1 − recover_heat) × T。加速し直す間に冷えた分だけ長い＝E2 は保ちで変わらない）
    expect((r.events[1]![0] - recAt) * DT).toBeGreaterThan((1 - P.recoverHeat) * P.fullToLimpS);
  });
  it('回復の後に冷やし続ければ、熱が 0.5 を割ったステップで平常に戻り、その後に 0.6 を下から越えればまた過熱の出来事と数え', () => {
    const r = recovered();
    run(r, steps(2) - 1, 'silent'); // 0.6 − 119/1200 ≈ 0.501
    expect([r.s.stage, r.s.afterLimp]).toEqual([ENGINE_WARN, true]);
    run(r, 2, 'silent'); // 0.5 を割る
    expect([r.s.stage, r.s.afterLimp]).toEqual([ENGINE_OK, false]);
    r.events.length = 0;
    run(r, steps(4), 'full'); // ≈ 0.499 + 4/30 ≈ 0.632
    expect(r.events.map((e) => e[1])).toEqual([ENGINE_EV_WARN]);
    expect([r.s.stage, r.s.warns]).toEqual([ENGINE_WARN, 2]);
  });
  it('保ちの間に全速・巡航を行き来しても過熱は数えない（0.5 と 0.6 の間で上下しても出来事なし）。限界まで上がって 0.5 を割らずに冷えても過熱のまま', () => {
    const r = recovered();
    r.events.length = 0;
    for (let k = 0; k < 4; k++) run(run(r, steps(2), 'cruise'), steps(2), 'full'); // 0.6 ↔ 0.53 あたり
    expect(r.events).toEqual([]);
    run(r, steps(8), 'full'); // 限界へ
    expect(r.s.stage).toBe(ENGINE_FINAL);
    run(r, steps(9), 'cruise'); // 0.9 前後 → 0.6 の下（0.5 の上）
    expect(r.s.heat).toBeLessThan(P.warnHeat);
    expect(r.s.heat).toBeGreaterThan(P.warnRearmHeat);
    expect([r.s.stage, r.s.warns]).toEqual([ENGINE_WARN, 1]);
    expect(r.events.map((e) => e[1])).toEqual([ENGINE_EV_FINAL]);
  });
});
