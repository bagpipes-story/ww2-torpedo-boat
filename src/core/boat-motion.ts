// 艇の運動モデル（docs/02 §6.1）。Phaser 非依存の純粋ロジック。
// 単位は実寸: 位置 m、速度 m/s、針路は方位角（0=北=画面上、時計回り、[0,360)）。
// 時間圧縮（time_scale）は呼び出し側が dt に掛けて渡す（docs/02 §6.10）。
// §7: 毎フレーム呼ばれる関数はオブジェクトを確保しない。state を書き換える。
import { clamp, degToRad, ktToMps, mpsToKt, wrapDeg180, wrapDeg360 } from './units';

export interface BoatParams {
  speedMaxMps: number;
  speedCruiseMps: number;
  speedSilentMps: number;
  /** 速力帯の上限 m/s（docs/02 §6.1・§6.5）: この速度以下なら その帯。HUD の表示と発見距離の係数に使う */
  stopMaxMps: number;
  silentMaxMps: number;
  cruiseMaxMps: number;
  /** 上の帯へ移るのに境界をこれだけ超える必要がある（m/s。境界付近の揺れで帯が点滅しない） */
  bandHysteresisMps: number;
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
 * 操作入力（docs/02 §5、v0.2.1 で見直し）: スティックを倒した方向へ進み、倒すほど速い。
 * headingDeg: 目標方位（0=北=画面上、時計回り）。NaN なら針路を保つ（スティック中立）。
 * speed01: 目標速度の全速に対する比率 0〜1（中立=0=停止）。
 */
export interface BoatInput {
  headingDeg: number;
  speed01: number;
}

export interface SeaBounds {
  width: number;
  height: number;
}

export type SpeedStep = 'stop' | 'silent' | 'cruise' | 'full';

/** HUD に渡す自艇の状態。Mission が毎フレーム書き、HUD が読む（1 個だけ作る） */
export interface BoatTelemetry {
  speedMps: number;
  /** 旋回の指令 -1(左)〜+1(右)（目標方位への残り角。舵バーの表示用） */
  rudder: number;
  /** 現在の速度の速力帯（停止/静音/巡航/全速） */
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
  speed_bands_kt: { stop_max: number; silent_max: number; cruise_max: number; hysteresis: number };
  accel_mps2: number;
  decel_mps2: number;
  turn_rate_deg_s: number;
  length_m: number;
  beam_m: number;
}

export function isBoatDataRecord(v: unknown): v is BoatDataRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  const bands = r['speed_bands_kt'] as Record<string, unknown> | undefined;
  return (
    ['speed_max_kt', 'speed_cruise_kt', 'speed_silent_kt', 'accel_mps2', 'decel_mps2', 'turn_rate_deg_s', 'length_m', 'beam_m']
      .every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number)) &&
    !!bands &&
    ['stop_max', 'silent_max', 'cruise_max', 'hysteresis'].every((k) => typeof bands[k] === 'number' && Number.isFinite(bands[k] as number))
  );
}

export function boatParamsFromData(r: BoatDataRecord): BoatParams {
  return {
    speedMaxMps: ktToMps(r.speed_max_kt),
    speedCruiseMps: ktToMps(r.speed_cruise_kt),
    speedSilentMps: ktToMps(r.speed_silent_kt),
    stopMaxMps: ktToMps(r.speed_bands_kt.stop_max),
    silentMaxMps: ktToMps(r.speed_bands_kt.silent_max),
    cruiseMaxMps: ktToMps(r.speed_bands_kt.cruise_max),
    bandHysteresisMps: ktToMps(r.speed_bands_kt.hysteresis),
    accelMps2: r.accel_mps2,
    decelMps2: r.decel_mps2,
    turnRateDegS: r.turn_rate_deg_s,
    lengthM: r.length_m,
    beamM: r.beam_m,
  };
}

/** HUD が速度を kt の整数で出すので、帯の判定も同じ丸めで行う（「18 kt」と表示されているのに巡航、を防ぐ） */
function roundedKtMps(speedMps: number): number {
  return ktToMps(Math.round(mpsToKt(speedMps)));
}

/** 速度がどの速力帯にあるか（状態なし。表示用に丸めた kt で判定）。帯の上限は data（speed_bands_kt） */
export function speedBandFor(speedMps: number, p: BoatParams): SpeedStep {
  const v = roundedKtMps(speedMps);
  if (v <= p.stopMaxMps) return 'stop';
  if (v <= p.silentMaxMps) return 'silent';
  if (v <= p.cruiseMaxMps) return 'cruise';
  return 'full';
}

const BAND_ORDER: readonly SpeedStep[] = ['stop', 'silent', 'cruise', 'full'];

/**
 * ヒステリシス付きの速力帯（HUD 表示と発見距離の係数。docs/02 §6.5）。
 * 下の帯へは境界を下回ればすぐ移り、上の帯へは境界＋hysteresis を超えて初めて移る。境界ぎりぎりで走っても帯が点滅しない。
 */
export function nextSpeedBand(prev: SpeedStep, speedMps: number, p: BoatParams): SpeedStep {
  const v = roundedKtMps(speedMps);
  const h = p.bandHysteresisMps;
  // 上限（これ以下ならその帯）。上へ移るときだけ h を足す
  const upper = (band: SpeedStep): number => (band === 'stop' ? p.stopMaxMps : band === 'silent' ? p.silentMaxMps : band === 'cruise' ? p.cruiseMaxMps : Infinity);
  let i = BAND_ORDER.indexOf(prev);
  if (i < 0) i = 0;
  while (i > 0 && v <= upper(BAND_ORDER[i - 1]!)) i--;
  while (i < BAND_ORDER.length - 1 && v > upper(BAND_ORDER[i]!) + h) i++;
  return BAND_ORDER[i]!;
}

/**
 * 1ステップ進める。目標速度 = speed01 × 全速 に加速度/減速度で近づき、目標方位へ旋回率の上限で最短側に回る（NaN なら針路を保つ）。
 * 速度ベクトルは常に船首方向（横滑りなし）。停止中でも回頭できる（操作性のための簡略。docs/02 §6.1）。dt は既に time_scale を掛けた秒。
 */
export function stepBoat(s: BoatState, input: BoatInput, p: BoatParams, dt: number): void {
  const target = clamp(input.speed01, 0, 1) * p.speedMaxMps;
  if (s.speedMps < target) s.speedMps = Math.min(target, s.speedMps + p.accelMps2 * dt);
  else if (s.speedMps > target) s.speedMps = Math.max(target, s.speedMps - p.decelMps2 * dt);

  if (!Number.isNaN(input.headingDeg)) {
    const diff = wrapDeg180(input.headingDeg - s.headingDeg);
    const maxTurn = p.turnRateDegS * dt;
    s.headingDeg = wrapDeg360(s.headingDeg + clamp(diff, -maxTurn, maxTurn));
  }

  const h = degToRad(s.headingDeg);
  s.x += Math.sin(h) * s.speedMps * dt;
  s.y -= Math.cos(h) * s.speedMps * dt;
}

/** HUD の舵表示用: 目標方位への残り角を fullDeg で正規化した -1(左)〜+1(右)。目標が無ければ 0 */
export function turnCommand(input: BoatInput, s: BoatState, fullDeg: number): number {
  if (Number.isNaN(input.headingDeg)) return 0;
  return clamp(wrapDeg180(input.headingDeg - s.headingDeg) / fullDeg, -1, 1);
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
