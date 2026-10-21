// 米PT の追撃（v0.6.3 実機 2 回目。docs/02 §6.4、spec r2 §D.2、enemies.json の us_pt_enemy.chase）: 逃げる艇（chase.min_target_kt 以上）の艇尾側にいる PT は横切る航過ではなく、
// 艇の後ろ寄りの舷（艇の針路から side × station_rel_deg・station_m）へ speed_kt で回り込んで並び、撃つ権利（q.owner。航過と同じ 1 つ）が空けば「連射」を固めて PT から艇への
// 赤い線で予告し、open_fire_s 後から burst_rounds 発まで撃つ（撃つ規則は航過と同じ core/pt-fire。連射だけ艇首の円錐へも遅く撃つ）。待つ追撃の PT は撃っている PT と反対の舷の
// held_rel_deg・held_station_m（有効射程の外）で待ち、held_guard_m より内へは自分から寄らない。同じ PT が続けて撃つのは相方が撃てる距離にいないときだけ（gap_s + self_gap_s）。
// 連射の後も離脱しない（制圧された PT だけ離れる。core/pt-damage）。Phaser 非依存・確保しない（目標は使い回しの ChaseTarget、速さは module の CHASE_OUT）・乱数なし。距離は二乗で比べる。
import type { PtParams } from './pt-data';
import { dodgeTurn, nearEdge, PT_STATION_COURSE_MIN_MPS, targetSide } from './pt-pass';
import { countPass, PT_BREAK, PT_CHASE, PT_FATE_NONE, PT_LEAVE, PT_PASS, ptFighting, type PtBoatState, type PtCheck, type PtEvents, type PtSection } from './pt-state';
import { bearingDeg } from './ship-ai';
import { clamp, degToRad, radToDeg } from './units';

/** 追撃の針路の先読み m: 点そのものではなく、目標の針路の先へこれだけずらした点へ向く（並ぶときに蛇行しない）。幾何の定数で、強さの調整値ではない */
export const PT_CHASE_LOOKAHEAD_M = 150;

/** 追撃の速さの書き先（chaseHeading の out。module に 1 個、毎ステップ確保しない） */
export const CHASE_OUT = { sp: 0 };

/**
 * 隊が推した目標（stepPtSection が 1 ステップに 1 回書く）: 位置・最後に見た速度（game m/s）とその二乗・最後に見た艇首 deg。速さ・針路 deg（ほぼ止まっていれば艇首）・その単位ベクトルは
 * そのステップで初めて使うときに 1 回だけ求める（targetCourse が ready を立てる。追撃の PT がいなければ平方根も三角関数も無し）
 */
export interface ChaseTarget {
  x: number; y: number; vx: number; vy: number; v2: number; headingDeg: number; ready: boolean; v: number; courseDeg: number; ux: number; uy: number;
}

export function createChaseTarget(): ChaseTarget {
  return { x: 0, y: 0, vx: 0, vy: 0, v2: 0, headingDeg: 0, ready: false, v: 0, courseDeg: 0, ux: 0, uy: -1 };
}

/** 目標を書く（掛け算だけ）。(tx, ty) は推した位置、速度は最後に見た速度 */
export function setChaseTarget(t: ChaseTarget, q: PtSection, tx: number, ty: number): void {
  t.x = tx;
  t.y = ty;
  t.vx = q.lkVx;
  t.vy = q.lkVy;
  t.v2 = q.lkVx * q.lkVx + q.lkVy * q.lkVy;
  t.headingDeg = q.lkHeadingDeg;
  t.ready = false;
}

/** 目標の速さと針路（平方根・atan2・sin/cos はステップに 1 回だけ。PT ごとではない）。針路 deg を返す */
export function targetCourse(t: ChaseTarget): number {
  if (t.ready) return t.courseDeg;
  t.ready = true;
  t.v = Math.sqrt(t.v2);
  t.courseDeg = t.v2 > PT_STATION_COURSE_MIN_MPS * PT_STATION_COURSE_MIN_MPS ? radToDeg(Math.atan2(t.vx, -t.vy)) : t.headingDeg;
  const r = degToRad(t.courseDeg);
  t.ux = Math.sin(r);
  t.uy = -Math.cos(r);
  return t.courseDeg;
}

