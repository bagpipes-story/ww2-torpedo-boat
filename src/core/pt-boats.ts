// 敵の米PT の隊の段階と運動（v0.6.3。docs/02 §6.4、spec §C.5〜C.6）: 哨戒 → 発見（隊で 1 つ）→ 警戒（反応の遅れ。2 隻目は遅れを足す）→ 突撃 →
// 航過（進路を固めて赤い線で予告、open_fire_s 後から掃射）→ 離脱 → 再攻撃、1 隻 max_passes 回か夜明けで去る。航過は同時に 1 隻・次まで pass_gap_s。
// 航過を固めるのは本当に向かってくるときだけ（v0.6.3 の直し: 針路の差が commit_heading_tol_deg 以内・艇が固める線の前・航過の速さで最接近まで commit_tcpa_s・その距離が有効射程の内）。
// 待つ PT（他が航過中か次の航過まで）は hold_off_m の内へ寄らない（2 番手が艇に重ならない）。待つ間は突撃の秒に数えない。
// 見えていない間は最後に見た位置と速度から推す（全知にしない）。航過の針路は固めたまま直さない（転舵でかわせる）。
// v0.6.3 レビューの直し: 航過は海域の縁（絵の半長）まで走る・撃つか open_fire_s 経った航過だけ回数に数える（縁へ逃げても PT は撃たずに去らない）、
// みな去れば捉えるのをやめる（見失わせたに数えない）、待つ PT は海域の外へ回らない、突撃の打ち切りの離脱は艇から離れる向き、夜明けで切れた撃った航過も数える。
// Phaser 非依存・毎ステップ確保しない。時計は体感秒 feelDt、運動と弾の飛行は game 秒 dt。数値は core/pt-data の PtParams。
// 乱数は seed+18 の系列だけ（1 発 2 回。命中の火災・機関は呼ぶ側が同じ系列で引く）。AI は引かない。
// v0.6.3 実機 1 回目: 待つ PT は前の航過と反対の舷の位置（艇の針路から 90°・45°・135° を航過ごとに順に、station_m）を取り、待ちが解けたらその舷から寄る（挟み撃ち）。
// 艇の 13mm の閃光（c.flashM）でも見つける。13mm で沈んだ PT（PT_SUNK）は動かない。撃退・撃沈は core/pt-damage（乱数は呼ぶ側の seed+20）。
// v0.6.3 実機 2 回目（「逃げるだけなら簡単。もっと執拗に追いかけ回して射撃して」）: 逃げる艇の艇尾側の突撃の PT（待つ PT は反対の舷）と、逃げる艇への航過を終えた PT は
// 追撃（PT_CHASE。core/pt-chase）へ: 艇の後ろ寄りの舷へ回って並び、撃つ権利が空けば予告つきの連射（PT_PASS の burst）。連射の後も離れない。遅い艇・艇首の前へ出たら突撃へ戻る。
// 定数・型・確保・脅威の PT・数えは pt-state.ts、航過の幾何は pt-pass.ts、航過の固め・終わりは pt-pass-end.ts、航過と連射の射撃と終わりの判定は pt-fire.ts、追撃は pt-chase.ts
// （使う側はここだけを import する。pt-state を出し直している）。
import { beyondBounds } from './dawn-withdraw';
import { CHASE_OUT, chaseEntryOk, chaseHeading, chaseKeep, commitBurst, countBurst, createChaseTarget, partnerReady, setChaseTarget, startChase, targetCourse } from './pt-chase';
import type { PtParams } from './pt-data';
import { smokeBlocked, stepPass } from './pt-fire';
import { aimPoint, nearEdge, passCommitOk, stationHeading, targetSide } from './pt-pass';
import { commitPass } from './pt-pass-end';
import { countPass, PT_ALERT, PT_BREAK, PT_CHASE, PT_LEAVE, PT_OUT, PT_PASS, PT_PATROL, PT_RUN_IN, ptFighting, type PtBoatState, type PtCheck, type PtEvents, type PtSection } from './pt-state';
import type { SeededRng } from './rng';
import { advanceShell, pointNearBoat } from './shells';
import { bearingDeg, edgeTurnHeadingDeg, steerShip } from './ship-ai';
import { degToRad } from './units';

