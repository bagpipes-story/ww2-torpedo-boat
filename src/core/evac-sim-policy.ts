// 空襲下の退避の模擬（core/evac-sim）の遊び方の台本（v0.6.11 S3。jp_03。spec-v0611-r2 §12.2・§12.3）。艇長に見えるもの（隊の段階・赤い輪＝狙われている隊・隠れ場所の空き枠・
// 投下・火災・時計）だけを使い、毎フレームのスティック（針路・速さ）・［切替］のタップ・消火の長押し・機銃を書く。Phaser 非依存・毎フレーム確保しない（書き先は 1 回に 1 個）。
// 人の揺らぎ（spec §12.2）は別の系列（seed × EVAC_HUMAN_SEED_MUL ＋ EVAC_HUMAN_SEED_ADD。ゲームの系列とは別）: 切り替えた後に動き出すまで 2〜6 秒・出来事への反応 5〜12 秒・
// 切り替える時に 50% はスティックを倒したまま（走っている隊から。0.3〜1 秒で一度離す）・針路のぶれ ±10°・減速の誤差 ±30%・投下は 50% だけ転舵・消火は 1〜3 秒後・隠れ場所は 80% で最寄り。
// 舵取りの細部（隠れ場所への寄せ・走り回り・転舵・狙いの選び）は core/evac-sim-steer。
import type { AirStrikeState } from './air-strike';
import { G_FOUND, G_HAULING, G_HIDDEN, G_MOORED, G_UNDERWAY, SHELTER_CAVE } from './evac-data';
import { EF_FLYING, type EvacPlan } from './evac-plan';
import { EVAC_LOAD_AUTO, type EvacSeat } from './evac-seat';
import type { EvacSimAa } from './evac-sim-aa';
import { EVAC_HUMAN, EVAC_HUMAN_SEED_ADD, EVAC_HUMAN_SEED_MUL, EVAC_POLICY_SPECS, type EvacFrameOut, type EvacPolicy, type EvacPolicySpec } from './evac-sim-rows';
import { evacBestGroup, evacRoomFor, evacSteer, type EvacSteerState } from './evac-sim-steer';
import type { EvacSquadron } from './evac-squadron';
import { SeededRng } from './rng';

export * from './evac-sim-rows';
/** 押しても欲しい隊に届かない時に諦める回数（隊の数） */
const MAX_TAPS = 6;

/** 欲しい隊（タップを続ける条件）: 空き枠のある外の隊・外の隊・狙われたほかの外の隊・隠れた（上げている）隊・決まった隊 */
const W_NONE = 0;
const W_ROOM = 1;
const W_EXPOSED = 2;
const W_TARGET = 3;
const W_SAFE = 4;
const W_GROUP = 5;

/** 台本が読む模擬の部分 */
export interface EvacSimView {
  readonly sq: EvacSquadron;
  readonly seat: EvacSeat;
  readonly plan: EvacPlan;
  readonly dawn: AirStrikeState;
  readonly dawnLatched: boolean;
  readonly aa: EvacSimAa | null;
  readonly t: number;
}

export interface EvacDriver extends EvacSteerState {
  readonly policy: EvacPolicy;
  readonly sp: EvacPolicySpec;
  readonly rng: SeededRng;
  /** 模擬が書く: 射程に機がいる（前のステップ）・§2 の 4 機の投下の数 */
  inRange: boolean;
  dawnReleases: number;
  lastDawnRel: number;
  readonly lastDropped: Int32Array;
  lastWave: number;
  lastPhase: number;
  lastControl: number;
  /** タップ: 欲しい隊・決まった隊・押した回数・次に押す秒・倒したまま（その出力） */
  want: number;
  wantGroup: number;
  wantFrom: number;
  taps: number;
  nextTapAt: number;
  held: boolean;
  heldHeading: number;
  heldSpeed: number;
  /** 反応待ちの欲しい隊とその秒 */
  pendWant: number;
  pendAt: number;
  /** 切り替えた後: 倒したままを離す秒・動き出す秒 */
  releaseAt: number;
  moveAt: number;
  fireAt: number;
  backAt: number;
  backDone: boolean;
}

function range(r: SeededRng, x: readonly [number, number], bot: boolean): number {
  return bot ? 0 : r.nextRange(x[0], x[1]);
}

