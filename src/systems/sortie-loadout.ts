// 出撃の装備の入口（v0.9.0 S0）: ?debug&custom=<品の id>（Briefing の切り替えは S1）で出撃にカスタムの印を付ける・任務の終わりにストアの点と達成を 1 回だけ記録する。
// v0.9.0 S1: Briefing の「装備: デフォルト／カスタム」の決め（briefingLoadout）。
// Briefing・Mission の create と endMission だけが呼ぶ（update では呼ばない。§7）。data の上書きそのものは config/custom-loadout。
import { DEBUG_ACHIEVED_IDS } from '../config/debug-achieved';
import { DEBUG_CUSTOM_ALL, DEBUG_CUSTOM_ITEMS, DEBUG_STORE_OPEN } from '../config/game-config';
import type { GameData } from '../config/game-data';
import { effectiveStoreItems, withCustomLoadout } from '../config/custom-loadout';
import { hasHardVariant } from '../config/mission-data';
import { getStoreCatalogue } from '../config/store-data';
import { ACH_BIT_PLAIN, achievedVariantBit, addAchieved, type AchievedRecord } from '../core/achieved-record';
import type { Sortie } from '../core/sortie';
import { briefingLoadoutShown, sortieAchieved } from '../core/store';
import type { MissionResult } from '../scenes/result-scene';
import { missionStorePoints } from './mission-score';
import { achievedRecord, equippedStoreItems, loadStoreState, recordStoreSortie, storedStoreStatus, type StoreSortieRecord } from './store-storage';

/** ?debug&custom があればその品（all は表の全部）でカスタムの印を付けた出撃（効く品が無い・custom が無い → sortie そのもの。史実モードでも付ける＝v0.9.0 IP1） */
export function sortieWithDebugCustom(sortie: Sortie, data: GameData): Sortie {
  const ids = DEBUG_CUSTOM_ITEMS;
  if (ids === null || sortie.custom) return sortie;
  return withCustomLoadout(sortie, data, ids.includes(DEBUG_CUSTOM_ALL) ? getStoreCatalogue(data).items.map((x) => x.id) : ids);
}

/** ストアが開いているか（?debug&store=1 なら開いたとみなす。保存は変えない＝支度金も配らない。S1 の Title・Briefing が読む） */
export function storeIsOpen(data: GameData): boolean {
  return DEBUG_STORE_OPEN || storedStoreStatus(data).open;
}

/**
 * 任務の終わりに 1 回だけ（endMission）: 達成（帰投して目標を果たした）の記録とストアの点（倍率込み）。base は registry の data（配点と品の表）。
 * v0.9.0 S1: 記録の後にストアが開いていれば（この出撃で開いた時も）result.store に入れる（Result の「 ・ ストア +M（計 T 点）」）。閉じている端末は鍵ごと入れない＝Result の材料と文は v0.8.5 と同じ
 */
export function recordSortieStore(result: MissionResult, base: GameData): StoreSortieRecord {
  const s = result.sortie;
  // どの形で達成したか（v0.9.0 IP1。史実モードのカスタムも覚える）: ハードはハードの違いのある任務だけ（jp_02・jp_05 のハードはノーマルと同じ世界）
  const bit = achievedVariantBit({ hard: s.hard && hasHardVariant(base, s.missionId), historical: s.historical, custom: s.custom !== undefined });
  const rec = recordStoreSortie(base, s.missionId, sortieAchieved(result), missionStorePoints(result, base), bit);
  if (storeIsOpen(base)) result.store = rec;
  return rec;
}

/**
 * Title の印の達成の記録（v0.9.0 IP2。create で 1 回）: 保存の記録に、?debug&achieved=<id をコンマで>|all の任務をノーマル・史実オフ・デフォルトの達成として足した写し
 * （保存は変えない。ストアを開く条件と支度金は保存の記録だけ＝systems/store-storage の storedStoreStatus）
 */
export function titleAchievedRecord(data: GameData): AchievedRecord {
  const rec = achievedRecord();
  const dbg = DEBUG_ACHIEVED_IDS;
  if (dbg !== null) for (const id of dbg.includes(DEBUG_CUSTOM_ALL) ? getStoreCatalogue(data).openMissionIds : dbg) addAchieved(rec, id, ACH_BIT_PLAIN);
  return rec;
}

/** Briefing の「装備」（create で 1 回）: 切り替えを出すか・カスタムを選んでいるか・その任務に効く装着中の品（表の順） */
export interface BriefingLoadout {
  readonly show: boolean;
  readonly custom: boolean;
  readonly items: readonly string[];
}

export function briefingLoadout(base: GameData, missionId: string, raid: boolean): BriefingLoadout {
  const open = storeIsOpen(base);
  const items = open ? effectiveStoreItems(base, missionId, equippedStoreItems(base)) : []; // 史実モードでも同じ（v0.9.0 IP1）
  const show = briefingLoadoutShown({ open, raid, effectiveItems: items.length });
  return { show, custom: show && loadStoreState(base).mode === 'custom', items: show ? items : [] };
}

/** Briefing の出撃: カスタムを選んでいればその品の印を付けた出撃（デフォルトは sortie そのもの＝custom の鍵なし） */
export function sortieWithBriefingLoadout(sortie: Sortie, base: GameData, l: BriefingLoadout): Sortie {
  return l.custom ? withCustomLoadout(sortie, base, l.items) : sortie;
}
