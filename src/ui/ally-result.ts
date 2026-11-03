// 味方の駆逐艦 卯月（v0.6.10 S7。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v0610 part 2 の S7・リードの決定 LD8）の Result の 1 行と、自艇の砲の行から引く分。
// 材料は systems/ally-telemetry の allyResult（終わりに 1 回。LandingResult.ally）。Result を作るときに 1 回だけ組む（毎フレームの処理は無い）。Phaser も DOM を読む config も使わない
// （tests/ally-result が文と幅を確かめる）。卯月の無い夜（ほかの任務・?debug&noally）は行が無く、自艇の砲の行も前のまま。
import type { AllyResult } from './result-types';

/**
 * 本文の卯月の 1 行（20 px・KPI の色。揚陸の 3 行の下）: 「卯月: 照らした米PT 2 隻 ・ 撃たずに去らせた 1 ・ 命中 2/17 発 ・ 撃退 1 ・ 撃沈 0」。照らされた斉射・制圧は 1 以上のときだけ
 * （「照らされて撃った 1」「制圧 1」）、撃たなかった夜は「撃たなかった」（隼艇の行と同じ）。数は data の見張り・砲を合わせる根拠（CLAUDE.md §9。模擬の TABLE=4 と同じ数え）。
 * v0.6.10 F（レビュー docs-5）: 命中の分母は生きた PT へ撃った弾（撃った弾 − 去る PT を追って撃った弾＝core の chaseShells。追う弾は去る PT に当たらない＝S4）。S7 は全部の弾を分母にし、
 * 模擬の 1 夜は弾 7.7 のうち追い撃ち 5.4 で、照らして 1 秒で去った夜は「命中 0/10 発」と全部外したように読めた。追い撃ちの数を「（追い撃ち N）」で足すと、いちばん長い形が
 * 1,232 px を 150 px 超えるので出さない。飛んでいる間に生きた PT が割り込めば追って撃った弾も当たりうるので、分母は命中を下回らない。生きた PT へ 1 発も撃たなかった夜は「追い撃ち N 発」
 */
export function allyResultLineJa(a: AllyResult): string {
  const salvo = a.litSalvo > 0 ? ` ・ 照らされて撃った ${a.litSalvo}` : '';
  const supp = a.suppressions > 0 ? ` ・ 制圧 ${a.suppressions}` : '';
  const aimed = Math.max(a.shells - a.chase, a.hits);
  const shots = aimed === 0 ? `追い撃ち ${a.chase} 発` : `命中 ${a.hits}/${aimed} 発`;
  const gun = a.shells === 0 ? '撃たなかった' : `${shots} ・ 撃退 ${a.retired} ・ 撃沈 ${a.sunk}${supp}`;
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
