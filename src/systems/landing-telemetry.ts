// 停泊して揚陸する味方の輸送船と米PT の雷撃（v0.6.9 S5b。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v069 D15・§5・L6）の HUD 向けテレメトリ。
// mission-telemetry から呼ぶ（convoy-telemetry・patrol-telemetry と同じ形）。テレメトリの landing は createTelemetry で 1 回だけ作り（initLandingTelemetry）、
// refreshLandingTelemetry が毎フレーム 1 回だけ中身を書き換える（§7: 確保しない。報告の書き先は module に 1 個）。揚陸の無い任務（w.landing が null）は enabled false のまま何も書かない。
// 読むのは揚陸の世界（systems/world-landing の WorldLanding）の状態だけ: 揚陸・雷撃の数え・走っている雷跡（updateVisuals が毎フレーム数える＝Scene は updateFrame の後にここを呼ぶ）。
// 見張りの報告は core/landing の landingReport（模擬の方針と同じ関数）、輸送船が射線に入る（R14 A1）は landingFireLine（模擬の lure_cue と同じ関数）。
// 平方根は報告の距離の 1 回・輸送船までの 1 回・射線の PT までの 1 回（いるときだけ）、atan2 は報告と射線の候補・射線の PT・出来事が変わったフレームの 1 回だけ。
// 世界は構造の型 LandingTelemetryWorld で読む（MissionWorld がそのまま満たす。MissionWorld を import すると Phaser がテストの node 型検査に入るため）。
import type { BoatState } from '../core/boat-motion';
import {
  createLandingReport, createLandingTelemetry, LANDING_DIST_STEP_M, LANDING_FIRE_LINE_EXTRA_M, landingDirIdx, landingFireLine, landingReport, landingResolved, LD_UNLOADING, type LandingState, type LandingTelemetry, type LandingWakes,
} from '../core/landing';
import type { LandingParams } from '../core/landing-data';
import { PT_FATE_NONE, PT_LEAVE, type PtSection } from '../core/pt-boats';

/** テレメトリが読む世界の部分 */
export interface LandingTelemetryWorld {
  /** 揚陸の世界（systems/world-landing。揚陸の無い任務は null）: 揚陸・雷撃の数え（PtTorpedoState の一部）・走っている雷跡・値・雷撃の値（1 斉射の本数・慌てる距離・斉射の距離・戦いながらの倍率） */
  readonly landing: {
    readonly state: LandingState;
    readonly tst: { readonly left: Uint8Array; readonly salvos: number; readonly fired: number };
    readonly wakes: LandingWakes;
    readonly p: LandingParams;
    readonly tp: { readonly n: number; readonly hurriedM: number; readonly launchM: number; readonly engagedFactor: number };
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
