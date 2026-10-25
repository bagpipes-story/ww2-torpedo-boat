// Result の「達成」と「見つかった回数」（v0.6.7 S0 で systems/mission-telemetry の buildMissionResult から移した。式は v0.6.6 のまま。S5 で夜の哨戒機の任務を足した）。終了時に 1 回だけ呼ぶ。
// 世界は構造の型で読む（v0.6.7 レビュー data:D3。MissionWorld がそのまま満たす。mission-world を import すると Phaser と game-config の DOM がテストの node 型検査に入るため）。
import { convoyObjectiveDone, endCountsAsReturn, type MissionEndReason } from '../core/mission-flow';

/** 達成と見つかった回数が読む世界の部分 */
export interface ObjectiveWorld {
  readonly convoy: { readonly state: { readonly arrived: number }; readonly p: { readonly quota: number } } | null;
  readonly escort: { readonly state: { readonly sunk: boolean } } | null;
  readonly pts: object | null;
  readonly patrol: { readonly state: { readonly findsVisual: number } } | null;
  readonly enemy: { readonly objectiveDone: boolean };
  readonly detect: { readonly count: number };
}

/**
 * 達成: 輸送隊の任務（v0.6.4）は「帰投して上陸がノルマ以上」（決着しても沈めば達成でない＝帰投 700 > 沈没。呼びかけは mission-world の returnCallDone）、
 * 僚艇の任務（v0.4.4）は「帰投して僚艇が生きている」、米PT の任務（v0.6.3）と夜の哨戒機の任務（v0.6.7。jp_02。spec-v067 §C.5）は帰投。ほかは敵の側（駆逐艦の撃沈／大発のノルマ）
 */
export function objectiveDoneOf(reason: MissionEndReason, w: ObjectiveWorld): boolean {
  return w.convoy ? convoyObjectiveDone(reason, w.convoy.state.arrived, w.convoy.p.quota) : w.escort ? endCountsAsReturn(reason) && !w.escort.state.sunk : w.pts || w.patrol ? endCountsAsReturn(reason) : w.enemy.objectiveDone;
}

/**
 * 見つかった回数（駆逐艦の隊・米PT の隊。Result の「回避」の根拠。数えるのは destroyer-step・pt-squadron）。夜の哨戒機（v0.6.7）はレーダーの後の目の発見を足す
 * （最初のレーダーの発見は筋書きなので数えない。spec §C.5・D15。哨戒の無い任務は 0 を足す＝同じ値）
 */
export function detectionsOf(w: ObjectiveWorld): number {
  return w.detect.count + (w.patrol ? w.patrol.state.findsVisual : 0);
}
