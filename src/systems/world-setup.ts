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
import { seaplaneNightSetupPart, seaplaneParamsFor } from '../config/seaplane-mission-data';
import { missionCampaignId } from '../config/campaign-data';
import { getAirStrikeParams, getDawnAir } from '../config/dawn-data';
import { getPtParams } from '../config/pt-mission-data';
import { getConvoyParams } from '../config/convoy-mission-data';
import { engineSetupPart } from '../config/engine-mission-data';
import { gunboatSetupPart } from '../config/gunboat-mission-data';
import { patrolAirSetupPart } from '../config/patrol-air-mission-data';
import { landingSetupPart } from '../config/landing-mission-data';
import { allyDestroyerSetupPart } from '../config/ally-destroyer-mission-data';
import { evacSetupPart } from '../config/evac-mission-data';
import { radarSetupPart } from '../config/radar-mission-data';
import { transitNightRolls, transitSetupPart } from '../config/transit-mission-data';
import { shoresSetupPart } from '../config/shores-mission-data';
import { anchorSetupPart, getAnchorParams } from '../config/anchor-mission-data';
import { backdropSetupPart } from '../config/backdrop-mission-data';
import { reconSetupPart } from '../config/recon-mission-data';
import { rescueMoonFactor, rescueSetupPart } from '../config/rescue-mission-data';
import { minefieldSetupPart } from '../config/minefield-mission-data';
import { fixedNight, rollNight } from '../core/night';
import { applyConvoyNight, applyNight, applyPtNight } from './world-night';
import { destroyerSetup, picketSetup, type TransportSetup } from './destroyer-setup';

