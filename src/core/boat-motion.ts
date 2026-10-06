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

/**
 * スロットルの折れ点: 中立（0）より下はこの値まで静音低速、これ以下で停止（docs/02 §5 の手触りの設計値）。-1 < THROTTLE_STOP < 0。
 * v0.2.1 実機: 「巡航より下はすぐ静音になる方がサクサク操作できる」ので、静音〜巡航の間の補間をやめた。
 */
export const THROTTLE_STOP = -0.8;

/** 操作入力。rudder: -1(左)〜+1(右)。throttle: +1=全速、0=巡航、0 未満=静音低速、THROTTLE_STOP 以下=停止 */
export interface BoatInput {
  rudder: number;
  throttle: number;
}

export interface SeaBounds {
  width: number;
  height: number;
}

export type SpeedStep = 'stop' | 'silent' | 'cruise' | 'full';

/** HUD に渡す自艇の状態。Mission が毎フレーム書き、HUD が読む（1 個だけ作る） */
export interface BoatTelemetry {
  speedMps: number;
  rudder: number;
  targetStep: SpeedStep;
  headingDeg: number;
  /** 残弾 */
  torpedoesLeft: number;
  /** 有効弾の命中数（不発を除く） */
  hits: number;
  /** 任務の残り時間（実時間秒） */
  timeLeftS: number;
  /** 敵（駆逐艦）の自艇からの相対位置 m（画面外マーカー用）。沈没後は NaN */
  enemyDx: number;
  enemyDy: number;
  /** 敵が自艇の視程内にいる（見える・マーカーを出す）。docs/02 §6.5 */
  enemySighted: boolean;
  /** 敵が自艇を発見している */
  playerDetected: boolean;
  /** 敵が自艇を見つける距離 m（速力段・月明で決まる。HUD に出して速力を落とす価値を見せる） */
  detectRangeM: number;
  /** 探照灯か星弾に照らされている（砲撃が来る）。starLit は星弾によるもの（HUD で区別する） */
  illuminated: boolean;
  starLit: boolean;
  /** 艇の HP と被害（docs/02 §6.6） */
  hp: number;
  hpMax: number;
  onFire: boolean;
  engineDamaged: boolean;
}

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
 * スロットル(-1〜+1)を目標速度(m/s)に写す（docs/02 §5: 上で全速、中立で巡航、少しでも下げれば静音低速、いちばん下で停止）。
 * +1→全速、0→巡航 は線形。0 未満は静音低速の一定値、THROTTLE_STOP 以下で 0。
 */
export function throttleToTargetSpeed(throttle: number, p: BoatParams): number {
  const t = clamp(throttle, -1, 1);
  if (t >= 0) return p.speedCruiseMps + (p.speedMaxMps - p.speedCruiseMps) * t;
  if (t > THROTTLE_STOP) return p.speedSilentMps;
  return 0;
}

/** 目標速度に最も近い速力段（HUD 表示用）。毎フレーム呼ばれるので配列を作らない。同距離なら 停止>静音>巡航>全速 の順で先勝ち */
export function nearestSpeedStep(speedMps: number, p: BoatParams): SpeedStep {
  let best: SpeedStep = 'stop';
  let bestDist = Math.abs(speedMps);
  let d = Math.abs(speedMps - p.speedSilentMps);
  if (d < bestDist) {
    bestDist = d;
    best = 'silent';
  }
  d = Math.abs(speedMps - p.speedCruiseMps);
  if (d < bestDist) {
    bestDist = d;
    best = 'cruise';
  }
  d = Math.abs(speedMps - p.speedMaxMps);
  if (d < bestDist) best = 'full';
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

/** 一定針路・一定速力で直進する（v0.1 の駆逐艦。docs/02 §6.4）。dt は time_scale 込みの秒 */
export function stepStraight(s: BoatState, dt: number): void {
  const h = degToRad(s.headingDeg);
  s.x += Math.sin(h) * s.speedMps * dt;
  s.y -= Math.cos(h) * s.speedMps * dt;
}

/** 海域境界の内側に位置を押し戻す（docs/02 §6.1）。margin は境界からの余白 m */
export function clampToBounds(s: BoatState, b: SeaBounds, margin: number): void {
  s.x = clamp(s.x, margin, b.width - margin);
  s.y = clamp(s.y, margin, b.height - margin);
}
