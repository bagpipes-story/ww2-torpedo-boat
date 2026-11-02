// 停泊して揚陸する味方の輸送船を米PT の雷撃から守る模擬（v0.6.9 S3。jp_04「多号作戦・オルモック湾へ」。docs/02 §6.11、spec-v069 §4.1・§6 S3・§8・R1・R2・R4）。
// core/pt-pass-sim の runPtTrial と同じ固定ステップ・同じ順（夜明けのラッチ → 乗員 → 艇 → 燃料 → 輪 → 速力帯 → 発見距離 → 25mm → 閃光 → 米PT → 火災）に、spec §4.1 の
// 米PT の段の直後の 3 つ（stepPtTorpedoes（seed+26）→ 敵の魚雷のプール（core/landing-torpedoes の写し。終わり際の当たりなし）→ tickLanding）を足す。本物の stepPtSection・stepBoat・
// 燃料・被害・stepPtGun/hitPt（25mm は seed+20。撃つ台本だけ作る）を使う。米PT は標的スロットなし（jp_05 の形: 撃つのは自艇だけ）。
// 乱数: 今夜 seed+16（rollNight。world-setup と同じ）、米PT seed+18、25mm seed+20、雷撃 seed+26（斉射のときだけ引く。数えて I5 を確かめる）、台本 seed×7919+1000（出発の遅れ・赤い線への反応）、
// 人の乱れ seed×7907+31337（v0.6.9 実機 1 回目。human・human_face だけが引く: 最初の報告への遅れ → 赤い線ごとに台本の列の後で反応の足しとかわすか。ほかの遊び方は作るだけで引かない）。
// 終わり: 自艇の沈没・漂流（燃料 0 で止まった）・揚陸の決着の後に輪の中（世界の returned。R14 A5 の (b): 決着の前に輪に入っても終わらず輪の中で待つ＝世界の mission-end の landingHold。
// 輪の中は漂流にもしない。決着の前に輪に入った夜は R4 の列で数える）・夜明け + LANDING_SIM_AFTER_DAWN_S（打ち切り。夜明けの空襲は模擬しない）。
// 測るだけの影のプール: 撃った魚雷をそのまま、いつも浮いている同じ船体へ走らせる（斉射の「当たりうる」本数。沈んだ後に着いた魚雷も数える＝TABLE=2 と R2 の期待値の材料）。乱数を引かず世界に触らない。
// 台本は core/landing-sim-policy、1 夜の記録は core/landing-trial、集計は core/landing-sim-cell（convoy-sim と同じ分け方）。Phaser 非依存。確保は 1 夜の始めだけ。省いたもの: 命中スロー・消火の長押し・漂流の待ち。
// v0.6.10 S3a（spec-v0610 R-U6・§6.1）: 味方の駆逐艦 卯月（s.allyDestroyer＝jp_04 で allyOff でなければ。core/ally-destroyer）を雷撃の直後・敵の魚雷のプールの前に回す（世界の world-landing と同じ順）。
// 見張り seed+27・砲 seed+28（数えて I7・I10）、照らされた斉射は同じ入れ先（LE_LIT_SALVO）・撃たずに去るは onLitAway。I8 は照らされた斉射の条件、I11 は owner の PT がいつも航過（卯月がいなくても数える）。
import { ALLY_GUN_SEED_OFFSET, ALLY_LOOKOUT_SEED_OFFSET, createAllyDestroyer, stepAllyDestroyer, type AllyLink } from './ally-destroyer';
import type { AllyDestroyerParams } from './ally-destroyer-data';
import { clampToBounds, nextSpeedBand, setPerformance, stepBoat, type BoatInput, type BoatParams, type BoatState, type SpeedStep } from './boat-motion';
import { crewAccelFactor, crewLost, crewTurnFactor } from './crew';
import { dawnReached } from './dawn-air';
import { createFuelState, stepFuel } from './fuel';
import type { GunEvents } from './gun-battery';
import { applyShellHit, createDamageState, stepDamage, type HitOutcome } from './gunnery';
import { LANDING_FIRE_LINE_EXTRA_M, LANDING_REPORT_NEAR, LD_UNLOADING, createLanding, createLandingReport, landingFireLine, landingReport, landingResolved, tickLanding } from './landing';
import type { LandingParams } from './landing-data';
import {
  LANDING_HUMAN, LANDING_HUMAN_SEED_ADD, LANDING_HUMAN_SEED_MUL, LANDING_POLICY_SPECS, humanGunOn, humanReactAt, humanSeesReport, landingGunHeld, landingPlayPoints, landingSteer,
  type LandingHumanPlay, type LandingPolicy, type LandingSteer, type LandingSteerCtx,
} from './landing-sim-policy';
import { LandingTrialTorpedoes, LandingTrialWatch, createLandingTrial, finishLandingAlly, finishLandingTrial, type LandingTrial } from './landing-trial';
import { insideRing } from './mission-flow';
import { PT_GUN_SEED_OFFSET, PT_PASS, PT_PATROL, PT_SEED_OFFSET, createPtSection, stepPtSection, type PtCheck, type PtEvents } from './pt-boats';
import { hitPt } from './pt-damage';
import { createPtGun, stepPtGun } from './pt-gun';
import { targetSide } from './pt-pass';
import { ptNightParams, type PtSimSetup } from './pt-pass-sim';
import { PT_PLAY, PT_POLICY_SEED_ADD, PT_POLICY_SEED_MUL } from './pt-sim-policy';
import { PT_TORPEDO_SEED_OFFSET, createPtTorpedoState, ptTorpedoOutcome, stepPtTorpedoes } from './pt-torpedo';
import type { PtTorpedoParams } from './pt-torpedo-data';
import { SeededRng } from './rng';
import type { TorpedoTarget } from './torpedo-targets';
import { wrapDeg360 } from './units';
import { enemyDetectRangeM, speedFactorForBand } from './visibility';

