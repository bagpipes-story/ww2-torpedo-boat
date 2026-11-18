// 報告と弾薬庫のテレメトリ（v0.8.2 S2。us_05「スリガオ海峡・最初の接触」。spec-v0820 §4.4 D-G5・§4.5 D-N7、lead の L17・L22）: createTelemetry で 1 回作り（…TelemetryPart）、
// 毎フレーム refreshTelemetry の中で 1 回だけ写す（§7: 確保しない。艦ごとの配列は世界の MagazineLog の参照）。setup.recon の無い任務は recon の鍵ごと、弾薬庫の無い隊は magazine の鍵ごと
// 出ない（無い・undefined でもない＝ほかの任務のテレメトリは今のまま）。世界・艦・AI には何も書かない（読むだけ）。Phaser 非依存・乱数なし。文は S4（ui/recon-lines・recon-result）。
import type { MagazineTelemetry, ReconTelemetry } from '../core/boat-telemetry';
import { reconTrackLeftS } from '../core/recon-report';
import type { ShipMagazine } from './ship-magazine';
import type { WorldRecon } from './world-recon';

/** 読む世界の部分（MissionWorld がそのまま満たす） */
export interface ReconTelemetryWorld {
  readonly recon: WorldRecon | null;
  readonly destroyers: { readonly magazine: ShipMagazine | null } | null;
  readonly boat: { readonly state: { readonly x: number; readonly y: number } };
}

/** 出発時の recon（報告の任務だけ鍵が出る） */
export function reconTelemetryPart(w: ReconTelemetryWorld): { recon?: ReconTelemetry } {
  const r = w.recon;
  if (!r) return {};
  const t: ReconTelemetry = { stage: 0, radioBroken: false, trackedS: 0, trackLeftS: 0, seenAtS: NaN, seenCount: 0, sentAtS: NaN, pendingAtS: NaN, radioBrokenAtS: NaN, relayedAtS: NaN, draws: 0, eventCount: 0, events: 0, relayDx: NaN, relayDy: NaN, relayRadiusM: r.plan.relay.radiusM, relayJa: r.plan.relay.labelJa };
  refreshReconTelemetry(t, w);
  return { recon: t };
}

/** 毎フレーム 1 回（鍵の無い任務は何もしない） */
export function refreshReconTelemetry(t: ReconTelemetry | undefined, w: ReconTelemetryWorld): void {
  const r = w.recon;
  if (!t || !r) return;
  const st = r.state;
  t.stage = st.stage;
  t.radioBroken = st.radioBroken;
  t.trackedS = st.trackedS;
  t.trackLeftS = reconTrackLeftS(st, r.plan);
  t.seenAtS = st.seenAtS;
  t.seenCount = st.seenCount;
  t.sentAtS = st.sentAtS;
  t.pendingAtS = st.pendingAtS;
  t.radioBrokenAtS = st.radioBrokenAtS;
  t.relayedAtS = st.relayedAtS;
  t.draws = st.draws;
  t.eventCount = r.eventCount;
  t.events = r.events;
  const b = w.boat.state;
  t.relayDx = r.plan.relay.x - b.x;
  t.relayDy = r.plan.relay.y - b.y;
}

/** 出発時の magazine（規則のある艦のいる隊だけ鍵が出る） */
export function magazineTelemetryPart(w: ReconTelemetryWorld): { magazine?: MagazineTelemetry } {
  const m = w.destroyers ? w.destroyers.magazine : null;
  if (!m) return {};
  const t: MagazineTelemetry = { detonatedAtS: m.log.detonatedAtS, onHit: m.log.onHit, detonations: 0, draws: 0, chanceSum: 0 };
  refreshMagazineTelemetry(t, w);
  return { magazine: t };
}

/** 毎フレーム 1 回（鍵の無い任務は何もしない） */
export function refreshMagazineTelemetry(t: MagazineTelemetry | undefined, w: ReconTelemetryWorld): void {
  const m = w.destroyers ? w.destroyers.magazine : null;
  if (!t || !m) return;
  t.detonations = m.detonations;
  t.draws = m.draws;
  t.chanceSum = m.chanceSum;
}
