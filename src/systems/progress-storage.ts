// 任務を終えた回数の保存（v0.5.2。core/progress の読み書き）: localStorage の鍵 1 つ。任務の終わり（Mission の endMission）に 1 回だけ +1、Briefing と Mission の始めに 1 回読む。
// 読めない・書けない（プライベートブラウズ・容量・無効）ときは 0 のまま／増やさないだけで、例外を外へ出さない（kpi-storage と同じ作法。update では触らない。§7）。
// iOS の注意: Safari とホーム画面のアプリ（PWA）は保存場所が別。?debug&sorties=N で回数をみなす（保存は変えない）。
import { DEBUG_SORTIES } from '../config/game-config';
import { getCampaigns, playableMissionIds } from '../config/campaign-data';
import type { GameData } from '../config/game-data';
import { legacyUnlocked, parseIdList, serializeIdList } from '../core/campaign';
import { parseSortieCount, serializeSortieCount } from '../core/progress';

const KEY = 'night-hunters.sorties';
/** 見越し点マーカーを使うか（v0.5.2 実機 1 回目「使うかどうか選択制に」）。'0' で使わない。無い・読めなければ使う */
const MARKER_KEY = 'night-hunters.lead-marker';
/** 帰投で終えた任務の id（v0.6.0。キャンペーンの解放の条件。JSON の配列）と、開いたキャンペーンの id（一度開いたら閉じない） */
const CLEARED_KEY = 'night-hunters.cleared';
const UNLOCKED_KEY = 'night-hunters.unlocked';

function getItem(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function setItem(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // 覚えないだけ
  }
}

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

/** 見越し点マーカーを使う設定か（解放していても、使わないを選べる。Title で切り替え） */
export function leadMarkerEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(MARKER_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setLeadMarkerEnabled(v: boolean): void {
  try {
    globalThis.localStorage?.setItem(MARKER_KEY, v ? '1' : '0');
  } catch {
    // 覚えないだけ
  }
}

/** 保存した「終えた任務の回数」（?debug&sorties=N を見ない。v0.5.2 までの端末の移し替えに使う） */
export function storedSorties(): number {
  return parseSortieCount(read());
}

/** 帰投で終えた任務の記録の生の文字列（null なら記録がまだ無い＝v0.6.0 で初めて開いた端末） */
export function readClearedRaw(): string | null {
  return getItem(CLEARED_KEY);
}

export function clearedMissionIds(): Set<string> {
  return new Set(parseIdList(getItem(CLEARED_KEY)));
}

/** 任務を帰投で終えた（Mission の endMission で 1 回だけ。同じ任務は 1 回だけ数える） */
export function recordClear(missionId: string): void {
  const ids = parseIdList(getItem(CLEARED_KEY));
  if (!ids.includes(missionId)) ids.push(missionId);
  setItem(CLEARED_KEY, serializeIdList(ids));
}

/** 記録がまだ無ければ空の記録を作る（移し替えを 1 回だけにする） */
export function initClearedIfAbsent(): void {
  if (getItem(CLEARED_KEY) === null) setItem(CLEARED_KEY, serializeIdList([]));
}

export function unlockedCampaignIds(): Set<string> {
  return new Set(parseIdList(getItem(UNLOCKED_KEY)));
}

export function markCampaignUnlocked(campaignId: string): void {
  const ids = parseIdList(getItem(UNLOCKED_KEY));
  if (ids.includes(campaignId)) return;
  ids.push(campaignId);
  setItem(UNLOCKED_KEY, serializeIdList(ids));
}

/**
 * v0.5.2 までの端末の移し替え（v0.6.0。Boot の create で 1 回、どの任務より先に呼ぶ。?debug 直行で Title を通らなくても効くように）:
 * 帰投の記録がまだ無く、終えた任務の回数が条件の任務の数以上なら、complete_ のキャンペーンを開いたものとみなして印を書く。そのあと空の記録を作る（2 回目からは何もしない）
 */
export function migrateLegacyUnlocks(data: GameData): void {
  const raw = readClearedRaw();
  if (raw !== null) return;
  const sorties = storedSorties();
  for (const c of getCampaigns(data)) if (c.unlock.kind === 'complete' && legacyUnlocked(raw, sorties, playableMissionIds(data, c.unlock.campaignId).length)) markCampaignUnlocked(c.id);
  initClearedIfAbsent();
}
