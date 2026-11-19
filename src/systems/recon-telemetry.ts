// 報告と弾薬庫のテレメトリ（v0.8.2 S2。us_05「スリガオ海峡・最初の接触」。spec-v0820 §4.4 D-G5・§4.5 D-N7、lead の L17・L22）: createTelemetry で 1 回作り（…TelemetryPart）、
// 毎フレーム refreshTelemetry の中で 1 回だけ写す（§7: 確保しない。艦ごとの配列は世界の MagazineLog の参照）。setup.recon の無い任務は recon の鍵ごと、弾薬庫の無い隊は magazine の鍵ごと
// 出ない（無い・undefined でもない＝ほかの任務のテレメトリは今のまま）。世界・艦・AI には何も書かない（読むだけ）。Phaser 非依存・乱数なし。文は S4（ui/recon-lines・recon-texts・recon-result）。
// S4: 確かめる艦種の名詞と列の向きと速さの句（作る時に 1 回）・戦艦と重巡への沈まなかった命中（艦ごとに見た数の Uint8Array＝作る時に 1 回。毎フレームは隊の ≤ 8 隻の数の比べだけ）。
import { BOW_ON_NOUN_BY_CLASS_JA } from '../config/strait-hud-config';
import type { MagazineTelemetry, ReconTelemetry } from '../core/boat-telemetry';
import { bearingJa } from '../core/briefing';
import { reconTrackLeftS } from '../core/recon-report';
import type { ShipMagazine } from './ship-magazine';
import type { WorldRecon } from './world-recon';

/** 読む世界の部分（MissionWorld がそのまま満たす）。S4: 隊の艦の命中と沈み始め・艦種（kits）と、列の速さと向き（setup.transit） */
export interface ReconTelemetryWorld {
  readonly recon: WorldRecon | null;
  readonly destroyers: { readonly magazine: ShipMagazine | null; readonly ships?: readonly { readonly hitsTaken: number; readonly sinking: boolean }[]; readonly kits?: { readonly classes: readonly string[] | null } } | null;
  readonly boat: { readonly state: { readonly x: number; readonly y: number } };
  readonly setup?: { readonly transit?: { readonly speedKt: number; readonly inbound: { readonly headingDeg: number } } };
}

/** 出発時の recon（報告の任務だけ鍵が出る） */
export function reconTelemetryPart(w: ReconTelemetryWorld): { recon?: ReconTelemetry } {
  const r = w.recon;
  if (!r) return {};
  const tr = w.setup ? w.setup.transit : undefined;
  const fleetJa = tr ? `${bearingJa(tr.inbound.headingDeg)}へ ${tr.speedKt} ノット` : ''; // 報告の文の列の向きと速さ（S4。data の transit の針路と速さ）
  const n = w.destroyers && w.destroyers.ships ? w.destroyers.ships.length : 0;
  const t: ReconTelemetry = { stage: 0, radioBroken: false, trackedS: 0, trackLeftS: 0, seenAtS: NaN, seenCount: 0, sentAtS: NaN, pendingAtS: NaN, radioBrokenAtS: NaN, relayedAtS: NaN, draws: 0, eventCount: 0, events: 0, relayDx: NaN, relayDy: NaN, relayRadiusM: r.plan.relay.radiusM, relayJa: r.plan.relay.labelJa,
    identifyJa: BOW_ON_NOUN_BY_CLASS_JA[r.plan.identifyClass] ?? r.plan.identifyClass, fleetJa, capHits: 0, capHitN: 0, capHitJa: '', capSeen: new Uint8Array(n) };
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
  // 戦艦・重巡への命中で沈まなかった回数（S4。2 行目の「戦艦に命中！ 3 本目 ・ まだ沈まない」。艦ごとに見た命中の数と比べる＝固定ステップが幾つあっても読み落とさない）
  const g = w.destroyers;
  const cls = g && g.kits ? g.kits.classes : null;
  if (!g || !g.ships || !cls) return;
  for (let i = 0; i < g.ships.length && i < t.capSeen.length; i++) {
    const s = g.ships[i]!;
    const c = cls[i]!;
    if (c === 'destroyer' || s.hitsTaken <= t.capSeen[i]!) continue;
    t.capSeen[i] = s.hitsTaken;
    if (s.sinking) continue; // 沈む本数に届いた・誘爆した命中は言わない（誘爆は t.magazine の数）
    t.capHits++;
    t.capHitN = s.hitsTaken;
    t.capHitJa = BOW_ON_NOUN_BY_CLASS_JA[c] ?? c;
  }
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
