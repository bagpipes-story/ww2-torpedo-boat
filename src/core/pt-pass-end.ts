// 米PT の航過の始まりと終わり（v0.6.3。docs/02 §6.4）: 固める・終える・数える（core/pt-boats から分けた。300 行を超えないため）。
// v0.6.3 実機 1 回目: 固めたときの PT の舷（挟み撃ちの待つ PT はその反対へ回る）、13mm で撃退された PT は航過を抜けてから去る、
// 航過中に沈んだ PT の航過を数えて外す（dropOwner。core/pt-damage）。Phaser 非依存・確保しない・乱数なし。
import type { PtParams } from './pt-data';
import { dodgeTurn, escapeHeadingDeg, targetSide } from './pt-pass';
import { PT_BREAK, PT_FATE_NONE, PT_LEAVE, PT_PASS, type PtBoatState, type PtCheck, type PtEvents, type PtSection } from './pt-state';

/** 航過を固める: 針路・速さ・弾数・かわす向き（このときの艇の針路から 1 回だけ。点滅しない）、この PT が艇のどちらの舷か（待つ PT は反対の舷へ回る） */
export function commitPass(q: PtSection, c: PtCheck, b: PtBoatState, i: number, lockDeg: number, passMps: number, rounds: number): void {
  b.phase = PT_PASS;
  b.lockDeg = lockDeg;
  b.passMps = passMps;
  b.timerS = 0;
  b.roundsLeft = rounds;
  b.firedThisPass = 0;
  q.owner = i;
  q.passHits = 0;
  q.commitAtS = c.timeS;
  q.ownerFlank = targetSide(c.boat.headingDeg, c.boat.x, c.boat.y, b.x, b.y);
  q.escapeDeg = escapeHeadingDeg(lockDeg, b.x, b.y, c.boat.x, c.boat.y);
  q.dodge = dodgeTurn(q.escapeDeg, c.boat.headingDeg);
}

/**
 * 航過の終わり: 数えて、次の航過まで pass_gap_s。max_passes に達したか 13mm で撃退された（結末あり）なら去る、まだなら離脱。回数に数えるのは撃ったか予告から open_fire_s 経った航過だけ
 * （撃つ前に艇首尾の円錐・射程の外へ抜けた航過は数えない＝その PT はもう一度来る）。HUD の結果の通し番号は弾がみな落ちてから（pt-boats の step の 5）
 */
export function endPass(q: PtSection, p: PtParams, b: PtBoatState, i: number, ev: PtEvents): void {
  const fired = b.firedThisPass > 0;
  countPass(q, b, i, fired || b.timerS >= p.openFireS);
  q.seqPending = true;
  q.owner = -1;
  q.gapLeftS = p.passGapS;
  b.phase = b.passes >= p.maxPasses || b.fate !== PT_FATE_NONE ? PT_LEAVE : PT_BREAK;
  b.timerS = 0;
  ev.onPassEnd(i, fired, q.passHits);
  if (b.phase === PT_LEAVE) ev.onLeave(i);
}

/**
 * 航過中の PT が航過の途中でいなくなる（13mm で沈んだ。v0.6.3 実機 1 回目）: endPass と同じ数え方で航過を閉じ、次の航過まで pass_gap_s。
 * onPassEnd は呼ばない（AI が終えた航過ではない。HUD は撃沈の出来事を出す）。その PT の飛んでいる弾は落ちてから最後の航過に数える（今と同じ）。航過中でなければ何もしない
 */
export function dropOwner(q: PtSection, p: PtParams, b: PtBoatState, i: number): void {
  if (q.owner !== i) return;
  countPass(q, b, i, b.firedThisPass > 0 || b.timerS >= p.openFireS);
  q.seqPending = true;
  q.owner = -1;
  q.gapLeftS = p.passGapS;
}

/** 航過を数える（counts が false なら回数には入れない）: 撃った航過・無傷の航過、最後の航過の命中と撃ったか・その PT（後から落ちた弾の数え先） */
export function countPass(q: PtSection, b: PtBoatState, i: number, counts: boolean): void {
  const fired = b.firedThisPass > 0;
  if (counts) {
    b.passes++;
    q.passes++;
  }
  if (fired) q.firedPasses++;
  if (fired && q.passHits === 0) q.cleanPasses++;
  q.lastPassHits = q.passHits;
  q.lastPassFired = fired;
  q.lastPassBoat = i;
}
