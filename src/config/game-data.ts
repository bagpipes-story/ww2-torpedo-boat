// data/*.json を Vite でバンドルして1回だけ読む（CLAUDE.md §7「JSONを毎シーンfetchしない」、§8 データ駆動）。
// 実行時 fetch にしない理由: Pages のサブパス（/ww2-torpedo-boat/）で 404 を踏まず、オフライン PWA でも壊れない。
import boats from '../../data/boats.json';
import torpedoes from '../../data/torpedoes.json';
import enemies from '../../data/enemies.json';
import hitRateModel from '../../data/hit_rate_model.json';
import riskEvents from '../../data/risk_events.json';
import missionsSeed from '../../data/missions_seed.json';
import scoring from '../../data/scoring.json';
import { isBoatDataRecord, type BoatDataRecord } from '../core/boat-motion';
import { fuelCurveFromData, isBoatFuelDataRecord, type FuelCurve } from '../core/fuel';
import { friendlyParamsFromData, isFriendlyFireDataRecord, type FriendlyParams } from '../core/friendly';
import { damageParamsFromData, isBoatDamageDataRecord, isEnemyGunneryDataRecord, type DamageParams, type EnemyGunneryDataRecord } from '../core/gunnery';
import { isEnemyAircraftEventRecord, isSeaplaneDataRecord, seaplaneParamsFromData, type SeaplaneParams } from '../core/seaplane-data';
import { isShoreBatteryDataRecord, shoreBatteryParamsFromData, type ShoreBatteryParams } from '../core/shore-battery';
import { escortParamsFromData, type EscortParams } from '../core/escort';
import { isEnemyAiDataRecord, type EnemyAiDataRecord } from '../core/ship-ai';
import { bargeParamsFromData, isBargeDataRecord, type BargeParams } from '../core/barge-data';
import { gunBatteryParamsFromData, isGunBatteryDataRecord, type GunBatteryParams } from '../core/gun-battery';
import { isScoringDataRecord, scoringParamsFromData, type ScoringParams } from '../core/scoring';
import { groundingParamsFromData, isGroundingDataRecord, type GroundingParams } from '../core/shallows';
import { isBoatSmokeDataRecord, smokeParamsFromData, type SmokeParams } from '../core/smoke';
import { isAimAssistLevels, type AimAssistLevel } from '../core/progress';
import { isStormDataRecord, stormParamsFromData, type StormParams } from '../core/storm';
import { crewEffectsFromData, crewParamsFromData, isBoatCrewDataRecord, type CrewEffects, type CrewParams } from '../core/crew';
import { RAID_EVENT_ID, isRaidDataRecord, raidParamsFromData, type RaidParams } from '../core/sortie';
import { isTorpedoDataRecord, type TorpedoDataRecord, type TorpedoReliability } from '../core/torpedo';
import { type MoonPhase, type VisibilityParams } from '../core/visibility';
import { ktToMps } from '../core/units';
import { isNum, type PrototypeMission } from './mission-data';

export const gameData = {
  boats,
  torpedoes,
  enemies,
  hitRateModel,
  riskEvents,
  missionsSeed,
  scoring,
} as const;

export type GameData = typeof gameData;

/** Boot が Registry に置いた後、各シーンはこれで取り出す */
export function getGameData(registry: { get(key: string): unknown }, key: string): GameData {
  const data = registry.get(key);
  if (!data) {
    throw new Error(`gameData が Registry にありません（key=${key}）。Boot シーンを先に通してください`);
  }
  return data as GameData;
}

export { getPrototypeMission, type PrototypeMission } from './mission-data';

/** boats.json から id で艇レコードを引く。運動に必要なフィールドが無ければ例外 */
export function getBoatRecord(data: GameData, boatId: string): BoatDataRecord {
  const b = data.boats.boats.find((x) => x.id === boatId);
  if (!b || !isBoatDataRecord(b)) throw new Error(`boats.json の ${boatId} が無いか、運動フィールドが欠けている`);
  return b;
}

/** boats.json の魚雷搭載数 */
export function getBoatTorpedoCount(data: GameData, boatId: string): number {
  const b = data.boats.boats.find((x) => x.id === boatId) as Record<string, unknown> | undefined;
  const t = b?.['torpedoes'] as Record<string, unknown> | undefined;
  if (!t || !isNum(t['count'])) throw new Error(`boats.json の ${boatId}.torpedoes.count が無い`);
  return t['count'];
}

