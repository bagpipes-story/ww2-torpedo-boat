// 空襲下の退避（v0.6.11。jp_03。spec-v0611-r2 §3.3・§3.8）の座席: 世界の自艇（MissionWorld の boat.state・damage・params・band）は操作中の隊長艇の作業用の写し。
// 写し（値の代入だけ）・［切替］の並び（r2 H3: 狙われている隊 → 外の隊 → 上げている隊 → 隠れている隊。乱数なし・固定長）・スティックの latch（r2 M3）・
// 隊長艇の沈没の振り替え evacSinkLeader（記録を沈没 → 交代 → 編隊の付け替え → 全滅なら自動の切替 → 新しい隊長艇を座席へ。同期に完結＝r2 H5。世界も模擬もこれを呼ぶ）、
// 記録への被弾・火災（操作していない隊長艇は消火しない）・帰投の判定。Phaser 非依存・確保しない（並びは隊の数の固定長）。世界に固有のこと（fireReason・消火の長押し・
// 乗員の前回値・一斉発射の待ち・編隊の付け替え・絵）は hooks で呼び手に返す。
import type { BoatInput, BoatParams, BoatState, SpeedStep } from './boat-motion';
import { G_ENTERING, G_GONE, G_HAULING, G_HIDDEN, G_UNDERWAY, SW_FREE, SW_WAIT_INPUT, SW_WAIT_NEUTRAL } from './evac-data';
import { evacReleaseControl } from './evac-follow';
import { evacMarkSunk, evacPromote, evacSinkWingman } from './evac-shelter';
import { evacLeader, evacShelterAt, evacSurvivors, evacSyncEngine, type EvacBoat, type EvacSquadron } from './evac-squadron';
import { applyShellHit, stepDamage, type DamageState, type HitOutcome, type HitSpec } from './gunnery';
import type { SeededRng } from './rng';

/** 座席（世界は自艇・模擬は模擬の自艇。params は機関損傷の最高速・巡航を写す。旋回・加速は呼び手が毎ステップ乗員から書く） */
export interface EvacSeat {
  readonly state: BoatState;
  readonly damage: DamageState;
  readonly params: BoatParams;
  band: SpeedStep;
}

/** 座席へ入れた理由（hooks.onSeatLoaded の kind）: ［切替］・同じ隊の隊長艇の交代・全滅の後の自動の切替 */
export const EVAC_LOAD_SWITCH = 0;
export const EVAC_LOAD_PROMOTE = 1;
export const EVAC_LOAD_AUTO = 2;

/** 呼び手に返すこと（起動時に 1 つ作る。毎ステップ作らない） */
export interface EvacSeatHooks {
  /** 新しい隊長艇を座席へ入れた後: 世界は fireReason の初期化・消火の長押し 0・乗員の前回値（r2 L6）・一斉発射の待ちを捨てる（r2 L7） */
  onSeatLoaded(group: number, kind: number): void;
  /** 隊長艇が替わった（その隊を狙う編隊の中心を付け替える。r2 H2） */
  onLeaderChanged(group: number): void;
  /** 隊が全滅（その隊を狙う編隊を去らせる） */
  onGroupGone(group: number): void;
  /** 艇が沈んだ（絵・数え・HUD の出来事） */
  onBoatSunk(b: EvacBoat): void;
}

const noop = (): void => {};
/** 何もしない hooks（tests・模擬の表） */
export const EVAC_NO_HOOKS: EvacSeatHooks = { onSeatLoaded: noop, onLeaderChanged: noop, onGroupGone: noop, onBoatSunk: noop };

function copyState(to: BoatState, from: BoatState): void {
  to.x = from.x;
  to.y = from.y;
  to.headingDeg = from.headingDeg;
  to.speedMps = from.speedMps;
}

function copyDamage(to: DamageState, from: DamageState): void {
  to.hp = from.hp;
  to.engineDamaged = from.engineDamaged;
  to.fireLeftS = from.fireLeftS;
}

