// 機関の不調の設計の帯（v0.6.5。spec-v065 §F.3 の T-E1・T-E4〜T-E7。systems/pt-engine-calibration）の検査の共通: N 400・seed 1〜400 の同じ seed で、
// 無視の代価（T-E4）は {不調なし（ENG_OFF）, ignore}、従う台本（T-E5・T-E6）は {ignore, cool, cruise} を 1 台本ずつ回す（設計の帯は閾値のまま N 400 で読む＝R8。±4 点で広げない）。
// vitest の変換で模擬は node の 2 倍あまり遅い（1 夜 8〜13 ms）ので、1 台本を 2 つのファイルに分けた（tests/pt-sim-engine-a〜g が代価、a2〜g2 が従う台本。手元の vitest で 1 ファイル 16 秒ほどまで）。
// 回帰の帯・HUD どおり（T-E2）・ignore の不変は既定の表（tests/pt-sim-kit。N 200）で、不調の無い夜の同一（T-E3）は tests/pt-sim-engine-identity。
import { expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { runPtCell } from '../src/core/pt-sim-cell';
import type { PtPolicy } from '../src/core/pt-sim-policy';
import { ENGINE_ADRIFT_ADD, ENGINE_CALIBRATION, engineCostMisses, engineFollowMisses, engineInvariantMisses } from '../src/systems/pt-engine-calibration';
import { ptSimSetup } from '../src/systems/pt-pass-sim-setup';

export const ENGINE_SIM_N = 400;
export const ENGINE_SIM_SEED = 1;
/** ファイルごとの台本（ENGINE_CALIBRATION の 7 行を 1 回ずつ。tests/pt-sim-engine-identity が確かめる。代価の a〜g と従う a2〜g2 で同じ文字） */
export const ENGINE_SIM_FILES = {
  a: 'full', b: 'turn_full', c: 'flee_full', d: 'flee_dodge', e: 'flee_hold', f: 'flee_shoot', g: 'fleedodge_shoot',
} as const satisfies Record<string, PtPolicy>;

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

/** 無視の代価（T-E4）と ignore の不変（T-E1・T-E7。漂流は不調なしと比べる）。不調なしの表は機関の列を書かない */
export function itEngineCost(title: string, policy: PtPolicy): void {
  it(title, () => {
    const s = engineSetups();
    const [off, ignore] = [runPtCell(s.off, policy, ENGINE_SIM_N, ENGINE_SIM_SEED), runPtCell(s.ignore, policy, ENGINE_SIM_N, ENGINE_SIM_SEED)];
    expect([...engineCostMisses(rowOf(policy), { off, ignore }), ...tag('ignore', engineInvariantMisses(ignore, s.ignore, off))]).toEqual([]);
    expect([off.engWarnedPct, off.engLimpPct, off.engLimps]).toEqual([0, 0, 0]);
  }, 90_000);
}

/** 従う台本（T-E5・T-E6）と cool・cruise の不変（T-E1・T-E7。漂流は同じ seed の ignore ＋ 0.5 点まで＝ignore は代価のファイルで不調なし ＋ 0.5 点まで） */
export function itEngineFollow(title: string, policy: PtPolicy): void {
  it(title, () => {
    const s = engineSetups();
    const [ignore, cool, cruise] = [s.ignore, s.cool, s.cruise].map((x) => runPtCell(x, policy, ENGINE_SIM_N, ENGINE_SIM_SEED)) as [ReturnType<typeof runPtCell>, ReturnType<typeof runPtCell>, ReturnType<typeof runPtCell>];
    const drift = (k: string, v: number): string[] => (v <= ignore.adriftPct + ENGINE_ADRIFT_ADD ? [] : [`${k}: 漂流 ${v.toFixed(1)}%（ignore ${ignore.adriftPct.toFixed(1)} ＋ ${ENGINE_ADRIFT_ADD} 以下）`]);
    expect([
      ...engineFollowMisses(rowOf(policy), { ignore, cool, cruise }),
      ...tag('cool', engineInvariantMisses(cool, s.ignore)), ...tag('cruise', engineInvariantMisses(cruise, s.ignore)),
      ...drift('cool', cool.adriftPct), ...drift('cruise', cruise.adriftPct),
    ]).toEqual([]);
  }, 90_000);
}
