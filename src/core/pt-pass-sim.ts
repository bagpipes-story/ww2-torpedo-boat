// 米PT の掃射の航過の模擬（v0.6.3。docs/02 §6.4、spec §F）。Phaser 非依存。ゲームは使わない（tests/pt-pass-sim.test.ts と scripts/pt-pass-sim.ts が使う）。
// 遊び方（台本。艇長に見えるものだけを使う）ごとに 1 夜を、ゲームと同じ core（stepPtSection・stepBoat・clampToBounds・nextSpeedBand・enemyDetectRangeM・stepFuel・
// applyShellHit・stepDamage・乗員の旋回と加速）と同じ固定ステップ・同じ順序（夜明けのラッチ → 艇 → 燃料 → 輪 → 速力帯 → 発見距離 → 米PT → 火災）で走らせ、発見・航過・被弾・沈没・帰投・燃料を数える。
// 乱数: 今夜の揺らぎは seed+16（rollNight。world-setup と同じ）、射撃と命中の火災・機関は seed+18 の 1 系列。台本の揺らぎ（出発の遅れ・赤い線から転舵までの反応）は別の系列。
// 省いたもの: 命中スロー、消火ボタンの長押し（火災は起きて PLAY.fireOutS で消す＝気の付く艇長）、漂流の待ち（燃料 0 で止まったら漂流）。確保は 1 夜の始めだけ。
import { clampToBounds, nextSpeedBand, setPerformance, stepBoat, type BoatInput, type BoatParams, type BoatState, type SpeedStep } from './boat-motion';
import { crewAccelFactor, crewLost, crewTurnFactor, type CrewEffects, type CrewParams } from './crew';
import { dawnReached } from './dawn-air';
import { createFuelState, stepFuel, type FuelCurve } from './fuel';
import { applyShellHit, createDamageState, stepDamage, type DamageParams, type HitOutcome } from './gunnery';
import { insideRing, type ReturnPoint } from './mission-flow';
import { fixedNight, rollNight, type NightBlock } from './night';
import { PT_LEAVE, PT_PASS, PT_SEED_OFFSET, createPtSection, stepPtSection, type PtBoatState, type PtCheck, type PtEvents } from './pt-boats';
import { ptParamsAtNight, type PtParams } from './pt-data';
import { targetSide } from './pt-pass';
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
}

/** 遊び方（spec §F.2）。表の順 */
export const PT_POLICIES = ['cruise', 'silent', 'full', 'zigzag', 'turn_cruise', 'react_full', 'dodge_silent', 'turn_silent', 'late_turn', 'turn_full', 'dark_stop', 'meet', 'stop_dawn'] as const;
export type PtPolicy = (typeof PT_POLICIES)[number];

/** 台本（spec §F.2）: ふだんの速さ（静音の上限 14 kt・巡航 20 kt・全速）、赤い線を見たら（何もしない・線から離れる直角へ・PT へ向かう）とそのときの速さ、反応の秒（NaN は乱数） */
type Speed = 'silent' | 'cruise' | 'full';
const POLICY: Record<PtPolicy, { base: Speed; dodge: 'none' | 'away' | 'toward'; dodgeSpeed: Speed; reactS: number }> = {
  cruise: { base: 'cruise', dodge: 'none', dodgeSpeed: 'cruise', reactS: NaN },
  silent: { base: 'silent', dodge: 'none', dodgeSpeed: 'silent', reactS: NaN },
  full: { base: 'full', dodge: 'none', dodgeSpeed: 'full', reactS: NaN },
  zigzag: { base: 'cruise', dodge: 'none', dodgeSpeed: 'cruise', reactS: NaN },
  turn_cruise: { base: 'cruise', dodge: 'away', dodgeSpeed: 'cruise', reactS: NaN },
  react_full: { base: 'cruise', dodge: 'away', dodgeSpeed: 'full', reactS: NaN },
  dodge_silent: { base: 'silent', dodge: 'away', dodgeSpeed: 'full', reactS: NaN },
  turn_silent: { base: 'silent', dodge: 'away', dodgeSpeed: 'silent', reactS: NaN },
  late_turn: { base: 'cruise', dodge: 'away', dodgeSpeed: 'cruise', reactS: 2.0 },
  turn_full: { base: 'full', dodge: 'away', dodgeSpeed: 'full', reactS: NaN },
  dark_stop: { base: 'silent', dodge: 'away', dodgeSpeed: 'silent', reactS: NaN },
  meet: { base: 'cruise', dodge: 'toward', dodgeSpeed: 'cruise', reactS: NaN },
  stop_dawn: { base: 'cruise', dodge: 'none', dodgeSpeed: 'cruise', reactS: NaN },
};

