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
  getGunBatteryParams,
  getFriendlyParams,
  getSeaplaneParams,
  getGroundingParams,
  getPrototypeMission,
  getRaidParams,
  getStormParams,
  getTorpedoRecord,
  getHistoricalReliability,
  getVisibilityParams,
  type GameData,
  getShoreBatteryParamsList,
  getEscortParams,
  type PrototypeMission,
} from '../config/game-data';
import { DEBUG_BARGES_NEAR_OFFSET } from '../config/hunt-config';
import type { ShoreBatteryParams } from '../core/shore-battery';
import type { EscortParams } from '../core/escort';
import { fixedNight, rollNight, type NightRoll } from '../core/night';
import { applyNight } from './world-night';
import { destroyerSetup, type DestroyerSetup, type TransportSetup } from './destroyer-setup';

export type { DestroyerSpec, DestroyerSetup, TransportSetup } from './destroyer-setup';
import type { MainWeapon } from '../config/mission-data';
import type { BargeParams } from '../core/barge-data';
import type { GunBatteryParams } from '../core/gun-battery';
import { boatParamsFromData, type BoatParams } from '../core/boat-motion';
import { type FuelCurve } from '../core/fuel';
import { type DamageParams } from '../core/gunnery';
import { type CrewEffects, type CrewParams } from '../core/crew';
import { type FriendlyParams } from '../core/friendly';
import type { SeaplaneParams } from '../core/seaplane-data';
import { type GroundingParams } from '../core/shallows';
import { type SmokeParams } from '../core/smoke';
import { type StormParams } from '../core/storm';
import { NO_SORTIE_EFFECT, sortieConditions, type RaidParams, type Sortie, type SortieConditions } from '../core/sortie';
import { compassJa, type BriefingNumbers } from '../core/briefing';
import { torpedoParamsFromData, torpedoReliabilityFromData, type TorpedoParams, type TorpedoReliability } from '../core/torpedo';
import { enemyDetectRangeM, playerVisRangeM, speedFactorForBand, type VisibilityParams } from '../core/visibility';

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
  /** 沿岸砲（v0.4.3。任務に shore_battery があるとき。?debug&nobattery で null）。shoreBatteries は全門（v0.4.5。ハードで増える。nobattery なら []） */
  shoreBattery: ShoreBatteryParams | null;
  shoreBatteries: ShoreBatteryParams[];
  /** 難易度ハード（v0.4.5） */
  hard: boolean;
  /** 史実モード（v0.5.2。hit_rate_model.historical_mode） */
  historical: boolean;
  /** 輸送船（v0.4.7）。任務に transport が無いか ?debug&notransport なら null */
  transport: TransportSetup | null;
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
  /** 今夜（v0.4.6。core/night）: 揺らぎ、今夜いる危険（任務の hazards から今夜いないものを除く。Briefing の「危険」）、今夜いない危険 */
  night: NightRoll;
  hazardsTonight: string[];
  absentHazards: string[];
  /** 敵の来る位置（1 隻目の駆逐艦か大発の隊の先頭の出発点。Briefing の「敵 …（北西から）」） */
  enemyFrom: { x: number; y: number } | null;
}

/** 組み立ての上書き（v0.4.6 で位置引数からまとめた。既定はすべて「上書きなし」）。fuelGal / dawnS は NaN で data の値 */
export interface SetupOptions {
  fuelGal?: number;
  dawnS?: number;
  /** 出撃（空襲の結果・難易度・夜の seed）。null なら空襲の効果なし・揺らぎなし */
  sortie?: Sortie | null;
  /** 難易度ハード（sortie があれば sortie.hard と同じでなければ例外） */
  hard?: boolean;
  /** 史実モード（v0.5.2。省けば sortie の値、sortie も無ければオフ。sortie と違えば例外） */
  historical?: boolean;
  stormOff?: boolean;
  planeOff?: boolean;
  bargesNear?: boolean;
  batteryOff?: boolean;
  /** 夜の揺らぎを掛けない（?debug&fixed。v0.4.5 と同じ世界） */
  fixedNight?: boolean;
  /** 輸送船なし（?debug&notransport。v0.4.6 と同じ世界） */
  transportOff?: boolean;
  /** 今夜いなくても出す（?debug&storm=Y・&plane・&ff） */
  forceStorm?: boolean;
  forcePlane?: boolean;
  forceFriendly?: boolean;
  /** 駆逐艦・輸送船の船体の当たり判定の倍率の上書き（?debug&shiphit=N。v0.4.8。正の数でなければ data の world.ship_hit_scale） */
  shipHitScale?: number;
}

