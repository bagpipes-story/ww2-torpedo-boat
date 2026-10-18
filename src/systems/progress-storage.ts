// 任務を終えた回数の保存（v0.5.2。core/progress の読み書き）: localStorage の鍵 1 つ。任務の終わり（Mission の endMission）に 1 回だけ +1、Briefing と Mission の始めに 1 回読む。
// 読めない・書けない（プライベートブラウズ・容量・無効）ときは 0 のまま／増やさないだけで、例外を外へ出さない（kpi-storage と同じ作法。update では触らない。§7）。
// iOS の注意: Safari とホーム画面のアプリ（PWA）は保存場所が別。?debug&sorties=N で回数をみなす（保存は変えない）。
import { DEBUG_SORTIES } from '../config/game-config';
import { parseSortieCount, serializeSortieCount } from '../core/progress';

const KEY = 'night-hunters.sorties';

function read(): string | null {
  try {
    return globalThis.localStorage?.getItem(KEY) ?? null;
  } catch {
    return null;
  }
}

/** 終えた任務の回数（?debug&sorties=N があればその値） */
export function sortiesDone(): number {
  if (Number.isFinite(DEBUG_SORTIES)) return DEBUG_SORTIES;
  return parseSortieCount(read());
}

/** 任務を 1 回終えた: 保存した回数を +1 して返す（書けなければ増えないまま返す） */
export function recordSortie(): number {
  const n = parseSortieCount(read()) + 1;
  try {
    globalThis.localStorage?.setItem(KEY, serializeSortieCount(n));
  } catch {
    // 覚えないだけ
  }
  return n;
}