export * from './pt-state';
export type { PtParams } from './pt-data';

/** 待つ PT の位置取りの速さの書き先（stationHeading の out。module に 1 個、毎ステップ確保しない） */
const STATION = { sp: 0 };
/** 追撃の目標（setChaseTarget が 1 ステップに 1 回書く。module に 1 個） */
const TARGET = createChaseTarget();

/**
 * 固定ステップ（spec §C.5 の順）: 接触（隊で 1 つ）→ 目標の推定 → 夜明け → 航過の間隔 → PT ごとの段階・操舵（1 回）・航過 → 弾の飛行と着弾。
 * 着弾の命中で艇が沈み始めたら、呼ぶ側が onImpact の中で c.targetValid を false にする（同じステップの残りの弾は外れ）
 */
export function stepPtSection(q: PtSection, p: PtParams, c: PtCheck, rng: SeededRng, feelDt: number, dt: number, ev: PtEvents): void {
  const boat = c.boat;
  const boats = q.boats;
  const ph = degToRad(boat.headingDeg);
  const vpx = Math.sin(ph) * boat.speedMps;
  const vpy = -Math.cos(ph) * boat.speedMps;
  const eff2 = p.gun.effectiveM * p.gun.effectiveM;
  // 1. 接触: どれか 1 隻が見れば隊が捉える（最後に見た位置と速度を残す）。艇の 13mm を撃ったステップは閃光の距離（c.flashM）でも見つける（煙幕は無関係）
  let anySeen = false;
  let anyLive = false;
  let anyNormal = false;
  let near2 = Infinity;
  const fl = c.flashM ?? 0;
  const fl2 = fl * fl;
  for (let i = 0; i < boats.length; i++) {
    const b = boats[i]!;
    if (ptFighting(b.phase)) anyLive = true;
    const live = ptFighting(b.phase) && c.targetValid;
    const d2 = (boat.x - b.x) * (boat.x - b.x) + (boat.y - b.y) * (boat.y - b.y);
    const r = live && smokeBlocked(c, b) ? c.detectOpenM * c.smokeFactor : c.detectOpenM;
    const normal = live && c.timeS >= p.detectFromS && d2 <= r * r;
    if (normal) anyNormal = true;
    q.seen[i] = normal || (live && c.timeS >= p.detectFromS && d2 <= fl2) ? 1 : 0;
    if (q.seen[i] === 1) anySeen = true;
    if (live && d2 < near2) near2 = d2;
  }
  if (near2 < q.closest2) q.closest2 = near2;
  if (anySeen) {
    const gained = !q.detected;
    if (Number.isNaN(q.firstDetectM)) {
      q.firstDetectM = Math.sqrt(near2);
      q.flashFirst = !anyNormal; // 最初に見つかったのが閃光だけ（Result の「閃光」）
    }
    q.detected = true;
    q.holdLeftS = p.detectHoldS;
    q.lkX = boat.x;
    q.lkY = boat.y;
    q.lkVx = vpx;
    q.lkVy = vpy;
    q.lkHeadingDeg = boat.headingDeg;
    q.lkAgeS = 0;
    if (gained) ev.onContact(true);
  } else if (q.detected && !anyLive) {
    // みな去る（max_passes か夜明け）: 見る PT がいないので捉えるのをやめる（見失わせたには数えない。3 行目の「発見された！」も消える）
    q.detected = false;
    ev.onContact(false);
  } else if (q.detected) {
    q.holdLeftS -= feelDt;
    q.lkAgeS += feelDt;
    if (q.holdLeftS <= 0) {
      q.detected = false;
      if (c.targetValid) q.lostContacts++; // 沈み始め・輪の中で切れたのは見失わせたではない
      ev.onContact(false);
    }
  }
  // 2. 目標: 見えていれば今の位置（lkAgeS 0）、見えていなければ最後に見た位置から推す（体感秒 × time_scale で game 秒）
  const tx = q.lkX + q.lkVx * q.lkAgeS * p.timeScale;
  const ty = q.lkY + q.lkVy * q.lkAgeS * p.timeScale;
  setChaseTarget(TARGET, q, tx, ty);
  // 3. 夜明け: 去っていない PT はこのステップで去る。乱数は引かない。航過中なら、撃った航過は数え（その命中は被弾に入っている。連射は連射として）、撃つ前の航過は数えない
  // （その後に落ちる弾は前の航過にも数えない）。どちらも HUD の結果は出さない（通し番号は変えない）
  for (let i = 0; c.dawn && i < boats.length; i++) {
    const b = boats[i]!;
    if (b.phase >= PT_LEAVE) continue;
    b.phase = PT_LEAVE;
    if (q.owner === i) {
      q.owner = -1;
      if (b.firedThisPass > 0 && b.burst) countBurst(q, b, i);
      else if (b.firedThisPass > 0) countPass(q, b, i, true);
      else if (q.lastPassBoat === i) q.lastPassBoat = -1;
    }
    b.burst = false;
    q.leftAtDawn = true;
    ev.onLeave(i);
  }
  q.gapLeftS -= feelDt;
  q.selfGapLeftS -= feelDt;
  // 4. PT ごと: 段階 → 操舵 → 航過・連射の射撃と終わり・去った判定
  for (let i = 0; i < boats.length; i++) {
    const b = boats[i]!;
    if (b.phase >= PT_OUT) continue; // 海域の外・沈んだ（PT_SUNK）は動かない
    if (!q.detected && (b.phase === PT_ALERT || b.phase === PT_RUN_IN || b.phase === PT_CHASE)) b.phase = PT_PATROL; // 見失った
    const dx = boat.x - b.x;
    const dy = boat.y - b.y;
    let hd = b.lockDeg; // 航過・離脱は固めた針路のまま
    let sp = p.runInMps;
    if (b.phase === PT_PATROL) {
      hd = patrolHeading(b, p, i);
      sp = p.patrolMps;
      if (q.detected) {
        b.phase = PT_ALERT;
        b.timerS = p.reactionDelayS + i * p.wingmanDelayS;
      }
    } else if (b.phase === PT_ALERT) {
      hd = bearingDeg(b.x, b.y, tx, ty); // 艇首を向ける（円錐の中なので撃たない・向きを変えるのが見える）
      sp = p.patrolMps;
      b.timerS -= feelDt;
      if (b.timerS <= 0) startRunIn(b, tx, ty);
    } else if (b.phase === PT_RUN_IN) {
      const held = q.owner >= 0 || q.gapLeftS > 0; // 他の PT が航過中か次の航過まで: 待つ（待つ間は突撃の秒に数えない。打ち切りは追いつけないときだけ）
      if (!held) b.timerS += feelDt;
      if (b.timerS >= p.runInMaxS) {
        b.phase = PT_BREAK; // 追いつけない突撃の打ち切り（航過には数えない）。離脱は目標から離れる向き（追う針路のままだと「離脱」と出たまま寄り続けた）
        b.lockDeg = bearingDeg(tx, ty, b.x, b.y);
        b.timerS = 0;
        hd = b.lockDeg;
      } else if (held && q.owner >= 0 && chaseEntryOk(p, b.x, b.y, TARGET)) {
        // 他の PT が撃っている間に逃げる艇の艇尾側にいる: 撃っている PT と反対の舷で追撃に入って待つ（v0.6.3 実機 2 回目）
        q.held[i] = 0;
        startChase(b, -q.ownerFlank);
        hd = chaseHeading(p, b, TARGET, b.side, p.chaseHeldM, p.chaseHeldRelDeg);
        sp = CHASE_OUT.sp;
      } else if (held) {
        // 2 番手は前の航過と反対の舷の位置を取る（挟み撃ち。v0.6.3 実機 1 回目）: 艇の針路から航過ごとに 90°・45°・135°、station_m の点へ。遠回りの内では hold_off_m の内へ入らない。
        // 止まった艇は最後に見た艇首の向きから（レビュー R3: PT の方位を基準にすると点がいつも PT の先へ逃げ、反対の舷へ回らずに艇の周りを回り続けた）
        q.held[i] = 1;
        hd = stationHeading(b.x, b.y, tx, ty, q.lkVx, q.lkVy, q.lkHeadingDeg, q.ownerFlank, p.stationRelDeg[q.passes % p.stationRelDeg.length]!, p, STATION);
        sp = STATION.sp;
        if (nearEdge(b.x, b.y, p.bounds, p.edgeMarginM)) hd = edgeTurnHeadingDeg(b, p.bounds, p.edgeMarginM); // 縁の近くでは内へ（艇が縁にいても海域の外を回らない）
      } else if (chaseEntryOk(p, b.x, b.y, TARGET)) {
        // 逃げる艇の艇尾側: 横切る航過ではなく、今の舷で追撃へ（v0.6.3 実機 2 回目）
        q.held[i] = 0;
        startChase(b, targetSide(targetCourse(TARGET), tx, ty, b.x, b.y));
        hd = chaseHeading(p, b, TARGET, b.side, p.chaseStationM, p.chaseRelDeg);
        sp = CHASE_OUT.sp;
      } else {
        // 突撃の狙いの点（待つ PT は使わないので求めない。レビュー NP-4）
        aimPoint(q.aim, b.x, b.y, p.runInMps, tx, ty, q.lkVx, q.lkVy, b.side, p.offsetM, p.bounds.width, p.bounds.height, p.edgeMarginM);
        hd = bearingDeg(b.x, b.y, q.aim.x, q.aim.y); // 固めるならこの針路
        if (q.held[i] === 1) {
          q.held[i] = 0;
          b.side = targetSide(b.headingDeg, b.x, b.y, tx, ty); // 待ちが解けた: 取った位置から自分の舷で寄る（固めるのは次のステップから）
        } else if (q.seen[i] === 1 && dx * dx + dy * dy <= p.commitMax2 && !nearEdge(b.x, b.y, p.bounds, p.edgeMarginM)) {
          // 航過を固める: この PT が今見ていて・900 m 以内・縁の外で、本当に向かってくる（針路の差・艇が線の前・航過の速さで最接近まで 5 秒・その距離が射程の内）
          const passMps = passSpeedMps(p, boat.speedMps);
          if (passCommitOk(b.headingDeg, hd, passMps, dx, dy, vpx, vpy, p.commitHeadingTolDeg, p.commitTcpaS, eff2, p.timeScale)) {
            commitPass(q, c, b, i, hd, passMps, p.roundsPerPass);
            sp = passMps;
            ev.onCommit(i, hd, q.dodge);
          }
        }
      }
    } else if (b.phase === PT_PASS) {
      b.timerS += feelDt;
      sp = b.passMps;
      if (b.burst) {
        // 連射は並んだまま撃つ（予告の赤い線は PT → 艇。毎ステップ向きを直す）
        hd = chaseHeading(p, b, TARGET, b.side, p.chaseStationM, p.chaseRelDeg);
        sp = CHASE_OUT.sp;
        b.lockDeg = bearingDeg(b.x, b.y, boat.x, boat.y);
      }
    } else if (b.phase === PT_CHASE) {
      const held = q.owner >= 0 || q.gapLeftS > 0; // 他の PT が撃っているか次の攻撃まで: 反対の舷の後ろで待つ
      if (b.bursts >= p.maxBursts) {
        b.phase = PT_LEAVE; // 連射を使い切った（制圧の分も）
        ev.onLeave(i);
        hd = p.leaveHeadingDeg;
        sp = p.leaveMps;
      } else if (!chaseKeep(p, b, TARGET, feelDt)) {
        startRunIn(b, tx, ty); // 遅い艇・艇首の前へ出た: 突撃（航過）へ戻る
        hd = bearingDeg(b.x, b.y, tx, ty);
      } else {
        if (q.owner >= 0) b.side = -q.ownerFlank;
        hd = chaseHeading(p, b, TARGET, b.side, held ? p.chaseHeldM : p.chaseStationM, held ? p.chaseHeldRelDeg : p.chaseRelDeg);
        sp = CHASE_OUT.sp;
        const d2 = dx * dx + dy * dy;
        if (held && d2 < p.chaseHeldGuard2) {
          hd = bearingDeg(tx, ty, b.x, b.y); // 待つ PT が近すぎる: 艇から真っすぐ離れる（自分から held_guard_m の内へ寄らない）
          sp = p.chaseMps;
        }
        // 連射を固める: 見ていて・commit_m の内・縁の外で、最後に撃った PT は相方が撃てる距離にいれば gap_s + self_gap_s 待つ（交互）
        const self = i === q.lastBurstBoat && q.selfGapLeftS > 0 && partnerReady(q, p, i, boat.x, boat.y);
        if (!held && !self && q.seen[i] === 1 && d2 <= p.chaseCommit2 && !nearEdge(b.x, b.y, p.bounds, p.edgeMarginM)) commitBurst(q, c, p, b, i, sp, ev);
      }
    } else if (b.phase === PT_BREAK) {
      b.timerS += feelDt; // そのまま離れて暗さに入る
      if (dx * dx + dy * dy >= p.breakOff2 || b.timerS >= p.breakMaxS || nearEdge(b.x, b.y, p.bounds, p.edgeMarginM)) {
        if (q.detected) startRunIn(b, tx, ty);
        else b.phase = PT_PATROL;
      }
    } else {
      hd = p.leaveHeadingDeg;
      sp = p.leaveMps;
    }
    steerShip(b, hd, sp, p.turnRateDegS, p.accelMps2, dt);
    if (b.phase === PT_LEAVE && beyondBounds(b.x, b.y, p.bounds, p.boundsMarginM)) {
      b.phase = PT_OUT;
      q.out++;
      ev.onOut(i);
    } else if (b.phase === PT_PASS && b.timerS > 0) stepPass(q, p, c, b, i, vpx, vpy, rng, feelDt, ev); // 固めたステップ（timerS 0）は撃たない（連射も）
  }
  // 5. 弾: 航過の命中はその航過に、終わった後に落ちた弾は撃った PT の最後の航過に数える。その PT の弾がみな落ちたら航過の通し番号を増やす（HUD の結果は確定してから）
  let lastInFlight = false;
  for (let k = 0; k < q.shells.length; k++) {
    const s = q.shells[k]!;
    if (!s.active) continue;
    if (!advanceShell(s, dt)) {
      if (s.gunIndex === q.lastPassBoat) lastInFlight = true;
      continue;
    }
    const hit = c.targetValid && pointNearBoat(s.impactX, s.impactY, boat, c.boatHalfLengthM, c.boatHalfBeamM + p.gun.splashRadiusM);
    if (hit) {
      q.hits++;
      if (s.gunIndex === q.owner) q.passHits++;
      else if (s.gunIndex === q.lastPassBoat && q.lastPassHits++ === 0 && q.lastPassFired) q.cleanPasses--;
    }
    ev.onImpact(s.impactX, s.impactY, hit);
  }
  if (q.seqPending && !lastInFlight) {
    q.seqPending = false;
    q.passSeq++;
  }
}

/** 航過の速さ: 艇の速さ + 追い越し（下限 pass_speed_kt・上限は艇の最大） */
function passSpeedMps(p: PtParams, playerMps: number): number {
  return Math.min(p.dashMps, Math.max(p.passMinMps, playerMps + p.overtakeMps));
}

/** 突撃へ: 目標が PT の右か左かで航過する側を決める */
function startRunIn(b: PtBoatState, tx: number, ty: number): void {
  b.phase = PT_RUN_IN;
  b.side = targetSide(b.headingDeg, b.x, b.y, tx, ty);
  b.timerS = 0;
}

/** 哨戒: 線の端へ（着いたら逆の端へ） */
function patrolHeading(b: PtBoatState, p: PtParams, i: number): number {
  let k = 4 * i + 2 * b.wp;
  const ax = p.legs[k]! - b.x;
  const ay = p.legs[k + 1]! - b.y;
  if (ax * ax + ay * ay <= p.arrive2) {
    b.wp = 1 - b.wp;
    k = 4 * i + 2 * b.wp;
  }
  return bearingDeg(b.x, b.y, p.legs[k]!, p.legs[k + 1]!);
}
