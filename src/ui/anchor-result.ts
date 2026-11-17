// 止まった艦の任務（v0.8.1 S4。us_06）の Result の 1 行（spec-v0810 §3.7 D-O4、lead の L62・L63）: 駆逐艦の任務の行（ui/result-body の魚雷の枝）の後ろに 20 px・KPI の色で。
// 「卯月: 撃沈（動き出す前） ・ 止まった艦へ 3 本（命中 2・通算に入れない） ・ 岸を背に 48 秒」。動き出していれば「（動き出す前）」の代わりに「 ・ 出撃 85 秒に動き出した（雷跡）」、
// 沈めなければ「卯月: 健在」。止まった艦へ撃たなかった夜は魚雷の句を出さない。語は spec §11 の短い方（「止まった艦への魚雷」「通算の命中率に数えない」「岸を背にした」では、いちばん長い形が
// 20 px で論理幅 1280 の行の幅 1232 を越えて縮む＝tests/anchor-result）。材料は systems/anchor-result-part の anchorResultPart（終わりに 1 回）。
// 見出しの理由の言い換えもここ（ui/result-heading が読む）: 体当たりは止まった艦・輸送船・駆潜艇に自艇がぶつかっても同じ理由なので「敵艦と衝突した」。Phaser・DOM を読まない。
import { ANCHOR_REASON_ALARM, ANCHOR_REASON_DAWN, ANCHOR_REASON_HIT, ANCHOR_REASON_SEEN, ANCHOR_REASON_WAKE } from '../core/anchored-ship';
import { shortLabelJa } from '../core/briefing';
import type { MissionEndReason } from '../core/mission-flow';

/** Result の材料: 隊の先頭の艦（卯月）の名・撃沈・動き出した世界の秒（NaN は動き出さず）と気づいた理由・止まった艦への魚雷とその命中（不発を除く）・最寄りの艦に対して背に岸が効いた秒 */
export interface AnchorResult { nameJa: string; sunk: boolean; underwayS: number; reason: number; heldShots: number; heldHits: number; backdropS: number }

/** 気づいた理由の語（core/anchored-ship の ANCHOR_REASON_*） */
export const ANCHOR_REASON_JA: Readonly<Record<number, string>> = { [ANCHOR_REASON_SEEN]: '見つかった', [ANCHOR_REASON_WAKE]: '雷跡', [ANCHOR_REASON_HIT]: '被雷', [ANCHOR_REASON_ALARM]: '警報', [ANCHOR_REASON_DAWN]: '夜明け' };
/** 止まった艦の任務の見出しの理由の言い換え（ここに無い理由は ui/result-heading の REASON_LABEL のまま） */
export const ANCHOR_REASON_LABEL: Partial<Record<MissionEndReason, string>> = { rammed: '敵艦と衝突した' };

/** 艦の名（enemies.json の name_ja の最後の括弧の中の最後の「・」の後。「駆逐艦（睦月型・卯月）」→「卯月」。無ければ括弧の前） */
export function anchorShipNameJa(nameJa: string): string {
  const m = /（([^（）]*)）$/.exec(nameJa);
  const parts = m ? m[1]!.split('・') : [];
  return parts.length > 1 ? parts[parts.length - 1]! : shortLabelJa(nameJa);
}

export function anchorResultLineJa(a: AnchorResult): string {
  const moved = Number.isNaN(a.underwayS) ? '' : ` ・ 出撃 ${Math.round(a.underwayS)} 秒に動き出した（${ANCHOR_REASON_JA[a.reason] ?? '—'}）`;
  const held = a.heldShots > 0 ? ` ・ 止まった艦へ ${a.heldShots} 本（命中 ${a.heldHits}・通算に入れない）` : '';
  return `${a.nameJa}: ${a.sunk ? '撃沈' : '健在'}${moved || (a.sunk ? '（動き出す前）' : '')}${held} ・ 岸を背に ${Math.round(a.backdropS)} 秒`;
}
