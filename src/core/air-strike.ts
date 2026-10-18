// 夜明けの空襲（v0.6.1。docs/02 §6.8）: 敵の制空下の任務で、夜明けに敵機が現れて自艇の周りを時計回りに旋回し、1 機ずつ直線の爆撃進路 → 真上で投下。
// 爆弾を落とし切ると去り、最後の投下から wave_rest_s で次の波（上限なし）。狙いは投下の瞬間: 落下の game 秒後の位置を、今の旋回を続けた円弧
// （旋回が aim_turn_min 未満なら直進）で見越す ＋ 一様円盤の散布。僚艇を狙う機は直進の見越しだけ（自艇の転舵に付いて来る僚艇は外れる）。
// Phaser 非依存・毎ステップ確保しない（確保は createAirStrike だけ）。機の位置は自艇からの相対（seaplanePose と同じ）。時計は体感の実秒、見越しと旋回率は game 秒。
// 乱数は seed+19 の専用の系列（AIR_STRIKE_SEED_OFFSET。投下ごとに散布の 2 回だけ。startAirStrike までは引かない）。夜の水上機（seaplane*.ts）には触らない。
// 定数・型・確保は air-strike-state.ts、姿勢・脅威・見越しは air-strike-pose.ts（ここから出し直す。使う側はここだけを import する）。
import type { BoatState } from './boat-motion';
import type { AircraftPose } from './friendly';
import { pointNearBoat } from './gunnery';
import type { SeededRng } from './rng';
import { DODGE_TURN_DEG } from './seaplane-ordnance';
import { radToDeg, wrapDeg180, wrapDeg360 } from './units';
import { AS_DONE, AS_EV_IMPACT, AS_EV_RELEASE, AS_EV_RUN, AS_EV_WAVE, AS_INBOUND, AS_LEAVING, AS_ORBIT, AS_OUTBOUND, AS_RUN, type AirStrikeCheck, type AirStrikeParams, type AirStrikeState } from './air-strike-state';
import { allDone, bombInAir, predictBoat, strikePose } from './air-strike-pose';

export * from './air-strike-state';
export * from './air-strike-pose';

/** 波を出す: 機 i は from + 波 × rotate + offset[i] の方位の spawnM 先に現れて接近（carry は前の波から持ち越した秒） */
function spawnWave(s: AirStrikeState, p: AirStrikeParams, carry: number): void {
  s.waves++;
  for (let i = 0; i < s.planes.length; i++) {
    const pl = s.planes[i]!;
    pl.phase = AS_INBOUND;
    pl.bearingDeg = wrapDeg360(p.fromBearingDeg + s.wave * p.waveRotateDeg + p.spawnOffsetsDeg[i]!);
    pl.r = p.spawnM;
    pl.timerS = 0;
    pl.toEscort = false;
    pl.bombsLeft = p.bombsPerPlane;
  }
  s.waveT = carry;
  s.nextRun = 0;
  s.lastReleaseT = NaN;
  s.pendingEv |= AS_EV_WAVE;
}

/** 夜明けのラッチで 1 回だけ（乱数は引かない）。AS_EV_WAVE は次の stepAirStrike が返す */
export function startAirStrike(s: AirStrikeState, p: AirStrikeParams, player: BoatState): void {
  if (s.started) return;
  s.started = true;
  s.prevHeadingDeg = player.headingDeg;
  s.wave = 0;
  spawnWave(s, p, 0);
}

const scratchPose: AircraftPose = { dx: 0, dy: 0, headingDeg: 0, alpha: 0 };
const aimTmp = { x: 0, y: 0 };

/** 中断（最初の 1 回だけ）: 接近〜抜ける途中の機は今の相対位置から外向きに去る（atan2・hypot はここだけ） */
function cancelStrike(s: AirStrikeState, p: AirStrikeParams): void {
  s.cancelled = true;
  for (let i = 0; i < s.planes.length; i++) {
    const pl = s.planes[i]!;
    if (pl.phase < AS_INBOUND || pl.phase > AS_OUTBOUND) continue;
    strikePose(s, p, i, scratchPose);
    pl.bearingDeg = wrapDeg360(radToDeg(Math.atan2(scratchPose.dx, -scratchPose.dy)));
    pl.r = Math.hypot(scratchPose.dx, scratchPose.dy);
    pl.phase = AS_LEAVING;
    pl.timerS = 0;
  }
}

