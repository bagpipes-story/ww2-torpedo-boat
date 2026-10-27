// 兵装の HUD 向けテレメトリ（v0.6.8。spec-v068 §3.4）: mission-telemetry の refreshTelemetry が夜明けの後に毎フレーム呼ぶ（確保しない）。
// 魚雷（積んでいる本数・撃てるか）・出来事の文（狙う艦の無い魚雷・撃墜）・機銃の状態の文（押している間）・どれかの砲が撃っている・新しい道の弾倉交換・機を撃っている（aaFiring。
// 2 行目の主兵装の砲の行を隠す＝ui/mission-mode）。値は systems/arms-step が固定ステップで決めたものを写すだけ。
import { CUE_NONE } from '../core/arms-cue';
import type { BoatTelemetry } from '../core/boat-motion';
import type { ArmsStep } from './arms-step';

/** 読む世界の部分（MissionWorld がそのまま満たす） */
export interface ArmsTelemetryWorld {
  readonly arms: ArmsStep | null;
  readonly torpedoes: { readonly remaining: number };
  readonly atHome: boolean;
  readonly boat: { readonly sinking: boolean };
}

/** t.arms と t.aaFiring を書く。魚雷は積んでいる > 0・輪の外・沈み始めていない・終わりの待ちでない間だけ撃てる（狙う艦の有無は問わない） */
export function refreshArmsTelemetry(t: BoatTelemetry, w: ArmsTelemetryWorld): void {
  const a = t.arms;
  const arms = w.arms;
  a.torpedoesAboard = w.torpedoes.remaining;
  a.torpedoUsable = a.torpedoesAboard > 0 && !w.atHome && !w.boat.sinking && !(arms !== null && arms.endHold);
  if (!arms) {
    t.aaFiring = false;
    a.stCode = CUE_NONE;
    a.stN = 0;
    a.gunFiring = false;
    a.reloadN = 0;
    return;
  }
  a.evCode = arms.evCode;
  a.evN = arms.evN;
  a.evSeq = arms.evSeq;
  a.stCode = arms.stCode;
  a.stN = arms.stN;
  a.gunFiring = arms.firing;
  a.reloadN = arms.reloadN;
  t.aaFiring = arms.aaFiring;
}