export type { LandingTrial } from './landing-trial';
export { OUT_CALM, OUT_DAWN, OUT_ENGAGED, OUT_GOAL_GONE, OUT_HURRIED, OUT_LEFT, OUT_NONE, OUT_RETIRED, OUT_SUNK, PT_SALVO_CALM, PT_SALVO_ENGAGED, PT_SALVO_HURRIED } from './pt-torpedo';

export interface LandingSimSetup extends PtSimSetup {
  /** 揚陸（world-setup の landing.params）と米PT の雷撃（landing.torpedo）。米PT・艇・燃料・視界・帰投の輪は PtSimSetup（systems/pt-pass-sim-setup の ptSimSetup） */
  landing: LandingParams;
  torpedo: PtTorpedoParams;
  /** 味方の駆逐艦 卯月（v0.6.10。world-setup の allyDestroyer＝jp_04 だけ。allyOff・ALLY_OFF=1 では鍵ごと無い＝S0b と同じ夜） */
  allyDestroyer?: AllyDestroyerParams;
}

/** 夜明けの後の打ち切りの実秒（spec §6 S3: dawn + 40 s）、時刻の比較の丸めの余裕、赤い線の転舵を延ばすステップ数（convoy-sim と同じ）、終わった後に影の魚雷を走らせる上限のステップ */
export const LANDING_SIM_AFTER_DAWN_S = 40;
const TIME_EPS_S = 1e-6;
const HOLD_EXTEND_STEPS = 1.5;
const SHADOW_MAX_STEPS = 60 * 120;
const DRIFT: BoatInput = { headingDeg: NaN, speed01: 0 };
const NO_HULLS: readonly TorpedoTarget[] = [];
/** 外から去らせた PT の知らせ（jp_04 は標的スロットが無いので何もしない＝世界の targets?.onLeave） */
const NO_LEAVE = (): void => {};

/** next() を数える seed+26（I5。SeededRng と同じ列） */
class CountingRng extends SeededRng {
  draws = 0;
  override next(): number {
    this.draws++;
    return super.next();
  }
}