/** 投下: 目標の落下後の位置を見越し（僚艇は直進）、散布を 2 回引く（半径 → 角度の順）。carry は投下から今のステップの終わりまでの秒 */
function release(s: AirStrikeState, p: AirStrikeParams, c: AirStrikeCheck, rng: SeededRng, i: number, yaw: number, feelDt: number, carry: number): void {
  const pl = s.planes[i]!;
  pl.bombsLeft--;
  pl.e0x = pl.toEscort ? s.escRelX : 0;
  pl.e0y = pl.toEscort ? s.escRelY : 0;
  let slot = -1;
  for (let k = 0; k < s.bombs.length; k++) {
    if (!s.bombs[k]!.active) {
      slot = k;
      break;
    }
  }
  if (slot < 0) return; // 起きない（プールは ceil(落下 / 間隔) + 1。air-strike-data が検査）
  const atEscort = pl.toEscort && c.escortAfloat && c.escort !== null;
  const target = atEscort ? c.escort! : c.player;
  const by = atEscort ? 0 : yaw;
  predictBoat(target, by, p.fallGameS, p.aimTurnMinDegS, aimTmp);
  const rr = p.scatterM * Math.sqrt(rng.next());
  const th = 2 * Math.PI * rng.next();
  const b = s.bombs[slot]!;
  b.active = true;
  b.toEscort = atEscort;
  b.plane = i;
  b.fromX = target.x;
  b.fromY = target.y;
  b.aimX = aimTmp.x + rr * Math.cos(th);
  b.aimY = aimTmp.y + rr * Math.sin(th);
  // 爆弾はこのステップの最後（5）でも feelDt 進むので、その分を足しておく（投下からの経過 carry を正しく数える）
  b.leftS = p.fallFeelS - carry + feelDt;
  b.aimedS = carry - feelDt;
  b.aimHeadingDeg = target.headingDeg;
  b.yawDegS = by;
  b.dodgeReactS = NaN;
  b.hitPlayer = false;
  b.hitEscort = false;
  s.bombsDropped++;
  if (atEscort) s.bombsAtEscort++;
  s.lastReleaseT = s.waveT - carry;
  s.lastRelease = slot;
}

