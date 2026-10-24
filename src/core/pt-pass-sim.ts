// 米PT の掃射の航過の模擬（v0.6.3。docs/02 §6.4、spec §F、実機 2 回目 spec r2 §H）。Phaser 非依存。ゲームは使わない（tests/pt-sim-*.test.ts と scripts/pt-pass-sim.ts が使う）。
// 遊び方（台本。艇長に見えるものだけを使う。core/pt-sim-policy）ごとに 1 夜を、ゲームと同じ core（stepPtSection・stepBoat・clampToBounds・nextSpeedBand・enemyDetectRangeM・stepFuel・
// applyShellHit・stepDamage・乗員の旋回と加速・T-14 の 13mm の stepPtGun と hitPt）と同じ固定ステップ・同じ順序（夜明けのラッチ → 艇 → 燃料 → 輪 → 速力帯 → 発見距離 →
// 13mm（弾倉 → 標的 → 発射 → 着弾 → 撃退・撃沈）→ 閃光 → 米PT → 火災）で走らせ、発見・航過・被弾・沈没・帰投・燃料・13mm の命中・撃退・撃沈を数える。
// 乱数: 今夜の揺らぎは seed+16（rollNight。world-setup と同じ）、米PT の射撃と命中の火災・機関は seed+18、13mm は seed+20（1 発 2 回・生きた PT への命中 1 回。撃つ遊び方だけ作る。
// 押さなければ引かないので世界と同じ）。台本の揺らぎ（出発の遅れ・赤い線から転舵までの反応）は別の系列。実機 2 回目: 追撃の連射（PT_PASS の burst）への反応（keep・away・full）と、
// 連射・制圧・待つ追撃の PT の最接近・同じ PT の続けての連射・連射の線の最短・機関損傷の夜を数える（spec r2 §H）。
// 省いたもの: 命中スロー、消火ボタンの長押し（火災は起きて PT_PLAY.fireOutS で消す＝気の付く艇長）、漂流の待ち（燃料 0 で止まったら漂流）。確保は 1 夜の始めだけ。1 夜の記録は core/pt-trial、集計は core/pt-sim-cell。
import { clampToBounds, nextSpeedBand, setPerformance, stepBoat, type BoatInput, type BoatParams, type BoatState, type SpeedStep } from './boat-motion';
import { crewAccelFactor, crewLost, crewTurnFactor, type CrewEffects, type CrewParams } from './crew';
import { dawnReached } from './dawn-air';
import { createFuelState, stepFuel, type FuelCurve } from './fuel';
import type { GunBatteryParams, GunEvents } from './gun-battery';
import { applyShellHit, createDamageState, stepDamage, type DamageParams, type HitOutcome } from './gunnery';
import { insideRing, type ReturnPoint } from './mission-flow';
import { fixedNight, rollNight, type NightBlock } from './night';
import { PT_CHASE, PT_GUN_SEED_OFFSET, PT_PASS, PT_RUN_IN, PT_SEED_OFFSET, createPtSection, stepPtSection, threatIndex, type PtCheck, type PtEvents } from './pt-boats';
import { partnerReady } from './pt-chase';
import { hitPt } from './pt-damage';
import { ptParamsAtNight, type PtParams } from './pt-data';
import { createPtGun, stepPtGun } from './pt-gun';
import { targetSide } from './pt-pass';
import { PT_PLAY, PT_POLICY_SEED_ADD, PT_POLICY_SEED_MUL, PT_POLICY_SPECS, allLeft, broadsideDeg, ptInSight, stopsInDark, type PtBurstReact, type PtPolicy, type PtSimSpeed } from './pt-sim-policy';
import { createPtTrial, finishPtTrial, type PtTrial } from './pt-trial';
import { SeededRng } from './rng';
import { bearingDeg } from './ship-ai';
import { wrapDeg360 } from './units';
import { enemyDetectRangeM, speedFactorForBand, type VisibilityParams } from './visibility';

