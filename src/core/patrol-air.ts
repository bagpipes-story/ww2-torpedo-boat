// 夜の哨戒機の門番（v0.6.7。日本ハードモード⑥・jp_02「孤島の哨戒」。docs/02 §6.8、spec-v067 §C.1）: 米の飛行艇 2 機の隊形が何度も捜しに来る。
// 段: 哨戒（画面の外）→ 接近（方位 θ_k の wake_detect_m から自艇へ。θ_k = from_bearing_deg + k × pass_rotate_deg）→ 付近の捜索（自艇から視程 near_m を orbit_s 回る）
// → 去る（leave_s）→ 哨戒。接近か付近の捜索で、見えていて run_radius_m ≤ 距離 ≤ lock_m なら発見 → 出撃（呼び手が core/air-sortie の restartAirSortie で空襲の core を 1 波）。
// 見え方: 最初の radar_passes 回の捜索はレーダー（止まっていても見える）。航跡（速力帯が巡航か全速）は wake_detect_m、静音で動く船体は自艇の視程、停止は見えない。
// 来るきっかけ: 最初は first_pass_s、以後は航跡の数え（漏れる形）が wake_trigger_s に届くか、哨戒が sweep_gap_s 続いたとき。
// Phaser 非依存・乱数なし・毎ステップ確保しない・平方根と atan2 なし（機の位置は自艇からの相対の方位と距離＝水上機と同じ。姿勢の sin/cos は描くときだけ）。
import type { SpeedStep } from './boat-motion';
import type { AircraftPose } from './friendly';
import { PA_EV_FIND, PA_EV_HUNT, PA_EV_LEAVE, PA_EV_OFF, PA_EV_PASS, PA_HUNT, PA_LEAVE, PA_OFF, PA_ORBIT, PA_PASS, PA_SORTIE, type PatrolParams, type PatrolState, type PatrolTelemetry } from './patrol-air-state';
import { degToRad, wrapDeg360 } from './units';

export * from './patrol-air-state';

/** 航跡が出ている（速力帯が巡航か全速＝静音の上限を超えた。帯は nextSpeedBand のヒステリシスのまま） */
export function patrolWake(band: SpeedStep): boolean {
  return band === 'cruise' || band === 'full';
}

/** 今の捜索から自艇が見えるか: レーダーは常に、航跡は wake_detect_m 以内、静音（動いている）は自艇の視程以内、停止は見えない */
export function patrolVisible(s: PatrolState, p: PatrolParams, band: SpeedStep): boolean {
  if (s.radar) return true;
  if (patrolWake(band)) return s.r <= p.wakeDetectM;
  if (band === 'silent') return s.r <= p.nearM;
  return false;
}

/** 哨戒 → 接近（k 回目の捜索。方位は from + k × rotate） */
function startPass(s: PatrolState, p: PatrolParams, wakeDue: boolean): void {
  s.phase = PA_PASS;
  s.radar = s.k < p.radarPasses;
  s.viaWake = !s.radar && wakeDue;
  s.bearingDeg = patrolNextBearingDeg(s, p);
  s.r = p.wakeDetectM;
  s.phaseT = 0;
  s.passStartT = s.t;
  s.k++;
  if (s.viaWake) s.passesWake++;
}

/** 哨戒に戻る（定時の捜索も航跡の数えも 0 から） */
function toHunt(s: PatrolState): number {
  s.phase = PA_HUNT;
  s.huntT = 0;
  s.wakeAcc = 0;
  s.phaseT = 0;
  return PA_EV_HUNT;
}

/**
 * 1 固定ステップ（feelDt は体感の実秒）。戻りは PA_EV_* のビット。
 * off: 夜明けのラッチ済み・沈没中・輪の中・座礁中（最初の 1 回で OFF。以後は何もしない）。
 * sortieDone: 夜の出撃が終わった（core/air-sortie の airSortieComplete。出撃中だけ読む）。
 * PA_EV_FIND のとき呼び手は findBearingDeg・findR の隊形で出撃を始める（同じステップの中で）。
 */
