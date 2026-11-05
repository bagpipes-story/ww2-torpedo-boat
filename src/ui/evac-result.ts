// 空襲下の退避（v0.6.11 S6。jp_03。spec-v0611-r2 §10.3・§10.6）の Result の文: 本文の頭の 4 行（残存と達成・隠れ場所と隊ごと・編隊・記録）、夜明けの行の代わりの時の行と追撃の行、
// 得点の行の達成と残った艇の項、見出しの理由（ui/result-heading の evacReasonJa）。材料は core/evac-result（任務の終わりに 1 回）。jp_03 の文に「夜明け」は無い（H6）。
// 編隊の数は 1 回ごと（S3b の U7: 戻ってきた回も数える）なので、分母の語は「狙われた N 回」（来た「編隊」の数ではない）。Phaser も DOM を読む config も使わない（tests から型検査ごと読める）。
import { DAWN_AIR_ENEMY, type DawnResult } from '../core/dawn-air';
import { EVR_ENTERING, EVR_HAULING, EVR_HIDDEN, EVR_NONE, EVR_OUTSIDE, evacScoredBoats, type EvacResult } from '../core/evac-result';
import type { MissionEndReason } from '../core/mission-flow';

/** 時の行の追撃の転舵を出す数（ui/dawn-lines の夜明けの行と同じ 8 発） */
const EVAC_DODGE_SHOWN = 8;

/** 本文の 1 行目（24 px）: 「残存 8／18（史実 5） ・ 6 隻以上を残して隠れた」／「… ・ 未達（6 隻以上で達成）」／隠れずに終わった夜 */
export function evacHeadLineJa(e: EvacResult, achieved: boolean): string {
  const tail = achieved ? `${e.quota} 隻以上を残して隠れた` : e.survivors < e.quota ? `未達（${e.quota} 隻以上で達成）` : '未達（操作中の隊が隠れずに終わった）';
  return `残存 ${e.survivors}／${e.total}（史実 ${e.historical}） ・ ${tail}`;
}

/** 本文の 2 行目（20 px）: 終わりの時の残存の内訳と隊ごとの残存「壕 6 ・ 陰 2 ・ 外 0 ／ 沈没 10 ・ 隊ごと 3・2・0・1・2・0」 */
export function evacPlacesLineJa(e: EvacResult): string {
  return `壕 ${e.cave} ・ 陰 ${e.cover} ・ 外 ${e.outside} ／ 沈没 ${e.total - e.survivors} ・ 隊ごと ${e.byGroup.join('・')}`;
}

/** 本文の 3 行目（20 px）: 「見失わせた 3／狙われた 9 回（戻ってきた 2 回を含む） ・ 撃墜 1 機」（分母は隊を狙った回＝目標の無い編隊は数えない。r2 L1） */
export function evacFlightsLineJa(e: EvacResult): string {
  return `見失わせた ${e.lost}／狙われた ${e.aimed} 回（戻ってきた ${e.again} 回を含む） ・ 撃墜 ${e.downed} 機`;
}

/** 本文の 4 行目（20 px・KPI の色。data を合わせる根拠＝CLAUDE.md §9）: 爆撃に来た回・爆弾・艇への命中・切替・隊長艇の交代 */
export function evacRecordLineJa(e: EvacResult): string {
  return `爆撃 ${e.came} 回 ・ 爆弾 ${e.bombs} 発 ・ 艇に命中 ${e.boatHits} ・ 切替 ${e.switches} 回 ・ 隊長艇の交代 ${e.promotions}`;
}

/** 本文の頭の 4 行（ui/result-body の evac の枝） */
export function evacResultLines(e: EvacResult, achieved: boolean): [string, string, string, string] {
  return [evacHeadLineJa(e, achieved), evacPlacesLineJa(e), evacFlightsLineJa(e), evacRecordLineJa(e)];
}

/** 決着の時に外だった隊の、その後（帰投＝後で隠れた・漂流・沈没） */
function afterJa(reason: MissionEndReason, returned: boolean): string {
  return returned ? '後で隠れた' : reason === 'adrift' ? '隠れる前に燃料切れで漂流' : '隠れる前に沈没';
}

/**
 * 夜明けの行の代わりの時の行（spec §10.3。r2 L15）: 「空襲が去る時: 西の壕の中（第1隊） ・ 残存 8 で確定」／「…西の壕で上げている途中（第1隊）…」／
 * 「…屋我地の陰（東）に入っている途中…」／「空襲が去る時: 外（第3隊） ・ 残存 8 で確定 ・ 後で隠れた」／決着の前に終わった夜（18 隻すべてが沈んだ）
 */
export function evacTimeLineJa(e: EvacResult, d: DawnResult, reason: MissionEndReason, returned: boolean): string {
  if (e.settlePlace === EVR_NONE) return e.survivors === 0 ? `空襲が去る前に ${e.total} 隻すべてが沈んだ（残り ${Math.ceil(d.timeLeftAtEndS)} 秒）` : '空襲が去る時: 操作中の隊長艇が沈む途中';
  const sure = ` ・ 残存 ${e.settleSurvivors} で確定`;
  const g = e.settleGroupJa;
  if (e.settlePlace === EVR_HIDDEN) return `空襲が去る時: ${e.settleShelterJa}の中（${g}）${sure}`;
  if (e.settlePlace === EVR_HAULING) return `空襲が去る時: ${e.settleShelterJa}で上げている途中（${g}）${sure}`;
  if (e.settlePlace === EVR_ENTERING) return `空襲が去る時: ${e.settleShelterJa}に入っている途中（${g}）${sure}`;
  return `空襲が去る時: 外（${g}）${sure} ・ ${afterJa(reason, returned)}`;
}

/**
 * 時の行の次の追撃の行（外だった夜だけ。§2 の敵機 4 機＝d.strike。ui/dawn-lines の夜明けの行の空襲の集計と同じ数）: 「追撃: 1 波 ・ 爆弾 8 発 ・ 命中 0 ・ 転舵 0.6/— 秒」。
 * 時の行と分ける（1 行に並べると漂流まで回った夜の数で 1,232 px を超える）。来ない夜は ''（result-scene は出さない）
 */
export function evacStrikeLineJa(e: EvacResult, d: DawnResult): string {
  const k = d.air === DAWN_AIR_ENEMY ? d.strike : null;
  if (e.settlePlace !== EVR_OUTSIDE || !k) return '';
  const shown = k.dodgeS.slice(0, EVAC_DODGE_SHOWN);
  const dodge = shown.length > 0 ? ` ・ 転舵 ${shown.map((x) => (Number.isNaN(x) ? '—' : x.toFixed(1))).join('/')} 秒` : '';
  return `追撃: ${k.waves} 波 ・ 爆弾 ${k.bombs} 発 ・ 命中 ${k.hitsPlayer}${dodge}`;
}

/** Result の時の 2 行（result-scene が夜明けの行の代わりに出す。空の行は出さない） */
export function evacTimeLinesJa(e: EvacResult, d: DawnResult, reason: MissionEndReason, returned: boolean): [string, string] {
  return [evacTimeLineJa(e, d, reason, returned), evacStrikeLineJa(e, d)];
}

/** 得点の行の達成と残った艇の項（result-scene の objPart）: 「達成 300 ・ 残った艇 210（7 隻 × 30）」 */
export function evacScorePartJa(e: EvacResult, objective: number, deliveries: number, perBoat: number): string {
  return `達成 ${objective} ・ 残った艇 ${deliveries}（${evacScoredBoats(e)} 隻 × ${perBoat}）`;
}
