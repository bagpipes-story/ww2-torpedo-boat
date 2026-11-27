// ストアの保存（v0.9.0。spec-v0900 §4.5）: localStorage の鍵 2 つ。night-hunters.store（財布・持ち物・装着・装備の選び・支度金を配ったか。1 つの JSON）と
// night-hunters.achieved（達成の記録。ユーザーの決め U2。帰投の記録 night-hunters.cleared とは別。v0.9.0 IP1 から任務ごとに「どの形で達成したか」のビット＝core/achieved-record。
// S0・S1 のビルドが書いた id の JSON 配列も読める＝その id はノーマル・史実オフ・デフォルトの達成）。
// 書くのは任務の終わり（Mission の endMission で 1 回）とストアの画面の交換・装着の時だけ（update では触らない。§7）。読めない・書けない（プライベートブラウズ・容量・無効）時は
// 既定（0 点・持ち物なし・デフォルト）のまま／覚えないだけで、例外を外へ出さない（progress-storage・kpi-storage と同じ作法）。
// iOS の注意: Safari とホーム画面のアプリ（PWA）は保存場所が別＝点も別。?debug&store=1 で開いたとみなすのは systems/sortie-loadout の storeIsOpen（保存は変えない）。
// window を読まない（config/game-config を import しない＝tests が node で読める）。
import type { GameData } from '../config/game-data';
import { getStoreCatalogue, storeItemById } from '../config/store-data';
import { ACH_BIT_PLAIN, achievedIdSet, addAchieved, parseAchievedRecord, serializeAchievedRecord, type AchievedRecord } from '../core/achieved-record';
import { creditSortie, equippedItemIds, parseStoreState, purchaseItem, serializeStoreState, setItemEquipped, storeOpenStatus, type LoadoutMode, type PurchaseRefusal, type StoreState } from '../core/store';

const STORE_KEY = 'night-hunters.store';
const ACHIEVED_KEY = 'night-hunters.achieved';

/**
 * ?debug&points=N（v0.9.0 S1）の時だけの財布の置き場: null なら localStorage。文字列ならページを閉じるまでの写し（点は N・持ち物と装着と選びは保存の物から始める）で、
 * 店・Briefing・任務の終わりの点はみなここを読み書きし、localStorage の night-hunters.store は書かない（達成の鍵はいつもどおり）
 */
let memoryStore: string | null = null;

/** Boot が 1 回（?debug&points=N）: 財布を N 点の写しにする（保存は変えない） */
export function enableStoreMemory(data: GameData, points: number): void {
  memoryStore = null;
  memoryStore = serializeStoreState({ ...loadStoreState(data), points: Math.max(0, Math.floor(points)) });
}

/** tests: 写しをやめる */
export function clearStoreMemory(): void {
  memoryStore = null;
}