/** data から世界の数値をすべて作る。data が壊れていれば各 getter が例外を投げる（起動時に分かる） */
export function buildWorldSetup(data: GameData, missionId: string, o: SetupOptions = {}): WorldSetup {
  const sortie = o.sortie ?? null;
  const hard = o.hard ?? false;
  const historical = o.historical ?? sortie?.historical ?? false;
  const debugFuelAllotmentGal = o.fuelGal ?? NaN;
  const debugDawnS = o.dawnS ?? NaN;
  if (sortie && sortie.missionId !== missionId) throw new Error(`出撃（${sortie.missionId}）と任務（${missionId}）が違う`);
  if (sortie && sortie.hard !== hard) throw new Error(`出撃の難易度（${sortie.hard ? 'ハード' : 'ノーマル'}）と引数が違う`);
  if (sortie && sortie.historical !== historical) throw new Error(`出撃の史実モード（${sortie.historical ? 'オン' : 'オフ'}）と引数が違う`);
  const world = data.hitRateModel.world;
  const launch = data.hitRateModel.torpedo_launch;
  const feel = data.hitRateModel.feel;
  const mission = getPrototypeMission(data, missionId, hard);
  const boatRecord = getBoatRecord(data, mission.playerBoatId);
  const torpedoRecord = getTorpedoRecord(data, mission.torpedoId);
  // 今夜（v0.4.6）: 出撃の seed があり、任務に night block があり、?debug&fixed でなければ揺らぐ
  const batteries = o.batteryOff ? [] : getShoreBatteryParamsList(data, mission);
  const events = data.riskEvents.events as readonly Record<string, unknown>[];
  // 輸送船（v0.4.7）は隊の最後の 1 隻として同じ揺らぎ（ずれ・左右反転）を受ける
  const tr = mission.transport && !o.transportOff ? mission.transport : null;
  const shipStarts = tr ? [...mission.enemyStarts, tr.start] : mission.enemyStarts;
  const night =
    sortie && mission.night && !o.fixedNight
      ? rollNight(mission.night, (id) => events.find((e) => e['id'] === id)?.['share'] as number, sortie.seed, shipStarts.length, batteries.length)
      : fixedNight(shipStarts.length, batteries.length);
  const forced = (id: string): boolean => (id === 'storm' && !!o.forceStorm) || (id === 'enemy_aircraft' && !!o.forcePlane) || (id === 'friendly_fire' && !!o.forceFriendly);
  const absentHazards = night.absentHazards.filter((id) => !forced(id));
  const absent = (id: string): boolean => absentHazards.includes(id);
  // 敵: 駆逐艦（AI・反撃の値を持つ記録）か大発の隊（v0.4.2）。発見の基準距離はその記録から。今夜のずれと左右反転を当てる（systems/world-night）
  const shipHitScale = o.shipHitScale !== undefined && o.shipHitScale > 0 ? o.shipHitScale : world.ship_hit_scale;
  const destroyer = mission.enemyStart ? destroyerSetup(data, mission.enemyStarts, mission.enemyId, mission.enemyHitsToSink, shipHitScale, historical) : null;
  const applied = applyNight(night, mission.bounds, destroyer ? shipStarts : [], destroyer ? destroyer.spec.boundsMarginM : 0, getBargeParams(data, mission), batteries);
  if (destroyer) destroyer.starts = applied.starts.slice(0, mission.enemyStarts.length);
  let transport: TransportSetup | null = null;
  if (destroyer && tr) {
    const { starts: _unused, ...rest } = destroyerSetup(data, [tr.start], tr.enemyId, null, shipHitScale, historical);
    transport = { ...rest, enemyId: tr.enemyId, start: applied.starts[applied.starts.length - 1]! };
  }
  const barges = applied.barges;
  const shoreBatteries = applied.batteries;
  const guns = getGunBatteryParams(data, mission);

  const boatParams = boatParamsFromData(boatRecord);
  const fuelCurve = getBoatFuelCurve(data, mission.playerBoatId);
  const fuelAllotmentGal = effectiveFuelAllotmentGal(data, mission, debugFuelAllotmentGal);
  if (fuelAllotmentGal > fuelCurve.capacityGal) throw new Error(`${mission.id}: fuel_allotment_gal が艇の fuel_capacity_gal を超えている`);
  const vis = getVisibilityParams(data, mission.moon, historical);
  const visRange = playerVisRangeM(vis);
  const baseDetectM = destroyer ? destroyer.baseDetectM : barges!.baseDetectM;
  const lead = barges ? { x: barges.leadX + DEBUG_BARGES_NEAR_OFFSET.dxM, y: barges.leadY + DEBUG_BARGES_NEAR_OFFSET.dyM, headingDeg: DEBUG_BARGES_NEAR_OFFSET.headingDeg } : null;

  const raid = getRaidParams(data, mission);
  const start = sortie ? sortieConditions(sortie, raid) : NO_SORTIE_EFFECT;
  return {
    mission,
    playerStart: o.bargesNear && lead ? lead : mission.playerStart,
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
    friendly: absent('friendly_fire') ? null : getFriendlyParams(data, mission, world.time_scale),
    storm: o.stormOff || absent('storm') ? null : getStormParams(data, mission, world.time_scale),
    seaplane: o.planeOff || absent('enemy_aircraft') ? null : getSeaplaneParams(data, mission, world.time_scale, { silentMaxKt: boatRecord.speed_bands_kt.silent_max, halfLengthM: (boatRecord.length_m * world.hit_scale) / 2, halfBeamM: (boatRecord.beam_m * world.hit_scale) / 2 }),
    crew: getBoatCrewParams(data, mission.playerBoatId),
    crewEffects: getBoatCrewEffects(data, mission.playerBoatId),
    destroyer,
    barges,
    guns,
    shoreBattery: shoreBatteries[0] ?? null,
    shoreBatteries,
    hard,
    historical,
    transport,
    escort: getEscortParams(data, mission),
    torpedoCapacity: mission.mainWeapon === 'guns' ? 0 : getBoatTorpedoCount(data, mission.playerBoatId),
    torpedoParams: torpedoParamsFromData(torpedoRecord, launch.arming_distance_m, launch.erratic_period_s),
    // 史実モード（v0.5.2）は不発・蛇行の確率を historical_mode.reliability で上書き（torpedoes.json の値の代わり）
    torpedoReliability: historical ? getHistoricalReliability(data) : torpedoReliabilityFromData(torpedoRecord),
    torpedoJitterDeg: torpedoRecord.reliability.jitter_deg,
    launchOffsetM: boatRecord.beam_m / 2,
    salvoIntervalS: launch.salvo_interval_s,
    smokeParams: getBoatSmokeParams(data, mission.playerBoatId),
    night,
    hazardsTonight: mission.hazards.filter((h) => !absent(h)),
    absentHazards,
    enemyFrom: destroyer ? { x: destroyer.starts[0]!.x, y: destroyer.starts[0]!.y } : barges ? { x: barges.leadX, y: barges.leadY } : null,
  };
}

