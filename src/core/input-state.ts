// 操作入力の共有状態。入力系（スティック・キーボード）が書き、Mission が読む。1個だけ作って Registry に置く（確保しない）。
import { clamp } from './units';

export interface InputState {
  /** -1(左)〜+1(右) */
  rudder: number;
  /** +1=全速、0=巡航、0 未満=静音、THROTTLE_STOP（boat-motion.ts）以下=停止 */
  throttle: number;
  /** スティックに触れている間 true。キーボード入力はこの間は無視する */
  stickActive: boolean;
  /** 魚雷ボタンのタップ（1 本）。Mission が消費して false に戻す */
  fireTap: boolean;
  /** 長押し→離す の一斉発射。開き角（度）。NaN なら要求なし。Mission が消費して NaN に戻す */
  fireSalvoSpreadDeg: number;
}

export function createInputState(): InputState {
  return { rudder: 0, throttle: 0, stickActive: false, fireTap: false, fireSalvoSpreadDeg: NaN };
}

export function resetInput(s: InputState): void {
  s.rudder = 0;
  s.throttle = 0;
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
