// 今夜の揺らぎ（core/night）を世界の数値に当てる（v0.4.6 で world-setup から切り出し）。Phaser 非依存。出撃の組み立てで 1 回だけ。
// 順序: ずれを足す → 左右反転（実機 1 回目「敵の来る位置の違いが分からない」→ ±数百 m のずれに加えて、来る方角そのものを東西で入れ替える）。
// 反転するのは敵の側（駆逐艦の出発点と針路・大発の隊・沿岸砲）だけ。地形（浅瀬・岸）・帰投地点・出発点はそのまま。
import type { BargeParams } from '../core/barge-data';
import type { NightRoll } from '../core/night';
import type { ShoreBatteryParams } from '../core/shore-battery';
import { clamp, wrapDeg360 } from '../core/units';

export interface NightApplied {
  starts: { x: number; y: number; headingDeg: number }[];
  barges: BargeParams | null;
  batteries: ShoreBatteryParams[];
}

/** starts は駆逐艦の出発点（無ければ []）、margin は駆逐艦を海域の縁から離す余白 m */
export function applyNight(
  night: NightRoll,
  bounds: { width: number; height: number },
  starts: readonly { x: number; y: number; headingDeg: number }[],
  margin: number,
  barges: BargeParams | null,
  batteries: readonly ShoreBatteryParams[],
): NightApplied {
  const w = bounds.width;
  const mx = (x: number): number => (night.mirrored ? w - x : x);
  const mh = (h: number): number => (night.mirrored ? wrapDeg360(360 - h) : wrapDeg360(h));
  const outStarts = starts.map((s, i) => {
    const d = night.enemyOffsets[i]!;
    return { x: clamp(mx(s.x + d.dx), margin, w - margin), y: clamp(s.y + d.dy, margin, bounds.height - margin), headingDeg: mh(s.headingDeg + d.dh) };
  });
  let outBarges = barges;
  if (barges && (night.bargeLeadDx !== 0 || night.mirrored)) {
    const headingDeg = mh(barges.headingDeg);
    let leadX = mx(barges.leadX + night.bargeLeadDx);
    // 東へ進む隊（反転した夜）は最後尾が西の縁より内から出るように（西の縁で止める処理に最後尾が貼りつかない）
    const sin = Math.sin((headingDeg * Math.PI) / 180);
    const maxOff = barges.offsetsM.length > 0 ? barges.offsetsM[barges.offsetsM.length - 1]! : 0;
    if (sin > 0) leadX = Math.max(leadX, barges.boundsMarginM + maxOff * sin);
    outBarges = { ...barges, leadX, headingDeg };
  }
  const outBatteries = batteries.map((p, i) => (night.batteryDx[i] || night.mirrored ? { ...p, x: clamp(mx(p.x + night.batteryDx[i]!), 0, w) } : p));
  return { starts: outStarts, barges: outBarges, batteries: outBatteries };
}