function getItem(key: string): string | null {
  if (key === STORE_KEY && memoryStore !== null) return memoryStore;
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** 書けたら true（localStorage が無い・投げた → false） */
function setItem(key: string, value: string): boolean {
  if (key === STORE_KEY && memoryStore !== null) {
    memoryStore = value;
    return true;
  }
  try {
    const s = globalThis.localStorage;
    if (!s) return false;
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function knownIds(data: GameData): Set<string> {
  return new Set(getStoreCatalogue(data).items.map((x) => x.id));
}

/** 保存した財布と持ち物（表に無い品は落とす） */
export function loadStoreState(data: GameData): StoreState {
  return parseStoreState(getItem(STORE_KEY), knownIds(data));
}

function saveStoreState(s: StoreState): boolean {
  return setItem(STORE_KEY, serializeStoreState(s));
}

/** 保存した達成の記録（任務の id → 達成した形のビットの和。v0.9.0 IP1。S0・S1 の id の配列も読む） */
export function achievedRecord(): AchievedRecord {
  return parseAchievedRecord(getItem(ACHIEVED_KEY));
}

/** どれかの形で達成した任務の id（ストアを開く条件） */
export function achievedMissionIds(): Set<string> {
  return achievedIdSet(achievedRecord());
}

/** 任務を達成した（Mission の endMission で 1 回だけ）: その形のビットを足す。新しいビットが立った時だけ書く（S0・S1 の配列はこの時に新しい形へ書き直る） */
function recordAchieved(missionId: string, bit: number): void {
  const rec = achievedRecord();
  if (addAchieved(rec, missionId, bit)) setItem(ACHIEVED_KEY, serializeAchievedRecord(rec));
}

/** 保存の達成で開いているか（?debug&store を見ない＝支度金を配るか決める）と、達成の数 */
export function storedStoreStatus(data: GameData): { open: boolean; done: number; total: number } {
  return storeOpenStatus(achievedMissionIds(), getStoreCatalogue(data).openMissionIds);
}

/** 任務の終わりの記録の結果（S1 の Result の行の材料） */
export interface StoreSortieRecord {
  /** この出撃で足した点（倍率込み）と、開店の支度金（配った出撃だけ。ほかは 0） */
  credited: number;
  granted: number;
  /** 足した後の点 */
  total: number;
  saved: boolean;
}

/**
 * 任務の終わりに 1 回だけ（Mission の endMission。ended の印で二重に来ない＝Result の作り直しでは呼ばない）: 達成なら達成の記録に足し、点を足し、
 * 保存の達成で開いていてまだ配っていなければ支度金を足す（1 回の setItem）。points は倍率込み（core/store の sortieAccrual）。
 * variantBit は達成した形のビット（core/achieved-record の achievedVariantBit。省けばノーマル・史実オフ・デフォルト）
 */
export function recordStoreSortie(data: GameData, missionId: string, achieved: boolean, points: number, variantBit: number = ACH_BIT_PLAIN): StoreSortieRecord {
  if (achieved) recordAchieved(missionId, variantBit);
  const cat = getStoreCatalogue(data);
  const before = loadStoreState(data);
  const { state, granted } = creditSortie(before, points, storedStoreStatus(data).open, cat.grantPoints);
  const saved = saveStoreState(state);
  return { credited: state.points - before.points - granted, granted, total: state.points, saved };
}

/**
 * 開店の支度金（v0.9.0 S1。Title の create）: 保存の達成で開いていて（?debug&store だけでは配らない）まだ配っていなければ、grant_points を足して配った印を書く（1 回の setItem）。
 * 配った点を返す（配らなければ 0）。任務の終わりの creditSortie と同じ印なので二重に配らない
 */
export function grantStoreOpening(data: GameData): number {
  if (!storedStoreStatus(data).open) return 0;
  const before = loadStoreState(data);
  if (before.granted) return 0;
  const { state, granted } = creditSortie(before, 0, true, getStoreCatalogue(data).grantPoints);
  return saveStoreState(state) ? granted : 0;
}

/** 交換（ストアの画面。S1）: 成り立てば保存する（点を引くのと持ち物に足すのを 1 回の setItem で） */
export function purchaseStoreItem(data: GameData, id: string): { ok: true; state: StoreState; saved: boolean } | { ok: false; reason: PurchaseRefusal } {
  const r = purchaseItem(loadStoreState(data), storeItemById(getStoreCatalogue(data), id));
  if (!r.ok) return r;
  return { ok: true, state: r.state, saved: saveStoreState(r.state) };
}

/** 装着の入り切り（ストアの画面。S1） */
export function setStoreItemEquipped(data: GameData, id: string, on: boolean): StoreState {
  const s = setItemEquipped(loadStoreState(data), id, on);
  saveStoreState(s);
  return s;
}

/** Briefing の「装備」の選び（S1） */
export function setStoreLoadoutMode(data: GameData, mode: LoadoutMode): void {
  saveStoreState({ ...loadStoreState(data), mode });
}

/** 装着中の品（交換した順） */
export function equippedStoreItems(data: GameData): string[] {
  return equippedItemIds(loadStoreState(data));
}
