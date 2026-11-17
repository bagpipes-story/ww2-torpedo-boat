// 命中率の KPI の発射の時の目標の速さの下限（v0.8.1 S0。spec-v0810 §3.5 D-K1・D-K2・§4.4 V-K1）: hit_rate_model.json の kpi_measurement.min_target_speed_kt。
// 発射の時に狙った艦の速さがこの値未満なら、その 1 本は通算の命中率に数えない（止まった艦への 1 本）。鍵が無ければ 0＝今の規則（どの 1 本も外さない）。
// S0 ではゲームの誰も import しない（S2 で MissionWorld が 1 回読む欄 kpiMinTargetSpeedMps。値は WorldSetup に入れない＝全任務の setup の snapshot を変えない）。
import type { GameData } from './game-data';
import { ktToMps } from '../core/units';

/** V-K1: min_target_speed_kt（kt）。0 以上の有限の数（無ければ 0）でなければ「hit_rate_model.json の kpi_measurement.min_target_speed_kt …（V-K1）」 */
export function getKpiMinTargetSpeedKt(data: GameData): number {
  const v = (data.hitRateModel.kpi_measurement as unknown as Record<string, unknown>)['min_target_speed_kt'];
  if (v === undefined) return 0;
  if (!(typeof v === 'number' && Number.isFinite(v) && v >= 0)) throw new Error(`hit_rate_model.json の kpi_measurement.min_target_speed_kt は 0 以上の有限の数（${String(v)}）（V-K1・spec-v0810 §4.4）`);
  return v;
}

/** 同じ値を m/s で（世界の艦の速さと比べる） */
export function getKpiMinTargetSpeedMps(data: GameData): number {
  return ktToMps(getKpiMinTargetSpeedKt(data));
}
