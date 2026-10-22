// 味方の大発の輸送隊（v0.6.4。jp_01。docs/02 §6.4、spec §D.2・§D.3）の HUD 向けテレメトリと Result の材料。mission-telemetry から呼ぶ（pt-telemetry と同じ形）。
// テレメトリの convoy は createTelemetry で 1 回だけ作り（initConvoyTelemetry）、refreshConvoyTelemetry が毎フレーム 1 回だけ中身を書き換える（§7: 確保しない。
// 平方根は端の矢印・離脱の尾の「大発 N m」の 1 回だけ。「浜まで」は x の差）。輸送隊の無い任務は enabled false のまま何も書かない。
// 世界は構造の型 ConvoyTelemetryWorld で読む（MissionWorld がそのまま満たす。MissionWorld を import すると Phaser がテストの node 型検査に入るため）。
import type { BoatState } from '../core/boat-motion';
import { bearingJa } from '../core/briefing';
import { convoyLeftM, createConvoyTelemetry, nearestConvoyBarge, type ConvoyParams, type ConvoyState, type ConvoyTelemetry } from '../core/convoy';
import { bearingDeg } from '../core/ship-ai';
import type { ConvoyResult } from '../ui/result-types';

/** テレメトリと Result が読む世界の部分 */
export interface ConvoyTelemetryWorld {
  /** 輸送隊（systems/convoy。無い任務は null） */
  readonly convoy: { readonly state: ConvoyState; readonly p: ConvoyParams } | null;
  readonly boat: { readonly state: BoatState };
  /** 自艇の出発点と敵（米PT の 1 隻目）の出発点（Briefing の「東から」と同じ方角） */
  readonly setup: { readonly playerStart: { readonly x: number; readonly y: number }; readonly enemyFrom: { readonly x: number; readonly y: number } | null };
}

/** 出発時の convoy（任務で決まる値: 隻数・米PT の来る方角。毎フレームは変えない） */
export function initConvoyTelemetry(w: ConvoyTelemetryWorld): ConvoyTelemetry {
  const t = createConvoyTelemetry();
  const c = w.convoy;
  if (!c) return t;
  t.enabled = true;
  t.total = c.p.count;
  const e = w.setup.enemyFrom;
  const s = w.setup.playerStart;
  t.fromDirJa = e ? bearingJa(bearingDeg(s.x, s.y, e.x, e.y)) : '';
  refreshConvoyTelemetry(t, w);
  return t;
}

/** 毎フレーム 1 回: 上陸・沈没・航行中・決着、浜まで（最も遅れた航行中の大発。x の差）、最寄りの航行中の大発への相対位置と距離（1 回の平方根） */
export function refreshConvoyTelemetry(t: ConvoyTelemetry, w: ConvoyTelemetryWorld): void {
  const c = w.convoy;
  if (!c) return;
  const f = c.state;
  t.arrived = f.arrived;
  t.sunk = f.sunk;
  t.afloat = f.barges.length - f.arrived - f.sunk;
  t.resolved = f.arrived + f.sunk >= f.barges.length;
  t.leftM = convoyLeftM(f, c.p);
  const b = w.boat.state;
  const i = nearestConvoyBarge(f, b.x, b.y);
  if (i < 0) {
    t.nearestDx = NaN;
    t.nearestDy = NaN;
    t.nearestM = NaN;
    return;
  }
  const n = f.barges[i]!;
  t.nearestDx = n.x - b.x;
  t.nearestDy = n.y - b.y;
  t.nearestM = Math.sqrt(t.nearestDx * t.nearestDx + t.nearestDy * t.nearestDy);
}

/** 終了時に 1 回だけ: MissionResult.convoy（達成の判定は mission-telemetry が reason と quota から） */
export function convoyResult(w: ConvoyTelemetryWorld): ConvoyResult | null {
  const c = w.convoy;
  if (!c) return null;
  return { total: c.p.count, arrived: c.state.arrived, sunk: c.state.sunk, quota: c.p.quota, hitsTaken: c.state.hitsTaken };
}
