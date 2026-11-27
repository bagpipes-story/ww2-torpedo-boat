// 出撃の装備「デフォルト／カスタム」（v0.9.0。ユーザーの決め U1。spec-v0900 §4.1）: ストアの品を当てた出撃の data を 1 か所で作る。
// デフォルト（sortie に custom の鍵が無い・史実モード）は base そのもの（同じ参照）＝世界・HUD・Result は v0.8.5 と 1 ビットも同じ。
// カスタムは自艇の記録と任務の記録（と v0_1_prototype）だけを写して直した別の物（copy-on-write。base は決して書き換えない＝tests は base を深く freeze して当てる）。
// 呼ぶのは Mission・Hud・Briefing の create だけ（出撃ごとに 1 回。同じ出撃の 2 回目からは覚えた物を返す）。Result の配点は base のまま。window を読まない（tests と scripts から読める）。
import type { GameData } from './game-data';
import { getStoreCatalogue, itemTargetMissions, pathValue, storeItemById } from './store-data';
import type { StoreItem } from '../core/store';
import type { Sortie } from '../core/sortie';

type Rec = Record<string, unknown>;

function missionRecord(data: GameData, missionId: string): Rec | undefined {
  return (data.missionsSeed.missions as readonly Rec[]).find((m) => m['id'] === missionId);
}

/** 品がその任務で何かを変えるか（狙う任務で、値が今と違う） */
function itemChanges(data: GameData, item: StoreItem, m: Rec): boolean {
  if (!itemTargetMissions(data, item).includes(m)) return false;
  const boat = (data.boats.boats as readonly Rec[]).find((b) => b['id'] === m['player_boat']);
  const e = item.effect;
  switch (e.kind) {
    case 'mission_torpedo':
      return m['torpedo_type'] !== e.torpedoId;
    case 'boat_torpedo_count':
      return pathValue(boat, 'torpedoes.count') !== e.count;
    case 'boat_smoke':
      return pathValue(boat, 'smoke.duration_s') !== e.durationS || pathValue(boat, 'smoke.cooldown_s') !== e.cooldownS;
    case 'mission_fuel_factor':
      return e.factor !== 1;
  }
}

/** その任務で効く品の id（表の順。表に無い id・効かない品は落とす）。史実モードの判定はここではしない（sortieGameData と withCustomLoadout） */
export function effectiveStoreItems(data: GameData, missionId: string, ids: readonly string[]): string[] {
  const m = missionRecord(data, missionId);
  if (!m) return [];
  return getStoreCatalogue(data).items.filter((it) => ids.includes(it.id) && itemChanges(data, it, m)).map((it) => it.id);
}

/** 品を当てた data（効く品が無ければ base そのもの）。base は書き換えない */
export function applyStoreItems(base: GameData, missionId: string, ids: readonly string[]): GameData {
  const eff = effectiveStoreItems(base, missionId, ids);
  if (eff.length === 0) return base;
  const cat = getStoreCatalogue(base);
  const m0 = missionRecord(base, missionId)!;
  const boatId = m0['player_boat'] as string;
  const b0 = (base.boats.boats as readonly Rec[]).find((b) => b['id'] === boatId)!;
  const m: Rec = { ...m0 };
  const proto: Rec = { ...(m0['v0_1_prototype'] as Rec) };
  const boat: Rec = { ...b0 };
  for (const id of eff) {
    const e = storeItemById(cat, id)!.effect;
    switch (e.kind) {
      case 'mission_torpedo':
        m['torpedo_type'] = e.torpedoId;
        break;
      case 'boat_torpedo_count':
        boat['torpedoes'] = { ...(b0['torpedoes'] as Rec), count: e.count };
        break;
      case 'boat_smoke':
        boat['smoke'] = { ...(b0['smoke'] as Rec), duration_s: e.durationS, cooldown_s: e.cooldownS };
        break;
      case 'mission_fuel_factor':
        proto['fuel_allotment_gal'] = (proto['fuel_allotment_gal'] as number) * e.factor;
        break;
    }
  }
  m['v0_1_prototype'] = proto;
  const boats = (base.boats.boats as readonly Rec[]).map((b) => (b === b0 ? boat : b));
  const missions = (base.missionsSeed.missions as readonly Rec[]).map((x) => (x === m0 ? m : x));
  return { ...base, boats: { ...base.boats, boats }, missionsSeed: { ...base.missionsSeed, missions } } as unknown as GameData;
}

let memo: { base: GameData; key: string; data: GameData } | null = null;

/**
 * 出撃の data: カスタムでなければ（custom の鍵が無い・史実モード）base そのもの（同じ参照）。カスタムなら品を当てた物
 * （同じ base・任務・品の 2 回目は覚えた物＝Mission と Hud が同じ物を読む）
 */
export function sortieGameData(base: GameData, sortie: Sortie): GameData {
  const c = sortie.custom;
  if (!c || sortie.historical) return base;
  const key = `${sortie.missionId}|${c.items.join(',')}`;
  if (memo && memo.base === base && memo.key === key) return memo.data;
  const data = applyStoreItems(base, sortie.missionId, c.items);
  memo = { base, key, data };
  return data;
}

/** 出撃にカスタムの印を付ける（史実モード・効く品が無い → sortie そのもの＝デフォルト。付ける時は新しい物で、items はその任務で効く品だけ） */
export function withCustomLoadout(sortie: Sortie, data: GameData, ids: readonly string[]): Sortie {
  if (sortie.historical) return sortie;
  const items = effectiveStoreItems(data, sortie.missionId, ids);
  return items.length === 0 ? sortie : { ...sortie, custom: { items } };
}
