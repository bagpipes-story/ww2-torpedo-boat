// 迎撃の模擬の軽い組の道具（v0.8.0 S3c。tests/intercept-sim-b・-c が使う。テストのファイルではない＝vitest は走らせない）: 軽い組の seed と 7 つの遊び方の集計・落ちた帯の文。
// 軽い組の選び方は tests/intercept-sim-b の頭の注。
import { gameData } from '../src/config/game-data';
import { runInterceptTrial } from '../src/core/intercept-sim';
import { interceptCellOf, type InterceptCell } from '../src/core/intercept-sim-cell';
import { INTERCEPT_POLICIES, type InterceptPolicy } from '../src/core/intercept-sim-policy';
import { interceptNightSetup } from '../src/systems/intercept-sim-setup';

/** 軽い組の seed（50 × 2 組。800 夜の k = 3） */
export const INTERCEPT_LIGHT_SEEDS: readonly number[] = [...Array.from({ length: 50 }, (_, i) => 151 + i), ...Array.from({ length: 50 }, (_, i) => 1151 + i)];

/** ハードの軽い組を 2 本のファイルに分ける遊び方の組（1 本 30 秒の内。漂流 D は表にある行だけを見るので、2 本で 7 行を全部見る） */
export const INTERCEPT_LIGHT_HARD_A: readonly InterceptPolicy[] = ['radar_ambush', 'radar_twice', 'eye_only', 'idle_lane'];
export const INTERCEPT_LIGHT_HARD_B: readonly InterceptPolicy[] = ['radar_dodge', 'charge', 'home_after_inbound'];

/** 軽い組の遊び方の集計（ノーマルかハード。既定は 7 つ全部） */
export function interceptLightCells(hard: boolean, pols: readonly InterceptPolicy[] = INTERCEPT_POLICIES): Map<InterceptPolicy, InterceptCell> {
  const out = new Map<InterceptPolicy, InterceptCell>();
  const setups = INTERCEPT_LIGHT_SEEDS.map((seed) => interceptNightSetup(gameData, seed, hard));
  const objective = setups[0]!.objectiveSinks;
  for (const p of pols) out.set(p, interceptCellOf(setups.map((s, i) => runInterceptTrial(s, p, INTERCEPT_LIGHT_SEEDS[i]!)), objective));
  return out;
}

/** ✗ の帯の文 */
export const interceptFailed = (checks: readonly { id: string; text: string; ok: boolean }[]): string[] => checks.filter((x) => !x.ok).map((x) => `${x.id} ${x.text}`);
