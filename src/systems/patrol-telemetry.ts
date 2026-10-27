// 夜の哨戒機（v0.6.7。jp_02「孤島の哨戒」。docs/02 §6.8、spec-v067 §C.3・§D.3）の HUD 向けテレメトリと Result の材料。mission-telemetry から呼ぶ。
// t.patrol は createTelemetry で 1 回だけ作り（initPatrolTelemetry）、refreshPatrolTelemetry が毎フレーム 1 回だけ中身を書き換える（§7: 確保しない）。哨戒の無い任務は enabled false のまま何も書かない。
// 画面外の「敵機」の矢印（t.planeDx / planeDy）は機が画面にいるときだけ書く（捜索の 1 番機か、出撃の印の機。NaN は書かない＝水上機の値のまま。レビュー R14）。
// 順は 水上機 → 夜の哨戒 → 夜明け（夜明けは来ているときだけ上書き）。世界は構造の型で読む（systems/patrol-air の PatrolAir がそのまま満たす。PatrolAir を import すると
// Phaser と game-config の DOM がテストの node 型検査に入るため）。
import { AS_INBOUND, AS_RUN, AS_T_FALLING, AS_T_INBOUND, AS_T_ORBIT, AS_T_REST, AS_T_RUN, airStrikeActive, strikeFocusPlane, strikePose, strikeThreat, type AirStrikeParams, type AirStrikeState } from '../core/air-strike';
import { sortieBombs, sortieDamage, sortieHits, type SortieBase } from '../core/air-sortie';
import type { BoatTelemetry, SpeedStep } from '../core/boat-motion';
import type { AircraftPose } from '../core/friendly';
import {
  PA_HUNT, PA_LEAVE, PA_ORBIT, PA_PASS, PA_SORTIE, createPatrolTelemetry, patrolCountdownS, patrolNextBearingDeg, patrolNextPassS, patrolOrbitLeftS, patrolVisible, patrolWakeLeftS,
  type PatrolParams, type PatrolState, type PatrolTelemetry,
} from '../core/patrol-air';
import type { PatrolResult } from '../ui/result-types';

/** 夜の哨戒機の世界側（systems/patrol-air の PatrolAir）のうちテレメトリと Result が読む部分 */
export interface PatrolView {
  readonly state: PatrolState;
  readonly gate: PatrolParams;
  readonly sortie: AirStrikeParams;
  readonly flight: { readonly state: AirStrikeState };
  readonly base: SortieBase;
  /** 結果の行（0 無し・1 見つけられずに去る・2 出撃が去る）と、その終わりの門番の時刻（体感秒）、再出撃が空中の爆弾で遅れたステップ（F12） */
  readonly resultKind: number;
  readonly resultUntilT: number;
  readonly restartDelayed: number;
  /** 捜索の機 i の自艇からの相対の姿勢（夜明け・沈没・輪で去る途中の見た目も。画面にいなければ濃さ 0） */
  searchPose(i: number, out: AircraftPose): AircraftPose;
}

/** テレメトリが読む世界の部分（MissionWorld がそのまま満たす） */
export interface PatrolTelemetryWorld {
  readonly patrol: PatrolView | null;
  readonly band: SpeedStep;
}

/** 出発時の t.patrol（任務で決まる値: 機の数・静音の上限・3 つの距離）。哨戒の無い任務は enabled false のまま */
export function initPatrolTelemetry(w: PatrolTelemetryWorld): PatrolTelemetry {
  const d = createPatrolTelemetry();
  const pa = w.patrol;
  if (!pa) return d;
  d.enabled = true;
  d.planes = pa.gate.planes;
  d.quietKt = pa.gate.quietKt;
  d.wakeDetectM = pa.gate.wakeDetectM;
  d.lockM = pa.gate.lockM;
  d.nearM = pa.gate.nearM;
  fillPatrol(d, pa, w.band);
  return d;
}

/** 毎フレーム 1 回（水上機の後・夜明けの前）: t.patrol を書き、機が画面にいれば「敵機」の矢印をその機で書く（scratch に書く。いなければ書かない） */
export function refreshPatrolTelemetry(t: BoatTelemetry, w: PatrolTelemetryWorld, scratch: AircraftPose): void {
  const pa = w.patrol;
  if (!pa) return;
  fillPatrol(t.patrol, pa, w.band);
  const fl = pa.flight.state;
  if (airStrikeActive(fl)) {
    const i = strikeFocusPlane(fl, pa.sortie);
    if (i < 0) return;
    const q = strikePose(fl, pa.sortie, i, scratch);
    t.planeDx = q.dx;
    t.planeDy = q.dy;
    return;
  }
  const q = pa.searchPose(0, scratch);
  if (q.alpha <= 0) return;
  t.planeDx = q.dx;
  t.planeDy = q.dy;
}