export interface PtSimSetup {
  /** 米PT（今夜の揺らぎの前。getPtParams の値）と今夜の材料（night block・任意の危険の share・敵と沿岸砲の数。world-setup と同じ rollNight を引く） */
  pt: PtParams; night: NightBlock | null; hazardShares: Readonly<Record<string, number>>; nightEnemyRolls: number; nightBatteries: number;
  /** 米PT の弾の数（config/pt-config の PT_SHELL_POOL_SIZE。世界と同じ） */
  shellPoolSize: number;
  /** 艇・出発点・海域の縁から押し戻す余白・当たり判定の半長と半幅 m・被害・乗員・燃料（曲線と積む gal）・視界・帰投地点（world-setup の値） */
  boat: BoatParams; start: { x: number; y: number; headingDeg: number }; boundsMarginM: number; halfLengthM: number; halfBeamM: number;
  damage: DamageParams; crew: CrewParams; crewEffects: CrewEffects; fuel: FuelCurve; fuelGal: number; vis: VisibilityParams; visRange2: number; ring: ReturnPoint;
  /** 夜明けまでの実秒、時間圧縮、固定ステップの実秒（step-config の FIXED_STEP_S） */
  durationS: number; timeScale: number; stepS: number;
  /** T-14 の 13mm（v0.6.3 実機 1 回目。world-setup の guns＝弾倉のある砲。無い任務は null で、撃つ遊び方は使えない）と弾の数（config/pt-config の PT_GUN_SHELL_POOL_SIZE） */
  gun: GunBatteryParams | null; gunShellPoolSize: number;
  /** 追撃の連射への反応の上書き（v0.6.3 実機 2 回目。連射への反応の表。無ければ台本の burst か keep） */
  burstReact?: PtBurstReact;
}

/** 打ち切りの実秒・時刻の比較の丸めの余裕・13mm の距離の二乗の比較の余裕 m²（targetM は平方根を二乗し直すので 1 ulp ずれる） */
const SIM_MAX_S = 400;
const TIME_EPS_S = 1e-6;
const DIST2_EPS = 1e-6;
const DRIFT: BoatInput = { headingDeg: NaN, speed01: 0 };
/** hold が転舵を延ばすステップ数（線が消えた次のステップで転舵が終わる。1 ステップの丸めの余裕に半ステップ） */
const HOLD_EXTEND_STEPS = 1.5;

export type { PtTrial, PtTrialEnd } from './pt-trial';

/** seed の夜の米PT（world-setup の applyPtNight と同じ: rollNight の敵の 1 件目のずれと左右反転） */
export function ptNightParams(s: PtSimSetup, seed: number): PtParams {
  const n = s.night ? rollNight(s.night, (id) => s.hazardShares[id] ?? 0, seed, s.nightEnemyRolls, s.nightBatteries) : fixedNight(s.nightEnemyRolls, s.nightBatteries);
  const o = n.enemyOffsets[0]!;
  return ptParamsAtNight(s.pt, o.dx, o.dy, n.mirrored);
}

