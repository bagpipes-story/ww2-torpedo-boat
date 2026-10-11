// 燃料（docs/02 §6.7、v0.3.0）。Phaser 非依存。
// 消費率 gal/h は史実の 2 点（巡航 fuel_hours_cruise・全速 fuel_hours_full で満タンを使い切る）とアイドル比（design）から曲線にする:
//   burn(v) = idle + (cruise − idle) × (min(v, v_full) / v_cruise)^n、n は 2 点を通るよう起動時に求める（コードに数値を書かない）。
// 任務では満タンではなく「戦闘に使える割当」（missions_seed の fuel_allotment_gal）だけを積む。時間圧縮は time_scale の 1 つだけで、燃料用の倍率は作らない。
import { ktToMps, SECONDS_PER_HOUR } from './units';

export interface BoatFuelDataRecord {
  fuel_capacity_gal: number;
  fuel_hours_cruise: number;
  fuel_hours_full: number;
  /** 停止中（機関アイドル）の消費 ÷ 巡航の消費 */
  fuel_idle_ratio: number;
  speed_cruise_kt: number;
  speed_max_kt: number;
}

export function isBoatFuelDataRecord(v: unknown): v is BoatFuelDataRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return ['fuel_capacity_gal', 'fuel_hours_cruise', 'fuel_hours_full', 'fuel_idle_ratio', 'speed_cruise_kt', 'speed_max_kt'].every(
    (k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number),
  );
}

export interface FuelCurve {
  capacityGal: number;
  idleGph: number;
  cruiseGph: number;
  fullGph: number;
  cruiseMps: number;
  fullMps: number;
  /** 速度比の指数 n */
  exponent: number;
  /** 距離あたりの消費（gal/m）。帰投の見積もりと目盛りに使う */
  galPerMCruise: number;
  galPerMFull: number;
}

/** data の大小関係が崩れていれば例外（起動時に分かるように） */
export function fuelCurveFromData(r: BoatFuelDataRecord): FuelCurve {
  if (!(r.fuel_capacity_gal > 0)) throw new Error('fuel_capacity_gal は正の数');
  if (!(r.fuel_hours_full > 0)) throw new Error('fuel_hours_full は正の数');
  if (!(r.fuel_hours_full < r.fuel_hours_cruise)) throw new Error('fuel_hours_full は fuel_hours_cruise より短い（全速は巡航より燃料を食う）');
  if (!(r.fuel_idle_ratio >= 0 && r.fuel_idle_ratio < 1)) throw new Error('fuel_idle_ratio は 0 以上 1 未満');
  if (!(r.speed_cruise_kt > 0)) throw new Error('speed_cruise_kt は正の数');
  if (!(r.speed_max_kt > r.speed_cruise_kt)) throw new Error('speed_max_kt は speed_cruise_kt より大きい');
  const cruiseGph = r.fuel_capacity_gal / r.fuel_hours_cruise;
  const fullGph = r.fuel_capacity_gal / r.fuel_hours_full;
  const idleGph = r.fuel_idle_ratio * cruiseGph;
  const cruiseMps = ktToMps(r.speed_cruise_kt);
  const fullMps = ktToMps(r.speed_max_kt);
  const exponent = Math.log((fullGph - idleGph) / (cruiseGph - idleGph)) / Math.log(fullMps / cruiseMps);
  if (!Number.isFinite(exponent) || !(exponent > 0)) throw new Error('燃料曲線の指数が求まらない（fuel_hours_* と fuel_idle_ratio を確認）');
  return {
    capacityGal: r.fuel_capacity_gal,
    idleGph,
    cruiseGph,
    fullGph,
    cruiseMps,
    fullMps,
    exponent,
    galPerMCruise: cruiseGph / SECONDS_PER_HOUR / cruiseMps,
    galPerMFull: fullGph / SECONDS_PER_HOUR / fullMps,
  };
}

/** 消費率 gal/h。0 以下はアイドル、全速を超える速度は全速で頭打ち（負数の非整数乗で NaN にしない） */
export function burnGph(c: FuelCurve, speedMps: number): number {
  if (!(speedMps > 0)) return c.idleGph;
  const v = speedMps > c.fullMps ? c.fullMps : speedMps;
  return c.idleGph + (c.cruiseGph - c.idleGph) * Math.pow(v / c.cruiseMps, c.exponent);
}

export interface FuelState {
  gal: number;
  /** 0 になった（以後は漂流） */
  empty: boolean;
}

export function createFuelState(allotmentGal: number): FuelState {
  return { gal: allotmentGal, empty: !(allotmentGal > 0) };
}

/** 1 ステップ分の消費。dt は game 秒（time_scale・スロー込み）。運動と同じ dt なので、距離あたりの消費はステップ幅に依らない */
export function stepFuel(s: FuelState, c: FuelCurve, speedMps: number, dtGameS: number): void {
  if (s.empty || !(dtGameS > 0)) return;
  s.gal -= (burnGph(c, speedMps) * dtGameS) / SECONDS_PER_HOUR;
  if (s.gal <= 0) {
    s.gal = 0;
    s.empty = true;
  }
}

/** 一定速力で distM 進むのに要る燃料 gal（speedMps ≤ 0 なら Infinity: 進めない） */
export function fuelForDistanceGal(c: FuelCurve, distM: number, speedMps: number): number {
  if (!(speedMps > 0)) return distM > 0 ? Infinity : 0;
  return (burnGph(c, speedMps) / SECONDS_PER_HOUR) * (distM / speedMps);
}

/**
 * 距離あたりの消費が最少になる速度（解析解）。burn(v)/v = idle/v + a·v^(n−1)（a = (cruise−idle)/v_cruise^n）の極小:
 * v^n = idle · v_cruise^n / ((cruise−idle)(n−1))。テストと docs の説明用
 */
export function economySpeedMps(c: FuelCurve): number {
  if (!(c.exponent > 1) || !(c.idleGph > 0)) return 0;
  const vn = (c.idleGph * Math.pow(c.cruiseMps, c.exponent)) / ((c.cruiseGph - c.idleGph) * (c.exponent - 1));
  return Math.pow(vn, 1 / c.exponent);
}
