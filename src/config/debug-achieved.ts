// ?debug&achieved=<任務の id をコンマで区切る>（v0.9.0 IP2。achieved=all でストアを開く条件の 13 任務）: その任務を達成済み（ノーマル・史実オフ・デフォルト）とみなして
// Title の行の印「✓ 達成」とタブの「達成 n/N」を出す（iPhone で印を確かめる。保存は変えない。ストアは開かない＝開くのは ?debug&store=1）。無ければ null。
// config/game-config（300 行）から分けた（?debug の読み方は同じ: DEBUG_ENABLED の時だけ URL を読む）。読むのは systems/sortie-loadout の titleAchievedRecord（Title の create で 1 回）。
import { DEBUG_ENABLED } from './game-config';

function debugAchievedIds(): string[] | null {
  if (!DEBUG_ENABLED) return null;
  const v = new URLSearchParams(window.location.search).get('achieved');
  return v === null ? null : v.split(',').filter((x) => x !== '');
}
export const DEBUG_ACHIEVED_IDS = debugAchievedIds();
