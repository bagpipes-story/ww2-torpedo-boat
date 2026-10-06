// 視界と発見（docs/02 §6.5）。Phaser 非依存。
// 敵の発見距離 = base × 速力係数 × 月明係数 × 煙幕係数 × 史実モード倍率。プレイヤーの視程 = vis_player_base × 月明係数。
import { speedBandFor, type BoatParams } from './boat-motion';

export interface SpeedFactorTable {
  stop: number;
  silent: number;
  cruise: number;
  full: number;
}

export interface MoonFactorTable {
  dark: number;
  half: number;
  full: number;
}

export type MoonPhase = keyof MoonFactorTable;

export interface VisibilityParams {
  visPlayerBaseM: number;
  moonFactor: number;
  speedFactor: SpeedFactorTable;
  smokeFactor: number;
  detectHoldS: number;
  /** 史実モードなどの倍率（通常 1） */
  detectionMultiplier: number;
}

export function isMoonPhase(v: unknown): v is MoonPhase {
  return v === 'dark' || v === 'half' || v === 'full';
}

/**
 * 速力係数: 速力帯（停止/静音/巡航/全速。帯の境界は data の speed_bands_kt。HUD の表示と同じ）の値をそのまま使う（docs/02 §6.5「全速は航跡で遠くから見つかる」）。
 * v0.2.0 当初は段の間を線形補間していたが、実機で「少し落としただけでは効かない・HUD の段と結果が合わない」と分かりにくかったので帯の値にした。
 */
export function speedFactorFor(speedMps: number, p: BoatParams, t: SpeedFactorTable): number {
  return t[speedBandFor(speedMps, p)];
}

/** 敵がプレイヤーを発見する距離（m） */
export function enemyDetectRangeM(baseDetectM: number, speedFactor: number, vis: VisibilityParams, smokeActive: boolean): number {
  return baseDetectM * speedFactor * vis.moonFactor * (smokeActive ? vis.smokeFactor : 1) * vis.detectionMultiplier;
}

/** プレイヤーが敵を視認できる距離（m） */
export function playerVisRangeM(vis: VisibilityParams): number {
  return vis.visPlayerBaseM * vis.moonFactor;
}