export function stepPatrolAir(s: PatrolState, p: PatrolParams, band: SpeedStep, off: boolean, sortieDone: boolean, feelDt: number): number {
  if (s.phase === PA_OFF) return 0;
  s.t += feelDt;
  if (off) {
    s.phase = PA_OFF;
    return PA_EV_OFF;
  }
  const ph = s.phase;
  if (ph === PA_HUNT) {
    s.huntT += feelDt;
    s.wakeAcc = patrolWake(band) ? s.wakeAcc + feelDt : s.wakeAcc > feelDt ? s.wakeAcc - feelDt : 0;
    // 最初の捜索は first_pass_s の時刻だけで来る（航跡で来たとは数えない）。以後は航跡の数えか定時
    const wakeDue = s.k > 0 && s.wakeAcc >= p.wakeTriggerS;
    if (s.k === 0 ? s.t >= p.firstPassS : wakeDue || s.huntT >= p.sweepGapS) {
      startPass(s, p, wakeDue);
      return PA_EV_PASS;
    }
    return 0;
  }
  if (ph === PA_SORTIE) return sortieDone ? toHunt(s) : 0;
  if (ph === PA_LEAVE) {
    s.phaseT += feelDt;
    s.r += p.flightMps * feelDt;
    return s.phaseT >= p.leaveS ? toHunt(s) : 0;
  }
  if (ph === PA_PASS) {
    s.phaseT += feelDt;
    s.r -= p.flightMps * feelDt;
    if (s.r <= p.nearM) {
      // 視程の線に着いた: 余った秒の分だけ付近を回る
      const over = (p.nearM - s.r) / p.flightMps;
      s.r = p.nearM;
      s.phase = PA_ORBIT;
      s.phaseT = over;
      s.bearingDeg = wrapDeg360(s.bearingDeg + p.orbitDegPerS * over);
    }
  } else {
    // PA_ORBIT: 自艇の周りを時計回りに回る。orbit_s で去る（見つけられなかった）
    s.phaseT += feelDt;
    s.bearingDeg = wrapDeg360(s.bearingDeg + p.orbitDegPerS * feelDt);
    if (s.phaseT >= p.orbitS) {
      s.phase = PA_LEAVE;
      s.phaseT = 0;
      if (!s.radar) s.hides++;
      return PA_EV_LEAVE;
    }
  }
  // 接近・付近の捜索: 見えていて run_radius_m ≤ 距離 ≤ lock_m なら発見（旋回の半径より近くでは発見しない＝受け渡しで機が跳ばない）
  if (s.r > p.lockM || s.r < p.runRadiusM || !patrolVisible(s, p, band)) return 0;
  s.finds++;
  if (!s.radar) {
    s.findsVisual++;
    if (Number.isNaN(s.firstVisualFindT)) s.firstVisualFindT = s.t;
    const warn = s.t - s.passStartT;
    if (warn < s.minVisualWarnS) s.minVisualWarnS = warn;
  }
  s.findBearingDeg = s.bearingDeg;
  s.findR = s.r;
  s.findPhase = s.phase;
  s.phase = PA_SORTIE;
  s.phaseT = 0;
  return PA_EV_FIND;
}

/** 接近の機が lock_m の線に着くまでの秒（接近の間だけ。ほかは NaN。模擬の台本が読む連続の値） */
export function patrolLockInS(s: PatrolState, p: PatrolParams): number {
  return s.phase === PA_PASS ? (s.r - p.lockM) / p.flightMps : NaN;
}

/** HUD の秒読み「あと N 秒で止まれ」: ceil(lock_m の線までの秒 − hud_stop_margin_s)、0 で頭打ち（接近の間だけ。ほかは NaN）。線の hud_stop_margin_s 秒前に 0 */
export function patrolCountdownS(s: PatrolState, p: PatrolParams): number {
  if (s.phase !== PA_PASS) return NaN;
  const x = (s.r - p.lockM) / p.flightMps - p.hudStopMarginS;
  return x > 0 ? Math.ceil(x) : 0;
}

/** 付近の捜索の残り秒（付近の捜索の間だけ。ほかは NaN） */
export function patrolOrbitLeftS(s: PatrolState, p: PatrolParams): number {
  if (s.phase !== PA_ORBIT) return NaN;
  const x = p.orbitS - s.phaseT;
  return x > 0 ? x : 0;
}