/** 岸（v0.4.2 は南だけ）に接する浅瀬のいちばん海側の縁。無ければ岸の線（海域の南の縁）、岸の無い任務は NaN */
function coastEdgeYOf(m: PrototypeMission): number {
  if (!m.coast) return NaN;
  let y = m.bounds.height;
  for (const r of m.shallows) if (r.y + r.h >= m.bounds.height && r.y < y) y = r.y;
  return y;
}

/** Briefing の数値（?debug の上書き込みで Mission と同じ値）: 視程、巡航・静音で見つかる距離（雨なし）、夜明け、割当、魚雷、帰投地点と海域 */
export function briefingNumbers(s: WorldSetup, aimAssistJa: string = ''): BriefingNumbers {
  const f = s.vis.speedFactor;
  return {
    // 見越し点マーカーの解放の状態（v0.5.2）。無ければ鍵ごと省く（Briefing を作るときの 1 回だけ）
    ...(aimAssistJa ? { aimAssistJa } : {}),
    visM: playerVisRangeM(s.vis),
    detectCruiseM: enemyDetectRangeM(s.baseDetectM, f.cruise, s.vis, false),
    detectSilentM: enemyDetectRangeM(s.baseDetectM, f.silent, s.vis, false),
    durationS: s.durationS,
    fuelGal: s.fuelAllotmentGal,
    torpedoes: s.torpedoCapacity,
    gunsLabel: s.guns ? s.guns.label : '',
    enemyFromJa: s.enemyFrom ? compassJa(s.enemyFrom.x, s.enemyFrom.y, s.mission.bounds.width, s.mission.bounds.height) : '',
    homeX: s.mission.returnPoint.x,
    homeY: s.mission.returnPoint.y,
    boundsW: s.mission.bounds.width,
    boundsH: s.mission.bounds.height,
  };
}
