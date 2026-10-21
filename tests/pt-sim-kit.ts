// 米PT の模擬の帯の検査の共通（v0.6.3 実機 2 回目。spec r2 §H.2・§I.2）: N 200・seed 1〜200 の表を 1 ファイルに 1 回だけ回し、遊び方の帯（撃たない・撃つ）と不変を外れた項目を返す。
// 37 行を 8 つのファイルに分ける（1 ファイル 10 行まで・手元の vitest で 14 秒ほどまで）。撃つ行の対の帯（同じ seed の撃たない行）は相手を同じファイルで回す（ファイルどうしで同じ行を回し直さない）。
// 連射への反応の表は tests/pt-sim-react.test.ts。どのファイルが何を回すかは SIM_FILES（tests/pt-pass-sim.test.ts が 37 行を 1 回ずつ・対が同じファイルにあることを見る）。
import { expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import type { PtPolicy } from '../src/core/pt-sim-policy';
import { PT_GUN_CALIBRATION, ptGunCalibrationMisses } from '../src/systems/pt-gun-calibration';
import { PT_CALIBRATION, ptCalibrationMisses, ptCalibrationRun, type PtSimOverrides } from '../src/systems/pt-pass-sim-setup';

export const SIM_N = 200;
export const SIM_SEED = 1;

/**
 * ファイルごとの行（表の順ではなく、対の組でまとめた。vitest の変換で模擬は node の 2 倍ほど遅く、N 200 の 1 行が 1.4〜4.8 秒なので 1 ファイル 14 秒ほどまでに分けた）:
 * pass = 何もしない巡航・巡航の転舵とその撃ち返し・止まって撃ち合う、silent = 静音とその転舵・撃ち返し、rows = 対の無い撃たない行、edge = 夜明けまで止まる・縁へ逃げる・撃ち合う、
 * hold = 線の間かわし続ける（巡航・全速）と撃ち返し、react = 巡航で全速の転舵・反応 1.4 秒の線の間とその撃ち返し、late = 2 秒遅れの反応とその撃ち返し・全速で逃げて撃つ、
 * dark = 暗さに隠れる・HUD の 14 kt＋撃つ・ずっと全速で線の間
 */
export const SIM_FILES = {
  pass: ['cruise', 'shoot_cruise', 'turn_cruise', 'tc_shoot', 'stop_shoot'],
  silent: ['silent', 'silent_shoot', 'dodge_silent', 'turn_shoot'],
  rows: ['full', 'zigzag', 'turn_silent', 'turn_full', 'meet', 'flee_full', 'flee_dodge'],
  edge: ['stop_dawn', 'edge_flee', 'fight'],
  hold: ['hold_cruise', 'hold_shoot', 'hold_full', 'holdfull_shoot'],
  react: ['react_full', 'react_shoot', 'mid_full', 'midfull_shoot', 'fleedodge_shoot'],
  late: ['late_turn', 'late_shoot', 'late_full', 'latefull_shoot', 'flee_shoot'],
  dark: ['dark_stop', 'dark_shoot', 'slow_shoot', 'flee_hold'],
} as const satisfies Record<string, readonly PtPolicy[]>;

export type SimRun = ReturnType<typeof ptCalibrationRun>;

/** jp_05 の表（N 200・seed 1〜200。上書きは連射への反応の表だけ）。集計は初めて読んだときに回す */
export function simRun(o: PtSimOverrides = {}): SimRun {
  return ptCalibrationRun(gameData, 'jp_05', SIM_N, SIM_SEED, o);
}

/** 撃つ行が読む相手の遊び方（対の規則と対の帯） */
export function simPartners(policy: PtPolicy): PtPolicy[] {
  const g = PT_GUN_CALIBRATION.find((r) => r.policy === policy);
  return g ? [...(g.pair ? [g.pair[0]] : []), ...g.vs.map((v) => v[1])] : [];
}

/** 行の帯と不変を外れた項目（「遊び方: 項目」。空なら合格） */
export function simMisses(run: SimRun, policies: readonly PtPolicy[]): string[] {
  return policies.flatMap((pol) => {
    const g = PT_GUN_CALIBRATION.find((r) => r.policy === pol);
    const r = PT_CALIBRATION.find((x) => x.policy === pol);
    const miss = g ? ptGunCalibrationMisses(g, run.cell, run.setup) : r ? ptCalibrationMisses(r, run.cell(pol), run.setup) : ['帯の行が無い'];
    return miss.map((m) => `${pol}: ${m}`);
  });
}

/** ファイルの帯の検査（1 つの it。表は初めて読む it で回すので 60 秒）: 帯と不変（simMisses）が空、extra で行ごとの見どころ。表を返す（同じファイルの他の it が読む） */
export function itSimBands(title: string, policies: readonly PtPolicy[], extra?: (run: SimRun) => void): SimRun {
  const run = simRun();
  it(title, () => {
    expect(simMisses(run, policies)).toEqual([]);
    extra?.(run);
  }, 60_000);
  return run;
}
