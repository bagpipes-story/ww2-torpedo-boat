// 夜の哨戒機の模擬（v0.6.7。core/patrol-air-sim*・systems/patrol-air-sim-setup・systems/patrol-air-calibration）の回帰の帯の共通の組み立て:
// tests/patrol-air-sim-a〜e が 1 ファイル 3 台本ずつ（vitest がファイルを並べて回す。1 ファイル 15 秒以内）、N 200・seed 1 で回帰の帯（沈没 % ± 4 点）・設計の行の帯・不変を検査する。
// 帯（N 400 × 2 組）と対の帯・掃きは scripts/patrol-air-sim.ts の TABLE=2・TABLE=3。帯を外したら値を動かす前に模擬が spec-v067 §F.1 どおりかを確かめる。
import { expect, it } from 'vitest';
import { gameData } from '../src/config/game-data';
import { runPatrolCell, type PatrolCell } from '../src/core/patrol-air-sim-cell';
import { parsePatrolPolicy } from '../src/core/patrol-air-sim-policy';
import { PATROL_CALIBRATION, patrolRegressionMisses } from '../src/systems/patrol-air-calibration';
import { patrolSimSetup } from '../src/systems/patrol-air-sim-setup';

export const REG_N = 200;
export const REG_SEED = 1;
export const SIM = patrolSimSetup(gameData);

/** 台本の N 200・seed 1 の表（同じファイルの中で 1 回だけ回す） */
const cells = new Map<string, PatrolCell>();
export function regCell(policy: string): PatrolCell {
  if (!cells.has(policy)) cells.set(policy, runPatrolCell(SIM, parsePatrolPolicy(policy), REG_N, REG_SEED));
  return cells.get(policy)!;
}

/** 台本ごとに 1 つの it: 回帰の帯・設計の行の帯・不変を外れた項目が無い */
export function regressionCases(policies: readonly string[]): void {
  for (const policy of policies) {
    const row = PATROL_CALIBRATION.find((r) => r.policy === policy);
    it(`${policy}: 回帰の帯（N ${REG_N}・seed ${REG_SEED} の沈没 ${row?.regPct ?? '?'}% ± 4 点）・設計の帯・不変`, () => {
      expect(row, `${policy} は PATROL_CALIBRATION に無い`).toBeDefined();
      expect(patrolRegressionMisses(row!, regCell(policy), SIM)).toEqual([]);
    }, 15_000);
  }
}
