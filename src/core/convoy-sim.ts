// 味方の大発を守る模擬（v0.6.4。jp_01「夜の輸送護衛」。docs/02 §6.4、spec §F）: core/pt-pass-sim の runPtTrial と同じ固定ステップ・同じ順（夜明けのラッチ → 艇 → 燃料 → 輪 → 輸送隊 → 速力帯 → 発見距離 →
// 25mm → 標的（閃光の記憶）→ 閃光（自艇が標的のときだけ）→ 米PT → 火災）で、輸送隊（core/convoy）と米PT の標的スロット（core/pt-target）を足す。本物の stepPtSection・stepBoat・燃料・被害・stepPtGun/hitPt を使う。
// 乱数: 今夜 seed+16（rollNight。world-setup と同じ: 米PT の隊のずれと大発の先頭のずれを同じ夜から）、米PT seed+18、25mm seed+20（撃つ台本だけ）、台本 seed×7919+1000（出発の遅れ・赤い線への反応の秒）。
// 終わり: 沈没・漂流・輪に入った瞬間（台本を問わず。core/mission-flow の decideMissionEnd と同じ: jp_01 は魚雷を撃たないので輪に入れば即 returned。その瞬間の上陸数＝Result）・400 秒（打ち切り。不変で 0）。
// 台本は core/convoy-sim-policy、n 夜の集計は core/convoy-sim-cell（pt-sim-cell と同じ分け方。300 行を超えないため）。Phaser 非依存。確保は 1 夜の始めだけ。
import { clampToBounds, nextSpeedBand, setPerformance, stepBoat, type BoatInput, type BoatParams, type BoatState, type SpeedStep } from './boat-motion';
import { CV_ARRIVED, convoyResolved, createConvoy, hitConvoyBarge, stepConvoy, type ConvoyEvents, type ConvoyParams } from './convoy';
import { convoyParamsAtNight } from './convoy-data';
import { CONVOY_POLICY_SPECS, convoySteer, type ConvoyPolicy, type ConvoySteer, type ConvoySteerCtx } from './convoy-sim-policy';
import { crewAccelFactor, crewLost, crewTurnFactor } from './crew';
import { dawnReached } from './dawn-air';
import { createFuelState, stepFuel } from './fuel';
import type { GunEvents } from './gun-battery';
import { applyShellHit, createDamageState, stepDamage, type HitOutcome } from './gunnery';
import { insideRing } from './mission-flow';
import { fixedNight, rollNight } from './night';
import { PT_GUN_SEED_OFFSET, PT_PASS, PT_SEED_OFFSET, createPtSection, ptFighting, stepPtSection, type PtCheck, type PtEvents, type PtHull } from './pt-boats';
import { hitPt } from './pt-damage';
import { ptParamsAtNight, type PtParams } from './pt-data';
import { createPtGun, stepPtGun } from './pt-gun';
import { targetSide } from './pt-pass';
import type { PtSimSetup } from './pt-pass-sim';
import { PT_PLAY, PT_POLICY_SEED_ADD, PT_POLICY_SEED_MUL } from './pt-sim-policy';
import { applyPtTarget, createPtTargetSet, pickPtTarget, ptContactFlashM, ptHeldFlashM, type PtTargetRule } from './pt-target';
import { SeededRng } from './rng';
import { bearingDeg } from './ship-ai';
import { wrapDeg360 } from './units';
import { enemyDetectRangeM, speedFactorForBand } from './visibility';

export interface ConvoySimSetup extends PtSimSetup {
  /** 輸送隊（今夜の揺らぎの前。world-setup の convoy.params）、大発が見つかる速力帯、米PT の標的の規則（閃光の記憶の秒もここ） */
  convoy: ConvoyParams;
  detectBand: SpeedStep;
  rule: PtTargetRule;
}

