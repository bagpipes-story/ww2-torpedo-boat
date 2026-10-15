// 世界の初期化パラメータを data から組み立てる（v0.3.3 で mission-world から切り出し）。Phaser 非依存で、起動時に 1 回だけ呼ぶ。
// MissionWorld はここで作った数値だけを持ち、エンティティの生成と固定ステップに専念する。?debug の上書き（割当・夜明け）と出撃時の状態（港内空襲。v0.4.0）もここで決める。
import {
  effectiveFuelAllotmentGal,
  getBoatDamageParams,
  getBoatFuelCurve,
  getBoatRecord,
  getBoatCrewEffects,
  getBoatCrewParams,
  getBoatSmokeParams,
  getBargeParams,
  getBoatTorpedoCount,
  getEnemyRecord,
  getGunBatteryParams,
  getEvasionMultiplier,
  getFriendlyParams,
  getSeaplaneParams,
  getGroundingParams,
  getPrototypeMission,
  getRaidParams,
  getStormParams,
  getTorpedoRecord,
  getVisibilityParams,
  type GameData,
  getShoreBatteryParams,
  getEscortParams,
  type PrototypeMission,
} from '../config/game-data';
import { DEBUG_BARGES_NEAR_OFFSET } from '../config/hunt-config';
import type { ShoreBatteryParams } from '../core/shore-battery';
import type { EscortParams } from '../core/escort';
import type { MainWeapon } from '../config/mission-data';
import type { BargeParams } from '../core/barge-data';
import type { GunBatteryParams } from '../core/gun-battery';
import { boatParamsFromData, type BoatParams } from '../core/boat-motion';
import { type FuelCurve } from '../core/fuel';
import { gunneryParamsFromData, type DamageParams, type GunneryParams } from '../core/gunnery';
import { shipAiParamsFromData, type ShipAiParams } from '../core/ship-ai';
import { type CrewEffects, type CrewParams } from '../core/crew';
import { type FriendlyParams } from '../core/friendly';
import type { SeaplaneParams } from '../core/seaplane-data';
import { type GroundingParams } from '../core/shallows';
import { type SmokeParams } from '../core/smoke';
import { type StormParams } from '../core/storm';
import { NO_SORTIE_EFFECT, sortieConditions, type RaidParams, type Sortie, type SortieConditions } from '../core/sortie';
import type { BriefingNumbers } from '../core/briefing';
import { torpedoParamsFromData, torpedoReliabilityFromData, type TorpedoParams, type TorpedoReliability } from '../core/torpedo';
import { enemyDetectRangeM, playerVisRangeM, speedFactorForBand, type VisibilityParams } from '../core/visibility';

/** 駆逐艦の寸法と耐久（entities/destroyer が使う。型をここに置くのは、テストの tsconfig（DOM 無し）に Phaser 側を引き込まないため） */
export interface DestroyerSpec {
  lengthM: number;
  beamM: number;
  hullCircles: number;
  hitsToSink: number;
  /** 当たり判定に使う寸法の倍率（data: world.hit_scale。1=実寸） */
  hitScale: number;
  /** 海域境界から押し戻す余白 m（表示上の船体半分） */
  boundsMarginM: number;
}

/** 駆逐艦（us_02）の数値: 出発点・寸法・AI・反撃・魚雷の外れ確定の半径二乗（目標中心からこれより離れて遠ざかれば通過） */
export interface DestroyerSetup {
  start: { x: number; y: number; headingDeg: number };
  spec: DestroyerSpec;
  shipAi: ShipAiParams;
  gunnery: GunneryParams;
  passRadius2: number;
  /** 発見の基準距離（enemies.json の detection.base_detect_m） */
  baseDetectM: number;
}

