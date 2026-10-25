// 夜の哨戒機の模擬の回帰の帯（v0.6.7。spec-v067 §F.3・§F.4。tests/patrol-air-sim-kit）: HUD どおりの転舵の反応を決めた行（hud/0.35・hud＝0.5 秒・hud/0.7。帰投の向きへ戻す秒は 0.6〜1.4 秒の揺らぎ）。
// あわせて F11（spec C.6。転舵の反応で崖が無い）の 3 点: どれも沈没 ≤ 20%・隣との差 ≤ 10 点・遅いほど当たりやすい（0.05 刻みの掃きは scripts/patrol-air-sim.ts の TABLE=3）。
import { describe, expect, it } from 'vitest';
import { patrolSweepMisses } from '../src/systems/patrol-air-calibration';
import { regCell, regressionCases } from './patrol-air-sim-kit';

describe('夜の哨戒機の模擬（転舵の反応 0.35・0.5・0.7 秒）', () => {
  regressionCases(['hud/0.35', 'hud', 'hud/0.7']);
  it('F11 の 3 点（0.35 → 0.5 → 0.7 秒）: どれも ≤ 20%・隣との差 ≤ 10 点、遅いほど沈みやすい', () => {
    const sunk = ['hud/0.35', 'hud', 'hud/0.7'].map((p) => regCell(p).sunkPct);
    expect(patrolSweepMisses(sunk)).toEqual([]);
    expect(sunk[0]!).toBeLessThan(sunk[2]!);
  }, 15_000);
});