/** 入れる（切替・交代の時だけ）: 操作中の隊長艇の記録 → 座席（BoatState 4 値・DamageState 3 値・帯・機関の最高速と巡航） */
export function evacLoadSeat(sq: EvacSquadron, seat: EvacSeat): void {
  const b = evacLeader(sq.groups[sq.control]!);
  if (!b) return;
  copyState(seat.state, b.state);
  copyDamage(seat.damage, b.damage);
  seat.band = b.band;
  evacSyncEngine(sq, seat.params, b.damage.engineDamaged);
}

/** 出す（毎ステップ。stepPlayerBoat の直後）: 座席の位置 → 記録 */
export function evacStoreSeatPose(sq: EvacSquadron, seat: EvacSeat): void {
  const b = evacLeader(sq.groups[sq.control]!);
  if (b) copyState(b.state, seat.state);
}

/** 出す（毎ステップ。空襲の段の最後と、入れる・振り替えの直前）: 座席の被害と帯 → 記録（記録の最高速も機関に合わせる） */
export function evacStoreSeatDamage(sq: EvacSquadron, seat: EvacSeat): void {
  const b = evacLeader(sq.groups[sq.control]!);
  if (!b) return;
  copyDamage(b.damage, seat.damage);
  b.band = seat.band;
  evacSyncEngine(sq, b.params, b.damage.engineDamaged);
}

/** ［切替］の並びの段: 狙われている隊 0（段階によらない）・外の隊 1・上げている隊 2・隠れている隊 3・全滅 −1 */
function tierOf(sq: EvacSquadron, gi: number): number {
  const g = sq.groups[gi]!;
  if (g.phase === G_GONE || g.leader < 0) return -1;
  if (sq.targeted[gi]) return 0;
  if (g.phase === G_HAULING) return 2;
  if (g.phase === G_HIDDEN) return 3;
  return 1;
}

/** ［切替］の並びを sq.order に作る（段の順・同じ段は隊番号の順。1 つの隊は 1 回だけ。乱数なし）。長さを返す */
export function evacSwitchOrder(sq: EvacSquadron): number {
  let n = 0;
  for (let t = 0; t <= 3; t++) for (let gi = 0; gi < sq.groups.length; gi++) if (tierOf(sq, gi) === t) sq.order[n++] = gi;
  sq.orderLen = n;
  return n;
}

/** 押した時に移る隊: 並びの中で今の隊の次（末尾なら先頭。今の隊が並びに無ければ先頭）。移る先が無い・決着の後は −1（灰色の「切替」） */
export function evacNextSwitch(sq: EvacSquadron): number {
  if (sq.settled) return -1;
  const n = evacSwitchOrder(sq);
  if (n === 0) return -1;
  let i = -1;
  for (let k = 0; k < n; k++) if (sq.order[k] === sq.control) i = k;
  const next = sq.order[i < 0 ? 0 : (i + 1) % n]!;
  return next === sq.control ? -1 : next;
}

/** 操る隊を next に替える: 今の隊長艇の座席を記録へ出し、今の隊を AI へ返し、latch をスティックから置き直し、新しい隊長艇を座席へ入れる */
function takeControl(sq: EvacSquadron, seat: EvacSeat, next: number, hooks: EvacSeatHooks, kind: number): void {
  const old = sq.groups[sq.control]!;
  if (old.leader >= 0) {
    evacStoreSeatPose(sq, seat);
    evacStoreSeatDamage(sq, seat);
    evacReleaseControl(old);
  }
  sq.control = next;
  sq.latch = sq.stickOut ? SW_WAIT_NEUTRAL : SW_WAIT_INPUT;
  evacLoadSeat(sq, seat);
  hooks.onSeatLoaded(next, kind);
}

/** ［切替］（タップの瞬間）。移ったら true */
export function evacSwitch(sq: EvacSquadron, seat: EvacSeat, hooks: EvacSeatHooks): boolean {
  const next = evacNextSwitch(sq);
  if (next < 0) return false;
  sq.switches++;
  takeControl(sq, seat, next, hooks, EVAC_LOAD_SWITCH);
  return true;
}