export interface ConvoyTrial {
  /** 終わり方と秒、夜明けの後に帰投した */
  end: 'home' | 'sunk' | 'adrift' | 'timeout'; timeS: number; afterDawn: boolean;
  /** 上陸・沈んだ大発・大発への命中・自艇への命中・失った HP・残りの燃料 % */
  arrived: number; bargesSunk: number; bargeHits: number; playerHits: number; hpLost: number; fuelPct: number;
  /** 見つかった（秒）・最初の標的が大発・大発への航過・自艇への航過・連射（自艇・大発。大発は不変で 0）・標的が替わった回数 */
  detected: boolean; detectS: number; firstTargetBarge: boolean; passesBarge: number; passesPlayer: number; burstsPlayer: number; burstsBarge: number; switches: number;
  /** 25mm: 発射・命中・撃退・撃沈・制圧 */
  gunShots: number; gunHits: number; ptRetired: number; ptSunk: number; suppressions: number;
  /** 不変の確かめ: 予告から初弾の最短秒、同時に航過中の最大、有効射程・標的の視程の外からの発射、自艇の視程の外からの発射（大発への掃射で起きる）、1 回の攻撃の最大命中（大発・自艇）、健全な大発が 1 回の航過で沈んだ数 */
  minWarnS: number; maxPassing: number; beyondEff: number; beyondSight: number; beyondPlayerSight: number; worstBargePassHits: number; worstPlayerPassHits: number; singlePassKills: number;
  /** 決着（みな上陸か沈没）の秒（NaN は無し）・夜明けの後の決着・機関損傷 */
  resolvedS: number; resolvedAfterDawn: boolean; engineHit: boolean;
}

const SIM_MAX_S = 400;
const TIME_EPS_S = 1e-6;
const DRIFT: BoatInput = { headingDeg: NaN, speed01: 0 };
/** 転舵を延ばすステップ数（線が消えた次のステップで終わる。pt-pass-sim の hold と同じ） */
const HOLD_EXTEND_STEPS = 1.5;

/** seed の夜: 米PT（pt-pass-sim の ptNightParams と同じ乱数）と輸送隊の先頭のずれ（同じ rollNight の bargeLeadDx。world-setup の applyConvoyNight と同じ式） */
export function convoyNight(s: ConvoySimSetup, seed: number): { pt: PtParams; convoy: ConvoyParams } {
  const n = s.night ? rollNight(s.night, (id) => s.hazardShares[id] ?? 0, seed, s.nightEnemyRolls, s.nightBatteries) : fixedNight(s.nightEnemyRolls, s.nightBatteries);
  const o = n.enemyOffsets[0]!;
  return { pt: ptParamsAtNight(s.pt, o.dx, o.dy, n.mirrored), convoy: convoyParamsAtNight(s.convoy, n.bargeLeadDx, n.mirrored, s.pt.bounds.width) };
}

