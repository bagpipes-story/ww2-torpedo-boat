// 味方の大発を守る模擬の帯の検査の共通（v0.6.4。spec §F.4・§F.5。tests/pt-sim-kit の写し）: jp_01 の N 200・seed 1〜200 の表を 1 ファイルに 1 回だけ回し、遊び方の帯と不変を外れた項目を返す。
// 14 の遊び方のうち帯のある 12 行を SIM_FILES のファイルに分ける（1 夜が 170〜200 秒なので 1 行 N 200 で node 5 秒ほど・vitest はその 1.3 倍ほど。1 ファイル 2〜3 行で 13 秒ほどまで）。
// 対の帯（follow_shoot − follow_full・far_shoot − follow_shoot）の相手は同じファイルで回す（cell が同じ seed で遅延して回す。ファイルどうしで同じ行を回し直さない）。lead_shoot・shield_dodge は表（scripts）だけ。
import { expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import type { ConvoyPolicy } from '../src/core/convoy-sim-policy';
import { CONVOY_CALIBRATION, convoyCalibrationMisses, convoyCalibrationRun, type ConvoySimOverrides } from '../src/systems/convoy-sim-setup';

export const SIM_N = 200;
export const SIM_SEED = 1;

/**
 * ファイルごとの検査する行（相手の行は cell で同じファイルに回る）: a = 隠れる・HUD どおり（★）、b = 後ろに付いて撃って転舵（★）と撃つだけ（★。対）、c = 遠くから撃つだけ（対の相手 follow_shoot も回る）、
 * d = 遠くから撃って転舵・転舵だけ、e = 間に入るだけ・間に入って撃つだけ、f = 囮・見捨てる・付くだけ（短い夜）
 */
export const SIM_FILES = {
  a: ['none', 'shield_full'],
  b: ['follow_full', 'follow_shoot'],
  c: ['far_shoot'],
  d: ['far_full', 'follow_dodge'],
  e: ['shield', 'shield_shoot'],
  f: ['lead', 'dash_home', 'follow'],
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

/** ファイルの帯の検査（1 つの it。表は初めて読む it で回すので 60 秒）: 帯と不変（simMisses）が空、extra で行ごとの見どころ。表を返す（同じファイルの他の it が読む） */
export function itSimBands(title: string, policies: readonly ConvoyPolicy[], extra?: (run: SimRun) => void): SimRun {
  const run = simRun();
  it(title, () => {
    expect(simMisses(run, policies)).toEqual([]);
    extra?.(run);
  }, 60_000);
  return run;
}
