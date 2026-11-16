// 迎撃の模擬の組み立て（v0.8.0 S3。us_04「ブラケット海峡の夜」。spec-v0800 §4.11、lead の L19・L21）: 1 夜ごとに buildWorldSetup(data, 'us_04', 出撃の seed) の値から
// core/intercept-sim の設定を作る（今夜の揺らぎ＝seed+16 の護衛のずれ・列の入りの秒と道の y・水上機と誤射の有無は世界と同じ道。模擬は水上機と誤射を持たない）。
// つまみ（spec §4.11 の順の data の鍵）の上書きは記録を写して buildWorldSetup に通す＝起動時の検査（V-R・V-T・V-S）も通る（通らない値は例外）。
// Phaser 非依存・window を読まない（tests/intercept-sim-* と scripts/intercept-sim が使う。ゲームは使わない）。
import type { GameData } from '../config/game-data';
import { FIXED_STEP_S } from '../config/step-config';
import { retireHeadingDeg } from '../core/dawn-withdraw';
import type { InterceptSimSetup } from '../core/intercept-sim';
import { INTERCEPT_HUMAN, type InterceptPlan } from '../core/intercept-sim-policy';
import { directSortie } from '../core/sortie';
import { landLinesFromShores } from '../core/strait-geometry';
import { buildWorldSetup, type WorldSetup } from './world-setup';

export const INTERCEPT_SIM_MISSION = 'us_04';
/** config/ui-config の SHELL_POOL_SIZE（48）・SINK_DURATION_MS（2000 ms）・MISSION_END_DELAY_MS（1500 ms）と同じ（ui-config は画面の game-config を読むので node の模擬から読まない。tests/intercept-sim-a が一致を確かめる） */
export const INTERCEPT_SIM_SHELL_POOL = 48;
export const INTERCEPT_SIM_SINK_S = 2;
export const INTERCEPT_SIM_ADRIFT_DELAY_S = 1.5;
/** 夜明けの後の打ち切り（実秒。夜明けの空襲は模擬しない＝輪の外のままなら 'cut'） */
export const INTERCEPT_SIM_AFTER_DAWN_S = 60;
/** B6 の距離（lead の L20: 列への正しく狙った 1 本の 700〜1,100 m） */
export const INTERCEPT_B6_MIN_M = 700;
export const INTERCEPT_B6_MAX_M = 1100;

/**
 * spec §4.11 のつまみ（data の鍵。undefined は data のまま）: ① transit.speed_kt ② radar.models.so_early の ship_range_m・sweep_s ③ transit.outbound.lane_y_m・transit.unload_s
 * ④ fuel_allotment_gal。cover は S3b の lead の L38（護衛の最初の脚 enemy_start の x・y・針路）の候補を比べる上書き
 */
export interface InterceptKnobs {
  speedKt?: number;
  shipRangeM?: number;
  sweepS?: number;
  laneY?: number;
  unloadS?: number;
  fuelGal?: number;
  cover?: { readonly x: number; readonly y: number; readonly headingDeg: number };
}

type Rec = Record<string, unknown>;

/** つまみを当てた data の写し（つまみが無ければそのまま） */
export function withInterceptKnobs(data: GameData, k: InterceptKnobs): GameData {
  if (Object.values(k).every((v) => v === undefined)) return data;
  const missions = (data.missionsSeed.missions as readonly Rec[]).map((m) => {
    if (m['id'] !== INTERCEPT_SIM_MISSION) return m;
    const proto = m['v0_1_prototype'] as Rec;
    const tr = proto['transit'] as Rec;
    const out = tr['outbound'] as Rec;
    const transit = { ...tr, speed_kt: k.speedKt ?? tr['speed_kt'], unload_s: k.unloadS ?? tr['unload_s'], outbound: { ...out, lane_y_m: k.laneY ?? out['lane_y_m'] } };
    const es = proto['enemy_start'] as Rec;
    const enemy_start = k.cover ? { ...es, x_m: k.cover.x, y_m: k.cover.y, heading_deg: k.cover.headingDeg } : es;
    return { ...m, v0_1_prototype: { ...proto, transit, enemy_start, fuel_allotment_gal: k.fuelGal ?? proto['fuel_allotment_gal'] } };
  });
  const radar = data.hitRateModel.radar as unknown as Rec;
  const models = radar['models'] as Rec;
  const early = models['so_early'] as Rec;
  const so_early = { ...early, ship_range_m: k.shipRangeM ?? early['ship_range_m'], sweep_s: k.sweepS ?? early['sweep_s'] };
  const hitRateModel = { ...data.hitRateModel, radar: { ...radar, models: { ...models, so_early } } };
  return { ...data, hitRateModel, missionsSeed: { ...data.missionsSeed, missions } } as unknown as GameData;
}

