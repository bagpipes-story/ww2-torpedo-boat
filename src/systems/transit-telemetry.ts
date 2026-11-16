// 列の通過のテレメトリ（v0.8.0 S2。spec-v0800 §4.9 の材料・§6 の S2）: createTelemetry で 1 回作り（initTransitTelemetry）、毎フレーム refreshTelemetry の中で 1 回だけ中身を写す
// （§7: 確保しない）。core/ship-transit の段階ごとの隻数（艦 ≤ 6 を数えるだけ）・残りの戻り・通算をそのまま写す。読むのは隊の transit だけ、書くのは t.transit だけ。
// 列の通過の無い任務は enabled false のまま何もしない。HUD の 2 行目・3 行目の文と Result の行は S4（ui/strait-lines・strait-result）。
import type { TransitTelemetry } from '../core/boat-telemetry';
import { TRANSIT_AWAY, TRANSIT_GONE, TRANSIT_IN, TRANSIT_OUT, TRANSIT_SUNK, TRANSIT_WAIT, transitCount, transitPending, type ShipTransitState } from '../core/ship-transit';

/** 読む世界の部分（MissionWorld がそのまま満たす） */
export interface TransitTelemetryWorld {
  readonly destroyers: { readonly transit: { readonly state: ShipTransitState } | null } | null;
}

const transitOf = (w: TransitTelemetryWorld): ShipTransitState | null => (w.destroyers && w.destroyers.transit ? w.destroyers.transit.state : null);

/** 出発時の transit（列の艦の数。まだ誰も来ていない） */
export function initTransitTelemetry(w: TransitTelemetryWorld): TransitTelemetry {
  const s = transitOf(w);
  const t: TransitTelemetry = {
    enabled: s !== null,
    ships: s ? s.ships : 0,
    waiting: 0,
    inbound: 0,
    away: 0,
    outbound: 0,
    gone: 0,
    sunk: 0,
    pending: 0,
    inCount: 0,
    arrivedCount: 0,
    outCount: 0,
    firstOutS: NaN,
  };
  refreshTransitTelemetry(t, w);
  return t;
}

/** 毎フレーム 1 回（列の通過の無い任務は何もしない） */
export function refreshTransitTelemetry(t: TransitTelemetry, w: TransitTelemetryWorld): void {
  const s = transitOf(w);
  if (!s) return;
  t.waiting = transitCount(s, TRANSIT_WAIT);
  t.inbound = transitCount(s, TRANSIT_IN);
  t.away = transitCount(s, TRANSIT_AWAY);
  t.outbound = transitCount(s, TRANSIT_OUT);
  t.gone = transitCount(s, TRANSIT_GONE);
  t.sunk = transitCount(s, TRANSIT_SUNK);
  t.pending = transitPending(s);
  t.inCount = s.inCount;
  t.arrivedCount = s.arrivedCount;
  t.outCount = s.outCount;
  t.firstOutS = s.firstOutS;
}
