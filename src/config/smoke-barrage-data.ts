// 煙幕への乱射（v0.8.4。hit_rate_model.historical_mode.smoke_barrage）の読み出し。壊れていれば例外（任務の開始に分かる。史実モードがオフでも世界を作るたびに検査する）。
// WorldSetup には入れない（史実モードの setup の snapshot を変えない）。systems/world-enemies が史実モードで煙幕のある艇と艦の隊のいる世界にだけ使う。
import type { GameData } from './game-data';
import { isSmokeBarrageDataRecord, smokeBarrageParamsFromData, type SmokeBarrageParams } from '../core/smoke-barrage';

export function getSmokeBarrageParams(data: GameData): SmokeBarrageParams {
  const r: unknown = data.hitRateModel.historical_mode.smoke_barrage;
  if (!isSmokeBarrageDataRecord(r)) throw new Error('hit_rate_model.historical_mode.smoke_barrage: 6 つの数がみな有限・0 < min_range_m < max_range_m・0 ≤ scatter_min_m ≤ scatter_max_m・puff_search_m ≥ 0・0 < rate_factor ≤ 1');
  return smokeBarrageParamsFromData(r);
}
