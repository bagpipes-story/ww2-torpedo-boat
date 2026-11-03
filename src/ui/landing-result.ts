// 停泊して揚陸する味方の輸送船の任務（v0.6.9 S7。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v069 §5.7・R8/F11・R12）の Result の文: 本文の頭の 3 行（輸送船の結末・PT ごとの雷撃の記録・
// 米PT の魚雷の和）と、状況の行の頭「輸送船 揚陸完了 ・ 米PT: …」。材料は systems/landing-telemetry の landingResultPart（終わりに 1 回。mission-telemetry の buildMissionResult が広げる）。Result を作るときに 1 回だけ組む（毎フレームの処理は無い）。
// Phaser も DOM を読む config も使わない（tests/landing-result が文と幅を確かめる）。距離は 100 m 刻みの切り上げ（HUD の出来事と同じ。core/landing の LANDING_DIST_STEP_M）、% は切り捨て。
// v0.6.10 S7（味方の駆逐艦 卯月。卯月のいる夜だけ LandingResult.ally）: 雷撃の行に「900 m 照らされて 外れ」（照らされた斉射）・「卯月が照らして去らせた」・「卯月が撃退」「卯月が撃沈」（卯月の砲が結末を決めた PT）。
// 卯月の無い夜（ほかの任務・?debug&noally）は前の文のまま。
import { LANDING_DIST_STEP_M, LD_DONE, LD_SUNK } from '../core/landing';
import { OUT_CALM, OUT_DAWN, OUT_ENGAGED, OUT_GOAL_GONE, OUT_HURRIED, OUT_LEFT, OUT_LIT_AWAY, OUT_LIT_HURRIED, OUT_RETIRED, OUT_SUNK } from '../core/pt-torpedo';
import type { MissionEndReason } from '../core/mission-flow';
import { landingPct } from './landing-lines';
import type { LandingResult } from './result-types';

/** 決着の前（揚陸中のまま）に終わった終わり方（LandingResult.endKind）: 決着した・帰投（R14 A5 の後は輪の中で待つので来ない。念のため）・自艇が沈んだ・漂流・座礁 */
export const LR_END_NONE = 0;
export const LR_END_RETURNED = 1;
export const LR_END_SUNK = 2;
export const LR_END_ADRIFT = 3;
export const LR_END_GROUNDED = 4;

/** 終わりの理由から LR_END_*（決着していれば LR_END_NONE。landingResultPart が 1 回） */
export function landingEndKind(resolved: boolean, reason: MissionEndReason): number {
  if (resolved) return LR_END_NONE;
  if (reason === 'returned' || reason === 'cleared') return LR_END_RETURNED;
  if (reason === 'adrift') return LR_END_ADRIFT;
  if (reason === 'grounded') return LR_END_GROUNDED;
  return LR_END_SUNK;
}

const END_JA = ['', '揚陸の前に帰投', '自艇が沈んで任務が終わった', '自艇が漂流して任務が終わった', '自艇が座礁して任務が終わった'] as const;

/** 「被雷 1（不発 1）」・被雷も不発も無ければ「被雷なし」 */
function hitsJa(hits: number, duds: number): string {
  return hits === 0 && duds === 0 ? '被雷なし' : `被雷 ${hits}${duds > 0 ? `（不発 ${duds}）` : ''}`;
}

/** 1 行目（24 px・強調）: 「輸送船: 揚陸完了 ・ 被雷 1（不発 1）」「輸送船: 揚陸完了 ・ その後に撃沈」「輸送船: 揚陸 62% で撃沈」「輸送船: 揚陸 62% ・ 被雷 1 ・ 自艇が沈んで任務が終わった」 */
export function landingResultHeadLineJa(l: LandingResult): string {
  if (l.phase === LD_DONE) return `輸送船: 揚陸完了 ・ ${l.sunkAfterDone ? 'その後に撃沈' : hitsJa(l.hits, l.duds)}`;
  if (l.phase === LD_SUNK) return `輸送船: 揚陸 ${landingPct(l.pctAtSink)}% で撃沈`;
  return `輸送船: 揚陸 ${landingPct(l.pct)}% ・ ${l.hits > 0 || l.duds > 0 ? `${hitsJa(l.hits, l.duds)} ・ ` : ''}${END_JA[l.endKind] ?? END_JA[LR_END_SUNK]}`;
}

/** 斉射の距離（100 m 刻みの切り上げ） */
const distJa = (m: number): string => `${Math.ceil(m / LANDING_DIST_STEP_M) * LANDING_DIST_STEP_M} m`;

