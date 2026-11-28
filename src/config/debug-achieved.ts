// ?debug&achieved=<語をコンマで区切る>（v0.9.0 IP2。IP3 で形を足した）: 語は <任務の id か all>[:<形>]。all はストアを開く条件の 13 任務。形は
//   （無し）＝ノーマル・史実オフ・デフォルト（IP2 のまま）・hard＝ハード・hist＝史実モード × デフォルト・hardhist＝ハードの史実モード × デフォルト
// 例 ?debug&achieved=all:hardhist（13 任務をハード × 史実 × デフォルトで達成＝Briefing のトロフィー・Title の小さなトロフィー・ストアのご褒美「歴戦の乗員」を持つ写し。v0.9.0 IP4）・
//    ?debug&achieved=all:hist（IP4 からトロフィーはハードの違いの無い jp_02・jp_05 だけ・ご褒美はまだ 2/13）・?debug&achieved=us_02:hardhist（us_02 の Briefing に「ハード・史実で達成」）。
// その形で達成済みとみなして Title・Briefing・ストアに出す（iPhone で確かめる）。保存は変えない（達成の鍵もご褒美も書かない）。ストアは開かない（開くのは ?debug&store=1）。無ければ null。
// config/game-config（300 行）から分けた（?debug の読み方は同じ: DEBUG_ENABLED の時だけ URL を読む）。読むのは systems/sortie-loadout の shownAchievedRecord・debugStoreMemory。
import { DEBUG_ENABLED } from './game-config';
import { parseDebugAchieved } from '../core/achieved-record';

function debugAchieved(): { id: string; bit: number }[] | null {
  if (!DEBUG_ENABLED) return null;
  const v = new URLSearchParams(window.location.search).get('achieved');
  return v === null ? null : parseDebugAchieved(v);
}
export const DEBUG_ACHIEVED = debugAchieved();
