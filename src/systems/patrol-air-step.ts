// 夜の哨戒機（v0.6.7。日本ハードモード⑥・jp_02「孤島の哨戒」。docs/02 §6.8、spec-v067 §C.2・§C.3）の世界側の段（Phaser なし。絵は systems/patrol-air の PatrolAir が足す）:
// 門番（core/patrol-air）を固定ステップで進め、発見のたびに夜の出撃（夜明けの空襲の core を 1 波だけ。core/air-sortie の restartAirSortie）を始め、夜の出撃（flight）を進める。
// 次の波は出させない: 出撃の読み口（SortieView）が、門番が出撃の段でなければ「輪の中」を返す（AirStrikeFlight が中断を立てる。完了の瞬間は全機 DONE で見た目は変わらない）。
// 空中に爆弾があって出撃を始められなければ（R17。今の不変では起きない）次のステップから試し直し、通るまで restartDelayed を数える（F12。0 のはず）。
// 2 行目の結果の行（見つけられずに去る・出撃が去る）の時刻、受け渡しの向きの残り秒、OFF に入ったとき見えていた捜索の機を去らせる見た目もここで持つ（読むのは絵とテレメトリ）。
// flight は構造の型（systems/air-strike-flight の AirStrikeFlight がそのまま満たす。import すると game-config の DOM がテストの node 型検査に入るため。tests は core で組んだ偽物を渡す）。
// §7: 確保は constructor だけ。毎ステップは読み書きだけ（sin/cos は searchPose を描くときだけ）。
import { PATROL_RESULT_SHOW_S } from '../config/patrol-config';
import type { PatrolAirSetup } from '../config/patrol-air-mission-data';
import { AIR_STRIKE_FADE_S, bombInAir, type AirStrikeParams, type AirStrikeState } from '../core/air-strike';
import { airSortieComplete, createSortieBase, restartAirSortie, type SortieBase } from '../core/air-sortie';
import type { BoatState, SpeedStep } from '../core/boat-motion';
import type { AircraftPose } from '../core/friendly';
import { PA_EV_FIND, PA_EV_HUNT, PA_EV_LEAVE, PA_EV_OFF, PA_EV_PASS, PA_LEAVE, PA_ORBIT, PA_PASS, PA_SORTIE, createPatrolAir, patrolFindPose, patrolPose, stepPatrolAir, type PatrolParams, type PatrolState } from '../core/patrol-air';
import { degToRad, wrapDeg360 } from '../core/units';
import type { PatrolView } from './patrol-telemetry';

/** 夜の出撃が世界から読む部分（systems/air-strike-flight の AirStrikeWorldView と同じ形。MissionWorld がそのまま満たす） */
export interface SortieWorldView {
  readonly boat: { readonly state: BoatState; readonly sinking: boolean };
  readonly atHome: boolean;
  readonly grounded: boolean;
  readonly escort: { readonly state: { readonly boat: BoatState; readonly sunk: boolean } } | null;
}

/** 門番と出撃の材料として世界から読む部分（MissionWorld がそのまま満たす） */
export interface PatrolWorldView extends SortieWorldView {
  /** このステップの速力帯（航跡は巡航か全速・静音・停止） */
  readonly band: SpeedStep;
  /** 夜明けに達した（門番は OFF。夜明けの 4 機は world-dawn） */
  readonly dawn: { readonly reached: boolean };
  /** 兵装（v0.6.8。systems/arms-step）: 機銃の閃光の距離（撃っていなければ 0）。無い世界（tests の kit）は閃光なし */
  readonly arms?: { readonly flashM: number } | null;
}

/** 夜の出撃の口（AirStrikeFlight の state と step） */
export interface PatrolFlight {
  readonly state: AirStrikeState;
  step(feelDt: number, w: SortieWorldView): void;
}

/** 夜の出撃に渡す世界の読み口: 門番が出撃の段でなければ輪の中と同じに見せる（中断を立てて次の波を出させない） */
class SortieView implements SortieWorldView {
  w: SortieWorldView | null = null;
  constructor(private readonly gate: PatrolState) {}
  get boat(): SortieWorldView['boat'] { return this.w!.boat; }
  get atHome(): boolean { return this.w!.atHome || this.gate.phase !== PA_SORTIE; }
  get grounded(): boolean { return this.w!.grounded; }
  get escort(): SortieWorldView['escort'] { return this.w!.escort; }
}

