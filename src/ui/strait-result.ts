// Result の列の通過の 1 行（v0.8.0 S4。spec-v0800 §4.9）: 「東京急行: 往路 3 隻 → 復路 2 隻（撃沈 1・ビラに残った 0）」。
// 材料（StraitResult）は systems/strait-result-part が列の通過の段階の数（core/ship-transit）から終わりに 1 回作る: 往路に現れた・復路に現れた・列の撃沈（往路でも復路でも。護衛は数えない＝
// 駆逐艦の行が言う）・終わった時に揚陸の地にいた（夜明けで戻らない艦も、終わった時にまだ揚陸中の艦も）・終わった時にまだ往路の途中にいた（早く帰投・沈没した夜。spec の形に無い尾で、
// 0 の時は出さない＝「往路 3 隻 → 復路 0 隻（撃沈 0・ビラに残った 0）」と数が合わなく見えた。S4 の Result の写真）。列の通過のある任務（us_04）だけ鍵がある。Phaser・DOM を読まない。

/** Result の列の通過の材料（終わりに 1 回） */
export interface StraitResult {
  /** 列の呼び名（dawn_withdraw.force_ja。無ければ「列」）と揚陸の地の名（transit.vila_label_ja） */
  forceJa: string;
  vilaJa: string;
  /** 往路に現れた・復路に現れた・列の撃沈・終わった時に揚陸の地にいた隻数 */
  inCount: number;
  outCount: number;
  sunk: number;
  away: number;
  /** 終わった時にまだ往路の途中（海域の中で揚陸の地へ向かう）だった隻数。0 なら行に出さない */
  inbound: number;
}

/** Result の列の通過の 1 行 */
export function straitResultLineJa(s: StraitResult): string {
  const tail = s.inbound > 0 ? `・往路の途中 ${s.inbound}` : '';
  return `${s.forceJa}: 往路 ${s.inCount} 隻 → 復路 ${s.outCount} 隻（撃沈 ${s.sunk}・${s.vilaJa}に残った ${s.away}${tail}）`;
}
