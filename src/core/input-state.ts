// 操作入力の共有状態。入力系（スティック・キーボード）が書き、Mission が読む。1個だけ作って Registry に置く（確保しない）。
import { clamp } from './units';

export interface InputState {
  /** -1(左)〜+1(右) */
  rudder: number;
  /** +1=全速、0=巡航、THROTTLE_SILENT（boat-motion.ts）=静音、-1=停止 */
  throttle: number;
  /** スティックに触れている間 true。キーボード入力はこの間は無視する */
  stickActive: boolean;
}

export function createInputState(): InputState {
  return { rudder: 0, throttle: 0, stickActive: false };
}

export function resetInput(s: InputState): void {
  s.rudder = 0;
  s.throttle = 0;
  s.stickActive = false;
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