export class PatrolAirStep implements PatrolView {
  readonly state: PatrolState;
  readonly base: SortieBase;
  readonly gate: PatrolParams;
  readonly sortie: AirStrikeParams;
  resultKind = 0;
  resultUntilT = 0;
  restartDelayed = 0;
  /** 発見の瞬間の捜索の機 i の向き（受け渡しの絵の向きの始まり）と、受け渡しの残りの体感秒（AIR_STRIKE_FADE_S から 0 へ） */
  readonly findHeadingDeg: number[] = [];
  handoffS = 0;
  /** 発見したが空中の爆弾で出撃をまだ始められない（次のステップから試し直す） */
  private pendingRestart = false;
  private readonly view: SortieView;
  /** OFF に入ったときに見えていた捜索の機を去らせる残りの体感秒と、その方位・距離 */
  private offLeaveS = 0;
  private offBearingDeg = 0;
  private offR = 0;
  private readonly scratch: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };

  constructor(setup: PatrolAirSetup, readonly flight: PatrolFlight) {
    this.gate = setup.gate;
    this.sortie = setup.sortie;
    this.state = createPatrolAir();
    this.base = createSortieBase();
    this.view = new SortieView(this.state);
    for (let i = 0; i < this.gate.planes; i++) this.findHeadingDeg.push(0);
  }

  /** 捜索の機が来ているか（接近〜出撃）か夜の爆弾が空中（味方機を同時に来させない。jp_02 に味方機はいないが式の正しさのため） */
  get active(): boolean {
    const ph = this.state.phase;
    return (ph >= PA_PASS && ph <= PA_SORTIE) || bombInAir(this.flight.state);
  }

  /** 固定ステップ（帯の後・水上機の後・発見距離の前）: 門番 → 発見なら再出撃 → 夜の出撃（feelDt は体感の実秒） */
  step(feelDt: number, w: PatrolWorldView): void {
    const s = this.state;
    const before = s.phase;
    const fl = this.flight.state;
    const off = w.dawn.reached || w.boat.sinking || w.atHome || w.grounded;
    const ev = stepPatrolAir(s, this.gate, w.band, off, !this.pendingRestart && airSortieComplete(fl), feelDt, w.arms ? w.arms.flashM : 0);
    if (ev & (PA_EV_PASS | PA_EV_FIND | PA_EV_OFF)) this.resultKind = 0;
    if (ev & PA_EV_LEAVE) this.showResult(1);
    if ((ev & PA_EV_HUNT) !== 0 && before === PA_SORTIE) this.showResult(2);
    if (ev & PA_EV_FIND) {
      for (let i = 0; i < this.findHeadingDeg.length; i++) this.findHeadingDeg[i] = patrolFindPose(s, this.sortie.spawnOffsetsDeg[i]!, this.scratch).headingDeg;
      this.pendingRestart = true;
    }
    if (ev & PA_EV_OFF) {
      this.pendingRestart = false;
      if (before === PA_PASS || before === PA_ORBIT || before === PA_LEAVE) {
        this.offLeaveS = before === PA_LEAVE ? Math.max(0, this.gate.leaveS - s.phaseT) : this.gate.leaveS;
        this.offBearingDeg = s.bearingDeg;
        this.offR = s.r;
      }
    }
    if (this.pendingRestart) {
      if (restartAirSortie(fl, this.sortie, w.boat.state, s.findBearingDeg, s.findR, this.base)) {
        this.pendingRestart = false;
        this.handoffS = AIR_STRIKE_FADE_S;
      } else this.restartDelayed++;
    }
    this.view.w = w;
    this.flight.step(feelDt, this.view);
    if (this.handoffS > 0) this.handoffS -= feelDt;
    if (this.offLeaveS > 0) {
      this.offLeaveS -= feelDt;
      this.offR += this.gate.flightMps * feelDt;
    }
  }

  private showResult(kind: number): void {
    this.resultKind = kind;
    this.resultUntilT = this.state.t + PATROL_RESULT_SHOW_S;
  }

  /** 捜索の機 i の自艇からの相対の姿勢（out に書いて返す）。OFF の後に去る途中なら外向きに薄く、それ以外は門番の段のまま（哨戒・出撃中・OFF は濃さ 0） */
  searchPose(i: number, out: AircraftPose): AircraftPose {
    const off = this.sortie.spawnOffsetsDeg[i]!;
    if (!(this.offLeaveS > 0)) return patrolPose(this.state, this.gate, off, out);
    const deg = wrapDeg360(this.offBearingDeg + off);
    const b = degToRad(deg);
    out.dx = this.offR * Math.sin(b);
    out.dy = -this.offR * Math.cos(b);
    out.headingDeg = deg;
    out.alpha = this.offLeaveS / this.gate.leaveS;
    return out;
  }
}