/** 次の捜索までの秒（哨戒の間だけ。最初は first_pass_s まで、以後は定時の sweep_gap_s まで。航跡で早まる分は wakeLeftS） */
export function patrolNextPassS(s: PatrolState, p: PatrolParams): number {
  if (s.phase !== PA_HUNT) return NaN;
  const x = s.k === 0 ? p.firstPassS - s.t : p.sweepGapS - s.huntT;
  return x > 0 ? x : 0;
}

/** 次の捜索が来る方位（哨戒の間の HUD「敵機 2 機が北東から来る」。from + k × rotate） */
export function patrolNextBearingDeg(s: PatrolState, p: PatrolParams): number {
  return wrapDeg360(p.fromBearingDeg + s.k * p.passRotateDeg);
}

/** 航跡の数えが wake_trigger_s に届くまでの秒（哨戒で数えている間だけ。最初の捜索の前と、数えが 0 なら NaN） */
export function patrolWakeLeftS(s: PatrolState, p: PatrolParams): number {
  if (s.phase !== PA_HUNT || s.k === 0 || !(s.wakeAcc > 0)) return NaN;
  const x = p.wakeTriggerS - s.wakeAcc;
  return x > 0 ? x : 0;
}

/**
 * HUD の「航跡が出ている ・ あと N 秒で敵機が寄ってくる」を出すか（v0.6.7 レビュー ux:ux-1・ux-4）: 航跡の帯で数えていて、定時の捜索より先に届く（次の捜索が NaN なら航跡のまま）。
 * 静音・停止で数えが減っている間（N が増えて見え、航跡では来ない）と、定時の捜索が先に来る間は出さない（2 行目は「次の捜索まで N 秒」）
 */
export function patrolWakeLine(p: PatrolTelemetry, band: SpeedStep): boolean {
  return patrolWake(band) && !Number.isNaN(p.wakeLeftS) && !(p.nextPassS < p.wakeLeftS);
}

/** 方位 bearingDeg・距離 r の機の相対の姿勢を out に（接近は機首が自艇・付近の捜索は時計回りの接線・去るは外向き） */
function poseAt(phase: number, bearingDeg: number, r: number, out: AircraftPose): void {
  const b = degToRad(bearingDeg);
  out.dx = r * Math.sin(b);
  out.dy = -r * Math.cos(b);
  out.headingDeg = wrapDeg360(phase === PA_PASS ? bearingDeg + 180 : phase === PA_ORBIT ? bearingDeg + 90 : bearingDeg);
}

/**
 * 捜索の機の自艇からの相対の姿勢（out に書いて返す。確保しない）。offsetDeg は機の隊形のずれ（夜の出撃の spawn_offsets_deg[i]＝受け渡しで同じ位置）。
 * 接近・付近の捜索は濃さ 1、去るは leave_s で薄くなる。哨戒・出撃中・OFF は濃さ 0（出撃中の機は空襲の core が描く。接近・付近の捜索・去る途中で OFF に入った機を
 * その場で消さず薄くして去らせる見た目は systems の側が持つ）
 */
export function patrolPose(s: PatrolState, p: PatrolParams, offsetDeg: number, out: AircraftPose): AircraftPose {
  const ph = s.phase;
  if (ph !== PA_PASS && ph !== PA_ORBIT && ph !== PA_LEAVE) {
    out.dx = 0;
    out.dy = 0;
    out.headingDeg = 0;
    out.alpha = 0;
    return out;
  }
  poseAt(ph, s.bearingDeg + offsetDeg, s.r, out);
  out.alpha = ph === PA_LEAVE ? Math.max(0, 1 - s.phaseT / p.leaveS) : 1;
  return out;
}

/** 発見の瞬間の捜索の機の姿勢（受け渡しの絵の向きの始まり。出撃の機は同じ方位・距離に出る）。濃さは 1 */
export function patrolFindPose(s: PatrolState, offsetDeg: number, out: AircraftPose): AircraftPose {
  poseAt(s.findPhase, s.findBearingDeg + offsetDeg, s.findR, out);
  out.alpha = 1;
  return out;
}