/** 追撃に入ってよいか（突撃から）: 目標が速い（min_target_kt 以上）・PT が目標の艇尾から start_aft_deg 以内・commit_max_m の内。模擬の上書き CH_OFF では入らない。平方根なし */
export function chaseEntryOk(p: PtParams, bx: number, by: number, t: ChaseTarget): boolean {
  if (!p.chaseOn || t.v2 < p.chaseMinMps * p.chaseMinMps) return false;
  const ex = bx - t.x;
  const ey = by - t.y;
  const e2 = ex * ex + ey * ey;
  if (e2 > p.commitMax2) return false;
  const dot = ex * t.vx + ey * t.vy;
  return dot < 0 && dot * dot >= p.chaseCosAft2 * e2 * t.v2;
}

/** 追撃に入る（side は目標の針路に対する舷: +1 右・−1 左）。制圧の数えと遅い目標の秒を始めから */
export function startChase(b: PtBoatState, side: number): void {
  b.phase = PT_CHASE;
  b.side = side;
  b.slowS = 0;
  b.timerS = 0;
  b.suppressed = false;
  b.chaseHits = 0;
}

/** 航過の終わり（core/pt-pass-end の endPass。離脱になるところ）: 逃げる艇（最後に見た速さが min_target_kt 以上）なら離脱せずに今の舷で追撃へ。入ったら true */
export function chaseAfterPass(p: PtParams, q: PtSection, b: PtBoatState): boolean {
  if (!p.chaseOn || q.lkVx * q.lkVx + q.lkVy * q.lkVy < p.chaseMinMps * p.chaseMinMps) return false;
  startChase(b, targetSide(radToDeg(Math.atan2(q.lkVx, -q.lkVy)), q.lkX, q.lkY, b.x, b.y));
  return true;
}

/**
 * 追撃の針路（速さは CHASE_OUT.sp）: 目標の針路から side × relDeg の方角 distM の点（station_lead_s 先へ・海域の縁の余白の内）を、目標の針路の先 PT_CHASE_LOOKAHEAD_M へずらして目指す。
 * 速さは点との前後の差 along で: clamp(tv + k × clamp(along / station_close_m, −1, 1), 0, speed_kt)。点が前（PT が後ろ）なら k = speed_kt − tv、後ろなら k = overtake_kt
 */
export function chaseHeading(p: PtParams, b: PtBoatState, t: ChaseTarget, side: number, distM: number, relDeg: number): number {
  const th = degToRad(targetCourse(t) + side * relDeg);
  const lead = p.stationLeadS * p.timeScale;
  const m = p.edgeMarginM;
  const sx = clamp(t.x + Math.sin(th) * distM + t.vx * lead, m, p.bounds.width - m);
  const sy = clamp(t.y - Math.cos(th) * distM + t.vy * lead, m, p.bounds.height - m);
  const along = (sx - b.x) * t.ux + (sy - b.y) * t.uy;
  CHASE_OUT.sp = clamp(t.v + (along >= 0 ? p.chaseMps - t.v : p.overtakeMps) * clamp(along / p.stationCloseM, -1, 1), 0, p.chaseMps);
  return bearingDeg(b.x, b.y, sx + t.ux * PT_CHASE_LOOKAHEAD_M, sy + t.uy * PT_CHASE_LOOKAHEAD_M);
}

/** 追撃を続けるか（false なら突撃へ戻す＝止まった・遅い艇には航過）: 目標が遅い（min_target_kt 未満）のが slow_exit_s 続いた・PT が目標の艇首から exit_fwd_deg 以内へ出た */
export function chaseKeep(p: PtParams, b: PtBoatState, t: ChaseTarget, feelDt: number): boolean {
  b.slowS = t.v2 < p.chaseMinMps * p.chaseMinMps ? b.slowS + feelDt : 0;
  if (b.slowS >= p.chaseSlowExitS) return false;
  const ex = b.x - t.x;
  const ey = b.y - t.y;
  const dot = ex * t.vx + ey * t.vy;
  return !(dot > 0 && t.v2 > PT_STATION_COURSE_MIN_MPS * PT_STATION_COURSE_MIN_MPS && dot * dot >= p.chaseCosExit2 * (ex * ex + ey * ey) * t.v2);
}

