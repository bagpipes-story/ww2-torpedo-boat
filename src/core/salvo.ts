// 扇状一斉発射（docs/02 §5: 長押し→離す。長押し時間で開き角 2°〜12°）。Phaser 非依存。
import { clamp } from './units';

export interface SpreadConfig {
  spreadMinDeg: number;
  spreadMaxDeg: number;
  holdSecondsForMax: number;
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
