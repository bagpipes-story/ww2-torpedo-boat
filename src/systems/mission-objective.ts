// Result の「達成」と「見つかった回数」（v0.6.7 S0 で systems/mission-telemetry の buildMissionResult から移した。式は v0.6.6 のまま）。終了時に 1 回だけ呼ぶ。
import { convoyObjectiveDone, endCountsAsReturn, type MissionEndReason } from '../core/mission-flow';
import type { MissionWorld } from './mission-world';

/**
 * 達成: 輸送隊の任務（v0.6.4）は「帰投して上陸がノルマ以上」（決着しても沈めば達成でない＝帰投 700 > 沈没。呼びかけは mission-world の returnCallDone）、
 * 僚艇の任務（v0.4.4）は「帰投して僚艇が生きている」、米PT の任務（v0.6.3）は帰投。ほかは敵の側（駆逐艦の撃沈／大発のノルマ）
 */
export function objectiveDoneOf(reason: MissionEndReason, w: MissionWorld): boolean {
  return w.convoy ? convoyObjectiveDone(reason, w.convoy.state.arrived, w.convoy.p.quota) : w.escort ? endCountsAsReturn(reason) && !w.escort.state.sunk : w.pts ? endCountsAsReturn(reason) : w.enemy.objectiveDone;
}

/** 見つかった回数（駆逐艦の隊・米PT の隊。Result の「回避」の根拠。数えるのは destroyer-step・pt-squadron） */
export function detectionsOf(w: MissionWorld): number {
  return w.detect.count;
}