/** 1 夜。艇は出発点で止まっていて、出発の遅れの後に台本どおり帰投地点へ */
export function runPtTrial(s: PtSimSetup, policy: PtPolicy, seed: number): PtTrial {
  const sp = PT_POLICY_SPECS[policy];
  if (sp.shoot && !s.gun) throw new Error(`遊び方 ${policy} は 13mm を撃つが、この任務の艇に砲（guns）が無い`);
  const p = ptNightParams(s, seed);
  const q = createPtSection(p, s.shellPoolSize);
  const rng = new SeededRng((seed + PT_SEED_OFFSET) >>> 0);
  const pol = new SeededRng((seed * PT_POLICY_SEED_MUL + PT_POLICY_SEED_ADD) >>> 0);
  const bp: BoatParams = { ...s.boat }; // 機関損傷・乗員で書き換える（boat-damage・mission-world と同じ）
  const boat: BoatState = { x: s.start.x, y: s.start.y, headingDeg: s.start.headingDeg, speedMps: 0 };
  const d = createDamageState(s.damage);
  const fuel = createFuelState(s.fuelGal);
  const hit: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
  const input: BoatInput = { headingDeg: NaN, speed01: 0 };
  const c: PtCheck = { boat, boatHalfLengthM: s.halfLengthM, boatHalfBeamM: s.halfBeamM, detectOpenM: 0, smokeFactor: s.vis.smokeFactor, smoke: null, smokeParams: null, targetValid: true, visRange2: s.visRange2, dawn: false, timeS: 0 };
  const eff2 = p.gun.effectiveM * p.gun.effectiveM;
  const realDt = s.stepS;
  const dt = realDt * s.timeScale;
  const out = createPtTrial();
  const br: PtBurstReact = s.burstReact ?? sp.burst ?? 'keep';
  const departS = pol.nextRange(0, PT_PLAY.departMaxS);
  const speedMps = (k: PtSimSpeed): number => (k === 'silent' ? s.boat.silentMaxMps : k === 'cruise' ? s.boat.speedCruiseMps : Infinity);
  let t = 0;
  let sinking = false;
  let atHome = false;
  let band: SpeedStep = 'stop';
  /** 台本の覚え: 反応を待つ PT と時刻、転舵の終わりと針路・その PT（hold）、火災を消す時刻、止まった秒、縁へ逃げた、前の赤い線の舷（0 は無し）と時刻、全速で逃げている（flee）、
   * 連射への反応の全速の終わり、最後に連射を終えた PT と時刻（同じ PT の続けての連射の計測） */
  const m = { reactBoat: -1, reactAt: NaN, dodgeUntil: -1, dodgeDeg: 0, dodgeBoat: -1, fireOutAt: NaN, stopUsedS: 0, fled: false, flank: 0, commitT: NaN, fleeOn: false, burstFullUntil: -1, lastBurstBoat: -1, lastBurstEndT: NaN };
  const ev: PtEvents = {
    onContact: () => {}, onLeave: () => {}, onOut: () => {},
    // 連射（burst。endBurst は onPassEnd の後で burst を下ろす）は連射の線の最短と、その PT と時刻
    onPassEnd: (i) => {
      if (!q.boats[i]!.burst) out.minPassS = Math.min(out.minPassS, c.timeS - q.commitAtS);
      else {
        out.minBurstS = Math.min(out.minBurstS, c.timeS - q.commitAtS);
        m.lastBurstBoat = i;
        m.lastBurstEndT = t;
      }
    },
    // 赤い線: 反応の秒は毎回引く（台本どうしで同じ乱数の列）。late_turn は決まった秒。舷（commitPass の ownerFlank）が前の赤い線と替わったか
    onCommit: (i) => {
      // 交互の不変: 同じ PT の連射が gap_s + self_gap_s（体感秒）の内に続いたのに、相方が撃てる距離にいた
      if (q.boats[i]!.burst && i === m.lastBurstBoat && t - m.lastBurstEndT < p.chaseGapS + p.chaseSelfGapS - TIME_EPS_S && partnerReady(q, p, i, boat.x, boat.y)) out.selfRepeats++;
      if (m.flank !== 0) {
        out.flankPairs++;
        if (q.ownerFlank !== m.flank) out.flankAlt++;
        out.commitGapSumS += t - m.commitT;
      }
      m.flank = q.ownerFlank;
      m.commitT = t;
      const r = pol.nextRange(PT_PLAY.reactMinS, PT_PLAY.reactMaxS);
      m.reactBoat = i;
      m.reactAt = t + (Number.isNaN(sp.reactS) ? r : sp.reactS);
    },
    onFire: (_i, x, y) => {
      const d2 = (boat.x - x) * (boat.x - x) + (boat.y - y) * (boat.y - y);
      if (d2 > eff2) out.beyondEff++;
      if (d2 > c.visRange2) out.beyondSight++;
    },
    // 命中は世界の hitBoat → BoatDamage.applyHit と同じ（同じ seed+18 で火災・機関、沈み始めたら残りの弾は外れ）
    onImpact: (_x, _y, h) => {
      if (!h || sinking) return;
      applyShellHit(d, p.hit, s.damage, rng, hit);
      if (hit.startedFire) m.fireOutAt = t + PT_PLAY.fireOutS;
      if (hit.engineHit) bp.speedMaxMps = s.boat.speedMaxMps * s.damage.engineSpeedFactor;
      out.engineHit = out.engineHit || hit.engineHit;
      bp.speedCruiseMps = Math.min(bp.speedCruiseMps, bp.speedMaxMps);
      if (hit.destroyed) {
        sinking = true;
        c.targetValid = false;
      }
    },
  };
  // 13mm（撃つ遊び方だけ。世界の PtSquadron と同じ: 着弾した生きた PT ごとに seed+20 から 1 回引いて hitPt）
  const g = sp.shoot ? s.gun : null;
  const gun = g ? createPtGun(g, s.gunShellPoolSize) : null;
  const gunRng = new SeededRng((seed + PT_GUN_SEED_OFFSET) >>> 0);
  const range2 = g ? g.rangeM * g.rangeM : 0;
  const gunEv: GunEvents = {
    onFire: () => {
      const tm2 = gun!.battery.targetM * gun!.battery.targetM;
      if (tm2 > s.visRange2 + DIST2_EPS || tm2 > range2 + DIST2_EPS) out.gunBeyond++;
    },
    onHit: (i, gi) => hitPt(q, p, i, g!.groups[gi]!.damage, gunRng.next(), ev),
    onMiss: () => {},
  };
  /** 待つ PT ごと: 0 待っていない、1 hold_off_m の外で待ち始めた（最接近を測る）、2 内で待ち始めた。PT ごとの撃った連射（数えた連射は q.lastPassBoat の PT） */
  const heldFrom = new Uint8Array(q.boats.length);
  const firedBy = new Uint8Array(q.boats.length);
  let firedSeen = 0;
  let heldMin2 = Infinity;
  let chaseHeld2 = Infinity;
  while (t < SIM_MAX_S - TIME_EPS_S) {
    // 台本（毎フレームの入力に当たる。固定ステップの前）。t0 はこのステップの始まり。速さは kt で決める（HUD の表示。機関損傷で全速が落ちても静音は 14 kt）
    const t0 = t;
    let hd = bearingDeg(boat.x, boat.y, s.ring.x, s.ring.y);
    let want = t0 < departS || (policy === 'stop_dawn' && !c.dawn) ? 0 : speedMps(sp.base);
    // 見つかったら全速（flee。その夜ずっと）・見つかっている間 14 kt（slow）
    m.fleeOn = m.fleeOn || (sp.flee === true && q.detected);
    if (t0 >= departS && m.fleeOn) want = speedMps('full');
    if (t0 >= departS && sp.slow === true && q.detected) want = speedMps('silent');
    if (policy === 'zigzag') hd = wrapDeg360(hd + (Math.floor(t0 / PT_PLAY.zigzagLegS) % 2 === 0 ? PT_PLAY.zigzagDeg : -PT_PLAY.zigzagDeg));
    if (stopsInDark(policy) && !q.detected && m.stopUsedS < PT_PLAY.darkStopMaxS && ptInSight(q.boats, boat, s.visRange2)) {
      want = 0;
      m.stopUsedS += realDt;
    }
    if (policy === 'edge_flee') {
      m.fled = m.fled || q.detected;
      if (m.fled && !allLeft(q.boats)) {
        hd = 0;
        want = boat.y > s.boundsMarginM + PT_PLAY.edgeStopM ? speedMps('full') : 0;
      }
    }
    // 13mm の射撃ボタン: 生きた PT が見えていて（detected は見つかっている間だけ）押す
    const held = sp.shoot !== undefined && (sp.shoot === 'always' || q.detected) && ptInSight(q.boats, boat, s.visRange2);
    if (sp.stance && q.detected && t0 >= departS) {
      // 舷側を脅威の PT へ（±90° の近い方）。stop は止まる、broadside は静音（見えている PT だけ）
      const ti = threatIndex(q, boat.x, boat.y);
      const b = ti >= 0 ? q.boats[ti]! : null;
      if (b && (b.x - boat.x) * (b.x - boat.x) + (b.y - boat.y) * (b.y - boat.y) <= s.visRange2) {
        hd = broadsideDeg(boat, b.x, b.y);
        want = sp.stance === 'stop' ? 0 : speedMps('silent');
      }
    }
    // 連射の赤い線（PT → 艇）への反応: keep は何もしない、full は同じ針路で全速 4 秒、away は下の転舵（撃つ PT を真後ろへ）
    if (br !== 'away' && m.reactBoat >= 0 && q.boats[m.reactBoat]!.burst && t0 >= m.reactAt - TIME_EPS_S) {
      if (br === 'full') m.burstFullUntil = t0 + PT_PLAY.dodgeHoldS;
      m.reactBoat = -1;
    }
    if (t0 < m.burstFullUntil - TIME_EPS_S) want = speedMps('full');
    if (sp.dodge !== 'none' && m.reactBoat >= 0 && t0 >= m.reactAt - TIME_EPS_S) {
      // 赤い線（固めた針路 lockDeg を PT から引いた線）のどちら側にいるかを見て、線から離れる直角へ（meet は PT へ向かう）。連射の線は PT から真っすぐ離れる向き（away）
      const b = q.boats[m.reactBoat]!;
      const toward = sp.dodge === 'toward' && !b.burst;
      m.dodgeDeg = toward ? bearingDeg(boat.x, boat.y, b.x, b.y) : b.burst ? bearingDeg(b.x, b.y, boat.x, boat.y) : wrapDeg360(b.lockDeg + targetSide(b.lockDeg, b.x, b.y, boat.x, boat.y) * PT_PLAY.dodgeDeg);
      m.dodgeUntil = t0 + (toward ? PT_PLAY.meetHoldS : PT_PLAY.dodgeHoldS);
      m.dodgeBoat = m.reactBoat;
      m.reactBoat = -1;
    }
    // hold: 転舵が続いている間に、その PT の線（q.owner）が出ていれば延ばす。連射の線は away のときだけ（PT の向きが変わるので向きも毎ステップ直す）
    const hb = sp.hold === true && m.dodgeBoat >= 0 && q.owner === m.dodgeBoat && t0 < m.dodgeUntil + realDt ? q.boats[m.dodgeBoat]! : null;
    if (hb && (!hb.burst || br === 'away')) {
      m.dodgeUntil = t0 + HOLD_EXTEND_STEPS * realDt;
      if (hb.burst) m.dodgeDeg = bearingDeg(hb.x, hb.y, boat.x, boat.y);
    }
    if (t0 < m.dodgeUntil - TIME_EPS_S) {
      hd = m.dodgeDeg;
      want = speedMps(sp.dodgeSpeed);
    }
    input.headingDeg = hd;
    input.speed01 = want > 0 ? Math.min(1, want / bp.speedMaxMps) : 0;
    if (t0 >= m.fireOutAt - TIME_EPS_S) {
      d.fireLeftS = 0;
      m.fireOutAt = NaN;
    }
    // 固定ステップ（mission-world の順）
    t += realDt;
    if (!c.dawn && dawnReached(s.durationS, t)) c.dawn = true;
    const lost = crewLost(s.crew, s.damage.maxHp, d.hp);
    setPerformance(bp, s.boat.turnRateDegS, s.boat.accelMps2, crewTurnFactor(s.crewEffects, lost), crewAccelFactor(s.crewEffects, lost));
    stepBoat(boat, fuel.empty ? DRIFT : input, bp, dt);
    clampToBounds(boat, p.bounds, s.boundsMarginM);
    stepFuel(fuel, s.fuel, boat.speedMps, dt);
    atHome = insideRing(s.ring, boat.x, boat.y);
    band = nextSpeedBand(band, boat.speedMps, bp);
    c.detectOpenM = enemyDetectRangeM(p.baseDetectM, speedFactorForBand(band, s.vis.speedFactor), s.vis, false);
    c.targetValid = !sinking && !atHome;
    c.timeS = t;
    if (gun && g) {
      // 13mm（浮いていて輪の外だけ撃つ）→ 撃ったステップは閃光の距離で見つかる（世界の PtSquadron.step と同じ順）
      stepPtGun(gun, g, boat, band, held, c.targetValid, q, p, s.visRange2, gunRng, realDt, dt, gunEv);
      c.flashM = gun.battery.fired ? g.flashRevealM : 0;
    }
    stepPtSection(q, p, c, rng, realDt, dt, ev);
    if (!sinking && stepDamage(d, s.damage, realDt)) sinking = true;
    // 計測（航過中の数・1 回の航過の命中。後から落ちた弾は core が最後の航過に数える）、待つ PT の最接近（hold_off_m の外で待ち始めた PT だけ）、
    // 他の PT が撃っている間の追撃の PT の最接近（平方根は最後に 1 回）、1 隻の撃った連射の最大（1 ステップに 1 回まで。終わり・夜明け・沈没のどれも countPass が lastPassBoat を書く）
    if (q.firedBursts > firedSeen && q.lastPassBoat >= 0) {
      firedBy[q.lastPassBoat] = firedBy[q.lastPassBoat]! + q.firedBursts - firedSeen;
      out.maxBoatBursts = Math.max(out.maxBoatBursts, firedBy[q.lastPassBoat]!);
      firedSeen = q.firedBursts;
    }
    let passing = 0;
    for (let i = 0; i < q.boats.length; i++) {
      const b = q.boats[i]!;
      if (b.phase === PT_PASS) passing++;
      if (b.phase === PT_CHASE && q.owner >= 0 && q.owner !== i) {
        const d2 = (b.x - boat.x) * (b.x - boat.x) + (b.y - boat.y) * (b.y - boat.y);
        if (d2 < chaseHeld2) chaseHeld2 = d2;
      }
      if (q.held[i] === 1 && b.phase === PT_RUN_IN) {
        const d2 = (b.x - boat.x) * (b.x - boat.x) + (b.y - boat.y) * (b.y - boat.y);
        if (heldFrom[i] === 0) heldFrom[i] = d2 > p.holdOff2 ? 1 : 2;
        if (heldFrom[i] === 1 && d2 < heldMin2) heldMin2 = d2;
      } else heldFrom[i] = 0;
    }
    out.maxPassing = Math.max(out.maxPassing, passing);
    out.worstPassHits = Math.max(out.worstPassHits, q.owner >= 0 ? q.passHits : 0, q.lastPassHits);
    out.worstBurstHits = Math.max(out.worstBurstHits, q.owner >= 0 && q.boats[q.owner]!.burst ? q.passHits : 0, q.lastPassBurst ? q.lastPassHits : 0);
    out.end = sinking ? 'sunk' : atHome ? 'home' : fuel.empty && band === 'stop' ? 'adrift' : 'timeout';
    if (out.end !== 'timeout') break;
  }
  return finishPtTrial(out, q, t, c.dawn, sinking ? s.damage.maxHp : s.damage.maxHp - d.hp, (fuel.gal / s.fuelGal) * 100, gun ? gun.battery.shots : 0, heldMin2, chaseHeld2);
}