/**
 * PT 1 隻の雷撃の語（方角の後ろ）: 斉射は「900 m 命中 1」「1300 m 慌てて 外れ」「800 m 戦いながら 不発」（命中が無く不発だけ）「900 m 走行中」（終わりに走っていて当たっていない）、
 * 撃たなかった PT は「25mm で撃退」「25mm で撃沈」「引きつけて去らせた」「夜明けに去った」「輸送船が沈み去った」（R8/F11）「撃たせず」。
 * 卯月のいる夜（v0.6.10 S7）: 照らされた斉射は「900 m 照らされて 外れ」、照らされて撃たずに去った PT は「卯月が照らして去らせた」、卯月の砲が結末を決めた PT は「卯月が撃退」「卯月が撃沈」
 */
export function landingRunWordJa(l: LandingResult, i: number, gunLabel: string): string {
  const o = l.outcome[i]!;
  if (o === OUT_CALM || o === OUT_HURRIED || o === OUT_ENGAGED || o === OUT_LIT_HURRIED) {
    const how = o === OUT_HURRIED ? '慌てて ' : o === OUT_ENGAGED ? '戦いながら ' : o === OUT_LIT_HURRIED ? '照らされて ' : '';
    const h = l.salvoHits[i]!;
    const res = h > 0 ? `命中 ${h}` : l.salvoLeft[i]! > 0 ? '走行中' : l.salvoDuds[i]! > 0 ? '不発' : '外れ'; // 命中した斉射の不発は 3 行目の和（行を 1,232 px の内に）
    return `${distJa(l.launchM[i]!)} ${how}${res}`;
  }
  const al = l.ally;
  if (o === OUT_LIT_AWAY) return `${al ? al.labelJa : '味方'}が照らして去らせた`;
  if (al && al.byAlly[i] === true && (o === OUT_RETIRED || o === OUT_SUNK)) return `${al.labelJa}が${o === OUT_SUNK ? '撃沈' : '撃退'}`;
  const gun = gunLabel || '砲';
  if (o === OUT_RETIRED) return `${gun} で撃退`;
  if (o === OUT_SUNK) return `${gun} で撃沈`;
  if (o === OUT_LEFT) return '引きつけて去らせた';
  if (o === OUT_DAWN) return '夜明けに去った';
  if (o === OUT_GOAL_GONE) return '輸送船が沈み去った';
  return '撃たせず';
}

/** 2 行目（20 px・KPI の色）: 「雷撃: 北 900 m 外れ ／ 東 1300 m 慌てて 命中 1 ／ 北東 25mm で撃退」（線の順） */
export function landingRunLogJa(l: LandingResult, gunLabel: string): string {
  const parts: string[] = [];
  for (let i = 0; i < l.outcome.length; i++) parts.push(`${l.dirJa[i] ?? ''} ${landingRunWordJa(l, i, gunLabel)}`);
  return `雷撃: ${parts.join(' ／ ')}`;
}

/** 3 行目（20 px・KPI の色）: 「米PT の魚雷 9 本 ・ 命中 2（不発 1） ・ 慌てて撃った 6 本 ・ 戦いながら撃った 3 本」か「米PT に一度も魚雷を撃たせなかった」 */
export function landingTorpedoTotalsJa(l: LandingResult): string {
  if (l.fired === 0) return '米PT に一度も魚雷を撃たせなかった';
  const hurried = l.hurriedFired > 0 ? ` ・ 慌てて撃った ${l.hurriedFired} 本` : '';
  const engaged = l.engagedFired > 0 ? ` ・ 戦いながら撃った ${l.engagedFired} 本` : '';
  return `米PT の魚雷 ${l.fired} 本 ・ 命中 ${l.hits}${l.duds > 0 ? `（不発 ${l.duds}）` : ''}${hurried}${engaged}`;
}

/** 本文の頭の 3 行（ui/result-body が米PT の行の前に出す）。gunLabel は自艇の砲の名の頭（PtResult.gunLabel。jp_04 の T-38 は「25mm」） */
export function landingResultLines(l: LandingResult, gunLabel: string): [string, string, string] {
  return [landingResultHeadLineJa(l), landingRunLogJa(l, gunLabel), landingTorpedoTotalsJa(l)];
}

/** 状況の行の頭: 「輸送船 揚陸完了 ・ 米PT: 撃退 1 ・ 健在 1 隻」（ptHead は ui/pt-lines の ptHeadJa）。揚陸の後に沈めば「揚陸完了（沈没）」、揚陸の前に沈めば「沈没」、決着の前に終われば「揚陸 62%」 */
export function landingHeadJa(l: LandingResult, ptHead: string): string {
  const s = l.phase === LD_DONE ? (l.sunkAfterDone ? '揚陸完了（沈没）' : '揚陸完了') : l.phase === LD_SUNK ? '沈没' : `揚陸 ${landingPct(l.pct)}%`;
  return `輸送船 ${s} ・ ${ptHead}`;
}
