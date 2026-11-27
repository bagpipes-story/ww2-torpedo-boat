// 出撃の装備の入口（v0.9.0 S0）: ?debug&custom=<品の id>（Briefing の切り替えは S1）で出撃にカスタムの印を付ける・任務の終わりにストアの点と達成を 1 回だけ記録する。
// Mission の init・create・endMission だけが呼ぶ（update では呼ばない。§7）。data の上書きそのものは config/custom-loadout。
import { DEBUG_CUSTOM_ALL, DEBUG_CUSTOM_ITEMS, DEBUG_STORE_OPEN } from '../config/game-config';
import type { GameData } from '../config/game-data';
import { withCustomLoadout } from '../config/custom-loadout';
import { getStoreCatalogue } from '../config/store-data';
import type { Sortie } from '../core/sortie';
import { sortieAchieved } from '../core/store';
import type { MissionResult } from '../scenes/result-scene';
import { missionStorePoints } from './mission-score';
import { recordStoreSortie, storedStoreStatus, type StoreSortieRecord } from './store-storage';

/** ?debug&custom があればその品（all は表の全部）でカスタムの印を付けた出撃（史実モード・効く品が無い・custom が無い → sortie そのもの） */
export function sortieWithDebugCustom(sortie: Sortie, data: GameData): Sortie {
  const ids = DEBUG_CUSTOM_ITEMS;
  if (ids === null || sortie.custom) return sortie;
  return withCustomLoadout(sortie, data, ids.includes(DEBUG_CUSTOM_ALL) ? getStoreCatalogue(data).items.map((x) => x.id) : ids);
}

/** ストアが開いているか（?debug&store=1 なら開いたとみなす。保存は変えない＝支度金も配らない。S1 の Title・Briefing が読む） */
export function storeIsOpen(data: GameData): boolean {
  return DEBUG_STORE_OPEN || storedStoreStatus(data).open;
}

/** 任務の終わりに 1 回だけ（endMission）: 達成（帰投して目標を果たした）の記録とストアの点（倍率込み）。base は registry の data（配点と品の表） */
export function recordSortieStore(result: MissionResult, base: GameData): StoreSortieRecord {
  return recordStoreSortie(base, result.sortie.missionId, sortieAchieved(result), missionStorePoints(result, base));
}
