// 世界と模擬の突き合わせの口（v0.6.11 S4。jp_03。spec-v0611-r2 §12.1「world-vs-sim」）: scripts/headless/world-vs-sim（EVAC=1）が core/evac-sim の runEvacTrial に渡す。
// 模擬の台本（core/evac-sim-policy の seq・seq_shoot・stay ほか）がフレームごとに書いた入力（針路・速さ・［切替］・消火の長押し・機銃）を frame でヘッドレスの世界の 1 フレームへ写し、
// 固定ステップの終わりに after で両方の状態を比べる（同じページ・同じ JS エンジンで歩調を合わせる＝core/landing-replay の作法。入力は模擬から世界へ）。
// 渡さなければ模擬は 1 ビットも変わらない（tests/evac-sim-a の決定性・表の md5）。型だけ（ゲームは import しない＝dist に入らない）。
import type { AirStrikeState } from './air-strike';
import type { FuelState } from './fuel';
import type { EvacPlan } from './evac-plan';
import type { EvacRepass } from './evac-repass';
import type { EvacSeat } from './evac-seat';
import type { EvacSimAa } from './evac-sim-aa';
import type { EvacFrameOut } from './evac-sim-rows';
import type { EvacSquadron } from './evac-squadron';
import type { SeededRng } from './rng';

/** 模擬のステップの終わりの値（世界の同じ名の物: stepTimeS・atHome・dawn.reached・boat.sinking・dawn.caughtOutside・extinguishHeldS） */
export interface EvacMirrorFlags {
  t: number;
  atHome: boolean;
  latched: boolean;
  sinking: boolean;
  caughtOutside: boolean;
  extHeldS: number;
}

/** 模擬の 1 回の状態（runEvacTrial が最初に 1 回渡す。どれも世界の同じ物に当たる） */
export interface EvacMirrorView {
  readonly sq: EvacSquadron;
  readonly seat: EvacSeat;
  readonly plan: EvacPlan;
  readonly repass: EvacRepass;
  /** 240 秒の後の §2 の 4 機（世界は WorldDawn の strike） */
  readonly dawn: AirStrikeState;
  readonly aa: EvacSimAa | null;
  readonly fuel: FuelState;
  readonly aiRng: SeededRng;
  readonly dodge: SeededRng;
  readonly dawnRng: SeededRng;
  readonly flags: EvacMirrorFlags;
}

export interface EvacMirror {
  /** 1 回の始めに 1 回（状態の参照） */
  begin(v: EvacMirrorView): void;
  /** フレーム k（0 から）の入力（台本の出力。模擬の固定ステップの前に世界の 1 フレームを進める） */
  frame(k: number, fo: EvacFrameOut): void;
  /** フレーム k の固定ステップの終わり（flags を書いた後） */
  after(k: number): void;
}
