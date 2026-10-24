// 機関の不調の本体のテストの共通（v0.6.5。tests/engine-trouble・engine-trouble-rules・engine-hud・pt-sim-engine-unit）: 値は data を読まない固定の fixture
// （レビュー F6: spec §I.1 のつまみ＝data の値だけを変えたときに、つまみと関係の無い本体のテストが一斉に落ちない。jp_05 の data の値の pin は tests/engine-data）。
// 走らせ方: 1/60 秒（世界の固定ステップ・模擬の realDt）で stepEngine を回し、出来事が起きたステップを記録する。
import { FIXED_STEP_S } from '../src/config/step-config';
import type { SpeedStep } from '../src/core/boat-motion';
import { createEngineState, stepEngine, type EngineParams, type EngineState } from '../src/core/engine-trouble';

/** risk_events.json の engine_failure.params と同じ形の固定の値（v0.6.5 の data と同じ数。source はテスト用） */
export const ENGINE_RAW_FIXTURE = {
  full_to_limp_s: 30, reliability_ref: 0.7, cruise_cool_s: 30, silent_cool_s: 20, warn_heat: 0.6, final_warn_heat: 0.85, recover_heat: 0.6, warn_rearm_heat: 0.5, source: 'design (テスト)',
} as const;

/** 上の値を engine_reliability 0.7 の艇で組んだ EngineParams（全速 30 秒で不調・過熱 18 秒・限界 25.5 秒・不調 8 秒・回復の後の保ち 0.5） */
export const P: EngineParams = { fullToLimpS: 30, cruiseCoolS: 30, silentCoolS: 20, warnHeat: 0.6, finalWarnHeat: 0.85, recoverHeat: 0.6, warnRearmHeat: 0.5, startHeat: 0 };

export const DT = FIXED_STEP_S;
/** 秒 → ステップ数（1/60 秒刻み） */
export const steps = (s: number): number => Math.round(s / DT);

/** 走らせた記録: ステップの通し番号（1 始まり）と時刻 */
export interface Run {
  s: EngineState;
  p: EngineParams;
  i: number;
  /** [出来事が起きたステップ, 種類]（eventSeq が増えたステップ） */
  events: [number, number][];
}
export const start = (p: EngineParams = P): Run => ({ s: createEngineState(p), p, i: 0, events: [] });
/** n ステップ進める。line・can は各ステップの赤い線と canLimp */
export function run(r: Run, n: number, band: SpeedStep, line = false, can = true, dt = DT): Run {
  for (let k = 0; k < n; k++) {
    const seq = r.s.eventSeq;
    r.i++;
    stepEngine(r.s, r.p, band, line, can, dt, r.i * DT);
    if (r.s.eventSeq !== seq) r.events.push([r.i, r.s.lastEvent]);
  }
  return r;
}
/** 冷えた機関から全速で不調の直前（熱 1.0 の 1 ステップ前）まで */
export const nearLimp = (p: EngineParams = P): Run => run(start(p), steps(p.fullToLimpS) - 1, 'full');