/**
 * フレームの入力の消費（固定ステップの外・stepPlayerBoat の前。世界も記録した入力の再生も同じ）: スティックがデッドゾーンの外か（speed01 > 0）を覚え、
 * ［切替］が押されていれば切り替えて latch を置き直す（外なら SW_WAIT_NEUTRAL・内なら SW_WAIT_INPUT）。それ以外は latch を進める
 * （SW_WAIT_NEUTRAL はデッドゾーンに戻ったフレームに SW_WAIT_INPUT、SW_WAIT_INPUT は倒したフレームに SW_FREE）。切り替えたら true
 */
export function evacFrameInput(sq: EvacSquadron, seat: EvacSeat, input: BoatInput, switchTap: boolean, hooks: EvacSeatHooks): boolean {
  const out = input.speed01 > 0;
  sq.stickOut = out;
  if (switchTap && evacSwitch(sq, seat, hooks)) return true;
  if (sq.latch === SW_WAIT_NEUTRAL && !out) sq.latch = SW_WAIT_INPUT;
  else if (sq.latch === SW_WAIT_INPUT && out) sq.latch = SW_FREE;
  return false;
}

/** 座席への入力（固定ステップごと）: SW_FREE ならスティック。それまでは、引き継いだ隊が走っていれば AI の最後の指令（止めない）、ほかは中立（出ない・下ろさない） */
export function evacSeatCommand(sq: EvacSquadron, input: BoatInput, out: BoatInput): BoatInput {
  const g = sq.groups[sq.control]!;
  if (sq.latch === SW_FREE) {
    out.headingDeg = input.headingDeg;
    out.speed01 = input.speed01;
  } else if (g.phase === G_UNDERWAY) {
    out.headingDeg = g.aiHeadingDeg;
    out.speed01 = g.aiSpeed01;
  } else {
    out.headingDeg = NaN;
    out.speed01 = 0;
  }
  return out;
}

/**
 * 隊長艇の沈没（座席の divert・操作していない隊長艇の被弾と火災の全部がここ。r2 H5）: 座席なら座席の被害を記録へ → 旧隊長艇の記録を沈没 → 交代（core/evac-shelter の
 * evacPromote。隠れ場所の中の規則も）→ 編隊の付け替え（hooks）→ 座席なら新しい隊長艇を座席へ。全滅なら編隊を去らせ、座席なら並びの先頭の隊へ自動で切り替える。
 * 振り替えた（座席を沈めない・命中スローなし）なら true。座席で、決着の後か浮いている艇がほかに無いなら記録だけ沈めて false（今までどおり沈没で終わる）
 */
export function evacSinkLeader(sq: EvacSquadron, seat: EvacSeat, gi: number, nowS: number, hooks: EvacSeatHooks): boolean {
  const g = sq.groups[gi]!;
  const old = evacLeader(g);
  if (!old) return false;
  const isSeat = gi === sq.control;
  if (isSeat) {
    evacStoreSeatPose(sq, seat);
    evacStoreSeatDamage(sq, seat);
  }
  evacMarkSunk(old, nowS);
  hooks.onBoatSunk(old);
  if (isSeat && (sq.settled || evacSurvivors(sq) === 0)) return false;
  if (evacPromote(sq, g) >= 0) {
    sq.promotions++;
    hooks.onLeaderChanged(gi);
    if (isSeat) {
      evacLoadSeat(sq, seat);
      hooks.onSeatLoaded(gi, EVAC_LOAD_PROMOTE);
    }
    return true;
  }
  hooks.onGroupGone(gi);
  if (isSeat && evacSwitchOrder(sq) > 0) {
    sq.autoSwitches++;
    takeControl(sq, seat, sq.order[0]!, hooks, EVAC_LOAD_AUTO);
  }
  return true;
}