export interface WorldSetup {
  mission: PrototypeMission;
  /** 自艇の出発点（?debug&barges=near で大発の隊の手前に置く。v0.4.2） */
  playerStart: { x: number; y: number; headingDeg: number };
  /** 岸（南）に接する浅瀬の北の縁 y m（「岸 N m」の矢印の行き先。浅瀬が無ければ岸の線。岸の無い任務は NaN。v0.4.2） */
  coastEdgeY: number;
  /** 主兵装（v0.4.2）。guns なら魚雷は積まない（torpedoCapacity 0） */
  mainWeapon: MainWeapon;
  boatParams: BoatParams;
  /** 境界から押し戻す余白 m（表示上の船体半分）。煙も同じ距離だけ後ろに置く */
  boundsMarginM: number;
  /** 体当たり・着弾判定に使う自艇の半長・半幅 m（hit_scale 込み） */
  boatHalfLengthM: number;
  boatHalfBeamM: number;
  damageParams: DamageParams;
  timeScale: number;
  slowMoFactor: number;
  slowMoSeconds: number;
  vis: VisibilityParams;
  baseDetectM: number;
  /** 自艇の視程の二乗 */
  visRange2: number;
  /** 出発時（停止）の発見距離。最初の固定ステップが回る前のフレームでも HUD に正しく出す */
  detectRangeAtStartM: number;
  /** 夜明けまでの実秒（?debug&dawn= で上書き可） */
  durationS: number;
  fuelCurve: FuelCurve;
  /** 任務に積む燃料 gal（?debug&fuel= で上書き可、艇の容量で頭打ち） */
  fuelAllotmentGal: number;
  /** 実際に積んで出る燃料 gal（港内空襲で分散すると割当 × disperse_fuel_factor。燃料計・燃料点の 100% は fuelAllotmentGal。v0.4.0） */
  fuelStartGal: number;
  /** 出撃前の港内空襲（任務の hazards に無ければ null）と、この出撃の出撃時の状態 */
  raid: RaidParams | null;
  start: SortieConditions;
  grounding: GroundingParams;
  /** 味方機（友軍誤射）。任務に friendly_aircraft が無ければ null */
  friendly: FriendlyParams | null;
  /** 暴風の帯。任務に storm が無いか ?debug&nostorm なら null */
  storm: StormParams | null;
  /** 敵の水上機（docs/02 §6.8、v0.4.1）。任務に enemy_aircraft が無いか ?debug&noplane なら null */
  seaplane: SeaplaneParams | null;
  /** 乗員（定員と HP あたりの死傷率）と、減りが操作に効く度合い（v0.3.5） */
  crew: CrewParams;
  crewEffects: CrewEffects;
  /** 駆逐艦（任務に enemy_start があるとき）。大発の任務では null */
  destroyer: DestroyerSetup | null;
  /** 大発の隊と艇の砲（v0.4.2。任務に barges があるとき）。無ければ null */
  barges: BargeParams | null;
  guns: GunBatteryParams | null;
  /** 沿岸砲（v0.4.3。任務に shore_battery があるとき。?debug&nobattery で null） */
  shoreBattery: ShoreBatteryParams | null;
  /** 僚艇（v0.4.4。任務に escort があるとき。駆逐艦の任務だけ） */
  escort: EscortParams | null;
  torpedoCapacity: number;
  torpedoParams: TorpedoParams;
  torpedoReliability: TorpedoReliability;
  torpedoJitterDeg: number;
  /** 舷側オフセット m（艇幅の半分） */
  launchOffsetM: number;
  salvoIntervalS: number;
  /** 煙幕発生器が無い艇なら null */
  smokeParams: SmokeParams | null;
}

/** data から世界の数値をすべて作る。data が壊れていれば各 getter が例外を投げる（起動時に分かる） */
export function buildWorldSetup(data: GameData, missionId: string, debugFuelAllotmentGal: number, debugDawnS: number, debugStormOff: boolean = false, sortie: Sortie | null = null, debugPlaneOff: boolean = false, debugBargesNear: boolean = false, debugBatteryOff: boolean = false): WorldSetup {
  if (sortie && sortie.missionId !== missionId) throw new Error(`出撃（${sortie.missionId}）と任務（${missionId}）が違う`);
  const world = data.hitRateModel.world;
  const launch = data.hitRateModel.torpedo_launch;
  const feel = data.hitRateModel.feel;
  const mission = getPrototypeMission(data, missionId);
  const boatRecord = getBoatRecord(data, mission.playerBoatId);
  const torpedoRecord = getTorpedoRecord(data, mission.torpedoId);
  // 敵: 駆逐艦（AI・反撃の値を持つ記録）か大発の隊（v0.4.2）。発見の基準距離はその記録から
  const destroyer = mission.enemyStart ? destroyerSetup(data, mission.enemyStart, mission.enemyId, mission.enemyHitsToSink) : null;
  const barges = getBargeParams(data, mission);
  const guns = getGunBatteryParams(data, mission);

  const boatParams = boatParamsFromData(boatRecord);
  const fuelCurve = getBoatFuelCurve(data, mission.playerBoatId);
  const fuelAllotmentGal = effectiveFuelAllotmentGal(data, mission, debugFuelAllotmentGal);
  if (fuelAllotmentGal > fuelCurve.capacityGal) throw new Error(`${mission.id}: fuel_allotment_gal が艇の fuel_capacity_gal を超えている`);
  const vis = getVisibilityParams(data, mission.moon);
  const visRange = playerVisRangeM(vis);
  const baseDetectM = destroyer ? destroyer.baseDetectM : barges!.baseDetectM;
  const lead = barges ? { x: barges.leadX + DEBUG_BARGES_NEAR_OFFSET.dxM, y: barges.leadY + DEBUG_BARGES_NEAR_OFFSET.dyM, headingDeg: DEBUG_BARGES_NEAR_OFFSET.headingDeg } : null;

  const raid = getRaidParams(data, mission);
  const start = sortie ? sortieConditions(sortie, raid) : NO_SORTIE_EFFECT;
  return {
    mission,
    playerStart: debugBargesNear && lead ? lead : mission.playerStart,
    coastEdgeY: coastEdgeYOf(mission),
    mainWeapon: mission.mainWeapon,
    boatParams,
    boundsMarginM: (boatRecord.length_m * world.sprite_scale) / 2,
    boatHalfLengthM: (boatRecord.length_m * world.hit_scale) / 2,
    boatHalfBeamM: (boatRecord.beam_m * world.hit_scale) / 2,
    damageParams: getBoatDamageParams(data, mission.playerBoatId),
    timeScale: world.time_scale,
    slowMoFactor: feel.hit_slowmo_factor,
    slowMoSeconds: feel.hit_slowmo_seconds,
    vis,
    baseDetectM,
    visRange2: visRange * visRange,
    detectRangeAtStartM: enemyDetectRangeM(baseDetectM, speedFactorForBand('stop', vis.speedFactor), vis, false),
    durationS: Number.isFinite(debugDawnS) ? debugDawnS : mission.durationS,
    fuelCurve,
    fuelAllotmentGal,
    fuelStartGal: fuelAllotmentGal * start.fuelFactor,
    raid,
    start,
    grounding: getGroundingParams(data),
    friendly: getFriendlyParams(data, mission, world.time_scale),
    storm: debugStormOff ? null : getStormParams(data, mission, world.time_scale),
    seaplane: debugPlaneOff ? null : getSeaplaneParams(data, mission, world.time_scale, { silentMaxKt: boatRecord.speed_bands_kt.silent_max, halfLengthM: (boatRecord.length_m * world.hit_scale) / 2, halfBeamM: (boatRecord.beam_m * world.hit_scale) / 2 }),
    crew: getBoatCrewParams(data, mission.playerBoatId),
    crewEffects: getBoatCrewEffects(data, mission.playerBoatId),
    destroyer,
    barges,
    guns,
    shoreBattery: debugBatteryOff ? null : getShoreBatteryParams(data, mission),
    escort: getEscortParams(data, mission),
    torpedoCapacity: mission.mainWeapon === 'guns' ? 0 : getBoatTorpedoCount(data, mission.playerBoatId),
    torpedoParams: torpedoParamsFromData(torpedoRecord, launch.arming_distance_m, launch.erratic_period_s),
    torpedoReliability: torpedoReliabilityFromData(torpedoRecord),
    torpedoJitterDeg: torpedoRecord.reliability.jitter_deg,
    launchOffsetM: boatRecord.beam_m / 2,
    salvoIntervalS: launch.salvo_interval_s,
    smokeParams: getBoatSmokeParams(data, mission.playerBoatId),
  };
}