/** torpedoes.json から id で魚雷レコードを引く */
export function getTorpedoRecord(data: GameData, torpedoId: string): TorpedoDataRecord {
  const t = data.torpedoes.torpedoes.find((x) => x.id === torpedoId);
  if (!t || !isTorpedoDataRecord(t)) throw new Error(`torpedoes.json の ${torpedoId} が無いか、settings/reliability が欠けている`);
  return t;
}

/** enemies.json の 1 レコードのうち v0.2 で使う部分（船体＋AI＋反撃） */
export interface EnemyDataRecord extends EnemyAiDataRecord, EnemyGunneryDataRecord {
  length_m: number;
  beam_m: number;
  hull_circles: number;
  torpedo_hits_to_sink: number;
}

export function getEnemyRecord(data: GameData, enemyId: string): EnemyDataRecord {
  const e = data.enemies.enemies.find((x) => x.id === enemyId) as Record<string, unknown> | undefined;
  if (!e) throw new Error(`enemies.json に ${enemyId} が無い`);
  const keys = ['length_m', 'beam_m', 'hull_circles', 'torpedo_hits_to_sink'] as const;
  for (const k of keys) if (!isNum(e[k])) throw new Error(`enemies.json の ${enemyId}.${k} が無い`);
  if (!isEnemyAiDataRecord(e)) {
    throw new Error(`enemies.json の ${enemyId} に speed/turn_rate/accel/detection/evasion/ram/patrol のどれかが欠けている（docs/02 §6.4）`);
  }
  if (!isEnemyGunneryDataRecord(e)) {
    throw new Error(`enemies.json の ${enemyId} に guns/searchlight/starshell のフィールドが欠けている（docs/02 §6.5）`);
  }
  return {
    length_m: e['length_m'] as number,
    beam_m: e['beam_m'] as number,
    hull_circles: e['hull_circles'] as number,
    torpedo_hits_to_sink: e['torpedo_hits_to_sink'] as number,
    speed_typical_kt: e.speed_typical_kt,
    speed_max_kt: e.speed_max_kt,
    turn_rate_deg_s: e.turn_rate_deg_s,
    accel_mps2: e.accel_mps2,
    detection: e.detection,
    evasion: e.evasion,
    ram: e.ram,
    patrol: e.patrol,
    guns: e.guns,
    searchlight: e.searchlight,
    starshell: e.starshell,
  };
}

/** boats.json の煙幕パラメータ。発生器が無い艇なら null */
export function getBoatSmokeParams(data: GameData, boatId: string): SmokeParams | null {
  const b = data.boats.boats.find((x) => x.id === boatId);
  if (!b || !isBoatSmokeDataRecord(b)) throw new Error(`boats.json の ${boatId} に smoke_generator / smoke.* が無い（docs/02 §5）`);
  return smokeParamsFromData(b);
}

/** risk_events.json の grounding.params（安全速力・警告の先読み秒。docs/02 §6.8）。無ければ例外 */
export function getGroundingParams(data: GameData): GroundingParams {
  const g = data.riskEvents.events.find((e) => e.id === 'grounding');
  if (!g || !isGroundingDataRecord(g)) throw new Error('risk_events.json の grounding に params.safe_speed_kt / warn_lookahead_s が無い（docs/02 §6.8）');
  return groundingParamsFromData(g);
}

/** risk_events.json の friendly_fire.params（味方機。docs/02 §6.8）。任務に friendly_aircraft が無ければ null、params が無ければ例外 */
export function getFriendlyParams(data: GameData, mission: PrototypeMission, timeScale: number): FriendlyParams | null {
  if (!mission.friendlyAircraft) return null;
  const f = data.riskEvents.events.find((e) => e.id === 'friendly_fire');
  if (!f || !isFriendlyFireDataRecord(f)) throw new Error('risk_events.json の friendly_fire に params（window_s ほか）が無い（docs/02 §6.8）');
  return friendlyParamsFromData(f, mission.friendlyAircraft.triggerEdgeM, mission.returnPoint.radiusM, timeScale);
}

