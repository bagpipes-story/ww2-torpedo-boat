// 兵装の data（v0.6.8。spec-v068 §1.1 D2・§2・§3.2）: 魚雷と機銃は全任務で両方（艇が積むもの）。主兵装（missions_seed の main_weapon）は右下の角のボタン・2 行目の
// 「魚雷なし／大発なし」・Briefing の順だけを決める。ここは艇の魚雷の数・艇の砲（main_weapon に関わらず）・対空と閃光の値を読んで検査する。
// WorldSetup（systems/world-setup）と模擬からは呼ばない（guns・torpedoCapacity・mainWeapon は主兵装だけのまま＝setup の snapshot と 17 の md5 は変わらない）。
// window を読まない（tests と scripts の node から読める）。
import { gunBatteryParamsFromData, isGunBatteryDataRecord, type GunBatteryParams } from '../core/gun-battery';
import type { AntiAircraftParams } from '../core/aa-fire';
import { getBoatTorpedoCount, type GameData } from './game-data';
import { getPrototypeMission, hasHardVariant, type MainWeapon, type PrototypeMission } from './mission-data';

/** 1 発の撃墜の確率の上限（起動時の検査。data の値はこれより十分小さい） */
const AA_HIT_CHANCE_MAX = 0.02;

/** 任務の艇が積むもの（主兵装は mission.mainWeapon。jp_02 の none は「主兵装なし」＝右下の角は機銃） */
export interface Loadout {
  primary: MainWeapon;
  torpedoes: number;
  gun: GunBatteryParams | null;
  aa: AntiAircraftParams;
}

/**
 * boats.json の艇の gun_battery（主兵装に関わらず。v0.6.8）。鍵が無ければ null、あって壊れていれば例外（文は config/game-data の getGunBatteryParams と同じ。値の誤りには艇の id を前に付ける）。
 * getGunBatteryParams（主兵装が guns の任務だけ）は WorldSetup と模擬のために変えない
 */
export function getBoatGunParams(data: GameData, boatId: string): GunBatteryParams | null {
  const b = data.boats.boats.find((x) => x.id === boatId) as Record<string, unknown> | undefined;
  if (!b) throw new Error(`boats.json に ${boatId} が無い`);
  const g = b['gun_battery'];
  if (g === undefined) return null;
  if (!isGunBatteryDataRecord(g)) {
    throw new Error(`boats.json の ${boatId}.gun_battery（label_ja / range_m / effective_m / dead_cone_deg / muzzle_flash_reveal_m / spread_factor / groups・任意の magazine（rounds / reload_s）・min_spread_m は数）が無い（docs/02 §6.4）`);
  }
  try {
    return gunBatteryParamsFromData(g);
  } catch (e) {
    throw new Error(`${boatId}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** hit_rate_model.json の anti_aircraft（1 発の撃墜の確率・射程）と gun_flash（閃光を保つ秒）。壊れていれば例外（起動時に分かる） */
export function getAntiAircraftParams(data: GameData): AntiAircraftParams {
  const m = data.hitRateModel as unknown as Record<string, unknown>;
  const a = m['anti_aircraft'] as Record<string, unknown> | undefined;
  const f = m['gun_flash'] as Record<string, unknown> | undefined;
  const hit = a?.['hit_chance_per_round'];
  const range = a?.['range_m'];
  const hold = f?.['hold_s'];
  if (!(typeof hit === 'number' && hit > 0 && hit <= AA_HIT_CHANCE_MAX)) throw new Error(`hit_rate_model.json の anti_aircraft.hit_chance_per_round は 0 より大きく ${AA_HIT_CHANCE_MAX} 以下（機へ撃った 1 発の撃墜の確率。v0.6.8）`);
  if (!(typeof range === 'number' && range > 0)) throw new Error('hit_rate_model.json の anti_aircraft.range_m は正（機を撃てる距離 m。v0.6.8）');
  if (!(typeof hold === 'number' && hold > 0)) throw new Error('hit_rate_model.json の gun_flash.hold_s は正（機銃を撃ってから閃光で見つかる距離を保つ秒。v0.6.8）');
  return { hitChancePerRound: hit, rangeM: range, flashHoldS: hold };
}

/** 任務の兵装: 主兵装・艇の魚雷の数・艇の砲（無い艇は null）・対空の値 */
export function getLoadout(data: GameData, mission: PrototypeMission): Loadout {
  return {
    primary: mission.mainWeapon,
    torpedoes: getBoatTorpedoCount(data, mission.playerBoatId),
    gun: getBoatGunParams(data, mission.playerBoatId),
    aa: getAntiAircraftParams(data),
  };
}

/** Boot の検査（v0.6.8）: 対空・閃光の data と、v0_1_prototype を持つ全任務（ハードも）の兵装を 1 回組む（壊れていれば Boot で止まる） */
export function validateLoadouts(data: GameData): void {
  getAntiAircraftParams(data);
  for (const m of data.missionsSeed.missions as readonly Record<string, unknown>[]) {
    const id = m['id'];
    if (!m['v0_1_prototype'] || typeof id !== 'string') continue;
    getLoadout(data, getPrototypeMission(data, id));
    if (hasHardVariant(data, id)) getLoadout(data, getPrototypeMission(data, id, true));
  }
}