/** 岸（v0.4.2 は南だけ）に接する浅瀬のいちばん海側の縁。無ければ岸の線（海域の南の縁）、岸の無い任務は NaN */
function coastEdgeYOf(m: PrototypeMission): number {
  if (!m.coast) return NaN;
  let y = m.bounds.height;
  for (const r of m.shallows) if (r.y + r.h >= m.bounds.height && r.y < y) y = r.y;
  return y;
}

/** 駆逐艦の数値（enemies.json の AI・反撃を持つ記録）。v0.4.2 で buildWorldSetup から切り出し（中身は v0.4.1 のまま） */
function destroyerSetup(data: GameData, start: DestroyerSetup['start'], enemyId: string, hitsOverride: number | null): DestroyerSetup {
  const world = data.hitRateModel.world;
  const r = getEnemyRecord(data, enemyId);
  const hitLen = r.length_m * world.hit_scale;
  const hitBeam = r.beam_m * world.hit_scale;
  return {
    start,
    spec: { lengthM: r.length_m, beamM: r.beam_m, hullCircles: r.hull_circles, hitsToSink: hitsOverride ?? r.torpedo_hits_to_sink, hitScale: world.hit_scale, boundsMarginM: (r.length_m * world.sprite_scale) / 2 },
    shipAi: shipAiParamsFromData(r, getEvasionMultiplier(data)),
    gunnery: gunneryParamsFromData(r),
    passRadius2: (hitLen / 2 + hitBeam) * (hitLen / 2 + hitBeam),
    baseDetectM: r.detection.base_detect_m,
  };
}

/** Briefing の数値（?debug の上書き込みで Mission と同じ値）: 視程、巡航・静音で見つかる距離（雨なし）、夜明け、割当、魚雷、帰投地点と海域 */
export function briefingNumbers(s: WorldSetup): BriefingNumbers {
  const f = s.vis.speedFactor;
  return {
    visM: playerVisRangeM(s.vis),
    detectCruiseM: enemyDetectRangeM(s.baseDetectM, f.cruise, s.vis, false),
    detectSilentM: enemyDetectRangeM(s.baseDetectM, f.silent, s.vis, false),
    durationS: s.durationS,
    fuelGal: s.fuelAllotmentGal,
    torpedoes: s.torpedoCapacity,
    gunsLabel: s.guns ? s.guns.label : '',
    homeX: s.mission.returnPoint.x,
    homeY: s.mission.returnPoint.y,
    boundsW: s.mission.bounds.width,
    boundsH: s.mission.bounds.height,
  };
}