export type { DestroyerSpec, DestroyerSetup, PicketSetup, TransportSetup } from './destroyer-setup';
export type { SetupOptions, WorldSetup } from './world-setup-types'; // 型は world-setup-types.ts（v0.6.7 S0 で移した。今までの import のため）
export { briefingNumbers } from './briefing-numbers'; // Briefing の数値（v0.6.3 で briefing-numbers.ts へ。今までの import のため）
import { boatParamsFromData } from '../core/boat-motion';
import { NO_SORTIE_EFFECT, sortieConditions } from '../core/sortie';
import { torpedoParamsFromData, torpedoReliabilityFromData } from '../core/torpedo';
import { enemyDetectRangeM, playerVisRangeM, speedFactorForBand } from '../core/visibility';
import type { SetupOptions, WorldSetup } from './world-setup-types';

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
  // 輸送船（v0.4.7）は駆逐艦の後ろの 1 隻として同じ揺らぎ（ずれ・左右反転）を受ける（v0.8.1 からハードの駆潜艇がその後ろに並ぶ）
  const tr = mission.transport && !o.transportOff ? mission.transport : null;
  const anchor = getAnchorParams(data, mission); // 止まった艦（v0.8.1。us_06 だけ）。ハードの駆潜艇は隊の最後（輸送船の後ろ）に 1 隻ずつ揺らぎを受ける（無い任務は null＝引く回数は同じ）
  const shipStarts = [...mission.enemyStarts, ...(tr ? [tr.start] : []), ...(anchor?.pickets?.starts ?? [])];
  const ptBase = getPtParams(data, mission, world.time_scale);
  const enemyRolls = shipStarts.length + (ptBase ? 1 : 0) + transitNightRolls(data, mission); // 米PT の隊（v0.6.3）と列の通過（v0.8.0。us_04）は隊・列ごと 1 件の敵として揺らす（無い任務の回数は同じ）
  const night =
    sortie && mission.night && !o.fixedNight
      ? rollNight(mission.night, (id) => events.find((e) => e['id'] === id)?.['share'] as number, sortie.seed, enemyRolls, batteries.length)
      : fixedNight(enemyRolls, batteries.length);
  const forced = (id: string): boolean => (id === 'storm' && !!o.forceStorm) || (id === 'enemy_aircraft' && !!o.forcePlane) || (id === 'friendly_fire' && !!o.forceFriendly);
  const absentHazards = night.absentHazards.filter((id) => !forced(id));
  const absent = (id: string): boolean => absentHazards.includes(id);
  // 敵: 駆逐艦（AI・反撃の値を持つ記録）か大発の隊（v0.4.2）。発見の基準距離はその記録から。今夜のずれと左右反転を当てる（systems/world-night）
  const shipHitScale = o.shipHitScale !== undefined && o.shipHitScale > 0 ? o.shipHitScale : world.ship_hit_scale;
  // 列の通過（v0.8.0。us_04・v0.8.2 の片道の列 us_05）。今夜の揺らぎは駆逐艦の後の 1 件。片道の列（transit.column）は enemy_start の無い列だけの隊（D-C2）＝撃沈の達成は全隻（R3）
  const transitPart = transitSetupPart(data, mission, night.enemyOffsets[shipStarts.length] ?? null, historical, { shipHitScale, magazineBoom: o.magazineBoom });
  const column = transitPart.transit?.column !== undefined;
  const destroyer = mission.enemyStart || column ? { ...destroyerSetup(data, mission.enemyStarts, mission.enemyId, mission.enemyHitsToSink, shipHitScale, historical), objectiveSinks: mission.objectiveSinkCount ?? (column ? transitPart.transit!.ships : mission.enemyStarts.length) } : null;
  const applied = applyNight(night, mission.bounds, destroyer ? shipStarts : [], destroyer ? destroyer.spec.boundsMarginM : 0, getBargeParams(data, mission), batteries);
  if (destroyer) destroyer.starts = applied.starts.slice(0, mission.enemyStarts.length);
  let transport: TransportSetup | null = null;
  if (destroyer && tr) {
    const { starts: _unused, ...rest } = destroyerSetup(data, [tr.start], tr.enemyId, null, shipHitScale, historical);
    transport = { ...rest, enemyId: tr.enemyId, start: applied.starts[mission.enemyStarts.length]! };
  }
  const pk = anchor?.pickets ?? null;
  const pickets = destroyer && pk ? picketSetup(data, applied.starts.slice(mission.enemyStarts.length + (tr ? 1 : 0)), pk.enemyId, shipHitScale, historical) : null;
  const barges = applied.barges;
  const ptBoats = ptBase ? applyPtNight(night, ptBase) : null;
  const convoyBase = getConvoyParams(data, mission);
  const shoreBatteries = applied.batteries;
  const guns = getGunBatteryParams(data, mission);
  const escort = getEscortParams(data, mission);

  const boatParams = boatParamsFromData(boatRecord);
  const fuelCurve = getBoatFuelCurve(data, mission.playerBoatId);
  const fuelAllotmentGal = effectiveFuelAllotmentGal(data, mission, debugFuelAllotmentGal);
  if (fuelAllotmentGal > fuelCurve.capacityGal) throw new Error(`${mission.id}: fuel_allotment_gal が艇の fuel_capacity_gal を超えている`);
  const vis = getVisibilityParams(data, mission.moon, historical, rescueMoonFactor(data, mission)); // 昼の倍率（v0.8.5 S0。us_07 の rescue.daylight だけ。無い任務は今の月の係数）
  const visRange = playerVisRangeM(vis);
  const baseDetectM = destroyer ? destroyer.baseDetectM : barges ? barges.baseDetectM : ptBoats ? ptBoats.baseDetectM : visRange; // 艦艇のいない夜の哨戒機の任務（v0.6.7。jp_02）は自艇の視程
  const lead = barges ? { x: barges.leadX + DEBUG_BARGES_NEAR_OFFSET.dxM, y: barges.leadY + DEBUG_BARGES_NEAR_OFFSET.dyM, headingDeg: DEBUG_BARGES_NEAR_OFFSET.headingDeg } : null;

  const raid = getRaidParams(data, mission);
  const start = sortie ? sortieConditions(sortie, raid) : NO_SORTIE_EFFECT;
  const landingPart = landingSetupPart(data, mission, ptBase, ptBoats, o);
  // 敵の水上機（v0.4.1）。任務の enemy_aircraft の params の上書き（v0.8.1 IP2。us_06 だけ。無ければ getSeaplaneParams のまま）は config/seaplane-mission-data
  const seaplane = o.planeOff || absent('enemy_aircraft') ? null : seaplaneParamsFor(data, mission, world.time_scale, { silentMaxKt: boatRecord.speed_bands_kt.silent_max, halfLengthM: (boatRecord.length_m * world.hit_scale) / 2, halfBeamM: (boatRecord.beam_m * world.hit_scale) / 2 });
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
    seaplane,
    crew: getBoatCrewParams(data, mission.playerBoatId),
    crewEffects: getBoatCrewEffects(data, mission.playerBoatId),
    destroyer,
    barges,
    guns,
    ptBoats,
    convoy: convoyBase ? applyConvoyNight(night, convoyBase, mission.bounds.width) : null,
    shoreBattery: shoreBatteries[0] ?? null,
    shoreBatteries,
    hard,
    historical,
    transport,
    escort,
    torpedoCapacity: mission.mainWeapon === 'torpedo' ? getBoatTorpedoCount(data, mission.playerBoatId) : 0,
    torpedoParams: torpedoParamsFromData(torpedoRecord, launch.arming_distance_m, launch.erratic_period_s),
    // 史実モード（v0.5.2）は不発・蛇行の確率を historical_mode.reliability で上書き（torpedoes.json の値の代わり）。v0.6.0 から reliability_campaigns（米PT）の任務だけ（日本の 45cm 魚雷には米の Mk 8 の値を掛けない）
    torpedoReliability: historical && data.hitRateModel.historical_mode.reliability_campaigns.includes(missionCampaignId(data, missionId)) ? getHistoricalReliability(data) : torpedoReliabilityFromData(torpedoRecord),
    torpedoJitterDeg: torpedoRecord.reliability.jitter_deg,
    launchOffsetM: boatRecord.beam_m / 2,
    salvoIntervalS: launch.salvo_interval_s,
    smokeParams: getBoatSmokeParams(data, mission.playerBoatId),
    night,
    hazardsTonight: mission.hazards.filter((h) => !absent(h)),
    absentHazards,
    enemyFrom: column ? { x: transitPart.transit!.inbound.appearX, y: transitPart.transit!.inbound.laneY + transitPart.transit!.laneDyM![0]! } : destroyer ? { x: destroyer.starts[0]!.x, y: destroyer.starts[0]!.y } : barges ? { x: barges.leadX, y: barges.leadY } : ptBoats ? { x: ptBoats.startX[0]!, y: ptBoats.startY[0]! } : null,
    dawnAir: getDawnAir(data, missionId),
    airStrike: o.strikeOff ? null : getAirStrikeParams(data, mission, world.time_scale, { halfLengthM: (boatRecord.length_m * world.hit_scale) / 2, halfBeamM: (boatRecord.beam_m * world.hit_scale) / 2, boundsMarginM: (boatRecord.length_m * world.sprite_scale) / 2 }, escort),
    ...engineSetupPart(data, missionId, o),
    ...gunboatSetupPart(data, mission, o),
    ...patrolAirSetupPart(data, missionId, o),
    ...landingPart, // 停泊して揚陸する味方の輸送船と米PT の雷撃（v0.6.9。jp_04 だけ。無い任務では鍵ごと出ない）
    ...allyDestroyerSetupPart(data, mission, ptBase, landingPart.landing ?? null, o), // 味方の駆逐艦 卯月（v0.6.10。jp_04 だけ。無い任務と allyOff では鍵ごと出ない）
    ...evacSetupPart(data, missionId, hard), // 空襲下の退避（v0.6.11。jp_03 だけ。6 つの隊・隠れ場所・波と編隊・燃料を数えない秒・昼。無い任務では鍵ごと出ない）
    ...radarSetupPart(data, mission, o), // 自艇のレーダー（v0.8.0。v0_1_prototype.radar の任務＝us_04 だけ。無い任務と radarOff では鍵ごと出ない）
    ...transitPart, // 列の通過（v0.8.0。us_04・v0.8.2 の us_05。上で組んだ。無い任務では鍵ごと出ない）
    ...shoresSetupPart(data, mission), // 海峡の両岸（v0.8.0。us_04 だけ。無い任務では鍵ごと出ない）
    ...(destroyer ? anchorSetupPart(anchor, mission.enemyStarts.length, tr !== null) : {}), // 止まった艦（v0.8.1。us_06 だけ。無い任務では鍵ごと出ない。S0 では世界は読まない）
    ...backdropSetupPart(data, mission, o), // 暗い岸を背に（v0.8.1。us_06 だけ。無い任務と backdropOff では鍵ごと出ない）
    ...seaplaneNightSetupPart(data, mission, seaplane), // 夜の水上機の 1 夜の攻撃の回数（v0.8.1 IP2。enemy_aircraft.attacks_per_night のある任務＝us_06 だけ。無い任務と水上機の無い夜は鍵ごと出ない）
    ...(pickets ? { pickets } : {}), // ハードの駆潜艇（v0.8.1。us_06 のハードだけ。隊の最後・今夜の揺らぎ込み）
    ...reconSetupPart(data, mission, o), // 報告・無線・中継（v0.8.2。us_05 だけ。無い任務では鍵ごと出ない。S0 では世界は読まない）
    ...rescueSetupPart(data, mission), // 生存者の救助（v0.8.5。us_07 だけ。無い任務では鍵ごと出ない。S0 では世界は読まない＝海の色の昼だけ core/dawn-air の setupDayStart）
    ...minefieldSetupPart(data, mission), // 機雷原（v0.8.5。us_07 だけ。無い任務では鍵ごと出ない。S0 では世界は読まない）
  };
}

/** 岸（v0.4.2 は南だけ）に接する浅瀬のいちばん海側の縁。無ければ岸の線（海域の南の縁）、岸の無い任務は NaN */
function coastEdgeYOf(m: PrototypeMission): number {
  if (!m.coast) return NaN;
  let y = m.bounds.height;
  for (const r of m.shallows) if (r.y + r.h >= m.bounds.height && r.y < y) y = r.y;
  return y;
}
