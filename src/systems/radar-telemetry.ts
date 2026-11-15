// レーダーのテレメトリ（v0.8.0 S2。spec-v0800 §4.9 の材料・§6 の S2）: createTelemetry で 1 回作り（initRadarTelemetry）、毎フレーム refreshTelemetry の中で 1 回だけ中身を写す
// （§7: 確保しない）。core/radar の状態の数と出来事（数えて残す＝1 フレームに掃引が何回あっても読み落とさない）をそのまま写すだけ。読むのは世界の radar だけ、書くのは t.radar だけ
// （brief L9。tests/radar-neutral が走査）。レーダーの無い任務・?debug&noradar は enabled false のまま何もしない。HUD の 2 行目の文・端の印・Result の行は S4。
import type { RadarTelemetry } from '../core/boat-telemetry';
import type { RadarState } from '../core/radar';

/** 読む世界の部分（MissionWorld がそのまま満たす） */
export interface RadarTelemetryWorld {
  readonly radar: { readonly state: RadarState; readonly p: { readonly shipRangeM: number } } | null;
}

/** 出発時の radar（任務で決まる射程と、まだ掃引していない数） */
export function initRadarTelemetry(w: RadarTelemetryWorld): RadarTelemetry {
  const t: RadarTelemetry = {
    enabled: w.radar !== null,
    shipRangeM: w.radar ? w.radar.p.shipRangeM : 0,
    sweeps: 0,
    contacts: 0,
    nearestM: NaN,
    firstS: NaN,
    firstX: NaN,
    firstY: NaN,
    firstFromX: NaN,
    firstFromY: NaN,
    newCount: 0,
    newX: NaN,
    newY: NaN,
    lostCount: 0,
    lostX: NaN,
    lostY: NaN,
  };
  refreshRadarTelemetry(t, w);
  return t;
}

/** 毎フレーム 1 回（レーダーの無い任務は何もしない） */
export function refreshRadarTelemetry(t: RadarTelemetry, w: RadarTelemetryWorld): void {
  const r = w.radar;
  if (!r) return;
  const s = r.state;
  t.sweeps = s.sweeps;
  t.contacts = s.n;
  t.nearestM = s.nearestM;
  t.firstS = s.firstS;
  t.firstX = s.firstX;
  t.firstY = s.firstY;
  t.firstFromX = s.firstFromX;
  t.firstFromY = s.firstFromY;
  t.newCount = s.newCount;
  t.newX = s.newX;
  t.newY = s.newY;
  t.lostCount = s.lostCount;
  t.lostX = s.lostX;
  t.lostY = s.lostY;
}