/** enemies.json の水上機と risk_events.json の enemy_aircraft.params（docs/02 §6.8、v0.4.1）。任務に enemy_aircraft が無ければ null。機体・params が無ければ例外。boat は航跡の速力の検査と命中半径に使う */
export function getSeaplaneParams(data: GameData, mission: PrototypeMission, timeScale: number, boat: { silentMaxKt: number; halfLengthM: number; halfBeamM: number }): SeaplaneParams | null {
  if (!mission.enemyAircraft) return null;
  const plane = data.enemies.enemies.find((e) => e.id === mission.enemyAircraft!.enemyId);
  if (!plane || !isSeaplaneDataRecord(plane)) throw new Error(`enemies.json に ${mission.enemyAircraft.enemyId}（speed_kt / altitude_m / flare / bomb / detection）が無い（docs/02 §6.8）`);
  const ev = data.riskEvents.events.find((e) => e.id === 'enemy_aircraft');
  if (!ev || !isEnemyAircraftEventRecord(ev)) throw new Error('risk_events.json の enemy_aircraft に params（patrol_from_s ほか）が無い（docs/02 §6.8）');
  return seaplaneParamsFromData(plane, ev, timeScale, boat);
}

/** enemies.json の大発と任務の barges（docs/02 §6.4、v0.4.2）。任務に barges が無ければ null。値が欠けていれば例外 */
export function getBargeParams(data: GameData, mission: PrototypeMission): BargeParams | null {
  if (!mission.barges) return null;
  const rec = data.enemies.enemies.find((e) => e.id === mission.enemyId);
  if (!rec || !isBargeDataRecord(rec)) throw new Error(`enemies.json の ${mission.enemyId} に大発の値（length_m / speed_* / detection / evasion.beach_fan_deg / guns 1 種）が無い（docs/02 §6.4）`);
  const w = data.hitRateModel.world;
  return bargeParamsFromData(rec, mission.barges, mission.enemyCount, { hitScale: w.hit_scale, spriteScale: w.sprite_scale, timeScale: w.time_scale }, mission.bounds, data.hitRateModel.visibility.detect_hold_s);
}

/** boats.json の gun_battery（艇の砲。v0.4.2）。主兵装が guns の任務だけ（それ以外は null）。無ければ例外 */
export function getGunBatteryParams(data: GameData, mission: PrototypeMission): GunBatteryParams | null {
  if (mission.mainWeapon !== 'guns') return null;
  const b = data.boats.boats.find((x) => x.id === mission.playerBoatId) as Record<string, unknown> | undefined;
  const g = b?.['gun_battery'];
  if (!isGunBatteryDataRecord(g)) throw new Error(`boats.json の ${mission.playerBoatId}.gun_battery（label_ja / range_m / effective_m / dead_cone_deg / muzzle_flash_reveal_m / spread_factor / groups）が無い（docs/02 §6.4）`);
  return gunBatteryParamsFromData(g);
}

/** risk_events.json の shore_battery.params と任務の shore_battery（docs/02 §6.8、v0.4.3）。任務に無ければ null。params が無ければ例外。1 門目だけ（全門は getShoreBatteryParamsList） */
export function getShoreBatteryParams(data: GameData, mission: PrototypeMission): ShoreBatteryParams | null {
  return getShoreBatteryParamsList(data, mission)[0] ?? null;
}

/** 沿岸砲の全門（v0.4.5。ハードなら hard.extra_shore_battery_x_m のぶん増える）。任務に無ければ [] */
export function getShoreBatteryParamsList(data: GameData, mission: PrototypeMission): ShoreBatteryParams[] {
  if (!mission.shoreBattery) return [];
  const rec = data.riskEvents.events.find((e) => e.id === 'shore_battery') as Record<string, unknown> | undefined;
  const p = rec?.['params'];
  if (!isShoreBatteryDataRecord(p)) throw new Error('risk_events.json の shore_battery に params（gun / base_detect_m / inland_m）が無い（docs/02 §6.8）');
  return mission.shoreBatteryXs.map((x) => shoreBatteryParamsFromData(p, x, mission.bounds.height, mission.bounds.width, data.hitRateModel.visibility.detect_hold_s));
}

