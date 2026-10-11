// 世界の初期化パラメータを data から組み立てる（v0.3.3 で mission-world から切り出し）。Phaser 非依存で、起動時に 1 回だけ呼ぶ。
// MissionWorld はここで作った数値だけを持ち、エンティティの生成と固定ステップに専念する。?debug の上書き（割当・夜明け）もここで決める。
import {
  effectiveFuelAllotmentGal,
  getBoatDamageParams,
  getBoatFuelCurve,
  getBoatRecord,
  getBoatSmokeParams,
  getBoatTorpedoCount,
  getEnemyRecord,
  getEvasionMultiplier,
  getFriendlyParams,
  getGroundingParams,
  getPrototypeMission,
  getTorpedoRecord,
  getVisibilityParams,
  type GameData,
  type PrototypeMission,
} from '../config/game-data';
import { boatParamsFromData, type BoatParams } from '../core/boat-motion';
import { type FuelCurve } from '../core/fuel';
import { gunneryParamsFromData, type DamageParams, type GunneryParams } from '../core/gunnery';
import { shipAiParamsFromData, type ShipAiParams } from '../core/ship-ai';
import { type FriendlyParams } from '../core/friendly';
import { type GroundingParams } from '../core/shallows';
import { type SmokeParams } from '../core/smoke';
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

export interface WorldSetup {
  mission: PrototypeMission;
  boatParams: BoatParams;
  /** 境界から押し戻す余白 m（表示上の船体半分）。煙も同じ距離だけ後ろに置く */
  boundsMarginM: number;
  /** 体当たり・着弾判定に使う自艇の半長・半幅 m（hit_scale 込み） */
  boatHalfLengthM: number;
  boatHalfBeamM: number;
  gunneryParams: GunneryParams;
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
  grounding: GroundingParams;
  /** 味方機（友軍誤射）。任務に friendly_aircraft が無ければ null */
  friendly: FriendlyParams | null;
  destroyerSpec: DestroyerSpec;
  shipAi: ShipAiParams;
  /** 外れ確定の半径二乗: 目標中心からこれより離れて遠ざかれば通過したとみなす */
  passRadius2: number;
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
export function buildWorldSetup(data: GameData, missionId: string, debugFuelAllotmentGal: number, debugDawnS: number): WorldSetup {
  const world = data.hitRateModel.world;
  const launch = data.hitRateModel.torpedo_launch;
  const feel = data.hitRateModel.feel;
  const mission = getPrototypeMission(data, missionId);
  const boatRecord = getBoatRecord(data, mission.playerBoatId);
  const enemyRecord = getEnemyRecord(data, mission.enemyId);
  const torpedoRecord = getTorpedoRecord(data, mission.torpedoId);

  const boatParams = boatParamsFromData(boatRecord);
  const fuelCurve = getBoatFuelCurve(data, mission.playerBoatId);
  const fuelAllotmentGal = effectiveFuelAllotmentGal(data, mission, debugFuelAllotmentGal);
  if (fuelAllotmentGal > fuelCurve.capacityGal) throw new Error(`${mission.id}: fuel_allotment_gal が艇の fuel_capacity_gal を超えている`);
  const vis = getVisibilityParams(data, mission.moon);
  const visRange = playerVisRangeM(vis);
  const baseDetectM = enemyRecord.detection.base_detect_m;
  const hitLen = enemyRecord.length_m * world.hit_scale;
  const hitBeam = enemyRecord.beam_m * world.hit_scale;

  return {
    mission,
    boatParams,
    boundsMarginM: (boatRecord.length_m * world.sprite_scale) / 2,
    boatHalfLengthM: (boatRecord.length_m * world.hit_scale) / 2,
    boatHalfBeamM: (boatRecord.beam_m * world.hit_scale) / 2,
    gunneryParams: gunneryParamsFromData(enemyRecord),
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
    grounding: getGroundingParams(data),
    friendly: getFriendlyParams(data, mission, world.time_scale),
    destroyerSpec: {
      lengthM: enemyRecord.length_m,
      beamM: enemyRecord.beam_m,
      hullCircles: enemyRecord.hull_circles,
      hitsToSink: mission.enemyHitsToSink ?? enemyRecord.torpedo_hits_to_sink,
      hitScale: world.hit_scale,
      boundsMarginM: (enemyRecord.length_m * world.sprite_scale) / 2,
    },
    shipAi: shipAiParamsFromData(enemyRecord, getEvasionMultiplier(data)),
    passRadius2: (hitLen / 2 + hitBeam) * (hitLen / 2 + hitBeam),
    torpedoCapacity: getBoatTorpedoCount(data, mission.playerBoatId),
    torpedoParams: torpedoParamsFromData(torpedoRecord, launch.arming_distance_m, launch.erratic_period_s),
    torpedoReliability: torpedoReliabilityFromData(torpedoRecord),
    torpedoJitterDeg: torpedoRecord.reliability.jitter_deg,
    launchOffsetM: boatRecord.beam_m / 2,
    salvoIntervalS: launch.salvo_interval_s,
    smokeParams: getBoatSmokeParams(data, mission.playerBoatId),
  };
}

