// Result の us_04 の 2 つの鍵の材料（v0.8.0 S4。spec-v0800 §4.9、brief L26・L31）: レーダー（最初の接触・目で見えない間に撃った魚雷＝ui/radar-result）と列の通過
// （往路・復路・撃沈・揚陸の地＝ui/strait-result）。systems/mission-telemetry の buildMissionResult が終わりに 1 回だけ呼ぶ。ある任務だけ鍵が出る（ほかの任務の Result は同じ）。
// 世界の形は構造の型で読む（tests が Phaser なしの小さな世界から作れる）。レーダーの記録は掃引の時の丸めた輝点と自艇の位置だけ（艦の正体・列の段階・AI は入れない）。
import { TRANSIT_AWAY, TRANSIT_IN, TRANSIT_SUNK, transitCount, type ShipTransitState } from '../core/ship-transit';
import type { RadarResult } from '../ui/radar-result';
import type { StraitResult } from '../ui/strait-result';

/** レーダーの記録（systems/world-radar の WorldRadar が満たす） */
export interface RadarResultWorld {
  readonly radar: {
    readonly state: { readonly firstS: number; readonly firstX: number; readonly firstY: number; readonly firstFromX: number; readonly firstFromY: number };
    readonly unseenShots: number;
    readonly unseenHits: number;
  } | null;
}

/** 列の通過の記録（MissionWorld が満たす: 隊の列の通過と、夜明けに退く列の呼び名） */
export interface StraitResultWorld {
  readonly destroyers: { readonly transit: { readonly state: ShipTransitState; readonly plan: { readonly vilaLabelJa: string } } | null } | null;
  readonly setup: { readonly dawnAir: { readonly retireForceJa: string } };
}

/** レーダーの Result の材料: レーダーのある任務だけ radar の鍵（最初の接触はその時の自艇から一番近い輝点への位置） */
export function radarResultPart(w: RadarResultWorld): { radar?: RadarResult } {
  const r = w.radar;
  if (!r) return {};
  const s = r.state;
  return { radar: { firstS: s.firstS, firstDx: s.firstX - s.firstFromX, firstDy: s.firstY - s.firstFromY, unseenShots: r.unseenShots, unseenHits: r.unseenHits } };
}

/** 列の通過の Result の材料: 列の通過のある任務だけ strait の鍵（列の呼び名は dawn_withdraw.force_ja。無ければ「列」。往路の途中は終わった時に IN の艦） */
export function straitResultPart(w: StraitResultWorld): { strait?: StraitResult } {
  const tr = w.destroyers ? w.destroyers.transit : null;
  if (!tr) return {};
  const s = tr.state;
  return { strait: { forceJa: w.setup.dawnAir.retireForceJa || '列', vilaJa: tr.plan.vilaLabelJa, inCount: s.inCount, outCount: s.outCount, sunk: transitCount(s, TRANSIT_SUNK), away: transitCount(s, TRANSIT_AWAY), inbound: transitCount(s, TRANSIT_IN) } };
}