/** 1 夜。艇は出発点で止まっていて、出発の遅れの後に台本どおり動く。hp は人の遅れと乱れ（human・human_face だけが読む） */
export function runLandingTrial(s: LandingSimSetup, policy: LandingPolicy, seed: number, hp: Readonly<LandingHumanPlay> = LANDING_HUMAN): LandingTrial {
  const sp = LANDING_POLICY_SPECS[policy];
  if (sp.shoot !== 'none' && !s.gun) throw new Error(`遊び方 ${policy} は撃つが、この任務の艇に砲（guns）が無い`);
  const p = ptNightParams(s, seed);
  const lp = s.landing;
  const tp = s.torpedo;
  const q = createPtSection(p, s.shellPoolSize);
  const ld = createLanding(lp);
  const st = createPtTorpedoState(p.count, tp.n);
  const rng = new SeededRng((seed + PT_SEED_OFFSET) >>> 0);
  const gunRng = new SeededRng((seed + PT_GUN_SEED_OFFSET) >>> 0);
  const trng = new CountingRng((seed + PT_TORPEDO_SEED_OFFSET) >>> 0);
  const pol = new SeededRng((seed * PT_POLICY_SEED_MUL + PT_POLICY_SEED_ADD) >>> 0);
  // 卯月（いる夜だけ。見張り seed+27・砲 seed+28 はほかの系列に触らない。演出なし）
  const a27 = new CountingRng((seed + ALLY_LOOKOUT_SEED_OFFSET) >>> 0);
  const a28 = new CountingRng((seed + ALLY_GUN_SEED_OFFSET) >>> 0);
  const ally = s.allyDestroyer ? createAllyDestroyer(s.allyDestroyer, p, a27, a28, null) : null;
  const bp: BoatParams = { ...s.boat };
  const boat: BoatState = { x: s.start.x, y: s.start.y, headingDeg: s.start.headingDeg, speedMps: 0 };
  const d = createDamageState(s.damage);
  const fuel = createFuelState(s.fuelGal);
  const hit: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
  const input: BoatInput = { headingDeg: NaN, speed01: 0 };
  const c: PtCheck = { boat, boatHalfLengthM: s.halfLengthM, boatHalfBeamM: s.halfBeamM, detectOpenM: 0, smokeFactor: s.vis.smokeFactor, smoke: null, smokeParams: null, targetValid: true, visRange2: s.visRange2, dawn: false, timeS: 0 };
  const realDt = s.stepS;
  const dt = realDt * s.timeScale;
  const out = createLandingTrial(p.count);
  let t = 0;
  let sinking = false;
  let atHome = false;
  let band: SpeedStep = 'stop';
  const m = { reactBoat: -1, reactAt: NaN, dodgeUntil: -1, dodgeDeg: 0, dodgeBoat: -1, fireOutAt: NaN };
  const departS = pol.nextRange(0, PT_PLAY.departMaxS);
  // 人の遅れと乱れ（human・human_face）: 最初の報告に反応するまでの遅れは 1 夜に 1 回
  const human = sp.human === true;
  const hr = new SeededRng((seed * LANDING_HUMAN_SEED_MUL + LANDING_HUMAN_SEED_ADD) >>> 0);
  const delayS = human ? hr.nextRange(hp.delayMinS, hp.delayMaxS) : 0;
  const ev: PtEvents = {
    onContact: (gained) => {
      if (!gained) return;
      out.contacts++;
      if (Number.isNaN(out.detectS)) out.detectS = t;
    },
    onLeave: () => {}, onOut: () => {}, onPassEnd: () => {}, onFire: () => {},
    // 赤い線: 反応の秒は毎回引く（台本どうしで同じ乱数の列。pt-pass-sim・convoy-sim と同じ）。人は台本の列の後に人の乱れから反応の足し → かわすか（かわさない線は覚えない）
    onCommit: (i) => {
      const at = t + pol.nextRange(PT_PLAY.reactMinS, PT_PLAY.reactMaxS);
      const reactAt = human ? humanReactAt(at, hp, hr) : at;
      if (Number.isNaN(reactAt)) return;
      m.reactBoat = i;
      m.reactAt = reactAt;
    },
    // 命中は世界の hitBoat と同じ（seed+18 で火災・機関、沈み始めたら残りの弾は外れ）
    onImpact: (_x, _y, h) => {
      if (!h || sinking) return;
      out.playerHits++;
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
  // 25mm（撃つ台本だけ。世界の PtSquadron と同じ: 着弾した生きた PT ごとに seed+20 から 1 回引いて hitPt）
  const g = sp.shoot !== 'none' ? s.gun : null;
  const gun = g ? createPtGun(g, s.gunShellPoolSize) : null;
  const gunEv: GunEvents = { onFire: () => {}, onHit: (i, gi) => hitPt(q, p, i, g!.groups[gi]!.damage, gunRng.next(), ev), onMiss: () => {} };
  // 敵の魚雷（世界と同じプールの写し・LandingTorpedoLink・測るだけの影）と PT ごとの見張り・斉射の記録（core/landing-trial）
  const tor = new LandingTrialTorpedoes(ld, lp, st, tp.torpedo, p.count * tp.n, p.bounds, out);
  const watch = new LandingTrialWatch(p.count);
  if (s.allyDestroyer) tor.watchAlly(s.allyDestroyer.x, s.allyDestroyer.y, s.allyDestroyer.lengthM / 2);
  const sink: AllyLink = {
    fire: (i, x, y, h, dud, err, bias, rangeM) => tor.fire(i, x, y, h, dud, err, bias, rangeM),
    onSalvo: (i, kind, rangeM, n) => {
      // I8: 照らされた斉射（litSalvo は斉射の前に立つ。PT はまだ去る前）は夜明けの前・見失いの待ちの外・揚陸中で浮いている・哨戒だけ
      if (st.litSalvo[i] === 1 && (c.dawn || st.holdS[i]! > 0 || ld.phase !== LD_UNLOADING || !ld.afloat || q.boats[i]!.phase !== PT_PATROL)) out.litSalvoBad++;
      tor.link.onSalvo(i, kind, rangeM, n);
      watch.salvo(out, i, kind, rangeM, t, c.dawn);
    },
    onLitAway: (i) => tor.link.onLitAway(i),
  };
  const report = createLandingReport();
  const noReport = createLandingReport();
  const pts = landingPlayPoints(lp, s.start);
  const ctx: LandingSteerCtx = { boat, q, report, start: s.start, anchor: lp, station: pts.station, picket: pts.picket, ring: s.ring, silentMps: s.boat.silentMaxMps, cruiseMps: s.boat.speedCruiseMps, cue: false };
  // 輸送船が射線に入る（R14 A1。lure_cue だけが読む。世界の landing-telemetry と同じ距離: 戦いながらの斉射が無ければ無し）
  const cueM = sp.fight === 'cue' && tp.engagedFactor > 0 ? tp.launchM + LANDING_FIRE_LINE_EXTRA_M : 0;
  const steer: LandingSteer = { headingDeg: NaN, wantMps: 0 };
  const mem = { lured: false };
  for (;;) {
    // 台本（毎フレームの入力に当たる。固定ステップの前。報告は前のステップの終わりの値＝HUD）: 出発の遅れの間は止まる（home_early は t = 0 から。R14 A5）
    const t0 = t;
    const resolved = landingResolved(ld);
    steer.headingDeg = NaN;
    steer.wantMps = 0;
    if (human) ctx.report = humanSeesReport(t0, out.reportS, delayS) ? report : noReport; // 人: 最初の報告から delayS 秒は報告を見ない
    if (t0 >= departS || sp.move === 'home') landingSteer(sp, ctx, resolved, mem, steer);
    // 赤い線への反応（HUD どおり。dodge の台本だけ）: 航過は固めた針路から離れる直角へ全速 4 秒（線の間は延ばす）、連射は針路そのまま（「針路そのまま撃ち返せ」）
    if (sp.dodge && m.reactBoat >= 0 && t0 >= m.reactAt - TIME_EPS_S) {
      const b = q.boats[m.reactBoat]!;
      if (q.owner === m.reactBoat && !b.burst) {
        m.dodgeDeg = wrapDeg360(b.lockDeg + targetSide(b.lockDeg, b.x, b.y, boat.x, boat.y) * PT_PLAY.dodgeDeg);
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
    // 射撃ボタン（人は出撃からの秒の gunCycleS ごとの初めの gunOnS 秒だけ。乱数なし）
    const held = g ? landingGunHeld(sp, ctx, g.rangeM, g.effectiveM, s.visRange2) && (!human || humanGunOn(t0, hp)) : false;
    input.headingDeg = steer.headingDeg;
    input.speed01 = steer.wantMps > 0 ? Math.min(1, steer.wantMps / bp.speedMaxMps) : 0;
    if (t0 >= m.fireOutAt - TIME_EPS_S) {
      d.fireLeftS = 0;
      m.fireOutAt = NaN;
    }
    // 固定ステップ（mission-world の順。spec §4.1）
    t += realDt;
    if (!c.dawn && dawnReached(s.durationS, t)) {
      c.dawn = true;
      out.dawn = true;
      if (!landingResolved(ld)) out.unresolvedAtDawn = true; // I6
    }
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
      // 25mm（浮いていて輪の外だけ撃つ）→ 撃ったステップは閃光の距離で見つかる（世界の PtSquadron.step と同じ順）
      stepPtGun(gun, g, boat, band, held, c.targetValid, q, p, s.visRange2, gunRng, realDt, dt, gunEv);
      c.flashM = gun.battery.fired ? g.flashRevealM : 0;
    }
    stepPtSection(q, p, c, rng, realDt, dt, ev);
    watch.afterSection(q, st.prevPhase, t);
    // spec §4.1 の 3 つ: 時計（世界の world-landing と同じく雷撃の前に書く。R14 A3）→ 雷撃（seed+26）→ 敵の魚雷（沈み始めた輸送船は狙わない）→ 揚陸の時計。影のプールは測るだけ
    tor.link.nowS = t;
    stepPtTorpedoes(st, tp, q, ld, trng, c.dawn, t, realDt, sink, NO_LEAVE);
    if (ally) stepAllyDestroyer(ally, q, st, tp, ld, trng, c.dawn, t, realDt, dt, sink, ev, NO_LEAVE); // 卯月（R-U6: 雷撃の後・敵の魚雷の前）
    if (q.owner >= 0 && q.boats[q.owner]!.phase !== PT_PASS) out.ownerViol++; // I11
    tor.pool.step(dt, realDt, ld.out ? NO_HULLS : tor.shipHulls, lp.passRadius2, tor.ev);
    tor.shadow.step(dt, realDt, tor.shadowHulls, lp.passRadius2, tor.shadowEv);
    tickLanding(ld, lp, t);
    if (!sinking && stepDamage(d, s.damage, realDt)) sinking = true;
    // 計測: 決着の秒・決着の前の「燃料少」（R4）・報告（次のステップの台本が読む）・PT ごとの報告の条件（I1）
    const res = landingResolved(ld);
    if (res && Number.isNaN(out.resolvedS)) out.resolvedS = t;
    if (!res && Number.isNaN(out.fuelCallS)) {
      const edge = Math.max(0, Math.hypot(boat.x - s.ring.x, boat.y - s.ring.y) - s.ring.radiusM);
      if (fuel.gal <= edge * s.fuel.galPerMCruise * s.ring.callMargin) out.fuelCallS = t;
    }
    landingReport(ld, lp, q, st, report);
    if (report.sub > 0 && Number.isNaN(out.reportS)) out.reportS = t;
    if (report.sub === LANDING_REPORT_NEAR && Number.isNaN(out.nearReportS)) out.nearReportS = t;
    if (cueM > 0) ctx.cue = landingFireLine(ld, q, st.left, cueM * cueM) >= 0;
    watch.endStep(q, st.left, lp, t);
    if (atHome && !res) out.ringEarly = true; // R4: 決着の前に輪に入った（R14 A5: 終わらずに待つ）
    out.end = sinking ? 'sunk' : atHome ? (res ? 'home' : 'timeout') : fuel.empty && band === 'stop' ? 'adrift' : 'timeout';
    if (out.end !== 'timeout' || t >= s.durationS + LANDING_SIM_AFTER_DAWN_S - TIME_EPS_S) break;
  }
  tor.settleShadow(dt, realDt, lp.passRadius2, SHADOW_MAX_STEPS);
  const v = tp.torpedo.speedMps * s.timeScale;
  for (let i = 0; i < p.count; i++) {
    out.outcome[i] = ptTorpedoOutcome(st, q, i);
    out.relevant[i] = out.kind[i]! > 0 && out.launchS[i]! + out.launchM[i]! / v < lp.unloadS ? 1 : 0;
  }
  out.drawsWant = st.salvos * (1 + 2 * tp.n) + tor.erratic;
  finishLandingAlly(out, ally, a27.draws, a28.draws);
  return finishLandingTrial(out, q, ld, t, c.dawn, sinking ? s.damage.maxHp : s.damage.maxHp - d.hp, (fuel.gal / s.fuelGal) * 100, gun ? gun.battery.shots : 0, trng.draws);
}
