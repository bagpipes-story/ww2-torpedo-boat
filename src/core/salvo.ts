// 扇状一斉発射（docs/02 §5: 長押し→離す。長押し時間で開き角 2°〜12°、v0.4.8 から本数も 2 → 3 → 4 と増える）。Phaser 非依存。
import { clamp } from './units';

export interface SpreadConfig {
  spreadMinDeg: number;
  spreadMaxDeg: number;
  holdSecondsForMax: number;
  /** 本数の刻み（秒）: 長押しに入った時点で 2 本、以後この秒ごとに 1 本増える（残弾まで）。0 以下なら従来どおり残弾すべて */
  countStepS: number;
}

/** 長押し時間（タップの閾値を除いた秒）から一斉の本数。残弾 remaining が上限（1 本なら 1）。countStepS が 0 以下なら残弾すべて */
export function salvoCountForHold(holdS: number, cfg: SpreadConfig, remaining: number): number {
  if (remaining <= 1) return Math.max(0, remaining);
  if (cfg.countStepS <= 0) return remaining;
  const n = 2 + Math.floor(Math.max(0, holdS) / cfg.countStepS);
  return n < remaining ? n : remaining;
}

/** 長押し時間（秒）から開き角（度）。0 秒で最小、holdSecondsForMax 以上で最大 */
export function spreadAngleForHold(holdS: number, cfg: SpreadConfig): number {
  if (cfg.holdSecondsForMax <= 0) return cfg.spreadMaxDeg;
  const k = clamp(holdS / cfg.holdSecondsForMax, 0, 1);
  return cfg.spreadMinDeg + (cfg.spreadMaxDeg - cfg.spreadMinDeg) * k;
}

/**
 * count 本を開き角 spreadDeg の扇に等間隔で並べた方位を out に書く（確保しない）。
 * count=1 なら base のみ。count>=2 なら両端が base±spread/2。
 */
export function fillSalvoHeadings(baseHeadingDeg: number, count: number, spreadDeg: number, out: number[]): number {
  if (count <= 0) return 0;
  if (count === 1) {
    out[0] = baseHeadingDeg;
    return 1;
  }
  for (let i = 0; i < count; i++) {
    out[i] = baseHeadingDeg - spreadDeg / 2 + (spreadDeg * i) / (count - 1);
  }
  return count;
}
