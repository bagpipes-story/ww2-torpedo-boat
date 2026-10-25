// 夜の哨戒機の模擬（v0.6.7。日本ハードモード⑥・jp_02「孤島の哨戒」。docs/02 §6.8、spec-v067 §F）。Phaser 非依存。ゲームは使わない（tests/patrol-air-sim*・scripts/patrol-air-sim.ts）。
// 1 夜: 出発点から台本（core/patrol-air-sim-policy）で帰投の輪へ。本物の門番（stepPatrolAir）・再出撃（restartAirSortie）・空襲の core（stepAirStrike。夜 seed+23・夜明け seed+19）・
// stepBoat・clampToBounds・nextSpeedBand・stepFuel・applyShellHit・stepDamage・乗員の減りの効き（mission-world と同じ式で旋回・加速、消火の長押しの伸び）を世界の順で回す:
// 時計 → 夜明けのラッチ → 台本の入力 → 乗員の効き → 自艇 → 縁 → 輪 → 帯 → 燃料 → 門番と夜の出撃（命中は +23）→ 火災 → 夜明けの空襲。
// 省くもの: 命中スロー・カメラ（jp_02 に浅瀬・暴風は無い）。機関損傷は最大速力 × engine_damage_speed_factor（巡航も頭打ち。systems/boat-damage と同じ）。確保は 1 夜の始めだけ。
// 台本の揺らぎは別の系列: 転舵の反応 seed × 7919 + 1000・帰投の向きへ戻す秒 + 2000・止める遅れ + 3000（ゲームの系列とは別）。
import { AIR_STRIKE_SEED_OFFSET, AS_EV_IMPACT, AS_EV_RELEASE, AS_INBOUND, AS_ORBIT, AS_RUN, createAirStrike, startAirStrike, stepAirStrike, type AirStrikeCheck, type AirStrikeParams, type AirStrikeState } from './air-strike';
import { airSortieComplete, createSortieBase, restartAirSortie } from './air-sortie';
import { clampToBounds, nextSpeedBand, setPerformance, stepBoat, type BoatInput, type BoatParams, type BoatState, type SeaBounds, type SpeedStep } from './boat-motion';
import { crewAccelFactor, crewExtinguishFactor, crewLost, crewTurnFactor, type CrewEffects, type CrewParams } from './crew';
import { createFuelState, stepFuel, type FuelCurve } from './fuel';
import { applyShellHit, createDamageState, stepDamage, type DamageParams, type DamageState, type HitOutcome } from './gunnery';
import { PATROL_AIR_SEED_OFFSET, PA_EV_FIND, PA_SORTIE, createPatrolAir, stepPatrolAir, type PatrolParams } from './patrol-air';
import { patrolPolicyRelease, patrolPolicyStep, type PatrolPolicy, type PatrolPolicyCtx } from './patrol-air-sim-policy';
import { SeededRng } from './rng';

/** この体感秒までに輪に着かなければ打ち切り（hide_wait は夜明けの空襲で沈む）・時刻の比較の丸めの余裕・漂流とみなす速さ m/s */
const SIM_MAX_S = 600;
const TIME_EPS_S = 1e-6;
const DRIFT_MPS = 0.01;

export interface PatrolSimSetup {
  gate: PatrolParams;
  sortie: AirStrikeParams;
  dawn: AirStrikeParams;
  boat: BoatParams;
  damage: DamageParams;
  crew: CrewParams;
  crewEffects: CrewEffects;
  /** 乗員の減りの効き（旋回・加速・消火の長押し）を入れる（CREW=0 で切る） */
  crewOn: boolean;
  fuelCurve: FuelCurve;
  fuelStartGal: number;
  start: { x: number; y: number; headingDeg: number };
  ring: { x: number; y: number; radiusM: number };
  bounds: SeaBounds;
  boundsMarginM: number;
  /** 夜明けまでの実秒・time_scale・固定ステップの実秒 */
  durationS: number;
  timeScale: number;
  stepS: number;
  /** 速さの指令（全速 1）: 巡航・静音の上限の少し下 */
  cruise01: number;
  quiet01: number;
  /** 揺らぎ: 転舵の反応（~ の台本）・帰投の向きへ戻す秒（一様。lo = hi なら決め打ちで引かない）・止める遅れ（null なら台本の決まった秒） */
  reactJitterS: readonly [number, number];
  holdS: readonly [number, number];
  stopJitterS: readonly [number, number] | null;
}

/** 沈んだ原因（火災はその前の被弾が夜か夜明けか） */
export type PatrolSunkBy = '' | 'night' | 'dawn' | 'fire_night' | 'fire_dawn';

