// 救助の任務（v0.8.5 S4。us_07「D-Day・生存者救助」）の Result の文（spec-v0850 §8.3）: 見出しの理由の言い換え・本文の 4 行・状況の行の頭・救助の時間の行・得点の「（救助の後 ×0.9）」の語。
// 本文（ui/result-body の救助の枝。米PT の枝の代わり）:
//   1 行目（24 px）「生存者: フィッチへ 44 名 ・ 帰投で 3 名 ・ 砲撃で失った 2 名 ・ 他艦が拾った 11 名」（0 の句は出さない。沈めば「沈没で失った 12 名」、漂流・座礁は「乗せたまま」、
//     救助の時間の前に終われば「海に残った」、帰投なら「他艦に任せた」）
//   2 行目（20 px・KPI の色）「機雷: 見えた 6/24 ・ 触雷 0 ・ 砲台: 砲撃 24 発 ・ 命中 1」（data を合わせる根拠＝CLAUDE.md §9）
//   3 行目（20 px・KPI の色）「Sボート 2 隻: 航過 3 回 ・ 被弾 4 発 ・ フィッチの砲火で退いた 1 ・ 撃退 0 ・ 撃沈 0」
//   4 行目（20 px・KPI の色）「この朝、史実ではSボートはユタ沖に来ていない（ゲームの想定）」
// 見出し: 達成「救助成功」・未達で帰投「帰投（渡した N 名 ・ 40 名に届かず）」・S ボートに沈められた「Sボートの掃射で沈没」。触雷は今の REASON_LABEL の「触雷で沈没」
// （「任務終了 — 触雷で沈没」＝spec の「触雷 — 沈没」。頭の「任務終了 — 」が線を持つので 2 本にしない）。後ろの秒は「（救助の後 N 秒）」。Phaser・DOM を読まない。
import { PT_NAME_DEFAULT_JA } from '../config/pt-config';
import { RESCUE_SBOAT_ASSUMPTION_JA } from '../config/rescue-hud-config';
import { resultDawnSuffixS, resultHeadingJa } from './result-heading';
import type { DawnResult } from '../core/dawn-air';
import type { MissionEndReason } from '../core/mission-flow';
import type { RescueResult } from '../core/rescue-telemetry';
import type { PtResult } from './result-types';


/** 見出しの理由の言い換え（無ければ ''＝今の REASON_LABEL） */
export function rescueReasonJa(reason: MissionEndReason, r: RescueResult, objectiveDone: boolean, pt: PtResult | null): string {
  if (reason === 'returned' || reason === 'cleared') return objectiveDone ? '救助成功' : `帰投（渡した ${r.delivered} 名 ・ ${r.objective} 名に届かず）`;
  if (reason === 'pt_fire') return `${pt?.nameJa ?? PT_NAME_DEFAULT_JA}の掃射で沈没`;
  return '';
}

/** 見出しの 1 行（scenes/result-scene。救助の任務だけ）: 言い換えの理由と「（救助の後 N 秒）」・ハード・史実の尾 */
export function rescueHeadingJa(
  m: { readonly reason: MissionEndReason; readonly returned: boolean; readonly objectiveDone: boolean; readonly pt: PtResult | null; readonly dawn: DawnResult; readonly sortie: { readonly historical: boolean } },
  r: RescueResult,
  hard: boolean,
): string {
  return resultHeadingJa(m.reason, resultDawnSuffixS(m.returned, m.dawn), hard, m.sortie.historical, false, false, rescueReasonJa(m.reason, r, m.objectiveDone, m.pt));
}

/** 1 行目（生存者の行方）。returned は帰投と同じに数える終わり（救助の時間の前に帰れば、海に残った人は他艦に任せた＝史実でも他の駆逐艦が拾った） */
export function rescueSurvivorLineJa(r: RescueResult, returned = false): string {
  const parts = [`${r.fitchJa}へ ${r.delivered - r.deliveredAtReturn} 名`];
  if (r.deliveredAtReturn > 0) parts.push(`帰投で ${r.deliveredAtReturn} 名`);
  if (r.lostShell > 0) parts.push(`砲撃で失った ${r.lostShell} 名`);
  if (r.lostSunk > 0) parts.push(`沈没で失った ${r.lostSunk} 名`);
  if (r.aboard > 0) parts.push(`乗せたまま ${r.aboard} 名`);
  if (r.byOthers > 0) parts.push(`他艦が拾った ${r.byOthers} 名`);
  if (r.onWater > 0) parts.push(returned ? `他艦に任せた ${r.onWater} 名` : `海に残った ${r.onWater} 名`);
  return `生存者: ${parts.join(' ・ ')}`;
}

/** 2 行目（機雷と砲台） */
export const rescueHazardLineJa = (r: RescueResult): string => `機雷: 見えた ${r.minesSeen}/${r.minesPlaced} ・ 触雷 ${r.minesBlown} ・ 砲台: 砲撃 ${r.batteryShots} 発 ・ 命中 ${r.batteryHits}`;

/** 3 行目（S ボート。隊の記録が無ければ隻数と退いた数だけ） */
export function rescueSboatLineJa(r: RescueResult, pt: PtResult | null): string {
  const fight = pt ? `航過 ${pt.passes} 回 ・ 被弾 ${pt.hits} 発 ・ ` : '';
  return `${pt?.nameJa ?? PT_NAME_DEFAULT_JA} ${r.sboats} 隻: ${fight}${r.fitchJa}の砲火で退いた ${r.sboatRetreated} ・ 撃退 ${pt ? pt.retired : 0} ・ 撃沈 ${pt ? pt.sunk : 0}`;
}

/** 本文の 4 行（1 行目は 24 px、ほかは 20 px・KPI の色＝ui/result-body） */
export function rescueResultLines(r: RescueResult, pt: PtResult | null, returned = false): [string, string, string, string] {
  return [rescueSurvivorLineJa(r, returned), rescueHazardLineJa(r), rescueSboatLineJa(r, pt), RESCUE_SBOAT_ASSUMPTION_JA];
}

/** 状況の行の頭（米PT の任務の「米PT: 健在 2 隻」の代わり）: 「救助: 渡した 44/40 名」 */
export const rescueHeadJa = (r: RescueResult): string => `救助: 渡した ${r.delivered}/${r.objective} 名`;

/** 救助の時間の行（夜明けの行 ui/dawn-lines の dawnResultLine の代わり。無ければ null）: 前に帰投「救助の時間: 残り 59 秒で帰投」・後「救助の時間が終わって 20 秒 ・ 帰投」 */
export function rescueTimeLineJa(d: DawnResult, returned: boolean): string | null {
  if (!d.reached) return returned ? `救助の時間: 残り ${Math.ceil(d.timeLeftAtEndS)} 秒で帰投` : null;
  return `救助の時間が終わって ${Math.round(d.daylightS)} 秒${returned ? ' ・ 帰投' : ''}`;
}
