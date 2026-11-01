// 停泊して揚陸する味方の輸送船と米PT の雷撃（v0.6.9 S5b。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v069 D15・§5・L6）の HUD 向けテレメトリ。
// mission-telemetry から呼ぶ（convoy-telemetry・patrol-telemetry と同じ形）。テレメトリの landing は createTelemetry で 1 回だけ作り（initLandingTelemetry）、
// refreshLandingTelemetry が毎フレーム 1 回だけ中身を書き換える（§7: 確保しない。報告の書き先は module に 1 個）。揚陸の無い任務（w.landing が null）は enabled false のまま何も書かない。
// 読むのは揚陸の世界（systems/world-landing の WorldLanding）の状態だけ: 揚陸・雷撃の数え・走っている雷跡（updateVisuals が毎フレーム数える＝Scene は updateFrame の後にここを呼ぶ）。
// 見張りの報告は core/landing の landingReport（模擬の方針と同じ関数）、輸送船が射線に入る（R14 A1）は landingFireLine（模擬の lure_cue と同じ関数）。
// 報告の PT が脅威の PT（core の hudThreatIndex。「PT N m」の印）か（S6b。R8/F12。ui/landing-markers が「雷撃 N m」を隠す）と、海の上の ▼ が出ているか（世界が決めた値を写すだけ）。
// 平方根は報告の距離の 1 回・輸送船までの 1 回・射線の PT までの 1 回（いるときだけ）、atan2 は報告と射線の候補・射線の PT・出来事が変わったフレームの 1 回だけ。
// 世界は構造の型 LandingTelemetryWorld で読む（MissionWorld がそのまま満たす。MissionWorld を import すると Phaser がテストの node 型検査に入るため）。
// S7: Result の材料 landingResultPart（終了時に 1 回。convoy-telemetry の convoyResult・patrol-telemetry の patrolResult と同じ形。構造の型 LandingResultWorld で読む）。
import type { BoatState } from '../core/boat-motion';
import {
  createLandingReport, createLandingTelemetry, LANDING_DIST_STEP_M, LANDING_FIRE_LINE_EXTRA_M, landingDirIdx, landingFireLine, landingReport, landingResolved, LD_UNLOADING, type LandingState, type LandingTelemetry, type LandingWakes,
} from '../core/landing';
import type { LandingParams } from '../core/landing-data';
import type { MissionEndReason } from '../core/mission-flow';
import { PT_FATE_NONE, PT_LEAVE, hudThreatIndex, type PtSection } from '../core/pt-boats';
import { ptTorpedoOutcome } from '../core/pt-torpedo';
import { landingEndKind } from '../ui/landing-result';
import type { LandingResult } from '../ui/result-types';

/** テレメトリが読む世界の部分 */
export interface LandingTelemetryWorld {
  /** 揚陸の世界（systems/world-landing。揚陸の無い任務は null）: 揚陸・雷撃の数え（PtTorpedoState の一部）・走っている雷跡・値・雷撃の値（1 斉射の本数・慌てる距離・斉射の距離・戦いながらの倍率） */
  readonly landing: {
    readonly state: LandingState;
    readonly tst: { readonly left: Uint8Array; readonly salvos: number; readonly fired: number };
    readonly wakes: LandingWakes;
    readonly p: LandingParams;
    readonly tp: { readonly n: number; readonly hurriedM: number; readonly launchM: number; readonly engagedFactor: number };
    /** 海の上の ▼「雷撃」が出ている（S6b。updateVisuals が本当のカメラで決める。省けば出ていない） */
    readonly caretShown?: boolean;
  } | null;
  readonly pts: { readonly section: PtSection } | null;
  readonly boat: { readonly state: BoatState };
  /** 出撃からの実秒（stepTimeS。揚陸の時計・夜明けの時計と同じ。命中スローで遅れない） */
  readonly stepTimeS: number;
  /** 自艇の視程の二乗（報告の PT が見えているか） */
  readonly visRange2: number;
}

/** 見張りの報告の書き先（module に 1 個。毎フレーム確保しない） */
const REPORT = createLandingReport();

/** 出発時の landing（任務で決まる値: 揚陸の秒・沈むまでの本数・1 斉射の本数・隻数・来る方角・慌てる距離。毎フレームは変えない） */
export function initLandingTelemetry(w: LandingTelemetryWorld): LandingTelemetry {
  const t = createLandingTelemetry();
  const ld = w.landing;
  if (!ld || !w.pts) return t;
  t.enabled = true;
  t.unloadS = ld.p.unloadS;
  t.hitsToSink = ld.p.hitsToSink;
  t.salvoCount = ld.tp.n;
  t.total = w.pts.section.boats.length;
  t.fromDirsJa = ld.p.fromDirsJa;
  t.hurriedM = ld.tp.hurriedM;
  refreshLandingTelemetry(t, w);
  return t;
}