/** 1 夜。艇は出発点で止まっていて、出発の遅れの後に台本どおり動く */
export function runConvoyTrial(s: ConvoySimSetup, policy: ConvoyPolicy, seed: number): ConvoyTrial {
  const sp = CONVOY_POLICY_SPECS[policy];
  if (sp.shoot && !s.gun) throw new Error(`遊び方 ${policy} は撃つが、この任務の艇に砲（guns）が無い`);
  const { pt: p, convoy: cp } = convoyNight(s, seed);
  const q = createPtSection(p, s.shellPoolSize);
  const f = createConvoy(cp);
  const rng = new SeededRng((seed + PT_SEED_OFFSET) >>> 0);
  const gunRng = new SeededRng((seed + PT_GUN_SEED_OFFSET) >>> 0);
  const pol = new SeededRng((seed * PT_POLICY_SEED_MUL + PT_POLICY_SEED_ADD) >>> 0);
  const bp: BoatParams = { ...s.boat };
  const boat: BoatState = { x: s.start.x, y: s.start.y, headingDeg: s.start.headingDeg, speedMps: 0 };
  const d = createDamageState(s.damage);
  const fuel = createFuelState(s.fuelGal);
  const hit: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
  const input: BoatInput = { headingDeg: NaN, speed01: 0 };
  // 船体: [0] 自艇、[1..] 大発（valid は毎ステップ書く）。大発の発見距離は帯で 1 回
  const hulls: PtHull[] = [{ boat, halfLengthM: s.halfLengthM, halfBeamM: s.halfBeamM, valid: true }];
  for (const b of f.barges) hulls.push({ boat: b, halfLengthM: cp.halfLengthM, halfBeamM: cp.halfBeamM, valid: true });
  const ts = createPtTargetSet(hulls);
  const bargeDetectM = enemyDetectRangeM(p.baseDetectM, speedFactorForBand(s.detectBand, s.vis.speedFactor), s.vis, false);
  for (let k = 1; k < hulls.length; k++) ts.detectM[k] = bargeDetectM;
  const c: PtCheck = { boat, boatHalfLengthM: s.halfLengthM, boatHalfBeamM: s.halfBeamM, detectOpenM: 0, smokeFactor: s.vis.smokeFactor, smoke: null, smokeParams: null, targetValid: true, visRange2: s.visRange2, dawn: false, timeS: 0, targets: hulls, flashX: boat.x, flashY: boat.y };
  const realDt = s.stepS;
  const dt = realDt * s.timeScale;
  const eff2 = p.gun.effectiveM * p.gun.effectiveM;
  const out: ConvoyTrial = {
    end: 'timeout', timeS: 0, afterDawn: false, arrived: 0, bargesSunk: 0, bargeHits: 0, playerHits: 0, hpLost: 0, fuelPct: 0,
    detected: false, detectS: NaN, firstTargetBarge: false, passesBarge: 0, passesPlayer: 0, burstsPlayer: 0, burstsBarge: 0, switches: 0,
    gunShots: 0, gunHits: 0, ptRetired: 0, ptSunk: 0, suppressions: 0,
    minWarnS: Infinity, maxPassing: 0, beyondEff: 0, beyondSight: 0, beyondPlayerSight: 0, worstBargePassHits: 0, worstPlayerPassHits: 0, singlePassKills: 0,
    resolvedS: NaN, resolvedAfterDawn: false, engineHit: false,
  };
  let t = 0;
  let sinking = false;
  let atHome = false;
  let band: SpeedStep = 'stop';
  let curPassTarget = 0;
  let passHitsCur = 0;
  let lastFireS = -Infinity;
  /** 固めたときの大発ごとの命中（健全な大発が 1 回の航過で沈んだ数）。台本の覚え: 反応を待つ PT と時刻、転舵の終わりと針路・その PT、火災を消す時刻、囮が見つかって帰る */
  const hitsAtCommit = new Int32Array(hulls.length);
  const m = { reactBoat: -1, reactAt: NaN, dodgeUntil: -1, dodgeDeg: 0, dodgeBoat: -1, fireOutAt: NaN, fled: false };
  const departS = pol.nextRange(0, PT_PLAY.departMaxS);
  const cev: ConvoyEvents = { onArrived: () => {}, onSunk: () => {} };
  const ev: PtEvents = {
    onContact: (gained) => {
      if (gained && Number.isNaN(out.detectS)) {
        out.detectS = t;
        out.firstTargetBarge = ts.current > 0;
      }
    },
    onLeave: () => {}, onOut: () => {},
    // 赤い線: 標的（自艇か大発）と連射かで数え、反応の秒を引く（台本どうしで同じ乱数の列）
    onCommit: (i) => {
      curPassTarget = ts.current;
      passHitsCur = 0;
      for (let k = 1; k < hulls.length; k++) hitsAtCommit[k] = f.barges[k - 1]!.hits;
      if (q.boats[i]!.burst) {
        if (ts.current === 0) out.burstsPlayer++;
        else out.burstsBarge++;
      } else if (ts.current === 0) out.passesPlayer++;
      else out.passesBarge++;
      m.reactBoat = i;
      m.reactAt = t + pol.nextRange(PT_PLAY.reactMinS, PT_PLAY.reactMaxS);
    },
    onPassEnd: () => {
      if (curPassTarget === 0) out.worstPlayerPassHits = Math.max(out.worstPlayerPassHits, passHitsCur);
      else out.worstBargePassHits = Math.max(out.worstBargePassHits, passHitsCur);
    },
    // 射程・視程は標的から（core/pt-fire と同じ基準）。自艇の視程の外からの発射は標的が大発のときに起きる（見捨てた艇が遠くの掃射を見る絵）
    onFire: (_i, x, y) => {
      const tb = c.boat;
      const d2 = (tb.x - x) * (tb.x - x) + (tb.y - y) * (tb.y - y);
      if (d2 > eff2) out.beyondEff++;
      if (d2 > c.visRange2) out.beyondSight++;
      if ((boat.x - x) * (boat.x - x) + (boat.y - y) * (boat.y - y) > c.visRange2) out.beyondPlayerSight++;
    },
    // 命中: 自艇は世界の hitBoat と同じ（seed+18 で火災・機関。沈み始めたら残りの弾は外れ）、大発は HP だけ（乱数を引かない）。沈んだ同じステップで valid を落とす（残りの弾が当たらない）
    onImpact: (_x, _y, h, hull) => {
      if (!h) return;
      passHitsCur++;
      if (hull === undefined || hull === 0) {
        if (sinking) return;
        out.playerHits++;
        applyShellHit(d, p.hit, s.damage, rng, hit);
        if (hit.startedFire) m.fireOutAt = t + PT_PLAY.fireOutS;
        if (hit.engineHit) {
          out.engineHit = true;
          bp.speedMaxMps = s.boat.speedMaxMps * s.damage.engineSpeedFactor;
        }
        bp.speedCruiseMps = Math.min(bp.speedCruiseMps, bp.speedMaxMps);
        if (hit.destroyed) {
          sinking = true;
          hulls[0]!.valid = false;
          if (ts.current === 0) c.targetValid = false;
        }
        return;
      }
      out.bargeHits++;
      if (hitConvoyBarge(f, hull - 1, p.hit.damage, t, cev)) {
        hulls[hull]!.valid = false;
        if (hitsAtCommit[hull] === 0 && q.owner >= 0) out.singlePassKills++;
        if (ts.current === hull) c.targetValid = false;
      }
    },
  };
  // 25mm（撃つ台本だけ。世界の PtSquadron と同じ: 着弾した生きた PT ごとに seed+20 から 1 回引いて hitPt）
  const g = sp.shoot ? s.gun : null;
  const gun = g ? createPtGun(g, s.gunShellPoolSize) : null;
  const range2 = g ? g.rangeM * g.rangeM : 0;
  const gunEv: GunEvents = { onFire: () => {}, onHit: (i, gi) => hitPt(q, p, i, g!.groups[gi]!.damage, gunRng.next(), ev), onMiss: () => {} };
  const steer: ConvoySteer = { headingDeg: NaN, wantMps: 0 };
  const ctx: ConvoySteerCtx = { boat, f, cp, q, ring: s.ring, visRange2: s.visRange2, silentMps: s.boat.silentMaxMps, cruiseMps: s.boat.speedCruiseMps };
  while (t < SIM_MAX_S - TIME_EPS_S) {
    const t0 = t;
    const resolved = convoyResolved(f);
    if (resolved && Number.isNaN(out.resolvedS)) {
      out.resolvedS = t0;
      out.resolvedAfterDawn = c.dawn;
    }
    // 台本（毎フレームの入力に当たる。固定ステップの前）: 出発の遅れの間は止まる
    steer.headingDeg = NaN;
    steer.wantMps = 0;
    m.fled = m.fled || q.detected;
    if (t0 >= departS) convoySteer(sp, ctx, resolved, m.fled, steer);
    // 赤い線への反応（HUD どおり。dodge の台本だけ・自艇が標的のときだけ）: 航過は固めた針路から離れる直角へ全速 4 秒（線の間は延ばす）、連射は PT から離れる向きへ全速
    if (sp.dodge && m.reactBoat >= 0 && t0 >= m.reactAt - TIME_EPS_S) {
      const b = q.boats[m.reactBoat]!;
      if (curPassTarget === 0 && q.owner === m.reactBoat) {
        m.dodgeDeg = b.burst ? bearingDeg(b.x, b.y, boat.x, boat.y) : wrapDeg360(b.lockDeg + targetSide(b.lockDeg, b.x, b.y, boat.x, boat.y) * PT_PLAY.dodgeDeg);
        m.dodgeUntil = t0 + PT_PLAY.dodgeHoldS;
        m.dodgeBoat = m.reactBoat;
      }
      m.reactBoat = -1;
    }
    if (sp.dodge && m.dodgeBoat >= 0 && q.owner === m.dodgeBoat && t0 < m.dodgeUntil + realDt && !q.boats[m.dodgeBoat]!.burst) m.dodgeUntil = t0 + HOLD_EXTEND_STEPS * realDt;
    if (t0 < m.dodgeUntil - TIME_EPS_S) {
      steer.headingDeg = m.dodgeDeg;
      steer.wantMps = Infinity;
    }
    // 射撃ボタン: 射程と視程の内に戦う PT がいる間 押す
    let held = false;
    if (sp.shoot) {
      for (let i = 0; i < q.boats.length && !held; i++) {
        const b = q.boats[i]!;
        const d2 = (b.x - boat.x) * (b.x - boat.x) + (b.y - boat.y) * (b.y - boat.y);
        held = ptFighting(b.phase) && d2 <= range2 && d2 <= s.visRange2;
      }
    }
    input.headingDeg = steer.headingDeg;
    input.speed01 = steer.wantMps > 0 ? Math.min(1, steer.wantMps / bp.speedMaxMps) : 0;
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
    // 輸送隊（僚艇の位置）: 上陸した大発は的でなくなる（標的なら攻撃は撃たずに終わる）
    const arrivedBefore = f.arrived;
    stepConvoy(f, cp, dt, cev);
    if (f.arrived !== arrivedBefore) {
      for (let k = 1; k < hulls.length; k++) {
        if (f.barges[k - 1]!.phase === CV_ARRIVED && hulls[k]!.valid) {
          hulls[k]!.valid = false;
          if (ts.current === k) c.targetValid = false;
        }
      }
    }
    band = nextSpeedBand(band, boat.speedMps, bp);
    ts.detectM[0] = enemyDetectRangeM(p.baseDetectM, speedFactorForBand(band, s.vis.speedFactor), s.vis, false);
    hulls[0]!.valid = !sinking && !atHome;
    c.timeS = t;
    // 25mm → 標的の選択（閃光の記憶）・差し替え → 接触の閃光（自艇が標的のときだけ）→ 米PT（世界の PtSquadron.step と同じ順）
    let flashM = 0;
    let heldFlashM = 0;
    if (gun && g) {
      stepPtGun(gun, g, boat, band, held, hulls[0]!.valid, q, p, s.visRange2, gunRng, realDt, dt, gunEv);
      if (gun.battery.fired) lastFireS = t;
      flashM = gun.battery.fired ? g.flashRevealM : 0;
      heldFlashM = ptHeldFlashM(t, lastFireS, s.rule.flashHoldS, g.flashRevealM);
    }
    c.flashX = boat.x;
    c.flashY = boat.y;
    applyPtTarget(q, c, ts, pickPtTarget(q, ts, heldFlashM, s.rule, t), t);
    c.flashM = ptContactFlashM(ts.current, flashM);
    stepPtSection(q, p, c, rng, realDt, dt, ev);
    if (!sinking && stepDamage(d, s.damage, realDt)) {
      sinking = true;
      hulls[0]!.valid = false;
    }
    let passing = 0;
    for (let i = 0; i < q.boats.length; i++) if (q.boats[i]!.phase === PT_PASS) passing++;
    if (passing > out.maxPassing) out.maxPassing = passing;
    out.end = sinking ? 'sunk' : atHome ? 'home' : fuel.empty && band === 'stop' ? 'adrift' : 'timeout';
    if (out.end !== 'timeout') break;
  }
  Object.assign(out, {
    timeS: t, afterDawn: out.end === 'home' && c.dawn, arrived: f.arrived, bargesSunk: f.sunk, detected: !Number.isNaN(out.detectS), switches: ts.switches,
    hpLost: sinking ? s.damage.maxHp : s.damage.maxHp - d.hp, fuelPct: (fuel.gal / s.fuelGal) * 100,
    gunShots: gun ? gun.battery.shots : 0, gunHits: q.gunHits, ptRetired: q.retired, ptSunk: q.sunk, suppressions: q.suppressions, minWarnS: q.minWarnS,
  });
  return out;
}