/** 段ごとに使う値だけ入れ、ほかは中立の値（2 行目のキーが無駄に変わらない） */
function fillPatrol(d: PatrolTelemetry, pa: PatrolView, band: SpeedStep): void {
  const s = pa.state;
  const g = pa.gate;
  const ph = s.phase;
  const searching = ph === PA_PASS || ph === PA_ORBIT;
  d.phase = ph;
  d.passes = s.k;
  d.radar = s.radar;
  d.viaWake = s.viaWake;
  d.seen = searching && patrolVisible(s, g, band);
  d.bearingDeg = ph === PA_HUNT ? patrolNextBearingDeg(s, g) : ph === PA_SORTIE ? s.findBearingDeg : searching || ph === PA_LEAVE ? s.bearingDeg : NaN;
  d.distM = searching || ph === PA_LEAVE ? s.r : ph === PA_SORTIE ? s.findR : NaN;
  d.countdownS = patrolCountdownS(s, g);
  d.orbitLeftS = patrolOrbitLeftS(s, g);
  d.nextPassS = patrolNextPassS(s, g);
  d.wakeLeftS = patrolWakeLeftS(s, g);
  const fl = pa.flight.state;
  const threat = strikeThreat(fl);
  d.threat = threat;
  d.plane = -1;
  d.fallingArc = false;
  d.bombsLeft = 0;
  if (threat === AS_T_FALLING) {
    // 落下中の爆弾は常に 1 発（run_gap_s > 落下。検査済み）。狙いが旋回の弧の先なら「旋回と逆へ」（dawn-telemetry と同じ判定）
    for (let i = 0; i < fl.bombs.length; i++) {
      const b = fl.bombs[i]!;
      if (!b.active) continue;
      d.plane = b.plane;
      d.fallingArc = !(b.yawDegS === 0 || Math.abs(b.yawDegS) < pa.sortie.aimTurnMinDegS);
      break;
    }
  } else if (threat === AS_T_RUN) {
    for (let i = 0; i < fl.planes.length && d.plane < 0; i++) if (fl.planes[i]!.phase === AS_RUN) d.plane = i;
  } else if (threat === AS_T_INBOUND) {
    // 発見の直後の接近: 距離は近い方の機（1,500 m → 旋回の 600 m）。方位は発見の方位のまま
    let r = Infinity;
    for (let i = 0; i < fl.planes.length; i++) if (fl.planes[i]!.phase === AS_INBOUND && fl.planes[i]!.r < r) r = fl.planes[i]!.r;
    d.distM = r;
  } else if (threat === AS_T_ORBIT) {
    d.plane = fl.nextRun % pa.sortie.planes;
    for (let i = 0; i < fl.planes.length; i++) d.bombsLeft += fl.planes[i]!.bombsLeft;
  }
  d.sortieBombs = sortieBombs(fl, pa.base);
  d.sortieHits = sortieHits(fl, pa.base);
  d.sortieDamage = sortieDamage(fl, pa.base);
  // 結果の行: 出撃の機が爆弾を落とし切って去る間（脅威が波の合間＝REST）と、出撃の終わり・見つけられずに去る捜索から PATROL_RESULT_SHOW_S
  const shown = pa.resultKind !== 0 && s.t < pa.resultUntilT;
  d.resultKind = ph === PA_SORTIE && threat === AS_T_REST ? 2 : shown ? pa.resultKind : 0;
  d.resultLeftS = shown ? pa.resultUntilT - s.t : 0;
  d.passesWake = s.passesWake;
  d.hides = s.hides;
  d.finds = s.finds;
  d.findsVisual = s.findsVisual;
  d.restartDelayed = pa.restartDelayed;
}

/** 終了時に 1 回だけ: MissionResult.patrol（哨戒の無い任務は null。転舵の秒は夜の出撃で自艇を狙って着弾した爆弾の分だけ写す） */
export function patrolResult(w: PatrolTelemetryWorld): PatrolResult | null {
  const pa = w.patrol;
  if (!pa) return null;
  const s = pa.state;
  const fl = pa.flight.state;
  return {
    passes: s.k,
    passesWake: s.passesWake,
    hides: s.hides,
    finds: s.finds,
    findsVisual: s.findsVisual,
    bombs: fl.bombsDropped,
    hits: fl.hitsPlayer,
    damage: fl.damagePlayer,
    dodgeS: fl.dodgeS.slice(0, Math.min(fl.dodgeCount, fl.dodgeS.length)),
    restartDelayed: pa.restartDelayed,
  };
}
