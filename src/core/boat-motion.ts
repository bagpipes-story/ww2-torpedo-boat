// 艇の運動モデル（docs/02 §6.1）。Phaser 非依存の純粋ロジック。
// 単位は実寸: 位置 m、速度 m/s、針路は方位角（0=北=画面上、時計回り、[0,360)）。
// 時間圧縮（time_scale）は呼び出し側が dt に掛けて渡す（docs/02 §6.10）。
// §7: 毎フレーム呼ばれる関数はオブジェクトを確保しない。state を書き換える。
import { clamp, degToRad, ktToMps, wrapDeg360 } from './units';

export interface BoatParams {
  speedMaxMps: number;
  speedCruiseMps: number;
  speedSilentMps: number;
  accelMps2: number;
  decelMps2: number;
  turnRateDegS: number;
  lengthM: number;
  beamM: number;
}

export interface BoatState {
  x: number;
  y: number;
  headingDeg: number;
  speedMps: number;
}

/** 操作入力。rudder: -1(左)〜+1(右)。throttle: +1=全速、0=巡航、-0.5=静音低速、-1=停止 */
export interface BoatInput {
  rudder: number;
  throttle: number;
}

export interface SeaBounds {
  width: number;
  height: number;
}

export type SpeedStep = 'stop' | 'silent' | 'cruise' | 'full';

/** data/boats.json の1レコードのうち運動に使う部分 */
export interface BoatDataRecord {
  speed_max_kt: number;
  speed_cruise_kt: number;
  speed_silent_kt: number;
  accel_mps2: number;
  decel_mps2: number;
  turn_rate_deg_s: number;
  length_m: number;
  beam_m: number;
}

export function isBoatDataRecord(v: unknown): v is BoatDataRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    ['speed_max_kt', 'speed_cruise_kt', 'speed_silent_kt', 'accel_mps2', 'decel_mps2', 'turn_rate_deg_s', 'length_m', 'beam_m']
      .every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number))
  );
}

export function boatParamsFromData(r: BoatDataRecord): BoatParams {
  return {
    speedMaxMps: ktToMps(r.speed_max_kt),
    speedCruiseMps: ktToMps(r.speed_cruise_kt),
    speedSilentMps: ktToMps(r.speed_silent_kt),
    accelMps2: r.accel_mps2,
    decelMps2: r.decel_mps2,
    turnRateDegS: r.turn_rate_deg_s,
    lengthM: r.length_m,
    beamM: r.beam_m,
  };
}

/**
 * スロットル(-1〜+1)を目標速度(m/s)に写す（docs/02 §5: 上で全速、中立で巡航、下で静音低速→停止）。
 * 区分線形: +1→全速、0→巡航、-0.5→静音、-1→0。
 */
export function throttleToTargetSpeed(throttle: number, p: BoatParams): number {
  const t = clamp(throttle, -1, 1);
  if (t >= 0) return p.speedCruiseMps + (p.speedMaxMps - p.speedCruiseMps) * t;
  if (t >= -0.5) return p.speedCruiseMps + (p.speedCruiseMps - p.speedSilentMps) * (t / 0.5);
  return p.speedSilentMps * (1 + (t + 0.5) / 0.5);
}

/** 目標速度に最も近い速力段（HUD 表示用） */
export function nearestSpeedStep(speedMps: number, p: BoatParams): SpeedStep {
  const candidates: Array<[SpeedStep, number]> = [
    ['stop', 0],
    ['silent', p.speedSilentMps],
    ['cruise', p.speedCruiseMps],
    ['full', p.speedMaxMps],
  ];
  let best: SpeedStep = 'stop';
  let bestDist = Infinity;
  for (const [step, v] of candidates) {
    const d = Math.abs(speedMps - v);
    if (d < bestDist) {
      bestDist = d;
      best = step;
    }
  }
  return best;
}

/**
 * 1ステップ進める。速度は目標速度に加速度/減速度で近づき、旋回は舵×旋回率、速度ベクトルは常に船首方向（横滑りなし）。
 * dt は既に time_scale を掛けた秒。
 */
export function stepBoat(s: BoatState, input: BoatInput, p: BoatParams, dt: number): void {
  const target = throttleToTargetSpeed(input.throttle, p);
  if (s.speedMps < target) s.speedMps = Math.min(target, s.speedMps + p.accelMps2 * dt);
  else if (s.speedMps > target) s.speedMps = Math.max(target, s.speedMps - p.decelMps2 * dt);

  const rudder = clamp(input.rudder, -1, 1);
  s.headingDeg = wrapDeg360(s.headingDeg + rudder * p.turnRateDegS * dt);

  const h = degToRad(s.headingDeg);
  s.x += Math.sin(h) * s.speedMps * dt;
  s.y -= Math.cos(h) * s.speedMps * dt;
}

/** 海域境界の内側に位置を押し戻す（docs/02 §6.1）。margin は境界からの余白 m */
export function clampToBounds(s: BoatState, b: SeaBounds, margin: number): void {
  s.x = clamp(s.x, margin, b.width - margin);
  s.y = clamp(s.y, margin, b.height - margin);
}
