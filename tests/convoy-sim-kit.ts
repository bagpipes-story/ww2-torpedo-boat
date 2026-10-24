// 味方の大発を守る模擬の帯の検査の共通（v0.6.4。spec §F.4・§F.5。tests/pt-sim-kit の写し）: jp_01 の N 200・seed 1〜200 の表を 1 ファイルに 1 回だけ回し、遊び方の帯と不変を外れた項目を返す。
// 14 の遊び方のうち帯のある 12 行を SIM_FILES のファイルに分ける（1 夜が 140〜200 秒なので 1 行 N 200 で vitest 7 秒ほど。1 ファイルは対の相手を含めて 2 行まで（短い夜の f は 3 行）で vitest の tests 15 秒ほど。
// v0.6.4 実機 1 回目に 4 コアの VM で 1 ファイルずつ測って a〜f 13〜15 秒・i 7〜8 秒、CI のランナーはこれより遅いことがある。shield_full の対の相手 shield_dodge が増えた a から none を i へ分けた（3 行で 22 秒だった））。
// 対の帯（follow_shoot − follow_full・far_shoot − follow_shoot・shield_full − shield_dodge）の相手は同じファイルで回す（cell が同じ seed で遅延して回す。ファイルどうしで同じ行を回し直さない）。lead_shoot・shield_dodge の行の帯は表（scripts）だけ。
import { expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import type { ConvoyPolicy } from '../src/core/convoy-sim-policy';
import { CONVOY_CALIBRATION, convoyCalibrationMisses, convoyCalibrationRun, type ConvoySimOverrides } from '../src/systems/convoy-sim-setup';

export const SIM_N = 200;
export const SIM_SEED = 1;

/**
 * ファイルごとの検査する行（相手の行は cell で同じファイルに回る）: a = HUD どおり（★。対の相手 shield_dodge も回る）、b = 後ろに付いて撃って転舵（★）と撃つだけ（★。対）、
 * c = 遠くから撃つだけ（対の相手 follow_shoot も回る）、d = 遠くから撃って転舵・転舵だけ、e = 間に入るだけ・間に入って撃つだけ、f = 囮・見捨てる・付くだけ（短い夜）、i = 隠れる（★）
 */
export const SIM_FILES = {
  a: ['shield_full'],
  b: ['follow_full', 'follow_shoot'],
  c: ['far_shoot'],
  d: ['far_full', 'follow_dodge'],
  e: ['shield', 'shield_shoot'],
  f: ['lead', 'dash_home', 'follow'],
  i: ['none'],
} as const satisfies Record<string, readonly ConvoyPolicy[]>;

export type SimRun = ReturnType<typeof convoyCalibrationRun>;

/** jp_01 の表（N 200・seed 1〜200）。集計は初めて読んだときに回す */
export function simRun(o: ConvoySimOverrides = {}): SimRun {
  return convoyCalibrationRun(gameData, 'jp_01', SIM_N, SIM_SEED, o);
}

/** 行が読む相手の遊び方（対の帯） */
export function simPartners(policy: ConvoyPolicy): ConvoyPolicy[] {
  const r = CONVOY_CALIBRATION.find((x) => x.policy === policy);
  return r ? r.vs.map((v) => v[1]) : [];
}

/** 行の帯と不変を外れた項目（「遊び方: 項目」。空なら合格） */
export function simMisses(run: SimRun, policies: readonly ConvoyPolicy[]): string[] {
  return policies.flatMap((pol) => {
    const r = CONVOY_CALIBRATION.find((x) => x.policy === pol);
    return (r ? convoyCalibrationMisses(r, run.cell, run.setup) : ['帯の行が無い']).map((m) => `${pol}: ${m}`);
  });
}

/** 不変を数でも（spec §F.4）: 予告から初弾 ≥ 2.5 秒・同時に撃つ攻撃 1・射程と視程（標的から）の外 0 発・大発への連射 0・打ち切り 0・夜明け後の決着 0・1 回の攻撃 ≤ 1 航過の発数（自艇は × 被害 < HP）・船団は見つかる */
export function expectSimInvariantCounts(run: SimRun, policies: readonly ConvoyPolicy[]): void {
  const p = run.setup.pt;
  for (const pol of policies) {
    const c = run.cell(pol);
    expect(c.minWarnS, pol).toBeGreaterThanOrEqual(p.openFireS - 1e-9);
    expect([c.maxPassing, c.beyond, c.burstsBarge, c.timeoutPct, c.resolvedAfterDawnPct], pol).toEqual([1, 0, 0, 0, 0]);
    expect([c.worstBarge <= p.roundsPerPass, c.worstPlayer <= p.roundsPerPass, c.worstPlayer * p.hit.damage < run.setup.damage.maxHp], pol).toEqual([true, true, true]);
    expect(c.detectedPct, pol).toBeGreaterThan(95); // 船団は見つかる（大発は隠せない）
  }
}

/** ファイルの帯の検査（1 つの it。表は初めて読む it で回すので 60 秒）: 帯と不変（simMisses）が空、extra で行ごとの見どころ。表を返す（同じファイルの他の it が読む） */
export function itSimBands(title: string, policies: readonly ConvoyPolicy[], extra?: (run: SimRun) => void): SimRun {
  const run = simRun();
  it(title, () => {
    expect(simMisses(run, policies)).toEqual([]);
    extra?.(run);
  }, 60_000);
  return run;
}
