// 機関の不調の設計の帯（v0.6.5。spec-v065 §F.3 の T-E1・T-E4〜T-E7。systems/pt-engine-calibration）の検査の共通: N 400・seed 1〜400 の同じ seed で
// {不調なし（ENG_OFF）, ignore, cool, cruise} を 1 台本ずつ 1 回だけ回し、無視の代価（T-E4）・従う台本（T-E5・T-E6）・3 つの反応の不変（T-E1・T-E7。漂流は 3 つとも
// 不調なし ＋ 0.5 点まで）を 1 つの it で見る（設計の帯は閾値のまま N 400 で読む＝R8。±4 点で広げない）。
// レビュー N1・F4: 前は代価（a〜g）と従う台本（a2〜g2）を別のファイルにして ignore を 2 回回し（7 台本 × 400 夜の重複）、cool・cruise の漂流を ignore ＋ 0.5 点と比べていた
// （ignore ＝ 不調なし ＋ 0.5 点と重ねると 不調なし ＋ 1.0 点まで通った）。
// vitest の変換で模擬は node の 2 倍あまり遅い（1 夜 8〜13 ms）ので 1 台本 1 ファイル（tests/pt-sim-engine-a〜g。4 コアで 1 ファイル 14〜24 秒・a〜g の和 129 秒）。
// 縁へ逃げて止まる edge_flee（予告だけ・不調 0）の cool・cruise の不変は h（{不調なし, cool, cruise}。25 秒）。
// 回帰の帯・HUD どおり（T-E2）・ignore の不変は既定の表（tests/pt-sim-kit。N 200）で、不調の無い夜の同一（T-E3）は tests/pt-sim-engine-identity。
import { expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { runPtCell } from '../src/core/pt-sim-cell';
import type { PtPolicy } from '../src/core/pt-sim-policy';
import { ENGINE_CALIBRATION, engineDesignMisses, engineInvariantMisses } from '../src/systems/pt-engine-calibration';
import { ptSimSetup } from '../src/systems/pt-pass-sim-setup';

export const ENGINE_SIM_N = 400;
export const ENGINE_SIM_SEED = 1;
/** ファイルごとの台本（ENGINE_CALIBRATION の 7 行を 1 回ずつ＝a〜g。tests/pt-sim-engine-identity が確かめる） */
export const ENGINE_SIM_FILES = {
  a: 'full', b: 'turn_full', c: 'flee_full', d: 'flee_dodge', e: 'flee_hold', f: 'flee_shoot', g: 'fleedodge_shoot',
} as const satisfies Record<string, PtPolicy>;
/** 帯の 7 台本のほかで予告に届く台本（従う台本の不変だけを h で見る。予告 28〜29%・不調 0） */
export const ENGINE_SIM_EXTRA = { h: 'edge_flee' } as const satisfies Record<string, PtPolicy>;

/** jp_05 の 4 つの setup（不調なし・予告を無視・静音へ・巡航へ） */
export function engineSetups() {
  return {
    off: ptSimSetup(gameData, 'jp_05', { engineOff: true }),
    ignore: ptSimSetup(gameData, 'jp_05', { engineReact: 'ignore' }),
    cool: ptSimSetup(gameData, 'jp_05', { engineReact: 'cool' }),
    cruise: ptSimSetup(gameData, 'jp_05', { engineReact: 'cruise' }),
  };
}

const rowOf = (policy: PtPolicy) => ENGINE_CALIBRATION.find((x) => x.policy === policy)!;
const tag = (k: string, miss: string[]): string[] => miss.map((m) => `${k}: ${m}`);

/** 帯の 1 台本: 無視の代価（T-E4）・従う台本（T-E5・T-E6）・ignore／cool／cruise の不変（T-E1・T-E7。漂流は不調なしと比べる）。不調なしの表は機関の列を書かない */
export function itEngine(title: string, policy: PtPolicy): void {
  it(title, () => {
    const s = engineSetups();
    const cell = (x: (typeof s)['off']) => runPtCell(x, policy, ENGINE_SIM_N, ENGINE_SIM_SEED);
    const x = { off: cell(s.off), ignore: cell(s.ignore), cool: cell(s.cool), cruise: cell(s.cruise) };
    expect([
      ...engineDesignMisses(rowOf(policy), x),
      ...(['ignore', 'cool', 'cruise'] as const).flatMap((k) => tag(k, engineInvariantMisses(x[k], s.ignore, x.off))),
    ]).toEqual([]);
    expect([x.off.engWarnedPct, x.off.engLimpPct, x.off.engLimps]).toEqual([0, 0, 0]);
  }, 90_000);
}

/** 帯の無い台本の従う台本（cool・cruise）の不変だけ（T-E1・T-E7。漂流は不調なしと比べる） */
export function itEngineInvariants(title: string, policy: PtPolicy): void {
  it(title, () => {
    const s = engineSetups();
    const cell = (x: (typeof s)['off']) => runPtCell(x, policy, ENGINE_SIM_N, ENGINE_SIM_SEED);
    const off = cell(s.off);
    const [cool, cruise] = [cell(s.cool), cell(s.cruise)];
    expect([...tag('cool', engineInvariantMisses(cool, s.ignore, off)), ...tag('cruise', engineInvariantMisses(cruise, s.ignore, off))]).toEqual([]);
    expect([cool.engWarnedPct, cruise.engWarnedPct].every((v) => v > 0)).toBe(true); // 予告には届く（従う台本が動く）
  }, 90_000);
}
