// 命中率 KPI の模擬（docs/02 §6.3。v0.5.0）。Phaser 非依存。ゲームは使わない（tests と scripts/hit-rate-sim.ts が使う）。
// 止まった艇から「正しい見越し角」の魚雷を 1 本撃ち、雷跡に気づいて避ける艦に当たるかを、ゲームと同じ core（ship-ai の見張り・回避、torpedo、torpedo-solver、外れの確定）と
// 同じ固定ステップ（実時間 stepS × time_scale）で数える。方位（艦の左正横〜艦首〜右正横）× 距離 × 狙いのずれ × 繰り返し（見張りの抽選）で平均し、距離帯ごとに目標帯と比べる。
// 乱数は seed から 1 系列（同じ seed なら同じ結果）。確保は 1 本の模擬の始めだけ（ゲームの update では呼ばない）。
import type { BoatState, SeaBounds } from './boat-motion';
import { SeededRng } from './rng';
import { createShipAiState, steerShip, turnRateFor, updateShipAi, type ShipAiParams } from './ship-ai';
import { createTorpedoState, isArmed, launchTorpedo, markMissIfPassed, stepTorpedo, type TorpedoParams } from './torpedo';
import { createCircles, fillHullCircles, interceptHeadingDeg, pointHitsHull, velocityFromHeading } from './torpedo-solver';

export interface ShotSimSetup {
  ai: ShipAiParams;
  torpedo: TorpedoParams;
  /** 当たり判定の船体（実寸 × ship_hit_scale）と円の数 */
  hullLengthM: number;
  hullBeamM: number;
  hullCircles: number;
  /** 艦の速力 m/s（巡航） */
  shipSpeedMps: number;
  timeScale: number;
  /** 固定ステップの実時間秒（game-config の FIXED_STEP_S） */
  stepS: number;
  /** 艇を見つける距離 m（0 なら見つけない＝雷跡の回避だけ。見つけて近ければ体当たりもする） */
  detectM: number;
  /** 見失ってから警戒を解く実時間秒 */
  detectHoldS: number;
}

/** 模擬の海域（端の向き直しが働かない広さ）と艦の出発点 */
const SIM_SEA = 1e7;
const SIM_CENTER = SIM_SEA / 2;
/** 魚雷の点で雷跡の点を置く間隔（模擬では使わないが launchTorpedo が要る） */
const SIM_WAKE_SPACING_M = 25;

/**
 * 1 本。艦は東（90°）へ巡航、艇は艦から見て bearingDeg（0 = 左正横（北）、90 = 艦首、180 = 右正横）の rangeM に止まっている。
 * 魚雷は見越し角どおり（interceptHeadingDeg）＋ aimErrDeg。命中・外れの確定はゲーム（torpedo-pool）と同じ規則。
 * 見越し角が解けない（追いつけない）なら null。
 */
export function simulateShot(s: ShotSimSetup, rangeM: number, bearingDeg: number, aimErrDeg: number, lookoutRng: SeededRng): boolean | null {
  const ship: BoatState = { x: SIM_CENTER, y: SIM_CENTER, headingDeg: 90, speedMps: s.shipSpeedMps };
  const b = (bearingDeg * Math.PI) / 180;
  const boat: BoatState = { x: ship.x + Math.sin(b) * rangeM, y: ship.y - Math.cos(b) * rangeM, headingDeg: 0, speedMps: 0 };
  const vel = { x: 0, y: 0 };
  velocityFromHeading(ship.headingDeg, ship.speedMps, vel);
  const aim = interceptHeadingDeg(boat.x, boat.y, s.torpedo.speedMps, ship.x, ship.y, vel.x, vel.y);
  if (aim === null) return null;
  const torp = createTorpedoState();
  launchTorpedo(torp, boat.x, boat.y, aim + aimErrDeg, false, false, 0, rangeM, SIM_WAKE_SPACING_M);
  const torps = [torp];
  const ai = createShipAiState(ship.headingDeg, s.shipSpeedMps);
  ai.desiredSpeedMps = s.shipSpeedMps;
  const hull = createCircles(s.hullCircles);
  const bounds: SeaBounds = { width: SIM_SEA, height: SIM_SEA };
  const far: BoatState = { x: 0, y: 0, headingDeg: 0, speedMps: 0 };
  const half = s.hullLengthM / 2 + s.hullBeamM;
  const passRadius2 = half * half;
  const dt = s.stepS * s.timeScale;
  // 射程の倍＋余裕で必ず終わる（魚雷は射程で止まる）
  const maxSteps = Math.ceil((s.torpedo.rangeM / s.torpedo.speedMps + 60) / dt);
  for (let i = 0; i < maxSteps; i++) {
    updateShipAi(ai, ship, s.detectM > 0 ? boat : far, s.detectM, s.detectHoldS, torps, s.ai, bounds, s.stepS, lookoutRng);
    steerShip(ship, ai.desiredHeadingDeg, ai.desiredSpeedMps, turnRateFor(ai.mode, s.ai), s.ai.accelMps2, dt);
    fillHullCircles(hull, ship.x, ship.y, ship.headingDeg, s.hullLengthM, s.hullBeamM);
    if (stepTorpedo(torp, s.torpedo, dt, s.stepS)) return false;
    if (isArmed(torp, s.torpedo) && pointHitsHull(torp.x, torp.y, hull)) return true;
    if (markMissIfPassed(torp, s.torpedo, ship.x, ship.y, passRadius2)) return false;
  }
  return false;
}

export interface SimBand {
  band: string;
  target_hit_min: number;
  target_hit_max: number;
  /** 模擬で撃つ距離（m。帯の中から数点） */
  sim_ranges_m: number[];
}

export interface BandSimResult {
  band: string;
  /** 見越し角が解けた本数（分母）と命中数 */
  shots: number;
  hits: number;
  rate: number;
  targetMin: number;
  targetMax: number;
}

/** 距離帯ごとに、帯の距離 × 方位 × 狙いのずれの全組み合わせを reps 本ずつ撃った命中率（見張りの乱数は seed の 1 系列を順に引く） */
export function simulateBands(s: ShotSimSetup, bands: readonly SimBand[], bearingsDeg: readonly number[], aimErrorsDeg: readonly number[], reps: number, seed: number): BandSimResult[] {
  const rng = new SeededRng(seed >>> 0);
  return bands.map((band) => {
    let shots = 0;
    let hits = 0;
    for (const r of band.sim_ranges_m) {
      for (const bg of bearingsDeg) {
        for (const e of aimErrorsDeg) {
          for (let k = 0; k < reps; k++) {
            const hit = simulateShot(s, r, bg, e, rng);
            if (hit === null) break; // 見越し角が解けない組み合わせは繰り返しても同じ
            shots++;
            if (hit) hits++;
          }
        }
      }
    }
    return { band: band.band, shots, hits, rate: shots > 0 ? hits / shots : 0, targetMin: band.target_hit_min, targetMax: band.target_hit_max };
  });
}

/** 方位の並び（0 = 左正横 〜 180 = 右正横、stepDeg 刻み） */
export function simBearings(stepDeg: number): number[] {
  const out: number[] = [];
  for (let b = 0; b <= 180 + 1e-9; b += stepDeg) out.push(b);
  return out;
}