/**
 * 1 夜の設定（seed は出撃の seed＝今夜の揺らぎ。模擬の発射管制・砲・見張りも同じ seed の系列）。data はつまみを当てた写しでよい。
 * noCover は S3c の lead の L45 の参考の表（scripts/intercept-sim の NOCOVER=1）: 護衛のいない夜（今夜の揺らぎは同じ道で引き、模擬の艦に護衛を入れない）
 */
export function interceptNightSetup(data: GameData, seed: number, hard: boolean, noCover = false): InterceptSimSetup {
  const w = buildWorldSetup(data, INTERCEPT_SIM_MISSION, { sortie: directSortie(INTERCEPT_SIM_MISSION, seed, 'none', hard, false), hard });
  const ds = w.destroyer;
  const tr = w.transit;
  if (!ds || !tr || !w.dawnAir.retireEdge) throw new Error(`${INTERCEPT_SIM_MISSION} に護衛（enemy_start）・列の通過（transit）・夜明けに退く縁（dawn_withdraw）が要る`);
  const m = w.mission;
  const b = w.boatParams;
  return {
    hard, bounds: m.bounds, boundsMarginM: w.boundsMarginM, start: w.playerStart,
    boat: b, damage: w.damageParams, crew: w.crew, crewEffects: w.crewEffects, fuelCurve: w.fuelCurve, fuelStartGal: w.fuelStartGal, fuelAllotmentGal: w.fuelAllotmentGal,
    vis: w.vis, baseDetectM: w.baseDetectM, visRange2: w.visRange2, halfLengthM: w.boatHalfLengthM, halfBeamM: w.boatHalfBeamM,
    shallows: m.shallows, grounding: w.grounding, ring: m.returnPoint, fleetGoneClears: w.dawnAir.fleetGoneClears,
    durationS: w.durationS, timeScale: w.timeScale, stepS: FIXED_STEP_S, slowMoFactor: w.slowMoFactor, slowMoSeconds: w.slowMoSeconds, retireHeadingDeg: retireHeadingDeg(w.dawnAir.retireEdge, w.night.mirrored),
    torpedo: w.torpedoParams, reliability: w.torpedoReliability, jitterDeg: w.torpedoJitterDeg, launchOffsetM: w.launchOffsetM, salvoIntervalS: w.salvoIntervalS, torpedoCount: w.torpedoCapacity,
    aimedErrMaxDeg: data.hitRateModel.kpi_measurement.aimed_lead_error_deg_max, aimedMinM: INTERCEPT_B6_MIN_M, aimedMaxM: INTERCEPT_B6_MAX_M,
    ship: ds.spec, coverAi: ds.shipAi, gunnery: ds.gunnery, passRadius2: ds.passRadius2, coverStarts: noCover ? [] : ds.starts, objectiveSinks: ds.objectiveSinks ?? ds.starts.length + tr.ships,
    transit: tr, radar: w.radar ?? null, radarGeo: { width: m.bounds.width, height: m.bounds.height, land: w.shores ? landLinesFromShores(w.shores, m.bounds.width, m.bounds.height) : [] },
    shellPoolSize: INTERCEPT_SIM_SHELL_POOL, sinkS: INTERCEPT_SIM_SINK_S, adriftDelayS: INTERCEPT_SIM_ADRIFT_DELAY_S, afterDawnS: INTERCEPT_SIM_AFTER_DAWN_S,
    plan: interceptPlan(data, w),
  };
}

/** 台本の地図と艇の知れる値（Briefing・画面＝WorldSetup から）。模擬と世界のヘッドレスの台本（scripts/headless/strait-probe）が同じ物を使う */
export function interceptPlan(data: GameData, w: WorldSetup): InterceptPlan {
  const m = w.mission;
  const b = w.boatParams;
  return {
    width: m.bounds.width, height: m.bounds.height, radarRangeM: w.radar ? w.radar.shipRangeM : NaN, ringX: m.returnPoint.x, ringY: m.returnPoint.y, ringR: m.returnPoint.radiusM, dawnS: w.durationS,
    silent01: (b.silentMaxMps / b.speedMaxMps) * INTERCEPT_HUMAN.silentFrac, cruise01: b.speedCruiseMps / b.speedMaxMps, spacingDeg: data.hitRateModel.torpedo_launch.salvo_spacing_deg,
    torpedoScreenMps: w.torpedoParams.speedMps * w.timeScale, fullScreenMps: b.speedMaxMps * w.timeScale, reefs: m.shallows,
  };
}