/** 任務の escort と boats.json の同型艇（docs/02 §6.4、v0.4.4）。任務に escort が無ければ null。艇の運動・HP が欠けていれば例外 */
export function getEscortParams(data: GameData, mission: PrototypeMission): EscortParams | null {
  if (!mission.escort) return null;
  const b = getBoatRecord(data, mission.escort.boat);
  const hp = (b as unknown as Record<string, unknown>)['hull_hp'];
  if (!isNum(hp)) throw new Error(`boats.json の ${mission.escort.boat}.hull_hp が無い（僚艇の HP。docs/02 §6.4）`);
  const w = data.hitRateModel.world;
  return escortParamsFromData(mission.escort, { speedMaxMps: ktToMps(b.speed_max_kt), accelMps2: b.accel_mps2, turnRateDegS: b.turn_rate_deg_s, lengthM: b.length_m, beamM: b.beam_m, maxHp: hp }, w.hit_scale, w.sprite_scale);
}

/** risk_events.json の storm.params と任務の storm（docs/02 §6.8、v0.3.4）。任務に storm が無ければ null。艇の sea_state_limit が無ければ例外 */
export function getStormParams(data: GameData, mission: PrototypeMission, timeScale: number): StormParams | null {
  if (!mission.storm) return null;
  const rec = data.riskEvents.events.find((e) => e.id === 'storm');
  if (!rec || !isStormDataRecord(rec)) throw new Error('risk_events.json の storm に params（safe_speed_kt ほか）が無い（docs/02 §6.8）');
  const boat = getBoatRecord(data, mission.playerBoatId) as unknown as Record<string, unknown>;
  const limit = boat['sea_state_limit'];
  if (!isNum(limit)) throw new Error(`boats.json の ${mission.playerBoatId}.sea_state_limit が無い（docs/02 §6.8）`);
  return stormParamsFromData(rec, mission.storm, { speedMaxKt: boat['speed_max_kt'] as number, seaStateLimit: limit }, timeScale, mission.bounds, mission.playerStart.y);
}

/** risk_events.json の harbor_fire_explosion.params（出撃前の港内空襲。docs/02 §6.8、v0.4.0）。任務の hazards に無ければ null。params が無い・壊れていれば例外 */
export function getRaidParams(data: GameData, mission: PrototypeMission): RaidParams | null {
  if (!mission.hazards.includes(RAID_EVENT_ID)) return null;
  const r = data.riskEvents.events.find((e) => e.id === RAID_EVENT_ID);
  if (!r || !isRaidDataRecord(r)) throw new Error('risk_events.json の harbor_fire_explosion に params（chance / disperse_fuel_factor / stay_hit_chance / stay_hit_damage / stay_hit_fire）が無い（docs/02 §6.8）');
  return raidParamsFromData(r, getBoatDamageParams(data, mission.playerBoatId));
}

/** boats.json の乗員（定員と HP あたりの死傷率。docs/02 §6.6、v0.3.4） */
export function getBoatCrewParams(data: GameData, boatId: string): CrewParams {
  const b = data.boats.boats.find((x) => x.id === boatId);
  if (!b || !isBoatCrewDataRecord(b)) throw new Error(`boats.json の ${boatId} に crew / hull_hp / damage.casualties_per_hp / damage.crew_effects が無い（docs/02 §6.6。v0.3.5 から crew_effects も必須）`);
  return crewParamsFromData(b);
}

/** boats.json の damage.crew_effects（乗員の減りが消火・旋回・加速に効く度合い。docs/02 §6.6、v0.3.5） */
export function getBoatCrewEffects(data: GameData, boatId: string): CrewEffects {
  const b = data.boats.boats.find((x) => x.id === boatId);
  if (!b || !isBoatCrewDataRecord(b)) throw new Error(`boats.json の ${boatId} に damage.crew_effects（extinguish_exponent / turn_rate_per_loss / accel_per_loss / min_factor）が無い（docs/02 §6.6）`);
  return crewEffectsFromData(b);
}

/** 任務に積む燃料 gal。?debug&fuel= の上書きがあれば艇の容量で頭打ちにして使う（MissionWorld と HUD の表示で同じ値になるようここで決める） */
export function effectiveFuelAllotmentGal(data: GameData, mission: PrototypeMission, debugOverrideGal: number): number {
  if (!Number.isFinite(debugOverrideGal)) return mission.fuelAllotmentGal;
  return Math.min(debugOverrideGal, getBoatFuelCurve(data, mission.playerBoatId).capacityGal);
}

