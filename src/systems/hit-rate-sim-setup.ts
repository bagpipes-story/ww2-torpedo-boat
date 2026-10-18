// 命中率 KPI の模擬の組み立て（v0.5.0）: data（enemies・torpedoes・hit_rate_model）から core/hit-rate-sim の設定と距離帯を作る。
// Phaser 非依存・window を読まない（tests/hit-rate-sim.test.ts と scripts/hit-rate-sim.ts が使う。ゲームは使わない）。
import { getEnemyRecord, getEvasionMultiplier, getTorpedoRecord, type GameData } from '../config/game-data';
import { FIXED_STEP_S } from '../config/step-config';
import { simBearings, simulateBands, type BandSimResult, type ShotSimSetup, type SimBand } from '../core/hit-rate-sim';
import { shipAiParamsFromData } from '../core/ship-ai';
import { torpedoParamsFromData } from '../core/torpedo';

/** 模擬の上書き（scripts で感度を見る。無ければ data の値） */
export interface HitRateSimOverrides {
  enemyId?: string;
  torpedoId?: string;
  /** 当たり判定の倍率（無ければ world.ship_hit_scale） */
  shipHitScale?: number;
  /** 艇を見つける距離 m（無ければ 0＝見つけない） */
  detectM?: number;
  /** 史実モード（v0.5.2。見張り・回避の倍率。不発は模擬に入れないので、命中率に (1 − dud) を掛けて読む） */
  historical?: boolean;
}

export function hitRateSimSetup(data: GameData, o: HitRateSimOverrides = {}): ShotSimSetup {
  const sim = data.hitRateModel.kpi_measurement.sim;
  const world = data.hitRateModel.world;
  const launch = data.hitRateModel.torpedo_launch;
  const r = getEnemyRecord(data, o.enemyId ?? sim.enemy_id);
  const k = o.shipHitScale ?? world.ship_hit_scale;
  const ai = shipAiParamsFromData(r, getEvasionMultiplier(data, o.historical));
  return {
    ai,
    torpedo: torpedoParamsFromData(getTorpedoRecord(data, o.torpedoId ?? sim.torpedo_id), launch.arming_distance_m, launch.erratic_period_s),
    hullLengthM: r.length_m * k,
    hullBeamM: r.beam_m * k,
    hullCircles: r.hull_circles,
    shipSpeedMps: ai.cruiseSpeedMps,
    timeScale: world.time_scale,
    stepS: FIXED_STEP_S,
    detectM: o.detectM ?? 0,
    detectHoldS: data.hitRateModel.visibility.detect_hold_s,
  };
}

/** data の距離帯（kpi_by_range の目標と sim_ranges_m） */
export function hitRateSimBands(data: GameData): SimBand[] {
  return data.hitRateModel.kpi_by_range.map((b) => ({ band: b.band, target_hit_min: b.target_hit_min, target_hit_max: b.target_hit_max, sim_ranges_m: b.sim_ranges_m }));
}

/** data の設定（方位の刻み・狙いのずれ・繰り返し・seed）で距離帯ごとの命中率を出す */
export function runHitRateSim(data: GameData, s: ShotSimSetup, reps?: number): BandSimResult[] {
  const sim = data.hitRateModel.kpi_measurement.sim;
  return simulateBands(s, hitRateSimBands(data), simBearings(sim.bearing_step_deg), sim.aim_errors_deg, reps ?? sim.reps, sim.seed);
}