/** 毎フレーム 1 回（世界の updateFrame の後）: 揚陸・米PT の撃てる隻数・見張りの報告・輸送船が射線に入る PT・走っている雷跡・輸送船への相対位置・出来事（通し番号が変わったときだけ写す） */
export function refreshLandingTelemetry(t: LandingTelemetry, w: LandingTelemetryWorld): void {
  const ld = w.landing;
  const s = w.pts;
  if (!ld || !s) return;
  const st = ld.state;
  const q = s.section;
  t.phase = st.phase;
  t.resolved = landingResolved(st);
  t.pct = st.pct;
  t.leftS = st.phase === LD_UNLOADING ? Math.max(0, ld.p.unloadS - w.stepTimeS) : 0;
  t.hits = st.hits;
  t.duds = st.duds;
  t.sunkAfterDone = st.sunkAfterDone;
  t.sinking = st.sinking;
  let armed = 0;
  for (let i = 0; i < q.boats.length; i++) {
    const b = q.boats[i]!;
    if (ld.tst.left[i] === 1 && b.fate === PT_FATE_NONE && b.phase < PT_LEAVE) armed++;
  }
  t.armed = armed;
  t.salvos = ld.tst.salvos;
  t.fired = ld.tst.fired;
  const me = w.boat.state;
  landingReport(st, ld.p, q, ld.tst, REPORT);
  t.reportSub = REPORT.sub;
  t.reportI = REPORT.i;
  t.reportStep = REPORT.distStep;
  t.reportDirIdx = REPORT.dirIdx;
  const r = REPORT.i >= 0 ? q.boats[REPORT.i]! : null;
  t.reportDx = r ? r.x - me.x : NaN;
  t.reportDy = r ? r.y - me.y : NaN;
  t.reportSighted = r !== null && t.reportDx * t.reportDx + t.reportDy * t.reportDy <= w.visRange2;
  t.reportIsThreat = r !== null && REPORT.i === hudThreatIndex(q, me.x, me.y); // 「PT N m」の印の PT（S6b。R8/F12）。報告があるときだけ隊を 1 回なめる
  t.caretShown = r !== null && ld.caretShown === true; // ▼ が出ていれば「雷撃 N m」は出さない（S6b）
  // 輸送船が射線に入る（R14 A1。戦いながらの斉射が無い data＝engaged_error_factor 0 なら無し）: 自艇からその PT への 8 方位と 100 m 刻み
  const fr = ld.tp.engagedFactor > 0 ? ld.tp.launchM + LANDING_FIRE_LINE_EXTRA_M : 0;
  const fi = landingFireLine(st, q, ld.tst.left, fr * fr);
  t.fireLineI = fi;
  if (fi >= 0) {
    const b = q.boats[fi]!;
    t.fireLineDirIdx = landingDirIdx(me, b.x, b.y);
    t.fireLineStep = Math.min(63, Math.ceil(Math.hypot(b.x - me.x, b.y - me.y) / LANDING_DIST_STEP_M));
  } else {
    t.fireLineDirIdx = 0;
    t.fireLineStep = 0;
  }
  t.wakes = ld.wakes.count;
  t.wakeCpaS = ld.wakes.cpaS;
  t.shipDx = st.x - me.x;
  t.shipDy = st.y - me.y;
  t.shipDistM = Math.sqrt(t.shipDx * t.shipDx + t.shipDy * t.shipDy);
  if (st.eventSeq === t.eventSeq) return;
  t.eventSeq = st.eventSeq;
  t.eventKind = st.eventKind;
  t.eventBoat = st.eventBoat;
  t.eventM = st.eventM;
  t.eventCount = st.eventCount;
  t.eventBoats = st.eventBoats;
  t.eventHits = st.eventHits;
  t.eventPct = st.eventPct;
  const e = st.eventBoat >= 0 ? q.boats[st.eventBoat] : undefined;
  t.eventDirIdx = e ? landingDirIdx(st, e.x, e.y) : 0;
}

/** Result の材料が読む世界の部分（MissionWorld がそのまま満たす）: 揚陸の状態・雷撃の状態（PtTorpedoState の Result が読む欄）・PT ごとの方角と、米PT の隊（結末の phase・fate） */
export interface LandingResultWorld {
  readonly landing: {
    readonly state: LandingState;
    readonly tst: Parameters<typeof ptTorpedoOutcome>[0];
    readonly p: { readonly runDirJa: readonly string[] };
  } | null;
  readonly pts: { readonly section: PtSection } | null;
}

/**
 * 終了時に 1 回だけ: MissionResult.landing（v0.6.9 S7。ui/landing-result の 3 行・状況の行の頭・揚陸 300 点）: 揚陸の段階と %・被雷と不発、決着の前に終わった終わり方、
 * PT ごと（線の順）の方角・雷撃の結末（core/pt-torpedo の ptTorpedoOutcome）・斉射の距離・命中・不発・走っていた本数と撃った本数の和。揚陸の無い任務は {}（landing の鍵ごと無い）
 */
export function landingResultPart(w: LandingResultWorld, reason: MissionEndReason): { landing?: LandingResult } {
  const ld = w.landing;
  const q = w.pts ? w.pts.section : null;
  if (!ld || !q) return {};
  const st = ld.state;
  const t = ld.tst;
  const n = q.boats.length;
  const outcome: number[] = [];
  for (let i = 0; i < n; i++) outcome.push(ptTorpedoOutcome(t, q, i));
  return {
    landing: {
      phase: st.phase, pct: st.pct, pctAtSink: st.pctAtSink, hits: st.hits, duds: st.duds, sunkAfterDone: st.sunkAfterDone,
      endKind: landingEndKind(landingResolved(st), reason),
      dirJa: ld.p.runDirJa.slice(0, n), outcome, launchM: Array.from(t.launchM), salvoHits: Array.from(t.salvoHits), salvoDuds: Array.from(t.salvoDuds), salvoLeft: Array.from(t.salvoLeft),
      fired: t.fired, hurriedFired: t.hurriedFired, engagedFired: t.engagedFired,
    },
  };
}