/** 固定ステップ（feelDt は体感の実秒）。始まる前は何もしない（乱数も引かない）。戻り値は AS_EV_* のビット */
export function stepAirStrike(s: AirStrikeState, p: AirStrikeParams, c: AirStrikeCheck, rng: SeededRng, feelDt: number): number {
  if (!s.started) return 0;
  let ev = s.pendingEv;
  s.pendingEv = 0;
  const P = c.player;
  // 1. 旋回率（deg/game 秒）、僚艇の相対位置、波の時計
  const dtG = feelDt * p.timeScale;
  const yaw = dtG > 0 ? wrapDeg180(P.headingDeg - s.prevHeadingDeg) / dtG : 0;
  s.yawDegS = yaw;
  s.escRelX = c.escort ? c.escort.x - P.x : 0;
  s.escRelY = c.escort ? c.escort.y - P.y : 0;
  s.waveT += feelDt;
  // 2. 中断（最初の 1 回。以後は進路も波も無い。落下中の爆弾はそのまま落ちる）
  if (c.cancel && !s.cancelled) cancelStrike(s, p);
  // 3. 指揮: 予定の秒に順番の機（nextRun % planes。検査で必ず旋回中）が爆撃進路に入る。狙う相手はここで決める
  if (!s.cancelled && s.nextRun < s.totalRuns) {
    const scheduled = p.firstRunS + s.nextRun * p.runGapS;
    const i = s.nextRun % p.planes;
    const pl = s.planes[i]!;
    if (s.waveT >= scheduled && pl.phase === AS_ORBIT) {
      const late = s.waveT - scheduled;
      pl.phase = AS_RUN;
      pl.runDeg = pl.bearingDeg;
      pl.toEscort = p.escortPlanes[i]! && c.escortAfloat;
      pl.timerS = (late < feelDt ? late : feelDt) - feelDt; // 4 で feelDt を足す（予定から余った秒を持ち越す）
      s.nextRun++;
      ev |= AS_EV_RUN;
    }
  }
  // 4. 機を進める（段階が変わっても余った秒を持ち越す）
  for (let i = 0; i < s.planes.length; i++) {
    const pl = s.planes[i]!;
    const ph = pl.phase;
    if (ph === AS_INBOUND) {
      pl.timerS += feelDt;
      pl.r -= p.flightMps * feelDt;
      if (pl.r <= p.runRadiusM) {
        const over = (p.runRadiusM - pl.r) / p.flightMps;
        pl.phase = AS_ORBIT;
        pl.r = p.runRadiusM;
        pl.timerS = over;
        pl.bearingDeg = wrapDeg360(pl.bearingDeg + p.orbitDegPerS * over);
      }
    } else if (ph === AS_ORBIT) {
      pl.timerS += feelDt;
      pl.bearingDeg = wrapDeg360(pl.bearingDeg + p.orbitDegPerS * feelDt);
    } else if (ph === AS_RUN) {
      pl.timerS += feelDt;
      if (pl.timerS >= p.runS) {
        const carry = pl.timerS - p.runS;
        release(s, p, c, rng, i, yaw, feelDt, carry);
        ev |= AS_EV_RELEASE;
        pl.phase = AS_OUTBOUND;
        pl.timerS = carry;
      }
    } else if (ph === AS_OUTBOUND) {
      pl.timerS += feelDt;
      if (pl.timerS >= p.runS) {
        const over = pl.timerS - p.runS;
        const b = wrapDeg360(pl.runDeg + 180);
        pl.timerS = over;
        if (pl.bombsLeft > 0) {
          pl.phase = AS_ORBIT;
          pl.bearingDeg = wrapDeg360(b + p.orbitDegPerS * over);
        } else {
          pl.phase = AS_LEAVING;
          pl.bearingDeg = b;
          pl.r = p.runRadiusM + p.flightMps * over;
        }
      }
    } else if (ph === AS_LEAVING) {
      pl.timerS += feelDt;
      pl.r += p.flightMps * feelDt;
      if (pl.timerS >= p.leaveS) pl.phase = AS_DONE;
    }
  }
  // 5. 落下中の爆弾: 転舵の KPI（自艇を狙った爆弾。見越した針路からの変化）と着弾（沈没中の自艇・沈んだ僚艇には当てない）
  for (let k = 0; k < s.bombs.length; k++) {
    const b = s.bombs[k]!;
    if (!b.active) continue;
    b.aimedS += feelDt;
    if (!b.toEscort && Number.isNaN(b.dodgeReactS) && Math.abs(wrapDeg180(P.headingDeg - (b.aimHeadingDeg + b.yawDegS * b.aimedS * p.timeScale))) >= DODGE_TURN_DEG) b.dodgeReactS = b.aimedS;
    b.leftS -= feelDt;
    if (b.leftS > 0) continue;
    b.active = false;
    b.hitPlayer = !c.playerSinking && pointNearBoat(b.aimX, b.aimY, P, p.playerHalfLengthM, p.playerHitRadiusM);
    b.hitEscort = c.escortAfloat && c.escort !== null && pointNearBoat(b.aimX, b.aimY, c.escort, p.escortHalfLengthM, p.escortHitRadiusM);
    if (b.hitPlayer) {
      s.hitsPlayer++;
      s.damagePlayer += p.bombHit.damage;
    }
    if (b.hitEscort) s.hitsEscort++;
    if (!b.toEscort) {
      if (s.dodgeCount < s.dodgeS.length) s.dodgeS[s.dodgeCount] = b.dodgeReactS;
      s.dodgeCount++;
    }
    s.lastImpact = k;
    ev |= AS_EV_IMPACT;
  }
  // 6. 次の波: 全部落とし、全機が去り、空中に爆弾が無く、最後の投下から waveRestS（余った秒は次の波へ）
  if (!s.cancelled && s.nextRun === s.totalRuns && s.waveT >= s.lastReleaseT + p.waveRestS && allDone(s) && !bombInAir(s)) {
    const carry = s.waveT - (s.lastReleaseT + p.waveRestS);
    s.wave++;
    spawnWave(s, p, carry);
    ev |= s.pendingEv;
    s.pendingEv = 0;
  }
  // 7.
  s.prevHeadingDeg = P.headingDeg;
  return ev;
}