export interface PatrolTrial {
  home: boolean;
  homeBeforeDawn: boolean;
  sunk: boolean;
  sunkBy: PatrolSunkBy;
  drift: boolean;
  /** 終わった実秒（輪に着いた・沈んだ・漂流・打ち切り） */
  timeS: number;
  /** 門番の夜の累計: 捜索・航跡で来た捜索・隠れた・発見（レーダー込み）・目の発見・目の発見の予告の最短の秒（無ければ Infinity） */
  passes: number;
  passesWake: number;
  hides: number;
  finds: number;
  findsVisual: number;
  minWarnS: number;
  /** 夜の出撃の来た波・爆弾・自艇への命中、夜明けの空襲の爆弾・命中 */
  waves: number;
  nightBombs: number;
  nightHits: number;
  dawnBombs: number;
  dawnHits: number;
  /** 残りの燃料の割合・速力帯が停止だった実秒 */
  fuelLeft: number;
  stoppedS: number;
  /** F3: 同時に攻撃できる機（接近・旋回・爆撃進路）の最大（夜の出撃・夜明け）、両方が同時に攻撃できたステップの数、空中の爆弾の最大 */
  maxAttackNight: number;
  maxAttackDawn: number;
  attackOverlapSteps: number;
  maxBombsAir: number;
  /** F6: +23 を引いた回数と、2 × 夜の投下 + 命中の抽選。F12: 再出撃が false だった回数 */
  draws: number;
  expectedDraws: number;
  restartFalse: number;
}

class CountingRng extends SeededRng {
  draws = 0;
  override next(): number {
    this.draws++;
    return super.next();
  }
}

function attacking(st: AirStrikeState): number {
  let n = 0;
  if (st.started) for (const pl of st.planes) if (pl.phase === AS_INBOUND || pl.phase === AS_ORBIT || pl.phase === AS_RUN) n++;
  return n;
}

function bombsAir(st: AirStrikeState): number {
  let n = 0;
  for (const b of st.bombs) if (b.active) n++;
  return n;
}

