// 米PT の掃射の航過の模擬（v0.6.3。docs/02 §6.4、spec §F）。Phaser 非依存。ゲームは使わない（tests/pt-pass-sim*.test.ts・tests/pt-gun-sim.test.ts と scripts/pt-pass-sim.ts が使う）。
// 遊び方（台本。艇長に見えるものだけを使う。core/pt-sim-policy）ごとに 1 夜を、ゲームと同じ core（stepPtSection・stepBoat・clampToBounds・nextSpeedBand・enemyDetectRangeM・stepFuel・
// applyShellHit・stepDamage・乗員の旋回と加速・T-14 の 13mm の stepPtGun と hitPt）と同じ固定ステップ・同じ順序（夜明けのラッチ → 艇 → 燃料 → 輪 → 速力帯 → 発見距離 →
// 13mm（弾倉 → 標的 → 発射 → 着弾 → 撃退・撃沈）→ 閃光 → 米PT → 火災）で走らせ、発見・航過・被弾・沈没・帰投・燃料・13mm の命中・撃退・撃沈を数える。
// 乱数: 今夜の揺らぎは seed+16（rollNight。world-setup と同じ）、米PT の射撃と命中の火災・機関は seed+18、13mm は seed+20（1 発 2 回・生きた PT への命中 1 回。撃つ遊び方だけ作る。
// 押さなければ引かないので世界と同じ）。台本の揺らぎ（出発の遅れ・赤い線から転舵までの反応）は別の系列。
// 省いたもの: 命中スロー、消火ボタンの長押し（火災は起きて PT_PLAY.fireOutS で消す＝気の付く艇長）、漂流の待ち（燃料 0 で止まったら漂流）。確保は 1 夜の始めだけ。集計は core/pt-sim-cell。
import { clampToBounds, nextSpeedBand, setPerformance, stepBoat, type BoatInput, type BoatParams, type BoatState, type SpeedStep } from './boat-motion';
import { crewAccelFactor, crewLost, crewTurnFactor, type CrewEffects, type CrewParams } from './crew';
import { dawnReached } from './dawn-air';
import { createFuelState, stepFuel, type FuelCurve } from './fuel';
import type { GunBatteryParams, GunEvents } from './gun-battery';
import { applyShellHit, createDamageState, stepDamage, type DamageParams, type HitOutcome } from './gunnery';
import { insideRing, type ReturnPoint } from './mission-flow';
import { fixedNight, rollNight, type NightBlock } from './night';
import { PT_GUN_SEED_OFFSET, PT_PASS, PT_RUN_IN, PT_SEED_OFFSET, createPtSection, stepPtSection, threatIndex, type PtCheck, type PtEvents } from './pt-boats';
import { hitPt } from './pt-damage';
import { ptParamsAtNight, type PtParams } from './pt-data';
import { createPtGun, stepPtGun } from './pt-gun';
import { targetSide } from './pt-pass';
import { PT_PLAY, PT_POLICY_SEED_ADD, PT_POLICY_SEED_MUL, PT_POLICY_SPECS, allLeft, ptInSight, stopsInDark, type PtPolicy, type PtSimSpeed } from './pt-sim-policy';
import { SeededRng } from './rng';
import { bearingDeg } from './ship-ai';
import { wrapDeg180, wrapDeg360 } from './units';
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
}

/** 打ち切りの実秒・時刻の比較の丸めの余裕・13mm の距離の二乗の比較の余裕 m²（targetM は平方根を二乗し直すので 1 ulp ずれる） */
const SIM_MAX_S = 400;
const TIME_EPS_S = 1e-6;
const DIST2_EPS = 1e-6;
const DRIFT: BoatInput = { headingDeg: NaN, speed01: 0 };

export type PtTrialEnd = 'home' | 'sunk' | 'adrift' | 'timeout';

