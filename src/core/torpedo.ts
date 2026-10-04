// 魚雷の運動と信頼性（docs/02 §6.2）。Phaser 非依存。状態は事前確保したオブジェクトを書き換える（§7）。
import { degToRad, ktToMps, wrapDeg360 } from './units';

export interface TorpedoParams {
  speedMps: number;
  rangeM: number;
  /** 発射からこの距離までは命中しない */
  armingM: number;
  /** 蛇行魚雷の振れ幅（度） */
  jitterDeg: number;
  /** 蛇行の周期（実時間秒。dt は time_scale 込みなので、呼び出し側は実時間で位相を進める） */
  erraticPeriodS: number;
}

export interface TorpedoReliability {
  dud: number;
  erratic: number;
}

export interface TorpedoState {
  active: boolean;
  x: number;
  y: number;
  /** 現在の進路（蛇行込み） */
  headingDeg: number;
  /** 発射時の進路 */
  baseHeadingDeg: number;
  /** 走行距離 m */
  runM: number;
  /** 発射からの実時間秒（蛇行の位相用） */
  ageS: number;
  dud: boolean;
  erratic: boolean;
  /** 蛇行魚雷の一定偏差（度）。発射時に ±jitterDeg の範囲で決まる。非蛇行は 0 */
  erraticBiasDeg: number;
  /** 発射時の目標までの距離 m（KPI 記録用） */
  rangeAtLaunchM: number;
  /** 次に雷跡の点を置く走行距離 m */
  nextWakeAtM: number;
  /** 結果（命中/外れ）が確定済み。確定後も表示のために走り続けることがある */
  resolved: boolean;
  /** 前ステップでの目標中心までの距離二乗（遠ざかり判定用）。負なら未計測 */
  lastTargetDist2: number;
}

export function createTorpedoState(): TorpedoState {
  return {
    active: false,
    x: 0,
    y: 0,
    headingDeg: 0,
    baseHeadingDeg: 0,
    runM: 0,
    ageS: 0,
    dud: false,
    erratic: false,
    erraticBiasDeg: 0,
    rangeAtLaunchM: 0,
    nextWakeAtM: 0,
    resolved: false,
    lastTargetDist2: -1,
  };
}

/** data/torpedoes.json の 1 レコードのうち使う部分 */
export interface TorpedoDataRecord {
  length_m: number;
  settings: Array<{ speed_kt: number; range_m: number }>;
  default_setting: number;
  reliability: { dud: number; erratic: number; jitter_deg: number };
}

export function isTorpedoDataRecord(v: unknown): v is TorpedoDataRecord {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  const settings = r['settings'];
  const rel = r['reliability'] as Record<string, unknown> | undefined;
  return (
    Array.isArray(settings) &&
    settings.length > 0 &&
    settings.every((s) => typeof s === 'object' && s !== null && Number.isFinite((s as Record<string, unknown>)['speed_kt']) && Number.isFinite((s as Record<string, unknown>)['range_m'])) &&
    Number.isFinite(r['default_setting']) &&
    Number.isFinite(r['length_m']) &&
    typeof rel === 'object' && rel !== null &&
    Number.isFinite(rel['dud']) && Number.isFinite(rel['erratic']) && Number.isFinite(rel['jitter_deg'])
  );
}

export function torpedoParamsFromData(r: TorpedoDataRecord, armingM: number, erraticPeriodS: number): TorpedoParams {
  const setting = r.settings[r.default_setting] ?? r.settings[0];
  if (!setting) throw new Error('魚雷の settings が空');
  return {
    speedMps: ktToMps(setting.speed_kt),
    rangeM: setting.range_m,
    armingM,
    jitterDeg: r.reliability.jitter_deg,
    erraticPeriodS,
  };
}

export function torpedoReliabilityFromData(r: TorpedoDataRecord): TorpedoReliability {
  return { dud: r.reliability.dud, erratic: r.reliability.erratic };
}

/**
 * 発射。信頼性ロール（dud / erratic / 蛇行の一定偏差）は呼び出し側が rng で決めて渡す。
 * erratic の進路 = 発射方位 + erraticBiasDeg（一定）± jitterDeg·sin（周期 erraticPeriodS）。遠距離ほど偏差の影響が大きい。
 */
export function launchTorpedo(
  s: TorpedoState,
  x: number,
  y: number,
  headingDeg: number,
  dud: boolean,
  erratic: boolean,
  erraticBiasDeg: number,
  rangeAtLaunchM: number,
  wakeSpacingM: number,
): void {
  s.active = true;
  s.x = x;
  s.y = y;
  s.baseHeadingDeg = wrapDeg360(headingDeg + (erratic ? erraticBiasDeg : 0));
  s.headingDeg = s.baseHeadingDeg;
  s.runM = 0;
  s.ageS = 0;
  s.dud = dud;
  s.erratic = erratic;
  s.erraticBiasDeg = erratic ? erraticBiasDeg : 0;
  s.rangeAtLaunchM = rangeAtLaunchM;
  s.nextWakeAtM = wakeSpacingM;
  s.resolved = false;
  s.lastTargetDist2 = -1;
}

/**
 * 外れの早期確定: 武装済みで、目標中心から passRadius より外にいて、距離が増え始めたら「通り過ぎた」とみなす。
 * 直進同士なら距離は時間の凸関数なので、最接近を過ぎれば増える一方。戻り値は今回確定したか。
 */
export function markMissIfPassed(s: TorpedoState, p: TorpedoParams, targetX: number, targetY: number, passRadius2: number): boolean {
  if (!s.active || s.resolved || s.runM < p.armingM) return false;
  const dx = s.x - targetX;
  const dy = s.y - targetY;
  const d2 = dx * dx + dy * dy;
  const receding = s.lastTargetDist2 >= 0 && d2 > s.lastTargetDist2;
  s.lastTargetDist2 = d2;
  if (receding && d2 > passRadius2) {
    s.resolved = true;
    return true;
  }
  return false;
}

/**
 * 1 ステップ進める。dt は time_scale 込みの秒、realDt は実時間秒（蛇行の位相用）。
 * 射程に達したら非アクティブにする。戻り値は走行距離が射程に達したか。
 */
export function stepTorpedo(s: TorpedoState, p: TorpedoParams, dt: number, realDt: number): boolean {
  if (!s.active) return false;
  s.ageS += realDt;
  if (s.erratic && p.erraticPeriodS > 0) {
    s.headingDeg = wrapDeg360(s.baseHeadingDeg + p.jitterDeg * Math.sin((2 * Math.PI * s.ageS) / p.erraticPeriodS));
  }
  const h = degToRad(s.headingDeg);
  const d = p.speedMps * dt;
  s.x += Math.sin(h) * d;
  s.y -= Math.cos(h) * d;
  s.runM += d;
  if (s.runM >= p.rangeM) {
    s.active = false;
    return true;
  }
  return false;
}

export function isArmed(s: TorpedoState, p: TorpedoParams): boolean {
  return s.active && s.runM >= p.armingM;
}

/** 雷跡の点を置くべきなら true を返し、次の位置を進める（1 ステップで複数回呼んでよい） */
export function consumeWakeMark(s: TorpedoState, wakeSpacingM: number): boolean {
  if (s.runM < s.nextWakeAtM) return false;
  s.nextWakeAtM += wakeSpacingM;
  return true;
}