/** 1 夜（seed は任務の seed。夜の出撃 seed+23・夜明け seed+19・台本の揺らぎは別の系列） */
export function runPatrolTrial(s: PatrolSimSetup, pol: PatrolPolicy, seed: number): PatrolTrial {
  const bp: BoatParams = { ...s.boat }; // 乗員の効きと機関損傷で書き換える
  const d: DamageState = createDamageState(s.damage);
  const fuel = createFuelState(s.fuelStartGal);
  const boat: BoatState = { x: s.start.x, y: s.start.y, headingDeg: s.start.headingDeg, speedMps: 0 };
  const input: BoatInput = { headingDeg: s.start.headingDeg, speed01: 0 };
  const nightRng = new CountingRng((seed + PATROL_AIR_SEED_OFFSET) >>> 0);
  const dawnRng = new SeededRng((seed + AIR_STRIKE_SEED_OFFSET) >>> 0);
  const gate = createPatrolAir();
  const night = createAirStrike(s.sortie);
  const dawn = createAirStrike(s.dawn);
  const base = createSortieBase();
  const c: PatrolPolicyCtx = {
    pol, gate, gateP: s.gate, night, nightP: s.sortie, dawn, dawnP: s.dawn, boat, ringX: s.ring.x, ringY: s.ring.y, dawnLatched: false,
    quiet01: s.quiet01, cruise01: s.cruise01, reactJitterS: s.reactJitterS, holdS: s.holdS, stopJitterS: s.stopJitterS,
    reactRng: new SeededRng((seed * 7919 + 1000) >>> 0), holdRng: new SeededRng((seed * 7919 + 2000) >>> 0), stopRng: new SeededRng((seed * 7919 + 3000) >>> 0),
    dodgeAt: NaN, dodgeUntil: -1, dodgeHeading: 0, slowUntil: -1, stopLagS: pol.stopLagS, lastPassK: -1, pulseT: 0,
  };
  const cN: AirStrikeCheck = { player: boat, playerSinking: false, escort: null, escortAfloat: false, cancel: true };
  const cD: AirStrikeCheck = { player: boat, playerSinking: false, escort: null, escortAfloat: false, cancel: false };
  const hit: HitOutcome = { destroyed: false, startedFire: false, engineHit: false };
  const out: PatrolTrial = {
    home: false, homeBeforeDawn: false, sunk: false, sunkBy: '', drift: false, timeS: 0, passes: 0, passesWake: 0, hides: 0, finds: 0, findsVisual: 0, minWarnS: Infinity,
    waves: 0, nightBombs: 0, nightHits: 0, dawnBombs: 0, dawnHits: 0, fuelLeft: 0, stoppedS: 0, maxAttackNight: 0, maxAttackDawn: 0, attackOverlapSteps: 0, maxBombsAir: 0,
    draws: 0, expectedDraws: 0, restartFalse: 0,
  };
  const realDt = s.stepS;
  const dt = realDt * s.timeScale;
  const r2 = s.ring.radiusM * s.ring.radiusM;
  let band: SpeedStep = 'stop';
  let hitDraws = 0;
  let lastHit: 'night' | 'dawn' = 'night';
  let fireOutAt = NaN;
  let t = 0;
  // 被弾: 火災なら消し終わる時刻（消火の長押しの伸びは被弾の後の乗員で）、機関損傷なら最大速力を下げる。沈めば true
  const onHit = (p: AirStrikeParams, rng: SeededRng, by: 'night' | 'dawn'): boolean => {
    applyShellHit(d, p.bombHit, s.damage, rng, hit);
    lastHit = by;
    if (by === 'night') out.nightHits++;
    else out.dawnHits++;
    if (hit.startedFire) {
      const ext = s.crewOn ? crewExtinguishFactor(s.crewEffects, s.crew.total - crewLost(s.crew, s.damage.maxHp, d.hp), s.crew.total) : 1;
      fireOutAt = t + pol.extinguishS + s.damage.extinguishHoldS * (ext - 1);
    }
    if (hit.engineHit) {
      bp.speedMaxMps = s.boat.speedMaxMps * s.damage.engineSpeedFactor;
      if (bp.speedCruiseMps > bp.speedMaxMps) bp.speedCruiseMps = bp.speedMaxMps;
    }
    return d.hp <= 0;
  };
  while (t < SIM_MAX_S) {
    const t0 = t;
    t += realDt;
    if (!c.dawnLatched && t >= s.durationS - TIME_EPS_S) {
      c.dawnLatched = true; // 夜明けのラッチは自艇を動かす前（world-dawn と同じ）
      startAirStrike(dawn, s.dawn, boat);
    }
    patrolPolicyStep(c, t0, realDt, fuel.empty, input);
    if (t0 >= fireOutAt - TIME_EPS_S) {
      d.fireLeftS = 0; // 消火の長押しが終わった
      fireOutAt = NaN;
    }
    // ---- 固定ステップ（世界の順） ----
    if (s.crewOn) {
      const lost = crewLost(s.crew, s.damage.maxHp, d.hp);
      setPerformance(bp, s.boat.turnRateDegS, s.boat.accelMps2, crewTurnFactor(s.crewEffects, lost), crewAccelFactor(s.crewEffects, lost));
    }
    stepBoat(boat, input, bp, dt);
    clampToBounds(boat, s.bounds, s.boundsMarginM);
    const hx = boat.x - s.ring.x;
    const hy = boat.y - s.ring.y;
    if (hx * hx + hy * hy <= r2) {
      out.home = true;
      out.homeBeforeDawn = !c.dawnLatched;
      break;
    }
    band = nextSpeedBand(band, boat.speedMps, bp);
    if (band === 'stop') out.stoppedS += realDt;
    stepFuel(fuel, s.fuelCurve, boat.speedMps, dt);
    const ev = stepPatrolAir(gate, s.gate, band, c.dawnLatched, airSortieComplete(night), realDt);
    if ((ev & PA_EV_FIND) !== 0 && !restartAirSortie(night, s.sortie, boat, gate.findBearingDeg, gate.findR, base)) out.restartFalse++;
    cN.cancel = gate.phase !== PA_SORTIE;
    const evN = stepAirStrike(night, s.sortie, cN, nightRng, realDt);
    if (evN & AS_EV_RELEASE) patrolPolicyRelease(c, night, s.sortie, t);
    if (evN & AS_EV_IMPACT) {
      out.nightBombs++;
      if (night.bombs[night.lastImpact]!.hitPlayer) {
        const before = nightRng.draws;
        if (onHit(s.sortie, nightRng, 'night')) out.sunkBy = 'night';
        hitDraws += nightRng.draws - before;
      }
    }
    if (!out.sunkBy && stepDamage(d, s.damage, realDt)) out.sunkBy = lastHit === 'night' ? 'fire_night' : 'fire_dawn';
    if (!out.sunkBy && c.dawnLatched) {
      const evD = stepAirStrike(dawn, s.dawn, cD, dawnRng, realDt);
      if (evD & AS_EV_RELEASE) patrolPolicyRelease(c, dawn, s.dawn, t);
      if (evD & AS_EV_IMPACT) {
        out.dawnBombs++;
        if (dawn.bombs[dawn.lastImpact]!.hitPlayer && onHit(s.dawn, dawnRng, 'dawn')) out.sunkBy = 'dawn';
      }
    }
    if (out.sunkBy) {
      out.sunk = true;
      break;
    }
    const aN = attacking(night);
    const aD = c.dawnLatched ? attacking(dawn) : 0;
    if (aN > out.maxAttackNight) out.maxAttackNight = aN;
    if (aD > out.maxAttackDawn) out.maxAttackDawn = aD;
    if (aN > 0 && aD > 0) out.attackOverlapSteps++;
    const air = bombsAir(night) + bombsAir(dawn);
    if (air > out.maxBombsAir) out.maxBombsAir = air;
    if (fuel.empty && boat.speedMps <= DRIFT_MPS) {
      out.drift = true;
      break;
    }
  }
  out.timeS = t;
  out.passes = gate.k;
  out.passesWake = gate.passesWake;
  out.hides = gate.hides;
  out.finds = gate.finds;
  out.findsVisual = gate.findsVisual;
  out.minWarnS = gate.minVisualWarnS;
  out.waves = night.waves;
  out.fuelLeft = fuel.gal / s.fuelStartGal;
  out.draws = nightRng.draws;
  out.expectedDraws = 2 * night.bombsDropped + hitDraws;
  return out;
}