/** 相方が撃てる距離にいる（交互の規則）: i 以外のまだ戦う・結末なしの PT が、追撃中なら commit_m の内、ほかの段階なら commit_max_m の内（艇 (x, y) から）。確保なし */
export function partnerReady(q: PtSection, p: PtParams, i: number, x: number, y: number): boolean {
  for (let k = 0; k < q.boats.length; k++) {
    const o = q.boats[k]!;
    if (k === i || !ptFighting(o.phase) || o.fate !== PT_FATE_NONE) continue;
    if ((o.x - x) * (o.x - x) + (o.y - y) * (o.y - y) <= (o.phase === PT_CHASE ? p.chaseCommit2 : p.commitMax2)) return true;
  }
  return false;
}

/** 連射を固める（航過と同じ q.owner。赤い線は PT → 艇で lockDeg はその方位＝pt-boats が毎ステップ直す）: 弾は burst_rounds、艇首の円錐の秒を 0 から。逃げる針路は PT から離れる向き。onCommit を呼ぶ */
export function commitBurst(q: PtSection, c: PtCheck, p: PtParams, b: PtBoatState, i: number, sp: number, ev: PtEvents): void {
  b.phase = PT_PASS;
  b.burst = true;
  b.lockDeg = bearingDeg(b.x, b.y, c.boat.x, c.boat.y);
  b.passMps = sp;
  b.timerS = 0;
  b.roundsLeft = p.burstRounds;
  b.coneS = 0;
  b.firedThisPass = 0;
  q.owner = i;
  q.passHits = 0;
  q.commitAtS = c.timeS;
  q.ownerFlank = targetSide(c.boat.headingDeg, c.boat.x, c.boat.y, b.x, b.y);
  q.escapeDeg = b.lockDeg;
  q.dodge = dodgeTurn(q.escapeDeg, c.boat.headingDeg);
  ev.onCommit(i, b.lockDeg, q.dodge);
}

/** 連射の終わり（core/pt-fire。d2 は艇までの距離の二乗。open_fire_s の後だけ見る）: 窓の終わり・撃ち切った（黙った連射は窓まで線を残す）・艇首の円錐に cone_quit_s・break_off_m より遠い・縁 */
export function burstEnded(p: PtParams, b: PtBoatState, d2: number): boolean {
  if (b.timerS < p.openFireS) return false;
  const silenced = b.suppressed || b.fate !== PT_FATE_NONE;
  return b.timerS >= p.openFireS + p.burstMaxS || (b.roundsLeft <= 0 && !silenced) || b.coneS >= p.burstConeQuitS || d2 > p.breakOff2 || nearEdge(b.x, b.y, p.bounds, p.boundsMarginM);
}

/** 連射を数える（航過の回数には入れない）: 撃った連射だけ PT と隊の連射に数え、命中は連射の命中へ（終わり・夜明け・沈んだ） */
export function countBurst(q: PtSection, b: PtBoatState, i: number): void {
  countPass(q, b, i, false);
  const fired = b.firedThisPass > 0 ? 1 : 0;
  b.bursts += fired;
  q.bursts += fired;
  q.firedBursts += fired;
  q.burstHits += q.passHits;
}

/** 連射を終える: 数えて次まで gap_s（同じ PT は + self_gap_s）。max_bursts か撃退で去る、制圧なら艇 (bx, by) から離れる向きへ離脱、ほかは追撃のまま。HUD の結果は弾がみな落ちてから */
export function endBurst(q: PtSection, p: PtParams, b: PtBoatState, i: number, bx: number, by: number, ev: PtEvents): void {
  const fired = b.firedThisPass > 0;
  countBurst(q, b, i);
  q.seqPending = true;
  q.owner = -1;
  q.gapLeftS = p.chaseGapS;
  q.lastBurstBoat = i;
  q.selfGapLeftS = p.chaseGapS + p.chaseSelfGapS;
  b.phase = b.bursts >= p.maxBursts || b.fate !== PT_FATE_NONE ? PT_LEAVE : b.suppressed ? PT_BREAK : PT_CHASE;
  if (b.phase === PT_BREAK) b.lockDeg = bearingDeg(bx, by, b.x, b.y);
  b.timerS = 0;
  ev.onPassEnd(i, fired, q.passHits);
  b.burst = false;
  if (b.phase === PT_LEAVE) ev.onLeave(i);
}
