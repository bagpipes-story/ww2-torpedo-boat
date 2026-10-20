// 世界 → Scene の通知と、漂流の入力（v0.3.3 で mission-world から切り出し。中身は v0.3.2 のまま）。
import type { BoatInput } from '../core/boat-motion';
import type { MissionEndReason } from '../core/mission-flow';

/** 燃料切れの漂流: 舵は効かず、目標速度 0 で惰性のまま止まる（params.speedMaxMps は機関損傷が書くので触らない） */
export const DRIFT_INPUT: BoatInput = { headingDeg: NaN, speed01: 0 };

/** 世界で起きたことの通知。演出（爆発・揺れ・スロー）と終了は Scene が決める */
export interface WorldEvents {
  /** 魚雷が命中（不発含む）。不発でなければ hits は増えている */
  onTorpedoHit(x: number, y: number, dud: boolean): void;
  /** 隊の最後の沈没演出が終わった（任務は続く。走っている魚雷の外れの確定は終わり際の当たりの窓の後＝destroyer-step。v0.6.2 実機 1 回目） */
  onDestroyerSunk(): void;
  /** 大発を撃破した（v0.4.2。爆発と揺れ。命中スローは世界が掛けた） */
  onTargetDestroyed(x: number, y: number): void;
  /** 砲弾（または味方機の掃射）が命中。small は演出を弱くする目安、destroyed なら続けて onBoatSinking が来る */
  onShellHit(x: number, y: number, small: boolean, destroyed: boolean): void;
  /** 自艇が沈み始めた（体当たり・砲撃・掃射）。位置は爆発の演出用 */
  onBoatSinking(x: number, y: number): void;
  /** 自艇の沈没演出が終わった */
  onBoatSunk(reason: MissionEndReason): void;
  /** 浅瀬に座礁した（速力 0 で動けない。adriftDelayS 後に終了） */
  onGrounded(x: number, y: number): void;
  /** 暴風の波に叩きつけられた（演出だけ。HP は世界が減らしている。v0.3.4） */
  onSlam(x: number, y: number): void;
}