export function createEvacDriver(policy: EvacPolicy, seed: number, sq: EvacSquadron, _seat: EvacSeat): EvacDriver {
  const sp = EVAC_POLICY_SPECS[policy];
  const rng = new SeededRng((seed * EVAC_HUMAN_SEED_MUL + EVAC_HUMAN_SEED_ADD) >>> 0);
  const H = EVAC_HUMAN;
  const d: EvacDriver = {
    policy, sp, rng, inRange: false, dawnReleases: 0, lastDawnRel: 0, lastDropped: new Int32Array(64), lastWave: 0, lastPhase: G_MOORED, lastControl: sq.control,
    want: W_NONE, wantGroup: -1, wantFrom: -1, taps: 0, nextTapAt: 0, held: false, heldHeading: NaN, heldSpeed: 0, pendWant: W_NONE, pendAt: NaN,
    releaseAt: 0, moveAt: range(rng, H.moveDelayS, sp.bot), fireAt: NaN,
    backAt: sq.cfg.durationS - (sp.bot ? H.botBackBeforeS : rng.nextRange(H.backBeforeS[0], H.backBeforeS[1])), backDone: false,
    legGroup: -1, legShelter: -1, legBrake: 1, jitterDeg: 0, jitterUntil: 0, roamK: 0, dodgeAt: NaN, dodgeUntil: -1, dodgeHeading: NaN, lastCmdHeading: NaN,
  };
  return d;
}

/** 座席に新しい隊長艇が入った（core/evac-sim の hooks）: 全滅の後の自動の切替は人の切替と同じに（倒したままなら離してから・動き出すまで待つ） */
export function evacDriverSeatLoaded(d: EvacDriver, _gi: number, kind: number, t: number): void {
  d.legGroup = -1;
  d.dodgeUntil = -1;
  d.dodgeAt = NaN;
  if (kind !== EVAC_LOAD_AUTO) return;
  d.releaseAt = d.heldSpeed > 0 ? t + range(d.rng, EVAC_HUMAN.releaseS, d.sp.bot) : t;
  d.moveAt = t + range(d.rng, EVAC_HUMAN.moveDelayS, d.sp.bot);
}

const exposed = (ph: number): boolean => ph === G_MOORED || ph === G_UNDERWAY || ph === G_FOUND;

/** 欲しい隊か */
function wantOk(d: EvacDriver, v: EvacSimView, gi: number): boolean {
  const g = v.sq.groups[gi]!;
  if (g.leader < 0) return false;
  switch (d.want) {
    case W_ROOM:
      return exposed(g.phase) && evacRoomFor(v.sq, g, false) >= 0;
    case W_EXPOSED:
      return exposed(g.phase);
    case W_TARGET:
      return exposed(g.phase) && v.sq.targeted[gi] === 1 && gi !== d.wantFrom;
    case W_SAFE:
      return g.phase === G_HIDDEN || g.phase === G_HAULING;
    case W_GROUP:
      return gi === d.wantGroup;
    default:
      return true;
  }
}

/** 欲しい隊が今の隊でなく、ほかにあるか */
function wantExists(d: EvacDriver, v: EvacSimView): boolean {
  for (let gi = 0; gi < v.sq.groups.length; gi++) if (gi !== v.sq.control && wantOk(d, v, gi)) return true;
  return false;
}

/** 切り替え始める（欲しい隊が今の隊なら何もしない。無ければ seq は外の隊を助けに＝W_EXPOSED） */
function startWant(d: EvacDriver, v: EvacSimView, want: number, t: number): void {
  d.want = want;
  d.wantFrom = v.sq.control;
  if (want === W_ROOM && d.sp.bot) {
    d.wantGroup = evacBestGroup(v.sq);
    d.want = d.wantGroup >= 0 ? W_GROUP : W_EXPOSED;
  }
  if (wantOk(d, v, v.sq.control) && d.want !== W_TARGET) {
    d.want = W_NONE;
    return;
  }
  if (!wantExists(d, v) && d.want === W_ROOM) d.want = W_EXPOSED;
  if (!wantExists(d, v)) {
    d.want = W_NONE;
    return;
  }
  d.taps = 0;
  d.nextTapAt = t;
  const g = v.sq.groups[v.sq.control]!;
  d.held = !d.sp.bot && g.phase === G_UNDERWAY && d.heldSpeed > 0 && d.rng.next() < EVAC_HUMAN.holdStickP;
}

/** 反応の秒 */
function reactAt(d: EvacDriver, t: number): number {
  return t + range(d.rng, d.sp.react ?? EVAC_HUMAN.reactS, d.sp.bot);
}

