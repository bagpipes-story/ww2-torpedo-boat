// 味方の駆逐艦 卯月（v0.6.10 S7。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v0610 part 2 の S7・リードの決定 LD8）の Result の 1 行と、自艇の砲の行から引く分。
// 材料は systems/ally-telemetry の allyResult（終わりに 1 回。LandingResult.ally）。Result を作るときに 1 回だけ組む（毎フレームの処理は無い）。Phaser も DOM を読む config も使わない
// （tests/ally-result が文と幅を確かめる）。卯月の無い夜（ほかの任務・?debug&noally）は行が無く、自艇の砲の行も前のまま。
import type { AllyResult } from './result-types';

/**
 * 本文の卯月の 1 行（20 px・KPI の色。揚陸の 3 行の下）: 「卯月: 照らした米PT 2 隻 ・ 撃たずに去らせた 1 ・ 命中 2/24 発 ・ 撃退 1 ・ 撃沈 0」。照らされた斉射・制圧は 1 以上のときだけ
 * （「照らされて撃った 1」「制圧 1」）、撃たなかった夜は「撃たなかった」（隼艇の行と同じ）。数は data の見張り・砲を合わせる根拠（CLAUDE.md §9。模擬の TABLE=4 と同じ数え）
 */
export function allyResultLineJa(a: AllyResult): string {
  const salvo = a.litSalvo > 0 ? ` ・ 照らされて撃った ${a.litSalvo}` : '';
  const supp = a.suppressions > 0 ? ` ・ 制圧 ${a.suppressions}` : '';
  const gun = a.shells === 0 ? '撃たなかった' : `命中 ${a.hits}/${a.shells} 発 ・ 撃退 ${a.retired} ・ 撃沈 ${a.sunk}${supp}`;
  return `${a.labelJa}: 照らした米PT ${a.lit} 隻 ・ 撃たずに去らせた ${a.litAway}${salvo} ・ ${gun}`;
}

/** 自艇の砲の行（ui/pt-lines の 4 行目）から引く卯月の分（隼艇の分と同じ引き方。卯月の無い夜は 0） */
export interface AllyGunShare {
  hits: number;
  suppressions: number;
  retired: number;
  sunk: number;
}

export const NO_ALLY_GUN_SHARE: AllyGunShare = { hits: 0, suppressions: 0, retired: 0, sunk: 0 };

/** 卯月の記録から自艇の砲の行で引く分（無ければ NO_ALLY_GUN_SHARE） */
export function allyGunShare(a: AllyResult | null | undefined): AllyGunShare {
  return a ? { hits: a.hits, suppressions: a.suppressions, retired: a.retired, sunk: a.sunk } : NO_ALLY_GUN_SHARE;
}
