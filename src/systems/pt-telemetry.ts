// 敵の米PT（v0.6.3。docs/02 §6.4、spec §C.5・§D.4）の HUD 向けテレメトリと Result の材料。mission-telemetry から呼ぶ（dawn-telemetry と同じ形）。
// テレメトリの pt は createTelemetry で 1 回だけ作り（initPtTelemetry）、refreshPtTelemetry が毎フレーム 1 回だけ中身を書き換える（§7: 確保しない・平方根なし。
// 距離と方角は 2 行目を出すモードのときだけ ui/pt-lines の ptKey が求める）。米PT の無い任務は enabled false のまま何も書かない。
// 世界は構造の型 PtTelemetryWorld で読む（MissionWorld がそのまま満たす。MissionWorld を import すると Phaser がテストの node 型検査に入るため）。
import type { BoatState, SpeedStep } from '../core/boat-motion';
import { bearingJa } from '../core/briefing';
import { PT_LEAVE, createPtTelemetry, threatIndex, type PtParams, type PtSection, type PtTelemetry } from '../core/pt-boats';
import { mpsToKt } from '../core/units';
import type { PtResult } from '../ui/result-types';

/** テレメトリと Result が読む世界の部分 */
export interface PtTelemetryWorld {
  /** 米PT の隊（systems/pt-squadron。無い任務は null） */
  readonly pts: { readonly section: PtSection; readonly p: PtParams; readonly firstDetectBand: SpeedStep | '' } | null;
  readonly boat: { readonly state: BoatState };
  /** 艇の静音の上限（2 行目の「14 kt 以下に」） */
  readonly params: { readonly silentMaxMps: number };
  /** 自艇の視程の二乗（見えている PT だけ距離を出す） */
  readonly visRange2: number;
}

/** 出発時の pt（任務で決まる値: 隻数・航過の上限・1 発の HP・静音の上限 kt・去る方角。毎フレームは変えない） */
export function initPtTelemetry(w: PtTelemetryWorld): PtTelemetry {
  const t = createPtTelemetry();
  const s = w.pts;
  if (!s) return t;
  t.enabled = true;
  t.total = s.p.count;
  t.maxPasses = s.p.count * s.p.maxPasses;
  t.damagePerHit = s.p.hit.damage;
  t.silentMaxKt = Math.round(mpsToKt(w.params.silentMaxMps));
  t.leaveDirJa = bearingJa(s.p.leaveHeadingDeg);
  refreshPtTelemetry(t, w);
  return t;
}

/** 毎フレーム 1 回: 隊の段階・航過・脅威の PT（core の threatIndex）の相対位置とそれが見えているか（距離二乗） */
export function refreshPtTelemetry(t: PtTelemetry, w: PtTelemetryWorld): void {
  const s = w.pts;
  if (!s) return;
  const q = s.section;
  let alive = 0;
  for (let i = 0; i < q.boats.length; i++) if (q.boats[i]!.phase < PT_LEAVE) alive++;
  t.alive = alive;
  t.out = q.out;
  t.detected = q.detected;
  t.passing = q.owner >= 0;
  t.fired = q.owner >= 0 && q.boats[q.owner]!.firedThisPass > 0;
  t.dodge = q.owner >= 0 ? q.dodge : 0;
  const b = w.boat.state;
  const i = threatIndex(q, b.x, b.y);
  const pt = i < 0 ? null : q.boats[i]!;
  t.threatPhase = pt ? pt.phase : -1;
  t.dx = pt ? pt.x - b.x : NaN;
  t.dy = pt ? pt.y - b.y : NaN;
  t.sighted = pt !== null && t.dx * t.dx + t.dy * t.dy <= w.visRange2;
  t.passes = q.passes;
  t.passSeq = q.passSeq;
  t.lastPassHits = q.lastPassHits;
  t.leftAtDawn = q.leftAtDawn;
}

/** 終了時に 1 回だけ: MissionResult.pt（見つかった回数は世界の detect.count＝MissionResult.detections） */
export function ptResult(w: PtTelemetryWorld): PtResult | null {
  const s = w.pts;
  if (!s) return null;
  const q = s.section;
  return {
    total: s.p.count,
    out: q.out,
    leftAtDawn: q.leftAtDawn,
    passes: q.passes,
    maxPasses: s.p.count * s.p.maxPasses,
    firedPasses: q.firedPasses,
    cleanPasses: q.cleanPasses,
    shots: q.shots,
    hits: q.hits,
    damagePerHit: s.p.hit.damage,
    firstDetectM: q.firstDetectM,
    firstDetectBand: s.firstDetectBand,
    lostContacts: q.lostContacts,
    closestM: Math.sqrt(q.closest2),
    minWarnS: q.minWarnS,
  };
}
