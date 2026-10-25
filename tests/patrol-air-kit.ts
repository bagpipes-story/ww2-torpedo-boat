// 夜の哨戒機の門番（v0.6.7。core/patrol-air）のテストの固定の fixture と道具。data を読まない（数は jp_02 の data と同じ値を手で書いた:
// 機 120 kt × time_scale 5・航跡 6,000 m・発見 1,500 m・月没後の視程 900 m・旋回の半径 600 m・秒は risk_events.json の patrol_air.params・方位 56°・90° ずつ・レーダー 1 回）。
// 自艇は T-14 の運動の数（boats.json jp_t14 と同じ値の手書き）。data の値そのものは tests/patrol-air-data、jp_02 の世界との一致は tests/patrol-air.test.ts の 1 件。
import { FIXED_STEP_S } from '../src/config/step-config';
import { boatParamsFromData, nextSpeedBand, stepBoat, type BoatInput, type BoatParams, type BoatState, type SpeedStep } from '../src/core/boat-motion';
import { PA_EV_FIND, PA_EV_HUNT, PA_PASS, createPatrolAir, patrolCountdownS, stepPatrolAir, type PatrolParams, type PatrolState } from '../src/core/patrol-air';
import { ktToMps, radToDeg } from '../src/core/units';

export const DT = FIXED_STEP_S;
export const TS = 5;
/** 機の速さ m/体感秒（120 kt × 5 ≈ 308.67） */
export const V = ktToMps(120) * TS;
export const steps = (s: number): number => Math.round(s / DT);

export const P: PatrolParams = {
  planes: 2,
  flightMps: V,
  wakeDetectM: 6000,
  lockM: 1500,
  nearM: 900,
  runRadiusM: 600,
  firstPassS: 3,
  wakeTriggerS: 3,
  sweepGapS: 12,
  orbitS: 8,
  leaveS: 2.5,
  hudStopMarginS: 3,
  fromBearingDeg: 56,
  passRotateDeg: 90,
  radarPasses: 1,
  orbitDegPerS: radToDeg(V / 900),
  quietKt: 14,
};
/** レーダーなし（最初の捜索から目で捜す。航跡・静音・停止の見え方の検査） */
export const P_EYE: PatrolParams = { ...P, radarPasses: 0 };

/** T-14 の運動（最高 31 kt・静音の上限 14 kt・停止 0.5 kt・減速 1.5 m/s²） */
export const T14: BoatParams = boatParamsFromData({
  speed_max_kt: 31,
  speed_cruise_kt: 20,
  speed_silent_kt: 7,
  speed_bands_kt: { stop_max: 0.5, silent_max: 14, cruise_max: 20, hysteresis: 1 },
  accel_mps2: 1.1,
  decel_mps2: 1.5,
  turn_rate_deg_s: 30,
  length_m: 15,
  beam_m: 3.65,
});

/** 最初の捜索が済んだ哨戒（k 回の捜索の後。航跡と定時の検査用） */
export function hunting(k = 1): PatrolState {
  const s = createPatrolAir();
  s.k = k;
  return s;
}

/** n ステップ回す（帯・OFF・出撃の終わりは一定）。立ったビットの和を返す。onStep は各ステップの後（ev はそのステップのビット） */
export function run(s: PatrolState, p: PatrolParams, n: number, band: SpeedStep, off = false, sortieDone = false, onStep?: (ev: number) => void): number {
  let all = 0;
  for (let i = 0; i < n; i++) {
    const ev = stepPatrolAir(s, p, band, off, sortieDone, DT);
    all |= ev;
    onStep?.(ev);
  }
  return all;
}

/** 立つまで回す（上限 maxS 秒）。立ったステップの t を返す（立たなければ NaN） */
export function runUntil(s: PatrolState, p: PatrolParams, bit: number, band: SpeedStep, maxS = 120): number {
  for (let i = 0; i < steps(maxS); i++) if (stepPatrolAir(s, p, band, false, false, DT) & bit) return s.t;
  return NaN;
}

export interface StopTrial {
  found: boolean;
  /** 捜索の始まりから秒読みが 0 になるまでの秒 */
  zeroAfterS: number;
}

/**
 * F2（spec C.6）: 定速 kt で走り、接近の秒読みが 0 になったステップから lagS 秒後に止め始める（スティックを離す）。
 * 世界の順（自艇 → 速力帯 → 門番）で回し、その捜索が終わる（哨戒に戻る）までに発見されたか。最初の捜索が目の捜索になる p（レーダーなし）で使う
 */
export function stopAfterCountdown(p: PatrolParams, bp: BoatParams, timeScale: number, kt: number, lagS: number): StopTrial {
  const s = createPatrolAir();
  const boat: BoatState = { x: 0, y: 0, headingDeg: 0, speedMps: ktToMps(kt) };
  const input: BoatInput = { headingDeg: Number.NaN, speed01: boat.speedMps / bp.speedMaxMps };
  let band: SpeedStep = 'stop';
  for (let i = 0; i < 4; i++) band = nextSpeedBand(band, boat.speedMps, bp);
  let zeroT = Number.NaN;
  for (let i = 0; i < steps(80); i++) {
    if (s.phase === PA_PASS && Number.isNaN(zeroT) && patrolCountdownS(s, p) === 0) zeroT = s.t;
    if (!Number.isNaN(zeroT) && s.t >= zeroT + lagS - 1e-9) input.speed01 = 0;
    stepBoat(boat, input, bp, DT * timeScale);
    band = nextSpeedBand(band, boat.speedMps, bp);
    const ev = stepPatrolAir(s, p, band, false, false, DT);
    if (ev & (PA_EV_FIND | PA_EV_HUNT)) return { found: (ev & PA_EV_FIND) !== 0, zeroAfterS: zeroT - s.passStartT };
  }
  throw new Error('捜索が終わらない');
}
