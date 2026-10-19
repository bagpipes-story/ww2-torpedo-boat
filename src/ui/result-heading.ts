// Result の見出し（v0.6.1 で scenes/result-scene.ts から切り出し）: 終了理由の文と「任務終了 — …」の 1 行、得点の行の「回避 N」。
// v0.6.1: 夜明けは終了理由でなくなり（dawn を削除）、夜明けの後に終わった任務は見出しに「（夜明け後 N 秒）」を付ける。
// Phaser も config（DOM を読む game-config）も使わない（文を組むだけ。tests から型検査ごと読める）。終了理由の型は core/mission-flow。
import type { MissionEndReason } from '../core/mission-flow';

/** 史実モードの見出しの印（v0.6.1 で config/menu-config から移した。文は同じ） */
export const RESULT_HISTORICAL_TAG_JA = '（史実）';

export const REASON_LABEL: Record<MissionEndReason, string> = {
  returned: '帰投した',
  adrift: '燃料切れで漂流',
  grounded: '浅瀬に座礁',
  rammed: '駆逐艦に体当たりされた',
  destroyed: '砲撃で沈没',
  friendly_fire: '味方機の誤射で沈没',
  storm: '荒波で船体破損・沈没',
  bombed: '敵機の爆撃で沈没',
  air_strike: '夜明けの空襲で沈没',
  barge_fire: '大発の機銃で沈没',
  shore_battery: '沿岸砲で沈没',
};

/**
 * 見出しに付ける夜明け後の秒（付けなければ NaN）。夜明けの後に終わった任務に付ける（夜明けに輪の外で帰投した、沈んだ・漂流した・座礁した）。
 * 夜明け前に終わった任務と、夜明けに輪の中にいて帰投した任務には付けない（d は MissionResult.dawn）
 */
export function resultDawnSuffixS(returned: boolean, d: { readonly reached: boolean; readonly caughtOutside: boolean; readonly daylightS: number }): number {
  return !d.reached || (returned && !d.caughtOutside) ? NaN : d.daylightS;
}

/** 「任務終了 — 理由」の見出し。dawnSuffixS は夜明け後の秒（NaN なら付けない。付けるときは「（夜明け後 N 秒）」を理由の直後、ハード・史実の前に。resultDawnSuffixS） */
export function resultHeadingJa(reason: MissionEndReason, dawnSuffixS: number, hard: boolean, historical: boolean): string {
  const dawn = Number.isNaN(dawnSuffixS) ? '' : `（夜明け後 ${Math.round(dawnSuffixS)} 秒）`;
  return `任務終了 — ${REASON_LABEL[reason]}${dawn}${hard ? '（ハード）' : ''}${historical ? RESULT_HISTORICAL_TAG_JA : ''}`;
}

/**
 * 得点の行の「 ・ 回避 N」（回避に点がある任務＝要人脱出だけ。evadePoints は scoring の evadeByType[type]、無ければ空）。
 * 夜明けだけが理由で 0（帰投・達成・駆逐艦に見つからず、でも夜明けに輪の外）なら「回避 0（夜明け後）」（v0.6.1 レビュー: 「駆逐艦に見つからず」の隣で理由の無い 0 に見えた）
 */
export function resultEvadePartJa(
  evadePoints: number | undefined,
  evade: number,
  r: { readonly returned: boolean; readonly objectiveDone: boolean; readonly detections: number; readonly dawn: { readonly caughtOutside: boolean } },
): string {
  if (evadePoints === undefined) return '';
  const lostAtDawn = evade === 0 && r.returned && r.objectiveDone && r.detections === 0 && r.dawn.caughtOutside;
  return ` ・ 回避 ${evade}${lostAtDawn ? '（夜明け後）' : ''}`;
}
