// jp_01 のハード（v0.6.6「日本ハードモード⑤：隼艇」。米PT 3 隻・隼艇・3 隻とも上陸）の模擬の帯の検査の共通（spec-v066 §F.5。tests/convoy-sim-kit の写し）: N 200・seed 1〜200 の表を 1 ファイルに 1 回だけ回し、
// 行の回帰の帯・設計の行の帯・隼艇の沈没 ≤ 1%・不変を外れた項目を返す（systems/convoy-hard-calibration の convoyHardRegressionMisses）。対の帯（隼艇なし・ノーマルとの差）は相手の表も要るので
// scripts/convoy-sim の HARD=1 TABLE=2（N 400・seed 1 と 401 の 2 組）で見る（1 夜 25〜30 ms なので、N 400 の 3 つの表 × 2 組をテストで回すと 1 ファイル 20 秒に収まらない）。
// 9 行を HARD_FILES の 5 ファイルに分ける（4 コアの VM で 1 行 N 200 が vitest 9〜10 秒。短い夜の dash_home は 3 秒。1 ファイル 20 秒ほどまで）。
import { expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import type { ConvoyPolicy } from '../src/core/convoy-sim-policy';
import { CONVOY_HARD_CALIBRATION, convoyHardCalibrationRun, convoyHardRegressionMisses, type ConvoyHardRun } from '../src/systems/convoy-hard-calibration';

export const HARD_N = 200;
export const HARD_SEED = 1;

/** ファイルごとの行: a = HUD どおり・追うだけ（★★）、b = ユーザーの型・撃つだけで追う、c = 遠くから・寄って転舵だけ、d = 後ろで転舵だけ・見捨てる（短い夜）、e = 隠れる（★） */
export const HARD_FILES = {
  a: ['shield_full', 'follow_full'],
  b: ['shield_shoot', 'follow_shoot'],
  c: ['far_full', 'shield_dodge'],
  d: ['follow_dodge', 'dash_home'],
  e: ['none'],
} as const satisfies Record<string, readonly ConvoyPolicy[]>;

/** jp_01 のハードの表（N 200・seed 1〜200）。集計は初めて読んだときに回す（対の相手は読まない） */
export function hardRun(): ConvoyHardRun {
  return convoyHardCalibrationRun(gameData, 'jp_01', HARD_N, HARD_SEED);
}

/** 行の帯と不変を外れた項目（「遊び方: 項目」。空なら合格） */
export function hardMisses(run: ConvoyHardRun, policies: readonly ConvoyPolicy[]): string[] {
  return policies.flatMap((pol) => {
    const r = CONVOY_HARD_CALIBRATION.find((x) => x.policy === pol);
    return (r ? convoyHardRegressionMisses(r, run) : ['帯の行が無い']).map((m) => `${pol}: ${m}`);
  });
}

/** ファイルの帯の検査（1 つの it。表は初めて読む it で回すので 60 秒）: 帯と不変が空、extra で行ごとの見どころ。表を返す */
export function itHardBands(title: string, policies: readonly ConvoyPolicy[], extra?: (run: ConvoyHardRun) => void): ConvoyHardRun {
  const run = hardRun();
  it(title, () => {
    expect(hardMisses(run, policies)).toEqual([]);
    extra?.(run);
  }, 60_000);
  return run;
}
