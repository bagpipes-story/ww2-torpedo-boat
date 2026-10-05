// 視界と発見（docs/02 §6.5）。Phaser 非依存。
// 敵の発見距離 = base × 速力係数 × 月明係数 × 煙幕係数 × 史実モード倍率。プレイヤーの視程 = vis_player_base × 月明係数。
import type { BoatParams } from './boat-motion';
import { clamp } from './units';

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

/** 速力係数: 速度 0〜静音〜巡航〜全速 の各点の値を線形補間する（docs/02 §6.5「全速は航跡で遠くから見つかる」） */
export function speedFactorFor(speedMps: number, p: BoatParams, t: SpeedFactorTable): number {
  const v = clamp(speedMps, 0, p.speedMaxMps);
  if (v <= p.speedSilentMps) return lerp(t.stop, t.silent, p.speedSilentMps > 0 ? v / p.speedSilentMps : 1);
  if (v <= p.speedCruiseMps) return lerp(t.silent, t.cruise, (v - p.speedSilentMps) / (p.speedCruiseMps - p.speedSilentMps));
  return lerp(t.cruise, t.full, (v - p.speedCruiseMps) / (p.speedMaxMps - p.speedCruiseMps));
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * clamp(k, 0, 1);
}

/** 敵がプレイヤーを発見する距離（m） */
export function enemyDetectRangeM(baseDetectM: number, speedFactor: number, vis: VisibilityParams, smokeActive: boolean): number {
  return baseDetectM * speedFactor * vis.moonFactor * (smokeActive ? vis.smokeFactor : 1) * vis.detectionMultiplier;
}

/** プレイヤーが敵を視認できる距離（m） */
export function playerVisRangeM(vis: VisibilityParams): number {
  return vis.visPlayerBaseM * vis.moonFactor;
}