/** 出来事: 予告（ring の遊び方は狙われたほかの隊へ）・操作中の隊の段階（上げ始めた・隠れた・見つかった）・投下（転舵） */
function events(d: EvacDriver, v: EvacSimView): void {
  const { sq, plan, t } = v;
  const g = sq.groups[sq.control]!;
  if (plan.nextWave > d.lastWave) {
    d.lastWave = plan.nextWave;
    const seqNoRoom = d.sp.hide === 'seq' && !wantRoomAnywhere(v);
    if ((d.sp.ring || seqNoRoom) && !sq.settled) {
      d.pendWant = W_TARGET;
      d.pendAt = reactAt(d, t);
    }
  }
  if (sq.control !== d.lastControl) {
    d.lastControl = sq.control;
    d.lastPhase = g.phase;
  } else if (g.phase !== d.lastPhase) {
    const ph = g.phase;
    d.lastPhase = ph;
    if (d.sp.hide === 'seq' && !sq.settled && ((ph === G_HAULING && !d.sp.waitUp) || (ph === G_HIDDEN && (d.sp.waitUp || sq.p.shelters[g.shelter]?.kind !== SHELTER_CAVE)))) {
      d.pendWant = W_ROOM;
      d.pendAt = reactAt(d, t);
    }
    if (ph === G_FOUND) {
      d.legGroup = -1;
      d.moveAt = reactAt(d, t);
    }
  }
  // 操作中の隊を狙う編隊の投下（と 240 秒の後の §2 の 4 機）: 人は dodgeP だけ転舵する
  for (let i = 0; i < plan.flights.length; i++) {
    const fl = plan.flights[i]!;
    if (fl.phase !== EF_FLYING) continue;
    const n = fl.port.state.bombsDropped;
    if (n > d.lastDropped[i]!) {
      d.lastDropped[i] = n;
      if (fl.target === sq.control) cueDodge(d, t);
    }
  }
  if (d.dawnReleases > d.lastDawnRel) {
    d.lastDawnRel = d.dawnReleases;
    cueDodge(d, t);
  }
}

function cueDodge(d: EvacDriver, t: number): void {
  const p = d.sp.bot ? 1 : EVAC_HUMAN.dodgeP;
  if (!(d.rng.next() < p)) return;
  d.dodgeAt = t + range(d.rng, EVAC_HUMAN.dodgeReactS, d.sp.bot);
  d.dodgeUntil = d.dodgeAt + EVAC_HUMAN.dodgeHoldS;
  d.dodgeHeading = NaN;
}

/** 空き枠のある外の隊がどこかにいる */
function wantRoomAnywhere(v: EvacSimView): boolean {
  for (let gi = 0; gi < v.sq.groups.length; gi++) {
    const g = v.sq.groups[gi]!;
    if (g.leader >= 0 && exposed(g.phase) && evacRoomFor(v.sq, g, false) >= 0) return true;
  }
  return false;
}

/** 1 フレームの入力（固定ステップの前） */
export function evacDriverFrame(d: EvacDriver, v: EvacSimView, out: EvacFrameOut): void {
  const { sq, seat, t } = v;
  out.switchTap = false;
  out.extHeld = false;
  out.gunHeld = d.sp.gun === 'always' || (d.sp.gun === 'range' && d.inRange);
  events(d, v);
  // 消火（座席の火災に人は 1〜3 秒で気づいて長押し）
  if (seat.damage.fireLeftS > 0) {
    if (Number.isNaN(d.fireAt)) d.fireAt = t + range(d.rng, EVAC_HUMAN.extinguishS, d.sp.bot);
    out.extHeld = t >= d.fireAt;
  } else d.fireAt = NaN;
  // タップの途中
  if (d.want !== W_NONE) {
    if (wantOk(d, v, sq.control) && sq.control !== d.wantFrom) {
      d.want = W_NONE;
      d.releaseAt = d.held ? t + range(d.rng, EVAC_HUMAN.releaseS, d.sp.bot) : t;
      d.moveAt = t + range(d.rng, EVAC_HUMAN.moveDelayS, d.sp.bot);
      d.legGroup = -1;
    } else if (d.taps >= MAX_TAPS || sq.settled) {
      d.want = W_NONE;
    } else {
      if (t >= d.nextTapAt) {
        out.switchTap = true;
        d.taps++;
        d.nextTapAt = t + (d.sp.bot ? 0 : EVAC_HUMAN.tapGapS);
      }
      held(d, out);
      return;
    }
  }
  if (!Number.isNaN(d.pendAt) && t >= d.pendAt) {
    d.pendAt = NaN;
    if (!sq.settled) startWant(d, v, d.pendWant, t);
    if (d.want !== W_NONE) {
      held(d, out);
      return;
    }
  }
  if (d.sp.back && !d.backDone && t >= d.backAt && !sq.settled) {
    d.backDone = true;
    if (exposed(sq.groups[sq.control]!.phase)) {
      startWant(d, v, W_SAFE, t);
      if (d.want !== W_NONE) {
        held(d, out);
        return;
      }
    }
  }
  if (t < d.releaseAt) {
    held(d, out);
    return;
  }
  d.held = false;
  if (t < d.moveAt) {
    out.headingDeg = NaN;
    out.speed01 = 0;
  } else evacSteer(d, v, out);
  d.heldHeading = out.headingDeg;
  d.heldSpeed = out.speed01;
}

/** 倒したまま（切り替える間）か中立 */
function held(d: EvacDriver, out: EvacFrameOut): void {
  out.headingDeg = d.held ? d.heldHeading : NaN;
  out.speed01 = d.held ? d.heldSpeed : 0;
}

