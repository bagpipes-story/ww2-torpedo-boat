// 兵装の HUD 向けテレメトリ（v0.6.8。spec-v068 §3.4）: mission-telemetry の refreshTelemetry が夜明けの後に毎フレーム呼ぶ（確保しない）。
// S2 は魚雷の部分（積んでいる本数・撃てるか・狙う艦の無い魚雷の出来事の文）。機銃の状態の文・撃っている・弾倉交換・aaFiring は S3。
import type { BoatTelemetry } from '../core/boat-motion';
import type { ArmsStep } from './arms-step';

/** 読む世界の部分（MissionWorld がそのまま満たす） */
export interface ArmsTelemetryWorld {
  readonly arms: ArmsStep | null;
  readonly torpedoes: { readonly remaining: number };
  readonly atHome: boolean;
  readonly boat: { readonly sinking: boolean };
}

/** t.arms を書く。魚雷は積んでいる > 0・輪の外・沈み始めていない・終わりの待ちでない間だけ撃てる（狙う艦の有無は問わない） */
export function refreshArmsTelemetry(t: BoatTelemetry, w: ArmsTelemetryWorld): void {
  const a = t.arms;
  const arms = w.arms;
  a.torpedoesAboard = w.torpedoes.remaining;
  a.torpedoUsable = a.torpedoesAboard > 0 && !w.atHome && !w.boat.sinking && !(arms !== null && arms.endHold);
  if (!arms) return;
  a.evCode = arms.evCode;
  a.evN = arms.evN;
  a.evSeq = arms.evSeq;
}