// 台本の値（模擬の設定。ゲームの値ではない。lead の試作 ptsim3.final と同じ）: 出発の遅れの最大・赤い線から反応までの秒（一様）・転舵の角と保つ秒（meet は PT へ 3 秒）・
// ジグザグ（±40° を 3 秒ごと）・dark_stop の止まる秒の上限・火災を消すまでの秒・台本の乱数の系列（seed × 7919 + 1000）・打ち切りの実秒・時刻の比較の丸めの余裕
const PLAY = { departMaxS: 4, reactMinS: 0.4, reactMaxS: 1.2, dodgeDeg: 90, dodgeHoldS: 4, meetHoldS: 3, zigzagDeg: 40, zigzagLegS: 3, darkStopMaxS: 40, fireOutS: 1.5 } as const;
const POLICY_SEED_MUL = 7919;
const POLICY_SEED_ADD = 1000;
const SIM_MAX_S = 400;
const TIME_EPS_S = 1e-6;
const DRIFT: BoatInput = { headingDeg: NaN, speed01: 0 };

export type PtTrialEnd = 'home' | 'sunk' | 'adrift' | 'timeout';

export interface PtTrial {
  /** 終わり方と秒、夜明けの後に帰投した */
  end: PtTrialEnd; timeS: number; afterDawn: boolean;
  /** 隊の KPI（core/pt-state の PtSection と同じ意味）、失った HP、残りの燃料 % */
  detected: boolean; firstDetectM: number; lostContacts: number; passes: number; firedPasses: number; cleanPasses: number; shots: number; hits: number; hpLost: number; fuelPct: number;
  /** 不変の確かめ: 予告から初弾の最短秒、同時に航過中の PT の最大、有効射程・艇の視程の外からの発射、1 回の航過の最大命中、予告から航過の終わりまでの最短秒（v0.6.3 の直し: 一瞬で終わる航過が無い） */
  minWarnS: number; maxPassing: number; beyondEff: number; beyondSight: number; worstPassHits: number; minPassS: number;
}

/** seed の夜の米PT（world-setup の applyPtNight と同じ: rollNight の敵の 1 件目のずれと左右反転） */
export function ptNightParams(s: PtSimSetup, seed: number): PtParams {
  const n = s.night ? rollNight(s.night, (id) => s.hazardShares[id] ?? 0, seed, s.nightEnemyRolls, s.nightBatteries) : fixedNight(s.nightEnemyRolls, s.nightBatteries);
  const o = n.enemyOffsets[0]!;
  return ptParamsAtNight(s.pt, o.dx, o.dy, n.mirrored);
}