/** scoring.json の配点（docs/02 §6.9）。距離帯の名前が hit_rate_model.kpi_by_range と一致しなければ例外 */
export function getScoringParams(data: GameData): ScoringParams {
  if (!isScoringDataRecord(data.scoring)) throw new Error('scoring.json に survival / objective_by_type / hit / fuel / crew / kill が無い（docs/02 §6.9）');
  return scoringParamsFromData(
    data.scoring,
    data.hitRateModel.kpi_by_range.map((b) => b.band),
  );
}

/** boats.json の燃料曲線（fuel_capacity_gal・fuel_hours_*・fuel_idle_ratio・速力。docs/02 §6.7）。欠けていれば例外 */
export function getBoatFuelCurve(data: GameData, boatId: string): FuelCurve {
  const b = data.boats.boats.find((x) => x.id === boatId);
  if (!b || !isBoatFuelDataRecord(b)) throw new Error(`boats.json の ${boatId} に fuel_capacity_gal / fuel_hours_* / fuel_idle_ratio が無い（docs/02 §6.7）`);
  return fuelCurveFromData(b);
}

/** boats.json の被害パラメータ（hull_hp と damage.*） */
export function getBoatDamageParams(data: GameData, boatId: string): DamageParams {
  const b = data.boats.boats.find((x) => x.id === boatId);
  if (!b || !isBoatDamageDataRecord(b)) throw new Error(`boats.json の ${boatId} に hull_hp / damage.* が無い（docs/02 §6.6）`);
  return damageParamsFromData(b);
}

/**
 * 視界パラメータ（docs/02 §6.5）: hit_rate_model.visibility に月齢を当て、史実モード（v0.5.2 で Title の切り替え。省けば data の enabled_default）なら発見距離の倍率を掛ける。
 * 起動時に 1 回作り、以後は数値だけ読む（§7）。
 */
export function getVisibilityParams(data: GameData, moon: MoonPhase, historical: boolean = data.hitRateModel.historical_mode.enabled_default): VisibilityParams {
  const v = data.hitRateModel.visibility;
  const hm = data.hitRateModel.historical_mode;
  return {
    visPlayerBaseM: v.vis_player_base_m,
    moonFactor: v.moon_factor[moon],
    speedFactor: v.speed_factor,
    smokeFactor: v.smoke_factor,
    detectHoldS: v.detect_hold_s,
    detectionMultiplier: historical ? hm.enemy_detection_multiplier : 1,
  };
}

/** 史実モード（省けば data の enabled_default）なら回避の倍率（見張り・転舵に掛け、反応遅れを割る）、そうでなければ 1 */
export function getEvasionMultiplier(data: GameData, historical: boolean = data.hitRateModel.historical_mode.enabled_default): number {
  const hm = data.hitRateModel.historical_mode;
  return historical ? hm.enemy_evasion_multiplier : 1;
}

/** 史実モードの魚雷の信頼性（v0.5.2。historical_mode.reliability が torpedoes.json の値に代わる）。0〜1 でなければ例外 */
export function getHistoricalReliability(data: GameData): TorpedoReliability {
  const r = data.hitRateModel.historical_mode.reliability;
  const ok = (x: unknown): x is number => typeof x === 'number' && x >= 0 && x <= 1;
  if (!ok(r.dud) || !ok(r.erratic)) throw new Error('hit_rate_model.historical_mode.reliability の dud / erratic は 0〜1');
  return { dud: r.dud, erratic: r.erratic };
}

/** 見越し点マーカーの段階（v0.5.2。hit_rate_model.aim_assist.levels: id・name_ja・unlock_sorties）。壊れていれば例外（起動時に分かる） */
export function getAimAssistLevels(data: GameData): AimAssistLevel[] {
  const levels = data.hitRateModel.aim_assist.levels.map((l) => ({ id: l.id, nameJa: l.name_ja, unlockSorties: l.unlock_sorties }));
  if (!isAimAssistLevels(levels)) throw new Error('hit_rate_model.aim_assist.levels は none（0 回）から unlock_sorties が増える順');
  return levels;
}