export interface PtTrial {
  /** 終わり方と秒、夜明けの後に帰投した */
  end: PtTrialEnd; timeS: number; afterDawn: boolean;
  /** 隊の KPI（core/pt-state の PtSection と同じ意味）、失った HP、残りの燃料 % */
  detected: boolean; firstDetectM: number; lostContacts: number; passes: number; firedPasses: number; cleanPasses: number; shots: number; hits: number; hpLost: number; fuelPct: number;
  /** 不変の確かめ: 予告から初弾の最短秒、同時に航過中の PT の最大、有効射程・艇の視程の外からの発射、1 回の航過の最大命中、予告から航過の終わりまでの最短秒（v0.6.3 の直し: 一瞬で終わる航過が無い） */
  minWarnS: number; maxPassing: number; beyondEff: number; beyondSight: number; worstPassHits: number; minPassS: number;
  /**
   * 13mm（v0.6.3 実機 1 回目）: 撃った・PT に当てた・撃退・撃沈の数、最初に見つかったのが閃光、視程か射程の外へ撃ったステップ（どれも撃たなければ 0）。
   * 「HP だけでは沈まない」（F11）は数えない（レビュー R4: 沈むのは引火の 1 か所だけで、数えても外れようがない。守りは validator の retreat_hp < hull_hp と tests/pt-damage）
   */
  gunShots: number; gunHits: number; ptRetired: number; ptSunk: number; flashFirst: boolean; gunBeyond: number;
  /** 挟み撃ち: 赤い線の PT の舷が前の赤い線と替わった数と比べた数（2 本目から）・赤い線の間の体感秒の和、待つ PT（hold_off_m の外で待ち始めた）の艇への最接近 m（無ければ Infinity） */
  flankAlt: number; flankPairs: number; commitGapSumS: number; heldMinM: number;
}

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
  const out: PtTrial = {
    end: 'timeout', timeS: 0, afterDawn: false, detected: false, firstDetectM: NaN, lostContacts: 0, passes: 0, firedPasses: 0, cleanPasses: 0, shots: 0, hits: 0, hpLost: 0, fuelPct: 0,
    minWarnS: Infinity, maxPassing: 0, beyondEff: 0, beyondSight: 0, worstPassHits: 0, minPassS: Infinity,
    gunShots: 0, gunHits: 0, ptRetired: 0, ptSunk: 0, flashFirst: false, gunBeyond: 0, flankAlt: 0, flankPairs: 0, commitGapSumS: 0, heldMinM: Infinity,
  };
  const departS = pol.nextRange(0, PT_PLAY.departMaxS);
  const speedMps = (k: PtSimSpeed): number => (k === 'silent' ? s.boat.silentMaxMps : k === 'cruise' ? s.boat.speedCruiseMps : Infinity);
  let t = 0;
  let sinking = false;
  let atHome = false;
  let band: SpeedStep = 'stop';
  /** 台本の覚え: 反応を待つ PT と時刻、転舵の終わりと針路、火災を消す時刻、止まった秒、縁へ逃げた、前の赤い線の舷（0 は無し）と時刻 */
  const m = { reactBoat: -1, reactAt: NaN, dodgeUntil: -1, dodgeDeg: 0, fireOutAt: NaN, stopUsedS: 0, fled: false, flank: 0, commitT: NaN };
  const ev: PtEvents = {
    onContact: () => {}, onLeave: () => {}, onOut: () => {},
    onPassEnd: () => {
      out.minPassS = Math.min(out.minPassS, c.timeS - q.commitAtS);
    },
    // 赤い線: 反応の秒は毎回引く（台本どうしで同じ乱数の列）。late_turn は決まった秒。舷（commitPass の ownerFlank）が前の赤い線と替わったか
    onCommit: (i) => {
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
    onHit: (i, gi) => {
      hitPt(q, p, i, g!.groups[gi]!.damage, gunRng.next(), ev);
    },
    onMiss: () => {},
  };
  /** 待つ PT ごと: 0 待っていない、1 hold_off_m の外で待ち始めた（最接近を測る）、2 内で待ち始めた */
  const heldFrom = new Uint8Array(q.boats.length);
  let heldMin2 = Infinity;
  while (t < SIM_MAX_S - TIME_EPS_S) {
    // 台本（毎フレームの入力に当たる。固定ステップの前）。t0 はこのステップの始まり。速さは kt で決める（HUD の表示。機関損傷で全速が落ちても静音は 14 kt）
    const t0 = t;
    let hd = bearingDeg(boat.x, boat.y, s.ring.x, s.ring.y);
    let want = t0 < departS || (policy === 'stop_dawn' && !c.dawn) ? 0 : speedMps(sp.base);
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
        const brg = bearingDeg(boat.x, boat.y, b.x, b.y);
        const r = wrapDeg360(brg + 90);
        const l = wrapDeg360(brg - 90);
        hd = Math.abs(wrapDeg180(r - boat.headingDeg)) <= Math.abs(wrapDeg180(l - boat.headingDeg)) ? r : l;
        want = sp.stance === 'stop' ? 0 : speedMps('silent');
      }
    }
    if (sp.dodge !== 'none' && m.reactBoat >= 0 && t0 >= m.reactAt - TIME_EPS_S) {
      // 赤い線（固めた針路 lockDeg を PT から引いた線）のどちら側にいるかを見て、線から離れる直角へ（meet は PT へ向かう）
      const b = q.boats[m.reactBoat]!;
      const toward = sp.dodge === 'toward';
      m.dodgeDeg = toward ? bearingDeg(boat.x, boat.y, b.x, b.y) : wrapDeg360(b.lockDeg + targetSide(b.lockDeg, b.x, b.y, boat.x, boat.y) * PT_PLAY.dodgeDeg);
      m.dodgeUntil = t0 + (toward ? PT_PLAY.meetHoldS : PT_PLAY.dodgeHoldS);
      m.reactBoat = -1;
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
    // 計測（航過中の数・1 回の航過の命中。後から落ちた弾は core が最後の航過に数える）、待つ PT の最接近（hold_off_m の外で待ち始めた PT だけ。平方根は最後に 1 回）
    let passing = 0;
    for (let i = 0; i < q.boats.length; i++) {
      const b = q.boats[i]!;
      if (b.phase === PT_PASS) passing++;
      if (q.held[i] === 1 && b.phase === PT_RUN_IN) {
        const d2 = (b.x - boat.x) * (b.x - boat.x) + (b.y - boat.y) * (b.y - boat.y);
        if (heldFrom[i] === 0) heldFrom[i] = d2 > p.holdOff2 ? 1 : 2;
        if (heldFrom[i] === 1 && d2 < heldMin2) heldMin2 = d2;
      } else heldFrom[i] = 0;
    }
    out.maxPassing = Math.max(out.maxPassing, passing);
    out.worstPassHits = Math.max(out.worstPassHits, q.owner >= 0 ? q.passHits : 0, q.lastPassHits);
    out.end = sinking ? 'sunk' : atHome ? 'home' : fuel.empty && band === 'stop' ? 'adrift' : 'timeout';
    if (out.end !== 'timeout') break;
  }
  Object.assign(out, {
    timeS: t, afterDawn: out.end === 'home' && c.dawn, detected: !Number.isNaN(q.firstDetectM), firstDetectM: q.firstDetectM, lostContacts: q.lostContacts,
    passes: q.passes, firedPasses: q.firedPasses, cleanPasses: q.cleanPasses, shots: q.shots, hits: q.hits, minWarnS: q.minWarnS,
    hpLost: sinking ? s.damage.maxHp : s.damage.maxHp - d.hp, fuelPct: (fuel.gal / s.fuelGal) * 100,
    gunShots: gun ? gun.battery.shots : 0, gunHits: q.gunHits, ptRetired: q.retired, ptSunk: q.sunk, flashFirst: q.flashFirst, heldMinM: Math.sqrt(heldMin2),
  });
  return out;
}
