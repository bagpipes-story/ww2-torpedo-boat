// 操作入力の共有状態。入力系（スティック・キーボード）が書き、Mission が読む。1個だけ作って Registry に置く（確保しない）。
import { clamp } from './units';

export interface InputState {
  /** 目標方位（0=北=画面上、時計回り）。NaN なら針路を保つ（スティック中立） */
  headingDeg: number;
  /** 目標速度（全速に対する比率 0〜1）。中立=0=停止、倒すほど速い */
  speed01: number;
  /** スティックに触れている間 true。キーボード入力はこの間は無視する */
  stickActive: boolean;
  /** 魚雷ボタンのタップ（1 本）。Mission が消費して false に戻す */
  fireTap: boolean;
  /** 長押し→離す の一斉発射。開き角（度）。NaN なら要求なし。Mission が消費して NaN に戻す */
  fireSalvoSpreadDeg: number;
}

export function createInputState(): InputState {
  return { headingDeg: NaN, speed01: 0, stickActive: false, fireTap: false, fireSalvoSpreadDeg: NaN };
}

export function resetInput(s: InputState): void {
  s.headingDeg = NaN;
  s.speed01 = 0;
  s.stickActive = false;
  s.fireTap = false;
  s.fireSalvoSpreadDeg = NaN;
}

/**
 * デッドゾーンを適用し、境界で連続になるよう再スケールする。
 * |v| <= dz → 0、|v| = 1 → ±1。
 */
export function applyDeadZone(v: number, dz: number): number {
  const a = Math.abs(v);
  if (a <= dz) return 0;
  const scaled = clamp((a - dz) / (1 - dz), 0, 1);
  return v < 0 ? -scaled : scaled;
}