/**
 * 座席への被弾（模擬の自艇。世界の systems/boat-damage の applyHit と同じ式・同じ乱数: applyShellHit → 機関なら最高速 × 係数 → HP 0 なら evacSinkLeader）。
 * 座席が沈み始めた（振り替えなし）なら true。座席が沈み始めた後に呼ばない（世界の boat.sinking の守りは呼び手）
 */
export function evacHitSeat(sq: EvacSquadron, seat: EvacSeat, spec: HitSpec, rng: SeededRng, nowS: number, hooks: EvacSeatHooks, out: HitOutcome): boolean {
  const o = applyShellHit(seat.damage, spec, sq.cfg.damage, rng, out);
  if (o.engineHit) evacSyncEngine(sq, seat.params, true);
  return o.destroyed && !evacSinkLeader(sq, seat, sq.control, nowS, hooks);
}

/**
 * 座席でない艇への被弾: 隊長艇は記録に applyShellHit（火災・機関をその爆弾の編隊の rng から＝座席の hitBoat と同じ引き方）、僚艇は HP だけ（乱数なし）。
 * 沈めば交代（evacSinkLeader）か僚艇の沈没。座席の艇（操作中の隊長艇）には呼ばない（世界は hitBoat、模擬は evacHitSeat）。沈んだら true
 */
export function evacHitRecord(sq: EvacSquadron, seat: EvacSeat, b: EvacBoat, spec: HitSpec, rng: SeededRng, nowS: number, hooks: EvacSeatHooks, out: HitOutcome): boolean {
  if (b.sunk) return false;
  const g = sq.groups[b.group]!;
  if (b.slot === g.leader) {
    const o = applyShellHit(b.damage, spec, sq.cfg.damage, rng, out);
    if (o.engineHit) evacSyncEngine(sq, b.params, true);
    if (o.destroyed) evacSinkLeader(sq, seat, b.group, nowS, hooks);
    return o.destroyed;
  }
  b.damage.hp = Math.max(0, b.damage.hp - spec.damage);
  if (b.damage.hp > 0) return false;
  evacSinkWingman(sq, b, nowS);
  hooks.onBoatSunk(b);
  return true;
}

/** 操作していない隊長艇の火災（実秒。消火しない＝燃える隊へ切り替えて［消火］を押す理由）。沈めば evacSinkLeader。決着の後は傷を受けない */
export function evacStepFires(sq: EvacSquadron, seat: EvacSeat, realDt: number, nowS: number, hooks: EvacSeatHooks): void {
  if (sq.settled) return;
  for (let gi = 0; gi < sq.groups.length; gi++) {
    if (gi === sq.control) continue;
    const b = evacLeader(sq.groups[gi]!);
    if (b && b.damage.fireLeftS > 0 && stepDamage(b.damage, sq.cfg.damage, realDt)) evacSinkLeader(sq, seat, gi, nowS, hooks);
  }
}

/** 決着（240 秒）のラッチ: 残存の確定・切替なし・枠を数えない（S2 の空襲の段が dawnReached と同じ式で呼ぶ） */
export function evacSettle(sq: EvacSquadron): void {
  sq.settled = true;
}

/**
 * 座席の帰投（世界の atHome。spec §3.8）: 決着の前は操作中の隊が隠れていること（輪の判定は使わない＝H1）。決着のラッチのステップ（atLatch）は入っている・上げている途中も中（r2 L15）。
 * 決着の後はどの隠れ場所でも輪の中で hide_max 以下なら帰投（枠もレールも数えない）
 */
export function evacSeatHome(sq: EvacSquadron, seat: EvacSeat, atLatch: boolean): boolean {
  const ph = sq.groups[sq.control]!.phase;
  if (ph === G_HIDDEN) return true;
  if (atLatch && (ph === G_ENTERING || ph === G_HAULING)) return true;
  return sq.settled && seat.state.speedMps <= sq.p.hideMaxMps && evacShelterAt(sq, seat.state.x, seat.state.y) >= 0;
}
