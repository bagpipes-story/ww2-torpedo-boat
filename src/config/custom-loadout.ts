// 出撃の装備「デフォルト／カスタム」（v0.9.0。ユーザーの決め U1。spec-v0900 §4.1）: ストアの品を当てた出撃の data を 1 か所で作る。
// デフォルト（sortie に custom の鍵が無い）は base そのもの（同じ参照）＝世界・HUD・Result は v0.8.5 と 1 ビットも同じ（史実モードのデフォルトも今の史実モードと同じ）。
// v0.9.0 IP1（ユーザーの言葉 2026-11-27「史実モードでもカスタム装備使える仕様でいいです。でも史実でカスタムを使ったという表示と記録は必要です。」）: 史実モードでもカスタムを当てる
// （S0・S1 の「史実モードはデフォルトに固定」をやめた。表示は HUD の「［史実・カスタム］」と Result の「（史実）（カスタム）」、記録は core/achieved-record の形のビット）。
// カスタムは自艇の記録と任務の記録（と v0_1_prototype）だけを写して直した別の物（copy-on-write。base は決して書き換えない＝tests は base を深く freeze して当てる）。
// 呼ぶのは Mission・Hud・Briefing の create だけ（出撃ごとに 1 回。同じ出撃の 2 回目からは覚えた物を返す）。Result の配点は base のまま。window を読まない（tests と scripts から読める）。
import type { GameData } from './game-data';
import { getStoreCatalogue, itemTargetMissions, pathValue, storeItemById } from './store-data';
import { fuelHoursFullKeepingExponent, type BoatFuelDataRecord } from '../core/fuel';
import type { StoreEffect, StoreItem } from '../core/store';
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
    case 'boat_crew':
      return pathValue(boat, 'gun_battery.magazine.reload_s') !== e.reloadS || pathValue(boat, 'damage.extinguish_hold_s') !== e.extinguishHoldS;
    case 'boat_gun_heavy':
      return true; // 組を足すか発射速度を足す（検査 V-S2 で艇に砲がある）
    case 'boat_engine':
      return e.speedAddKt !== 0 || e.accelFactor !== 1;
  }
}

/**
 * 重い砲（v0.9.1）: 艇の砲の記録を写して、merge_into の組があればその発射速度に足し、無ければ組を頭に足して名の頭に付ける（重い組が 0 番＝us_03 の砲弾の絵の作法）。
 * 弾倉は magazine_add 発を足す。2 つの砲の品は表の順に重ねる（Elco 77 の両方で「40mm・37mm・12.7mm連装×2」・組 3 つ）
 */
function withHeavyGun(gun: Rec, e: Extract<StoreEffect, { kind: 'boat_gun_heavy' }>): Rec {
  const groups = gun['groups'] as readonly Rec[];
  const g = e.group;
  const merge = e.mergeInto === null ? -1 : groups.findIndex((x) => x['id'] === e.mergeInto);
  const nextGroups =
    merge >= 0
      ? groups.map((x, i) => (i === merge ? { ...x, rounds_per_min: (x['rounds_per_min'] as number) + g.roundsPerMin } : x))
      : [{ id: g.id, rounds_per_min: g.roundsPerMin, damage: g.damage, shell_speed_mps: g.shellSpeedMps, dispersion_m: g.dispersionM, splash_radius_m: g.splashRadiusM }, ...groups];
  const mag = gun['magazine'] as Rec;
  return {
    ...gun,
    label_ja: merge >= 0 ? gun['label_ja'] : `${e.labelJa}・${String(gun['label_ja'])}`,
    groups: nextGroups,
    magazine: { ...mag, rounds: (mag['rounds'] as number) + e.magazineAdd },
  };
}

/** その任務で効く品の id（表の順。表に無い id・効かない品は落とす）。史実モードかどうかは見ない（v0.9.0 IP1 から史実モードでも同じ品が効く） */
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
        boat['torpedoes'] = { ...(boat['torpedoes'] as Rec), count: e.count };
        break;
      case 'boat_smoke':
        boat['smoke'] = { ...(boat['smoke'] as Rec), duration_s: e.durationS, cooldown_s: e.cooldownS };
        break;
      case 'mission_fuel_factor':
        proto['fuel_allotment_gal'] = (proto['fuel_allotment_gal'] as number) * e.factor;
        break;
      case 'boat_crew': {
        // ご褒美「歴戦の乗員」（v0.9.0 IP3）: 砲・弾倉・被害の記録を写して 2 つの値だけ（乗員の減りの倍率 crew_effects と他の値は同じ物を指す）。
        // v0.9.1 から今の写し（boat）から読む＝先に当てた重い砲の組・弾倉の発を消さない（v0.9.0 の 5 品では b0 と同じ物）
        const gun = boat['gun_battery'] as Rec;
        boat['gun_battery'] = { ...gun, magazine: { ...(gun['magazine'] as Rec), reload_s: e.reloadS } };
        boat['damage'] = { ...(boat['damage'] as Rec), extinguish_hold_s: e.extinguishHoldS };
        break;
      }
      case 'boat_gun_heavy':
        boat['gun_battery'] = withHeavyGun(boat['gun_battery'] as Rec, e);
        break;
      case 'boat_engine': {
        // 機関の整備（v0.9.1）: 最大速力と加速。fuel_hours_full は燃料曲線の指数が同じ値へ（同じ速さなら同じ gal/h。静音の上限・速力帯・巡航は変えない）
        const maxKt = (boat['speed_max_kt'] as number) + e.speedAddKt;
        boat['fuel_hours_full'] = fuelHoursFullKeepingExponent(boat as unknown as BoatFuelDataRecord, maxKt);
        boat['speed_max_kt'] = maxKt;
        boat['accel_mps2'] = (boat['accel_mps2'] as number) * e.accelFactor;
        break;
      }
    }
  }
  m['v0_1_prototype'] = proto;
  const boats = (base.boats.boats as readonly Rec[]).map((b) => (b === b0 ? boat : b));
  const missions = (base.missionsSeed.missions as readonly Rec[]).map((x) => (x === m0 ? m : x));
  return { ...base, boats: { ...base.boats, boats }, missionsSeed: { ...base.missionsSeed, missions } } as unknown as GameData;
}

let memo: { base: GameData; key: string; data: GameData } | null = null;

/**
 * 出撃の data: カスタムでなければ（custom の鍵が無い）base そのもの（同じ参照）。カスタムなら品を当てた物（史実モードでも同じ。v0.9.0 IP1）
 * （同じ base・任務・品の 2 回目は覚えた物＝Mission と Hud が同じ物を読む）
 */
export function sortieGameData(base: GameData, sortie: Sortie): GameData {
  const c = sortie.custom;
  if (!c) return base;
  const key = `${sortie.missionId}|${c.items.join(',')}`;
  if (memo && memo.base === base && memo.key === key) return memo.data;
  const data = applyStoreItems(base, sortie.missionId, c.items);
  memo = { base, key, data };
  return data;
}

/** 出撃にカスタムの印を付ける（効く品が無い → sortie そのもの＝デフォルト。付ける時は新しい物で、items はその任務で効く品だけ。史実モードの出撃にも付ける＝v0.9.0 IP1） */
export function withCustomLoadout(sortie: Sortie, data: GameData, ids: readonly string[]): Sortie {
  const items = effectiveStoreItems(data, sortie.missionId, ids);
  return items.length === 0 ? sortie : { ...sortie, custom: { items } };
}
