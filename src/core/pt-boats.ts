// 敵の米PT の隊の段階と運動（v0.6.3。docs/02 §6.4、spec §C.5〜C.6）: 哨戒 → 発見（隊で 1 つ）→ 警戒（反応の遅れ。2 隻目は遅れを足す）→ 突撃 →
// 航過（進路を固めて赤い線で予告、open_fire_s 後から掃射）→ 離脱 → 再攻撃、1 隻 max_passes 回か夜明けで去る。航過は同時に 1 隻・次まで pass_gap_s。
// 航過を固めるのは本当に向かってくるときだけ（v0.6.3 の直し: 針路の差が commit_heading_tol_deg 以内・艇が固める線の前・航過の速さで最接近まで commit_tcpa_s・その距離が有効射程の内）。
// 待つ PT（他が航過中か次の航過まで）は hold_off_m の内へ寄らない（2 番手が艇に重ならない）。待つ間は突撃の秒に数えない。
// 見えていない間は最後に見た位置と速度から推す（全知にしない）。航過の針路は固めたまま直さない（転舵でかわせる）。
// Phaser 非依存・毎ステップ確保しない。時計は体感秒 feelDt、運動と弾の飛行は game 秒 dt。数値は core/pt-data の PtParams。
// 乱数は seed+18 の系列だけ（1 発 2 回。命中の火災・機関は呼ぶ側が同じ系列で引く）。AI は引かない。
// 定数・型・確保・脅威の PT は pt-state.ts、航過の幾何は pt-pass.ts（使う側はここだけを import する。pt-state を出し直している）。
import type { BoatState } from './boat-motion';
import { beyondBounds } from './dawn-withdraw';
import type { PtParams } from './pt-data';
import { aimPoint, dodgeTurn, holdOffHeading, inDeadCone, nearEdge, passCommitOk, targetSide } from './pt-pass';
import { PT_ALERT, PT_BREAK, PT_LEAVE, PT_OUT, PT_PASS, PT_PATROL, PT_RUN_IN, type PtBoatState, type PtCheck, type PtEvents, type PtSection } from './pt-state';
import type { SeededRng } from './rng';
import { advanceShell, findFreeShell, launchShell, pointNearBoat } from './shells';
import { bearingDeg, steerShip } from './ship-ai';
import { losBlocked } from './smoke';
import { degToRad } from './units';