/** 1 夜。艇は出発点で止まっていて、出発の遅れの後に台本どおり帰投地点へ */
export function runPtTrial(s: PtSimSetup, policy: PtPolicy, seed: number): PtTrial {
  const sp = POLICY[policy];
  const p = ptNightParams(s, seed);
  const q = createPtSection(p, s.shellPoolSize);
  const rng = new SeededRng((seed + PT_SEED_OFFSET) >>> 0);
  const pol = new SeededRng((seed * POLICY_SEED_MUL + POLICY_SEED_ADD) >>> 0);
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
  const out: PtTrial = { end: 'timeout', timeS: 0, afterDawn: false, detected: false, firstDetectM: NaN, lostContacts: 0, passes: 0, firedPasses: 0, cleanPasses: 0, shots: 0, hits: 0, hpLost: 0, fuelPct: 0, minWarnS: Infinity, maxPassing: 0, beyondEff: 0, beyondSight: 0, worstPassHits: 0, minPassS: Infinity };
  const departS = pol.nextRange(0, PLAY.departMaxS);
  const speedMps = (k: Speed): number => (k === 'silent' ? s.boat.silentMaxMps : k === 'cruise' ? s.boat.speedCruiseMps : Infinity);
  let t = 0;
  let sinking = false;
  let atHome = false;
  let band: SpeedStep = 'stop';
  /** 台本の覚え: 反応を待つ PT と時刻、転舵の終わりと針路、火災を消す時刻、止まった秒 */
  const m = { reactBoat: -1, reactAt: NaN, dodgeUntil: -1, dodgeDeg: 0, fireOutAt: NaN, stopUsedS: 0 };
  const ev: PtEvents = {
    onContact: () => {}, onLeave: () => {}, onOut: () => {},
    onPassEnd: () => {
      out.minPassS = Math.min(out.minPassS, c.timeS - q.commitAtS);
    },
    // 赤い線: 反応の秒は毎回引く（台本どうしで同じ乱数の列）。late_turn は決まった秒
    onCommit: (i) => {
      const r = pol.nextRange(PLAY.reactMinS, PLAY.reactMaxS);
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
      if (hit.startedFire) m.fireOutAt = t + PLAY.fireOutS;
      if (hit.engineHit) bp.speedMaxMps = s.boat.speedMaxMps * s.damage.engineSpeedFactor;
      bp.speedCruiseMps = Math.min(bp.speedCruiseMps, bp.speedMaxMps);
      if (hit.destroyed) {
        sinking = true;
        c.targetValid = false;
      }
    },
  };
  while (t < SIM_MAX_S - TIME_EPS_S) {
    // 台本（毎フレームの入力に当たる。固定ステップの前）。t0 はこのステップの始まり。速さは kt で決める（HUD の表示。機関損傷で全速が落ちても静音は 14 kt）
    const t0 = t;
    let hd = bearingDeg(boat.x, boat.y, s.ring.x, s.ring.y);
    let want = t0 < departS || (policy === 'stop_dawn' && !c.dawn) ? 0 : speedMps(sp.base);
    if (policy === 'zigzag') hd = wrapDeg360(hd + (Math.floor(t0 / PLAY.zigzagLegS) % 2 === 0 ? PLAY.zigzagDeg : -PLAY.zigzagDeg));
    if (policy === 'dark_stop' && !q.detected && m.stopUsedS < PLAY.darkStopMaxS && ptInSight(q.boats, boat, s.visRange2)) {
      want = 0;
      m.stopUsedS += realDt;
    }
    if (sp.dodge !== 'none' && m.reactBoat >= 0 && t0 >= m.reactAt - TIME_EPS_S) {
      // 赤い線（固めた針路 lockDeg を PT から引いた線）のどちら側にいるかを見て、線から離れる直角へ（meet は PT へ向かう）
      const b = q.boats[m.reactBoat]!;
      const toward = sp.dodge === 'toward';
      m.dodgeDeg = toward ? bearingDeg(boat.x, boat.y, b.x, b.y) : wrapDeg360(b.lockDeg + targetSide(b.lockDeg, b.x, b.y, boat.x, boat.y) * PLAY.dodgeDeg);
      m.dodgeUntil = t0 + (toward ? PLAY.meetHoldS : PLAY.dodgeHoldS);
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
    stepPtSection(q, p, c, rng, realDt, dt, ev);
    if (!sinking && stepDamage(d, s.damage, realDt)) sinking = true;
    // 計測（航過中の数・1 回の航過の命中。後から落ちた弾は core が最後の航過に数える）
    let passing = 0;
    for (let i = 0; i < q.boats.length; i++) if (q.boats[i]!.phase === PT_PASS) passing++;
    out.maxPassing = Math.max(out.maxPassing, passing);
    out.worstPassHits = Math.max(out.worstPassHits, q.owner >= 0 ? q.passHits : 0, q.lastPassHits);
    out.end = sinking ? 'sunk' : atHome ? 'home' : fuel.empty && band === 'stop' ? 'adrift' : 'timeout';
    if (out.end !== 'timeout') break;
  }
  Object.assign(out, {
    timeS: t, afterDawn: out.end === 'home' && c.dawn, detected: !Number.isNaN(q.firstDetectM), firstDetectM: q.firstDetectM, lostContacts: q.lostContacts,
    passes: q.passes, firedPasses: q.firedPasses, cleanPasses: q.cleanPasses, shots: q.shots, hits: q.hits, minWarnS: q.minWarnS,
    hpLost: sinking ? s.damage.maxHp : s.damage.maxHp - d.hp, fuelPct: (fuel.gal / s.fuelGal) * 100,
  });
  return out;
}

/** 去っていない PT のどれかが艇の視程の内（艇長に見えている） */
function ptInSight(boats: readonly PtBoatState[], boat: BoatState, vis2: number): boolean {
  for (let i = 0; i < boats.length; i++) {
    const b = boats[i]!;
    if (b.phase < PT_LEAVE && (b.x - boat.x) * (b.x - boat.x) + (b.y - boat.y) * (b.y - boat.y) <= vis2) return true;
  }
  return false;
}

/** n 夜の集計（spec §F.3 の表の列）。% は 0〜100、中央値・p90 は小さい順の floor(q × n) 番目（試作と同じ）。帰投の秒・燃料は帰投した夜だけ */
export interface PtCell {
  policy: PtPolicy; trials: number;
  detectedPct: number; firstDetectMedM: number; passes: number; firedPasses: number; cleanPasses: number; shots: number; hits: number; hpMean: number; hpP90: number;
  /** 帰投は夜明けの前と後に分けても出す（どちらも全体に対する %） */
  sunkPct: number; homePct: number; homeBeforeDawnPct: number; afterDawnPct: number; homeMedS: number; fuelMedPct: number; fuelP10Pct: number; adriftPct: number; timeoutPct: number; lostContacts: number;
  /** 不変（spec §F.4 の 7）: 予告から初弾の最短秒・同時に航過中の最大・射程の外と視程の外からの発射の数・1 回の航過の最大命中・予告から航過の終わりの最短秒 */
  minWarnS: number; maxPassing: number; beyondEff: number; beyondSight: number; worstPassHits: number; minPassS: number;
}

/** seed は seedBase 〜 seedBase + n − 1（同じ seed なら同じ結果） */
export function runPtCell(s: PtSimSetup, policy: PtPolicy, n: number, seedBase: number): PtCell {
  const trials: PtTrial[] = [];
  for (let i = 0; i < n; i++) trials.push(runPtTrial(s, policy, seedBase + i));
  const mean = (f: (r: PtTrial) => number): number => trials.reduce((a, r) => a + f(r), 0) / n;
  const pct = (f: (r: PtTrial) => boolean): number => mean((r) => (f(r) ? 100 : 0));
  const sum = (f: (r: PtTrial) => number): number => trials.reduce((a, r) => a + f(r), 0);
  const home = trials.filter((r) => r.end === 'home');
  const det = trials.filter((r) => r.detected);
  return {
    policy, trials: n,
    detectedPct: pct((r) => r.detected), firstDetectMedM: quantile(det.map((r) => r.firstDetectM), 0.5),
    passes: mean((r) => r.passes), firedPasses: mean((r) => r.firedPasses), cleanPasses: mean((r) => r.cleanPasses), shots: mean((r) => r.shots), hits: mean((r) => r.hits),
    hpMean: mean((r) => r.hpLost), hpP90: quantile(trials.map((r) => r.hpLost), 0.9),
    sunkPct: pct((r) => r.end === 'sunk'), homePct: pct((r) => r.end === 'home'), homeBeforeDawnPct: pct((r) => r.end === 'home' && !r.afterDawn), afterDawnPct: pct((r) => r.afterDawn),
    homeMedS: quantile(home.map((r) => r.timeS), 0.5), fuelMedPct: quantile(home.map((r) => r.fuelPct), 0.5), fuelP10Pct: quantile(home.map((r) => r.fuelPct), 0.1),
    adriftPct: pct((r) => r.end === 'adrift'), timeoutPct: pct((r) => r.end === 'timeout'), lostContacts: mean((r) => r.lostContacts),
    minWarnS: trials.reduce((a, r) => Math.min(a, r.minWarnS), Infinity), maxPassing: trials.reduce((a, r) => Math.max(a, r.maxPassing), 0),
    beyondEff: sum((r) => r.beyondEff), beyondSight: sum((r) => r.beyondSight), worstPassHits: trials.reduce((a, r) => Math.max(a, r.worstPassHits), 0),
    minPassS: trials.reduce((a, r) => Math.min(a, r.minPassS), Infinity),
  };
}

/** 小さい順の floor(q × n) 番目（空なら NaN） */
function quantile(a: number[], q: number): number {
  if (a.length === 0) return NaN;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
}
