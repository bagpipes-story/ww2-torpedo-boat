// 岸の陰の海（v0.8.1 IP1。us_06。実機 1 回目のユーザー「暗い岸という視覚的表現がマップになく、いつもの普通の岸なのに見つかる距離だけ謎に短くなってる」）: 止まった艦ごとに、
// 背に岸のビット（systems/shore-backdrop＝core/strait-geometry の landBehind）が立つ自艇の位置の集合を、任務の開始に 1 回だけ格子で求める（絵の材料。世界は読まない）。
// 判定は landBehind そのもの（格子の升の中心で呼ぶ）＝絵の境は本当の判定と升の半分の内で合う（tests/backdrop-zone）。行は艦の y から陸の側の岸の線まで（南の線なら艦より南だけ）、
// 列は海域の幅の全部。陸の区間の外（海域の端の向こう）へ当たる向きは入らない（判定のまま）。Phaser 非依存・乱数なし。確保は作る時だけ（判定 zoneContains は確保しない）。
import { landBehind, type LandLine } from './strait-geometry';

/** 1 隻の岸の陰（升の左上が (x0, y0)・升の 1 辺 stepM m・cells[r * cols + c] が 1 なら升の中心で背に岸が効く） */
export interface BackdropZone {
  readonly x0: number;
  readonly y0: number;
  readonly cols: number;
  readonly rows: number;
  readonly stepM: number;
  readonly cells: Uint8Array;
  /** 1 の升の数（0 なら絵を作らない） */
  readonly count: number;
}

/** 艦 (sx, sy) の岸の陰（起動時に 1 回）。lines・behindM2 は shore-backdrop と同じ物（隊の backdrop の lines と p.behindM2）。海域の幅 width・高さ height */
export function backdropZone(lines: readonly LandLine[], sx: number, sy: number, behindM2: number, width: number, height: number, stepM: number): BackdropZone {
  // 行の範囲: 陸の区間のある岸の線ごとに、艦からその線まで（艦より陸の側だけが当たりうる＝landBehind の t > 0）。海域の外は見ない
  let ya = Infinity;
  let yb = -Infinity;
  for (const l of lines) {
    if (l.spans.length === 0) continue;
    const lo = Math.max(0, Math.min(sy, l.y));
    const hi = Math.min(height, Math.max(sy, l.y));
    if (lo < ya) ya = lo;
    if (hi > yb) yb = hi;
  }
  const rows = yb > ya ? Math.ceil((yb - ya) / stepM) : 0;
  const cols = rows > 0 ? Math.ceil(width / stepM) : 0;
  const cells = new Uint8Array(rows * cols);
  let count = 0;
  for (let r = 0; r < rows; r++) {
    const y = ya + (r + 0.5) * stepM;
    for (let c = 0; c < cols; c++) {
      if (landBehind(lines, sx, sy, (c + 0.5) * stepM, y, behindM2)) {
        cells[r * cols + c] = 1;
        count++;
      }
    }
  }
  return { x0: 0, y0: rows > 0 ? ya : 0, cols, rows, stepM, cells, count };
}

/** 点 (x, y) を含む升が岸の陰か（升の外は偽。確保しない） */
export function zoneContains(z: BackdropZone, x: number, y: number): boolean {
  const c = Math.floor((x - z.x0) / z.stepM);
  const r = Math.floor((y - z.y0) / z.stepM);
  return c >= 0 && r >= 0 && c < z.cols && r < z.rows && z.cells[r * z.cols + c] === 1;
}
