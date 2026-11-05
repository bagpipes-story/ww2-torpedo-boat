// Result の「達成」と「見つかった回数」（v0.6.7 S0 で systems/mission-telemetry の buildMissionResult から移した。式は v0.6.6 のまま。S5 で夜の哨戒機の任務を、v0.6.9 S5a で揚陸の任務を、
// v0.6.11 S6 で空襲下の退避の任務を足した）。終了時に 1 回だけ呼ぶ。
// 世界は構造の型で読む（v0.6.7 レビュー data:D3。MissionWorld がそのまま満たす。mission-world を import すると Phaser と game-config の DOM がテストの node 型検査に入るため）。
import { LD_DONE } from '../core/landing';
import { evacSurvivors, type EvacSquadron } from '../core/evac-squadron';
import { convoyObjectiveDone, endCountsAsReturn, type MissionEndReason } from '../core/mission-flow';

/** 達成と見つかった回数が読む世界の部分 */
export interface ObjectiveWorld {
  /** 空襲下の退避（v0.6.11 S6。jp_03。systems/world-evac の WorldEvac）: 18 隻の隊と達成の隻数。無い任務は null か無し */
  readonly evac?: { readonly sq: EvacSquadron; readonly plan: { readonly raid: { readonly survivorQuota: number } } } | null;
  /** 停泊して揚陸する味方の輸送船（v0.6.9。jp_04。systems/world-landing。揚陸の段階 core/landing の LD_*）。無い任務は null */
  readonly landing: { readonly state: { readonly phase: number } } | null;
  readonly convoy: { readonly state: { readonly arrived: number }; readonly p: { readonly quota: number } } | null;
  readonly escort: { readonly state: { readonly sunk: boolean } } | null;
  readonly pts: object | null;
  readonly patrol: { readonly state: { readonly findsVisual: number } } | null;
  readonly enemy: { readonly objectiveDone: boolean };
  readonly detect: { readonly count: number };
}

/**
 * 達成: 空襲下の退避の任務（v0.6.11 S6。jp_03。spec-v0611-r2 §3.10・ユーザーの U6）は「帰投と同じに数える終わりで残存（座席の艇を含む 18 中）が survivor_quota（6）以上」
 * （決着の 240 秒に操作中の隊が隠れているか、その後に隠れ場所で止まって帰投。漂流・沈没は 6 隻残っても達成でない＝帰投 700 ＋ 達成 300 は隠れて帰る時だけ）。揚陸の任務（v0.6.9。jp_04。spec-v069 §4.8・D13）は「揚陸完了して帰投」（揚陸の後に沈んでも LD_DONE のまま＝達成。揚陸の前に輪で終われば達成でないが、R14 A5 から jp_04 は決着の前に輪へ入っても終わらない＝systems/mission-end の landingHold。米PT の隊の枝より先）、
 * 輸送隊の任務（v0.6.4）は「帰投して上陸がノルマ以上」（決着しても沈めば達成でない＝帰投 700 > 沈没。呼びかけは mission-world の returnCallDone）、
 * 僚艇の任務（v0.4.4）は「帰投して僚艇が生きている」、米PT の任務（v0.6.3）と夜の哨戒機の任務（v0.6.7。jp_02。spec-v067 §C.5）は帰投。ほかは敵の側（駆逐艦の撃沈／大発のノルマ）
 */
export function objectiveDoneOf(reason: MissionEndReason, w: ObjectiveWorld): boolean {
  if (w.evac) return endCountsAsReturn(reason) && evacSurvivors(w.evac.sq) >= w.evac.plan.raid.survivorQuota;
  if (w.landing) return endCountsAsReturn(reason) && w.landing.state.phase === LD_DONE;
  return w.convoy ? convoyObjectiveDone(reason, w.convoy.state.arrived, w.convoy.p.quota) : w.escort ? endCountsAsReturn(reason) && !w.escort.state.sunk : w.pts || w.patrol ? endCountsAsReturn(reason) : w.enemy.objectiveDone;
}

/**
 * 見つかった回数（駆逐艦の隊・米PT の隊。Result の「回避」の根拠。数えるのは destroyer-step・pt-squadron）。夜の哨戒機（v0.6.7）はレーダーの後の目の発見を足す
 * （最初のレーダーの発見は筋書きなので数えない。spec §C.5・D15。哨戒の無い任務は 0 を足す＝同じ値）
 */
export function detectionsOf(w: ObjectiveWorld): number {
  return w.detect.count + (w.patrol ? w.patrol.state.findsVisual : 0);
}