export * from './pt-state';
export type { PtParams } from './pt-data';

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
  // 1. 接触: どれか 1 隻が見れば隊が捉える（最後に見た位置と速度を残す）
  let anySeen = false;
  let near2 = Infinity;
  for (let i = 0; i < boats.length; i++) {
    const b = boats[i]!;
    const live = b.phase <= PT_BREAK && c.targetValid;
    const d2 = (boat.x - b.x) * (boat.x - b.x) + (boat.y - b.y) * (boat.y - b.y);
    const r = live && smokeBlocked(c, b) ? c.detectOpenM * c.smokeFactor : c.detectOpenM;
    q.seen[i] = live && c.timeS >= p.detectFromS && d2 <= r * r ? 1 : 0;
    if (q.seen[i] === 1) anySeen = true;
    if (live && d2 < near2) near2 = d2;
  }
  if (near2 < q.closest2) q.closest2 = near2;
  if (anySeen) {
    const gained = !q.detected;
    if (Number.isNaN(q.firstDetectM)) q.firstDetectM = Math.sqrt(near2);
    q.detected = true;
    q.holdLeftS = p.detectHoldS;
    q.lkX = boat.x;
    q.lkY = boat.y;
    q.lkVx = vpx;
    q.lkVy = vpy;
    q.lkAgeS = 0;
    if (gained) ev.onContact(true);
  } else if (q.detected) {
    q.holdLeftS -= feelDt;
    q.lkAgeS += feelDt;
    if (q.holdLeftS <= 0) {
      q.detected = false;
      q.lostContacts++;
      ev.onContact(false);
    }
  }
  // 2. 目標: 見えていれば今の位置（lkAgeS 0）、見えていなければ最後に見た位置から推す（体感秒 × time_scale で game 秒）
  const tx = q.lkX + q.lkVx * q.lkAgeS * p.timeScale;
  const ty = q.lkY + q.lkVy * q.lkAgeS * p.timeScale;
  // 3. 夜明け: 去っていない PT はこのステップで去る（航過中なら数えず、その弾は前の航過にも数えない）。乱数は引かない
  for (let i = 0; c.dawn && i < boats.length; i++) {
    if (boats[i]!.phase >= PT_LEAVE) continue;
    boats[i]!.phase = PT_LEAVE;
    if (q.owner === i) {
      q.owner = -1;
      if (q.lastPassBoat === i) q.lastPassBoat = -1;
    }
    q.leftAtDawn = true;
    ev.onLeave(i);
  }
  q.gapLeftS -= feelDt;
  // 4. PT ごと: 段階 → 操舵 → 航過の射撃と終わり・去った判定
  for (let i = 0; i < boats.length; i++) {
    const b = boats[i]!;
    if (b.phase === PT_OUT) continue;
    if (!q.detected && (b.phase === PT_ALERT || b.phase === PT_RUN_IN)) b.phase = PT_PATROL; // 見失った
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
        b.phase = PT_BREAK; // 追いつけない突撃の打ち切り（航過には数えない）
        b.lockDeg = b.headingDeg;
        b.timerS = 0;
        hd = b.lockDeg;
      } else {
        aimPoint(q.aim, b.x, b.y, p.runInMps, tx, ty, q.lkVx, q.lkVy, b.side, p.offsetM, p.bounds.width, p.bounds.height, p.edgeMarginM);
        hd = bearingDeg(b.x, b.y, q.aim.x, q.aim.y); // 固めるならこの針路
        if (held) {
          // 2 番手は距離を取る: 寄る途中で外へ曲がり hold_off_m の内へ入らない（解けたらそのまま寄る）
          if ((tx - b.x) * (tx - b.x) + (ty - b.y) * (ty - b.y) < p.holdOuter2) hd = holdOffHeading(b.x, b.y, tx, ty, b.side, p.holdOff2, p.holdOuter2);
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
    } else if (b.phase === PT_PASS && b.timerS > 0) stepPass(q, p, c, b, i, vpx, vpy, rng, feelDt, ev); // 固めたステップ（timerS 0）は撃たない
  }
  // 5. 弾: 航過の命中はその航過に、終わった後に落ちた弾は撃った PT の最後の航過に数える
  for (let k = 0; k < q.shells.length; k++) {
    const s = q.shells[k]!;
    if (!s.active || !advanceShell(s, dt)) continue;
    const hit = c.targetValid && pointNearBoat(s.impactX, s.impactY, boat, c.boatHalfLengthM, c.boatHalfBeamM + p.gun.splashRadiusM);
    if (hit) {
      q.hits++;
      if (s.gunIndex === q.owner) q.passHits++;
      else if (s.gunIndex === q.lastPassBoat && q.lastPassHits++ === 0 && q.lastPassFired) q.cleanPasses--;
    }
    ev.onImpact(s.impactX, s.impactY, hit);
  }
}

/**
 * 航過の 1 ステップ（操舵の後）: 撃つのは航過中の 1 隻だけ、予告から open_fire_s 後・捉えていて・艇が的で・煙幕に遮られず・残り弾あり・近すぎず・
 * 有効射程と視程の内・艇首尾の円錐の外。間隔は負の残りを繰り越す（barges と同じ）。1 発ごとに今の艇の速度で直線の見越し（乱数 2 回）。
 * 後ろへ抜けた（有効射程の外か艇尾の円錐）・最大秒・海域の縁で終わる
 */
function stepPass(q: PtSection, p: PtParams, c: PtCheck, b: PtBoatState, i: number, vpx: number, vpy: number, rng: SeededRng, feelDt: number, ev: PtEvents): void {
  const boat = c.boat;
  const g = p.gun;
  const eff2 = g.effectiveM * g.effectiveM;
  const dx = boat.x - b.x;
  const dy = boat.y - b.y;
  const d2 = dx * dx + dy * dy;
  const r = degToRad(b.headingDeg);
  const hx = Math.sin(r);
  const hy = -Math.cos(r);
  const cone = inDeadCone(hx, hy, dx, dy, d2, p.cosDead2);
  const cd = Math.max(b.cooldownS - feelDt, -feelDt);
  b.cooldownS = cd;
  const canFire = i === q.owner && b.timerS >= p.openFireS && q.detected && c.targetValid && b.roundsLeft > 0 && d2 >= p.minRange2 && d2 <= eff2 && d2 <= c.visRange2 && !cone && !smokeBlocked(c, b);
  if (!canFire) {
    if (cd < 0) b.cooldownS = 0;
  } else if (cd <= 0) {
    const s = findFreeShell(q.shells);
    if (s) {
      b.cooldownS = cd + 60 / (g.roundsPerMinPerGun * g.count);
      launchShell(s, b.x, b.y, boat.x, boat.y, vpx, vpy, g.shellSpeedMps, Math.max(p.spreadMinM, (g.dispersionM * Math.sqrt(d2)) / g.effectiveM), i, rng);
      b.roundsLeft--;
      if (b.firedThisPass === 0) q.minWarnS = Math.min(q.minWarnS, c.timeS - q.commitAtS);
      b.firedThisPass++;
      q.shots++;
      ev.onFire(i, b.x, b.y);
    }
  }
  const dot = hx * dx + hy * dy;
  if (b.timerS >= p.passMaxS || (dot < 0 && (d2 > eff2 || cone)) || nearEdge(b.x, b.y, p.bounds, p.edgeMarginM)) endPass(q, p, b, i, ev);
}

/** 航過の速さ: 艇の速さ + 追い越し（下限 pass_speed_kt・上限は艇の最大） */
function passSpeedMps(p: PtParams, playerMps: number): number {
  return Math.min(p.dashMps, Math.max(p.passMinMps, playerMps + p.overtakeMps));
}

/** 航過を固める: 針路・速さ・弾数・かわす向き（このときの艇の針路から 1 回だけ。点滅しない） */
function commitPass(q: PtSection, c: PtCheck, b: PtBoatState, i: number, lockDeg: number, passMps: number, rounds: number): void {
  b.phase = PT_PASS;
  b.lockDeg = lockDeg;
  b.passMps = passMps;
  b.timerS = 0;
  b.roundsLeft = rounds;
  b.firedThisPass = 0;
  q.owner = i;
  q.passHits = 0;
  q.commitAtS = c.timeS;
  q.dodge = dodgeTurn(lockDeg, b.x, b.y, c.boat.x, c.boat.y, c.boat.headingDeg);
}

/** 航過の終わり: 数えて、次の航過まで pass_gap_s。max_passes に達したら去る、まだなら離脱 */
function endPass(q: PtSection, p: PtParams, b: PtBoatState, i: number, ev: PtEvents): void {
  const fired = b.firedThisPass > 0;
  b.passes++;
  q.passes++;
  if (fired) q.firedPasses++;
  if (fired && q.passHits === 0) q.cleanPasses++;
  q.lastPassHits = q.passHits;
  q.lastPassFired = fired;
  q.lastPassBoat = i;
  q.passSeq++;
  q.owner = -1;
  q.gapLeftS = p.passGapS;
  b.phase = b.passes >= p.maxPasses ? PT_LEAVE : PT_BREAK;
  b.timerS = 0;
  ev.onPassEnd(i, fired, q.passHits);
  if (b.phase === PT_LEAVE) ev.onLeave(i);
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

/** PT と艇の間の線が煙幕に遮られている（煙幕の無い艇では常に false） */
function smokeBlocked(c: PtCheck, b: BoatState): boolean {
  return c.smoke !== null && c.smokeParams !== null && losBlocked(c.smoke, c.smokeParams, b.x, b.y, c.boat.x, c.boat.y);
}
